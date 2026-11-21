from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.audit import record_event
from app.case_policy import locked_case
from app.models import Notification
from app.notifications import permitted, view
from app.security import CurrentUser, SessionDep

router = APIRouter(prefix="/api/v1", tags=["Notifications"])


@router.get("/notifications", operation_id="listNotifications")
def list_notifications(user: CurrentUser, session: SessionDep):
    rows = session.scalars(
        select(Notification)
        .where(Notification.user_id == user.user_id)
        .order_by(Notification.timestamp.desc(), Notification.notification_id)
    ).all()
    allowed = {}
    for case_id in sorted({row.complaint_id for row in rows}):
        case = locked_case(session, case_id)
        allowed[case_id] = permitted(session, user, case)
    return [view(row) for row in rows if allowed[row.complaint_id]]


@router.post("/notifications/{id}/read", operation_id="readNotification")
def read_notification(id: str, user: CurrentUser, session: SessionDep):
    existing = session.get(Notification, id)
    if existing is None or existing.user_id != user.user_id:
        raise HTTPException(404, "Notification does not exist for this recipient.")
    case = locked_case(session, existing.complaint_id)
    if not permitted(session, user, case):
        raise HTTPException(403, "Current case access is required to read this notification.")
    row = session.scalar(
        select(Notification)
        .where(Notification.notification_id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not row.read:
        row.read = True
        record_event(
            session,
            "notification.read",
            user.user_id,
            "In-app notification marked read",
            complaint_id=case.complaint_id,
            details={"notification_id": id},
        )
    result = view(row)
    try:
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Read-marker save is uncertain. Recover notifications before retrying."
        ) from None
    return result
