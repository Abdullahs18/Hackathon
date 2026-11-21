"""Persisted Urdu input, explicit citizen correction, and private version-bound speech."""

import hashlib
import hmac
from datetime import UTC, datetime
from io import BytesIO
from typing import Annotated
from uuid import UUID, uuid4

from anyio import from_thread
from fastapi import APIRouter, File, Form, Header, HTTPException, Request, Response, UploadFile
from mutagen.mp3 import MP3
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api_key_routes import PageLimit
from app.audit import record_event
from app.case_policy import apply_incident_patch, case_view, own_case, require_version
from app.models import CaseAnalysis, CaseSpeech, VoiceTurn
from app.pagination import page
from app.security import CurrentUser, SessionDep
from app.submission_policy import digest
from app.validation import validate_payload, validate_schema
from app.voice.audio import MAX_AUDIO_BYTES, parse_audio
from app.voice.config import VoiceError
from app.voice.urdu import needs_translation, prepare_translation
from app.voice_jobs import (
    claim,
    current_owner,
    editable,
    fail,
    owned_turn,
    process_turn,
    public_error,
    require_urdu,
    save,
    service_consent,
    turn_view,
)

router = APIRouter(prefix="/api/v1/complaints", tags=["Citizen complaints"])
VoiceKey = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
VoiceVersion = Annotated[str, Header(alias="If-Match", pattern=r'^"[1-9][0-9]*"$', max_length=20)]


def authorize_new(case, if_match):
    require_version(case, if_match)
    editable(case)


async def check_upload_form(request):
    form = await request.form()
    expected = {"file", "allow_external_processing"}
    if set(form) != expected or any(len(form.getlist(name)) != 1 for name in expected):
        raise HTTPException(400, "Upload exactly one file and one external-processing permission.")


