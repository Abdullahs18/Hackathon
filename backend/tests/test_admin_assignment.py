from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.models import Complaint, User
from app.submission_policy import DRAFT_FIELDS
from tests.test_api_keys import credential, key_factory
from tests.test_cases import assign, case_factory, owner
from tests.test_contract import assert_response
from tests.test_review import act
from tests.test_submission import approve, grants, provider, ready_factory, submit

__all__ = ["case_factory", "owner", "provider", "ready_factory", "key_factory"]
PATH = "/api/v1/admin/complaints"


@pytest.fixture
def filing_factory(client, owner, ready_factory):
    def create(**changes):
        case = ready_factory(description="PRIVATE CITIZEN STATEMENT " + str(uuid4()), **changes)
        permissions = grants(client, owner, case)
        approval = approve(client, owner, case)
        result = submit(client, owner, approval, key=str(uuid4()))
        assert result.status_code == 200, result.text
        return client.get(
            "/api/v1/complaints/" + case["complaint_id"], headers=owner
        ).json(), permissions

    return create


def test_queue_requires_admin_and_returns_no_raw_citizen_fields(client, auth, filing_factory, app):
    case, _ = filing_factory()
    with Session(app.state.engine) as session, session.begin():
        session.get(User, "demo-officer-digital").active = False
    result = client.get(PATH, headers=auth())
    assert result.status_code == 200, result.text
    assert_response(result, PATH, "get")
    body = result.json()
    assert body["items"][0]["complaint_id"] == case["complaint_id"]
    assert body["items"][0]["submission_reference"] == case["submission_reference"]
    assert body["items"][0]["recipient_consent_active"] is True
    assert body["items"][0]["assigned_officer_id"] is None
    assert body["officers"] == [
        {"user_id": "demo-officer-financial", "workspace_id": "mock-financial-fraud"}
    ]
    assert "PRIVATE CITIZEN STATEMENT" not in result.text
    assert all(
        key not in body["items"][0]
        for key in [
            "citizen_id",
            "incident_data",
            "complaint_draft",
            "evidence_ids",
            "authorization_id",
            "agent_run_id",
        ]
    )
    assert client.get(PATH).status_code == 401
    for account in ["demo-citizen-1", "demo-helper", "demo-officer-financial"]:
        assert client.get(PATH, headers=auth(account)).status_code == 403


def test_unsubmitted_and_terminal_cases_do_not_enter_assignment_queue(
    client, auth, case_factory, filing_factory, app
):
    draft = case_factory()
    case, _ = filing_factory()
    with Session(app.state.engine) as session, session.begin():
        # A status alone must never masquerade as a confirmed filing.
        session.get(Complaint, draft["complaint_id"]).current_status = "SUBMITTED"
        session.get(Complaint, case["complaint_id"]).current_status = "RESOLVED"
    assert client.get(PATH + "?assignment=all", headers=auth()).json()["items"] == []


def test_queue_tracks_assignment_and_withdrawn_consent(client, auth, owner, filing_factory):
    case, permissions = filing_factory()
    assert assign(client, auth, case["complaint_id"]).status_code == 200
    assert client.get(PATH, headers=auth()).json()["items"] == []
    rows = client.get(PATH + "?assignment=assigned", headers=auth()).json()["items"]
    assert rows[0]["assigned_officer_id"] == "demo-officer-financial"
    grant = permissions["workspace:mock-financial-fraud"]
    assert (
        client.post(
            "/api/v1/consents/" + grant["consent_id"] + "/withdraw", headers=owner
        ).status_code
        == 200
    )
    rows = client.get(PATH + "?assignment=all", headers=auth()).json()["items"]
    assert rows[0]["recipient_consent_active"] is False
    assert assign(client, auth, case["complaint_id"]).status_code == 403


def test_queue_cursor_is_bounded_and_bound_to_assignment_filter(client, auth, filing_factory):
    first, _ = filing_factory()
    second, _ = filing_factory()
    page = client.get(PATH + "?limit=1", headers=auth()).json()
    assert len(page["items"]) == 1 and page["next_cursor"]
    other = client.get(PATH, headers=auth(), params={"limit": 1, "before": page["next_cursor"]})
    assert other.status_code == 200, other.text
    assert {page["items"][0]["complaint_id"], other.json()["items"][0]["complaint_id"]} == {
        first["complaint_id"],
        second["complaint_id"],
    }
    assert other.json()["next_cursor"] is None
    for params in [
        {"limit": 0},
        {"limit": 101},
        {"assignment": "private"},
        {"before": str(uuid4())},
        {"before": page["next_cursor"], "assignment": "assigned"},
    ]:
        assert client.get(PATH, headers=auth(), params=params).status_code == 400


def test_queue_api_keys_require_admin_cases_scope(client, auth, key_factory):
    allowed = credential(key_factory(principal="demo-admin", scopes=["admin:cases"]))
    denied = credential(key_factory(principal="demo-admin", scopes=["admin:users"]))
    assert client.get(PATH, headers=allowed).status_code == 200
    assert client.get(PATH, headers=denied).status_code == 403


def test_exact_filed_field_consents_allow_officer_accept_and_close(
    client, auth, owner, filing_factory
):
    case, permissions = filing_factory()
    scope_path = "/api/v1/consents/" + permissions["workspace:mock-financial-fraud"]["consent_id"]
    fields = ["case_status", *(f"incident_data.{field}" for field in DRAFT_FIELDS)]
    assert client.patch(scope_path, headers=owner, json={"data_scopes": fields}).status_code == 200
    assert assign(client, auth, case["complaint_id"]).status_code == 200
    officer = auth("demo-officer-financial")
    accepted = act(client, officer, case, "accept")
    assert accepted.status_code == 200, accepted.text
    closed = act(client, officer, accepted.json(), "close")
    assert closed.status_code == 200 and closed.json()["current_status"] == "RESOLVED", closed.text
    assert client.get(PATH + "?assignment=all", headers=auth()).json()["items"] == []
