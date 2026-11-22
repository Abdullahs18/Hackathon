import hashlib
import json
from pathlib import Path

import httpx
import pytest
import yaml
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cloud_storage import SupabaseStore, make_store
from app.config import Settings
from app.deploy import bootstrap
from app.models import User
from tests.test_cases import case_factory, owner
from tests.test_evidence import upload

__all__ = ["case_factory", "owner"]
KEY = "a" * 32 + ".blob"


def cloud_settings(**changes):
    return Settings(
        _env_file=None,
        database_url="postgresql://user:password@db.example.test/db?sslmode=require",
        jwt_secret="synthetic-secret-with-at-least-32-characters",
        storage_backend="supabase",
        supabase_url="https://project.supabase.co",
        supabase_service_key="sb_secret_synthetic-test-only",
        **changes,
    )


class Objects:
    def __init__(self):
        self.data = {}
        self.requests = []
        self.public = False
        self.error = None

    def __call__(self, request):
        self.requests.append(request)
        assert request.headers["apikey"] == "sb_secret_synthetic-test-only"
        assert "authorization" not in request.headers
        if self.error:
            return httpx.Response(self.error, json={"message": "PRIVATE-PROVIDER-DETAIL"})
        if "/bucket/" in request.url.path:
            return httpx.Response(200, json={"public": self.public})
        key = request.url.path.rsplit("/", 1)[-1]
        if request.method == "POST":
            assert request.headers["x-upsert"] == "false"
            if key in self.data:
                return httpx.Response(409)
            self.data[key] = request.content
            return httpx.Response(200, json={"Key": key})
        if request.method == "DELETE":
            for name in json.loads(request.content)["prefixes"]:
                self.data.pop(name, None)
            return httpx.Response(200, json=[])
        return (
            httpx.Response(200, content=self.data[key]) if key in self.data else httpx.Response(404)
        )


def test_cloud_storage_survives_client_restart_and_preserves_integrity():
    remote = Objects()
    store = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(remote))
    payload = b"synthetic-private-evidence"
    store.write(KEY, payload)
    store.close()
    other = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(remote))
    assert other.read(KEY, len(payload), hashlib.sha256(payload).hexdigest()) == payload
    with pytest.raises(HTTPException):
        other.write(KEY, b"overwrite attempt")
    assert remote.data[KEY] == payload
    remote.data[KEY] = b"tampered"
    with pytest.raises(HTTPException, match="integrity"):
        other.read(KEY, len(payload), hashlib.sha256(payload).hexdigest())
    other.remove(KEY)
    assert not remote.data
    other.close()


@pytest.mark.parametrize("status", [302, 401, 403, 404, 429, 500])
def test_storage_failures_are_closed_and_sanitized(status):
    remote = Objects()
    remote.error = status
    store = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(remote))
    with pytest.raises(HTTPException) as failure:
        store.write(KEY, b"synthetic")
    assert failure.value.status_code == 503
    assert "PRIVATE-PROVIDER-DETAIL" not in str(failure.value)
    store.close()


def test_public_bucket_and_traversal_are_rejected():
    remote = Objects()
    remote.public = True
    store = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(remote))
    with pytest.raises(HTTPException):
        store.write(KEY, b"synthetic")
    assert not remote.data
    for key in ["../private", "/etc/passwd", "name.png", "a" * 32 + ".blob?x=1"]:
        with pytest.raises(HTTPException):
            store.object_path(key)
    store.close()


def test_bounded_read_and_network_failure():
    remote = Objects()
    remote.data[KEY] = b"x" * 100000
    store = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(remote))
    with pytest.raises(HTTPException):
        store.read(KEY, 10, hashlib.sha256(b"x" * 10).hexdigest())
    store.close()

    def timeout(request):
        raise httpx.ReadTimeout("PRIVATE-NETWORK-DETAIL")

    store = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(timeout))
    with pytest.raises(HTTPException) as failure:
        store.check()
    assert "PRIVATE-NETWORK-DETAIL" not in str(failure.value)
    store.close()


