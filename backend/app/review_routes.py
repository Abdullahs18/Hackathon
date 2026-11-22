"""Officer decisions and explicit citizen supplements preserve the original simulated filing."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.audit import record_event
from app.case_policy import (
    can_read_field,
    case_view,
    locked_case,
    officer_scopes,
    own_case,
    require_role,
    require_version,
    timestamp,
)
from app.models import CaseAssignment, MockSubmission, ReviewEvent, SubmissionAuthorization, User
from app.notifications import notify_case
from app.security import CurrentUser, SessionDep
from app.submission_policy import DRAFT_FIELDS, bound_payload, digest
from app.validation import validate_payload

router = APIRouter(prefix="/api/v1")
ReviewKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
ReviewVersion = Annotated[str, Header(alias="If-Match", pattern=r'^"[1-9][0-9]*"$')]

TRANSITIONS = {
    "pending": {
        "request_information": "information_requested",
        "accept": "accepted",
        "reject": "rejected",
        "escalate": "escalated",
    },
    "information_requested": {"escalate": "escalated"},
    "information_received": {
        "request_information": "information_requested",
        "accept": "accepted",
        "reject": "rejected",
        "escalate": "escalated",
    },
    "accepted": {"close": "closed", "escalate": "escalated"},
    "escalated": {
        "request_information": "information_requested",
        "accept": "accepted",
        "reject": "rejected",
    },
    "rejected": {},
    "closed": {},
}
MESSAGES = {
    "request_information": (
        "The assigned officer requested more information for this simulated case."
    ),
    "provide_information": "The citizen answered the officer's information request.",
    "accept": "The assigned officer accepted this simulated complaint for review.",
    "reject": "The assigned officer rejected this simulated complaint.",
    "escalate": "This simulated complaint was escalated for review within its pinned workspace.",
    "close": "The assigned officer closed this simulated complaint.",
}


def review_scope(session, user, case):
    scopes = officer_scopes(session, user, case)
    if any(not can_read_field(scopes, field) for field in DRAFT_FIELDS) or (
        case.incident_data.get("evidence_ids") and "evidence" not in scopes
    ):
        raise HTTPException(
            403,
            "Review requires consent for every filed complaint field and attached evidence.",
        )
    return scopes


def filed(session, case):
    receipt = session.scalar(
        select(MockSubmission).where(MockSubmission.complaint_id == case.complaint_id)
    )
    if receipt is None or case.submission_reference != receipt.submission_reference:
        raise HTTPException(409, "Review requires a recorded confirmed simulated filing.")


def save(session):
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            409, "Review command conflicts with an existing caller-bound key."
        ) from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503,
            "Review save is uncertain. Recover history and retry the same key, body and If-Match.",
        ) from None


def replay(session, user, case, key, fingerprint):
    event = session.scalar(
        select(ReviewEvent).where(
            ReviewEvent.actor_id == user.user_id, ReviewEvent.idempotency_key == key
        )
    )
    if event is None:
        return False
    if event.complaint_id != case.complaint_id or event.fingerprint != fingerprint:
        raise HTTPException(
            409, "This command key belongs to a different case, payload or reviewed version."
        )
    return True


def append_event(session, user, case, key, fingerprint, action, message, outcome):
    previous = case.review_outcome or "pending"
    old_version = case.version
    case.version += 1
    case.updated_at = datetime.now(UTC)
    case.review_outcome = outcome
    case.current_status = "RESOLVED" if outcome in {"closed", "rejected"} else "OFFICER_REVIEW"
    # This changes review metadata, not citizen-approved facts or the filed payload.
    approval = (
        session.get(SubmissionAuthorization, case.authorization_id)
        if case.authorization_id
        else None
    )
    if (
        approval is not None
        and approval.expected_version == old_version
        and approval.fingerprint == digest(bound_payload(case))
    ):
        approval.expected_version = case.version
    event = ReviewEvent(
        event_id=str(uuid4()),
        complaint_id=case.complaint_id,
        actor_id=user.user_id,
        action=action,
        message=message,
        previous_outcome=previous,
        outcome=outcome,
        complaint_version=case.version,
        idempotency_key=key,
        fingerprint=fingerprint,
        timestamp=case.updated_at,
    )
    session.add(event)
    record_event(
        session,
        "review." + action,
        user.user_id,
        MESSAGES[action],
        complaint_id=case.complaint_id,
        rule_version_id=case.rule_version_id,
        details={
            "event_id": event.event_id,
            "version": case.version,
            "previous_outcome": previous,
            "outcome": outcome,
        },
    )
    notify_case(session, case, "review:" + event.event_id, MESSAGES[action])


@router.post("/officer/complaints/{id}/actions", operation_id="takeOfficerAction", tags=["Officer"])
def take_action(
    id: str,
    body: dict,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: ReviewKey,
    if_match: ReviewVersion,
):
    require_role(user, "Officer")
    case = locked_case(session, id)
    scopes = review_scope(session, user, case)
    validate_payload("OfficerDecision", body)
    message = body["reason"].strip()
    if not message:
        raise HTTPException(400, "A meaningful review reason is required.")
    filed(session, case)
    fingerprint = digest({"case_id": id, "body": body, "if_match": if_match})
    if replay(session, user, case, idempotency_key, fingerprint):
        return case_view(case, response, scopes)
    require_version(case, if_match)
    outcome = TRANSITIONS.get(case.review_outcome or "pending", {}).get(body["action"])
    if outcome is None or case.current_status == "RESOLVED":
        raise HTTPException(409, "This review transition is not permitted in the current state.")
    append_event(
        session, user, case, idempotency_key, fingerprint, body["action"], message, outcome
    )
    result = case_view(case, response, scopes)
    save(session)
    return result


@router.post(
    "/complaints/{id}/review-response", operation_id="replyToOfficer", tags=["Citizen complaints"]
)
def reply(
    id: str,
    body: dict,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: ReviewKey,
    if_match: ReviewVersion,
):
    case = own_case(session, user, id)
    validate_payload("ReviewReply", body)
    message = body["message"].strip()
    if not message:
        raise HTTPException(400, "An information response must contain a message.")
    filed(session, case)
    assignment = session.get(CaseAssignment, id, populate_existing=True)
    officer = (
        session.get(User, assignment.officer_id, populate_existing=True) if assignment else None
    )
    if officer is None or not officer.active:
        raise HTTPException(
            403, "An active assigned officer with current recipient consent is required."
        )
    review_scope(session, officer, case)
    fingerprint = digest({"case_id": id, "body": body, "if_match": if_match})
    if replay(session, user, case, idempotency_key, fingerprint):
        return case_view(case, response)
    require_version(case, if_match)
    if case.current_status != "OFFICER_REVIEW" or case.review_outcome != "information_requested":
        raise HTTPException(409, "There is no outstanding officer information request.")
    append_event(
        session,
        user,
        case,
        idempotency_key,
        fingerprint,
        "provide_information",
        message,
        "information_received",
    )
    result = case_view(case, response)
    save(session)
    return result


def history(session, case):
    return [
        {
            "event_id": row.event_id,
            "complaint_id": row.complaint_id,
            "actor_id": row.actor_id,
            "action": row.action,
            "message": row.message,
            "previous_outcome": row.previous_outcome,
            "outcome": row.outcome,
            "complaint_version": row.complaint_version,
            "timestamp": timestamp(row.timestamp),
        }
        for row in session.scalars(
            select(ReviewEvent)
            .where(ReviewEvent.complaint_id == case.complaint_id)
            .order_by(ReviewEvent.complaint_version)
        )
    ]


@router.get(
    "/complaints/{id}/review-history",
    operation_id="listCitizenReviewHistory",
    tags=["Citizen complaints"],
)
def citizen_history(id: str, user: CurrentUser, session: SessionDep):
    return history(session, own_case(session, user, id))


@router.get(
    "/officer/complaints/{id}/review-history",
    operation_id="listOfficerReviewHistory",
    tags=["Officer"],
)
def officer_history(id: str, user: CurrentUser, session: SessionDep):
    require_role(user, "Officer")
    case = locked_case(session, id)
    review_scope(session, user, case)
    return history(session, case)
