from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from threading import Event

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.main import create_app
from app.mock_services import seed_mock_services
from app.models import (
    AgentRun,
    AgentToolCall,
    CaseAnalysis,
    Evidence,
    MockIdentity,
    MockRequirements,
    MockSubmission,
    SubmissionAuthorization,
)
from app.routing import seed_demo_routing
from tests.conftest import BACKEND
from tests.test_analysis import analyze, provider
from tests.test_cases import case_factory, give_consent, owner
from tests.test_contract import assert_response
from tests.test_evidence import upload

__all__ = ["case_factory", "owner", "provider"]
COMPLETE = {
    "description": "Citizen reports a synthetic fake aid message and payment.",
    "money_lost": True,
    "amount": 1500,
    "currency": "PKR",
}


@pytest.fixture
def ready_factory(client, app, case_factory, provider, owner):
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
        seed_mock_services(session)

    def create(**changes):
        case = case_factory(body={**COMPLETE, **changes})
        result = analyze(client, owner, case)
        assert result.status_code == 200, result.text
        assert result.json()["current_status"] == "CITIZEN_REVIEW", result.text
        return client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()

    return create


def grants(client, owner, case, exclude=None):
    workspace_scopes = ["case_status", "incident_data"]
    if case.get("complaint_draft", {}).get("evidence_ids"):
        workspace_scopes.append("evidence")
    recipients = [
        (
            f"workspace:{case['destination_workspace_id']}",
            "complaint_submission",
            workspace_scopes,
        ),
        ("service:mock-identity", "mock_identity_check", ["case_status", "identity_reference"]),
        (
            "service:mock-data",
            "mock_requirements_lookup",
            ["case_status", "incident_data.incident_type"],
        ),
    ]
    if case["incident_data"].get("transaction_reference"):
        recipients.append(
            ("service:mock-payment", "mock_payment_lookup", ["case_status", "incident_data"])
        )
    result = {}
    for recipient, purpose, scopes in recipients:
        if recipient != exclude:
            result[recipient] = give_consent(
                client, owner, case["complaint_id"], scopes, recipient, purpose
            )
    return result


@pytest.fixture
def ready(client, owner, ready_factory):
    case = ready_factory()
    return client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()


def approve(client, owner, case):
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/authorize-submission",
        headers=owner,
        json={
            "citizen_authorized": True,
            "citizen_confirmed": True,
            "reviewed_version": case["version"],
        },
    )
    assert response.status_code == 200, response.text
    assert_response(response, "/api/v1/complaints/{id}/authorize-submission", "post")
    return response.json()


@pytest.fixture
def approved(client, owner, ready):
    grants(client, owner, ready)
    return approve(client, owner, ready)


def submit(client, owner, case, key="submission-test-1"):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/submit",
        headers={**owner, "Idempotency-Key": key},
        json={"authorization_id": case["authorization_id"]},
    )


def test_authorized_workflow_checkpoint_receipt_and_replay(client, owner, approved, app):
    result = submit(client, owner, approved)
    assert result.status_code == 200, result.text
    assert_response(result, "/api/v1/complaints/{id}/submit", "post")
    assert result.json()["submitted"] and result.json()["simulated"]
    assert result.json()["submission_reference"].startswith("SIM-")
    assert submit(client, owner, approved).json() == result.json()
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    case = client.get(root, headers=owner).json()
    assert case["current_status"] == "SUBMITTED" and case["complaint_draft"]["citizen_confirmed"]
    assert case["incident_data"] == approved["incident_data"]
    runs = client.get(f"{root}/agent-runs", headers=owner)
    assert_response(runs, "/api/v1/complaints/{id}/agent-runs", "get")
    assert len(runs.json()) == 1 and runs.json()[0]["next_step"] == "done"
    run = client.get(f"{root}/agent-runs/{result.json()['agent_run_id']}", headers=owner)
    assert_response(run, "/api/v1/complaints/{id}/agent-runs/{run_id}", "get")
    assert run.json()["consent_granted"] and run.json()["citizen_authorized"]
    receipt = client.get(
        "/api/v1/mock/complaints/by-idempotency-key/submission-test-1", headers=owner
    )
    assert_response(receipt, "/api/v1/mock/complaints/by-idempotency-key/{key}", "get")
    assert receipt.json()["submission_reference"] == result.json()["submission_reference"]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1
        assert session.scalar(select(func.count()).select_from(AgentToolCall)) == 5


