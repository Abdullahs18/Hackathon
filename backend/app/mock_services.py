"""Typed simulated tools. All caller/case/consent checks happen before accessing fixtures."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.models import Evidence, MockIdentity, MockPayment, MockRequirements, MockSubmission
from app.submission_policy import digest, has_duplicate, require_approval
from app.validation import schema_definitions, validate_schema


class ReferenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    reference: str = Field(min_length=1, max_length=12000)


class RequirementsInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    incident_type: str = Field(min_length=1, max_length=200)


class FilingInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    complaint_id: str = Field(min_length=1, max_length=36)
    complaint_draft: dict


def identity(session, reference, user_id=None):
    value = ReferenceInput(reference=reference)
    row = session.get(MockIdentity, value.reference)
    if row is None:
        raise HTTPException(404, "Synthetic identity fixture was not found.")
    if user_id is not None and row.user_id != user_id:
        raise HTTPException(403, "Synthetic identity is outside this citizen's scope.")
    result = {
        "identity_reference": row.identity_reference,
        "user_id": row.user_id,
        "simulated": True,
    }
    validate_schema("mock_identity_records", result)
    return result


def payment(session, reference, user_id=None):
    value = ReferenceInput(reference=reference)
    row = session.get(MockPayment, value.reference)
    if row is None:
        raise HTTPException(
            404, "Synthetic payment fixture was not found; this does not invalidate the report."
        )
    if user_id is not None and row.user_id != user_id:
        raise HTTPException(403, "Synthetic transaction is outside this citizen's scope.")
    result = {
        "transaction_reference": row.transaction_reference,
        "amount": row.amount,
        "currency": row.currency,
        "payment_method": row.payment_method,
        "simulated": True,
    }
    validate_schema("mock_payment_transactions", result)
    return result


def requirements(session, incident_type):
    value = RequirementsInput(incident_type=incident_type)
    row = session.get(MockRequirements, value.incident_type)
    if row is None:
        raise HTTPException(404, "Simulated reporting requirements were not found.")
    allowed = set(schema_definitions()["IncidentInformation"]["properties"])
    if not set(row.requirements) <= allowed or not set(row.available_fields) <= allowed:
        raise HTTPException(502, "Simulated requirements failed validation.")
    result = {
        "incident_type": row.incident_type,
        "requirements": row.requirements,
        "available_fields": row.available_fields,
        "simulated": True,
    }
    validate_schema("mock_reporting_requirements", result)
    return result


def confirmation(row):
    return {
        "complaint_id": row.complaint_id,
        "idempotency_key": row.idempotency_key,
        "submission_reference": row.submission_reference,
        "simulated": True,
    }


def find_filing(session, case, approval, key):
    require_approval(session, case, approval)
    row = session.scalar(
        select(MockSubmission).where(
            MockSubmission.citizen_id == case.citizen_id, MockSubmission.idempotency_key == key
        )
    )
    if row is not None and (
        row.complaint_id != case.complaint_id or row.fingerprint != approval.fingerprint
    ):
        raise HTTPException(409, "Submission key conflicts with the approved payload.")
    return row


def file_complaint(session, case, approval, run, store):
    require_approval(session, case, approval)
    value = FilingInput.model_validate(approval.payload["request"])
    validate_schema("SubmissionRequest", value.model_dump())
    previous = find_filing(session, case, approval, run.idempotency_key)
    if previous is not None:
        return previous, False
    if has_duplicate(session, case):
        raise HTTPException(409, "possible_duplicate")
    for evidence_id in value.complaint_draft["evidence_ids"]:
        record = session.get(Evidence, evidence_id)
        if record is None or record.complaint_id != case.complaint_id:
            raise HTTPException(409, "Evidence is outside this approved complaint.")
        store.read(record.storage_key, record.file_size, record.sha256)
    reference = (case.incident_data.get("transaction_reference") or "").strip().casefold()
    transaction_hash = digest(reference) if reference else None
    if transaction_hash and session.scalar(
        select(MockSubmission.submission_id).where(
            MockSubmission.citizen_id == case.citizen_id,
            MockSubmission.transaction_fingerprint == transaction_hash,
        )
    ):
        raise HTTPException(409, "possible_duplicate")
    row = MockSubmission(
        submission_id=str(uuid4()),
        complaint_id=case.complaint_id,
        citizen_id=case.citizen_id,
        authorization_id=approval.authorization_id,
        idempotency_key=run.idempotency_key,
        fingerprint=approval.fingerprint,
        transaction_fingerprint=transaction_hash,
        payload=value.model_dump(),
        destination_workspace_id=case.destination_workspace_id,
        rule_version_id=case.rule_version_id,
        submission_reference="SIM-" + uuid4().hex.upper(),
        created_at=datetime.now(UTC),
    )
    session.add(row)
    session.flush()
    return row, True


def seed_mock_services(session):
    from app.routing import SUPPORTED_TYPES

    for reference, user_id in [
        ("DEMO-ID-001", "demo-citizen-1"),
        ("DEMO-ID-002", "demo-citizen-2"),
    ]:
        if (
            session.get(MockIdentity, reference) is None
            and session.scalar(select(MockIdentity).where(MockIdentity.user_id == user_id)) is None
        ):
            session.add(MockIdentity(identity_reference=reference, user_id=user_id))
    for reference, user_id, amount in [
        ("DEMO123", "demo-citizen-1", 1500),
        ("DEMO-SUBMIT-001", "demo-citizen-1", 1500),
        ("DEMO456", "demo-citizen-2", 2400),
    ]:
        if session.get(MockPayment, reference) is None:
            session.add(
                MockPayment(
                    transaction_reference=reference,
                    user_id=user_id,
                    amount=amount,
                    currency="PKR",
                    payment_method="demo_wallet",
                )
            )
    for kind in SUPPORTED_TYPES:
        if session.get(MockRequirements, kind) is None:
            session.add(
                MockRequirements(
                    incident_type=kind,
                    requirements=["description", "money_lost"],
                    available_fields=list(
                        schema_definitions()["IncidentInformation"]["properties"]
                    ),
                )
            )