@pytest.mark.parametrize(
    "patch",
    [
        {"database_url": "sqlite:///bad.db"},
        {"database_url": "postgresql://u:p@host/db"},
        {"cors_origins": ["http://localhost:5173"]},
        {"cors_origins": ["*"]},
        {"cors_origins": ["https://web.example.test/"]},
        {"cors_origins": []},
        {"storage_backend": "local"},
        {"supabase_url": "http://project.supabase.co"},
        {"supabase_url": "https://user:password@project.supabase.co"},
        {"supabase_service_key": ""},
        {"supabase_bucket": "../public"},
    ],
)
def test_production_configuration_rejects_unsafe_settings(patch):
    values = dict(environment="production", cors_origins=["https://web.example.test"])
    values.update(patch)
    # model_copy would skip validation; validate a complete configuration instead.
    base = cloud_settings().model_dump()
    base.update(values)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **base)


def test_cloud_database_url_normalization_and_local_storage(settings):
    configured = cloud_settings(environment="production", cors_origins=["https://web.example.test"])
    assert configured.database_url.startswith("postgresql+psycopg://")
    assert "password@" not in repr(configured)
    assert make_store(settings).root == settings.evidence_dir.resolve()


@pytest.mark.parametrize("host", ["aws-0-region.pooler.supabase.com", "db.project.supabase.co"])
def test_production_rejects_supabase_transaction_pooler(host):
    values = cloud_settings().model_dump()
    values.update(
        environment="production",
        cors_origins=["https://web.example.test"],
        database_url=f"postgresql://user:password@{host}:6543/db?sslmode=require",
    )
    with pytest.raises(ValidationError, match="session-level advisory locks"):
        Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    "endpoint",
    [
        "aws-0-region.pooler.supabase.com:5432",
        "db.project.supabase.co:5432",
        "db.example.test:6543",
    ],
)
def test_production_accepts_session_connections_and_custom_postgres_ports(endpoint):
    values = cloud_settings().model_dump()
    values.update(
        environment="production",
        cors_origins=["https://web.example.test"],
        database_url=f"postgresql://user:password@{endpoint}/db?sslmode=require",
    )
    assert Settings(_env_file=None, **values).environment == "production"


def test_bootstrap_is_repeatable_preserves_passwords_and_migrations(app, settings):
    with Session(app.state.engine) as session:
        before = session.scalar(select(User.password_hash).where(User.user_id == "demo-admin"))
    bootstrap(settings, seed_demo=False)
    settings.demo_password = SecretStr("different-synthetic-password")
    bootstrap(settings, seed_demo=True)
    with Session(app.state.engine) as session:
        assert (
            session.scalar(select(User.password_hash).where(User.user_id == "demo-admin")) == before
        )


def test_cloud_evidence_uses_existing_role_authorization(client, app, owner, auth, case_factory):
    remote = Objects()
    cloud = SupabaseStore(cloud_settings(), transport=httpx.MockTransport(remote))
    app.state.evidence_store = cloud
    case = case_factory()
    response = upload(client, owner, case)
    assert response.status_code == 201, response.text
    record = response.json()
    path = f"/api/v1/complaints/{case['complaint_id']}/evidence/{record['evidence_id']}/content"
    saved = client.get(path, headers=owner)
    assert saved.status_code == 200, saved.text
    assert hashlib.sha256(saved.content).hexdigest() == record["sha256"]
    reads = len(remote.requests)
    for role in ["demo-admin", "demo-citizen-2", "demo-helper", "demo-officer-financial"]:
        assert client.get(path, headers=auth(role)).status_code == 403
    assert len(remote.requests) == reads
    assert client.get("/api/v1/health/ready").status_code == 200


def test_render_blueprint_has_only_free_compute_and_private_server_secrets():
    root = Path(__file__).resolve().parents[2]
    data = yaml.safe_load((root / "render.yaml").read_text(encoding="utf-8"))
    api, web = data["services"]
    assert api["plan"] == "free" and web["runtime"] == "static" and "plan" not in web
    assert "preDeployCommand" not in api and "disk" not in api
    assert api["dockerCommand"] == "python -m app.deploy"
    assert web["routes"][0]["destination"] == "/index.html"
    assert not any("SECRET" in row["key"] or "SERVICE_KEY" in row["key"] for row in web["envVars"])
    assert all(
        row.get("sync") is False
        for row in api["envVars"]
        if row["key"] in {"DASTAK_DATABASE_URL", "DASTAK_SUPABASE_SERVICE_KEY", "GEMINI_API_KEY"}
    )


