import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.audit import record_event
from app.case_policy import (
    OFFICER_VISIBLE,
    apply_incident_patch,
    can_read_field,
    case_view,
    consent_scopes,
    helper_scopes,
    locked_case,
    officer_scopes,
    own_case,
    require_role,
    require_version,
    timestamp,
)
from app.models import AccessGrant, CaseAssignment, Complaint, Consent, User, Workspace
from app.notifications import notify_case
from app.security import AdminUser, CurrentUser, SessionDep
from app.validation import validate_payload

router = APIRouter(prefix="/api/v1")
IfMatch = Annotated[str | None, Header(alias="If-Match")]
CreateKey = Annotated[str | None, Header(alias="Idempotency-Key", min_length=1, max_length=128)]


def commit(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Request conflicts with current records.") from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Save outcome is uncertain. Recover current records before retrying."
        ) from None


def consent_view(record: Consent) -> dict:
    return {
        "consent_id": record.consent_id,
        "complaint_id": record.complaint_id,
        "citizen_id": record.citizen_id,
        "recipient": record.recipient,
        "purpose": record.purpose,
        "data_scopes": record.data_scopes,
        "status": record.status,
        "granted_at": timestamp(record.granted_at),
        "changed_at": timestamp(record.changed_at) if record.changed_at else None,
        "withdrawn_at": timestamp(record.withdrawn_at) if record.withdrawn_at else None,
    }


def grant_view(grant: AccessGrant) -> dict:
    return {
        "complaint_id": grant.complaint_id,
        "helper_id": grant.helper_id,
        "active": grant.active,
    }


def validate_recipient(session: Session, recipient: str, purpose: str) -> None:
    services = {
        "service:mock-identity": "mock_identity_check",
        "service:mock-payment": "mock_payment_lookup",
        "service:mock-data": "mock_requirements_lookup",
    }
    if recipient in services and services[recipient] == purpose:
        return
    if recipient.startswith("user:") and purpose == "helper_assistance":
        helper = session.get(User, recipient.removeprefix("user:"))
        if helper and helper.active and helper.role == "Helper":
            return
    if recipient.startswith("workspace:") and purpose == "complaint_submission":
        if session.get(Workspace, recipient.removeprefix("workspace:")):
            return
    raise HTTPException(400, "Recipient and purpose must identify a helper or simulated workspace.")


