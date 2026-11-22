import ast
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin_trace_routes import ACTION_MESSAGES
from app.audit import record_event
from app.models import AgentRun, AgentToolCall, AuditLog
from tests.test_api_keys import credential, key_factory
from tests.test_contract import assert_response
from tests.test_submission import (
    approve,
    approved,
    case_factory,
    grants,
    owner,
    provider,
    ready,
    ready_factory,
    submit,
)

__all__ = ["key_factory", "approved", "case_factory", "owner", "provider", "ready", "ready_factory"]
PRIVATE = "PRIVATE-SENTINEL-DO-NOT-EXPOSE"


@pytest.fixture
def completed(client, owner, approved):
    result = submit(client, owner, approved)
    assert result.status_code == 200 and result.json()["submitted"], result.text
    return approved, result.json()


def test_admin_sees_safe_route_and_tool_trace_without_case_bypass(client, auth, completed):
    case, execution = completed
    admin = auth()
    response = client.get("/api/v1/admin/agent-runs", headers=admin)
    assert_response(response, "/api/v1/admin/agent-runs", "get")
    run = response.json()[0]
    assert run["agent_run_id"] == execution["agent_run_id"] and run["redacted"]
    assert run["rule_version_id"] == case["rule_version_id"]
    assert [tool["tool"] for tool in run["tools"]] == [
        "identity",
        "payment",
        "requirements",
        "submit",
        "verify",
    ]
    assert run["submitted"]
    for field in [
        "incident_data",
        "transcript",
        "classification",
        "idempotency_key",
        "submission_reference",
        "fingerprint",
        "input",
        "output",
    ]:
        assert field not in run
    audit = client.get(
        "/api/v1/admin/audit",
        headers=admin,
        params={"complaint_id": case["complaint_id"], "limit": 100},
    )
    assert_response(audit, "/api/v1/admin/audit", "get")
    calls = [row for row in audit.json() if row["action"] == "agent.tool_completed"]
    assert len(calls) == 5 and all(
        row["agent_run_id"] == execution["agent_run_id"] for row in calls
    )
    assert all(row["redacted"] for row in audit.json())
    assert case["incident_data"]["description"] not in response.text + audit.text
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=admin).status_code == 403
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"input": PRIVATE, "result": PRIVATE},
        {
            "input": json.dumps(
                {
                    "description": PRIVATE,
                    "key_hash": PRIVATE,
                    "raw_key": PRIVATE,
                    "fields": [PRIVATE],
                    "tool": [],
                    "next_step": {},
                    "outcome": [],
                }
            ),
            "result": PRIVATE,
        },
    ],
)
def test_private_or_malformed_legacy_audit_values_are_not_echoed(client, auth, app, payload):
    identity = str(uuid4())
    with Session(app.state.engine) as session, session.begin():
        session.add(
            AuditLog(
                audit_log_id=identity,
                complaint_id=None,
                user_id="demo-admin",
                agent_run_id=None,
                action="complaint.updated",
                input=payload["input"],
                result=payload["result"],
                rule_version_id=None,
                timestamp=datetime.now(UTC),
            )
        )
        record_event(session, PRIVATE, "demo-admin", PRIVATE, details={"message": PRIVATE})
    response = client.get("/api/v1/admin/audit", headers=auth(), params={"limit": 100})
    assert response.status_code == 200, response.text
    assert PRIVATE not in response.text
    assert any(row["action"] == "other" for row in response.json())
    assert_response(response, "/api/v1/admin/audit", "get")


def test_private_agent_state_and_tool_payloads_never_enter_admin_response(
    client, auth, completed, app
):
    case, execution = completed
    with Session(app.state.engine) as session, session.begin():
        run = session.get(AgentRun, execution["agent_run_id"])
        run.state = {
            **run.state,
            "transcript": PRIVATE,
            "incident_data": {"description": PRIVATE},
            "classification": {"explanation": PRIVATE},
            "errors": [PRIVATE],
            "idempotency_key": PRIVATE,
            "submission_reference": PRIVATE,
        }
        call = session.scalar(
            select(AgentToolCall).where(AgentToolCall.agent_run_id == run.agent_run_id)
        )
        call.input = {"description": PRIVATE, "evidence_path": PRIVATE}
        call.output = {
            "checkpoint_status": "MOCK_SERVICE_CALLS",
            "raw": PRIVATE,
            "api_key": PRIVATE,
        }
    response = client.get("/api/v1/admin/agent-runs", headers=auth())
    assert response.status_code == 200 and PRIVATE not in response.text, response.text
    assert response.json()[0]["outcomes"] == [
        {"code": "unknown_failure", "explanation": "A private or unrecognized failure was omitted."}
    ]
    assert_response(response, "/api/v1/admin/agent-runs", "get")


