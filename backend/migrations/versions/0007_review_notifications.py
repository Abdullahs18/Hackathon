"""Review conversation, legal outcomes and access-gated in-app notifications."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("complaints", sa.Column("review_outcome", sa.String(32), nullable=True))
    op.create_table(
        "review_events",
        sa.Column("event_id", sa.String(36), primary_key=True),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("actor_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("previous_outcome", sa.String(32), nullable=False),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("complaint_version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("actor_id", "idempotency_key", name="uq_review_command"),
        sa.UniqueConstraint("complaint_id", "complaint_version", name="uq_review_revision"),
    )
    op.create_index("ix_review_events_complaint_id", "review_events", ["complaint_id"])
    op.create_table(
        "notifications",
        sa.Column("notification_id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column(
            "complaint_id", sa.String(36), sa.ForeignKey("complaints.complaint_id"), nullable=False
        ),
        sa.Column("event_key", sa.String(160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("read", sa.Boolean(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "event_key", name="uq_notification_event"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_complaint_id", "notifications", ["complaint_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION dastak_reject_review_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'review_events is append-only'; END;
            $$ LANGUAGE plpgsql""")
        op.execute("""CREATE TRIGGER review_events_immutable
            BEFORE UPDATE OR DELETE OR TRUNCATE ON review_events
            FOR EACH STATEMENT EXECUTE FUNCTION dastak_reject_review_mutation()""")
    else:
        for action in ["UPDATE", "DELETE"]:
            op.execute(f"""CREATE TRIGGER review_events_no_{action.lower()}
                BEFORE {action} ON review_events
                BEGIN SELECT RAISE(ABORT, 'review_events is append-only'); END""")


def downgrade():
    op.drop_table("notifications")
    op.drop_table("review_events")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION dastak_reject_review_mutation()")
    op.drop_column("complaints", "review_outcome")
