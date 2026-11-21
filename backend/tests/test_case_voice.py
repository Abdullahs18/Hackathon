import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from threading import Event

import imageio_ffmpeg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.main import create_app
from app.mock_services import seed_mock_services
from app.models import CaseSpeech, MockSubmission, VoiceTurn
from app.routing import seed_demo_routing
from app.voice.config import VoiceError
from app.voice.schemas import validate_extraction
from tests.conftest import BACKEND
from tests.test_analysis import analyze, provider
from tests.test_api_keys import credential, key_factory
from tests.test_cases import case_factory, give_consent, owner
from tests.test_contract import assert_response
from tests.test_submission import approve, grants, submit
from tests.test_voice import wav_bytes

__all__ = ["provider", "key_factory", "case_factory", "owner"]
SUMMARY = (
    "آپ نے بتایا کہ جعلی امدادی پیغام کے بعد آپ نے 1500 پاکستانی روپے بھیجے۔ تاریخ معلوم نہیں۔"
)
TRANSCRIPT = "مجھے جعلی امداد کا پیغام ملا۔ میں نے 1500 پاکستانی روپے بھیجے۔ تاریخ یاد نہیں۔"
PROPOSAL = {
    "incident_data": {
        "description": "Citizen reports a synthetic fake aid message.",
        "money_lost": True,
        "amount": 1500,
        "currency": "PKR",
        "incident_date": None,
        "transaction_reference": None,
    },
    "spoken_summary_ur": SUMMARY,
    "uncertainties": ["The date is unknown."],
}


def mp3_bytes():
    return (bytes.fromhex("fffb9064") + b"\0" * 413) * 20


class VoiceProvider:
    model = "synthetic-voice-model"

    def __init__(self):
        self.transcriptions = []
        self.extractions = []
        self.output = deepcopy(PROPOSAL)
        self.transcribe_callback = None
        self.extract_callback = None
        self.extract_error = None
        self.transcribe_error = None
        self.closed = 0

    def transcribe(self, audio):
        self.transcriptions.append(audio)
        if self.transcribe_callback:
            self.transcribe_callback()
        if self.transcribe_error:
            raise self.transcribe_error
        return TRANSCRIPT

    def extract(self, transcript):
        self.extractions.append(transcript)
        if self.extract_callback:
            self.extract_callback()
        if self.extract_error:
            raise self.extract_error
        return validate_extraction(self.output)

    def close(self):
        self.closed += 1


class Speaker:
    def __init__(self):
        self.calls = []
        self.callback = None
        self.data = mp3_bytes()
        self.error = None

    def synthesize(self, text):
        self.calls.append(text)
        if self.callback:
            self.callback()
        if self.error:
            raise self.error
        return self.data


@pytest.fixture
def voice(app):
    fake = VoiceProvider()
    app.state.voice_provider_factory = lambda: fake
    return fake


@pytest.fixture
def speaker(app):
    fake = Speaker()
    app.state.voice_speaker_factory = lambda: fake
    return fake


@pytest.fixture
def case(case_factory):
    return case_factory(body={"description": "Synthetic draft before voice input."})


def permissions(client, owner, case):
    return (
        give_consent(
            client,
            owner,
            case["complaint_id"],
            ["voice_audio", "voice_transcript"],
            "service:gemini-voice",
            "voice_processing",
        ),
        give_consent(
            client, owner, case["complaint_id"], ["spoken_text"], "service:gtts", "speech_synthesis"
        ),
    )


def record(client, owner, case, key="recording-1", data=None, permission="true"):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/voice-inputs",
        headers={**owner, "Idempotency-Key": key, "If-Match": f'"{case["version"]}"'},
        data={"allow_external_processing": permission},
        files={"file": ("recording.ogg", wav_bytes() if data is None else data, "audio/ogg")},
    )


def confirm(client, owner, case, turn, patch=None, **changes):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/voice-inputs/{turn['voice_turn_id']}/confirm",
        headers={**owner, "If-Match": f'"{case["version"]}"'},
        json={
            "citizen_confirmed": True,
            "incident_patch": PROPOSAL["incident_data"] if patch is None else patch,
            **changes,
        },
    )


