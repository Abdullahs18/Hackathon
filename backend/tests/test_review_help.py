import pytest
from sqlalchemy.orm import Session

from app.models import Complaint
from tests.test_cases import case_factory, owner
from tests.test_contract import assert_response
from tests.test_submission import approved, provider, ready, ready_factory, submit

__all__ = ["case_factory", "owner", "provider", "ready_factory", "ready", "approved"]


@pytest.fixture
def stopped(app, case_factory):
    case = case_factory()
    with Session(app.state.engine) as session, session.begin():
        session.get(Complaint, case["complaint_id"]).current_status = "HUMAN_REVIEW"
    return case


def request(client, owner, case, key="help-1", **changes):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/review-help",
        headers={**owner, "If-Match": f'"{case["version"]}"', "Idempotency-Key": key},
        json={"helper_id": "demo-helper", "allow_sharing": True, **changes},
    )


def test_request_acknowledge_response_preserves_case(client, auth, owner, stopped):
    root = f"/api/v1/complaints/{stopped['complaint_id']}"
    before = client.get(root, headers=owner).json()
    result = request(client, owner, stopped)
    assert result.status_code == 200, result.text
    assert_response(result, "/api/v1/complaints/{id}/review-help", "post")
    row = result.json()
    assert row["status"] == "requested" and row["access_active"]
    assert request(client, owner, stopped).json() == row
    assert request(client, owner, stopped, "another-key").status_code == 409
    headers = {**auth("demo-helper"), "If-Match": f'"{stopped["version"]}"'}
    body = {"request_id": row["request_id"]}
    assert (
        client.post(
            root + "/review-help/respond", headers=headers, json={**body, "note": "Review date."}
        ).status_code
        == 409
    )
    ack = client.post(root + "/review-help/acknowledge", headers=headers, json=body)
    assert ack.status_code == 200, ack.text
    assert ack.json()["acknowledged_at"]
    reply = client.post(
        root + "/review-help/respond",
        headers=headers,
        json={**body, "note": "Please confirm the date; keep it unknown if unsure."},
    )
    assert reply.status_code == 200, reply.text
    assert reply.json()["status"] == "completed"
    assert_response(reply, "/api/v1/complaints/{id}/review-help/respond", "post")
    inbox = client.get(root + "/review-help", headers=owner)
    assert inbox.json()["requests"][0]["note"] == reply.json()["note"]
    assert client.get(root, headers=owner).json() == before
    assert all(
        "evidence" not in field and "voice" not in field and "corrections" not in field
        for field in inbox.json()["shared_fields"]
    )
    assert (
        client.post(
            root + "/review-help/respond",
            headers=headers,
            json={**body, "note": reply.json()["note"]},
        ).status_code
        == 200
    )
    assert (
        client.post(
            root + "/review-help/respond",
            headers=headers,
            json={**body, "note": "Changed response"},
        ).status_code
        == 409
    )


@pytest.mark.parametrize("role", ["demo-citizen-2", "demo-admin", "demo-officer-financial"])
def test_help_is_scoped_to_owner_and_named_helper(client, auth, owner, stopped, role):
    row = request(client, owner, stopped).json()
    root = f"/api/v1/complaints/{stopped['complaint_id']}/review-help"
    assert client.get(root, headers=auth(role)).status_code == 403
    result = client.post(
        root + "/acknowledge",
        headers={**auth(role), "If-Match": '"1"'},
        json={"request_id": row["request_id"]},
    )
    assert result.status_code == 403


def test_request_requires_state_version_and_explicit_permission(
    client, owner, case_factory, stopped
):
    assert request(client, owner, case_factory()).status_code == 409
    assert request(client, owner, {**stopped, "version": 99}).status_code == 412
    assert request(client, owner, stopped, allow_sharing=False).status_code == 400
    assert request(client, owner, stopped, helper_id="demo-admin").status_code == 400


def test_graph_progress_contains_only_committed_steps(client, owner, approved, auth):
    root = f"/api/v1/complaints/{approved['complaint_id']}"
    assert client.get(root + "/agent-progress", headers=owner).json() == {"runs": []}
    result = submit(client, owner, approved)
    assert result.status_code == 200, result.text
    response = client.get(root + "/agent-progress", headers=owner)
    assert_response(response, "/api/v1/complaints/{id}/agent-progress", "get")
    run = response.json()["runs"][0]
    assert len(run["steps"]) == 5
    assert run["submission_reference"] == result.json()["submission_reference"]
    assert any(step["status"] == "skipped" for step in run["steps"])
    assert all(set(step) == {"step", "status", "timestamp"} for step in run["steps"])
    for role in ["demo-citizen-2", "demo-helper", "demo-admin", "demo-officer-financial"]:
        assert client.get(root + "/agent-progress", headers=auth(role)).status_code == 403


def test_withdrawal_blocks_helper_and_replay_does_not_restore_permission(
    client, owner, stopped, auth
):
    row = request(client, owner, stopped).json()
    root = f"/api/v1/complaints/{stopped['complaint_id']}"
    consents = client.get(root + "/consents", headers=owner).json()
    consent = next(item for item in consents if item["recipient"] == "user:demo-helper")
    result = client.post("/api/v1/consents/" + consent["consent_id"] + "/withdraw", headers=owner)
    assert result.status_code == 200, result.text
    replay = request(client, owner, stopped)
    assert replay.status_code == 200 and not replay.json()["access_active"]
    helper = auth("demo-helper")
    assert client.get(root + "/review-help", headers=helper).status_code == 403
    assert (
        client.post(
            root + "/review-help/acknowledge",
            headers={**helper, "If-Match": '"1"'},
            json={"request_id": row["request_id"]},
        ).status_code
        == 403
    )


def test_read_only_release_check_covers_current_contract_and_roles(client):
    from app.release_check import check
    from tests.conftest import DEMO_PASSWORD

    result = check(client, DEMO_PASSWORD)
    assert result["passed"], result
    assert len(result["checks"]) == 8
