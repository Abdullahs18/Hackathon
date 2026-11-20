"""Serve the implemented API surface using the canonical shared contract."""

from copy import deepcopy
from pathlib import Path

import yaml
from fastapi.routing import APIRoute

CONTRACT_DIR = Path(__file__).resolve().parents[2] / "contracts"


def implemented_openapi(routes: list) -> dict:
    spec = yaml.safe_load((CONTRACT_DIR / "openapi.yaml").read_text(encoding="utf-8"))
    schemas = yaml.safe_load((CONTRACT_DIR / "schemas.yaml").read_text(encoding="utf-8"))

    def resolve(value, document):
        if isinstance(value, list):
            return [resolve(item, document) for item in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            ref = value["$ref"]
            source = schemas if ref.startswith("./schemas.yaml#/") else document
            node = source
            for part in ref.split("#/")[1].split("/"):
                node = node[part]
            return resolve(node, source)
        return {key: resolve(item, document) for key, item in value.items()}

    paths = {}
    for route in routes:
        if not isinstance(route, APIRoute) or not route.include_in_schema:
            continue
        for method in route.methods:
            operation = deepcopy(spec["paths"][route.path][method.lower()])
            if operation["operationId"] != route.operation_id:
                raise ValueError(f"Operation drift for {route.path}")
            paths.setdefault(route.path, {})[method.lower()] = operation
    spec["paths"] = paths
    # API keys are a later increment; don't advertise them as usable in runtime Swagger yet.
    spec["security"] = [{"BearerAuth": []}]
    spec["components"]["securitySchemes"].pop("ApiKeyAuth", None)
    spec["info"]["description"] = (
        "Synthetic demo only. This document includes implemented routes with JWT authentication. "
        "The repository contracts also define planned routes and future API-key authentication."
    )
    used_tags = {tag for methods in paths.values() for op in methods.values() for tag in op["tags"]}
    spec["tags"] = [tag for tag in spec["tags"] if tag["name"] in used_tags]
    return resolve(spec, spec)
