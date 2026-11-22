import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.key_policy import OPERATION_SCOPES, recheck_key
from app.models import ApiKey, AuditLog, MockSubmission, User
from tests.conftest import BACKEND
from tests.test_cases import assign, give_consent, give_helper
from tests.test_contract import SPEC, assert_response
from tests.test_evidence import upload
from tests.test_submission import (
    approved,
    case_factory,
    owner,
    provider,
    ready,
    ready_factory,
    submit,
)

__all__ = ["approved", "case_factory", "owner", "provider", "ready", "ready_factory"]


@pytest.fixture
def key_factory(client, auth):
    def create(principal="demo-citizen-1", scopes=None, **changes):
        path = "/api/v1/admin/api-keys" if principal == "demo-admin" else "/api/v1/api-keys"
        response = client.post(
            path,
            headers={**auth(principal), "Idempotency-Key": str(uuid4())},
            json={
                "scopes": scopes or ["complaints:read"],
                "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
                **changes,
            },
        )
        assert response.status_code == 201, response.text
        assert_response(response, path, "post")
        return response.json()

    return create


def credential(key):
    return {"X-API-Key": key["api_key"]}


def test_key_hash_principal_scope_and_redacted_metadata(
    client, key_factory, app, case_factory, auth
):
    case = case_factory()
    key = key_factory()
    headers = credential(key)
    assert client.get("/api/v1/auth/me", headers=headers).json()["user_id"] == "demo-citizen-1"
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=headers).status_code == 200
    )
    assert (
        client.patch(
            f"/api/v1/complaints/{case['complaint_id']}", headers=headers, json={"amount": 2000}
        ).status_code
        == 403
    )
    assert client.get("/api/v1/admin/users", headers=headers).status_code == 403
    metadata = client.get("/api/v1/admin/api-keys", headers=auth())
    assert_response(metadata, "/api/v1/admin/api-keys", "get")
    assert all(
        name not in metadata.text
        for name in [
            key["api_key"],
            "key_hash",
            "principal_id",
            "issued_by",
            "create_fingerprint",
            "create_idempotency_key",
        ]
    )
    with Session(app.state.engine) as session:
        row = session.get(ApiKey, key["api_key_id"])
        assert row.principal_id == "demo-citizen-1"
        assert row.key_hash == hashlib.sha256(key["api_key"].encode()).hexdigest()
        assert key["api_key"] not in str(row.__dict__)
        assert key["api_key"] not in " ".join(
            (a.input or "") + (a.result or "") for a in session.scalars(select(AuditLog))
        )


def test_keys_do_not_bypass_case_ownership_or_consent(client, key_factory, case_factory, owner):
    case = case_factory()
    other = key_factory(principal="demo-citizen-2")
    assert (
        client.get(
            f"/api/v1/complaints/{case['complaint_id']}", headers=credential(other)
        ).status_code
        == 403
    )
    helper = key_factory(principal="demo-helper", scopes=["helper:access"])
    assert client.get("/api/v1/helper/complaints", headers=credential(helper)).json() == []
    give_helper(client, owner, case["complaint_id"])
    consent = give_consent(client, owner, case["complaint_id"], ["case_status"])
    assert len(client.get("/api/v1/helper/complaints", headers=credential(helper)).json()) == 1
    assert (
        client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner).status_code
        == 200
    )
    assert client.get("/api/v1/helper/complaints", headers=credential(helper)).json() == []


def test_shared_evidence_operations_use_role_scopes_and_current_case_grants(
    client, key_factory, case_factory, owner
):
    case = case_factory()
    attached = upload(client, owner, case)
    assert attached.status_code == 201
    helper = credential(key_factory(principal="demo-helper", scopes=["helper:access"]))
    path = (
        f"/api/v1/complaints/{case['complaint_id']}/evidence/"
        f"{attached.json()['evidence_id']}/content"
    )
    assert client.get(path, headers=helper).status_code == 403
    give_helper(client, owner, case["complaint_id"])
    give_consent(client, owner, case["complaint_id"], ["case_status", "evidence"])
    assert client.get(path, headers=helper).status_code == 200
    assert upload(client, helper, case, name="supplement.png").status_code == 201


