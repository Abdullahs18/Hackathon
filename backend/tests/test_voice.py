import json
import wave
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock

import httpx2
import pytest
from google.genai import errors, types
from requests.exceptions import RequestException

from app.voice.audio import MAX_AUDIO_BYTES, load_audio
from app.voice.config import VoiceError, VoiceSettings
from app.voice.providers import GeminiProvider, GTTSSpeaker
from app.voice.schemas import extraction_schema, validate_extraction

SAMPLE = {
    "incident_data": {
        "description": "Reported payment scam",
        "amount": 1500,
        "transaction_reference": "DEMO-123",
        "money_lost": True,
        "incident_date": None,
        "evidence_ids": [],
    },
    "spoken_summary_ur": "آپ نے ایک مشکوک ادائیگی کی اطلاع دی ہے۔ براہ کرم تفصیلات چیک کریں۔",
    "uncertainties": ["Incident date is unknown"],
}


def wav_bytes(seconds=1):
    output = BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\0\0" * 8000 * seconds)
    return output.getvalue()


def test_audio_detected_by_contents_not_extension(tmp_path):
    path = tmp_path / "arbitrary.bin"
    path.write_bytes(wav_bytes())
    result = load_audio(path)
    assert result.mime_type == "audio/wav"
    assert result.duration_seconds == 1


@pytest.mark.parametrize(
    "data",
    [b"", b"fake audio", b"RIFF1234WAVE", b"x" * (MAX_AUDIO_BYTES + 1), wav_bytes(seconds=61)],
)
def test_invalid_audio_is_rejected_before_upload(tmp_path, data):
    path = tmp_path / "claim.wav"
    path.write_bytes(data)
    with pytest.raises(VoiceError, match="Audio|Use valid"):
        load_audio(path)


@pytest.mark.parametrize(
    "data",
    [
        {"incident_data": {"amount": "1500"}, "spoken_summary_ur": "سلام", "uncertainties": []},
        {
            "incident_data": {"amount": float("inf")},
            "spoken_summary_ur": "سلام",
            "uncertainties": [],
        },
        {
            "incident_data": {"evidence_ids": ["invented"]},
            "spoken_summary_ur": "سلام",
            "uncertainties": [],
        },
        {
            "incident_data": {"citizen_confirmed_corrections": ["yes"]},
            "spoken_summary_ur": "سلام",
            "uncertainties": [],
        },
        {
            "incident_data": {"citizen_authorized": True},
            "spoken_summary_ur": "سلام",
            "uncertainties": [],
        },
        {"incident_data": {}, "spoken_summary_ur": " ", "uncertainties": []},
        {"incident_data": {}, "spoken_summary_ur": "سلام", "uncertainties": [], "submit": True},
    ],
)
def test_bad_extraction_is_rejected(data):
    with pytest.raises(VoiceError, match="failed validation"):
        validate_extraction(data)


def test_canonical_nulls_and_fields_are_preserved():
    result = validate_extraction(SAMPLE)
    assert result.incident_data["incident_date"] is None
    assert result.incident_data["transaction_reference"] == "DEMO-123"
    assert "currency" not in result.incident_data
    assert extraction_schema()["additionalProperties"] is False
    assert "nullable" not in json.dumps(extraction_schema())


@pytest.fixture
def provider(monkeypatch):
    client = Mock()
    factory = Mock(return_value=client)
    monkeypatch.setattr("app.voice.providers.genai.Client", factory)
    result = GeminiProvider(
        VoiceSettings(
            _env_file=None,
            GEMINI_API_KEY="synthetic-not-a-real-key",
            gemini_model="synthetic-model",
        )
    )
    return result, client, factory


def response(text, finish=types.FinishReason.STOP):
    return SimpleNamespace(text=text, candidates=[SimpleNamespace(finish_reason=finish)])


def test_gemini_adapter_uses_schema_no_tools_and_single_attempt(provider):
    adapter, client, factory = provider
    client.models.generate_content.return_value = response(json.dumps(SAMPLE))
    assert adapter.extract("Synthetic transcript").incident_data["amount"] == 1500
    options = factory.call_args.kwargs["http_options"]
    assert options.timeout == 45000
    assert options.retry_options.attempts == 1
    config = client.models.generate_content.call_args.kwargs["config"]
    assert config.automatic_function_calling.disable is True
    assert config.automatic_continuation is False
    assert config.tools is None
    assert config.response_json_schema == extraction_schema()
    assert client.models.generate_content.call_count == 1
    adapter.close()
    client.close.assert_called_once()