@router.post("/{id}/voice-inputs", operation_id="createVoiceInput")
def create_voice(
    id: str,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    idempotency_key: VoiceKey,
    if_match: VoiceVersion,
    file: Annotated[UploadFile, File()],
    allow_external_processing: Annotated[str, Form()],
):
    case = own_case(session, user, id)
    from_thread.run(check_upload_form, request)
    if allow_external_processing != "true":
        raise HTTPException(
            400, "Explicit permission to send this recording/transcript to Gemini is required."
        )
    data = file.file.read(MAX_AUDIO_BYTES + 1)
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(
            413 if len(data) > MAX_AUDIO_BYTES else 400, "Audio must contain at most 5 MiB."
        )
    fingerprint = digest(
        {"case_id": id, "if_match": if_match, "sha256": hashlib.sha256(data).hexdigest()}
    )
    row = session.scalar(
        select(VoiceTurn).where(
            VoiceTurn.citizen_id == user.user_id, VoiceTurn.idempotency_key == idempotency_key
        )
    )
    if row is not None:
        if row.complaint_id != id or row.fingerprint != fingerprint:
            raise HTTPException(
                409, "Voice request key belongs to different audio, case or source version."
            )
        if row.status in {"READY", "APPLIED"}:
            return turn_view(row)
        if row.status == "STALE":
            raise HTTPException(
                409, "This voice proposal is stale. Start a new request for the current case."
            )
    authorize_new(case, if_match)
    consent = service_consent(session, case)
    try:
        audio = parse_audio(data)
    except VoiceError:
        raise HTTPException(
            400, "Use valid WAV, MP3, M4A, Ogg or WebM audio, at most 60 seconds."
        ) from None
    with request.app.state.analysis_guard.claim(id):
        now = datetime.now(UTC)
        if row is None:
            row = VoiceTurn(
                voice_turn_id=str(uuid4()),
                complaint_id=id,
                citizen_id=user.user_id,
                input_version=case.version,
                fingerprint=fingerprint,
                idempotency_key=idempotency_key,
                status="FAILED",
                next_step="transcribe",
                consent_snapshot=consent,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        if row.input_version != case.version:
            raise HTTPException(409, "Voice source version changed.")
        row.consent_snapshot = consent
        token = claim(row)
        identity, actor_id, key_id = (
            row.voice_turn_id,
            user.user_id,
            getattr(request.state, "api_key_id", None),
        )
        record_event(
            session,
            "voice.processing_started",
            actor_id,
            "Citizen permitted this voice input to be processed",
            complaint_id=id,
            details={"voice_turn_id": identity, "input_version": case.version},
        )
        save(session)
        return process_turn(
            request.app, actor_id, id, identity, token, audio, key_id, "createVoiceInput"
        )


@router.get("/{id}/voice-inputs", operation_id="listVoiceInputs")
def list_turns(
    id: str,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    before: UUID | None = None,
    limit: PageLimit = 50,
):
    case = own_case(session, user, id)
    rows = page(
        session,
        select(VoiceTurn).where(VoiceTurn.complaint_id == id),
        VoiceTurn,
        VoiceTurn.voice_turn_id,
        VoiceTurn.created_at,
        before,
        limit,
        response,
        case.complaint_id,
    )
    return [turn_view(row[0]) for row in rows]


@router.get("/{id}/voice-inputs/{turn_id}", operation_id="getVoiceInput")
def get_turn(id: str, turn_id: UUID, user: CurrentUser, session: SessionDep):
    return turn_view(owned_turn(session, own_case(session, user, id), turn_id))


@router.post("/{id}/voice-inputs/{turn_id}/retry", operation_id="retryVoiceExtraction")
def retry_extract(
    id: str,
    turn_id: UUID,
    body: dict,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    if_match: VoiceVersion,
):
    case = own_case(session, user, id)
    validate_payload("AnalysisRequest", body)
    row = owned_turn(session, case, turn_id)
    if row.status in {"READY", "APPLIED"}:
        return turn_view(row)
    authorize_new(case, if_match)
    if (
        row.status == "STALE"
        or row.input_version != case.version
        or not row.transcript
        or row.next_step != "extract"
    ):
        raise HTTPException(
            409, "A current saved transcript is required; otherwise upload a new recording."
        )
    with request.app.state.analysis_guard.claim(id):
        row.consent_snapshot = service_consent(session, case)
        token = claim(row)
        identity, actor_id, key_id = (
            row.voice_turn_id,
            user.user_id,
            getattr(request.state, "api_key_id", None),
        )
        record_event(
            session,
            "voice.processing_started",
            actor_id,
            "Citizen permitted saved-transcript extraction",
            complaint_id=id,
            details={"voice_turn_id": identity, "input_version": case.version},
        )
        save(session)
        return process_turn(
            request.app, actor_id, id, identity, token, None, key_id, "retryVoiceExtraction"
        )


@router.post("/{id}/voice-inputs/{turn_id}/confirm", operation_id="confirmVoiceInput")
def confirm(
    id: str,
    turn_id: UUID,
    body: dict,
    response: Response,
    user: CurrentUser,
    session: SessionDep,
    if_match: VoiceVersion,
):
    case = own_case(session, user, id)
    validate_payload("VoiceConfirmation", body)
    row = owned_turn(session, case, turn_id)
    fingerprint = digest({"body": body, "if_match": if_match})
    if row.status == "APPLIED":
        if row.confirmation_fingerprint != fingerprint:
            raise HTTPException(
                409, "This voice proposal already has a different citizen confirmation."
            )
        return case_view(case, response)
    authorize_new(case, if_match)
    if row.status != "READY" or row.input_version != case.version:
        raise HTTPException(409, "Review a READY voice proposal from the current case revision.")
    patch = dict(body["incident_patch"])
    notes = []
    for key in ["transcript_correction", "correction_note"]:
        if key in body:
            if not body[key].strip():
                raise HTTPException(400, "A correction must contain text.")
            notes.append(body[key].strip())
    if notes:
        corrections = [*(case.incident_data.get("citizen_confirmed_corrections") or []), *notes]
        if len(corrections) > 100:
            raise HTTPException(400, "Too many saved citizen corrections.")
        patch["citizen_confirmed_corrections"] = corrections
    apply_incident_patch(case, patch)
    row.status, row.applied_version, row.confirmation_fingerprint = (
        "APPLIED",
        case.version,
        fingerprint,
    )
    row.confirmed_transcript = body.get("transcript_correction", row.transcript)
    row.updated_at = datetime.now(UTC)
    record_event(
        session,
        "voice.confirmed",
        user.user_id,
        "Citizen reviewed voice facts; filing still requires separate authorization",
        complaint_id=id,
        details={"voice_turn_id": row.voice_turn_id, "version": case.version},
    )
    result = case_view(case, response)
    save(session)
    return result


def brief(value, fallback):
    if value is None or value == "":
        return fallback
    text = str(value)
    return text if len(text) <= 160 else "مکمل تفصیل اسکرین پر دیکھیں"


def review_text(case):
    draft = case.complaint_draft
    if case.current_status != "CITIZEN_REVIEW" or not draft:
        raise HTTPException(409, "A current citizen-review draft is required for spoken review.")
    detail = draft["description"] or "تفصیل معلوم نہیں"
    if len(detail) > 600:
        detail = "تفصیل طویل ہے؛ مکمل تفصیل اسکرین پر پڑھیں"
    amount = (
        "آپ کے مطابق رقم کا نقصان نہیں ہوا۔ "
        if case.incident_data.get("money_lost") is False
        else "رقم: "
        + brief(draft.get("amount"), "معلوم نہیں")
        + " "
        + {"PKR": "پاکستانی روپے", "USD": "امریکی ڈالر", "EUR": "یورو", "GBP": "برطانوی پاؤنڈ"}.get(
            draft.get("currency"), brief(draft.get("currency"), "")
        )
        + "۔ "
    )
    destinations = {
        "mock-financial-fraud": "فرضی مالی فراڈ انٹیک",
        "mock-digital-safety": "فرضی ڈیجیٹل تحفظ انٹیک",
    }
    text = (
        "یہ فرضی شکایت کا جائزہ ہے۔ آپ نے بتایا: "
        + detail
        + "۔ "
        + amount
        + "تاریخ: "
        + brief(draft.get("incident_date"), "معلوم نہیں")
        + "۔ "
        "ٹرانزیکشن حوالہ: " + brief(draft.get("transaction_reference"), "معلوم نہیں") + "۔ "
        "منزل: " + destinations.get(case.destination_workspace_id, "فرضی وصول کنندہ") + "۔ "
        "مشکوک رابطوں اور ثبوت کی مکمل فہرست اسکرین پر دیکھیں۔ "
        "یہ سرکاری اندراج نہیں ہے۔ شکایت جمع کرنے کے لیے آپ کی الگ اجازت ضروری ہے۔"
    )
    return require_urdu(text)


def speech_source(session, case, body):
    kind = body["kind"]
    if kind == "voice_summary":
        if "voice_turn_id" not in body or "question_index" in body:
            raise HTTPException(400, "Choose one current voice proposal for its spoken summary.")
        try:
            identity = UUID(body["voice_turn_id"])
        except ValueError:
            raise HTTPException(400, "Choose a valid voice proposal ID.") from None
        turn = owned_turn(session, case, identity)
        if turn.status != "READY" or turn.input_version != case.version or not turn.extraction:
            raise HTTPException(
                409, "The voice summary is no longer a current unconfirmed proposal."
            )
        text = (
            "یہ غیر تصدیق شدہ مسودہ ہے؛ شکایت جمع نہیں ہوئی۔ "
            + turn.extraction["spoken_summary_ur"]
        )
        return require_urdu(text), turn.voice_turn_id
    if "voice_turn_id" in body or (kind == "review" and "question_index" in body):
        raise HTTPException(400, "Speech source fields do not match the selected kind.")
    if kind == "review":
        return review_text(case), None
    analysis = session.scalar(
        select(CaseAnalysis).where(
            CaseAnalysis.complaint_id == case.complaint_id,
            CaseAnalysis.result_version == case.version,
        )
    )
    questions = analysis.result.get("follow_up_questions_ur", []) if analysis else []
    index = body.get("question_index", 0)
    if index >= len(questions):
        raise HTTPException(409, "No current saved follow-up question exists at that index.")
    return require_urdu(questions[index]), None


def speech_view(row):
    result = {
        "speech_id": row.speech_id,
        "complaint_id": row.complaint_id,
        "case_version": row.case_version,
        "kind": row.kind,
        "text_ur": row.text_ur,
        "audio_path": f"/api/v1/complaints/{row.complaint_id}/speech/{row.speech_id}/audio",
        "simulated": True,
        "submitted": False,
    }
    validate_schema("SpeechOutput", result)
    return result


def valid_mp3(data):
    try:
        if not isinstance(data, bytes) or not 0 < len(data) <= 2 * 1024 * 1024:
            raise ValueError
        length = MP3(BytesIO(data)).info.length
        if not 0 < length <= 300:
            raise ValueError
    except Exception:
        raise VoiceError(
            "invalid_model_output", "Speech provider returned invalid or oversized MP3."
        ) from None
    return data


def speech_literals(session, case, body):
    values = [case.incident_data.get("transaction_reference")]
    if body["kind"] == "voice_summary":
        turn = session.get(VoiceTurn, body.get("voice_turn_id"))
        if turn and turn.extraction:
            values.append(turn.extraction["incident_data"].get("transaction_reference"))
    return tuple(value for value in values if isinstance(value, str) and value)


def speech_consents(session, case, body, text):
    snapshot = service_consent(session, case, speech=True)
    if needs_translation(text, speech_literals(session, case, body)):
        return {"gtts": snapshot, "translation": service_consent(session, case, translation=True)}
    return snapshot


def checked_speech(session, actor_id, case_id, identity, token, key_id, version, body, text):
    case = current_owner(session, actor_id, case_id, key_id, "createCaseSpeech")
    saved = session.get(CaseSpeech, identity, populate_existing=True)
    if (
        saved is None
        or saved.lease_token != token
        or saved.status != "PROCESSING"
        or case.version != version
    ):
        raise HTTPException(409, "Speech source or execution lease changed.")
    if speech_consents(session, case, body, text) != saved.consent_snapshot:
        raise HTTPException(403, "Speech provider consent changed during synthesis.")
    current_text, _ = speech_source(session, case, body)
    if current_text != text:
        raise HTTPException(409, "Saved spoken text changed during synthesis.")
    return saved


@router.post("/{id}/speech", operation_id="createCaseSpeech")
def create_speech(
    id: str,
    body: dict,
    request: Request,
    user: CurrentUser,
    session: SessionDep,
    if_match: VoiceVersion,
    idempotency_key: VoiceKey,
):
    case = own_case(session, user, id)
    validate_payload("SpeechRequest", body)
    require_version(case, if_match)
    try:
        text, turn_id = speech_source(session, case, body)
    except VoiceError as exc:
        public_error(exc)
    fingerprint = digest(
        {
            "case_id": id,
            "body": body,
            "if_match": if_match,
            "text": text,
            "speech_policy": "urdu-v2",
        }
    )
    row = session.scalar(
        select(CaseSpeech).where(
            CaseSpeech.citizen_id == user.user_id, CaseSpeech.idempotency_key == idempotency_key
        )
    )
    if row is not None:
        if row.complaint_id != id or row.fingerprint != fingerprint:
            raise HTTPException(409, "Speech request key belongs to different content or version.")
        if row.status == "READY":
            return speech_view(row)
    consent = speech_consents(session, case, body, text)
    literals = speech_literals(session, case, body)
    with request.app.state.analysis_guard.claim(id):
        now = datetime.now(UTC)
        if row is None:
            row = CaseSpeech(
                speech_id=str(uuid4()),
                complaint_id=id,
                citizen_id=user.user_id,
                case_version=case.version,
                voice_turn_id=turn_id,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                kind=body["kind"],
                status="FAILED",
                text_ur=text,
                consent_snapshot=consent,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        row.consent_snapshot = consent
        token = claim(row)
        identity, actor_id, key_id, version = (
            row.speech_id,
            user.user_id,
            getattr(request.state, "api_key_id", None),
            case.version,
        )
        record_event(
            session,
            "voice.speech_started",
            actor_id,
            "Citizen permitted saved text to be synthesized",
            complaint_id=id,
            details={"speech_id": identity, "input_version": version},
        )
        save(session)
        try:
            with Session(request.app.state.engine) as fresh:
                saved = checked_speech(
                    fresh, actor_id, id, identity, token, key_id, version, body, text
                )
                spoken = saved.text_ur
            if needs_translation(spoken, literals):
                prepared = prepare_translation(text, literals)
                translator = request.app.state.speech_translation_provider_factory()
                try:
                    spoken = prepared.restore(translator.translate_urdu(prepared.masked))
                finally:
                    translator.close()
                with Session(request.app.state.engine) as fresh:
                    saved = checked_speech(
                        fresh, actor_id, id, identity, token, key_id, version, body, text
                    )
                    saved.text_ur = spoken
                    record_event(
                        fresh,
                        "voice.speech_translated",
                        actor_id,
                        "Saved speech text was prepared in Urdu with protected facts",
                        complaint_id=id,
                        details={"speech_id": identity, "input_version": version},
                    )
                    save(fresh)
            with Session(request.app.state.engine) as fresh:
                checked_speech(fresh, actor_id, id, identity, token, key_id, version, body, text)
            audio = valid_mp3(request.app.state.voice_speaker_factory().synthesize(spoken))
            with Session(request.app.state.engine) as fresh:
                saved = checked_speech(
                    fresh, actor_id, id, identity, token, key_id, version, body, text
                )
                saved.audio_data, saved.audio_sha256, saved.status = (
                    audio,
                    hashlib.sha256(audio).hexdigest(),
                    "READY",
                )
                saved.updated_at = datetime.now(UTC)
                saved.lease_token = saved.lease_until = None
                record_event(
                    fresh,
                    "voice.speech_ready",
                    actor_id,
                    "Private version-bound speech was saved",
                    complaint_id=id,
                    details={"speech_id": identity, "input_version": version},
                )
                result = speech_view(saved)
                save(fresh)
                return result
        except Exception as exc:
            fail(request.app.state.engine, CaseSpeech, identity, token, exc)
            public_error(exc)


@router.get("/{id}/speech/{speech_id}/audio", operation_id="getCaseSpeechAudio")
def audio(id: str, speech_id: UUID, user: CurrentUser, session: SessionDep):
    case = own_case(session, user, id)
    row = session.get(CaseSpeech, str(speech_id))
    if row is None or row.complaint_id != id or row.citizen_id != user.user_id:
        raise HTTPException(404, "Speech does not exist in this own case.")
    if row.case_version != case.version:
        raise HTTPException(409, "This audio belongs to an older case revision.")
    if row.kind == "voice_summary":
        turn = owned_turn(session, case, row.voice_turn_id)
        if turn.status != "READY":
            raise HTTPException(409, "This unconfirmed voice summary is no longer current.")
    if (
        row.status != "READY"
        or not row.audio_data
        or not row.audio_sha256
        or not hmac.compare_digest(hashlib.sha256(row.audio_data).hexdigest(), row.audio_sha256)
    ):
        raise HTTPException(503, "Cached speech is unavailable or failed integrity validation.")
    result = Response(
        bytes(row.audio_data),
        media_type="audio/mpeg",
        headers={
            "X-Complaint-Version": str(row.case_version),
            "Content-Disposition": f'inline; filename="{row.speech_id}.mp3"',
        },
    )
    record_event(
        session,
        "voice.speech_read",
        user.user_id,
        "Owner read a received speech copy",
        complaint_id=id,
        details={"speech_id": row.speech_id},
    )
    save(session)
    return result