def test_only_admin_role_and_audit_scope_can_inspect_traces(client, auth, key_factory):
    for user in ["demo-citizen-1", "demo-helper", "demo-officer-financial"]:
        headers = auth(user)
        assert client.get("/api/v1/admin/audit", headers=headers).status_code == 403
        assert client.get("/api/v1/admin/agent-runs", headers=headers).status_code == 403
    limited = key_factory(principal="demo-admin", scopes=["admin:users"])
    assert client.get("/api/v1/admin/audit", headers=credential(limited)).status_code == 403
    permitted = key_factory(principal="demo-admin", scopes=["admin:audit"])
    assert client.get("/api/v1/admin/audit", headers=credential(permitted)).status_code == 200
    assert client.get("/api/v1/admin/agent-runs", headers=credential(permitted)).status_code == 200
    assert client.get("/api/v1/admin/users", headers=credential(permitted)).status_code == 403


def test_audit_pagination_handles_ties_filters_and_cors(client, auth, app):
    headers = {**auth(), "Origin": "http://localhost:5173"}
    case_id = str(uuid4())
    stamp = datetime.now(UTC) + timedelta(seconds=1)
    ids = [str(uuid4()) for _ in range(5)]
    with Session(app.state.engine) as session, session.begin():
        for identity in ids:
            session.add(
                AuditLog(
                    audit_log_id=identity,
                    complaint_id=case_id,
                    user_id="demo-admin",
                    agent_run_id=None,
                    action="complaint.updated",
                    input=None,
                    result=PRIVATE,
                    rule_version_id=None,
                    timestamp=stamp,
                )
            )
    received = []
    before = None
    for _ in range(3):
        params = {"complaint_id": case_id, "limit": 2}
        if before:
            params["before"] = before
        response = client.get("/api/v1/admin/audit", headers=headers, params=params)
        assert response.status_code == 200, response.text
        assert "X-Next-Cursor" in response.headers.get("access-control-expose-headers", "")
        received.extend(row["audit_log_id"] for row in response.json())
        before = response.headers.get("X-Next-Cursor")
    assert received == sorted(ids, reverse=True) and before is None
    assert (
        client.get(
            "/api/v1/admin/audit", headers=headers, params={"before": str(uuid4())}
        ).status_code
        == 400
    )
    assert (
        client.get(
            "/api/v1/admin/audit",
            headers=headers,
            params={"before": ids[0], "complaint_id": str(uuid4())},
        ).status_code
        == 400
    )


def test_agent_summary_pagination_filters_real_runs(client, auth, completed, owner, ready_factory):
    first, _ = completed
    second = ready_factory(description="Second independent synthetic report.")
    grants(client, owner, second)
    second = approve(client, owner, second)
    assert submit(client, owner, second, key="second-summary").json()["submitted"]
    admin = auth()
    response = client.get("/api/v1/admin/agent-runs", headers=admin, params={"limit": 1})
    assert len(response.json()) == 1 and response.headers.get("X-Next-Cursor")
    next_page = client.get(
        "/api/v1/admin/agent-runs",
        headers=admin,
        params={"limit": 1, "before": response.headers["X-Next-Cursor"]},
    )
    assert len(next_page.json()) == 1 and not next_page.headers.get("X-Next-Cursor")
    assert response.json()[0]["agent_run_id"] != next_page.json()[0]["agent_run_id"]
    filtered = client.get(
        "/api/v1/admin/agent-runs", headers=admin, params={"complaint_id": first["complaint_id"]}
    )
    assert len(filtered.json()) == 1 and filtered.json()[0]["complaint_id"] == first["complaint_id"]


def test_every_static_application_audit_action_has_an_explicit_safe_explanation():
    actions = set()
    for path in (Path(__file__).resolve().parents[1] / "app").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if (
                isinstance(node, ast.Call)
                and getattr(node.func, "id", None) == "record_event"
                and len(node.args) > 1
                and isinstance(node.args[1], ast.Constant)
            ):
                actions.add(node.args[1].value)
    assert actions <= set(ACTION_MESSAGES)
