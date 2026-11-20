import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError as SchemaValidationError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.voice.config import VoiceError


class VoiceExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    incident_data: dict
    spoken_summary_ur: str = Field(min_length=1, max_length=2000)
    uncertainties: list[str]


class VoiceProofResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    simulated: Literal[True] = True
    requires_citizen_review: Literal[True] = True
    submitted: Literal[False] = False
    model: str
    transcript: str
    extraction: VoiceExtraction


@lru_cache
def _canonical_extraction_schema() -> dict:
    path = Path(__file__).resolve().parents[3] / "contracts" / "schemas.yaml"
    schemas = yaml.safe_load(path.read_text(encoding="utf-8"))["components"]["schemas"]

    def convert(value):
        if isinstance(value, list):
            return [convert(item) for item in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            return convert(schemas[value["$ref"].split("/")[-1]])
        result = {k: convert(v) for k, v in value.items() if k != "nullable"}
        if value.get("nullable"):
            return {"anyOf": [result, {"type": "null"}]}
        return result

    result = convert(schemas["VoiceExtraction"])
    Draft202012Validator.check_schema(result)
    return result


def extraction_schema() -> dict:
    # SDKs may normalize their input; preserve the canonical cached copy.
    return deepcopy(_canonical_extraction_schema())


def validate_extraction(value: dict) -> VoiceExtraction:
    try:
        json.dumps(value, allow_nan=False)
        Draft202012Validator(_canonical_extraction_schema()).validate(value)
        result = VoiceExtraction.model_validate(value)
        # AI cannot attach evidence or assert citizen-confirmed corrections.
        for name in ["evidence_ids", "citizen_confirmed_corrections"]:
            if result.incident_data.get(name) not in (None, []):
                raise ValueError("untrusted confirmation or evidence linkage")
        if not result.spoken_summary_ur.strip():
            raise ValueError("empty summary")
        return result
    except (SchemaValidationError, ValidationError, ValueError, TypeError):
        raise VoiceError(
            "invalid_model_output", "AI output failed validation; review is required."
        ) from None