@pytest.mark.parametrize(
    "text,finish",
    [
        ("", types.FinishReason.STOP),
        ("not JSON", types.FinishReason.STOP),
        ("{}", types.FinishReason.MAX_TOKENS),
        ("{}", types.FinishReason.SAFETY),
    ],
)
def test_incomplete_or_malformed_gemini_output(provider, text, finish):
    adapter, client, _ = provider
    client.models.generate_content.return_value = response(text, finish)
    with pytest.raises(VoiceError):
        adapter.extract("Synthetic text")


@pytest.mark.parametrize(
    "code,expected",
    [
        (429, "provider_quota"),
        (403, "provider_auth"),
        (404, "provider_request"),
        (503, "provider_unavailable"),
    ],
)
def test_gemini_failure_is_safe_and_not_retried(provider, code, expected):
    adapter, client, _ = provider
    client.models.generate_content.side_effect = errors.APIError(
        code, {"error": {"message": "PRIVATE-KEY-AND-TRANSCRIPT"}}
    )
    with pytest.raises(VoiceError) as caught:
        adapter.extract("PRIVATE-INPUT")
    assert caught.value.code == expected
    assert "PRIVATE" not in str(caught.value)
    assert client.models.generate_content.call_count == 1


def test_list_models_is_not_generation(provider):
    adapter, client, _ = provider
    client.models.list.return_value = [
        SimpleNamespace(name="models/test-model", supported_actions=["generateContent"]),
        SimpleNamespace(name="models/embedding", supported_actions=["embedContent"]),
    ]
    assert adapter.list_models() == ["test-model"]
    client.models.generate_content.assert_not_called()


def test_missing_key_and_model_fail_before_generation(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("DASTAK_GEMINI_API_KEY", raising=False)
    with pytest.raises(VoiceError) as caught:
        GeminiProvider(VoiceSettings(_env_file=None))
    assert caught.value.code == "missing_key"


def test_gtts_uses_urdu_and_bounded_network_timeout(monkeypatch):
    factory = Mock()
    factory.return_value.write_to_fp.side_effect = lambda fp: fp.write(b"MP3-audio")
    monkeypatch.setattr("app.voice.providers.gTTS", factory)
    assert GTTSSpeaker().synthesize("سلام") == b"MP3-audio"
    assert factory.call_args.kwargs == {"text": "سلام", "lang": "ur", "timeout": (5, 20)}


def test_timeout_is_sanitized_without_retry(provider):
    adapter, client, _ = provider
    client.models.generate_content.side_effect = httpx2.ReadTimeout("PRIVATE-TRANSCRIPT")
    with pytest.raises(VoiceError) as caught:
        adapter.extract("Synthetic transcript")
    assert caught.value.code == "provider_timeout"
    assert "PRIVATE" not in str(caught.value)
    assert client.models.generate_content.call_count == 1


def test_transcription_sends_inline_audio_and_no_tools(provider, tmp_path):
    adapter, client, _ = provider
    path = tmp_path / "demo.wav"
    path.write_bytes(wav_bytes())
    audio = load_audio(path)
    client.models.generate_content.return_value = response("Synthetic Urdu transcript")
    assert adapter.transcribe(audio) == "Synthetic Urdu transcript"
    arguments = client.models.generate_content.call_args.kwargs
    assert arguments["contents"][0].inline_data.data == audio.data
    assert arguments["contents"][0].inline_data.mime_type == "audio/wav"
    assert arguments["config"].tools is None


def test_missing_model_never_calls_generate(provider):
    adapter, client, _ = provider
    adapter.model = ""
    with pytest.raises(VoiceError) as caught:
        adapter.extract("Synthetic transcript")
    assert caught.value.code == "missing_model"
    client.models.generate_content.assert_not_called()


def test_gtts_transport_error_is_sanitized(monkeypatch):
    factory = Mock(side_effect=RequestException("PRIVATE-SUMMARY"))
    monkeypatch.setattr("app.voice.providers.gTTS", factory)
    with pytest.raises(VoiceError) as caught:
        GTTSSpeaker().synthesize("سلام")
    assert caught.value.code == "tts_unavailable"
    assert "PRIVATE" not in str(caught.value)
