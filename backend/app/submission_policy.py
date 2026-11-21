"""Current database checks for explicit, payload-bound citizen approval."""

import hashlib
import json
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.audit import record_event
from app.case_policy import timestamp
from app.models import CaseAnalysis, Complaint, Consent, SubmissionAuthorization
from app.routing import pinned_snapshot
from app.validation import validate_schema

DRAFT_FIELDS = {
    "incident_type",
    "incident_date",
    "description",
    "amount",
    "currency",
    "payment_method",
    "transaction_reference",
    "suspect_details",
}


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def bound_payload(case, draft=None):
    return {
        "request": {
            "complaint_id": case.complaint_id,
            "complaint_draft": deepcopy(draft if draft is not None else case.complaint_draft),
        },
        "incident_data": deepcopy(case.incident_data),
        "citizen_id": case.citizen_id,
        "rule_version_id": case.rule_version_id,
        "destination_workspace_id": case.destination_workspace_id,
    }


def scope_needs(case):
    fields = {"case_status", *(f"incident_data.{name}" for name in DRAFT_FIELDS)}
    if case.complaint_draft and case.complaint_draft.get("evidence_ids"):
        fields.add("evidence")
    needs = [
        (f"workspace:{case.destination_workspace_id}", "complaint_submission", fields),
        ("service:mock-identity", "mock_identity_check", {"case_status", "identity_reference"}),
        (
            "service:mock-data",
            "mock_requirements_lookup",
            {"case_status", "incident_data.incident_type"},
        ),
    ]
    if (case.incident_data.get("transaction_reference") or "").strip():
        needs.append(
            (
                "service:mock-payment",
                "mock_payment_lookup",
                {
                    "case_status",
                    "incident_data.transaction_reference",
                    "incident_data.amount",
                    "incident_data.currency",
                    "incident_data.payment_method",
                },
            )
        )
    return needs


def consent_snapshot(session, case):
    snapshot = {}
    for recipient, purpose, required in scope_needs(case):
        record = session.scalar(
            select(Consent)
            .where(
                Consent.complaint_id == case.complaint_id,
                Consent.citizen_id == case.citizen_id,
                Consent.recipient == recipient,
                Consent.purpose == purpose,
                Consent.status == "granted",
            )
            .execution_options(populate_existing=True)
        )
        if record is None:
            raise HTTPException(
                403, "Current consent for every required simulated recipient is needed."
            )
        scopes = set(record.data_scopes)
        if any(
            item not in scopes
            and not (item.startswith("incident_data.") and "incident_data" in scopes)
            for item in required
        ):
            raise HTTPException(403, "Recipient consent does not cover the approved data fields.")
        snapshot[recipient] = {
            "consent_id": record.consent_id,
            "purpose": record.purpose,
            "scopes": sorted(scopes),
            "granted_at": timestamp(record.granted_at),
            "changed_at": timestamp(record.changed_at) if record.changed_at else None,
        }
    return snapshot


def check_binding(session, case, approval):
    if (
        approval is None
        or approval.revoked_at is not None
        or approval.complaint_id != case.complaint_id
        or approval.citizen_id != case.citizen_id
        or case.authorization_id != approval.authorization_id
        or case.version != approval.expected_version
        or digest(bound_payload(case)) != approval.fingerprint
    ):
        raise HTTPException(
            409, "The reviewed approval is no longer current. Review and authorize again."
        )
    snapshot = pinned_snapshot(session, case)
    if snapshot is None or snapshot.incident_type != case.complaint_draft.get("incident_type"):
        raise HTTPException(409, "A valid unchanged pinned route is required.")


def require_approval(session, case, approval):
    check_binding(session, case, approval)
    if consent_snapshot(session, case) != approval.consent_snapshot:
        raise HTTPException(
            403,
            "Relevant consent changed after approval. Fresh review and authorization are required.",
        )


def has_duplicate(session, case):
    reference = (case.incident_data.get("transaction_reference") or "").strip().casefold()
    return bool(reference) and any(
        (row.incident_data.get("transaction_reference") or "").strip().casefold() == reference
        for row in session.scalars(
            select(Complaint).where(
                Complaint.citizen_id == case.citizen_id, Complaint.complaint_id != case.complaint_id
            )
        )
    )


def authorize(session, case, body):
    existing = (
        session.get(SubmissionAuthorization, case.authorization_id)
        if case.authorization_id
        else None
    )
    if existing and existing.reviewed_version == body["reviewed_version"]:
        require_approval(session, case, existing)
        return existing
    if case.current_status != "CITIZEN_REVIEW" or case.version != body["reviewed_version"]:
        raise HTTPException(409, "Authorize the current CITIZEN_REVIEW revision only.")
    analysis = session.scalar(
        select(CaseAnalysis).where(
            CaseAnalysis.complaint_id == case.complaint_id,
            CaseAnalysis.result_version == case.version,
        )
    )
    if (
        analysis is None
        or analysis.result.get("current_status") != "CITIZEN_REVIEW"
        or analysis.result.get("handoff_reasons")
        or analysis.result.get("readiness_score", 0) < 0.85
        or analysis.result.get("complaint_draft") != case.complaint_draft
        or has_duplicate(session, case)
    ):
        raise HTTPException(
            409, "Current review/readiness checks are required before authorization."
        )
    snapshot = pinned_snapshot(session, case)
    if snapshot is None or snapshot.incident_type != case.complaint_draft.get("incident_type"):
        raise HTTPException(409, "A valid pinned route is required.")
    consents = consent_snapshot(session, case)
    draft = {**case.complaint_draft, "citizen_confirmed": True}
    validate_schema("ComplaintDraft", draft)
    reviewed = case.version
    case.complaint_draft = draft
    case.version += 1
    case.updated_at = datetime.now(UTC)
    case.current_status = "CONSENT_AND_AUTHORIZATION"
    payload = bound_payload(case)
    approval = SubmissionAuthorization(
        authorization_id=str(uuid4()),
        complaint_id=case.complaint_id,
        citizen_id=case.citizen_id,
        analysis_id=analysis.analysis_id,
        reviewed_version=reviewed,
        expected_version=case.version,
        payload=payload,
        fingerprint=digest(payload),
        consent_snapshot=consents,
        authorized_at=case.updated_at,
        revoked_at=None,
    )
    session.add(approval)
    case.authorization_id = approval.authorization_id
    record_event(
        session,
        "submission.authorized",
        case.citizen_id,
        "Citizen explicitly confirmed and authorized this revision",
        complaint_id=case.complaint_id,
        rule_version_id=case.rule_version_id,
        details={
            "authorization_id": approval.authorization_id,
            "reviewed_version": reviewed,
            "approved_sha256": approval.fingerprint,
            "consent_ids": [v["consent_id"] for v in consents.values()],
        },
    )
    return approval


def authorization_view(session, case, approval):
    active = True
    try:
        require_approval(session, case, approval)
    except HTTPException:
        active = False
    return {
        "authorization_id": approval.authorization_id,
        "complaint_id": case.complaint_id,
        "reviewed_version": approval.reviewed_version,
        "case_version": approval.expected_version,
        "active": active,
        "authorized_at": timestamp(approval.authorized_at),
        "revoked_at": timestamp(approval.revoked_at) if approval.revoked_at else None,
    }
