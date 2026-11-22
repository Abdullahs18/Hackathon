"""Explicit human help: scoped request, acknowledgment and response; never filing authority."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.audit import record_event
from app.case_policy import (
    EDITABLE,
    can_read_field,
    helper_scopes,
    locked_case,
    own_case,
    require_version,
    timestamp,
)
from app.models import AccessGrant, Consent, ReviewHelpRequest, User
from app.notifications import notify_case
from app.security import CurrentUser, SessionDep
from app.submission_policy import digest
from app.validation import validate_payload, validate_schema

router = APIRouter(prefix="/api/v1/complaints", tags=["Helper"])
Version = Annotated[str, Header(alias="If-Match", pattern=r'^"[1-9][0-9]*"$')]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
FIELDS = {
    "incident_type",
    "incident_date",
    "description",
    "scam_message",
    "platform",
    "money_lost",
    "amount",
    "currency",
    "payment_method",
    "transaction_reference",
    "suspect_details",
}
SHARED = ["case_status", *("incident_data." + field for field in sorted(FIELDS))]


def save(session):
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            409, "Review request conflicts with saved progress. Reload before retrying."
        ) from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Review save is uncertain. Recover the saved request before retrying."
        ) from None


def latest(session, case_id):
    return session.scalar(
        select(ReviewHelpRequest)
        .where(ReviewHelpRequest.complaint_id == case_id)
        .order_by(ReviewHelpRequest.requested_at.desc(), ReviewHelpRequest.request_id.desc())
        .limit(1)
    )


def scoped_helper(session, case, user):
    scopes = helper_scopes(session, user, case)
    if any(not can_read_field(scopes, field) for field in FIELDS):
        raise HTTPException(403, "Current permission for all requested review fields is required.")


def active(session, case, row):
    user = session.get(User, row.helper_id, populate_existing=True)
    if user is None or not user.active or user.role != "Helper":
        return False
    try:
        scoped_helper(session, case, user)
    except HTTPException as error:
        if error.status_code != 403:
            raise
        return False
    return True


def view(session, case, row):
    result = {
        "request_id": row.request_id,
        "complaint_id": row.complaint_id,
        "helper_id": row.helper_id,
        "requested_version": row.requested_version,
        "status": row.status,
        "access_active": active(session, case, row),
        "requested_at": timestamp(row.requested_at),
        "acknowledged_at": timestamp(row.acknowledged_at) if row.acknowledged_at else None,
        "responded_at": timestamp(row.responded_at) if row.responded_at else None,
        "note": row.note,
    }
    validate_schema("ReviewHelpRecord", result)
    return result


@router.get("/{id}/review-help", operation_id="getReviewHelp")
def inbox(id: str, user: CurrentUser, session: SessionDep):
    owner = user.role == "Citizen"
    case = own_case(session, user, id) if owner else locked_case(session, id)
    query = select(ReviewHelpRequest).where(ReviewHelpRequest.complaint_id == id)
    helpers = []
    if owner:
        helpers = [
            {"helper_id": value}
            for value in session.scalars(
                select(User.user_id)
                .where(User.active.is_(True), User.role == "Helper")
                .order_by(User.user_id)
                .limit(100)
            )
        ]
    else:
        scoped_helper(session, case, user)
        query = query.where(ReviewHelpRequest.helper_id == user.user_id)
    rows = session.scalars(
        query.order_by(
            ReviewHelpRequest.requested_at.desc(), ReviewHelpRequest.request_id.desc()
        ).limit(25)
    ).all()
    result = {
        "requests": [view(session, case, row) for row in rows],
        "helpers": helpers,
        "shared_fields": SHARED,
    }
    validate_schema("ReviewHelpInbox", result)
    return result


@router.post("/{id}/review-help", operation_id="requestReviewHelp")
def request_help(
    id: str,
    body: dict,
    user: CurrentUser,
    session: SessionDep,
    if_match: Version,
    idempotency_key: Key,
):
    case = own_case(session, user, id)
    validate_payload("ReviewHelpCreate", body)
    fingerprint = digest({"complaint_id": id, "body": body, "version": if_match})
    previous = session.scalar(
        select(ReviewHelpRequest).where(
            ReviewHelpRequest.citizen_id == user.user_id,
            ReviewHelpRequest.idempotency_key == idempotency_key,
        )
    )
    if previous is not None:
        if previous.complaint_id != id or previous.fingerprint != fingerprint:
            raise HTTPException(
                409, "Request key belongs to different content or a different case."
            )
        return view(session, case, previous)
    require_version(case, if_match)
    if case.current_status not in {"HUMAN_REVIEW", "NEEDS_INFORMATION"}:
        raise HTTPException(
            409, "Human help can be requested for a stopped or incomplete unfiled case."
        )
    helper = session.get(User, body["helper_id"], populate_existing=True)
    if helper is None or not helper.active or helper.role != "Helper":
        raise HTTPException(400, "Choose an active community Helper.")
    pending = latest(session, id)
    if (
        pending
        and pending.status in {"requested", "acknowledged"}
        and active(session, case, pending)
    ):
        if pending.helper_id != helper.user_id:
            raise HTTPException(
                409, "Withdraw the previous Helper's access before requesting another Helper."
            )
        if pending.requested_version == case.version:
            raise HTTPException(409, "A request is already pending. Read its saved progress.")
    if pending and pending.status in {"requested", "acknowledged"}:
        pending.status = "superseded"
    grant = session.get(AccessGrant, (id, helper.user_id))
    if grant is None:
        session.add(AccessGrant(complaint_id=id, helper_id=helper.user_id, active=True))
    else:
        grant.active = True
    consent = session.scalar(
        select(Consent).where(
            Consent.complaint_id == id,
            Consent.citizen_id == user.user_id,
            Consent.recipient == "user:" + helper.user_id,
            Consent.purpose == "helper_assistance",
            Consent.status == "granted",
        )
    )
    now = datetime.now(UTC)
    if consent is None:
        consent = Consent(
            consent_id=str(uuid4()),
            complaint_id=id,
            citizen_id=user.user_id,
            recipient="user:" + helper.user_id,
            purpose="helper_assistance",
            data_scopes=SHARED,
            status="granted",
            granted_at=now,
        )
        session.add(consent)
        action = "consent.granted"
    else:
        consent.data_scopes = SHARED
        consent.changed_at = now
        action = "consent.changed"
    row = ReviewHelpRequest(
        request_id=str(uuid4()),
        complaint_id=id,
        citizen_id=user.user_id,
        helper_id=helper.user_id,
        requested_version=case.version,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
        status="requested",
        requested_at=now,
    )
    session.add(row)
    record_event(
        session,
        action,
        user.user_id,
        "Citizen permitted named Helper incident review",
        complaint_id=id,
    )
    record_event(
        session,
        "helper.granted",
        user.user_id,
        "Citizen activated the named Helper grant",
        complaint_id=id,
    )
    record_event(
        session,
        "review_help.requested",
        user.user_id,
        "Citizen requested scoped human help",
        complaint_id=id,
    )
    notify_case(
        session,
        case,
        "review-help:" + row.request_id,
        "The citizen requested community Helper review. Final filing still needs citizen approval.",
    )
    result = view(session, case, row)
    save(session)
    return result


def target(session, user, case, request_id):
    scoped_helper(session, case, user)
    if case.current_status not in EDITABLE:
        raise HTTPException(
            409, "Helper review responses cannot change an already filed complaint."
        )
    row = latest(session, case.complaint_id)
    if (
        row is None
        or row.request_id != request_id
        or row.helper_id != user.user_id
        or row.status == "superseded"
    ):
        raise HTTPException(409, "Choose the current review request addressed to this Helper.")
    return row


@router.post("/{id}/review-help/acknowledge", operation_id="acknowledgeReviewHelp")
def acknowledge(id: str, body: dict, user: CurrentUser, session: SessionDep, if_match: Version):
    case = locked_case(session, id)
    validate_payload("ReviewHelpAction", body)
    row = target(session, user, case, body["request_id"])
    require_version(case, if_match)
    if row.status == "requested":
        row.status, row.acknowledged_at = "acknowledged", datetime.now(UTC)
        record_event(
            session,
            "review_help.acknowledged",
            user.user_id,
            "Named Helper acknowledged the request",
            complaint_id=id,
        )
        notify_case(
            session,
            case,
            "review-help:" + row.request_id + ":acknowledged",
            "The community Helper acknowledged your review request.",
        )
    result = view(session, case, row)
    save(session)
    return result


@router.post("/{id}/review-help/respond", operation_id="respondReviewHelp")
def respond(id: str, body: dict, user: CurrentUser, session: SessionDep, if_match: Version):
    case = locked_case(session, id)
    validate_payload("ReviewHelpReply", body)
    row = target(session, user, case, body["request_id"])
    require_version(case, if_match)
    note = body["note"].strip()
    if not note:
        raise HTTPException(400, "Write a review response.")
    if row.status == "completed":
        if row.note != note:
            raise HTTPException(
                409, "A saved response cannot be overwritten. Recover the existing response."
            )
        return view(session, case, row)
    if row.status != "acknowledged":
        raise HTTPException(409, "Acknowledge the request before sending a response.")
    row.note, row.responded_at, row.status = note, datetime.now(UTC), "completed"
    record_event(
        session,
        "review_help.responded",
        user.user_id,
        "Named Helper saved a review response",
        complaint_id=id,
    )
    notify_case(
        session,
        case,
        "review-help:" + row.request_id + ":responded",
        "Your community Helper sent a response. "
        "Review corrections and analyze again before filing.",
    )
    result = view(session, case, row)
    save(session)
    return result
