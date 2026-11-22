"""Structured provider output and deterministic, non-authorizing readiness policy."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.validation import schema_definitions, validate_schema
from app.voice.config import VoiceError
from app.voice.schemas import VoiceExtraction, validate_extraction


class Classification(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    incident_type: Literal[
        "fake aid scam",
        "phishing",
        "impersonation",
        "fraudulent transfer",
        "other suspected online financial fraud",
        "out of scope",
        "unclear",
    ]
    confidence: float = Field(ge=0, le=1)
    suspicious_indicators: list[str]
    explanation: str = Field(min_length=1, max_length=6000)
    missing_fields: list[str]
    contradiction_flags: list[str]


class Assessment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    extraction: VoiceExtraction
    classification: Classification


def validate_assessment(value) -> Assessment:
    try:
        validate_schema("CaseAssessment", value)
        result = Assessment.model_validate(value)
        validate_extraction(result.extraction.model_dump())
        fields = set(schema_definitions()["IncidentInformation"]["properties"]) - {
            "evidence_ids",
            "citizen_confirmed_corrections",
        }
        if set(result.classification.missing_fields) - fields:
            raise ValueError("Unknown missing field")
        if not result.classification.explanation.strip():
            raise ValueError("Blank explanation")
        return result
    except Exception:
        raise VoiceError("invalid_model_output", "AI assessment failed validation.") from None


QUESTIONS_UR = {
    "description": "براہ کرم بتائیں کہ آپ کے ساتھ کیا ہوا؟",
    "money_lost": "کیا آپ نے رقم بھیجی تھی یا صرف پیغام موصول ہوا تھا؟",
    "amount": "اگر معلوم ہے تو کتنی رقم بھیجی گئی تھی؟",
    "currency": "رقم کس کرنسی میں تھی؟",
    "transaction_reference": "اگر معلوم ہے تو ٹرانزیکشن کا ریفرنس کیا ہے؟",
    "payment_method": "اگر معلوم ہے تو رقم کس طریقے سے بھیجی گئی تھی؟",
    "platform": "پیغام کس ایپ یا ذریعے سے موصول ہوا تھا؟",
    "incident_date": "اگر یاد ہے تو واقعہ کب پیش آیا تھا؟",
    "scam_message": "اگر دستیاب ہے تو مشکوک پیغام کے الفاظ بتائیں۔",
    "suspect_details": "اگر معلوم ہے تو مشکوک نمبر، اکاؤنٹ یا لنک بتائیں۔",
    "incident_type": "براہ کرم مشکوک پیغام یا لین دین کی مزید تفصیل بتائیں۔",
}


def evaluate(
    incident: dict,
    assessment: Assessment,
    possible_duplicate: bool,
    route_match: bool = False,
    route_reason: str | None = "no_matching_rule",
) -> dict:
    classification = assessment.classification.model_dump()
    required = ["description", "money_lost"]
    if incident.get("money_lost") is True:
        required += ["amount", "currency"]

    def present(name):
        value = incident.get(name)
        if name == "money_lost":
            return isinstance(value, bool)
        if name == "amount":
            return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0
        return isinstance(value, str) and bool(value.strip())

    missing = [name for name in required if not present(name)]

    def uncollected(name):
        value = incident.get(name)
        return value is None or (isinstance(value, str) and not value.strip()) or value == []

    classification["missing_fields"] = list(
        dict.fromkeys(
            [*missing, *(name for name in classification["missing_fields"] if uncollected(name))]
        )
    )
    flags = list(classification["contradiction_flags"])
    amount = incident.get("amount")
    if amount is not None and (amount < 0 or (incident.get("money_lost") is False and amount > 0)):
        flags.append("money_loss_amount_conflict")
    classification["contradiction_flags"] = list(dict.fromkeys(flags))
    completeness = sum(present(name) for name in required) / len(required)
    raw_score = (
        0.35 * classification["confidence"]
        + 0.30 * completeness
        + 0.20 * (0 if flags else 1)
        + 0.15 * route_match
    )
    reasons = [route_reason or "no_matching_rule"] if not route_match else []
    if flags:
        reasons.append("unresolved_contradiction")
    if possible_duplicate:
        reasons.append("possible_duplicate")
    if classification["incident_type"] in {"unclear", "out of scope"}:
        reasons.append("unsupported_or_unclear_incident")
    if raw_score < 0.60:
        reasons.append("low_readiness")
    status = (
        "HUMAN_REVIEW"
        if reasons
        else ("NEEDS_INFORMATION" if missing or raw_score < 0.85 else "CITIZEN_REVIEW")
    )
    questions = [
        QUESTIONS_UR[name] for name in classification["missing_fields"] if name in QUESTIONS_UR
    ][:5]
    if status == "NEEDS_INFORMATION" and not questions:
        questions = [QUESTIONS_UR["incident_type"]]
    result = {
        "classification": classification,
        "readiness_score": round(raw_score, 6),
        "current_status": status,
        "extraction": assessment.extraction.model_dump(),
        "follow_up_questions_ur": questions,
        "handoff_reasons": reasons,
        "requires_citizen_review": True,
        "submitted": False,
    }
    if status == "CITIZEN_REVIEW":
        draft = {
            name: incident.get(name)
            for name in (
                "incident_date",
                "description",
                "amount",
                "currency",
                "payment_method",
                "transaction_reference",
            )
        }
        draft.update(
            incident_type=classification["incident_type"],
            suspect_details=incident.get("suspect_details") or [],
            evidence_ids=incident.get("evidence_ids") or [],
            citizen_confirmed=False,
        )
        validate_schema("ComplaintDraft", draft)
        result["complaint_draft"] = draft
    return result
