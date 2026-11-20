from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, CaseAssignment, Complaint
from tests.test_contract import assert_response


@pytest.fixture
def owner(auth):
    return auth("demo-citizen-1")


@pytest.fixture
def case_factory(client, auth):
    def create(citizen="demo-citizen-1", body=None):
        result = client.post(
            "/api/v1/complaints",
            headers=auth(citizen),
            json=body
            or {
                "description": "PRIVATE-INCIDENT-DESCRIPTION",
                "amount": 1500,
                "currency": "PKR",
                "transaction_reference": "DEMO123",
                "incident_type": "fake aid scam",
            },
        )
        assert result.status_code == 201, result.text
        return result.json()

    return create


@pytest.fixture
def case(case_factory):
    return case_factory()


def give_consent(
    client, headers, case_id, scopes=None, recipient="user:demo-helper", purpose="helper_assistance"
):
    response = client.post(
        f"/api/v1/complaints/{case_id}/consents",
        headers=headers,
        json={
            "recipient": recipient,
            "purpose": purpose,
            "data_scopes": scopes if scopes is not None else ["case_status", "incident_data"],
        },
    )
    assert response.status_code == 201, response.text
    assert_response(response, "/api/v1/complaints/{id}/consents", "post")
    return response.json()


def give_helper(client, headers, case_id, helper_id="demo-helper"):
    response = client.post(
        f"/api/v1/complaints/{case_id}/helper-grants",
        headers=headers,
        json={"helper_id": helper_id},
    )
    assert response.status_code in (200, 201), response.text
    assert_response(response, "/api/v1/complaints/{id}/helper-grants", "post")
    return response.json()


def test_create_list_recover_and_update_draft(client, owner, case):
    assert case["citizen_id"] == "demo-citizen-1"
    assert case["current_status"] == "DRAFT"
    assert case["destination_workspace_id"] is None and case["rule_version_id"] is None
    assert case["version"] == 1
    response = client.get("/api/v1/complaints", headers=owner)
    assert_response(response, "/api/v1/complaints", "get")
    assert [c["complaint_id"] for c in response.json()] == [case["complaint_id"]]
    path = f"/api/v1/complaints/{case['complaint_id']}"
    loaded = client.get(path, headers=owner)
    assert_response(loaded, "/api/v1/complaints/{id}", "get")
    assert loaded.headers["etag"] == '"1"'
    patched = client.patch(path, headers={**owner, "If-Match": '"1"'}, json={"amount": None})
    assert_response(patched, "/api/v1/complaints/{id}", "patch")
    assert patched.json()["incident_data"]["amount"] is None
    assert patched.json()["incident_data"]["transaction_reference"] == "DEMO123"
    assert patched.json()["version"] == 2 and patched.headers["etag"] == '"2"'
    assert patched.json()["updated_at"] >= case["updated_at"]
    # A new request/session recovers the persisted draft.
    assert client.get(path, headers=owner).json() == patched.json()
    unchanged = client.patch(path, headers=owner, json={"amount": None})
    assert unchanged.json()["version"] == 2


def test_stale_save_does_not_overwrite(client, owner, case):
    path = f"/api/v1/complaints/{case['complaint_id']}"
    assert (
        client.patch(path, headers={**owner, "If-Match": '"1"'}, json={"amount": 2000}).status_code
        == 200
    )
    response = client.patch(path, headers={**owner, "If-Match": '"1"'}, json={"amount": 9999})
    assert response.status_code == 412
    assert_response(response, "/api/v1/complaints/{id}", "patch")
    assert client.get(path, headers=owner).json()["incident_data"]["amount"] == 2000