@router.post(
    "/complaints", operation_id="createComplaint", tags=["Citizen complaints"], status_code=201
)
def create_complaint(
    body: dict,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: CreateKey = None,
):
    require_role(user, "Citizen")
    validate_payload("IncidentInformation", body)
    if body.get("evidence_ids") not in (None, []):
        raise HTTPException(400, "Upload evidence through the protected evidence workflow.")
    fingerprint = hashlib.sha256(
        json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    citizen_id = user.user_id

    def previous():
        return (
            session.scalar(
                select(Complaint).where(
                    Complaint.citizen_id == citizen_id,
                    Complaint.create_idempotency_key == idempotency_key,
                )
            )
            if idempotency_key is not None
            else None
        )

    def replay(case):
        if case.create_fingerprint != fingerprint:
            raise HTTPException(409, "Idempotency key was used for a different draft payload.")
        response.status_code = 200
        return case_view(case, response)

    existing = previous()
    if existing is not None:
        return replay(existing)
    now = datetime.now(UTC)
    case = Complaint(
        complaint_id=str(uuid4()),
        citizen_id=citizen_id,
        incident_data=body,
        incident_type=body.get("incident_type"),
        current_status="DRAFT",
        version=1,
        created_at=now,
        updated_at=now,
        create_idempotency_key=idempotency_key,
        create_fingerprint=fingerprint if idempotency_key is not None else None,
    )
    session.add(case)
    try:
        session.flush()
        record_event(
            session,
            "complaint.created",
            citizen_id,
            "Draft saved",
            complaint_id=case.complaint_id,
            details={"version": 1, "fields": sorted(body)},
        )
        view = case_view(case, response)
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = previous()
        if existing is not None:
            return replay(existing)
        raise HTTPException(409, "Draft creation conflicts with current records.") from None
    return view


@router.get("/complaints", operation_id="listComplaints", tags=["Citizen complaints"])
def list_complaints(user: CurrentUser, session: SessionDep):
    require_role(user, "Citizen")
    return [
        case_view(case)
        for case in session.scalars(
            select(Complaint)
            .where(Complaint.citizen_id == user.user_id)
            .order_by(Complaint.complaint_id)
        )
    ]


@router.get("/complaints/{id}", operation_id="getComplaint", tags=["Citizen complaints"])
def get_complaint(id: str, response: Response, user: CurrentUser, session: SessionDep):
    if user.role == "Citizen":
        return case_view(own_case(session, user, id), response)
    require_role(user, "Helper")
    case = locked_case(session, id)
    return case_view(case, response, helper_scopes(session, user, case))


@router.patch("/complaints/{id}", operation_id="updateComplaint", tags=["Citizen complaints"])
def update_complaint(
    id: str,
    body: dict,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    if_match: IfMatch = None,
):
    case = own_case(session, user, id)
    validate_payload("IncidentPatch", body)
    require_version(case, if_match)
    if apply_incident_patch(case, body):
        record_event(
            session,
            "complaint.updated",
            user.user_id,
            "Draft saved",
            complaint_id=id,
            details={"version": case.version, "fields": sorted(body)},
        )
    view = case_view(case, response)
    commit(session)
    return view


@router.get("/complaints/{id}/helper-grants", operation_id="listHelperGrants", tags=["Helper"])
def list_helper_grants(id: str, user: CurrentUser, session: SessionDep):
    own_case(session, user, id)
    return [
        grant_view(grant)
        for grant in session.scalars(
            select(AccessGrant)
            .where(AccessGrant.complaint_id == id)
            .order_by(AccessGrant.helper_id)
        )
    ]


@router.post(
    "/complaints/{id}/helper-grants",
    operation_id="grantHelperAccess",
    tags=["Helper"],
    status_code=201,
)
def grant_helper_access(
    id: str, body: dict, response: Response, user: CurrentUser, session: SessionDep
):
    own_case(session, user, id)
    validate_payload("HelperGrantCreate", body)
    helper = session.get(User, body["helper_id"])
    if helper is None or not helper.active or helper.role != "Helper":
        raise HTTPException(400, "Choose an active helper account.")
    grant = session.get(AccessGrant, (id, helper.user_id))
    if grant is None:
        grant = AccessGrant(complaint_id=id, helper_id=helper.user_id, active=True)
        session.add(grant)
    else:
        response.status_code = 200
        grant.active = True
    record_event(
        session,
        "helper.granted",
        user.user_id,
        "Helper grant activated",
        complaint_id=id,
        details={"helper_id": helper.user_id},
    )
    commit(session)
    return grant_view(grant)


@router.post(
    "/complaints/{id}/helper-grants/{helper_id}/revoke",
    operation_id="revokeHelperAccess",
    tags=["Helper"],
)
def revoke_helper_access(id: str, helper_id: str, user: CurrentUser, session: SessionDep):
    own_case(session, user, id)
    grant = session.get(AccessGrant, (id, helper_id))
    if grant is None:
        raise HTTPException(404, "Helper grant does not exist.")
    if grant.active:
        grant.active = False
        record_event(
            session,
            "helper.revoked",
            user.user_id,
            "Helper grant revoked",
            complaint_id=id,
            details={"helper_id": helper_id},
        )
    commit(session)
    return grant_view(grant)


@router.get("/complaints/{id}/consents", operation_id="listConsents", tags=["Consent"])
def list_consents(id: str, user: CurrentUser, session: SessionDep):
    own_case(session, user, id)
    return [
        consent_view(record)
        for record in session.scalars(
            select(Consent)
            .where(Consent.complaint_id == id)
            .order_by(Consent.granted_at, Consent.consent_id)
        )
    ]


@router.post(
    "/complaints/{id}/consents", operation_id="grantConsent", tags=["Consent"], status_code=201
)
def grant_consent(id: str, body: dict, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    validate_payload("ConsentGrant", body)
    validate_recipient(session, body["recipient"], body["purpose"])
    record = Consent(
        consent_id=str(uuid4()),
        complaint_id=id,
        citizen_id=user.user_id,
        recipient=body["recipient"],
        purpose=body["purpose"],
        data_scopes=body["data_scopes"],
        status="granted",
        granted_at=datetime.now(UTC),
        changed_at=None,
        withdrawn_at=None,
    )
    session.add(record)
    record_event(
        session,
        "consent.granted",
        user.user_id,
        "Sharing consent granted",
        complaint_id=id,
        details={"consent_id": record.consent_id, **body},
    )
    notify_case(
        session,
        case,
        "consent:" + record.consent_id + ":granted",
        "Sharing consent for this case was granted.",
    )
    result = consent_view(record)
    commit(session)
    return result


def owned_consent(session, user, consent_id):
    require_role(user, "Citizen")
    record = session.get(Consent, consent_id)
    if record is None:
        raise HTTPException(404, "Consent does not exist.")
    own_case(session, user, record.complaint_id)
    session.refresh(record)
    return record


@router.patch("/consents/{id}", operation_id="changeConsent", tags=["Consent"])
def change_consent(id: str, body: dict, user: CurrentUser, session: SessionDep):
    record = owned_consent(session, user, id)
    case = locked_case(session, record.complaint_id)
    validate_payload("ConsentChange", body)
    if record.status != "granted":
        raise HTTPException(409, "Withdrawn consent cannot be changed. Create a new grant.")
    validate_recipient(
        session, body.get("recipient", record.recipient), body.get("purpose", record.purpose)
    )
    before = {k: getattr(record, k) for k in ("recipient", "purpose", "data_scopes")}
    if all(before[k] == v for k, v in body.items()):
        return consent_view(record)
    for key, value in body.items():
        setattr(record, key, value)
    record.changed_at = datetime.now(UTC)
    record_event(
        session,
        "consent.changed",
        user.user_id,
        "Sharing scope changed",
        complaint_id=record.complaint_id,
        details={"consent_id": id, "before": before, "change": body},
    )
    notify_case(
        session,
        case,
        "consent:" + id + ":" + record.changed_at.isoformat(),
        "Sharing consent for this case changed.",
    )
    result = consent_view(record)
    commit(session)
    return result


@router.post("/consents/{id}/withdraw", operation_id="withdrawConsent", tags=["Consent"])
def withdraw_consent(id: str, user: CurrentUser, session: SessionDep):
    record = owned_consent(session, user, id)
    case = locked_case(session, record.complaint_id)
    if record.status != "withdrawn":
        record.status = "withdrawn"
        record.withdrawn_at = record.changed_at = datetime.now(UTC)
        record_event(
            session,
            "consent.withdrawn",
            user.user_id,
            "Future sharing blocked",
            complaint_id=record.complaint_id,
            details={
                "consent_id": id,
                "recipient": record.recipient,
                "purpose": record.purpose,
                "data_scopes": record.data_scopes,
            },
        )
        notify_case(
            session,
            case,
            "consent:" + id + ":withdrawn",
            "Sharing consent for this case was withdrawn; future recipient access is blocked.",
        )
    result = consent_view(record)
    commit(session)
    return result


@router.get("/helper/complaints", operation_id="listHelperComplaints", tags=["Helper"])
def list_helper_complaints(user: CurrentUser, session: SessionDep):
    require_role(user, "Helper")
    ids = session.scalars(
        select(AccessGrant.complaint_id)
        .where(AccessGrant.helper_id == user.user_id, AccessGrant.active.is_(True))
        .order_by(AccessGrant.complaint_id)
    ).all()
    result = []
    for complaint_id in ids:
        case = locked_case(session, complaint_id)
        try:
            scopes = helper_scopes(session, user, case)
        except HTTPException as exc:
            if exc.status_code == 403:
                continue
            raise
        result.append(case_view(case, scopes=scopes))
    return result


@router.post(
    "/complaints/{id}/helper-information", operation_id="addHelperInformation", tags=["Helper"]
)
def add_helper_information(
    id: str,
    body: dict,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    if_match: IfMatch = None,
):
    require_role(user, "Helper")
    case = locked_case(session, id)
    scopes = helper_scopes(session, user, case)
    validate_payload("HelperInformation", body)
    if any(not can_read_field(scopes, name) for name in body):
        raise HTTPException(403, "Information is outside the citizen's current consent scope.")
    require_version(case, if_match)
    if apply_incident_patch(case, body):
        record_event(
            session,
            "helper.information_added",
            user.user_id,
            "Draft updated by helper",
            complaint_id=id,
            details={"version": case.version, "fields": sorted(body)},
        )
    # Snapshot authorized data while holding the case lock. Commit expires ORM objects;
    # a reload after unlocking could otherwise expose data added after consent changed.
    view = case_view(case, response, scopes)
    commit(session)
    return view


@router.get("/officer/complaints", operation_id="listOfficerComplaints", tags=["Officer"])
def list_officer_complaints(user: CurrentUser, session: SessionDep):
    require_role(user, "Officer")
    ids = session.scalars(
        select(Complaint.complaint_id)
        .join(CaseAssignment)
        .where(
            CaseAssignment.officer_id == user.user_id,
            CaseAssignment.workspace_id == user.workspace_id,
            Complaint.destination_workspace_id == user.workspace_id,
            Complaint.current_status.in_(OFFICER_VISIBLE),
        )
        .order_by(Complaint.complaint_id)
    ).all()
    result = []
    for complaint_id in ids:
        case = locked_case(session, complaint_id)
        try:
            scopes = officer_scopes(session, user, case)
        except HTTPException as exc:
            if exc.status_code == 403:
                continue
            raise
        result.append(case_view(case, scopes=scopes))
    return result


@router.get("/officer/complaints/{id}", operation_id="getOfficerComplaint", tags=["Officer"])
def get_officer_complaint(id: str, response: Response, user: CurrentUser, session: SessionDep):
    require_role(user, "Officer")
    case = locked_case(session, id)
    return case_view(case, response, officer_scopes(session, user, case))


@router.post("/admin/complaints/{id}/assignment", operation_id="assignOfficer", tags=["Admin"])
def assign_officer(id: str, body: dict, admin: AdminUser, session: SessionDep):
    from app.routing import pinned_snapshot

    case = locked_case(session, id)
    validate_payload("OfficerAssignmentCreate", body)
    officer = session.get(User, body["officer_id"])
    if (
        case.current_status not in {"SUBMITTED", "OFFICER_REVIEW"}
        or pinned_snapshot(session, case) is None
    ):
        raise HTTPException(409, "Assignment requires a submitted case with a pinned route.")
    if (
        officer is None
        or not officer.active
        or officer.role != "Officer"
        or officer.workspace_id != case.destination_workspace_id
    ):
        raise HTTPException(400, "Choose an active officer in the routed workspace.")
    scopes = consent_scopes(
        session, case, f"workspace:{case.destination_workspace_id}", "complaint_submission"
    )
    if "case_status" not in scopes:
        raise HTTPException(403, "Current recipient consent is required for assignment.")
    assignment = session.get(CaseAssignment, id)
    if (
        assignment is not None
        and assignment.officer_id == officer.user_id
        and assignment.workspace_id == officer.workspace_id
    ):
        return {
            "complaint_id": id,
            "officer_id": assignment.officer_id,
            "workspace_id": assignment.workspace_id,
        }
    if assignment is None:
        assignment = CaseAssignment(
            complaint_id=id, officer_id=officer.user_id, workspace_id=officer.workspace_id
        )
        session.add(assignment)
    else:
        assignment.officer_id = officer.user_id
        assignment.workspace_id = officer.workspace_id
    record_event(
        session,
        "officer.assigned",
        admin.user_id,
        "Officer assigned",
        complaint_id=id,
        details={"officer_id": officer.user_id, "workspace_id": officer.workspace_id},
    )
    notify_case(
        session,
        case,
        "assignment:" + str(uuid4()),
        "An officer was assigned to this simulated complaint.",
    )
    result = {
        "complaint_id": id,
        "officer_id": assignment.officer_id,
        "workspace_id": assignment.workspace_id,
    }
    commit(session)
    return result
