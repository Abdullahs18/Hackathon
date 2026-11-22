import pytest


@pytest.mark.parametrize("user", ["demo-citizen-1", "demo-helper", "demo-officer-financial"])
def test_nonadmin_raw_api_access_denied(client, auth, user):
    headers = auth(user)
    assert client.get("/api/v1/admin/users", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "user_id": "attacker-created",
                "password": "long-test-password",
                "role": "Admin",
                "workspace_id": None,
            },
        ).status_code
        == 403
    )


def test_admin_list_never_exposes_password_hash(client, auth):
    response = client.get("/api/v1/admin/users", headers=auth())
    assert response.status_code == 200
    assert len(response.json()) == 6
    assert all(set(row) == {"user_id", "role", "workspace_id"} for row in response.json())


def test_create_user_and_duplicate(client, auth):
    headers = auth()
    body = {
        "user_id": "demo-new-officer",
        "password": "new-synthetic-password",
        "role": "Officer",
        "workspace_id": "mock-financial-fraud",
    }
    response = client.post("/api/v1/admin/users", headers=headers, json=body)
    assert response.status_code == 201
    assert response.json() == {k: v for k, v in body.items() if k != "password"}
    assert client.post("/api/v1/admin/users", headers=headers, json=body).status_code == 409
    assert (
        client.post(
            "/api/v1/auth/login", json={"user_id": body["user_id"], "password": body["password"]}
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"workspace_id": None},
        {"workspace_id": "nonexistent"},
        {"role": "Superuser"},
        {"password": "short"},
        {"password_hash": "injected"},
    ],
)
def test_invalid_user_creation(client, auth, changes):
    body = {
        "user_id": "demo-new-officer",
        "password": "new-synthetic-password",
        "role": "Officer",
        "workspace_id": "mock-financial-fraud",
    } | changes
    assert client.post("/api/v1/admin/users", headers=auth(), json=body).status_code == 400