def test_create_retry_key_is_bound_to_citizen_and_payload(client, auth, owner):
    headers = {**owner, "Idempotency-Key": "draft-retry-key"}
    first = client.post("/api/v1/complaints", headers=headers, json={"amount": 1500})
    second = client.post("/api/v1/complaints", headers=headers, json={"amount": 1500})
    assert first.status_code == 201 and second.status_code == 200
    assert_response(first, "/api/v1/complaints", "post")
    assert_response(second, "/api/v1/complaints", "post")
    assert first.json()["complaint_id"] == second.json()["complaint_id"]
    conflict = client.post("/api/v1/complaints", headers=headers, json={"amount": 2000})
    assert conflict.status_code == 409
    assert_response(conflict, "/api/v1/complaints", "post")
    other = client.post(
        "/api/v1/complaints",
        headers={**auth("demo-citizen-2"), "Idempotency-Key": "draft-retry-key"},
        json={"amount": 1500},
    )
    assert other.status_code == 201
    assert other.json()["complaint_id"] != first.json()["complaint_id"]
    assert len(client.get("/api/v1/complaints", headers=owner).json()) == 1


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"amount": "1500"},
        {"current_status": "SUBMITTED"},
        {"citizen_id": "demo-citizen-2"},
        {"incident_type": "x" * 201},
        {"evidence_ids": ["invented"]},
    ],
)
def test_invalid_patches_and_protected_fields(client, owner, case, body):
    assert (
        client.patch(
            f"/api/v1/complaints/{case['complaint_id']}", headers=owner, json=body
        ).status_code
        == 400
    )


@pytest.mark.parametrize("role_user", ["demo-helper", "demo-admin", "demo-officer-financial"])
def test_non_citizens_cannot_create_or_list_own_cases(client, auth, role_user):
    headers = auth(role_user)
    assert client.post("/api/v1/complaints", headers=headers, json={}).status_code == 403
    assert client.get("/api/v1/complaints", headers=headers).status_code == 403


def test_other_citizen_cannot_read_write_or_share_case(client, auth, case):
    headers = auth("demo-citizen-2")
    base = f"/api/v1/complaints/{case['complaint_id']}"
    assert client.get(base, headers=headers).status_code == 403
    assert client.patch(base, headers=headers, json={"amount": 1}).status_code == 403
    assert client.get(base + "/consents", headers=headers).status_code == 403
    assert (
        client.post(
            base + "/consents",
            headers=headers,
            json={
                "recipient": "user:demo-helper",
                "purpose": "helper_assistance",
                "data_scopes": ["case_status"],
            },
        ).status_code
        == 403
    )
    assert (
        client.post(
            base + "/helper-grants", headers=headers, json={"helper_id": "demo-helper"}
        ).status_code
        == 403
    )
    assert client.get("/api/v1/complaints", headers=headers).json() == []


def test_admin_has_no_incident_data_bypass(client, auth, case):
    response = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=auth())
    assert response.status_code == 403
    assert "PRIVATE" not in response.text


def test_helper_requires_both_grant_and_current_consent(client, auth, owner, case):
    headers = auth("demo-helper")
    path = f"/api/v1/complaints/{case['complaint_id']}"
    assert client.get(path, headers=headers).status_code == 403
    give_consent(client, owner, case["complaint_id"])
    assert client.get(path, headers=headers).status_code == 403
    give_helper(client, owner, case["complaint_id"])
    response = client.get(path, headers=headers)
    assert response.status_code == 200
    assert_response(response, "/api/v1/complaints/{id}", "get")
    assert response.json()["incident_data"]["amount"] == 1500
    revoked = client.post(path + "/helper-grants/demo-helper/revoke", headers=owner)
    assert_response(revoked, "/api/v1/complaints/{id}/helper-grants/{helper_id}/revoke", "post")
    assert client.get(path, headers=headers).status_code == 403
    assert client.get("/api/v1/helper/complaints", headers=headers).json() == []


