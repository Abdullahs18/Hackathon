import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.main import create_app
from app.seed import seed

DEMO_PASSWORD = "synthetic-test-password"
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture
def settings(tmp_path, monkeypatch):
    # TEST_DATABASE_URL is exclusively for a disposable PostgreSQL test database.
    url = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("DASTAK_DATABASE_URL", url)
    monkeypatch.setenv("DASTAK_JWT_SECRET", "test-only-secret-with-at-least-32-characters")
    return Settings(
        _env_file=None, login_attempts_per_minute=100, evidence_dir=tmp_path / "evidence"
    )


@pytest.fixture
def app(settings):
    config = Config(str(BACKEND / "alembic.ini"))
    command.upgrade(config, "head")
    application = create_app(settings)
    with Session(application.state.engine) as session, session.begin():
        seed(session, DEMO_PASSWORD)
    yield application
    application.state.engine.dispose()
    command.downgrade(config, "base")


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth(client):
    def headers(user_id="demo-admin"):
        response = client.post(
            "/api/v1/auth/login",
            json={
                "user_id": user_id,
                "password": DEMO_PASSWORD,
            },
        )
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return headers
