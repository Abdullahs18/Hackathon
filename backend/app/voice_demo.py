"""Opt-in live-provider smoke test using fixed synthetic Urdu facts. Never files a complaint."""

import argparse
import json
import tempfile
from pathlib import Path
from uuid import uuid4

import httpx2

from app.config import Settings
from app.voice.config import VoiceError
from app.voice.providers import GTTSSpeaker

UTTERANCE = (
    "مجھے جعلی امداد کا پیغام ملا تھا۔ میں نے پندرہ سو پاکستانی روپے بھیجے۔ "
    "مجھے واقعے کی تاریخ یاد نہیں۔ ٹرانزیکشن کا حوالہ بھی معلوم نہیں۔"
)
FACTS = {
    "description": UTTERANCE,
    "money_lost": True,
    "amount": 1500,
    "currency": "PKR",
    "incident_date": None,
    "transaction_reference": None,
}


def run_demo(client, password, speaker, output_dir=None):
    def progress(stage):
        print(json.dumps({"stage": stage}), flush=True)

    def request(method, path, *, stage, **kwargs):
        progress(stage)
        try:
            response = client.request(method, path, **kwargs)
        except httpx2.TransportError:
            raise RuntimeError(
                f"Local API connection/timeout failed during {stage}. "
                "Recover the printed case ID before retrying; provider work may have been saved."
            ) from None
        if response.status_code >= 400:
            raise RuntimeError(
                f"{stage} failed with HTTP {response.status_code}. Recover the printed case ID."
            )
        return response

    login = request(
        "POST",
        "/api/v1/auth/login",
        stage="login",
        json={"user_id": "demo-citizen-1", "password": password},
    ).json()
    client.headers.update({"Authorization": "Bearer " + login["access_token"]})
    case = request(
        "POST",
        "/api/v1/complaints",
        stage="create_synthetic_draft",
        json={"description": "Synthetic live Urdu voice workflow check."},
    ).json()
    identity = case["complaint_id"]
    print(json.dumps({"stage": "synthetic_draft_created", "complaint_id": identity}), flush=True)
    root = f"/api/v1/complaints/{identity}"
    for recipient, purpose, scopes in [
        ("service:gemini-voice", "voice_processing", ["voice_audio", "voice_transcript"]),
        ("service:gtts", "speech_synthesis", ["spoken_text"]),
    ]:
        request(
            "POST",
            root + "/consents",
            stage="grant_" + purpose,
            json={"recipient": recipient, "purpose": purpose, "data_scopes": scopes},
        )
    progress("generate_synthetic_urdu_input")
    try:
        audio = speaker.synthesize(UTTERANCE)
    except VoiceError:
        raise RuntimeError(
            "gTTS failed while generating the synthetic Urdu input audio. "
            "Gemini transcription has not started. Check gTTS connectivity from the API container. "
            "The printed case remains an unfiled draft."
        ) from None
    turn = request(
        "POST",
        root + "/voice-inputs",
        stage="transcribe_and_extract_voice",
        headers={
            "If-Match": f'"{case["version"]}"',
            "Idempotency-Key": "voice-demo-" + uuid4().hex,
        },
        data={"allow_external_processing": "true"},
        files={"file": ("synthetic.mp3", audio, "audio/mpeg")},
    ).json()
    # This explicit synthetic test has known ground truth. It never automatically trusts
    # model suggestions as citizen-confirmed facts, and never authorizes final filing.
    request(
        "POST",
        root + f"/voice-inputs/{turn['voice_turn_id']}/confirm",
        stage="confirm_synthetic_facts",
        headers={"If-Match": f'"{case["version"]}"'},
        json={"citizen_confirmed": True, "incident_patch": FACTS},
    )
    analysis = request(
        "POST",
        root + "/analyze",
        stage="analyze_saved_case",
        json={"allow_external_processing": True},
    ).json()
    result = {
        "simulated": True,
        "submitted": False,
        "complaint_id": identity,
        "voice_turn_id": turn["voice_turn_id"],
        "proposal_amount_matches": turn["extraction"]["incident_data"].get("amount") == 1500,
        "unknown_date_preserved": turn["extraction"]["incident_data"].get("incident_date") is None,
        "current_status": analysis["current_status"],
        "review_ready": analysis["current_status"] == "CITIZEN_REVIEW",
    }
    if not result["review_ready"]:
        return result
    current = request("GET", root, stage="read_current_case").json()
    speech = request(
        "POST",
        root + "/speech",
        stage="generate_spoken_review",
        headers={
            "If-Match": f'"{current["version"]}"',
            "Idempotency-Key": "voice-review-" + uuid4().hex,
        },
        json={"kind": "review", "allow_external_processing": True},
    ).json()
    received = request("GET", speech["audio_path"], stage="download_review_audio")
    if not received.headers.get("content-type", "").startswith("audio/mpeg"):
        raise RuntimeError("Review audio response did not contain MP3.")
    with tempfile.NamedTemporaryFile(
        prefix="dastak-voice-review-", suffix=".mp3", dir=output_dir, delete=False
    ) as output:
        output.write(received.content)
        result["review_audio_file"] = str(Path(output.name))
    result.update(speech_id=speech["speech_id"], audio_bytes=len(received.content))
    return result


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Create a synthetic voice case and send fixed Urdu audio/text to Gemini/gTTS. "
            "Confirm known synthetic facts, then stop before filing."
        )
    )
    parser.add_argument("--allow-external-processing", action="store_true", required=True)
    parser.parse_args()
    settings = Settings()
    if settings.demo_password is None:
        raise SystemExit("Set the existing demo password in DASTAK_DEMO_PASSWORD locally.")
    try:
        with httpx2.Client(
            base_url="http://127.0.0.1:8000", timeout=180, follow_redirects=False
        ) as client:
            result = run_demo(client, settings.demo_password.get_secret_value(), GTTSSpeaker())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if not result["review_ready"]:
            raise SystemExit("The case needs information or human review; inspect its saved state.")
    except (RuntimeError, httpx2.TransportError, VoiceError) as exc:
        raise SystemExit(
            str(exc)
            if isinstance(exc, RuntimeError)
            else "Voice provider or local API connection failed; recover the printed case ID."
        ) from None


if __name__ == "__main__":
    main()