def test_consent_withdrawal_blocks_helper_reads_and_writes(client, auth, owner, case):
    headers = auth("demo-helper")
    case_id = case["complaint_id"]
    give_helper(client, owner, case_id)
    consent = give_consent(client, owner, case_id)
    assert client.get(f"/api/v1/complaints/{case_id}", headers=headers).status_code == 200
    withdrawal = client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner)
    assert_response(withdrawal, "/api/v1/consents/{id}/withdraw", "post")
    assert withdrawal.json()["status"] == "withdrawn" and withdrawal.json()["withdrawn_at"]
    assert client.get(f"/api/v1/complaints/{case_id}", headers=headers).status_code == 403
    assert (
        client.post(
            f"/api/v1/complaints/{case_id}/helper-information", headers=headers, json={"amount": 9}
        ).status_code
        == 403
    )
    assert client.get("/api/v1/helper/complaints", headers=headers).json() == []
    # Re-activating a grant alone never re-activates withdrawn consent.
    give_helper(client, owner, case_id)
    assert client.get(f"/api/v1/complaints/{case_id}", headers=headers).status_code == 403
    assert (
        client.patch(
            f"/api/v1/consents/{consent['consent_id']}",
            headers=owner,
            json={"data_scopes": ["case_status"]},
        ).status_code
        == 409
    )
    new_consent = give_consent(client, owner, case_id)
    assert new_consent["consent_id"] != consent["consent_id"]
    assert client.get(f"/api/v1/complaints/{case_id}", headers=headers).status_code == 200


def test_helper_field_filtering_and_scope_reduction_are_immediate(client, auth, owner, case, app):
    case_id = case["complaint_id"]
    give_helper(client, owner, case_id)
    consent = give_consent(client, owner, case_id, scopes=["case_status", "incident_data.amount"])
    helper = auth("demo-helper")
    path = f"/api/v1/complaints/{case_id}"
    loaded = client.get(path, headers=helper)
    assert loaded.json()["incident_data"] == {"amount": 1500}
    assert "incident_type" not in loaded.json()
    assert "PRIVATE" not in loaded.text and "DEMO123" not in loaded.text
    assert (
        client.post(
            path + "/helper-information", headers=helper, json={"description": "outside scope"}
        ).status_code
        == 403
    )
    updated = client.post(path + "/helper-information", headers=helper, json={"amount": 1700})
    assert updated.status_code == 200
    assert_response(updated, "/api/v1/complaints/{id}/helper-information", "post")
    assert updated.json()["incident_data"] == {"amount": 1700}
    # Even a previously generated formal draft must not leak through a narrow grant.
    with Session(app.state.engine) as session, session.begin():
        session.get(Complaint, case_id).complaint_draft = {"description": "PRIVATE FORMAL DRAFT"}
    assert "complaint_draft" not in client.get(path, headers=helper).json()
    response = client.patch(
        f"/api/v1/consents/{consent['consent_id']}",
        headers=owner,
        json={"data_scopes": ["case_status"]},
    )
    assert_response(response, "/api/v1/consents/{id}", "patch")
    assert client.get(path, headers=helper).json()["incident_data"] == {}
    assert (
        client.post(path + "/helper-information", headers=helper, json={"amount": 1800}).status_code
        == 403
    )


def test_helper_can_assist_multiple_citizens_but_not_unrelated_case(client, auth, case_factory):
    first = case_factory()
    second = case_factory("demo-citizen-2")
    unrelated = case_factory("demo-citizen-2")
    for item in [first, second]:
        owner = auth(item["citizen_id"])
        give_helper(client, owner, item["complaint_id"])
        give_consent(client, owner, item["complaint_id"])
    helper = auth("demo-helper")
    response = client.get("/api/v1/helper/complaints", headers=helper)
    assert_response(response, "/api/v1/helper/complaints", "get")
    assert {item["complaint_id"] for item in response.json()} == {
        first["complaint_id"],
        second["complaint_id"],
    }
    assert (
        client.get(f"/api/v1/complaints/{unrelated['complaint_id']}", headers=helper).status_code
        == 403
    )