def speech(client, owner, case, kind="review", key="speech-1", **fields):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/speech",
        headers={**owner, "If-Match": f'"{case["version"]}"', "Idempotency-Key": key},
        json={"kind": kind, "allow_external_processing": True, **fields},
    )


def test_full_voice_review_to_real_case_submission_keeps_unknown_facts(
    client, owner, case, voice, speaker, provider, app
):
    permissions(client, owner, case)
    response = record(client, owner, case)
    assert response.status_code == 200, response.text
    assert_response(response, "/api/v1/complaints/{id}/voice-inputs", "post")
    turn = response.json()
    assert (
        turn["transcript"] == TRANSCRIPT
        and turn["requires_citizen_review"]
        and not turn["submitted"]
    )
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()[
            "incident_data"
        ]
        == case["incident_data"]
    )
    proposed = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"])
    assert proposed.status_code == 200, proposed.text
    assert client.get(proposed.json()["audio_path"], headers=owner).content == mp3_bytes()
    changed = confirm(client, owner, case, turn)
    assert changed.status_code == 200, changed.text
    assert_response(changed, "/api/v1/complaints/{id}/voice-inputs/{turn_id}/confirm", "post")
    saved = changed.json()
    assert (
        saved["incident_data"]["amount"] == 1500 and saved["incident_data"]["incident_date"] is None
    )
    assert saved["current_status"] == "DRAFT" and not saved.get("authorization_id")
    assert confirm(client, owner, case, turn).json() == saved
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
        seed_mock_services(session)
    assessment = analyze(client, owner, saved)
    assert (
        assessment.status_code == 200 and assessment.json()["current_status"] == "CITIZEN_REVIEW"
    ), assessment.text
    saved = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    output = speech(client, owner, saved, key="final-review")
    assert output.status_code == 200, output.text
    assert_response(output, "/api/v1/complaints/{id}/speech", "post")
    assert "1500" in output.json()["text_ur"] and "معلوم نہیں" in output.json()["text_ur"]
    audio = client.get(output.json()["audio_path"], headers=owner)
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/mpeg"
    assert audio.headers["X-Complaint-Version"] == str(saved["version"])
    grants(client, owner, saved)
    approval = approve(client, owner, saved)
    assert submit(client, owner, approval).json()["submitted"]
    assert client.get(output.json()["audio_path"], headers=owner).status_code == 409
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 1


def test_voice_input_requires_explicit_permission_and_scoped_provider_grant(
    client, owner, case, voice
):
    assert record(client, owner, case).status_code == 403
    permissions(client, owner, case)
    assert record(client, owner, case, permission="false").status_code == 400
    assert voice.transcriptions == []


@pytest.mark.parametrize("data", [b"fake audio", b"", wav_bytes(61), b"x" * (5 * 1024 * 1024 + 1)])
def test_invalid_voice_upload_never_reaches_provider(client, owner, case, voice, data):
    permissions(client, owner, case)
    assert record(client, owner, case, data=data).status_code in {400, 413}
    assert voice.transcriptions == []


@pytest.mark.parametrize("container", ["webm", "ogg"])
def test_browser_and_ogg_audio_are_actually_decoded(client, owner, case, voice, container):
    permissions(client, owner, case)
    encoded = subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-c:a",
            "libopus",
            "-f",
            container,
            "pipe:1",
        ],
        input=wav_bytes(),
        capture_output=True,
        timeout=15,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    assert encoded.returncode == 0
    response = record(client, owner, case, data=encoded.stdout)
    assert response.status_code == 200, response.text
    assert 0 < voice.transcriptions[0].duration_seconds <= 60


def test_identical_voice_retry_and_conflicting_key_reuse(client, owner, case, voice):
    permissions(client, owner, case)
    first = record(client, owner, case)
    assert record(client, owner, case).json() == first.json()
    assert len(voice.transcriptions) == len(voice.extractions) == 1
    assert record(client, owner, case, data=wav_bytes(2)).status_code == 409


