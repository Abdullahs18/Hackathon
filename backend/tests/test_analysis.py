from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event
from unittest.mock import Mock

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.analysis_policy import validate_assessment
from app.models import AuditLog, CaseAnalysis, User
from app.voice.config import VoiceError
from tests.conftest import BACKEND
from tests.test_cases import case, case_factory, owner
from tests.test_contract import assert_response
from tests.test_evidence import upload

__all__ = ["case", "case_factory", "owner"]

OUTPUT = {
    "extraction": {
        "incident_data": {
            "description": "Unconfirmed AI wording",
            "amount": 1500,
            "currency": "PKR",
            "incident_date": None,
        },
        "spoken_summary_ur": "آپ کی بتائی گئی معلومات کا خلاصہ درست ہے؟",
        "uncertainties": ["Date is unknown"],
    },
    "classification": {
        "incident_type": "fake aid scam",
        "confidence": 0.95,
        "suspicious_indicators": ["Reported fake aid message"],
        "explanation": "Suspected online financial fraud; this does not prove fraud.",
        "missing_fields": ["transaction_reference"],
        "contradiction_flags": [],
    },
}


class FakeProvider:
    model = "synthetic-test-model"

    def __init__(self):
        self.calls = []
        self.output = deepcopy(OUTPUT)
        self.callback = None
        self.error = None
        self.closed = False

    def assess(self, incident):
        self.calls.append(deepcopy(incident))
        if self.callback:
            self.callback()
        if self.error:
            raise self.error
        return validate_assessment(self.output)

    def close(self):
        self.closed = True


@pytest.fixture
def provider(app):
    fake = FakeProvider()
    app.state.analysis_provider_factory = lambda: fake
    return fake


def analyze(client, owner, case, **kwargs):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/analyze",
        headers=owner,
        json={"allow_external_processing": True},
        **kwargs,
    )


def test_saved_assessment_preserves_facts_and_never_claims_ready(
    client, owner, case, provider, app
):
    response = analyze(client, owner, case)
    assert response.status_code == 200, response.text
    assert_response(response, "/api/v1/complaints/{id}/analyze", "post")
    result = response.json()
    assert result["current_status"] == "HUMAN_REVIEW"
    assert "routing_unavailable" in result["handoff_reasons"]
    assert result["requires_citizen_review"] and not result["submitted"]
    assert result["complaint_version"] == 2 and response.headers["etag"] == '"2"'
    assert result["input_version"] == 1
    assert result["follow_up_questions_ur"]
    saved = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    assert saved["incident_data"] == case["incident_data"]
    assert saved["destination_workspace_id"] is None and saved["rule_version_id"] is None
    assert "complaint_draft" not in saved
    read = client.get(f"/api/v1/complaints/{case['complaint_id']}/analysis", headers=owner)
    assert_response(read, "/api/v1/complaints/{id}/analysis", "get")
    assert read.json() == result
    assert analyze(client, owner, case).json() == result
    assert len(provider.calls) == 1 and provider.closed
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(CaseAnalysis)) == 1


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"allow_external_processing": False},
        {"allow_external_processing": "true"},
        {"allow_external_processing": True, "submit": True},
    ],
)
def test_explicit_permission_required_before_provider(client, owner, case, provider, body):
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/analyze", headers=owner, json=body
    )
    assert response.status_code == 400
    assert provider.calls == []


def test_owner_only_including_analysis_reads(client, auth, owner, case, provider):
    root = f"/api/v1/complaints/{case['complaint_id']}"
    assert client.get(f"{root}/analysis", headers=owner).status_code == 404
    assert (
        client.post(f"{root}/analyze", json={"allow_external_processing": True}).status_code == 401
    )
    for user in ["demo-citizen-2", "demo-helper", "demo-admin", "demo-officer-financial"]:
        headers = auth(user)
        assert (
            client.post(
                f"{root}/analyze", headers=headers, json={"allow_external_processing": True}
            ).status_code
            == 403
        )
        assert client.get(f"{root}/analysis", headers=headers).status_code == 403
    assert provider.calls == []


