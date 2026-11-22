import json
from unittest.mock import Mock

import pytest

from app.voice.config import VoiceError, VoiceSettings
from app.voice.schemas import validate_extraction
from app.voice_proof import main, parser, run
from tests.test_voice import SAMPLE, wav_bytes


def arguments(tmp_path, *extra):
    audio = tmp_path / "demo.wav"
    audio.write_bytes(wav_bytes())
    return parser().parse_args(
        ["--audio", str(audio), "--output-dir", str(tmp_path / "result"), *extra]
    )


def test_without_external_processing_authorization_no_provider_is_called(tmp_path):
    provider = Mock()
    with pytest.raises(VoiceError) as caught:
        run(arguments(tmp_path), VoiceSettings(_env_file=None), provider_factory=provider)
    assert caught.value.code == "processing_not_authorized"
    provider.assert_not_called()


def test_checkpoint_saved_before_tts_failure_and_speak_retry_avoids_gemini(tmp_path):
    adapter = Mock(model="synthetic-model")
    adapter.transcribe.return_value = "Synthetic transcript with DEMO-123"
    adapter.extract.return_value = validate_extraction(SAMPLE)
    speaker = Mock()
    speaker.synthesize.side_effect = VoiceError("tts_unavailable", "Speech unavailable")
    args = arguments(tmp_path, "--allow-external-processing")
    with pytest.raises(VoiceError):
        run(args, VoiceSettings(_env_file=None), lambda _: adapter, lambda: speaker)
    adapter.close.assert_called_once()
    checkpoint = json.loads((args.output_dir / "result.json").read_text(encoding="utf-8"))
    assert checkpoint["submitted"] is False
    assert checkpoint["requires_citizen_review"] is True
    assert checkpoint["extraction"]["incident_data"]["transaction_reference"] == "DEMO-123"
    assert (args.output_dir / "transcript.txt").read_text() == adapter.transcribe.return_value
    provider = Mock()
    retry_speaker = Mock()
    retry_speaker.synthesize.return_value = b"MP3-audio"
    retry = parser().parse_args(
        ["--speak-only", "--output-dir", str(args.output_dir), "--allow-external-processing"]
    )
    run(retry, VoiceSettings(_env_file=None), provider, lambda: retry_speaker)
    provider.assert_not_called()
    assert (args.output_dir / "summary.mp3").read_bytes() == b"MP3-audio"


def test_existing_results_are_not_overwritten_or_sent_to_providers(tmp_path):
    args = arguments(tmp_path, "--allow-external-processing")
    args.output_dir.mkdir()
    (args.output_dir / "result.json").write_text("keep")
    provider = Mock()
    with pytest.raises(VoiceError):
        run(args, VoiceSettings(_env_file=None), provider)
    provider.assert_not_called()
    assert (args.output_dir / "result.json").read_text() == "keep"


def test_cli_failures_hide_exception_details(monkeypatch, capsys):
    monkeypatch.setattr("app.voice_proof.run", Mock(side_effect=RuntimeError("PRIVATE-KEY")))
    assert main(["--list-models"]) == 1
    assert "PRIVATE-KEY" not in capsys.readouterr().err


def test_transcript_checkpoint_survives_extraction_failure(tmp_path):
    args = arguments(tmp_path, "--allow-external-processing")
    adapter = Mock(model="synthetic-model")
    adapter.transcribe.return_value = "Saved synthetic transcript"
    adapter.extract.side_effect = VoiceError("provider_quota", "Quota reached")
    with pytest.raises(VoiceError):
        run(args, VoiceSettings(_env_file=None), lambda _: adapter)
    assert (args.output_dir / "transcript.txt").read_text() == "Saved synthetic transcript"
    assert not (args.output_dir / "result.json").exists()
    adapter.close.assert_called_once()
