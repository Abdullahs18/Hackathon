from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import DatabaseError, OperationalError
from sqlalchemy.orm import Session

from app.analysis_policy import evaluate, validate_assessment
from app.models import (
    AuditLog,
    CaseAnalysis,
    Complaint,
    RoutingCatalog,
    RoutingRule,
    RoutingVersion,
)
from app.routing import seed_demo_routing
from tests.conftest import BACKEND
from tests.test_analysis import OUTPUT, analyze, provider
from tests.test_cases import case_factory, owner
from tests.test_contract import assert_response

__all__ = ["case_factory", "owner", "provider"]
ROOT = "/api/v1/admin/routing-rules"
RULE = {
    "name": "Synthetic fraud intake",
    "incident_type": "fake aid scam",
    "destination_workspace_id": "mock-financial-fraud",
    "priority": 100,
    "active": True,
    "explanation": "Use this simulated demo intake.",
    "justification": "Demo fixture only; not an official reporting destination.",
}
COMPLETE = {
    "description": "Citizen's synthetic incident account",
    "money_lost": True,
    "amount": 1500,
    "currency": "PKR",
    "incident_date": None,
}


@pytest.fixture
def admin(auth):
    return auth()


@pytest.fixture
def rule_factory(client, admin):
    def create(**changes):
        response = client.post(ROOT, headers=admin, json={**RULE, **changes})
        assert response.status_code == 201, response.text
        assert_response(response, ROOT, "post")
        return response.json()

    return create


def test_rule_create_replay_edit_history_and_noop(client, admin, app):
    headers = {**admin, "Idempotency-Key": "route-1"}
    first = client.post(ROOT, headers=headers, json=RULE)
    assert first.status_code == 201, first.text
    snapshot = first.json()
    assert first.headers["etag"] == f'"{snapshot["rule_version_id"]}"'
    replay = client.post(ROOT, headers=headers, json=RULE)
    assert replay.status_code == 200 and replay.json() == snapshot
    assert client.post(ROOT, headers=headers, json={**RULE, "priority": 2}).status_code == 409
    path = f"{ROOT}/{snapshot['rule_id']}"
    revised = client.patch(
        path,
        headers={**admin, "If-Match": first.headers["etag"]},
        json={"destination_workspace_id": "mock-digital-safety"},
    )
    assert revised.status_code == 200, revised.text
    assert_response(revised, "/api/v1/admin/routing-rules/{id}", "patch")
    assert revised.json()["rule_version_id"] != snapshot["rule_version_id"]
    assert (
        client.patch(
            path, headers={**admin, "If-Match": first.headers["etag"]}, json={"priority": 1}
        ).status_code
        == 412
    )
    unchanged = client.patch(path, headers=admin, json={"priority": 100})
    assert unchanged.json() == revised.json()
    history = client.get(f"{path}/versions", headers=admin)
    assert_response(history, "/api/v1/admin/routing-rules/{id}/versions", "get")
    assert history.json() == [snapshot, revised.json()]
    listing = client.get(ROOT, headers=admin)
    assert_response(listing, ROOT, "get")
    assert listing.json() == [revised.json()]
    assert client.post(ROOT, headers=headers, json=RULE).json() == revised.json()
    with Session(app.state.engine) as session:
        assert session.get(RoutingCatalog, 1).generation == 3
        assert session.scalar(select(func.count()).select_from(RoutingVersion)) == 2


@pytest.mark.parametrize(
    "change",
    [
        {"incident_type": "cyber stalking"},
        {"destination_workspace_id": "real-authority"},
        {"priority": -1},
        {"priority": 1001},
        {"priority": True},
        {"name": " "},
        {"justification": ""},
        {"active": "true"},
        {"explanation": "x" * 4001},
        {"name": "x" * 201},
    ],
)
def test_invalid_rules_are_rejected(client, admin, change):
    response = client.post(ROOT, headers=admin, json={**RULE, **change})
    assert response.status_code == 400