def test_approval_requires_flags_version_readiness_and_scoped_consents(client, owner, ready):
    path = f"/api/v1/complaints/{ready['complaint_id']}/authorize-submission"
    for body in [
        {"citizen_authorized": True},
        {
            "citizen_authorized": False,
            "citizen_confirmed": True,
            "reviewed_version": ready["version"],
        },
    ]:
        assert client.post(path, headers=owner, json=body).status_code == 400
    body = {
        "citizen_authorized": True,
        "citizen_confirmed": True,
        "reviewed_version": ready["version"],
    }
    assert client.post(path, headers=owner, json=body).status_code == 403
    grants(client, owner, ready, exclude="service:mock-identity")
    assert client.post(path, headers=owner, json=body).status_code == 403
    give_consent(
        client,
        owner,
        ready["complaint_id"],
        ["case_status", "identity_reference"],
        "service:mock-identity",
        "mock_identity_check",
    )
    assert client.post(path, headers=owner, json={**body, "reviewed_version": 1}).status_code == 409
    approved = client.post(path, headers=owner, json=body)
    assert approved.status_code == 200, approved.text
    assert client.post(path, headers=owner, json=body).json() == approved.json()


def test_revoke_unfiled_approval_invalidates_execution(client, owner, approved):
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    result = client.post(f"{root}/authorization/revoke", headers=owner)
    assert result.status_code == 200 and result.json()["current_status"] == "DRAFT"
    assert "complaint_draft" not in result.json()
    assert client.get(f"{root}/authorization", headers=owner).json()["active"] is False
    assert submit(client, owner, approved).status_code == 409
    assert client.post(f"{root}/authorization/revoke", headers=owner).json() == result.json()


@pytest.mark.parametrize("step", ["identity", "payment", "requirements", "submit"])
def test_withdrawal_between_steps_blocks_new_disclosures(client, owner, approved, app, step):
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    consent = next(
        c
        for c in client.get(f"{root}/consents", headers=owner).json()
        if c["recipient"].startswith("workspace:")
    )

    def withdraw(current):
        if current == step:
            assert (
                client.post(
                    f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner
                ).status_code
                == 200
            )

    app.state.agent_before_step = withdraw
    result = submit(client, owner, approved)
    assert result.status_code == 403, result.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 0
    run = client.get(f"{root}/agent-runs", headers=owner).json()[0]
    assert run["consent_granted"] is False and run["citizen_authorized"] is False


def test_public_mock_adapter_cannot_bypass_approval_and_is_idempotent(client, owner, approved, app):
    body = {
        "complaint_id": approved["complaint_id"],
        "complaint_draft": approved["complaint_draft"],
    }
    headers = {**owner, "Idempotency-Key": "mock-entry-1"}
    bad = deepcopy(body)
    bad["complaint_draft"]["amount"] = 99999
    assert client.post("/api/v1/mock/complaints", headers=headers, json=bad).status_code == 409
    result = client.post("/api/v1/mock/complaints", headers=headers, json=body)
    assert result.status_code == 201, result.text
    assert_response(result, "/api/v1/mock/complaints", "post")
    replay = client.post("/api/v1/mock/complaints", headers=headers, json=body)
    assert replay.status_code == 200 and replay.json() == result.json()
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1


@pytest.mark.parametrize(
    "user_id", ["demo-citizen-2", "demo-helper", "demo-officer-financial", "demo-admin"]
)
def test_only_owner_citizen_can_approve_execute_and_read_runs(
    client, owner, approved, auth, user_id
):
    headers = auth(user_id)
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    assert client.get(f"{root}/authorization", headers=headers).status_code in (403, 404)
    assert client.get(f"{root}/agent-runs", headers=headers).status_code in (403, 404)
    assert submit(client, headers, approved).status_code in (403, 404)
    assert client.post(
        f"{root}/authorize-submission",
        headers=headers,
        json={
            "citizen_confirmed": True,
            "citizen_authorized": True,
            "reviewed_version": approved["version"],
        },
    ).status_code in (403, 404)
    assert client.post(f"{root}/authorization/revoke", headers=headers).status_code in (403, 404)


