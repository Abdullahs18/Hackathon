"""Immutable routing snapshots, current pointers and serialized catalog updates."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "routing_catalog",
        sa.Column("catalog_id", sa.Integer(), primary_key=True),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.CheckConstraint("catalog_id = 1", name="ck_routing_catalog_singleton"),
        sa.CheckConstraint("generation >= 1", name="ck_routing_generation"),
    )
    op.execute("INSERT INTO routing_catalog (catalog_id, generation) VALUES (1, 1)")
    op.create_table(
        "routing_rule_versions",
        sa.Column("rule_version_id", sa.String(36), primary_key=True),
        sa.Column("rule_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("incident_type", sa.String(200), nullable=False),
        sa.Column(
            "destination_workspace_id",
            sa.String(100),
            sa.ForeignKey("workspaces.workspace_id"),
            nullable=False,
        ),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    for field in ["rule_id", "incident_type"]:
        op.create_index(f"ix_routing_rule_versions_{field}", "routing_rule_versions", [field])
    op.create_table(
        "routing_rules",
        sa.Column("rule_id", sa.String(36), primary_key=True),
        sa.Column(
            "rule_version_id",
            sa.String(36),
            sa.ForeignKey("routing_rule_versions.rule_version_id"),
            nullable=False,
        ),
        sa.Column("creator_id", sa.String(100), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("create_idempotency_key", sa.String(128)),
        sa.Column("create_fingerprint", sa.String(64)),
        sa.UniqueConstraint("creator_id", "create_idempotency_key", name="uq_rule_create_key"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION dastak_reject_rule_version_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'routing_rule_versions is immutable'; END;
            $$ LANGUAGE plpgsql""")
        op.execute("""CREATE TRIGGER routing_versions_immutable
            BEFORE UPDATE OR DELETE OR TRUNCATE ON routing_rule_versions
            FOR EACH STATEMENT EXECUTE FUNCTION dastak_reject_rule_version_mutation()""")
    else:
        for action in ["UPDATE", "DELETE"]:
            op.execute(f"""CREATE TRIGGER routing_versions_no_{action.lower()}
                BEFORE {action} ON routing_rule_versions
                BEGIN SELECT RAISE(ABORT, 'routing_rule_versions is immutable'); END""")


def downgrade():
    op.drop_table("routing_rules")
    op.drop_table("routing_rule_versions")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION dastak_reject_rule_version_mutation()")
    op.drop_table("routing_catalog")
