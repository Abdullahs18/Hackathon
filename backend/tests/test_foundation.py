from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import DatabaseError
from sqlalchemy.orm import Session

from app.audit import record_event
from app.models import User, Workspace
from app.seed import seed
from tests.conftest import BACKEND


def test_health_and_readiness(client):
    for path in ["/api/v1/health", "/api/v1/health/ready"]:
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "simulated": True}


def test_missing_tables_are_not_ready(settings):
    # The fixture settings have no migration until app/client is requested.
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health").status_code == 200
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert "SELECT" not in response.text


def test_unexpected_errors_are_sanitized(client, app):
    from app.db import get_session

    def fail_database():
        raise RuntimeError("private-database-parameter")

    app.dependency_overrides[get_session] = fail_database
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 500
    assert response.json() == {"error": "internal_error", "detail": "An unexpected error occurred."}
    assert response.headers["X-Request-ID"]
    assert "private-database-parameter" not in response.text


def test_seed_is_repeatable_and_preserves_password(app):
    with Session(app.state.engine) as session, session.begin():
        before = session.get(User, "demo-admin").password_hash
        seed(session, "different-synthetic-password")
        assert session.scalar(select(func.count()).select_from(User)) == 6
        assert session.scalar(select(func.count()).select_from(Workspace)) == 2
        assert session.get(User, "demo-admin").password_hash == before


def test_migrations_match_models_and_repeat_upgrade(app):
    config = Config(str(BACKEND / "alembic.ini"))
    command.upgrade(config, "head")
    command.check(config)


def test_audit_mutation_is_rejected_at_database(app):
    import pytest

    with Session(app.state.engine) as session, session.begin():
        record_event(session, "test.event", "demo-admin", "Synthetic event")
    for statement in ["UPDATE audit_logs SET result = 'changed'", "DELETE FROM audit_logs"]:
        with Session(app.state.engine) as session:
            with pytest.raises(DatabaseError):
                session.execute(text(statement))
            session.rollback()
    if app.state.engine.dialect.name == "postgresql":
        with Session(app.state.engine) as session:
            with pytest.raises(DatabaseError):
                session.execute(text("TRUNCATE audit_logs"))
            session.rollback()
