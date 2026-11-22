"""Durable voice proposals and private version-bound spoken output; no raw audio retention."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def common():
    return [
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("citizen_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("error_code", sa.String(40)),
        sa.Column("consent_snapshot", sa.JSON(), nullable=False),
        sa.Column("lease_token", sa.String(36)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade():
    op.create_table(
        "voice_turns",
        sa.Column("voice_turn_id", sa.String(36), primary_key=True),
        *common(),
        sa.Column("input_version", sa.Integer(), nullable=False),
        sa.Column("next_step", sa.String(16), nullable=False),
        sa.Column("transcript", sa.Text()),
        sa.Column("confirmed_transcript", sa.Text()),
        sa.Column("extraction", sa.JSON(none_as_null=True)),
        sa.Column("model", sa.String(200)),
        sa.Column("applied_version", sa.Integer()),
        sa.Column("confirmation_fingerprint", sa.String(64)),
        sa.UniqueConstraint("citizen_id", "idempotency_key", name="uq_voice_request"),
    )
    op.create_index("ix_voice_turns_complaint_id", "voice_turns", ["complaint_id"])
    op.create_table(
        "case_speech",
        sa.Column("speech_id", sa.String(36), primary_key=True),
        *common(),
        sa.Column("case_version", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("text_ur", sa.Text(), nullable=False),
        sa.Column("audio_data", sa.LargeBinary()),
        sa.Column("voice_turn_id", sa.String(36), sa.ForeignKey("voice_turns.voice_turn_id")),
        sa.Column("audio_sha256", sa.String(64)),
        sa.UniqueConstraint("citizen_id", "idempotency_key", name="uq_speech_request"),
    )
    op.create_index("ix_case_speech_complaint_id", "case_speech", ["complaint_id"])


def downgrade():
    op.drop_table("case_speech")
    op.drop_table("voice_turns")
