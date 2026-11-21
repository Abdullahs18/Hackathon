"""Owner-bound voice work with explicit provider consent and short fenced SQL leases."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.audit import record_event
from app.case_policy import EDITABLE, own_case, timestamp
from app.key_policy import aware, recheck_key
from app.models import Consent, User, VoiceTurn
from app.validation import validate_schema
from app.voice.config import VoiceError
from app.voice.schemas import validate_extraction

LEASE_SECONDS = 300


def current_owner(session, actor_id, case_id, key_id, operation):
    user = session.get(User, actor_id, populate_existing=True)
    if user is None or not user.active or user.role != "Citizen":
        raise HTTPException(403, "Current owning Citizen access is required.")
    recheck_key(session, key_id, user, operation)
    return own_case(session, user, case_id)


def service_consent(session, case, speech=False):
    recipient, purpose, scopes = (
        ("service:gtts", "speech_synthesis", {"spoken_text"})
        if speech
        else ("service:gemini-voice", "voice_processing", {"voice_audio", "voice_transcript"})
    )
    row = session.scalar(
        select(Consent)
        .where(
            Consent.complaint_id == case.complaint_id,
            Consent.citizen_id == case.citizen_id,
            Consent.recipient == recipient,
            Consent.purpose == purpose,
            Consent.status == "granted",
        )
        .execution_options(populate_existing=True)
    )
    if row is None or not scopes <= set(row.data_scopes):
        raise HTTPException(403, "Current scoped consent for this voice provider is required.")
    return {
        "consent_id": row.consent_id,
        "scopes": sorted(row.data_scopes),
        "granted_at": timestamp(row.granted_at),
        "changed_at": timestamp(row.changed_at) if row.changed_at else None,
    }


def editable(case):
    if case.current_status not in EDITABLE:
        raise HTTPException(409, "Voice input can only update an editable, unfiled complaint.")


def save(session):
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Voice request key conflicts with an existing request.") from None
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Voice save is uncertain. Recover saved progress before retrying."
        ) from None


def turn_view(row):
    result = {
        "voice_turn_id": row.voice_turn_id,
        "complaint_id": row.complaint_id,
        "input_version": row.input_version,
        "status": row.status,
        "next_step": row.next_step,
        "transcript": row.transcript,
        "confirmed_transcript": row.confirmed_transcript,
        "extraction": deepcopy(row.extraction),
        "model": row.model,
        "error_code": row.error_code,
        "applied_version": row.applied_version,
        "requires_citizen_review": True,
        "submitted": False,
        "created_at": timestamp(row.created_at),
        "updated_at": timestamp(row.updated_at),
    }
    validate_schema("VoiceInput", result)
    return result


def owned_turn(session, case, turn_id):
    row = session.get(VoiceTurn, str(turn_id), populate_existing=True)
    if row is None or row.complaint_id != case.complaint_id or row.citizen_id != case.citizen_id:
        raise HTTPException(404, "Voice proposal does not exist in this own case.")
    return row


def claim(row):
    now = datetime.now(UTC)
    if row.lease_token and row.lease_until and aware(row.lease_until) > now:
        raise HTTPException(
            429,
            "Voice processing is already active. Recover progress before retrying.",
            {"Retry-After": "15"},
        )
    row.status, row.error_code = "PROCESSING", None
    row.lease_token = str(uuid4())
    row.lease_until = now + timedelta(seconds=LEASE_SECONDS)
    row.updated_at = now
    return row.lease_token


def require_urdu(text):
    if (
        not isinstance(text, str)
        or not text.strip()
        or len(text) > 2000
        or not any("\u0600" <= char <= "\u06ff" and char.isalpha() for char in text)
    ):
        raise VoiceError("invalid_model_output", "A bounded Urdu spoken response is required.")
    return text.strip()


def fail(engine, model, identity, token, exc):
    # Do not overwrite a newer worker's result after an expired lease has been reclaimed.
    try:
        with Session(engine) as session, session.begin():
            known = session.get(model, identity)
            if known is None:
                return
            from app.case_policy import locked_case

            case = locked_case(session, known.complaint_id)
            row = session.get(model, identity, populate_existing=True)
            if row.lease_token != token:
                return
            row.status = (
                "STALE"
                if isinstance(exc, HTTPException) and exc.status_code in {409, 412}
                else "FAILED"
            )
            row.error_code = "case_changed" if row.status == "STALE" else "processing_unavailable"
            if isinstance(exc, VoiceError) and exc.code in {
                "invalid_model_output",
                "provider_quota",
                "provider_timeout",
                "provider_auth",
                "provider_request",
                "provider_unavailable",
                "tts_unavailable",
            }:
                row.error_code = exc.code
            elif isinstance(exc, HTTPException) and exc.status_code in {401, 403}:
                row.error_code = "access_changed"
            row.lease_token = None
            row.lease_until = None
            row.updated_at = datetime.now(UTC)
            record_event(
                session,
                "voice.processing_failed",
                row.citizen_id,
                "Voice work stopped; saved progress preserved",
                complaint_id=case.complaint_id,
                details={
                    "input_version": getattr(
                        row, "input_version", getattr(row, "case_version", None)
                    )
                },
            )
    except SQLAlchemyError:
        pass  # Lease expiry allows recovery after a temporary DB outage.


def public_error(exc):
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, VoiceError) and exc.code == "provider_quota":
        raise HTTPException(
            429,
            "Voice provider quota is unavailable. Retry saved work later.",
            {"Retry-After": "30"},
        ) from None
    if isinstance(exc, VoiceError) and exc.code == "invalid_model_output":
        raise HTTPException(
            502, "Voice provider output failed validation; saved facts were preserved."
        ) from None
    raise HTTPException(
        503, "Voice processing is unavailable. Recover saved progress before retrying."
    ) from None


def checked_turn(session, actor_id, case_id, turn_id, token, key_id, operation):
    case = current_owner(session, actor_id, case_id, key_id, operation)
    row = owned_turn(session, case, turn_id)
    if row.lease_token != token or row.status != "PROCESSING":
        raise HTTPException(409, "This voice processing lease is no longer current.")
    if case.version != row.input_version:
        raise HTTPException(409, "Complaint changed during voice processing.")
    editable(case)
    if service_consent(session, case) != row.consent_snapshot:
        raise HTTPException(
            403, "Voice processing consent changed; new processing permission is required."
        )
    return row


def process_turn(app, actor_id, case_id, turn_id, token, audio, key_id, operation):
    engine = app.state.engine
    provider = None
    try:
        provider = app.state.voice_provider_factory()
        model_name = provider.model
        if not isinstance(model_name, str) or not model_name.strip() or len(model_name) > 200:
            raise VoiceError("invalid_model_output", "Provider model metadata was invalid.")
        with Session(engine) as session:
            row = checked_turn(session, actor_id, case_id, turn_id, token, key_id, operation)
            transcript, step = row.transcript, row.next_step
        if step == "transcribe":
            if audio is None:
                raise HTTPException(
                    409, "Transcription has not been saved; upload the original recording again."
                )
            transcript = provider.transcribe(audio)
            if not isinstance(transcript, str) or not transcript.strip() or len(transcript) > 12000:
                raise VoiceError("invalid_model_output", "Transcript was empty or oversized.")
            transcript = transcript.strip()
            with Session(engine) as session:
                row = checked_turn(session, actor_id, case_id, turn_id, token, key_id, operation)
                row.transcript, row.next_step, row.model = transcript, "extract", model_name
                row.updated_at = datetime.now(UTC)
                row.lease_until = row.updated_at + timedelta(seconds=LEASE_SECONDS)
                record_event(
                    session,
                    "voice.transcribed",
                    actor_id,
                    "Voice transcript checkpoint saved",
                    complaint_id=case_id,
                    details={"input_version": row.input_version},
                )
                save(session)
        # Recheck current authority immediately before the next external disclosure.
        with Session(engine) as session:
            checked_turn(session, actor_id, case_id, turn_id, token, key_id, operation)
        proposal = provider.extract(transcript)
        proposal = validate_extraction(
            proposal.model_dump() if hasattr(proposal, "model_dump") else proposal
        )
        require_urdu(proposal.spoken_summary_ur)
        with Session(engine) as session:
            row = checked_turn(session, actor_id, case_id, turn_id, token, key_id, operation)
            row.extraction, row.model, row.status, row.next_step = (
                proposal.model_dump(),
                model_name,
                "READY",
                "done",
            )
            row.updated_at = datetime.now(UTC)
            row.lease_token = row.lease_until = None
            record_event(
                session,
                "voice.extracted",
                actor_id,
                "Unconfirmed voice proposal saved",
                complaint_id=case_id,
                details={"input_version": row.input_version},
            )
            result = turn_view(row)
            save(session)
            return result
    except Exception as exc:
        fail(engine, VoiceTurn, turn_id, token, exc)
        public_error(exc)
    finally:
        if provider is not None:
            try:
                provider.close()
            except Exception:
                pass
