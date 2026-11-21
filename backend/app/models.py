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
    # Historical logical reference: the routing resolver fails closed on unknown legacy pins.
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
    authorization_id: Mapped[str | None] = mapped_column(String(36))
    agent_run_id: Mapped[str | None] = mapped_column(String(36))
    submission_reference: Mapped[str | None] = mapped_column(String(100))
    review_outcome: Mapped[str | None] = mapped_column(String(32))


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


class RoutingCatalog(Base):
    __tablename__ = "routing_catalog"
    __table_args__ = (
        CheckConstraint("catalog_id = 1", name="ck_routing_catalog_singleton"),
        CheckConstraint("generation >= 1", name="ck_routing_generation"),
    )
    catalog_id: Mapped[int] = mapped_column(primary_key=True)
    generation: Mapped[int]


class RoutingVersion(Base):
    __tablename__ = "routing_rule_versions"
    rule_version_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Logical parent avoids cyclic insertion and preserves snapshots independently of a pointer.
    rule_id: Mapped[str] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(200))
    incident_type: Mapped[str] = mapped_column(String(200), index=True)
    destination_workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    priority: Mapped[int]
    active: Mapped[bool]
    explanation: Mapped[str] = mapped_column(Text)
    justification: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RoutingRule(Base):
    __tablename__ = "routing_rules"
    __table_args__ = (
        UniqueConstraint("creator_id", "create_idempotency_key", name="uq_rule_create_key"),
    )
    rule_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    rule_version_id: Mapped[str] = mapped_column(
        ForeignKey("routing_rule_versions.rule_version_id")
    )
    creator_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    create_idempotency_key: Mapped[str | None] = mapped_column(String(128))
    create_fingerprint: Mapped[str | None] = mapped_column(String(64))


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


class MockIdentity(Base):
    __tablename__ = "mock_identities"
    identity_reference: Mapped[str] = mapped_column(String(100), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), unique=True)


class MockPayment(Base):
    __tablename__ = "mock_payments"
    transaction_reference: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    amount: Mapped[float]
    currency: Mapped[str] = mapped_column(String(20))
    payment_method: Mapped[str | None] = mapped_column(String(100))


class MockRequirements(Base):
    __tablename__ = "mock_requirements"
    incident_type: Mapped[str] = mapped_column(String(200), primary_key=True)
    requirements: Mapped[list] = mapped_column(JSON)
    available_fields: Mapped[list] = mapped_column(JSON)


class SubmissionAuthorization(Base):
    __tablename__ = "submission_authorizations"
    __table_args__ = (
        UniqueConstraint("complaint_id", "reviewed_version", name="uq_review_approval"),
    )
    authorization_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    analysis_id: Mapped[str] = mapped_column(ForeignKey("case_analyses.analysis_id"))
    reviewed_version: Mapped[int]
    expected_version: Mapped[int]
    payload: Mapped[dict] = mapped_column(JSON)
    fingerprint: Mapped[str] = mapped_column(String(64))
    consent_snapshot: Mapped[dict] = mapped_column(JSON)
    authorized_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (UniqueConstraint("citizen_id", "idempotency_key", name="uq_agent_key"),)
    agent_run_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    authorization_id: Mapped[str] = mapped_column(
        ForeignKey("submission_authorizations.authorization_id"), unique=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(128))
    fingerprint: Mapped[str] = mapped_column(String(64))
    next_step: Mapped[str] = mapped_column(String(32))
    state: Mapped[dict] = mapped_column(JSON)
    lease_token: Mapped[str | None] = mapped_column(String(36))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"
    __table_args__ = (UniqueConstraint("agent_run_id", "step", name="uq_tool_step"),)
    call_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    agent_run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.agent_run_id"), index=True)
    step: Mapped[str] = mapped_column(String(32))
    input: Mapped[dict] = mapped_column(JSON)
    output: Mapped[dict] = mapped_column(JSON)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MockSubmission(Base):
    __tablename__ = "mock_submissions"
    __table_args__ = (
        UniqueConstraint("citizen_id", "idempotency_key", name="uq_submission_key"),
        UniqueConstraint("citizen_id", "transaction_fingerprint", name="uq_submitted_transaction"),
    )
    submission_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), unique=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    authorization_id: Mapped[str] = mapped_column(
        ForeignKey("submission_authorizations.authorization_id")
    )
    idempotency_key: Mapped[str] = mapped_column(String(128))
    fingerprint: Mapped[str] = mapped_column(String(64))
    transaction_fingerprint: Mapped[str | None] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    destination_workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    rule_version_id: Mapped[str] = mapped_column(String(100))
    submission_reference: Mapped[str] = mapped_column(String(100), unique=True)
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


class ReviewEvent(Base):
    __tablename__ = "review_events"
    __table_args__ = (
        UniqueConstraint("actor_id", "idempotency_key", name="uq_review_command"),
        UniqueConstraint("complaint_id", "complaint_version", name="uq_review_revision"),
    )
    event_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    action: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    previous_outcome: Mapped[str] = mapped_column(String(32))
    outcome: Mapped[str] = mapped_column(String(32))
    complaint_version: Mapped[int]
    idempotency_key: Mapped[str] = mapped_column(String(128))
    fingerprint: Mapped[str] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("user_id", "event_key", name="uq_notification_event"),)
    notification_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.complaint_id"), index=True)
    event_key: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ApiKey(Base):
    __tablename__ = "api_keys"
    __table_args__ = (
        CheckConstraint("principal_id = issued_by", name="ck_api_key_self_issued"),
        UniqueConstraint("issued_by", "create_idempotency_key", name="uq_api_key_command"),
    )
    api_key_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    principal_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    issued_by: Mapped[str] = mapped_column(ForeignKey("users.user_id"))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    scopes: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    create_idempotency_key: Mapped[str] = mapped_column(String(128))
    create_fingerprint: Mapped[str] = mapped_column(String(64))
