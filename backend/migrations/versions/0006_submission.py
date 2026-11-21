"""Bound approvals, synthetic services, durable agent steps and single simulated filing."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    for name, size in [
        ("authorization_id", 36),
        ("agent_run_id", 36),
        ("submission_reference", 100),
    ]:
        op.add_column("complaints", sa.Column(name, sa.String(size), nullable=True))
    op.create_table(
        "mock_identities",
        sa.Column("identity_reference", sa.String(100), primary_key=True),
        sa.Column(
            "user_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False, unique=True
        ),
    )
    op.create_table(
        "mock_payments",
        sa.Column("transaction_reference", sa.String(128), primary_key=True),
        sa.Column("user_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("amount", sa.Double(), nullable=False),
        sa.Column("currency", sa.String(20), nullable=False),
        sa.Column("payment_method", sa.String(100)),
    )
    op.create_table(
        "mock_requirements",
        sa.Column("incident_type", sa.String(200), primary_key=True),
        sa.Column("requirements", sa.JSON(), nullable=False),
        sa.Column("available_fields", sa.JSON(), nullable=False),
    )
    op.create_table(
        "submission_authorizations",
        sa.Column("authorization_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column(
            "analysis_id", sa.String(36), sa.ForeignKey("case_analyses.analysis_id"), nullable=False
        ),
        sa.Column("reviewed_version", sa.Integer(), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("consent_snapshot", sa.JSON(), nullable=False),
        sa.Column("authorized_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("complaint_id", "reviewed_version", name="uq_review_approval"),
    )
    op.create_index(
        "ix_submission_authorizations_complaint_id", "submission_authorizations", ["complaint_id"]
    )
    op.create_table(
        "agent_runs",
        sa.Column("agent_run_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column(
            "authorization_id",
            sa.String(36),
            sa.ForeignKey("submission_authorizations.authorization_id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("next_step", sa.String(32), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("lease_token", sa.String(36)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("citizen_id", "idempotency_key", name="uq_agent_key"),
    )
    op.create_index("ix_agent_runs_complaint_id", "agent_runs", ["complaint_id"])
    op.create_table(
        "agent_tool_calls",
        sa.Column("call_id", sa.String(36), primary_key=True),
        sa.Column(
            "agent_run_id", sa.String(36), sa.ForeignKey("agent_runs.agent_run_id"), nullable=False
        ),
        sa.Column("step", sa.String(32), nullable=False),
        sa.Column("input", sa.JSON(), nullable=False),
        sa.Column("output", sa.JSON(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("agent_run_id", "step", name="uq_tool_step"),
    )
    op.create_index("ix_agent_tool_calls_agent_run_id", "agent_tool_calls", ["agent_run_id"])
    op.create_table(
        "mock_submissions",
        sa.Column("submission_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id",
            sa.String(36),
            sa.ForeignKey("complaints.complaint_id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column(
            "authorization_id",
            sa.String(36),
            sa.ForeignKey("submission_authorizations.authorization_id"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("transaction_fingerprint", sa.String(64)),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "destination_workspace_id",
            sa.String(100),
            sa.ForeignKey("workspaces.workspace_id"),
            nullable=False,
        ),
        sa.Column("rule_version_id", sa.String(100), nullable=False),
        sa.Column("submission_reference", sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("citizen_id", "idempotency_key", name="uq_submission_key"),
        sa.UniqueConstraint(
            "citizen_id", "transaction_fingerprint", name="uq_submitted_transaction"
        ),
    )


def downgrade():
    for table in [
        "mock_submissions",
        "agent_tool_calls",
        "agent_runs",
        "submission_authorizations",
        "mock_requirements",
        "mock_payments",
        "mock_identities",
    ]:
        op.drop_table(table)
    for field in ["submission_reference", "agent_run_id", "authorization_id"]:
        op.drop_column("complaints", field)