def test_synthetic_lookups_are_case_and_principal_bound(client, owner, approved, auth):
    query = {"complaint_id": approved["complaint_id"]}
    assert (
        client.get("/api/v1/mock/identity/DEMO-ID-001", params=query, headers=owner).status_code
        == 200
    )
    assert (
        client.get("/api/v1/mock/identity/DEMO-ID-002", params=query, headers=owner).status_code
        == 403
    )
    assert client.get("/api/v1/mock/identity/DEMO-ID-001", headers=owner).status_code == 400
    assert client.get("/api/v1/mock/identity/DEMO-ID-001", headers=auth("demo-admin")).json()[
        "simulated"
    ]
    assert submit(client, owner, approved).status_code == 200
    assert (
        client.get(
            "/api/v1/mock/complaints/by-idempotency-key/submission-test-1",
            headers=auth("demo-citizen-2"),
        ).status_code
        == 404
    )
    assert (
        client.get(
            "/api/v1/mock/complaints/by-idempotency-key/submission-test-1",
            headers=auth("demo-admin"),
        ).status_code
        == 403
    )


@pytest.mark.parametrize(
    "reference,amount,error",
    [
        ("DEMO123", 2000, "payment_details_conflict"),
        ("DEMO456", 2400, "payment_fixture_scope_conflict"),
    ],
)
def test_payment_conflicts_stop_without_overwriting_citizen_facts(
    client, owner, ready_factory, app, reference, amount, error
):
    case = ready_factory(transaction_reference=reference, amount=amount)
    grants(client, owner, case)
    case = approve(client, owner, case)
    result = submit(client, owner, case)
    assert result.status_code == 200, result.text
    assert result.json()["current_status"] == "HUMAN_REVIEW"
    assert result.json()["errors"] == [error] and not result.json()["submitted"]
    current = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    assert current["incident_data"]["amount"] == amount
    assert not current["complaint_draft"]["citizen_confirmed"]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 0


def test_unknown_payment_is_warning_not_an_invented_result(client, owner, ready_factory):
    case = ready_factory(transaction_reference="UNKNOWN-SYNTHETIC-PAYMENT")
    grants(client, owner, case)
    result = submit(client, owner, approve(client, owner, case))
    assert result.status_code == 200 and result.json()["submitted"], result.text
    assert result.json()["warnings"] == ["payment_not_found"]


@pytest.mark.parametrize(
    "mode", ["missing_identity", "required_unknown_date", "invalid_requirement"]
)
def test_missing_fixtures_and_requirements_never_fabricate_fields(
    client, owner, approved, app, mode
):
    with Session(app.state.engine) as session, session.begin():
        if mode == "missing_identity":
            session.delete(session.get(MockIdentity, "DEMO-ID-001"))
        else:
            row = session.get(MockRequirements, "fake aid scam")
            row.requirements = (
                ["incident_date"] if mode == "required_unknown_date" else ["execute_arbitrary_tool"]
            )
    result = submit(client, owner, approved)
    if mode == "invalid_requirement":
        assert result.status_code == 502, result.text
    else:
        assert (
            result.status_code == 200 and result.json()["current_status"] == "NEEDS_INFORMATION"
        ), result.text
        assert not result.json()["submitted"]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 0


def test_interrupted_graph_resumes_on_fresh_application_without_repeating_tools(
    client, owner, approved, app, settings
):
    def interrupt(step):
        if step == "payment":
            raise TimeoutError("synthetic interruption")

    app.state.agent_before_step = interrupt
    result = submit(client, owner, approved)
    assert result.status_code == 503, result.text
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    assert client.get(f"{root}/agent-runs", headers=owner).json()[0]["next_step"] == "payment"
    fresh = create_app(settings)
    try:
        with TestClient(fresh) as fresh_client:
            resumed = submit(fresh_client, owner, approved)
            assert resumed.status_code == 200 and resumed.json()["submitted"], resumed.text
    finally:
        fresh.state.engine.dispose()
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(AgentToolCall)) == 5
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1


