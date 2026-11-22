"""Explicit local provider proof; does not read, create, authorize or submit any case."""

import argparse
import json
import logging
import sys
from pathlib import Path

from pydantic import ValidationError

from app.voice.audio import load_audio
from app.voice.config import VoiceError, VoiceSettings
from app.voice.providers import GeminiProvider, GTTSSpeaker, Speaker
from app.voice.schemas import VoiceProofResult, validate_extraction


def write_new(path: Path, data: bytes) -> None:
    # Avoid overwriting previous proof results or recordings.
    with path.open("xb") as output:
        output.write(data)


def speak_saved(output_dir: Path, speaker: Speaker) -> None:
    path = output_dir / "result.json"
    if path.stat().st_size > 128 * 1024:
        raise VoiceError("invalid_checkpoint", "Saved proof is too large.")
    result = VoiceProofResult.model_validate_json(path.read_bytes())
    extraction = validate_extraction(result.extraction.model_dump())
    write_new(output_dir / "summary.mp3", speaker.synthesize(extraction.spoken_summary_ur))


def run(
    args, settings: VoiceSettings, provider_factory=GeminiProvider, speaker_factory=GTTSSpeaker
) -> None:
    if args.list_models:
        provider = provider_factory(settings)
        try:
            print(json.dumps(provider.list_models(), ensure_ascii=False, indent=2))
        finally:
            provider.close()
        print("Listing does not prove free-tier entitlement; verify quota in AI Studio.")
        return
    if not args.allow_external_processing:
        raise VoiceError(
            "processing_not_authorized",
            "Use synthetic data only. Add --allow-external-processing to send it to providers.",
        )
    output_dir = args.output_dir
    if (output_dir / "summary.mp3").exists():
        raise VoiceError("output_exists", "Playback already exists. Use a new output directory.")
    if args.speak_only:
        speak_saved(output_dir, speaker_factory())
        print("Urdu playback saved to summary.mp3. Listen and check it yourself.")
        return
    output_dir.mkdir(parents=True, exist_ok=True)
    if (output_dir / "result.json").exists() or (output_dir / "transcript.txt").exists():
        raise VoiceError(
            "output_exists", "Use a new output directory to preserve previous results."
        )
    audio = load_audio(args.audio) if args.audio else None
    transcript = None
    if args.transcript:
        if args.transcript.stat().st_size > 40000:
            raise VoiceError("invalid_transcript", "Transcript is too large.")
        transcript = args.transcript.read_text(encoding="utf-8").strip()
        if not transcript or len(transcript) > 10000:
            raise VoiceError("invalid_transcript", "Transcript must contain 1 to 10000 characters.")
    provider = provider_factory(settings)
    try:
        if transcript is None:
            transcript = provider.transcribe(audio)
        write_new(output_dir / "transcript.txt", transcript.encode("utf-8"))
        extraction = provider.extract(transcript)
        result = VoiceProofResult(
            model=provider.model, transcript=transcript, extraction=extraction
        )
        write_new(output_dir / "result.json", result.model_dump_json(indent=2).encode("utf-8"))
    finally:
        provider.close()
    # Save validated text before TTS, so a speech failure doesn't require another Gemini request.
    write_new(
        output_dir / "summary.mp3", speaker_factory().synthesize(extraction.spoken_summary_ur)
    )
    print("Saved transcript.txt, result.json and summary.mp3. Check every fact and listen to Urdu.")
    print("This is an unapproved preview. No complaint was created or submitted.")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument("--list-models", action="store_true")
    source.add_argument("--audio", type=Path)
    source.add_argument("--transcript", type=Path)
    source.add_argument("--speak-only", action="store_true")
    result.add_argument("--output-dir", type=Path, default=Path("voice-output"))
    result.add_argument("--allow-external-processing", action="store_true")
    return result


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    # Third-party debug/trace logs can contain input data or credentials.
    logging.disable(logging.CRITICAL)
    try:
        run(args, VoiceSettings())
        return 0
    except VoiceError as exc:
        print(f"{exc.code}: {exc}", file=sys.stderr)
    except (OSError, UnicodeError):
        print(
            "file_error: Check file paths, permissions and existing output files.", file=sys.stderr
        )
    except ValidationError:
        print(
            "configuration_or_checkpoint_error: Check local settings or saved proof format.",
            file=sys.stderr,
        )
    except Exception:
        print(
            "provider_error: Proof failed. Provider details were omitted to protect secrets.",
            file=sys.stderr,
        )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
