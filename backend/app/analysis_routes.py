"""Owner-approved provider assessment, isolated from permissions and filing decisions."""

import hashlib
import json
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime
from threading import Lock
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.analysis_policy import evaluate, validate_assessment
from app.audit import record_event
from app.case_policy import EDITABLE, own_case, require_version, timestamp
from app.case_routes import IfMatch
from app.models import CaseAnalysis, Complaint, User
from app.routing import POLICY_VERSION, catalog, decision, pinned_snapshot, resolve
from app.security import CurrentUser, SessionDep
from app.validation import validate_payload, validate_schema
from app.voice.config import VoiceError

router = APIRouter(prefix="/api/v1")


class AnalysisGuard:
    """One API process in the prototype; bound calls and reject concurrent work on the same case."""

    def __init__(self):
        self.lock = Lock()
        self.active = set()

    @contextmanager
    def claim(self, complaint_id):
        with self.lock:
            if complaint_id in self.active or len(self.active) >= 2:
                raise HTTPException(429, "Analysis is busy. Retry shortly.", {"Retry-After": "1"})
            self.active.add(complaint_id)
        try:
            yield
        finally:
            with self.lock:
                self.active.remove(complaint_id)


def provider_factory():
    # Construct lazily. Startup and requests without permission never need a Gemini key.
    from app.voice.config import VoiceSettings
    from app.voice.providers import GeminiProvider

    return GeminiProvider(VoiceSettings())


def current_analysis(session, case):
    return session.scalar(
        select(CaseAnalysis).where(
            CaseAnalysis.complaint_id == case.complaint_id,
            CaseAnalysis.result_version == case.version,
        )
    )


def cache_matches(session, existing, case, generation):
    if existing is None or existing.result.get("policy_version") != POLICY_VERSION:
        return False
    result = existing.result
    if case.rule_version_id is None and case.destination_workspace_id is None:
        return result.get("routing_generation") == generation
    if result.get("routing"):
        snapshot = pinned_snapshot(session, case)
        return bool(
            snapshot
            and snapshot.rule_version_id == result["routing"]["rule_version_id"]
            and snapshot.incident_type == result["classification"]["incident_type"]
        )
    snapshot = pinned_snapshot(session, case)
    reasons = result.get("handoff_reasons", [])
    return (snapshot is None and "invalid_pinned_route" in reasons) or (
        snapshot is not None
        and snapshot.incident_type != result["classification"]["incident_type"]
        and "pinned_route_mismatch" in reasons
    )


def saved_assessment(existing):
    if existing is not None:
        try:
            model = existing.result["model"]
            if not isinstance(model, str) or not model.strip():
                return None
            return validate_assessment(
                {
                    "classification": existing.result["classification"],
                    "extraction": existing.result["extraction"],
                }
            ), model
        except (KeyError, VoiceError):
            return None
    return None


