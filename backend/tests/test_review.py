from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import event, func, select, text
from sqlalchemy.exc import DatabaseError, OperationalError
from sqlalchemy.orm import Session

from app.mock_services import seed_mock_services
from app.models import AuditLog, MockSubmission, Notification, ReviewEvent
from app.routing import seed_demo_routing
from tests.conftest import BACKEND, DEMO_PASSWORD
from tests.test_analysis import analyze
from tests.test_cases import assign, case, give_consent, give_helper, submitted_case
from tests.test_contract import assert_response
from tests.test_evidence import upload
from tests.test_submission import (
    COMPLETE,
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

__all__ = [
    "approved",
    "case",
    "case_factory",
    "owner",
    "provider",
    "ready",
    "ready_factory",
    "submitted_case",
]


@pytest.fixture
def filed_case(client, owner, approved):
    result = submit(client, owner, approved)
    assert result.status_code == 200 and result.json()["submitted"], result.text
    return client.get(f"/api/v1/complaints/{approved['complaint_id']}", headers=owner).json()


@pytest.fixture
def reviewed(client, auth, filed_case):
    response = assign(client, auth, filed_case["complaint_id"])
    assert response.status_code == 200, response.text
    return filed_case


@pytest.fixture
def officer(auth):
    return auth("demo-officer-financial")


def act(
    client, officer, case, action, key=None, version=None, reason="Synthetic officer review reason."
):
    return client.post(
        f"/api/v1/officer/complaints/{case['complaint_id']}/actions",
        headers={
            **officer,
            "If-Match": f'"{version if version is not None else case["version"]}"',
            "Idempotency-Key": key or str(uuid4()),
        },
        json={"action": action, "reason": reason},
    )


def answer(client, owner, case, key="citizen-answer", version=None, **changes):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/review-response",
        headers={
            **owner,
            "If-Match": f'"{version if version is not None else case["version"]}"',
            "Idempotency-Key": key,
        },
        json={
            "message": "Synthetic clarification: the message was received by SMS.",
            "allow_recipient_sharing": True,
            **changes,
        },
    )


def notifications(client, headers):
    response = client.get("/api/v1/notifications", headers=headers)
    assert_response(response, "/api/v1/notifications", "get")
    return response.json()


def test_filing_review_reply_accept_close_preserves_original_receipt(
    client, owner, officer, reviewed, app
):
    with Session(app.state.engine) as session:
        original = deepcopy(session.scalar(select(MockSubmission)).payload)
    requested = act(client, officer, reviewed, "request_information")
    assert requested.status_code == 200, requested.text
    assert_response(requested, "/api/v1/officer/complaints/{id}/actions", "post")
    assert requested.json()["review_outcome"] == "information_requested"
    assert act(client, officer, requested.json(), "accept").status_code == 409
    supplied = answer(client, owner, requested.json())
    assert supplied.status_code == 200, supplied.text
    assert_response(supplied, "/api/v1/complaints/{id}/review-response", "post")
    accepted = act(client, officer, supplied.json(), "accept")
    assert accepted.status_code == 200, accepted.text
    closed = act(client, officer, accepted.json(), "close")
    assert closed.status_code == 200 and closed.json()["current_status"] == "RESOLVED"
    assert closed.json()["review_outcome"] == "closed"
    assert act(client, officer, closed.json(), "accept").status_code == 409
    root = f"/api/v1/complaints/{reviewed['complaint_id']}"
    history = client.get(f"{root}/review-history", headers=owner)
    assert_response(history, "/api/v1/complaints/{id}/review-history", "get")
    assert [row["action"] for row in history.json()] == [
        "request_information",
        "provide_information",
        "accept",
        "close",
    ]
    other = client.get(
        f"/api/v1/officer/complaints/{reviewed['complaint_id']}/review-history", headers=officer
    )
    assert_response(other, "/api/v1/officer/complaints/{id}/review-history", "get")
    assert other.json() == history.json()
    current = client.get(root, headers=owner).json()
    assert current["incident_data"] == reviewed["incident_data"]
    assert current["submission_reference"] == reviewed["submission_reference"]
    assert client.patch(root, headers=owner, json={"amount": 9000}).status_code == 409
    # Legitimate review metadata revisions do not invalidate receipt binding.
    receipt = client.get(
        "/api/v1/mock/complaints/by-idempotency-key/submission-test-1", headers=owner
    )
    assert receipt.status_code == 200, receipt.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(MockSubmission)).payload == original
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1
    messages = notifications(client, owner)
    assert any("requested more information" in n["message"] for n in messages)
    assert all("SMS" not in n["message"] and "review reason" not in n["message"] for n in messages)


