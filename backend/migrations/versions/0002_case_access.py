"""Complaint drafts, helper grants, officer assignments and current consent."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "complaints",
        sa.Column("complaint_id", sa.String(36), primary_key=True),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column(
            "destination_workspace_id", sa.String(100), sa.ForeignKey("workspaces.workspace_id")
        ),
        sa.Column("rule_version_id", sa.String(100)),
        sa.Column("current_status", sa.String(40), nullable=False),
        sa.Column("incident_type", sa.String(200)),
        sa.Column("incident_data", sa.JSON(), nullable=False),
        sa.Column("complaint_draft", sa.JSON(none_as_null=True)),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("create_idempotency_key", sa.String(128)),
        sa.Column("create_fingerprint", sa.String(64)),
        sa.UniqueConstraint("citizen_id", "create_idempotency_key", name="uq_complaint_create_key"),
        sa.CheckConstraint("version >= 1", name="ck_complaint_version"),
    )
    op.create_index("ix_complaints_citizen_id", "complaints", ["citizen_id"])
    op.create_table(
        "complaint_access_grants",
        sa.Column(
            "complaint_id",
            sa.String(36),
            sa.ForeignKey("complaints.complaint_id"),
            primary_key=True,
        ),
        sa.Column("helper_id", sa.String(100), sa.ForeignKey("users.user_id"), primary_key=True),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "case_assignments",
        sa.Column(
            "complaint_id",
            sa.String(36),
            sa.ForeignKey("complaints.complaint_id"),
            primary_key=True,
        ),
        sa.Column("officer_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column(
            "workspace_id", sa.String(100), sa.ForeignKey("workspaces.workspace_id"), nullable=False
        ),
    )
    op.create_index("ix_case_assignments_officer_id", "case_assignments", ["officer_id"])
    op.create_table(
        "consents",
        sa.Column("consent_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("recipient", sa.String(150), nullable=False),
        sa.Column("purpose", sa.String(40), nullable=False),
        sa.Column("data_scopes", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True)),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('granted', 'withdrawn')", name="ck_consent_status"),
    )
    op.create_index("ix_consents_complaint_id", "consents", ["complaint_id"])
    op.create_index(
        "uq_active_consent",
        "consents",
        ["complaint_id", "recipient", "purpose"],
        unique=True,
        postgresql_where=sa.text("status = 'granted'"),
        sqlite_where=sa.text("status = 'granted'"),
    )


def downgrade():
    op.drop_table("consents")
    op.drop_table("case_assignments")
    op.drop_table("complaint_access_grants")
    op.drop_table("complaints")
