"""Validate API payloads using the canonical OpenAPI 3.0 schemas."""

import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path

import yaml
from fastapi import HTTPException
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError


@lru_cache
def schema_definitions() -> dict:
    path = Path(__file__).resolve().parents[2] / "contracts" / "schemas.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))["components"]["schemas"]


@lru_cache
def _json_schema(name: str) -> dict:
    definitions = schema_definitions()

    def convert(value):
        if isinstance(value, list):
            return [convert(item) for item in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            return convert(definitions[value["$ref"].split("/")[-1]])
        result = {k: convert(v) for k, v in value.items() if k != "nullable"}
        return {"anyOf": [result, {"type": "null"}]} if value.get("nullable") else result

    result = convert(definitions[name])
    Draft202012Validator.check_schema(result)
    return result


def json_schema(name: str) -> dict:
    return deepcopy(_json_schema(name))


def validate_schema(name: str, payload) -> None:
    json.dumps(payload, allow_nan=False)
    Draft202012Validator(_json_schema(name)).validate(payload)


def validate_payload(name: str, payload: dict) -> dict:
    try:
        validate_schema(name, payload)
    except (ValidationError, ValueError, TypeError):
        raise HTTPException(400, "Request does not match the API schema.") from None
    return payload