def test_edits_invalidate_current_analysis_but_keep_history(client, owner, case, provider, app):
    root = f"/api/v1/complaints/{case['complaint_id']}"
    first = analyze(client, owner, case).json()
    stale = client.post(
        f"{root}/analyze",
        headers={**owner, "If-Match": '"1"'},
        json={"allow_external_processing": True},
    )
    assert stale.status_code == 412 and len(provider.calls) == 1
    patched = client.patch(root, headers={**owner, "If-Match": '"2"'}, json={"amount": 1700})
    assert patched.status_code == 200 and patched.json()["current_status"] == "DRAFT"
    assert client.get(f"{root}/analysis", headers=owner).status_code == 404
    second = analyze(client, owner, case).json()
    assert second["analysis_id"] != first["analysis_id"] and second["input_version"] == 3
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(CaseAnalysis)) == 2


def test_evidence_invalidates_analysis_and_confirmation_is_not_sent(client, owner, case, provider):
    root = f"/api/v1/complaints/{case['complaint_id']}"
    client.patch(
        root, headers=owner, json={"citizen_confirmed_corrections": ["Private correction"]}
    )
    evidence = upload(client, owner, case)
    assert evidence.status_code == 201
    assert analyze(client, owner, case).status_code == 200
    assert "evidence_ids" not in provider.calls[0]
    assert "citizen_confirmed_corrections" not in provider.calls[0]
    assert upload(client, owner, case).status_code == 201
    assert client.get(f"{root}/analysis", headers=owner).status_code == 404


@pytest.mark.parametrize(
    "code,status",
    [
        ("invalid_model_output", 502),
        ("provider_quota", 429),
        ("missing_key", 503),
        ("provider_timeout", 503),
    ],
)
def test_provider_failure_is_safe_and_preserves_saved_incident(
    client, owner, case, provider, app, caplog, code, status
):
    provider.error = VoiceError(code, "PRIVATE-PROVIDER-RESPONSE-AND-KEY")
    response = analyze(client, owner, case)
    assert response.status_code == status
    assert_response(response, "/api/v1/complaints/{id}/analyze", "post")
    assert "PRIVATE-PROVIDER" not in response.text + caplog.text
    assert provider.closed
    saved = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    assert saved["version"] == 1 and saved["current_status"] == "DRAFT"
    assert saved["incident_data"] == case["incident_data"]
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(CaseAnalysis)) == 0
        assert "analysis.failed" in session.scalars(select(AuditLog.action)).all()


def test_edit_during_provider_call_discards_stale_result(client, owner, case, provider, app):
    root = f"/api/v1/complaints/{case['complaint_id']}"

    def edit():
        assert client.patch(root, headers=owner, json={"amount": 1900}).status_code == 200

    provider.callback = edit
    assert analyze(client, owner, case).status_code == 409
    assert client.get(root, headers=owner).json()["incident_data"]["amount"] == 1900
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(CaseAnalysis)) == 0


def test_account_is_rechecked_after_provider_call(client, owner, case, provider, app):
    def deactivate():
        with Session(app.state.engine) as session, session.begin():
            session.get(User, "demo-citizen-1").active = False

    provider.callback = deactivate
    assert analyze(client, owner, case).status_code == 403
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(CaseAnalysis)) == 0


def test_concurrent_analysis_is_bounded(client, owner, case, provider):
    entered, release = Event(), Event()

    def block():
        entered.set()
        assert release.wait(10)

    provider.callback = block
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(analyze, client, owner, case)
        try:
            assert entered.wait(10)
            assert analyze(client, owner, case).status_code == 429
        finally:
            release.set()
        assert pending.result(timeout=10).status_code == 200
    assert len(provider.calls) == 1


def test_conflicts_duplicates_and_unknown_values_are_preserved(
    client, owner, case_factory, provider
):
    first = case_factory(
        body={
            "description": "Synthetic transfer",
            "money_lost": False,
            "amount": 1500,
            "transaction_reference": "DEMO123",
            "incident_date": None,
        }
    )
    case_factory()
    result = analyze(client, owner, first).json()
    assert "money_loss_amount_conflict" in result["classification"]["contradiction_flags"]
    assert "possible_duplicate" in result["handoff_reasons"]
    assert provider.calls[0]["incident_date"] is None


