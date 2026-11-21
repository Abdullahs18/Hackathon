import json
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import AuditLog


def record_event(
    session: Session,
    action: str,
    user_id: str | None,
    result: str,
    *,
    complaint_id: str | None = None,
    details: dict | None = None,
    rule_version_id: str | None = None,
) -> None:
    session.add(
        AuditLog(
            audit_log_id=str(uuid4()),
            complaint_id=complaint_id,
            user_id=user_id,
            agent_run_id=None,
            action=action,
            input=json.dumps(details, sort_keys=True) if details is not None else None,
            result=result,
            rule_version_id=rule_version_id,
            timestamp=datetime.now(UTC),
        )
    )