@pytest.mark.parametrize(
    "change", ["expired", "revoked", "inactive", "role_changed", "wrong_secret"]
)
def test_current_key_and_account_state_are_enforced(client, key_factory, app, change):
    key = key_factory()
    if change == "wrong_secret":
        key["api_key"] = key["api_key"][:-1] + ("A" if key["api_key"][-1] != "A" else "B")
    else:
        with Session(app.state.engine) as session, session.begin():
            row = session.get(ApiKey, key["api_key_id"])
            if change == "expired":
                row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            elif change == "revoked":
                row.revoked = True
            elif change == "inactive":
                session.get(User, "demo-citizen-1").active = False
            else:
                session.get(User, "demo-citizen-1").role = "Admin"
    result = client.get("/api/v1/complaints", headers=credential(key))
    assert result.status_code == (403 if change == "role_changed" else 401), result.text


def test_ambiguous_credentials_and_malformed_keys_are_rejected(client, key_factory, owner):
    key = key_factory()
    assert client.get("/api/v1/auth/me", headers={**owner, **credential(key)}).status_code == 401
    for raw in ["", "wrong", "dastak_" + "0" * 32 + "." + "A" * 43]:
        assert client.get("/api/v1/auth/me", headers={"X-API-Key": raw}).status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {"expires_at": "not-a-date"},
        {"expires_at": "2026-01-01T10:00:00"},
        {"expires_at": "2020-01-01T00:00:00Z"},
        {"expires_at": "2099-01-01T00:00:00Z"},
        {"scopes": ["admin:users"], "principal_id": "demo-citizen-1"},
        {"scopes": ["arbitrary:scope"]},
        {"principal_id": "unknown"},
    ],
)
def test_invalid_issuance_is_rejected(client, auth, body):
    result = client.post(
        "/api/v1/admin/api-keys",
        headers={**auth(), "Idempotency-Key": str(uuid4())},
        json={
            "scopes": ["admin:audit"],
            "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            **body,
        },
    )
    assert result.status_code == 400, result.text


def test_only_admin_jwt_can_issue_and_api_key_cannot_escalate(client, auth, key_factory):
    body = {
        "scopes": ["admin:users"],
        "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    admin_key = key_factory(principal="demo-admin", scopes=["admin:api_keys"])
    assert (
        client.post(
            "/api/v1/admin/api-keys",
            headers={**credential(admin_key), "Idempotency-Key": "escalation"},
            json=body,
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/admin/api-keys",
            headers={**auth("demo-citizen-1"), "Idempotency-Key": "no-admin"},
            json=body,
        ).status_code
        == 403
    )
    assert client.get("/api/v1/admin/users", headers=credential(admin_key)).status_code == 403
    assert client.get("/api/v1/admin/api-keys", headers=credential(admin_key)).status_code == 200


def test_revocation_is_idempotent_and_can_revoke_the_current_management_key(
    client, key_factory, app
):
    key = key_factory(principal="demo-admin", scopes=["admin:api_keys"])
    path = f"/api/v1/admin/api-keys/{key['api_key_id']}/revoke"
    result = client.post(path, headers=credential(key))
    assert result.status_code == 200 and result.json()["revoked"]
    assert_response(result, "/api/v1/admin/api-keys/{id}/revoke", "post")
    assert client.get("/api/v1/admin/api-keys", headers=credential(key)).status_code == 401


def test_lost_issuance_acknowledgment_cannot_replay_a_secret_or_create_another_key(
    client, auth, app, monkeypatch
):
    original = Session.commit
    fired = []

    def lose_ack(session):
        creating = any(isinstance(row, ApiKey) for row in session.new)
        original(session)
        if creating and not fired:
            fired.append(True)
            raise OperationalError(
                "synthetic lost key issuance acknowledgment", {}, Exception("lost")
            )

    monkeypatch.setattr(Session, "commit", lose_ack)
    headers = {**auth(), "Idempotency-Key": "lost-creation"}
    body = {
        "scopes": ["admin:audit"],
        "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    result = client.post("/api/v1/admin/api-keys", headers=headers, json=body)
    assert result.status_code == 503 and fired, result.text
    assert client.post("/api/v1/admin/api-keys", headers=headers, json=body).status_code == 409
    listing = client.get("/api/v1/admin/api-keys", headers=auth()).json()
    assert len(listing) == 1 and "api_key" not in listing[0]
    path = f"/api/v1/admin/api-keys/{listing[0]['api_key_id']}/revoke"
    assert client.post(path, headers=auth()).json()["revoked"]
    assert client.post(path, headers=auth()).json()["revoked"]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ApiKey)) == 1