def test_rule_operations_are_admin_only(client, auth, rule_factory, admin):
    rule = rule_factory()
    path = f"{ROOT}/{rule['rule_id']}"
    for account in ["demo-citizen-1", "demo-helper", "demo-officer-financial"]:
        headers = auth(account)
        assert client.get(ROOT, headers=headers).status_code == 403
        assert client.post(ROOT, headers=headers, json=RULE).status_code == 403
        assert client.patch(path, headers=headers, json={"active": False}).status_code == 403
        assert client.get(f"{path}/versions", headers=headers).status_code == 403
    assert client.get(ROOT).status_code == 401
    assert client.get(f"{ROOT}/missing/versions", headers=admin).status_code == 404
    assert client.patch(f"{ROOT}/missing", headers=admin, json={"active": False}).status_code == 404
    assert client.patch(path, headers=admin, json={}).status_code == 400


def test_rule_change_affects_new_cases_and_preserves_existing_pin(
    client, owner, admin, case_factory, rule_factory, provider
):
    rule = rule_factory()
    first = case_factory(body=COMPLETE)
    result = analyze(client, owner, first)
    assert result.status_code == 200, result.text
    a = result.json()
    assert a["current_status"] == "CITIZEN_REVIEW"
    assert a["routing"]["rule_version_id"] == rule["rule_version_id"]
    assert a["routing"]["destination_workspace_id"] == "mock-financial-fraud"
    assert a["complaint_draft"]["description"] == COMPLETE["description"]
    assert a["complaint_draft"]["incident_date"] is None
    assert not a["complaint_draft"]["citizen_confirmed"] and not a["submitted"]
    changed = client.patch(
        f"{ROOT}/{rule['rule_id']}",
        headers=admin,
        json={"destination_workspace_id": "mock-digital-safety"},
    ).json()
    assert analyze(client, owner, first).json() == a  # No provider recall or route mutation.
    second = case_factory(body=COMPLETE)
    b = analyze(client, owner, second).json()
    assert b["routing"]["rule_version_id"] == changed["rule_version_id"]
    assert b["routing"]["destination_workspace_id"] == "mock-digital-safety"
    assert len(provider.calls) == 2
    # Even a later fact correction uses the existing immutable decision.
    client.patch(
        f"/api/v1/complaints/{first['complaint_id']}", headers=owner, json={"amount": 1700}
    )
    updated = analyze(client, owner, first).json()
    assert updated["routing"]["rule_version_id"] == rule["rule_version_id"]
    assert updated["complaint_draft"]["amount"] == 1700
    assert updated["complaint_draft"]["citizen_confirmed"] is False


def test_old_unrouted_assessment_reuses_provider_result_when_rules_arrive(
    client, owner, case_factory, rule_factory, provider
):
    case = case_factory(body=COMPLETE)
    original = analyze(client, owner, case).json()
    assert original["routing"] is None and "no_matching_rule" in original["handoff_reasons"]
    rule = rule_factory()
    revised = analyze(client, owner, case).json()
    assert revised["analysis_id"] != original["analysis_id"]
    assert revised["current_status"] == "CITIZEN_REVIEW"
    assert revised["routing"]["rule_version_id"] == rule["rule_version_id"]
    assert len(provider.calls) == 1


def test_legacy_assessment_can_be_routed_without_calling_provider(
    client, owner, case_factory, rule_factory, provider, app
):
    case = case_factory(body=COMPLETE)
    first = analyze(client, owner, case).json()
    with Session(app.state.engine) as session, session.begin():
        row = session.get(CaseAnalysis, first["analysis_id"])
        row.result = {
            k: v
            for k, v in row.result.items()
            if k not in {"routing", "routing_generation", "policy_version"}
        }
    rule_factory()
    result = analyze(client, owner, case).json()
    assert result["current_status"] == "CITIZEN_REVIEW" and len(provider.calls) == 1


def test_deactivation_preserves_old_cases_but_no_new_match(
    client, owner, admin, case_factory, rule_factory, provider
):
    rule = rule_factory()
    old = case_factory(body=COMPLETE)
    first = analyze(client, owner, old).json()
    client.patch(f"{ROOT}/{rule['rule_id']}", headers=admin, json={"active": False})
    assert analyze(client, owner, old).json() == first
    new = case_factory(body=COMPLETE)
    result = analyze(client, owner, new).json()
    assert result["routing"] is None and result["current_status"] == "HUMAN_REVIEW"
    assert "complaint_draft" not in result