def test_cloud_database_tables_have_no_anonymous_rls_bypass(app):
    from sqlalchemy import text

    from app.deploy import secure_tables

    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row security is validated in PostgreSQL CI")
    with app.state.engine.connect() as connection:
        secure_tables(connection)
        rows = connection.execute(
            text(
                "SELECT relname, relrowsecurity FROM pg_class WHERE oid IN "
                "(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                "WHERE n.nspname=current_schema() AND c.relkind='r')"
            )
        ).all()
        assert rows and all(row.relrowsecurity for row in rows)


def test_postgres_unprivileged_role_cannot_read_application_rows(app):
    from uuid import uuid4

    from sqlalchemy import text

    from app.deploy import secure_tables

    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL role isolation is validated in PostgreSQL CI")
    role = "dastak_probe_" + uuid4().hex
    with app.state.engine.connect() as connection:
        secure_tables(connection)
        connection.execute(text("CREATE ROLE " + role + " NOLOGIN"))
        connection.commit()
        try:
            connection.execute(text("GRANT USAGE ON SCHEMA public TO " + role))
            connection.execute(text("GRANT SELECT ON users TO " + role))
            connection.commit()
            with connection.begin():
                connection.execute(text("SET LOCAL ROLE " + role))
                assert connection.execute(text("SELECT password_hash FROM users")).all() == []
        finally:
            connection.rollback()
            connection.execute(text("DROP OWNED BY " + role))
            connection.execute(text("DROP ROLE " + role))
            connection.commit()


@pytest.mark.parametrize("value", [["*"], ["0.0.0.0/0"], ["::/0"], ["not-a-proxy"]])
def test_wildcard_or_invalid_proxy_trust_is_rejected(value):
    with pytest.raises(ValidationError):
        cloud_settings(trusted_proxy_ips=value)


def test_legacy_service_key_remains_backend_only():
    from pydantic import SecretStr

    configured = cloud_settings().model_copy(
        update={"supabase_service_key": SecretStr("legacy-service-jwt")}
    )
    observed = []

    def handler(request):
        observed.append(request)
        return httpx.Response(200, json={"public": False})

    store = SupabaseStore(configured, transport=httpx.MockTransport(handler))
    store.check()
    assert observed[0].headers["Authorization"] == "Bearer legacy-service-jwt"
    store.close()


def test_startup_hides_credentials_and_does_not_start_server(monkeypatch, capsys):
    from app import deploy

    def invalid():
        raise ValueError("PRIVATE-STARTUP-SECRET")

    monkeypatch.setattr(deploy, "Settings", invalid)
    monkeypatch.setattr(
        deploy.uvicorn, "run", lambda *args, **kwargs: pytest.fail("Server must not start")
    )
    with pytest.raises(SystemExit) as failure:
        deploy.main()
    assert failure.value.code == 1
    assert "PRIVATE-STARTUP-SECRET" not in capsys.readouterr().err


def test_release_check_verifies_exact_frontend_origin(client):
    from app.release_check import check

    assert check(client, origin="http://localhost:5173")["passed"]
    rejected = check(client, origin="https://unapproved.example.test")
    assert not rejected["passed"]
    assert (
        next(row for row in rejected["checks"] if row["check"] == "frontend_cors")["passed"]
        is False
    )


def test_production_login_has_account_and_shared_edge_limits(client, app):
    app.state.settings.environment = "production"
    app.state.login_limiter.limit = 1
    app.state.login_edge_limiter.limit = 3

    def attempt(user):
        return client.post("/api/v1/auth/login", json={"user_id": user, "password": "incorrect"})

    assert attempt("synthetic-unknown-a").status_code == 401
    assert attempt("synthetic-unknown-a").status_code == 429
    assert attempt("synthetic-unknown-b").status_code == 401
    # Changing account identifiers cannot bypass the shared edge ceiling.
    result = attempt("synthetic-unknown-c")
    assert result.status_code == 429 and result.headers["Retry-After"] == "60"