def test_lost_filing_commit_ack_recovers_existing_receipt(
    client, owner, approved, app, monkeypatch
):
    original = Session.commit
    fired = []

    def lose_ack(session):
        filing = any(isinstance(row, AgentToolCall) and row.step == "submit" for row in session.new)
        original(session)
        if filing and not fired:
            fired.append(True)
            raise OperationalError("synthetic lost acknowledgment", {}, Exception("lost"))

    monkeypatch.setattr(Session, "commit", lose_ack)
    result = submit(client, owner, approved)
    assert result.status_code == 503 and fired, result.text
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    saved = client.get(root, headers=owner).json()
    assert saved["submission_reference"].startswith("SIM-")
    assert client.get(f"{root}/agent-runs", headers=owner).json()[0]["next_step"] == "verify"
    retry = submit(client, owner, approved)
    assert retry.status_code == 200 and retry.json()["submitted"], retry.text
    assert retry.json()["submission_reference"] == saved["submission_reference"]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1
        assert session.scalar(select(func.count()).select_from(AgentToolCall)) == 5


def test_uncertain_approval_save_is_recoverable(client, owner, ready, monkeypatch):
    grants(client, owner, ready)
    original = Session.commit
    fired = []

    def lose_ack(session):
        approval = any(isinstance(row, SubmissionAuthorization) for row in session.new)
        original(session)
        if approval and not fired:
            fired.append(True)
            raise OperationalError("synthetic lost acknowledgment", {}, Exception("lost"))

    monkeypatch.setattr(Session, "commit", lose_ack)
    body = {
        "citizen_authorized": True,
        "citizen_confirmed": True,
        "reviewed_version": ready["version"],
    }
    root = f"/api/v1/complaints/{ready['complaint_id']}"
    assert client.post(f"{root}/authorize-submission", headers=owner, json=body).status_code == 503
    recovered = client.get(f"{root}/authorization", headers=owner).json()
    assert recovered["active"]
    retry = client.post(f"{root}/authorize-submission", headers=owner, json=body)
    assert (
        retry.status_code == 200
        and retry.json()["authorization_id"] == recovered["authorization_id"]
    )


def test_withdrawal_after_filing_keeps_owner_copy_but_blocks_recipient_reads(
    client, owner, approved, app
):
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    consent = next(
        c
        for c in client.get(f"{root}/consents", headers=owner).json()
        if c["recipient"].startswith("workspace:")
    )

    def withdraw(step):
        if step == "verify":
            assert (
                client.post(
                    f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner
                ).status_code
                == 200
            )

    app.state.agent_before_step = withdraw
    result = submit(client, owner, approved)
    assert result.status_code == 200 and result.json()["submitted"], result.text
    assert (
        client.get(
            "/api/v1/mock/complaints/by-idempotency-key/submission-test-1", headers=owner
        ).status_code
        == 403
    )
    assert (
        client.get(root, headers=owner).json()["submission_reference"]
        == result.json()["submission_reference"]
    )
    assert client.post(f"{root}/authorization/revoke", headers=owner).status_code == 409
    assert client.get(f"{root}/agent-runs", headers=owner).json()[0]["citizen_authorized"] is False


def test_same_key_cannot_target_another_case_or_change_approval_key(
    client, owner, approved, ready_factory
):
    assert submit(client, owner, approved).status_code == 200
    assert submit(client, owner, approved, key="different-key").status_code == 409
    second = ready_factory(description="A different synthetic report")
    grants(client, owner, second)
    second = approve(client, owner, second)
    assert submit(client, owner, second).status_code == 409
    assert submit(client, owner, second, key="second-report").json()["submitted"]


def test_parallel_execution_has_one_live_lease_and_one_receipt(client, owner, approved, app):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("Cross-process locking is verified on PostgreSQL in CI.")
    entered, release = Event(), Event()

    def hold(step):
        if step == "identity":
            entered.set()
            assert release.wait(20)

    app.state.agent_before_step = hold
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(submit, client, owner, approved)
        try:
            assert entered.wait(20)
            competing = submit(client, owner, approved)
            assert competing.status_code == 429, competing.text
        finally:
            release.set()
        result = first.result(timeout=30)
    assert result.status_code == 200 and result.json()["submitted"], result.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1


def test_expired_worker_lease_can_resume(client, owner, approved, app):
    def interrupt(step):
        raise TimeoutError("stop before first tool")

    app.state.agent_before_step = interrupt
    assert submit(client, owner, approved).status_code == 503
    with Session(app.state.engine) as session, session.begin():
        run = session.scalar(select(AgentRun))
        run.lease_token = "crashed-worker"
        run.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    app.state.agent_before_step = None
    assert submit(client, owner, approved).json()["submitted"]