def test_helper_cannot_confirm_corrections_or_manage_consent(client, auth, owner, case):
    case_id = case["complaint_id"]
    give_helper(client, owner, case_id)
    give_consent(client, owner, case_id)
    helper = auth("demo-helper")
    base = f"/api/v1/complaints/{case_id}"
    assert (
        client.post(
            base + "/helper-information",
            headers=helper,
            json={"citizen_confirmed_corrections": ["confirmed"]},
        ).status_code
        == 400
    )
    assert client.patch(base, headers=helper, json={"amount": 9}).status_code == 403
    assert (
        client.post(
            base + "/consents",
            headers=helper,
            json={
                "recipient": "user:demo-helper",
                "purpose": "helper_assistance",
                "data_scopes": ["case_status"],
            },
        ).status_code
        == 403
    )


@pytest.mark.parametrize(
    "body",
    [
        {"recipient": "demo-helper"},
        {"recipient": "user:demo-admin"},
        {"purpose": "anything"},
        {"purpose": "complaint_submission"},
        {"data_scopes": ["all"]},
        {"data_scopes": []},
        {"data_scopes": ["case_status", "case_status"]},
        {"citizen_id": "demo-citizen-2"},
    ],
)
def test_bad_consent_scopes_recipients_and_grantor_injection(client, owner, case, body):
    payload = {
        "recipient": "user:demo-helper",
        "purpose": "helper_assistance",
        "data_scopes": ["case_status"],
    } | body
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/consents", headers=owner, json=payload
    )
    assert response.status_code == 400


def test_duplicate_active_consent_is_rejected_without_erasing_history(client, owner, case):
    consent = give_consent(client, owner, case["complaint_id"])
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/consents",
        headers=owner,
        json={
            "recipient": consent["recipient"],
            "purpose": consent["purpose"],
            "data_scopes": consent["data_scopes"],
        },
    )
    assert response.status_code == 409
    assert (
        len(client.get(f"/api/v1/complaints/{case['complaint_id']}/consents", headers=owner).json())
        == 1
    )


def test_consent_recipient_change_immediately_removes_old_helper(client, auth, owner, case):
    new_helper = client.post(
        "/api/v1/admin/users",
        headers=auth(),
        json={
            "user_id": "demo-helper-2",
            "password": "synthetic-helper-password",
            "role": "Helper",
            "workspace_id": None,
        },
    )
    assert new_helper.status_code == 201
    give_helper(client, owner, case["complaint_id"])
    consent = give_consent(client, owner, case["complaint_id"])
    moved = client.patch(
        f"/api/v1/consents/{consent['consent_id']}",
        headers=owner,
        json={"recipient": "user:demo-helper-2"},
    )
    assert moved.status_code == 200
    old_helper = auth("demo-helper")
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=old_helper).status_code
        == 403
    )
    assert client.get("/api/v1/helper/complaints", headers=old_helper).json() == []


def test_owner_can_view_grant_status_and_only_its_own_consent_history(client, auth, owner, case):
    case_id = case["complaint_id"]
    give_helper(client, owner, case_id)
    response = client.get(f"/api/v1/complaints/{case_id}/helper-grants", headers=owner)
    assert_response(response, "/api/v1/complaints/{id}/helper-grants", "get")
    assert response.json()[0]["active"] is True
    give_consent(client, owner, case_id)
    history = client.get(f"/api/v1/complaints/{case_id}/consents", headers=owner)
    assert_response(history, "/api/v1/complaints/{id}/consents", "get")
    assert history.json()[0]["citizen_id"] == "demo-citizen-1"
    assert (
        client.get(
            f"/api/v1/complaints/{case_id}/helper-grants", headers=auth("demo-helper")
        ).status_code
        == 403
    )


def test_conditional_save_headers_work_through_cors(client, owner, case):
    path = f"/api/v1/complaints/{case['complaint_id']}"
    preflight = client.options(
        path,
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type,if-match",
        },
    )
    assert preflight.status_code == 200
    loaded = client.get(path, headers={**owner, "Origin": "http://localhost:5173"})
    assert "ETag" in loaded.headers["access-control-expose-headers"]