def test_key_revocation_between_agent_tools_stops_filing_and_owner_can_resume(
    client, key_factory, approved, owner, auth, app
):
    key = key_factory(scopes=["complaints:write"])
    admin = auth()

    def revoke(step):
        if step == "payment":
            assert (
                client.post(
                    f"/api/v1/admin/api-keys/{key['api_key_id']}/revoke", headers=admin
                ).status_code
                == 200
            )

    app.state.agent_before_step = revoke
    result = submit(client, credential(key), approved)
    assert result.status_code == 401, result.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 0
    app.state.agent_before_step = None
    assert submit(client, owner, approved).json()["submitted"]


def test_scope_recheck_rejects_unmapped_operations(client, key_factory, app):
    key = key_factory()
    with Session(app.state.engine) as session:
        user = session.get(User, "demo-citizen-1")
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as error:
            recheck_key(session, key["api_key_id"], user, "unreviewedFutureOperation")
        assert error.value.status_code == 403
    protected = {
        op["operationId"]
        for methods in SPEC["paths"].values()
        for op in methods.values()
        if isinstance(op, dict) and "operationId" in op
    } - {"getHealth", "getReadiness", "login"}
    assert protected == set(OPERATION_SCOPES)


def test_provider_result_is_not_saved_after_key_revocation(
    client, key_factory, case_factory, provider, app, auth
):
    case = case_factory()
    key = key_factory(scopes=["complaints:write"])
    original = provider.assess
    admin = auth()

    def revoke(facts):
        result = original(facts)
        assert (
            client.post(
                f"/api/v1/admin/api-keys/{key['api_key_id']}/revoke", headers=admin
            ).status_code
            == 200
        )
        return result

    provider.assess = revoke
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/analyze",
        headers=credential(key),
        json={"allow_external_processing": True},
    )
    assert response.status_code == 401, response.text
    assert (
        client.get(
            f"/api/v1/complaints/{case['complaint_id']}/analysis", headers=auth("demo-citizen-1")
        ).status_code
        == 404
    )


def test_api_key_metadata_pagination_is_stable_and_bounded(client, key_factory, auth):
    for _ in range(3):
        key_factory()
    admin = auth()
    first = client.get("/api/v1/admin/api-keys", headers=admin, params={"limit": 2})
    assert len(first.json()) == 2 and first.headers.get("X-Next-Cursor")
    second = client.get(
        "/api/v1/admin/api-keys",
        headers=admin,
        params={"limit": 2, "before": first.headers["X-Next-Cursor"]},
    )
    assert len(second.json()) == 1 and not second.headers.get("X-Next-Cursor")
    assert not {r["api_key_id"] for r in first.json()} & {r["api_key_id"] for r in second.json()}
    assert (
        client.get("/api/v1/admin/api-keys", headers=admin, params={"limit": 101}).status_code
        == 400
    )


def test_upgrade_preserves_existing_accounts_and_review_schema(client, app, auth):
    config = Config(str(BACKEND / "alembic.ini"))
    with Session(app.state.engine) as session:
        before = session.get(User, "demo-admin").password_hash
    command.downgrade(config, "0007")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    assert client.get("/api/v1/health/ready").status_code == 200
    assert client.get("/api/v1/admin/api-keys", headers=auth()).json() == []
    with Session(app.state.engine) as session:
        assert session.get(User, "demo-admin").password_hash == before


