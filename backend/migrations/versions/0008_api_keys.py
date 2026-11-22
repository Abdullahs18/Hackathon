"""Hashed, principal-bound, expiring and revocable scoped API keys."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "api_keys",
        sa.Column("api_key_id", sa.String(36), primary_key=True),
        sa.Column("principal_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("issued_by", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("create_idempotency_key", sa.String(128), nullable=False),
        sa.Column("create_fingerprint", sa.String(64), nullable=False),
        sa.UniqueConstraint("issued_by", "create_idempotency_key", name="uq_api_key_command"),
        sa.CheckConstraint("principal_id = issued_by", name="ck_api_key_self_issued"),
    )
    op.create_index("ix_api_keys_principal_id", "api_keys", ["principal_id"])


def downgrade():
    op.drop_table("api_keys")