def test_partial_scope_needs_case_status_for_envelope_access(client, auth, owner, case):
    give_helper(client, owner, case["complaint_id"])
    give_consent(client, owner, case["complaint_id"], scopes=["incident_data.amount"])
    helper = auth("demo-helper")
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=helper).status_code == 403
    )
    assert client.get("/api/v1/helper/complaints", headers=helper).json() == []


def test_helper_response_cannot_reload_new_private_data_after_unlock(
    client, auth, owner, case, app, monkeypatch
):
    from app import case_routes
    from app.models import Consent

    case_id = case["complaint_id"]
    give_helper(client, owner, case_id)
    consent = give_consent(client, owner, case_id)
    helper = auth("demo-helper")
    original_commit = case_routes.commit

    def sharing_changes_immediately_after_commit(session):
        original_commit(session)
        # Simulate another request obtaining the released lock, narrowing consent and
        # adding private data before this request's response is serialized.
        with Session(app.state.engine) as other, other.begin():
            other.get(Consent, consent["consent_id"]).data_scopes = ["case_status"]
            row = other.get(Complaint, case_id)
            row.incident_data = {**row.incident_data, "description": "AFTER-REVOCATION-PRIVATE"}
            row.version += 1

    monkeypatch.setattr(case_routes, "commit", sharing_changes_immediately_after_commit)
    result = client.post(
        f"/api/v1/complaints/{case_id}/helper-information", headers=helper, json={"amount": 1700}
    )
    assert result.status_code == 200
    assert result.json()["incident_data"]["amount"] == 1700
    assert "AFTER-REVOCATION-PRIVATE" not in result.text
    assert client.get(f"/api/v1/complaints/{case_id}", headers=helper).json()["incident_data"] == {}


def test_audit_contains_case_actions_without_incident_text(client, app, owner, case):
    give_helper(client, owner, case["complaint_id"])
    consent = give_consent(client, owner, case["complaint_id"])
    client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner)
    with Session(app.state.engine) as session:
        rows = session.scalars(
            select(AuditLog).where(AuditLog.complaint_id == case["complaint_id"])
        ).all()
        assert {r.action for r in rows} >= {
            "complaint.created",
            "helper.granted",
            "consent.granted",
            "consent.withdrawn",
        }
        assert all("PRIVATE-INCIDENT" not in (r.input or "") for r in rows)
        assert all(r.user_id == "demo-citizen-1" for r in rows)


@pytest.fixture
def submitted_case(client, auth, app, case):
    # Isolated policy fixture only. No public API can submit or set this status yet.
    with Session(app.state.engine) as session, session.begin():
        row = session.get(Complaint, case["complaint_id"])
        row.current_status = "SUBMITTED"
        row.destination_workspace_id = "mock-financial-fraud"
        row.rule_version_id = "test-only-pinned-rule-v1"
    give_consent(
        client,
        auth("demo-citizen-1"),
        case["complaint_id"],
        recipient="workspace:mock-financial-fraud",
        purpose="complaint_submission",
    )
    return case


def assign(client, auth, case_id, officer="demo-officer-financial"):
    return client.post(
        f"/api/v1/admin/complaints/{case_id}/assignment",
        headers=auth(),
        json={"officer_id": officer},
    )


