from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Workspace(Base):
    __tablename__ = "workspaces"
    workspace_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('Citizen', 'Helper', 'Officer', 'Admin')", name="ck_user_role"),
        CheckConstraint(
            "role != 'Officer' OR workspace_id IS NOT NULL", name="ck_officer_workspace"
        ),
    )
    user_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    workspace_id: Mapped[str | None] = mapped_column(ForeignKey("workspaces.workspace_id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    audit_log_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Complaint/agent foreign keys are added when their tables are introduced.
    complaint_id: Mapped[str | None] = mapped_column(String(100))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"))
    agent_run_id: Mapped[str | None] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    input: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    rule_version_id: Mapped[str | None] = mapped_column(String(100))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
