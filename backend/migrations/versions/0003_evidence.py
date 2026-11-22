"""Private evidence metadata and upload retry identity."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "evidence",
        sa.Column("evidence_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("uploader_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("file_name", sa.String(200), nullable=False),
        sa.Column("file_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("verification_status", sa.String(40), nullable=False),
        sa.Column("storage_key", sa.String(40), nullable=False, unique=True),
        sa.Column("idempotency_key", sa.String(128)),
        sa.Column("request_fingerprint", sa.String(64)),
        sa.UniqueConstraint(
            "complaint_id", "uploader_id", "idempotency_key", name="uq_evidence_retry"
        ),
        sa.CheckConstraint("file_size > 0 AND file_size <= 10485760", name="ck_evidence_size"),
        sa.CheckConstraint(
            "verification_status = 'not_authenticity_verified'", name="ck_evidence_status"
        ),
    )
    op.create_index("ix_evidence_complaint_id", "evidence", ["complaint_id"])


def downgrade():
    # File deletion is deliberately not coupled to schema downgrade or audit history removal.
    op.drop_table("evidence")
