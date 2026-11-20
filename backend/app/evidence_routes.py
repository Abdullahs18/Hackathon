import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import UploadFile

from app.audit import record_event
from app.case_policy import (
    EDITABLE,
    helper_scopes,
    locked_case,
    officer_scopes,
    require_version,
    timestamp,
)
from app.case_routes import CreateKey, IfMatch
from app.evidence_limits import MAX_CASE_FILES
from app.models import Evidence
from app.security import CurrentUser, SessionDep

router = APIRouter(prefix="/api/v1")


async def upload_file(request: Request):
    async with request.form(max_files=1, max_fields=0) as form:
        items = list(form.multi_items())
        if len(items) != 1 or items[0][0] != "file" or not isinstance(items[0][1], UploadFile):
            raise HTTPException(400, "Provide exactly one file field.")
        yield items[0][1]


def authorize(session, user, case, *, write=False):
    if user.role == "Citizen" and case.citizen_id == user.user_id:
        return
    scopes = set()
    if user.role == "Helper":
        scopes = helper_scopes(session, user, case)
    elif user.role == "Officer" and not write:
        scopes = officer_scopes(session, user, case)
    if "evidence" not in scopes:
        raise HTTPException(403, "Current case access and evidence consent are required.")


def metadata(record):
    return {
        key: getattr(record, key)
        for key in (
            "evidence_id",
            "complaint_id",
            "uploader_id",
            "file_name",
            "file_type",
            "file_size",
            "sha256",
            "verification_status",
        )
    } | {"timestamp": timestamp(record.timestamp)}


def find_evidence(session, complaint_id, evidence_id):
    record = session.get(Evidence, evidence_id)
    if record is None or record.complaint_id != complaint_id:
        raise HTTPException(404, "Evidence does not exist in this complaint.")
    return record


@router.post(
    "/complaints/{id}/evidence", operation_id="uploadEvidence", tags=["Evidence"], status_code=201
)
def upload(
    id: str,
    request: Request,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    file: Annotated[UploadFile, Depends(upload_file)],
    idempotency_key: CreateKey = None,
    if_match: IfMatch = None,
):
    case = locked_case(session, id)
    authorize(session, user, case, write=True)
    data = file.file.read(request.app.state.settings.evidence_max_bytes + 1)
    if len(data) > request.app.state.settings.evidence_max_bytes:
        raise HTTPException(413, "Evidence exceeds the upload limit.")
    name, kind = request.app.state.evidence_validator.validate(
        data, file.filename, file.content_type
    )
    digest = hashlib.sha256(data).hexdigest()
    fingerprint = hashlib.sha256(json.dumps([name, kind, digest]).encode()).hexdigest()
    store = request.app.state.evidence_store
    previous = (
        session.scalar(
            select(Evidence).where(
                Evidence.complaint_id == id,
                Evidence.uploader_id == user.user_id,
                Evidence.idempotency_key == idempotency_key,
            )
        )
        if idempotency_key is not None
        else None
    )
    response.headers["X-Complaint-Version"] = str(case.version)
    if previous is not None:
        if previous.request_fingerprint != fingerprint:
            raise HTTPException(409, "Idempotency key was used for different evidence.")
        store.read(previous.storage_key, previous.file_size, previous.sha256)
        response.status_code = 200
        return metadata(previous)
    require_version(case, if_match)
    if case.current_status not in EDITABLE:
        raise HTTPException(409, "Evidence cannot be added in the current case state.")
    count = session.scalar(
        select(func.count()).select_from(Evidence).where(Evidence.complaint_id == id)
    )
    if count >= MAX_CASE_FILES:
        raise HTTPException(409, "This complaint has reached its evidence file limit.")
    key = f"{uuid4().hex}.blob"
    store.write(key, data)
    record = Evidence(
        evidence_id=str(uuid4()),
        complaint_id=id,
        uploader_id=user.user_id,
        timestamp=datetime.now(UTC),
        file_name=name,
        file_type=kind,
        file_size=len(data),
        sha256=digest,
        verification_status="not_authenticity_verified",
        storage_key=key,
        idempotency_key=idempotency_key,
        request_fingerprint=fingerprint,
    )
    try:
        session.add(record)
        case.incident_data = {
            **case.incident_data,
            "evidence_ids": [*(case.incident_data.get("evidence_ids") or []), record.evidence_id],
        }
        case.version += 1
        case.updated_at = datetime.now(UTC)
        case.complaint_draft = None
        case.current_status = "DRAFT"
        record_event(
            session,
            "evidence.uploaded",
            user.user_id,
            "Stored original evidence",
            complaint_id=id,
            details={"evidence_id": record.evidence_id},
        )
        session.flush()
        result = metadata(record)
        response.headers["X-Complaint-Version"] = str(case.version)
    except SQLAlchemyError:
        session.rollback()
        store.remove(key)
        raise HTTPException(503, "Evidence could not be saved.") from None
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        # A lost commit acknowledgement can mean metadata committed. Keep original bytes.
        raise HTTPException(
            503, "Save outcome is uncertain. Retry with the same idempotency key."
        ) from None
    return result


@router.get("/complaints/{id}/evidence", operation_id="listEvidence", tags=["Evidence"])
def list_evidence(id: str, user: CurrentUser, session: SessionDep):
    authorize(session, user, locked_case(session, id))
    result = [
        metadata(record)
        for record in session.scalars(
            select(Evidence)
            .where(Evidence.complaint_id == id)
            .order_by(Evidence.timestamp, Evidence.evidence_id)
        )
    ]
    record_event(
        session, "evidence.listed", user.user_id, "Read evidence metadata", complaint_id=id
    )
    session.commit()
    return result


@router.get(
    "/complaints/{id}/evidence/{evidence_id}", operation_id="getEvidence", tags=["Evidence"]
)
def get_evidence(id: str, evidence_id: str, user: CurrentUser, session: SessionDep):
    authorize(session, user, locked_case(session, id))
    result = metadata(find_evidence(session, id, evidence_id))
    record_event(
        session,
        "evidence.metadata_read",
        user.user_id,
        "Read evidence metadata",
        complaint_id=id,
        details={"evidence_id": evidence_id},
    )
    session.commit()
    return result


@router.get(
    "/complaints/{id}/evidence/{evidence_id}/content",
    operation_id="downloadEvidence",
    tags=["Evidence"],
)
def download(id: str, evidence_id: str, request: Request, user: CurrentUser, session: SessionDep):
    authorize(session, user, locked_case(session, id))
    record = find_evidence(session, id, evidence_id)
    data = request.app.state.evidence_store.read(
        record.storage_key, record.file_size, record.sha256
    )
    extension = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "application/pdf": "pdf",
    }[record.file_type]
    result = Response(
        data,
        media_type=record.file_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="evidence-{record.evidence_id}.{extension}"'
            ),
            "X-Evidence-SHA256": record.sha256,
            "X-Evidence-Verification": record.verification_status,
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )
    record_event(
        session,
        "evidence.downloaded",
        user.user_id,
        "Downloaded original evidence",
        complaint_id=id,
        details={"evidence_id": evidence_id},
    )
    session.commit()
    return result
