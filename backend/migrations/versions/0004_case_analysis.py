"""Persist validated case assessments without overwriting citizen incident data."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "case_analyses",
        sa.Column("analysis_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("input_version", sa.Integer(), nullable=False),
        sa.Column("result_version", sa.Integer(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("complaint_id", "input_version", name="uq_analysis_input_version"),
    )
    op.create_index("ix_case_analyses_complaint_id", "case_analyses", ["complaint_id"])


def downgrade():
    op.drop_table("case_analyses")
