from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import AuditLog


def record_event(session: Session, action: str, user_id: str | None, result: str) -> None:
    session.add(
        AuditLog(
            audit_log_id=str(uuid4()),
            complaint_id=None,
            user_id=user_id,
            agent_run_id=None,
            action=action,
            input=None,
            result=result,
            rule_version_id=None,
            timestamp=datetime.now(UTC),
        )
    )
