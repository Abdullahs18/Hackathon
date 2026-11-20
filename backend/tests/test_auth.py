from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.security import issue_token
from tests.conftest import DEMO_PASSWORD


@pytest.mark.parametrize(
    "user_id,role,workspace",
    [
        ("demo-citizen-1", "Citizen", None),
        ("demo-helper", "Helper", None),
        ("demo-admin", "Admin", None),
        ("demo-officer-financial", "Officer", "mock-financial-fraud"),
        ("demo-officer-digital", "Officer", "mock-digital-safety"),
    ],
)
def test_login_and_me(client, auth, user_id, role, workspace):
    response = client.get("/api/v1/auth/me", headers=auth(user_id))
    assert response.status_code == 200
    assert response.json() == {"user_id": user_id, "role": role, "workspace_id": workspace}
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Request-ID"]


@pytest.mark.parametrize(
    "payload",
    [
        {"user_id": "demo-admin", "password": "wrong"},
        {"user_id": "unknown", "password": DEMO_PASSWORD},
    ],
)
def test_bad_credentials_are_generic(client, payload):
    response = client.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 401
    assert response.json() == {
        "error": "unauthorized",
        "detail": "Valid authentication is required.",
    }
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Bearer invalid"}, {"X-API-Key": "not-yet-supported"}]
)
def test_missing_invalid_or_unimplemented_key_fails_closed(client, headers):
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


@pytest.mark.parametrize("change", ["expired", "audience", "issuer", "signature", "missing_exp"])
def test_invalid_jwt(client, settings, change):
    now = datetime.now(UTC)
    payload = {
        "sub": "demo-admin",
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=1),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    secret = settings.jwt_secret.get_secret_value()
    if change == "expired":
        payload["exp"] = now - timedelta(seconds=1)
    elif change == "audience":
        payload["aud"] = "other-service"
    elif change == "issuer":
        payload["iss"] = "other-issuer"
    elif change == "signature":
        secret = "wrong-signing-secret-with-at-least-32-characters"
    else:
        del payload["exp"]
    token = jwt.encode(payload, secret, algorithm="HS256")
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code
        == 401
    )


def test_role_change_and_deactivation_take_effect_without_new_token(client, app, auth):
    headers = auth()
    with Session(app.state.engine) as session, session.begin():
        session.get(User, "demo-admin").role = "Citizen"
    assert client.get("/api/v1/admin/users", headers=headers).status_code == 403
    with Session(app.state.engine) as session, session.begin():
        session.get(User, "demo-admin").active = False
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_unknown_token_subject(client, settings):
    token = issue_token("nonexistent-account", settings)
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code
        == 401
    )


def test_validation_does_not_echo_password(client):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "user_id": 1,
            "password": DEMO_PASSWORD,
            "role": "Admin",
        },
    )
    assert response.status_code == 400
    assert DEMO_PASSWORD not in response.text
    assert set(response.json()) == {"error", "detail"}


def test_login_rate_limit(client, app):
    app.state.login_limiter.limit = 2
    for _ in range(2):
        assert (
            client.post(
                "/api/v1/auth/login", json={"user_id": "unknown", "password": "bad"}
            ).status_code
            == 401
        )
    response = client.post("/api/v1/auth/login", json={"user_id": "unknown", "password": "bad"})
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"


def test_login_audit_does_not_contain_credentials(client, app, auth):
    auth()
    client.post("/api/v1/auth/login", json={"user_id": "demo-admin", "password": "wrong"})
    with Session(app.state.engine) as session:
        rows = session.scalars(select(AuditLog).order_by(AuditLog.timestamp)).all()
        assert [row.action for row in rows] == ["auth.login", "auth.login_denied"]
        assert all(row.input is None for row in rows)
        assert all(DEMO_PASSWORD not in (row.result or "") for row in rows)