def test_changed_classifier_cannot_silently_replace_pin(
    client, owner, case_factory, rule_factory, provider
):
    rule = rule_factory()
    rule_factory(incident_type="phishing", destination_workspace_id="mock-digital-safety")
    case = case_factory(body=COMPLETE)
    analyze(client, owner, case)
    client.patch(
        f"/api/v1/complaints/{case['complaint_id']}",
        headers=owner,
        json={"description": "New synthetic facts"},
    )
    provider.output["classification"]["incident_type"] = "phishing"
    result = analyze(client, owner, case).json()
    assert result["current_status"] == "HUMAN_REVIEW"
    assert "pinned_route_mismatch" in result["handoff_reasons"] and result["routing"] is None
    saved = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    assert saved["rule_version_id"] == rule["rule_version_id"]
    assert "complaint_draft" not in saved


def test_rule_edited_during_provider_call_uses_current_committed_snapshot(
    client, owner, admin, case_factory, rule_factory, provider
):
    rule = rule_factory()
    case = case_factory(body=COMPLETE)

    def edit():
        result = client.patch(
            f"{ROOT}/{rule['rule_id']}",
            headers=admin,
            json={"destination_workspace_id": "mock-digital-safety"},
        )
        assert result.status_code == 200

    provider.callback = edit
    result = analyze(client, owner, case).json()
    assert result["routing"]["destination_workspace_id"] == "mock-digital-safety"


def test_priority_and_ties_are_deterministic(client, owner, case_factory, rule_factory, provider):
    rule_factory(priority=100)
    a = rule_factory(priority=1)
    b = rule_factory(priority=1, destination_workspace_id="mock-digital-safety")
    chosen = min([a, b], key=lambda r: r["rule_id"])
    result = analyze(client, owner, case_factory(body=COMPLETE)).json()
    assert result["routing"]["rule_version_id"] == chosen["rule_version_id"]


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE routing_rule_versions SET priority = 999",
        "DELETE FROM routing_rule_versions",
        "TRUNCATE routing_rule_versions CASCADE",
    ],
)
def test_versions_are_immutable_at_database(app, rule_factory, statement):
    rule = rule_factory()
    if statement.startswith("TRUNCATE") and app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL TRUNCATE guard")
    with Session(app.state.engine) as session:
        with pytest.raises(DatabaseError):
            session.execute(text(statement))
        session.rollback()
        assert session.get(RoutingVersion, rule["rule_version_id"]).priority == 100


def test_seed_rules_are_repeatable_and_do_not_overwrite_admin_edits(app, client, admin):
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
    rules = client.get(ROOT, headers=admin).json()
    assert len(rules) == 5
    rule = rules[0]
    edited = client.patch(f"{ROOT}/{rule['rule_id']}", headers=admin, json={"active": False}).json()
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
        assert session.scalar(select(func.count()).select_from(RoutingRule)) == 5
    current = client.get(ROOT, headers=admin).json()
    assert next(r for r in current if r["rule_id"] == rule["rule_id"]) == edited


def test_invalid_legacy_pin_fails_closed(client, owner, case_factory, rule_factory, provider, app):
    rule_factory()
    case = case_factory(body=COMPLETE)
    with Session(app.state.engine) as session, session.begin():
        record = session.get(Complaint, case["complaint_id"])
        record.rule_version_id = "missing-legacy-version"
        record.destination_workspace_id = "mock-financial-fraud"
    result = analyze(client, owner, case).json()
    assert result["current_status"] == "HUMAN_REVIEW"
    assert "invalid_pinned_route" in result["handoff_reasons"]


