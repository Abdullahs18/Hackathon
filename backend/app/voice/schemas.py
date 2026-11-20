from typing import Literal

from jsonschema.exceptions import ValidationError as SchemaValidationError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.validation import json_schema, validate_schema
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


def extraction_schema() -> dict:
    return json_schema("VoiceExtraction")


def validate_extraction(value: dict) -> VoiceExtraction:
    try:
        validate_schema("VoiceExtraction", value)
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