def test_extraction_failure_recovers_transcript_without_audio_on_fresh_app(
    client, owner, case, voice, app, settings
):
    permissions(client, owner, case)
    voice.extract_error = VoiceError("provider_unavailable", "synthetic failure")
    assert record(client, owner, case).status_code == 503
    turns = client.get(f"/api/v1/complaints/{case['complaint_id']}/voice-inputs", headers=owner)
    assert_response(turns, "/api/v1/complaints/{id}/voice-inputs", "get")
    turn = turns.json()[0]
    assert (
        turn["status"] == "FAILED"
        and turn["transcript"] == TRANSCRIPT
        and turn["next_step"] == "extract"
    )
    voice.extract_error = None
    fresh = create_app(settings)
    fresh.state.voice_provider_factory = lambda: voice
    try:
        with TestClient(fresh) as restarted:
            result = restarted.post(
                f"/api/v1/complaints/{case['complaint_id']}/voice-inputs/{turn['voice_turn_id']}/retry",
                headers={**owner, "If-Match": f'"{case["version"]}"'},
                json={"allow_external_processing": True},
            )
            assert result.status_code == 200 and result.json()["status"] == "READY", result.text
    finally:
        fresh.state.engine.dispose()
    assert len(voice.transcriptions) == 1 and len(voice.extractions) == 2


@pytest.mark.parametrize("step", ["transcribe", "extract"])
def test_newer_case_edits_cannot_be_overwritten_by_late_voice_results(
    client, owner, case, voice, step
):
    permissions(client, owner, case)

    def edit():
        response = client.patch(
            f"/api/v1/complaints/{case['complaint_id']}",
            headers=owner,
            json={"description": "Newer citizen text."},
        )
        assert response.status_code == 200

    setattr(voice, step + "_callback", edit)
    response = record(client, owner, case)
    assert response.status_code == 409, response.text
    turns = client.get(
        f"/api/v1/complaints/{case['complaint_id']}/voice-inputs", headers=owner
    ).json()
    assert turns[0]["status"] == "STALE"
    saved = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    assert saved["incident_data"]["description"] == "Newer citizen text."


def test_consent_withdrawal_between_voice_steps_blocks_extraction(client, owner, case, voice):
    consent, _ = permissions(client, owner, case)

    def withdraw():
        assert (
            client.post(
                f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner
            ).status_code
            == 200
        )

    voice.transcribe_callback = withdraw
    response = record(client, owner, case)
    assert response.status_code == 403 and voice.extractions == [], response.text


@pytest.mark.parametrize(
    "field,value",
    [
        ("evidence_ids", ["invented"]),
        ("citizen_confirmed_corrections", ["model-approved"]),
        ("citizen_authorized", True),
    ],
)
def test_model_cannot_invent_confirmation_evidence_or_authority(
    client, owner, case, voice, field, value
):
    permissions(client, owner, case)
    voice.output["incident_data"][field] = value
    response = record(client, owner, case)
    assert response.status_code == 502, response.text
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()[
            "incident_data"
        ]
        == case["incident_data"]
    )


def test_citizen_correction_is_explicit_and_stale_confirmation_is_rejected(
    client, owner, case, voice
):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    result = confirm(
        client,
        owner,
        case,
        turn,
        patch={"description": "Corrected by the citizen.", "amount": 1400},
        transcript_correction="میں نے 1400 روپے بھیجے۔",
    )
    assert result.status_code == 200, result.text
    assert result.json()["incident_data"]["amount"] == 1400
    assert "1400" in result.json()["incident_data"]["citizen_confirmed_corrections"][0]
    assert confirm(client, owner, case, turn, patch={"amount": 9000}).status_code == 409
    second = record(client, owner, result.json(), key="new-turn").json()
    assert (
        client.patch(
            f"/api/v1/complaints/{case['complaint_id']}", headers=owner, json={"amount": 1300}
        ).status_code
        == 200
    )
    assert confirm(client, owner, result.json(), second).status_code == 412


