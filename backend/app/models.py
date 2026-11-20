from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
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
    # Logical historical references: preserve append-only audit rows independently of case archival.
    complaint_id: Mapped[str | None] = mapped_column(String(100))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.user_id"))
    agent_run_id: Mapped[str | None] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    input: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    rule_version_id: Mapped[str | None] = mapped_column(String(100))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        UniqueConstraint("citizen_id", "create_idempotency_key", name="uq_complaint_create_key"),
        CheckConstraint("version >= 1", name="ck_complaint_version"),
    )
    complaint_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    destination_workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.workspace_id")
    )
    # Foreign key to immutable routing versions is introduced with the routing engine.
    rule_version_id: Mapped[str | None] = mapped_column(String(100))
    current_status: Mapped[str] = mapped_column(String(40), default="DRAFT")
    incident_type: Mapped[str | None] = mapped_column(String(200))
    incident_data: Mapped[dict] = mapped_column(JSON)
    complaint_draft: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    create_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    create_fingerprint: Mapped[str | None] = mapped_column(String(64))


class AccessGrant(Base):
    __tablename__ = "complaint_access_grants"
    complaint_id: Mapped[str] = mapped_column(
        ForeignKey("complaints.complaint_id"), primary_key=True
    )
    helper_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean)


class CaseAssignment(Base):
    __tablename__ = "case_assignments"
    complaint_id: Mapped[str] = mapped_column(
        ForeignKey("complaints.complaint_id"), primary_key=True
    )
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (
        CheckConstraint("status IN ('granted', 'withdrawn')", name="ck_consent_status"),
        Index(
            "uq_active_consent",
            "complaint_id",
            "recipient",
            "purpose",
            unique=True,
            postgresql_where=text("status = 'granted'"),
            sqlite_where=text("status = 'granted'"),
        ),
    )
    consent_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    recipient: Mapped[str] = mapped_column(String(150))
    purpose: Mapped[str] = mapped_column(String(40))
    data_scopes: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CaseAnalysis(Base):
    __tablename__ = "case_analyses"
    __table_args__ = (
        UniqueConstraint("complaint_id", "input_version", name="uq_analysis_input_version"),
    )
    analysis_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    input_version: Mapped[int]
    result_version: Mapped[int]
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (
        UniqueConstraint(
            "complaint_id", "uploader_id", "idempotency_key", name="uq_evidence_retry"
        ),
        CheckConstraint("file_size > 0 AND file_size <= 10485760", name="ck_evidence_size"),
        CheckConstraint(
            "verification_status = 'not_authenticity_verified'", name="ck_evidence_status"
        ),
    )
    evidence_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    file_name: Mapped[str] = mapped_column(String(200))
    file_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column()
    sha256: Mapped[str] = mapped_column(String(64))
    verification_status: Mapped[str] = mapped_column(String(40))
    storage_key: Mapped[str] = mapped_column(String(40), unique=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128))
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
