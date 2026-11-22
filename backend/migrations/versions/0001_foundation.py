"""Users, seeded workspace structure, and append-only audit foundation."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workspaces",
        sa.Column("workspace_id", sa.String(100), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("user_id", sa.String(100), primary_key=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("workspace_id", sa.String(100), sa.ForeignKey("workspaces.workspace_id")),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "role IN ('Citizen', 'Helper', 'Officer', 'Admin')", name="ck_user_role"
        ),
        sa.CheckConstraint(
            "role != 'Officer' OR workspace_id IS NOT NULL", name="ck_officer_workspace"
        ),
    )
    op.create_table(
        "audit_logs",
        sa.Column("audit_log_id", sa.String(36), primary_key=True),
        sa.Column("complaint_id", sa.String(100)),
        sa.Column("user_id", sa.String(100), sa.ForeignKey("users.user_id")),
        sa.Column("agent_run_id", sa.String(100)),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("input", sa.Text()),
        sa.Column("result", sa.Text()),
        sa.Column("rule_version_id", sa.String(100)),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""
            CREATE FUNCTION dastak_reject_audit_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
            $$ LANGUAGE plpgsql
        """)
        op.execute("""
            CREATE TRIGGER audit_logs_append_only
            BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
            FOR EACH STATEMENT EXECUTE FUNCTION dastak_reject_audit_mutation()
        """)
    else:
        op.execute("""CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
                   BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END""")
        op.execute("""CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
                   BEGIN SELECT RAISE(ABORT, 'audit_logs is append-only'); END""")


def downgrade():
    op.drop_table("audit_logs")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION dastak_reject_audit_mutation()")
    op.drop_table("users")
    op.drop_table("workspaces")
