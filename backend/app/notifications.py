"""Generic messages; current case permission gates generation and every later read."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.case_policy import helper_scopes, officer_scopes, timestamp
from app.models import AccessGrant, CaseAssignment, Notification, User


def permitted(session, user, case):
    if not user.active:
        return False
    if user.role == "Citizen":
        return user.user_id == case.citizen_id
    try:
        if user.role == "Helper":
            helper_scopes(session, user, case)
            return True
        if user.role == "Officer":
            officer_scopes(session, user, case)
            return True
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
    return False


def notify_case(session, case, event_key, message):
    # Caller holds the case lock and commits these rows together with the triggering event.
    # Flush pending grants/assignments before checking current access. Map conflicts here,
    # since recipient queries would otherwise autoflush before the endpoint's commit guard.
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Operation conflicts with existing records.") from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Save is uncertain. Recover current records before retrying."
        ) from None
    ids = {case.citizen_id}
    ids.update(
        session.scalars(
            select(AccessGrant.helper_id).where(
                AccessGrant.complaint_id == case.complaint_id, AccessGrant.active.is_(True)
            )
        )
    )
    assignment = session.get(CaseAssignment, case.complaint_id, populate_existing=True)
    if assignment is not None:
        ids.add(assignment.officer_id)
    for user_id in sorted(ids):
        user = session.get(User, user_id, populate_existing=True)
        if user is None or not permitted(session, user, case):
            continue
        existing = session.scalar(
            select(Notification.notification_id).where(
                Notification.user_id == user_id, Notification.event_key == event_key
            )
        )
        if existing is None:
            session.add(
                Notification(
                    notification_id=str(uuid4()),
                    user_id=user_id,
                    complaint_id=case.complaint_id,
                    event_key=event_key,
                    message=message,
                    read=False,
                    timestamp=datetime.now(UTC),
                )
            )


def view(row):
    return {
        "notification_id": row.notification_id,
        "user_id": row.user_id,
        "complaint_id": row.complaint_id,
        "message": row.message,
        "read": row.read,
        "timestamp": timestamp(row.timestamp),
    }
