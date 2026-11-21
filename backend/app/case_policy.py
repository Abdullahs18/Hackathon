from datetime import UTC, datetime

from fastapi import HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AccessGrant, CaseAssignment, Complaint, Consent, User

EDITABLE = {"DRAFT", "COLLECT_INFORMATION", "NEEDS_INFORMATION", "CITIZEN_REVIEW", "HUMAN_REVIEW"}
OFFICER_VISIBLE = {"SUBMITTED", "OFFICER_REVIEW", "RESOLVED"}


def require_role(user: User, role: str) -> None:
    if user.role != role:
        raise HTTPException(403, "This role cannot perform this operation.")


def locked_case(session: Session, complaint_id: str) -> Complaint:
    case = session.scalar(
        select(Complaint)
        .where(Complaint.complaint_id == complaint_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if case is None:
        raise HTTPException(404, "Complaint does not exist.")
    return case


def own_case(session: Session, user: User, complaint_id: str) -> Complaint:
    require_role(user, "Citizen")
    case = locked_case(session, complaint_id)
    if case.citizen_id != user.user_id:
        raise HTTPException(403, "Only the owning citizen can perform this operation.")
    return case


def consent_scopes(session: Session, case: Complaint, recipient: str, purpose: str) -> set[str]:
    records = session.scalars(
        select(Consent)
        .where(
            Consent.complaint_id == case.complaint_id,
            Consent.citizen_id == case.citizen_id,
            Consent.recipient == recipient,
            Consent.purpose == purpose,
            Consent.status == "granted",
        )
        .execution_options(populate_existing=True)
    ).all()
    return {scope for record in records for scope in record.data_scopes}


def helper_scopes(session: Session, user: User, case: Complaint) -> set[str]:
    require_role(user, "Helper")
    grant = session.get(AccessGrant, (case.complaint_id, user.user_id), populate_existing=True)
    if grant is None or not grant.active:
        raise HTTPException(403, "An active case-specific helper grant is required.")
    scopes = consent_scopes(session, case, f"user:{user.user_id}", "helper_assistance")
    if "case_status" not in scopes:
        raise HTTPException(403, "Current consent for case access is required.")
    return scopes


def officer_scopes(session: Session, user: User, case: Complaint) -> set[str]:
    from app.routing import pinned_snapshot

    require_role(user, "Officer")
    assignment = session.get(CaseAssignment, case.complaint_id, populate_existing=True)
    if (
        assignment is None
        or assignment.officer_id != user.user_id
        or assignment.workspace_id != user.workspace_id
        or case.destination_workspace_id != user.workspace_id
        or case.current_status not in OFFICER_VISIBLE
        or pinned_snapshot(session, case) is None
    ):
        raise HTTPException(403, "A submitted assigned case in your workspace is required.")
    scopes = consent_scopes(session, case, f"workspace:{user.workspace_id}", "complaint_submission")
    if "case_status" not in scopes:
        raise HTTPException(403, "Current recipient consent for case access is required.")
    return scopes


def can_read_field(scopes: set[str], field: str) -> bool:
    if field == "evidence_ids":
        return "evidence" in scopes
    return "incident_data" in scopes or f"incident_data.{field}" in scopes


def timestamp(value: datetime) -> str:
    return (
        value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    ).isoformat()


def case_view(
    case: Complaint, response: Response | None = None, scopes: set[str] | None = None
) -> dict:
    if response is not None:
        response.headers["ETag"] = f'"{case.version}"'
    view = {
        "complaint_id": case.complaint_id,
        "citizen_id": case.citizen_id,
        "destination_workspace_id": case.destination_workspace_id,
        "rule_version_id": case.rule_version_id,
        "current_status": case.current_status,
        "version": case.version,
        "created_at": timestamp(case.created_at),
        "updated_at": timestamp(case.updated_at),
        "incident_data": {
            k: v
            for k, v in case.incident_data.items()
            if scopes is None or can_read_field(scopes, k)
        },
    }
    if scopes is None or can_read_field(scopes, "incident_type"):
        view["incident_type"] = case.incident_type
    # Generated drafts can contain evidence/suspect details outside a narrow consent.
    # Only the owner receives this field until a dedicated scoped draft view is defined.
    if scopes is None and case.complaint_draft is not None:
        view["complaint_draft"] = case.complaint_draft
    return view


def require_version(case: Complaint, if_match: str | None) -> None:
    if if_match is not None:
        if if_match != f'"{case.version}"':
            raise HTTPException(412, "Draft changed. Reload the complaint before saving.")


def apply_incident_patch(case: Complaint, patch: dict) -> bool:
    if case.current_status not in EDITABLE:
        raise HTTPException(409, "This complaint cannot be edited in its current state.")
    if (
        "evidence_ids" in patch
        and patch["evidence_ids"] != case.incident_data.get("evidence_ids")
        and (patch["evidence_ids"] not in (None, []) or case.incident_data.get("evidence_ids"))
    ):
        raise HTTPException(400, "Evidence must be attached through the protected upload workflow.")
    merged = {**case.incident_data, **patch}
    if merged == case.incident_data:
        return False
    case.incident_data = merged
    case.incident_type = merged.get("incident_type")
    case.complaint_draft = None
    case.current_status = "DRAFT"
    case.version += 1
    case.updated_at = datetime.now(UTC)
    return True
