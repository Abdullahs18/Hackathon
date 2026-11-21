import re

import pytest
from sqlalchemy.orm import Session

from app.models import CaseSpeech
from app.routing import seed_demo_routing
from app.voice.config import VoiceError
from app.voice.urdu import needs_translation, prepare_translation
from tests.test_analysis import analyze, provider
from tests.test_case_voice import VoiceProvider, permissions, speaker, speech
from tests.test_cases import case_factory, owner

__all__ = ["provider", "speaker", "case_factory", "owner"]


def test_translation_preserves_saved_framing_identifiers_and_numbers():
    source = (
        "خلاصہ: I sent 1500 Pakistani rupees on 2026-01-02. حوالہ: DEMO-123۔ ابھی جمع نہیں ہوا۔"
    )
    prepared = prepare_translation(source, ("DEMO-123",))
    output = VoiceProvider().translate_urdu(prepared.masked)
    restored = prepared.restore(output)
    assert all(
        value in restored for value in ("1500", "2026-01-02", "DEMO-123", "ابھی جمع نہیں ہوا۔")
    )
    assert not needs_translation(restored, ("DEMO-123",))
    assert needs_translation(source, ("DEMO-123",))


@pytest.mark.parametrize("damage", ["drop", "repeat", "reorder", "latin", "number", "new_token"])
def test_invalid_translation_is_rejected(damage):
    prepared = prepare_translation("خلاصہ: sent 1500 rupees۔ ابھی جمع نہیں ہوا۔")
    valid = VoiceProvider().translate_urdu(prepared.masked)
    tokens = [token for token, _ in prepared.replacements]
    damaged = {
        "drop": valid.replace(tokens[0], ""),
        "repeat": valid + tokens[0],
        "reorder": valid.replace(tokens[0], "TEMP")
        .replace(tokens[-1], tokens[0])
        .replace("TEMP", tokens[-1]),
        "latin": valid + " sent money",
        "number": valid + " 999",
        "new_token": valid + "__K12345678_99__",
    }[damage]
    with pytest.raises(VoiceError):
        prepared.restore(damaged)


def review(client, owner, case_factory, provider, app):
    provider.output["classification"]["missing_fields"] = []
    with Session(app.state.engine) as session, session.begin():
        seed_demo_routing(session)
    case = case_factory(
        body={
            "description": "Synthetic fake aid message; I sent 1500 Pakistani rupees.",
            "money_lost": True,
            "amount": 1500,
            "currency": "PKR",
            "transaction_reference": "DEMO-123",
        }
    )
    permissions(client, owner, case)
    result = analyze(client, owner, case)
    assert result.status_code == 200, result.text
    return client.get("/api/v1/complaints/" + case["complaint_id"], headers=owner).json()


def test_translation_consent_required_before_any_provider_disclosure(
    client, owner, case_factory, provider, speaker, app
):
    case = review(client, owner, case_factory, provider, app)
    translator = VoiceProvider()
    app.state.speech_translation_provider_factory = lambda: translator
    consents = client.get(
        f"/api/v1/complaints/{case['complaint_id']}/consents", headers=owner
    ).json()
    grant = next(row for row in consents if row["purpose"] == "speech_translation")
    assert (
        client.post(
            "/api/v1/consents/" + grant["consent_id"] + "/withdraw", headers=owner
        ).status_code
        == 200
    )
    result = speech(client, owner, case)
    assert result.status_code == 403 and not translator.translations and not speaker.calls


def test_tts_retry_reuses_preserved_urdu_checkpoint(
    client, owner, case_factory, provider, speaker, app
):
    case = review(client, owner, case_factory, provider, app)
    translator = VoiceProvider()
    app.state.speech_translation_provider_factory = lambda: translator
    speaker.error = VoiceError("provider_unavailable", "Synthetic failure")
    assert speech(client, owner, case).status_code == 503
    speaker.error = None
    result = speech(client, owner, case)
    assert result.status_code == 200, result.text
    assert len(translator.translations) == 1 and len(speaker.calls) == 2
    text = result.json()["text_ur"]
    assert (
        "1500" in text
        and "DEMO-123" in text
        and not re.search("[A-Za-z]", text.replace("DEMO-123", ""))
    )
    assert (
        client.get("/api/v1/complaints/" + case["complaint_id"], headers=owner).json()[
            "complaint_draft"
        ]
        == case["complaint_draft"]
    )


def test_translation_revocation_in_flight_never_reaches_speaker(
    client, owner, case_factory, provider, speaker, app
):
    case = review(client, owner, case_factory, provider, app)
    translator = VoiceProvider()
    app.state.speech_translation_provider_factory = lambda: translator
    grants = client.get(f"/api/v1/complaints/{case['complaint_id']}/consents", headers=owner).json()
    grant = next(row for row in grants if row["purpose"] == "speech_translation")
    translator.translate_callback = lambda: client.post(
        "/api/v1/consents/" + grant["consent_id"] + "/withdraw", headers=owner
    )
    assert speech(client, owner, case).status_code == 403
    assert not speaker.calls
    with Session(app.state.engine) as session:
        assert (
            session.get(CaseSpeech, session.query(CaseSpeech).first().speech_id).audio_data is None
        )


def test_invalid_translated_amount_never_reaches_speaker(
    client, owner, case_factory, provider, speaker, app
):
    case = review(client, owner, case_factory, provider, app)
    translator = VoiceProvider()
    translate = translator.translate_urdu
    translator.translate_urdu = lambda text: translate(text) + " 999"
    app.state.speech_translation_provider_factory = lambda: translator
    result = speech(client, owner, case)
    assert result.status_code == 502, result.text
    assert not speaker.calls


def test_case_edit_during_translation_discards_output(
    client, owner, case_factory, provider, speaker, app
):
    case = review(client, owner, case_factory, provider, app)
    translator = VoiceProvider()
    app.state.speech_translation_provider_factory = lambda: translator
    translator.translate_callback = lambda: client.patch(
        "/api/v1/complaints/" + case["complaint_id"],
        headers={**owner, "If-Match": '"' + str(case["version"]) + '"'},
        json={"description": "Newer citizen correction."},
    )
    result = speech(client, owner, case)
    assert result.status_code == 409, result.text
    assert not speaker.calls