def test_concurrent_key_creation_returns_one_secret(client, auth, app):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("Concurrent key issuance is verified on PostgreSQL.")
    headers = {**auth(), "Idempotency-Key": "same-command"}
    body = {
        "scopes": ["admin:audit"],
        "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    }
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda _: client.post("/api/v1/admin/api-keys", headers=headers, json=body),
                range(2),
            )
        )
    assert sorted(r.status_code for r in responses) == [201, 409], [r.text for r in responses]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ApiKey)) == 1


def test_officer_key_requires_assignment_workspace_and_recipient_consent(
    client, key_factory, approved, owner, auth
):
    assert submit(client, owner, approved).json()["submitted"]
    officer = credential(
        key_factory(
            principal="demo-officer-financial", scopes=["officer:access", "notifications:read"]
        )
    )
    path = f"/api/v1/officer/complaints/{approved['complaint_id']}"
    assert client.get(path, headers=officer).status_code == 403
    assert assign(client, auth, approved["complaint_id"]).status_code == 200
    case = client.get(path, headers=officer)
    assert case.status_code == 200, case.text
    result = client.post(
        f"{path}/actions",
        headers={
            **officer,
            "If-Match": case.headers["ETag"],
            "Idempotency-Key": "officer-key-accept",
        },
        json={"action": "accept", "reason": "Synthetic review using a scoped Officer key."},
    )
    assert result.status_code == 200, result.text
    consent = next(
        c
        for c in client.get(
            f"/api/v1/complaints/{approved['complaint_id']}/consents", headers=owner
        ).json()
        if c["recipient"].startswith("workspace:")
    )
    assert (
        client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner).status_code
        == 200
    )
    assert client.get(path, headers=officer).status_code == 403
    assert client.get("/api/v1/notifications", headers=officer).json() == []


def test_no_account_can_mint_another_principals_credential(client, auth, key_factory, app):
    for actor, path in [
        ("demo-admin", "/api/v1/admin/api-keys"),
        ("demo-admin", "/api/v1/api-keys"),
        ("demo-citizen-1", "/api/v1/api-keys"),
    ]:
        response = client.post(
            path,
            headers={**auth(actor), "Idempotency-Key": str(uuid4())},
            json={
                "principal_id": "demo-citizen-2",
                "scopes": ["complaints:read"],
                "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            },
        )
        assert response.status_code == 400, response.text
    key = key_factory()
    with Session(app.state.engine) as session:
        row = session.get(ApiKey, key["api_key_id"])
        assert row.principal_id == row.issued_by == "demo-citizen-1"


def test_self_service_metadata_revocation_and_cursors_are_owner_scoped(client, auth, key_factory):
    first = key_factory()
    second = key_factory(principal="demo-citizen-2")
    owner = auth("demo-citizen-1")
    listing = client.get("/api/v1/api-keys", headers=owner)
    assert_response(listing, "/api/v1/api-keys", "get")
    assert [r["api_key_id"] for r in listing.json()] == [first["api_key_id"]]
    assert (
        client.get(
            "/api/v1/api-keys", headers=owner, params={"before": second["api_key_id"]}
        ).status_code
        == 400
    )
    assert (
        client.post(f"/api/v1/api-keys/{second['api_key_id']}/revoke", headers=owner).status_code
        == 404
    )
    result = client.post(f"/api/v1/api-keys/{first['api_key_id']}/revoke", headers=owner)
    assert result.status_code == 200 and result.json()["revoked"]
    assert_response(result, "/api/v1/api-keys/{id}/revoke", "post")
    assert (
        client.post(f"/api/v1/api-keys/{first['api_key_id']}/revoke", headers=owner).json()
        == result.json()
    )
    assert client.get("/api/v1/auth/me", headers=credential(first)).status_code == 401


def test_application_keys_cannot_use_self_service_lifecycle_endpoints(client, key_factory):
    key = key_factory()
    headers = credential(key)
    assert client.get("/api/v1/api-keys", headers=headers).status_code == 403
    assert (
        client.post(f"/api/v1/api-keys/{key['api_key_id']}/revoke", headers=headers).status_code
        == 403
    )
    result = client.post(
        "/api/v1/api-keys",
        headers={**headers, "Idempotency-Key": "cannot-delegate"},
        json={
            "scopes": ["complaints:read"],
            "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
        },
    )
    assert result.status_code == 403