@pytest.mark.parametrize(
    "action,outcome,status",
    [
        ("accept", "accepted", "OFFICER_REVIEW"),
        ("reject", "rejected", "RESOLVED"),
        ("escalate", "escalated", "OFFICER_REVIEW"),
    ],
)
def test_initial_officer_decisions_are_persisted(
    client, officer, reviewed, action, outcome, status
):
    result = act(client, officer, reviewed, action)
    assert result.status_code == 200, result.text
    assert result.json()["review_outcome"] == outcome and result.json()["current_status"] == status
    assert result.json()["destination_workspace_id"] == reviewed["destination_workspace_id"]
    assert result.json()["rule_version_id"] == reviewed["rule_version_id"]


def test_review_requires_reason_version_key_and_legal_transition(client, officer, reviewed, app):
    path = f"/api/v1/officer/complaints/{reviewed['complaint_id']}/actions"
    body = {"action": "accept", "reason": "Synthetic reason"}
    assert client.post(path, headers=officer, json=body).status_code == 400
    assert act(client, officer, reviewed, "accept", reason="   ").status_code == 400
    assert act(client, officer, reviewed, "close").status_code == 409
    assert act(client, officer, reviewed, "accept", version=1).status_code == 412
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ReviewEvent)) == 0


def test_command_replay_and_conflicting_key_reuse(client, officer, reviewed, app):
    first = act(client, officer, reviewed, "accept", key="officer-command")
    assert first.status_code == 200, first.text
    count = len(notifications(client, officer))
    assert act(client, officer, reviewed, "accept", key="officer-command").json() == first.json()
    assert len(notifications(client, officer)) == count
    assert act(client, officer, reviewed, "reject", key="officer-command").status_code == 409
    assert act(client, officer, first.json(), "accept", key="officer-command").status_code == 409
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ReviewEvent)) == 1


def test_wrong_roles_workspace_and_unassigned_officer_cannot_decide(client, auth, reviewed, app):
    for user_id in [
        "demo-admin",
        "demo-citizen-1",
        "demo-citizen-2",
        "demo-helper",
        "demo-officer-digital",
    ]:
        headers = auth(user_id)
        assert act(client, headers, reviewed, "accept").status_code == 403
        assert (
            client.get(
                f"/api/v1/officer/complaints/{reviewed['complaint_id']}/review-history",
                headers=headers,
            ).status_code
            == 403
        )
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ReviewEvent)) == 0


def test_unassigned_filed_case_cannot_be_reviewed(client, officer, filed_case):
    assert act(client, officer, filed_case, "accept").status_code == 403


def workspace_consent(client, owner, case):
    return next(
        c
        for c in client.get(
            f"/api/v1/complaints/{case['complaint_id']}/consents", headers=owner
        ).json()
        if c["recipient"].startswith("workspace:")
    )


def test_withdrawal_blocks_actions_history_notifications_and_responses(
    client, owner, officer, reviewed
):
    requested = act(client, officer, reviewed, "request_information").json()
    notice = notifications(client, officer)[0]
    consent = workspace_consent(client, owner, reviewed)
    assert (
        client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner).status_code
        == 200
    )
    assert act(client, officer, requested, "escalate").status_code == 403
    assert answer(client, owner, requested).status_code == 403
    assert (
        client.get(
            f"/api/v1/officer/complaints/{reviewed['complaint_id']}/review-history", headers=officer
        ).status_code
        == 403
    )
    assert notifications(client, officer) == []
    assert (
        client.post(
            f"/api/v1/notifications/{notice['notification_id']}/read", headers=officer
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"/api/v1/complaints/{reviewed['complaint_id']}/review-history", headers=owner
        ).status_code
        == 200
    )
    assert any("withdrawn" in n["message"] for n in notifications(client, owner))


def test_status_only_consent_cannot_authorize_a_full_review(client, owner, officer, reviewed):
    consent = workspace_consent(client, owner, reviewed)
    result = client.patch(
        f"/api/v1/consents/{consent['consent_id']}",
        headers=owner,
        json={"data_scopes": ["case_status"]},
    )
    assert result.status_code == 200
    assert (
        client.get(
            f"/api/v1/officer/complaints/{reviewed['complaint_id']}", headers=officer
        ).json()["incident_data"]
        == {}
    )
    assert act(client, officer, reviewed, "accept").status_code == 403
    assert (
        client.get(
            f"/api/v1/officer/complaints/{reviewed['complaint_id']}/review-history", headers=officer
        ).status_code
        == 403
    )
    assert notifications(client, officer)  # Generic status messages contain no sensitive prose.