def test_follow_up_question_is_spoken_from_current_analysis_then_answered_by_voice(
    client, owner, case, voice, speaker, provider, app
):
    permissions(client, owner, case)
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
    assert (
        client.patch(
            f"/api/v1/complaints/{case['complaint_id']}", headers=owner, json={"money_lost": True}
        ).status_code
        == 200
    )
    assert analyze(client, owner, case).json()["current_status"] == "NEEDS_INFORMATION"
    current = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    spoken = speech(client, owner, current, "follow_up", question_index=0)
    assert spoken.status_code == 200, spoken.text
    assert spoken.json()["text_ur"] == speaker.calls[0]
    answer = record(client, owner, current).json()
    applied = confirm(client, owner, current, answer, patch={"amount": 1500, "currency": "PKR"})
    assert applied.status_code == 200
    assert applied.json()["incident_data"]["description"] == case["incident_data"]["description"]
    assert analyze(client, owner, applied.json()).json()["current_status"] == "CITIZEN_REVIEW"


def test_speech_retries_are_cached_and_audio_becomes_stale_after_edit(
    client, owner, case, voice, speaker
):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    first = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"])
    assert first.status_code == 200, first.text
    assert (
        speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"]).json()
        == first.json()
    )
    assert len(speaker.calls) == 1
    assert (
        client.patch(
            f"/api/v1/complaints/{case['complaint_id']}", headers=owner, json={"amount": 2000}
        ).status_code
        == 200
    )
    assert client.get(first.json()["audio_path"], headers=owner).status_code == 409


def test_cached_owner_audio_survives_provider_consent_withdrawal(
    client, owner, case, voice, speaker
):
    _, consent = permissions(client, owner, case)
    turn = record(client, owner, case).json()
    first = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"]).json()
    assert (
        client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner).status_code
        == 200
    )
    assert client.get(first["audio_path"], headers=owner).status_code == 200
    assert (
        speech(
            client,
            owner,
            case,
            "voice_summary",
            key="new-speech",
            voice_turn_id=turn["voice_turn_id"],
        ).status_code
        == 403
    )


def test_speech_withdrawal_after_claim_prevents_provider_disclosure(
    client, owner, case, voice, speaker, monkeypatch
):
    import app.case_voice_routes as routes

    _, consent = permissions(client, owner, case)
    turn = record(client, owner, case).json()
    original_save = routes.save

    def withdraw_after_claim(session):
        claimed = any(
            isinstance(row, CaseSpeech) and row.status == "PROCESSING"
            for row in session.new | session.dirty
        )
        original_save(session)
        if claimed:
            assert (
                client.post(
                    f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner
                ).status_code
                == 200
            )

    monkeypatch.setattr(routes, "save", withdraw_after_claim)
    response = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"])
    assert response.status_code == 403 and speaker.calls == [], response.text


def test_speech_withdrawal_in_flight_discards_returned_audio(
    client, owner, case, voice, speaker, app
):
    _, consent = permissions(client, owner, case)
    turn = record(client, owner, case).json()
    speaker.callback = lambda: client.post(
        f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner
    )
    result = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"])
    assert result.status_code == 403, result.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(CaseSpeech)).audio_data is None


def test_other_roles_and_owners_cannot_read_voice_or_audio(
    client, owner, case, voice, speaker, auth
):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    output = speech(
        client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"]
    ).json()
    root = f"/api/v1/complaints/{case['complaint_id']}"
    for user_id in ["demo-citizen-2", "demo-helper", "demo-officer-financial", "demo-admin"]:
        headers = auth(user_id)
        assert client.get(f"{root}/voice-inputs", headers=headers).status_code == 403
        assert (
            client.get(f"{root}/voice-inputs/{turn['voice_turn_id']}", headers=headers).status_code
            == 403
        )
        assert client.get(output["audio_path"], headers=headers).status_code == 403


