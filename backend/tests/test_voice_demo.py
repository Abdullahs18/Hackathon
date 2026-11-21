import httpx2
import pytest

from app.voice.config import VoiceError
from app.voice_demo import run_demo


class LocalAPI:
    def __init__(self):
        self.headers = {}
        self.paths = []

    def request(self, method, path, **kwargs):
        self.paths.append(path)
        if path.endswith("/auth/login"):
            body = {"access_token": "private-test-token"}
        elif path == "/api/v1/complaints":
            body = {"complaint_id": "synthetic-case", "version": 1}
        else:
            body = {}
        return httpx2.Response(200, json=body)


def test_input_speech_failure_names_gtts_before_gemini_without_leaking_error(capsys):
    client = LocalAPI()

    class UnavailableSpeech:
        def synthesize(self, text):
            raise VoiceError("tts_unavailable", "private-provider-details")

    with pytest.raises(RuntimeError, match="gTTS failed") as error:
        run_demo(client, "private-password", UnavailableSpeech())
    output = capsys.readouterr().out + str(error.value)
    assert "generate_synthetic_urdu_input" in output
    assert "Gemini transcription has not started" in output
    assert "private" not in output
    assert not any(path.endswith("/voice-inputs") for path in client.paths)


def test_api_transport_failure_names_stage_without_echoing_request_or_secret(capsys):
    class UnavailableAPI(LocalAPI):
        def request(self, method, path, **kwargs):
            raise httpx2.ConnectError("private-request-url-and-token")

    with pytest.raises(RuntimeError, match="during login") as error:
        run_demo(UnavailableAPI(), "private-password", None)
    assert "private" not in capsys.readouterr().out + str(error.value)


def test_http_failure_names_stage_without_echoing_response_body(capsys):
    class DeniedAPI(LocalAPI):
        def request(self, method, path, **kwargs):
            return httpx2.Response(401, json={"detail": "private-error-details"})

    with pytest.raises(RuntimeError, match="login failed with HTTP 401") as error:
        run_demo(DeniedAPI(), "private-password", None)
    assert "private" not in capsys.readouterr().out + str(error.value)
