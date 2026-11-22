"""Citizen-requested Helper review, acknowledgment and durable response."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "review_help_requests",
        sa.Column("request_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("helper_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("requested_version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True)),
        sa.Column("responded_at", sa.DateTime(timezone=True)),
        sa.Column("note", sa.Text()),
        sa.UniqueConstraint("citizen_id", "idempotency_key", name="uq_review_help_key"),
        sa.CheckConstraint("requested_version >= 1", name="ck_review_help_version"),
        sa.CheckConstraint(
            "status IN ('requested','acknowledged','completed','superseded')",
            name="ck_review_help_status",
        ),
    )
    op.create_index(
        "ix_review_help_requests_complaint_id", "review_help_requests", ["complaint_id"]
    )


def downgrade():
    op.drop_index("ix_review_help_requests_complaint_id", table_name="review_help_requests")
    op.drop_table("review_help_requests")