def test_voice_and_speech_scopes_and_api_key_revocation_are_enforced(
    client, owner, case, voice, speaker, key_factory, auth
):
    permissions(client, owner, case)
    read = credential(key_factory(scopes=["complaints:read"]))
    assert record(client, read, case).status_code == 403
    key = key_factory(scopes=["complaints:write"])
    admin = auth()
    voice.transcribe_callback = lambda: client.post(
        f"/api/v1/admin/api-keys/{key['api_key_id']}/revoke", headers=admin
    )
    assert record(client, credential(key), case).status_code == 401
    assert voice.extractions == []


def test_corrupt_cached_audio_is_not_served(client, owner, case, voice, speaker, app):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    output = speech(
        client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"]
    ).json()
    with Session(app.state.engine) as session, session.begin():
        session.get(CaseSpeech, output["speech_id"]).audio_data = b"corrupt"
    assert client.get(output["audio_path"], headers=owner).status_code == 503


def test_invalid_tts_payload_does_not_become_an_audio_asset(client, owner, case, voice, speaker):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    speaker.data = b"not MP3"
    assert (
        speech(
            client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"]
        ).status_code
        == 502
    )


def test_voice_migration_preserves_case_and_repeat_upgrade(client, owner, case, app):
    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "0008")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    command.check(config)
    assert client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json() == case


def test_lost_voice_result_acknowledgment_replays_saved_proposal(
    client, owner, case, voice, app, monkeypatch
):
    permissions(client, owner, case)
    original = Session.commit
    fired = []

    def lose_ack(session):
        ready = any(isinstance(row, VoiceTurn) and row.status == "READY" for row in session.dirty)
        original(session)
        if ready and not fired:
            fired.append(True)
            raise OperationalError("synthetic lost acknowledgement", {}, Exception("lost"))

    monkeypatch.setattr(Session, "commit", lose_ack)
    assert record(client, owner, case).status_code == 503
    recovered = record(client, owner, case)
    assert recovered.status_code == 200 and recovered.json()["status"] == "READY", recovered.text
    assert len(voice.transcriptions) == len(voice.extractions) == 1


def test_parallel_voice_request_has_one_provider_execution(client, owner, case, voice, app):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("Lease concurrency is verified on PostgreSQL.")
    permissions(client, owner, case)
    entered, release = Event(), Event()

    def hold():
        entered.set()
        assert release.wait(20)

    voice.transcribe_callback = hold
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(record, client, owner, case)
        try:
            assert entered.wait(20)
            assert record(client, owner, case).status_code == 429
        finally:
            release.set()
        assert first.result(timeout=30).status_code == 200
    assert len(voice.transcriptions) == 1


def test_unexpected_form_fields_cannot_smuggle_control_flags(client, owner, case, voice):
    permissions(client, owner, case)
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/voice-inputs",
        headers={**owner, "If-Match": f'"{case["version"]}"', "Idempotency-Key": "bad-form"},
        data={"allow_external_processing": "true", "citizen_authorized": "true"},
        files={"file": ("recording.wav", wav_bytes(), "audio/wav")},
    )
    assert response.status_code == 400, response.text
    assert voice.transcriptions == []


def test_lost_confirmation_acknowledgment_does_not_apply_corrections_twice(
    client, owner, case, voice, monkeypatch
):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    original = Session.commit
    fired = []

    def lose_ack(session):
        applied = any(
            isinstance(row, VoiceTurn) and row.status == "APPLIED" for row in session.dirty
        )
        original(session)
        if applied and not fired:
            fired.append(True)
            raise OperationalError("synthetic lost confirmation response", {}, Exception("lost"))

    monkeypatch.setattr(Session, "commit", lose_ack)
    result = confirm(
        client, owner, case, turn, correction_note="Citizen confirmed the synthetic amount."
    )
    assert result.status_code == 503 and fired, result.text
    recovered = confirm(
        client, owner, case, turn, correction_note="Citizen confirmed the synthetic amount."
    )
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["incident_data"]["citizen_confirmed_corrections"] == [
        "Citizen confirmed the synthetic amount."
    ]


