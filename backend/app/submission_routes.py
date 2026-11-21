from copy import deepcopy
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app import mock_services
from app.audit import record_event
from app.case_policy import case_view, own_case, require_role
from app.models import AgentRun, MockSubmission, SubmissionAuthorization
from app.security import CurrentUser, SessionDep
from app.submission_agent import locked_run, run_view, start_execution
from app.submission_policy import authorization_view, authorize, require_approval
from app.validation import validate_payload

router = APIRouter(prefix="/api/v1")
SubmissionKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
CaseQuery = Annotated[str | None, Query(alias="complaint_id", min_length=1, max_length=36)]


def save(session):
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Save outcome is uncertain. Recover the saved case before retrying."
        ) from None


@router.post(
    "/complaints/{id}/authorize-submission",
    operation_id="authorizeSubmission",
    tags=["Citizen complaints"],
)
def authorize_submission(
    id: str, body: dict, response: Response, user: CurrentUser, session: SessionDep
):
    case = own_case(session, user, id)
    validate_payload("AuthorizeSubmission", body)
    authorize(session, case, body)
    result = case_view(case, response)
    save(session)
    return result


@router.get(
    "/complaints/{id}/authorization",
    operation_id="getSubmissionAuthorization",
    tags=["Citizen complaints"],
)
def get_authorization(id: str, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    approval = (
        session.get(SubmissionAuthorization, case.authorization_id)
        if case.authorization_id
        else None
    )
    if approval is None:
        raise HTTPException(404, "This case has no submission approval.")
    return authorization_view(session, case, approval)


@router.post(
    "/complaints/{id}/authorization/revoke",
    operation_id="revokeSubmissionAuthorization",
    tags=["Citizen complaints"],
)
def revoke_authorization(id: str, response: Response, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    approval = (
        session.get(SubmissionAuthorization, case.authorization_id)
        if case.authorization_id
        else None
    )
    if approval is None:
        raise HTTPException(404, "This case has no submission approval.")
    if session.scalar(
        select(MockSubmission.submission_id).where(MockSubmission.complaint_id == id)
    ):
        raise HTTPException(
            409,
            "A simulated filing is already recorded and cannot be retracted by revoking approval.",
        )
    if approval.revoked_at is None:
        approval.revoked_at = datetime.now(UTC)
        case.version += 1
        case.updated_at = approval.revoked_at
        case.current_status = "DRAFT"
        case.complaint_draft = None
        case.agent_run_id = None
        record_event(
            session,
            "submission.authorization_revoked",
            user.user_id,
            "Unfiled approval revoked",
            complaint_id=id,
            details={"authorization_id": approval.authorization_id},
        )
    result = case_view(case, response)
    save(session)
    return result


def execute(request, session, user, case_id, authorization_id, key, payload=None):
    require_role(user, "Citizen")
    actor_id = user.user_id
    session.rollback()  # Release the auth dependency's connection before graph/tool transactions.
    return start_execution(
        request.app.state.engine,
        request.app.state.evidence_store,
        actor_id,
        case_id,
        authorization_id,
        key,
        request_payload=payload,
        before_step=getattr(request.app.state, "agent_before_step", None),
    )


@router.post(
    "/complaints/{id}/submit", operation_id="executeSubmission", tags=["Citizen complaints"]
)
def submit(
    id: str,
    body: dict,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: SubmissionKey,
):
    validate_payload("ExecuteSubmission", body)
    result, _ = execute(request, session, user, id, body["authorization_id"], idempotency_key)
    return result


@router.get(
    "/complaints/{id}/agent-runs", operation_id="listCitizenAgentRuns", tags=["Citizen complaints"]
)
def list_runs(id: str, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    return [
        run_view(session, case, row)
        for row in session.scalars(
            select(AgentRun)
            .where(AgentRun.complaint_id == id)
            .order_by(AgentRun.created_at, AgentRun.agent_run_id)
        )
    ]


@router.get(
    "/complaints/{id}/agent-runs/{run_id}",
    operation_id="getCitizenAgentRun",
    tags=["Citizen complaints"],
)
def get_run(id: str, run_id: str, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    return run_view(session, case, locked_run(session, case, run_id))


def lookup_context(session, user, complaint_id, service):
    if user.role == "Admin":
        return None
    require_role(user, "Citizen")
    if complaint_id is None:
        raise HTTPException(400, "Citizen fixture reads require an approved complaint_id.")
    case = own_case(session, user, complaint_id)
    approval = (
        session.get(SubmissionAuthorization, case.authorization_id)
        if case.authorization_id
        else None
    )
    require_approval(session, case, approval)
    # The approval binds all required service-specific consents. No generic mock access grant.
    if f"service:mock-{service}" not in approval.consent_snapshot:
        raise HTTPException(403, "This service was not part of the approved workflow.")
    return case


@router.get("/mock/identity/{reference}", operation_id="getMockIdentity", tags=["Mock services"])
def mock_identity(
    reference: str, user: CurrentUser, session: SessionDep, complaint_id: CaseQuery = None
):
    case = lookup_context(session, user, complaint_id, "identity")
    result = mock_services.identity(session, reference, case.citizen_id if case else None)
    record_event(
        session,
        "mock.identity_read",
        user.user_id,
        "Read a synthetic identity fixture",
        complaint_id=case.complaint_id if case else None,
    )
    save(session)
    return result


@router.get(
    "/mock/payments/transactions/{reference}", operation_id="getMockPayment", tags=["Mock services"]
)
def mock_payment(
    reference: str, user: CurrentUser, session: SessionDep, complaint_id: CaseQuery = None
):
    case = lookup_context(session, user, complaint_id, "payment")
    if case is not None and reference != case.incident_data.get("transaction_reference"):
        raise HTTPException(403, "Reference is outside the approved incident.")
    result = mock_services.payment(session, reference, case.citizen_id if case else None)
    record_event(
        session,
        "mock.payment_read",
        user.user_id,
        "Read a synthetic payment fixture",
        complaint_id=case.complaint_id if case else None,
    )
    save(session)
    return result


@router.get(
    "/mock/data/requirements/{incident_type}",
    operation_id="getMockRequirements",
    tags=["Mock services"],
)
def mock_requirements(
    incident_type: str, user: CurrentUser, session: SessionDep, complaint_id: CaseQuery = None
):
    case = lookup_context(session, user, complaint_id, "data")
    if case is not None and incident_type != case.complaint_draft["incident_type"]:
        raise HTTPException(403, "Incident type is outside the approved case.")
    result = mock_services.requirements(session, incident_type)
    record_event(
        session,
        "mock.requirements_read",
        user.user_id,
        "Read simulated requirements",
        complaint_id=case.complaint_id if case else None,
    )
    save(session)
    return result


@router.post(
    "/mock/complaints", operation_id="submitMockComplaint", tags=["Mock services"], status_code=201
)
def mock_submit(
    body: dict,
    request: Request,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: SubmissionKey,
):
    require_role(user, "Citizen")
    validate_payload("SubmissionRequest", body)
    case = own_case(session, user, body["complaint_id"])
    authorization_id = case.authorization_id
    if authorization_id is None:
        raise HTTPException(409, "Explicit current citizen approval is required before filing.")
    result, created = execute(
        request, session, user, case.complaint_id, authorization_id, idempotency_key, deepcopy(body)
    )
    if not result["submitted"]:
        raise HTTPException(409, "The approved workflow stopped for review. Read its saved run.")
    response.status_code = 201 if created else 200
    return {
        "complaint_id": body["complaint_id"],
        "idempotency_key": idempotency_key,
        "submission_reference": result["submission_reference"],
        "simulated": True,
    }


@router.get(
    "/mock/complaints/by-idempotency-key/{key}",
    operation_id="findMockSubmission",
    tags=["Mock services"],
)
def find_submission(key: str, user: CurrentUser, session: SessionDep):
    require_role(user, "Citizen")
    row = session.scalar(
        select(MockSubmission).where(
            MockSubmission.citizen_id == user.user_id, MockSubmission.idempotency_key == key
        )
    )
    if row is None:
        raise HTTPException(404, "No simulated confirmation exists for this caller-bound key.")
    case = own_case(session, user, row.complaint_id)
    approval = session.get(SubmissionAuthorization, row.authorization_id)
    require_approval(session, case, approval)
    result = mock_services.confirmation(row)
    record_event(
        session,
        "mock.confirmation_read",
        user.user_id,
        "Read simulated recipient confirmation",
        complaint_id=case.complaint_id,
        details={"authorization_id": approval.authorization_id},
    )
    save(session)
    return result