@router.get(
    "/complaints/{id}/analysis", operation_id="getComplaintAnalysis", tags=["Citizen complaints"]
)
def get_analysis(id: str, response: Response, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    record = current_analysis(session, case)
    if record is None:
        raise HTTPException(404, "No analysis exists for the current complaint version.")
    response.headers["ETag"] = f'"{case.version}"'
    return deepcopy(record.result)


@router.post(
    "/complaints/{id}/analyze", operation_id="analyzeComplaint", tags=["Citizen complaints"]
)
def analyze(
    id: str,
    body: dict,
    request: Request,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    if_match: IfMatch = None,
):
    case = own_case(session, user, id)
    validate_payload("AnalysisRequest", body)
    require_version(case, if_match)
    if case.current_status not in EDITABLE:
        raise HTTPException(409, "This complaint cannot be analyzed in its current state.")
    existing = current_analysis(session, case)
    state = catalog(session)
    if cache_matches(session, existing, case, state.generation):
        response.headers["ETag"] = f'"{case.version}"'
        return deepcopy(existing.result)
    actor_id = user.user_id
    input_version = case.version
    incident = deepcopy(case.incident_data)
    # No evidence bytes/IDs, confirmation records, credentials or synthetic identity records.
    sent = {
        k: v
        for k, v in incident.items()
        if k not in {"evidence_ids", "citizen_confirmed_corrections"}
    }
    encoded = json.dumps(sent, ensure_ascii=False, allow_nan=False)
    if len(encoded) > 24000:
        raise HTTPException(400, "Saved incident text exceeds the 24000-character analysis limit.")
    if not any(
        isinstance(sent.get(k), str) and sent[k].strip() for k in ["description", "scam_message"]
    ):
        raise HTTPException(400, "Save an incident description or scam message before analysis.")
    with request.app.state.analysis_guard.claim(id):
        reusable = saved_assessment(existing)
        if reusable is not None:
            assessment, model = reusable
            record_event(
                session,
                "analysis.assessment_reused",
                actor_id,
                "Saved assessment reused for deterministic routing",
                complaint_id=id,
                details={
                    "input_version": input_version,
                    "source_analysis_id": existing.analysis_id,
                },
            )
        else:
            record_event(
                session,
                "analysis.external_processing_authorized",
                actor_id,
                "Citizen permitted this version to be assessed by Gemini",
                complaint_id=id,
                details={
                    "input_version": input_version,
                    "fields": sorted(sent),
                    "input_sha256": hashlib.sha256(encoded.encode()).hexdigest(),
                },
            )
            # Release case/catalog locks and the DB connection before the external call.
            session.commit()
            try:
                provider = request.app.state.analysis_provider_factory()
                try:
                    assessment = provider.assess(sent)
                    assessment = validate_assessment(assessment.model_dump())
                    model = provider.model
                    if not isinstance(model, str) or not model.strip():
                        raise VoiceError("invalid_model_output", "Missing model metadata.")
                finally:
                    provider.close()
            except Exception as exc:
                fail_assessment(session, actor_id, id, input_version, exc)
        return save_assessment(
            session, actor_id, id, input_version, incident, assessment, model, response
        )


def fail_assessment(session, actor_id, id, input_version, exc):
    code = exc.code if isinstance(exc, VoiceError) else "provider_unavailable"
    record_event(
        session,
        "analysis.failed",
        actor_id,
        "Assessment unavailable",
        complaint_id=id,
        details={"input_version": input_version, "code": code},
    )
    session.commit()
    if code == "provider_quota":
        raise HTTPException(
            429, "Gemini quota is unavailable. Retry later.", {"Retry-After": "60"}
        ) from None
    if code == "invalid_model_output":
        raise HTTPException(
            502, "AI assessment failed validation. Saved incident was preserved."
        ) from None
    raise HTTPException(503, "AI analysis is unavailable. Saved incident was preserved.") from None


def save_assessment(session, actor_id, id, input_version, incident, assessment, model, response):
    # Never trust an account/permission or case snapshot held during an external request.
    current = session.get(User, actor_id, populate_existing=True)
    if current is None or not current.active or current.role != "Citizen":
        record_event(
            session,
            "analysis.discarded",
            actor_id,
            "Account access changed",
            complaint_id=id,
            details={"input_version": input_version},
        )
        session.commit()
        raise HTTPException(403, "Current Citizen access is required to save analysis.")
    case = own_case(session, current, id)
    if case.version != input_version or case.current_status not in EDITABLE:
        record_event(
            session,
            "analysis.discarded",
            actor_id,
            "Case changed during assessment",
            complaint_id=id,
            details={"input_version": input_version},
        )
        session.commit()
        raise HTTPException(409, "Complaint changed during analysis. Reload before retrying.")
    reference = (incident.get("transaction_reference") or "").strip().casefold()
    possible_duplicate = bool(reference) and any(
        (other.incident_data.get("transaction_reference") or "").strip().casefold() == reference
        for other in session.scalars(
            select(Complaint).where(Complaint.citizen_id == actor_id, Complaint.complaint_id != id)
        )
    )
    state = catalog(session)
    was_pinned = case.rule_version_id is not None
    snapshot, route_reason = resolve(session, case, assessment.classification.incident_type)
    result = evaluate(
        incident,
        assessment,
        possible_duplicate,
        route_match=snapshot is not None,
        route_reason=route_reason,
    )
    result.update(
        routing=decision(snapshot),
        routing_generation=state.generation,
        policy_version=POLICY_VERSION,
    )
    now = datetime.now(UTC)
    case.version += 1
    case.updated_at = now
    case.current_status = result["current_status"]
    case.complaint_draft = result.get("complaint_draft")
    result.update(
        analysis_id=str(uuid4()),
        input_version=input_version,
        complaint_version=case.version,
        analyzed_at=timestamp(now),
        model=model,
    )
    validate_schema("Analysis", result)
    record = CaseAnalysis(
        analysis_id=result["analysis_id"],
        complaint_id=id,
        input_version=input_version,
        result_version=case.version,
        result=result,
        created_at=now,
    )
    session.add(record)
    record_event(
        session,
        "routing.preserved" if was_pinned else "routing.evaluated",
        actor_id,
        "Demo rule evaluated",
        complaint_id=id,
        rule_version_id=case.rule_version_id,
        details={
            "generation": state.generation,
            "reason": route_reason,
            "analysis_id": record.analysis_id,
        },
    )
    record_event(
        session,
        "analysis.completed",
        actor_id,
        "Assessment saved; submission requires separate citizen authorization",
        complaint_id=id,
        details={
            "analysis_id": record.analysis_id,
            "input_version": input_version,
            "complaint_version": case.version,
            "handoff_reasons": result["handoff_reasons"],
        },
    )
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503,
            "Analysis save outcome is uncertain. Read the current analysis before retrying.",
        ) from None
    response.headers["ETag"] = f'"{result["complaint_version"]}"'
    return result