def test_officer_assignment_workspace_consent_and_role_boundaries(client, auth, submitted_case):
    case_id = submitted_case["complaint_id"]
    officer = auth("demo-officer-financial")
    path = f"/api/v1/officer/complaints/{case_id}"
    assert client.get(path, headers=officer).status_code == 403
    response = assign(client, auth, case_id)
    assert response.status_code == 200
    assert_response(response, "/api/v1/admin/complaints/{id}/assignment", "post")
    assert set(response.json()) == {"complaint_id", "officer_id", "workspace_id"}
    loaded = client.get(path, headers=officer)
    assert loaded.status_code == 200
    assert_response(loaded, "/api/v1/officer/complaints/{id}", "get")
    listing = client.get("/api/v1/officer/complaints", headers=officer)
    assert_response(listing, "/api/v1/officer/complaints", "get")
    assert [c["complaint_id"] for c in listing.json()] == [case_id]
    cross = auth("demo-officer-digital")
    assert client.get(path, headers=cross).status_code == 403
    assert client.get("/api/v1/officer/complaints", headers=cross).json() == []
    assert assign(client, auth, case_id, "demo-officer-digital").status_code == 400
    assert (
        client.post(
            f"/api/v1/admin/complaints/{case_id}/assignment",
            headers=officer,
            json={"officer_id": "demo-officer-financial"},
        ).status_code
        == 403
    )
    assert client.get(path, headers=auth()).status_code == 403


def test_officer_read_is_blocked_after_workspace_consent_withdrawal(client, auth, submitted_case):
    case_id = submitted_case["complaint_id"]
    assert assign(client, auth, case_id).status_code == 200
    owner = auth("demo-citizen-1")
    records = client.get(f"/api/v1/complaints/{case_id}/consents", headers=owner).json()
    assert (
        client.post(
            f"/api/v1/consents/{records[0]['consent_id']}/withdraw", headers=owner
        ).status_code
        == 200
    )
    officer = auth("demo-officer-financial")
    assert client.get(f"/api/v1/officer/complaints/{case_id}", headers=officer).status_code == 403
    assert client.get("/api/v1/officer/complaints", headers=officer).json() == []
    assert assign(client, auth, case_id).status_code == 403


def test_forged_assignment_does_not_bypass_workspace_check(client, auth, app, submitted_case):
    case_id = submitted_case["complaint_id"]
    assert assign(client, auth, case_id).status_code == 200
    with Session(app.state.engine) as session, session.begin():
        row = session.get(CaseAssignment, case_id)
        row.officer_id = "demo-officer-digital"
        row.workspace_id = "mock-digital-safety"
    headers = auth("demo-officer-digital")
    assert client.get(f"/api/v1/officer/complaints/{case_id}", headers=headers).status_code == 403
    assert client.get("/api/v1/officer/complaints", headers=headers).json() == []


def test_submitted_case_cannot_be_edited_and_draft_cannot_be_assigned(
    client, auth, owner, submitted_case, case_factory
):
    assert (
        client.patch(
            f"/api/v1/complaints/{submitted_case['complaint_id']}",
            headers=owner,
            json={"amount": 1},
        ).status_code
        == 409
    )
    draft = case_factory()
    assert assign(client, auth, draft["complaint_id"]).status_code == 409


@pytest.mark.parametrize("operation", ["create", "patch"])
def test_postgres_concurrent_retries_and_conditional_saves(client, auth, app, case, operation):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL transaction/row-lock regression")
    headers = auth("demo-citizen-1")

    def request(index):
        if operation == "create":
            return client.post(
                "/api/v1/complaints",
                headers={**headers, "Idempotency-Key": "parallel-key"},
                json={"description": "Concurrent draft"},
            )
        return client.patch(
            f"/api/v1/complaints/{case['complaint_id']}",
            headers={**headers, "If-Match": '"1"'},
            json={"amount": 2000 + index},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(request, [0, 1]))
    statuses = sorted(r.status_code for r in responses)
    assert statuses == ([200, 201] if operation == "create" else [200, 412])
    if operation == "create":
        assert responses[0].json()["complaint_id"] == responses[1].json()["complaint_id"]
        with Session(app.state.engine) as session:
            assert (
                session.scalar(
                    select(func.count())
                    .select_from(Complaint)
                    .where(Complaint.create_idempotency_key == "parallel-key")
                )
                == 1
            )