def test_notifications_are_owned_and_read_markers_are_idempotent(
    client, owner, officer, reviewed, auth, app
):
    notice = notifications(client, owner)[0]
    path = f"/api/v1/notifications/{notice['notification_id']}/read"
    for user_id in ["demo-admin", "demo-citizen-2", "demo-helper"]:
        headers = auth(user_id)
        assert client.post(path, headers=headers).status_code == 404
        assert notifications(client, headers) == []
    result = client.post(path, headers=owner)
    assert result.status_code == 200 and result.json()["read"]
    assert_response(result, "/api/v1/notifications/{id}/read", "post")
    assert client.post(path, headers=owner).json() == result.json()
    with Session(app.state.engine) as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.action == "notification.read")
            )
            == 1
        )


def test_revoked_helper_loses_historical_notification_access(
    client, owner, officer, reviewed, auth
):
    give_helper(client, owner, reviewed["complaint_id"])
    give_consent(client, owner, reviewed["complaint_id"], ["case_status"])
    helper = auth("demo-helper")
    assert act(client, officer, reviewed, "accept").status_code == 200
    notice = notifications(client, helper)[0]
    assert (
        client.post(
            f"/api/v1/complaints/{reviewed['complaint_id']}/helper-grants/demo-helper/revoke",
            headers=owner,
        ).status_code
        == 200
    )
    assert notifications(client, helper) == []
    assert (
        client.post(
            f"/api/v1/notifications/{notice['notification_id']}/read", headers=helper
        ).status_code
        == 403
    )


def test_reassignment_hides_old_officer_notifications_and_noop_does_not_duplicate(
    client, auth, reviewed, officer
):
    created = client.post(
        "/api/v1/admin/users",
        headers=auth(),
        json={
            "user_id": "another-officer",
            "password": DEMO_PASSWORD,
            "role": "Officer",
            "workspace_id": reviewed["destination_workspace_id"],
        },
    )
    assert created.status_code == 201, created.text
    assert assign(client, auth, reviewed["complaint_id"], "another-officer").status_code == 200
    new_officer = auth("another-officer")
    count = len(notifications(client, new_officer))
    assert count == 1 and notifications(client, officer) == []
    assert assign(client, auth, reviewed["complaint_id"], "another-officer").status_code == 200
    assert len(notifications(client, new_officer)) == count
    assert act(client, officer, reviewed, "accept").status_code == 403


def test_citizen_cannot_send_unsolicited_or_unconfirmed_supplement(
    client, owner, officer, reviewed
):
    assert answer(client, owner, reviewed).status_code == 409
    requested = act(client, officer, reviewed, "request_information").json()
    assert answer(client, owner, requested, allow_recipient_sharing=False).status_code == 400
    result = answer(client, owner, requested)
    assert result.status_code == 200
    assert answer(client, owner, requested).json() == result.json()
    assert answer(client, owner, result.json(), key="second-answer").status_code == 409


def test_lost_review_commit_acknowledgment_does_not_duplicate_events_or_notices(
    client, officer, reviewed, app, monkeypatch
):
    original = Session.commit
    fired = []

    def remember(session, context):
        if any(isinstance(row, ReviewEvent) for row in session.new):
            session.info["test_review_write"] = True

    def lose_ack(session):
        original(session)
        if session.info.get("test_review_write") and not fired:
            fired.append(True)
            raise OperationalError("synthetic lost commit response", {}, Exception("lost"))

    event.listen(Session, "after_flush", remember)
    try:
        monkeypatch.setattr(Session, "commit", lose_ack)
        result = act(client, officer, reviewed, "accept", key="uncertain-command")
        assert result.status_code == 503 and fired, result.text
        count = len(notifications(client, officer))
        recovered = act(client, officer, reviewed, "accept", key="uncertain-command")
        assert recovered.status_code == 200 and recovered.json()["review_outcome"] == "accepted", (
            recovered.text
        )
        assert len(notifications(client, officer)) == count
    finally:
        event.remove(Session, "after_flush", remember)
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ReviewEvent)) == 1


@pytest.mark.parametrize("same_key", [False, True])
def test_concurrent_commands_are_serialized(client, officer, reviewed, app, same_key):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("Cross-worker command locking is verified on PostgreSQL.")
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = [
            pool.submit(
                act,
                client,
                officer,
                reviewed,
                "accept",
                key="shared" if same_key else f"command-{i}",
            )
            for i in range(2)
        ]
        results = [future.result(timeout=25) for future in pending]
    assert sorted(r.status_code for r in results) == ([200, 200] if same_key else [200, 412]), [
        r.text for r in results
    ]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(ReviewEvent)) == 1