@pytest.mark.parametrize("change", ["narrow", "withdraw_regrant"])
def test_changing_consent_cannot_silently_reactivate_old_approval(client, owner, approved, change):
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    consent = next(
        c
        for c in client.get(f"{root}/consents", headers=owner).json()
        if c["recipient"] == "service:mock-identity"
    )
    if change == "narrow":
        assert (
            client.patch(
                f"/api/v1/consents/{consent['consent_id']}",
                headers=owner,
                json={"data_scopes": ["case_status"]},
            ).status_code
            == 200
        )
    else:
        assert (
            client.post(
                f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner
            ).status_code
            == 200
        )
        give_consent(
            client,
            owner,
            approved["complaint_id"],
            consent["data_scopes"],
            consent["recipient"],
            consent["purpose"],
        )
    assert client.get(f"{root}/authorization", headers=owner).json()["active"] is False
    assert submit(client, owner, approved).status_code == 403
    # Explicitly revoke the unfiled approval, reanalyse, then obtain a fresh approval.
    assert client.post(f"{root}/authorization/revoke", headers=owner).status_code == 200


@pytest.mark.parametrize("damage", [False, True])
def test_filing_requires_approved_evidence_scope_and_intact_original(
    client, owner, case_factory, provider, app, damage
):
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
        seed_mock_services(session)
    case = case_factory(body=COMPLETE)
    evidence = upload(client, owner, case)
    assert evidence.status_code == 201, evidence.text
    assert analyze(client, owner, case).status_code == 200
    root = f"/api/v1/complaints/{case['complaint_id']}"
    ready = client.get(root, headers=owner).json()
    consents = grants(client, owner, ready)
    workspace = consents[f"workspace:{ready['destination_workspace_id']}"]
    assert "evidence" in workspace["data_scopes"]
    approved = approve(client, owner, ready)
    if damage:
        with Session(app.state.engine) as session:
            record = session.get(Evidence, evidence.json()["evidence_id"])
            app.state.evidence_store.path(record.storage_key).write_bytes(
                b"corrupted synthetic file"
            )
    result = submit(client, owner, approved)
    assert result.status_code == (503 if damage else 200), result.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == (
            0 if damage else 1
        )


def test_submission_rejects_missing_key_and_unknown_tool_arguments(client, owner, approved):
    path = f"/api/v1/complaints/{approved['complaint_id']}/submit"
    assert (
        client.post(
            path, headers=owner, json={"authorization_id": approved["authorization_id"]}
        ).status_code
        == 400
    )
    assert (
        client.post(
            path,
            headers={**owner, "Idempotency-Key": "x"},
            json={
                "authorization_id": approved["authorization_id"],
                "next_step": "submit",
                "tool": "run_shell",
            },
        ).status_code
        == 400
    )


def test_service_seed_is_repeatable_without_overwriting_edits(app, ready):
    with Session(app.state.engine) as session, session.begin():
        session.get(MockRequirements, "fake aid scam").requirements = [
            "description",
            "incident_date",
        ]
    with Session(app.state.engine) as session, session.begin():
        seed_mock_services(session)
        seed_mock_services(session)
    with Session(app.state.engine) as session:
        assert session.get(MockRequirements, "fake aid scam").requirements == [
            "description",
            "incident_date",
        ]
        assert session.scalar(select(func.count()).select_from(MockIdentity)) == 2


def test_submission_migration_preserves_review_and_route(client, owner, ready, app):
    with Session(app.state.engine) as session:
        analysis = session.scalar(select(CaseAnalysis))
        analysis_id, result = analysis.analysis_id, deepcopy(analysis.result)
    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "0005")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    assert client.get("/api/v1/health/ready").status_code == 200
    saved = client.get(f"/api/v1/complaints/{ready['complaint_id']}", headers=owner).json()
    assert saved == ready
    with Session(app.state.engine) as session:
        assert session.get(CaseAnalysis, analysis_id).result == result


def test_environment_cannot_enable_external_agent_tracing(
    client, owner, approved, app, monkeypatch
):
    from langsmith.run_helpers import get_tracing_context

    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "true")
    observed = []

    def inspect_context(step):
        context = get_tracing_context()
        assert context["enabled"] is False
        assert context["parent"] is None
        observed.append(step)

    app.state.agent_before_step = inspect_context
    result = submit(client, owner, approved)
    assert result.status_code == 200 and result.json()["submitted"], result.text
    assert observed == ["identity", "payment", "requirements", "submit", "verify"]