def test_lost_speech_acknowledgment_replays_cached_audio_without_second_tts(
    client, owner, case, voice, speaker, monkeypatch
):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    original = Session.commit
    fired = []

    def lose_ack(session):
        ready = any(isinstance(row, CaseSpeech) and row.status == "READY" for row in session.dirty)
        original(session)
        if ready and not fired:
            fired.append(True)
            raise OperationalError("synthetic lost audio response", {}, Exception("lost"))

    monkeypatch.setattr(Session, "commit", lose_ack)
    assert (
        speech(
            client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"]
        ).status_code
        == 503
    )
    retry = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"])
    assert retry.status_code == 200 and len(speaker.calls) == 1, retry.text
    assert client.get(retry.json()["audio_path"], headers=owner).status_code == 200


def test_live_demo_command_uses_api_voice_workflow_and_stops_before_filing(
    client, voice, speaker, provider, app, tmp_path
):
    from app.voice_demo import run_demo
    from tests.conftest import DEMO_PASSWORD

    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
    result = run_demo(client, DEMO_PASSWORD, speaker, tmp_path)
    assert result["review_ready"] and not result["submitted"] and result["simulated"]
    assert result["proposal_amount_matches"] and result["unknown_date_preserved"]
    from pathlib import Path

    assert Path(result["review_audio_file"]).read_bytes() == mp3_bytes()
    with Session(app.state.engine) as session:
        assert session.scalar(select(func.count()).select_from(MockSubmission)) == 0


def test_expired_extraction_lease_resumes_saved_transcript(client, owner, case, voice, app):
    permissions(client, owner, case)
    voice.extract_error = VoiceError("provider_unavailable", "synthetic failure")
    assert record(client, owner, case).status_code == 503
    with Session(app.state.engine) as session, session.begin():
        turn = session.scalar(select(VoiceTurn))
        identity = turn.voice_turn_id
        turn.status = "PROCESSING"
        turn.lease_token = "crashed-worker"
        turn.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    voice.extract_error = None
    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/voice-inputs/{identity}/retry",
        headers={**owner, "If-Match": f'"{case["version"]}"'},
        json={"allow_external_processing": True},
    )
    assert response.status_code == 200 and response.json()["status"] == "READY", response.text
    assert len(voice.transcriptions) == 1


def test_new_case_revision_during_tts_discards_audio(client, owner, case, voice, speaker, app):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    speaker.callback = lambda: client.patch(
        f"/api/v1/complaints/{case['complaint_id']}",
        headers=owner,
        json={"description": "Newer citizen correction."},
    )
    response = speech(client, owner, case, "voice_summary", voice_turn_id=turn["voice_turn_id"])
    assert response.status_code == 409, response.text
    with Session(app.state.engine) as session:
        assert session.scalar(select(CaseSpeech)).audio_data is None


def test_client_cannot_send_arbitrary_text_to_tts(client, owner, case, voice, speaker):
    permissions(client, owner, case)
    turn = record(client, owner, case).json()
    result = speech(
        client,
        owner,
        case,
        "voice_summary",
        voice_turn_id=turn["voice_turn_id"],
        text="Unapproved arbitrary text.",
    )
    assert result.status_code == 400 and speaker.calls == []


def test_browser_recording_longer_than_one_minute_is_rejected(client, owner, case, voice):
    permissions(client, owner, case)
    result = subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-c:a",
            "libopus",
            "-f",
            "webm",
            "pipe:1",
        ],
        input=wav_bytes(61),
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=15,
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    response = record(client, owner, case, data=result.stdout)
    assert response.status_code == 400 and voice.transcriptions == [], response.text


def test_spoken_review_preserves_explicit_no_money_loss(
    client, owner, case_factory, speaker, provider, app
):
    case = case_factory(
        body={
            "description": "Synthetic attempted phishing without any payment.",
            "money_lost": False,
        }
    )
    permissions(client, owner, case)
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
    assert analyze(client, owner, case).json()["current_status"] == "CITIZEN_REVIEW"
    current = client.get(f"/api/v1/complaints/{case['complaint_id']}", headers=owner).json()
    response = speech(client, owner, current)
    assert response.status_code == 200 and "رقم کا نقصان نہیں ہوا" in response.json()["text_ur"], (
        response.text
    )