def test_no_call_for_empty_oversized_or_submitted_cases(client, owner, case_factory, provider, app):
    empty = case_factory(body={"amount": 1500})
    assert analyze(client, owner, empty).status_code == 400
    huge = case_factory(body={"description": "d" * 12000, "scam_message": "s" * 12000})
    assert analyze(client, owner, huge).status_code == 400
    from app.models import Complaint

    with Session(app.state.engine) as session, session.begin():
        session.get(Complaint, empty["complaint_id"]).current_status = "SUBMITTED"
    assert analyze(client, owner, empty).status_code == 409
    assert provider.calls == []


@pytest.mark.parametrize(
    "mutation", ["nan", "confirmation", "evidence", "unknown_field", "unauthorized", "bad_type"]
)
def test_untrusted_assessment_output_is_rejected(mutation):
    value = deepcopy(OUTPUT)
    if mutation == "nan":
        value["classification"]["confidence"] = float("nan")
    elif mutation == "confirmation":
        value["extraction"]["incident_data"]["citizen_confirmed_corrections"] = ["yes"]
    elif mutation == "evidence":
        value["extraction"]["incident_data"]["evidence_ids"] = ["invented"]
    elif mutation == "unknown_field":
        value["classification"]["missing_fields"] = ["password"]
    elif mutation == "unauthorized":
        value["submitted"] = True
    else:
        value["classification"]["incident_type"] = "tax filing"
    with pytest.raises(VoiceError, match="failed validation"):
        validate_assessment(value)


def test_upgrade_keeps_evidence_and_case(client, owner, case, app):
    evidence = upload(client, owner, case).json()
    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "0003")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    path = f"/api/v1/complaints/{case['complaint_id']}/evidence/{evidence['evidence_id']}/content"
    assert client.get(path, headers=owner).status_code == 200
    assert client.get("/api/v1/health/ready").status_code == 200


def test_gemini_assessment_uses_schema_and_validates_output():
    import json

    from app.voice.providers import GeminiProvider

    provider = object.__new__(GeminiProvider)
    provider._generate = Mock(return_value=json.dumps(OUTPUT))
    assert (
        provider.assess({"description": "مجھے جعلی پیغام ملا"}).classification.incident_type
        == "fake aid scam"
    )
    args = provider._generate.call_args.args
    assert json.loads(args[0])["description"] == "مجھے جعلی پیغام ملا"
    assert args[2]["additionalProperties"] is False
    assert "x-pydantic-source" not in json.dumps(args[2])
    provider._generate.return_value = "invalid JSON PRIVATE-KEY"
    with pytest.raises(VoiceError) as error:
        provider.assess({"description": "Synthetic"})
    assert "PRIVATE-KEY" not in str(error.value)


def test_provided_fields_do_not_generate_unnecessary_questions(
    client, owner, case_factory, provider
):
    case = case_factory(
        body={
            "description": "Synthetic reported transfer",
            "money_lost": True,
            "amount": 1500,
            "currency": "PKR",
            "transaction_reference": "DEMO123",
        }
    )
    result = analyze(client, owner, case).json()
    assert result["classification"]["missing_fields"] == []
    assert result["follow_up_questions_ur"] == []


def test_uncertain_analysis_commit_can_be_recovered_without_provider_retry(
    client, owner, case, provider, monkeypatch
):
    original = Session.commit

    def uncertain(session):
        saving = any(isinstance(row, CaseAnalysis) for row in session.new)
        original(session)
        if saving:
            raise OperationalError("synthetic lost acknowledgement", {}, None)

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", uncertain)
        assert analyze(client, owner, case).status_code == 503
    saved = client.get(f"/api/v1/complaints/{case['complaint_id']}/analysis", headers=owner)
    assert saved.status_code == 200
    assert analyze(client, owner, case).json() == saved.json()
    assert len(provider.calls) == 1