def test_review_history_is_append_only(client, officer, reviewed, app):
    assert act(client, officer, reviewed, "accept").status_code == 200
    statements = ["UPDATE review_events SET message = 'changed'", "DELETE FROM review_events"]
    if app.state.engine.dialect.name == "postgresql":
        statements.append("TRUNCATE review_events")
    for statement in statements:
        with Session(app.state.engine) as session:
            with pytest.raises(DatabaseError):
                session.execute(text(statement))
            session.rollback()


def test_upgrade_preserves_existing_filing_and_approval(client, owner, filed_case, app):
    with Session(app.state.engine) as session:
        payload = deepcopy(session.scalar(select(MockSubmission)).payload)
    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "0006")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    assert client.get("/api/v1/health/ready").status_code == 200
    assert (
        client.get(f"/api/v1/complaints/{filed_case['complaint_id']}", headers=owner).json()
        == filed_case
    )
    with Session(app.state.engine) as session:
        assert session.scalar(select(MockSubmission)).payload == payload
        assert session.scalar(select(func.count()).select_from(Notification)) == 0


def test_attached_evidence_requires_current_evidence_consent_for_review(
    client, owner, officer, auth, app, case_factory, provider
):
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
        seed_mock_services(session)
    case = case_factory(body=COMPLETE)
    assert upload(client, owner, case).status_code == 201
    assert analyze(client, owner, case).status_code == 200
    case = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    grants(client, owner, case)
    approved = approve(client, owner, case)
    assert submit(client, owner, approved).json()["submitted"]
    assert assign(client, auth, case["complaint_id"]).status_code == 200
    current = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    consent = workspace_consent(client, owner, case)
    consent_path = f"/api/v1/consents/{consent['consent_id']}"
    assert (
        client.patch(
            consent_path, headers=owner, json={"data_scopes": ["case_status", "incident_data"]}
        ).status_code
        == 200
    )
    assert act(client, officer, current, "accept").status_code == 403
    assert (
        client.get(
            f"/api/v1/officer/complaints/{case['complaint_id']}/review-history", headers=officer
        ).status_code
        == 403
    )
    assert (
        client.patch(
            consent_path,
            headers=owner,
            json={"data_scopes": ["case_status", "incident_data", "evidence"]},
        ).status_code
        == 200
    )
    assert act(client, officer, current, "accept").status_code == 200


def test_noop_consent_patch_preserves_approval_and_does_not_issue_notices(client, owner, approved):
    consent = workspace_consent(client, owner, approved)
    count = len(notifications(client, owner))
    result = client.patch(
        f"/api/v1/consents/{consent['consent_id']}",
        headers=owner,
        json={"data_scopes": consent["data_scopes"]},
    )
    assert result.status_code == 200 and result.json() == consent
    assert len(notifications(client, owner)) == count
    assert client.get(
        f"/api/v1/complaints/{approved['complaint_id']}/authorization", headers=owner
    ).json()["active"]
    assert submit(client, owner, approved).json()["submitted"]


def test_review_key_cannot_be_reused_for_a_second_case(
    client, officer, reviewed, owner, auth, ready_factory
):
    assert act(client, officer, reviewed, "accept", key="one-command").status_code == 200
    second = ready_factory(description="Another synthetic report without a known reference.")
    grants(client, owner, second)
    second = approve(client, owner, second)
    assert submit(client, owner, second, key="second-filing").json()["submitted"]
    assert assign(client, auth, second["complaint_id"]).status_code == 200
    second = client.get(f"/api/v1/complaints/{second['complaint_id']}", headers=owner).json()
    assert act(client, officer, second, "accept", key="one-command").status_code == 409


def test_status_alone_does_not_fabricate_a_filed_review(client, officer, auth, submitted_case):
    assert assign(client, auth, submitted_case["complaint_id"]).status_code == 200
    current = client.get(
        f"/api/v1/officer/complaints/{submitted_case['complaint_id']}", headers=officer
    ).json()
    assert act(client, officer, current, "accept").status_code == 409


def test_duplicate_consent_change_rolls_back_without_a_notification(client, owner, case):
    helper = give_consent(client, owner, case["complaint_id"])
    workspace = give_consent(
        client,
        owner,
        case["complaint_id"],
        recipient="workspace:mock-financial-fraud",
        purpose="complaint_submission",
    )
    count = len(notifications(client, owner))
    result = client.patch(
        f"/api/v1/consents/{helper['consent_id']}",
        headers=owner,
        json={"recipient": workspace["recipient"], "purpose": workspace["purpose"]},
    )
    assert result.status_code == 409, result.text
    assert len(notifications(client, owner)) == count
    records = client.get(
        f"/api/v1/complaints/{case['complaint_id']}/consents", headers=owner
    ).json()
    assert (
        next(r for r in records if r["consent_id"] == helper["consent_id"])["recipient"]
        == helper["recipient"]
    )