@pytest.mark.parametrize(
    "kind,expected",
    [
        ("complete", "CITIZEN_REVIEW"),
        ("missing", "NEEDS_INFORMATION"),
        ("moderate", "NEEDS_INFORMATION"),
        ("low", "HUMAN_REVIEW"),
        ("contradiction", "HUMAN_REVIEW"),
        ("duplicate", "HUMAN_REVIEW"),
        ("unclear", "HUMAN_REVIEW"),
        ("outside", "HUMAN_REVIEW"),
    ],
)
def test_readiness_and_hard_stops(kind, expected):
    incident = deepcopy(COMPLETE)
    value = deepcopy(OUTPUT)
    value["classification"]["missing_fields"] = []
    if kind == "missing":
        incident["amount"] = None
    elif kind == "moderate":
        value["classification"]["confidence"] = 0.55
    elif kind == "low":
        value["classification"]["confidence"] = 0.1
        incident.pop("money_lost")
        incident["description"] = None
    elif kind == "contradiction":
        incident["money_lost"] = False
    elif kind == "unclear":
        value["classification"]["incident_type"] = "unclear"
    elif kind == "outside":
        value["classification"]["incident_type"] = "out of scope"
    result = evaluate(incident, validate_assessment(value), kind == "duplicate", True, None)
    assert result["current_status"] == expected
    if kind == "complete":
        assert result["readiness_score"] == pytest.approx(0.9825)
        assert result["complaint_draft"]["transaction_reference"] is None
        assert not result["complaint_draft"]["citizen_confirmed"]
    if expected != "CITIZEN_REVIEW":
        assert "complaint_draft" not in result
    if expected == "NEEDS_INFORMATION":
        assert result["follow_up_questions_ur"]


@pytest.mark.parametrize("operation", ["create", "edit"])
def test_postgres_concurrent_rule_changes(client, admin, app, rule_factory, operation):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL catalog and rule row locks")
    if operation == "create":

        def run(_):
            return client.post(ROOT, headers={**admin, "Idempotency-Key": "parallel"}, json=RULE)

        expected = [200, 201]
    else:
        rule = rule_factory()

        def run(n):
            return client.patch(
                f"{ROOT}/{rule['rule_id']}",
                headers={**admin, "If-Match": f'"{rule["rule_version_id"]}"'},
                json={"priority": n + 1},
            )

        expected = [200, 412]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, range(2)))
    assert sorted(r.status_code for r in results) == expected


def test_upgrade_preserves_existing_analysis_and_records_routing_audit(
    client, owner, admin, case_factory, provider, app, rule_factory
):
    case = case_factory(body=COMPLETE)
    old = analyze(client, owner, case).json()
    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "0004")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    rule = rule_factory()
    result = analyze(client, owner, case).json()
    assert result["current_status"] == "CITIZEN_REVIEW" and len(provider.calls) == 1
    with Session(app.state.engine) as session:
        assert session.get(CaseAnalysis, old["analysis_id"]).result == old
        assert rule["rule_version_id"] in session.scalars(select(AuditLog.rule_version_id)).all()


def test_uncertain_commits_recover_by_key_and_version(client, admin, app, monkeypatch):
    original = Session.commit

    def uncertain_create(session):
        changing = any(isinstance(row, RoutingRule) for row in session.new)
        original(session)
        if changing:
            raise OperationalError("synthetic acknowledgement loss", {}, None)

    headers = {**admin, "Idempotency-Key": "uncertain-rule"}
    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", uncertain_create)
        assert client.post(ROOT, headers=headers, json=RULE).status_code == 503
    recovered = client.post(ROOT, headers=headers, json=RULE)
    assert recovered.status_code == 200
    old = recovered.json()

    def uncertain_edit(session):
        changing = any(isinstance(row, RoutingRule) for row in session.dirty)
        original(session)
        if changing:
            raise OperationalError("synthetic acknowledgement loss", {}, None)

    path = f"{ROOT}/{old['rule_id']}"
    conditional = {**admin, "If-Match": recovered.headers["etag"]}
    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", uncertain_edit)
        assert client.patch(path, headers=conditional, json={"priority": 5}).status_code == 503
    saved = client.get(ROOT, headers=admin).json()[0]
    assert saved["priority"] == 5 and saved["rule_version_id"] != old["rule_version_id"]
    assert client.patch(path, headers=conditional, json={"priority": 5}).status_code == 412
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(RoutingVersion)) == 2
