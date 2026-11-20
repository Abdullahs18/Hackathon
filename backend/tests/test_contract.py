from pathlib import Path

import pytest
import yaml
from openapi_schema_validator import OAS30Validator
from openapi_spec_validator import validate

from tests.conftest import DEMO_PASSWORD

CONTRACT_DIR = Path(__file__).resolve().parents[2] / "contracts"
SPEC = yaml.safe_load((CONTRACT_DIR / "openapi.yaml").read_text(encoding="utf-8"))
SCHEMAS = yaml.safe_load((CONTRACT_DIR / "schemas.yaml").read_text(encoding="utf-8"))


def expanded(value, document=SPEC):
    if isinstance(value, list):
        return [expanded(item, document) for item in value]
    if not isinstance(value, dict):
        return value
    if "$ref" in value:
        ref = value["$ref"]
        source = SCHEMAS if ref.startswith("./schemas.yaml") else document
        node = source
        for part in ref.split("#/")[1].split("/"):
            node = node[part]
        return expanded(node, source)
    return {key: expanded(item, document) for key, item in value.items()}


def assert_response(response, path, method):
    operation = SPEC["paths"][path][method]
    assert str(response.status_code) in operation["responses"]
    schema = expanded(operation["responses"][str(response.status_code)])["content"][
        "application/json"
    ]["schema"]
    assert response.headers["content-type"].startswith("application/json")
    OAS30Validator(schema).validate(response.json())


def test_full_canonical_openapi_is_valid():
    validate(expanded(SPEC))


def test_runtime_routes_exist_in_canonical_contract(app):
    runtime = app.openapi()
    assert runtime["openapi"] == "3.0.3"
    validate(runtime)
    assert runtime["paths"]
    for path, methods in runtime["paths"].items():
        assert path in SPEC["paths"]
        for method, operation in methods.items():
            if method == "parameters":
                assert operation == expanded(SPEC["paths"][path]["parameters"])
                continue
            assert operation["operationId"] == SPEC["paths"][path][method]["operationId"]
            assert operation["responses"] == expanded(SPEC["paths"][path][method]["responses"])


def test_actual_auth_health_and_users_match_contract(client, auth):
    for path in ["/api/v1/health", "/api/v1/health/ready"]:
        assert_response(client.get(path), path, "get")
    path = "/api/v1/auth/login"
    assert_response(
        client.post(path, json={"user_id": "demo-admin", "password": DEMO_PASSWORD}), path, "post"
    )
    for body in [{"user_id": "demo-admin", "password": "wrong"}, {"user_id": 7}]:
        assert_response(client.post(path, json=body), path, "post")
    headers = auth()
    for path in ["/api/v1/auth/me", "/api/v1/admin/users"]:
        assert_response(client.get(path, headers=headers), path, "get")
        assert_response(client.get(path), path, "get")
    body = {
        "user_id": "contract-citizen",
        "password": DEMO_PASSWORD,
        "role": "Citizen",
        "workspace_id": None,
    }
    path = "/api/v1/admin/users"
    assert_response(client.post(path, headers=headers, json=body), path, "post")
    assert_response(client.post(path, headers=headers, json=body), path, "post")
    assert_response(client.get(path, headers=auth("demo-helper")), path, "get")


@pytest.mark.parametrize("name", ["Login", "UserCreate"])
def test_request_models_follow_contract(name):
    from app.schemas import Login, UserCreate

    model = {"Login": Login, "UserCreate": UserCreate}[name].model_json_schema()
    canonical = SCHEMAS["components"]["schemas"][name]
    assert set(model["required"]) == set(canonical["required"])
    assert set(model["properties"]) == set(canonical["properties"])
    for field in ["user_id", "password"]:
        for constraint in ["minLength", "maxLength"]:
            assert model["properties"][field].get(constraint) == canonical["properties"][field].get(
                constraint
            )
