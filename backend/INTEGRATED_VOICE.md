# Urdu voice in saved complaints

Frontend wiring is now implemented on `integration/fe-be`; see [the combined app guide](../INTEGRATION.md).
The original backend increment and provider-level checks are described below.

On the integration branch, mixed-language saved reviews are prepared in Urdu before gTTS.
The audio checkbox explicitly permits Gemini translation (only when needed) and gTTS synthesis.
Existing Urdu framing, numeric values, dates and transaction references are masked before
translation and restored exactly; missing, duplicated or reordered placeholders, new digits
and untranslated English prose reject the output before speech synthesis. Reference identifiers
may retain their original Latin spelling. This does not edit the formal complaint or authorize filing.
The panel shows only server-prepared speech text, never a local mixed-language approximation.
Translation is checkpointed so a speech-provider retry can reuse it; changed case versions or
provider grants invalidate in-flight work. A mixed-language source adds one Gemini call.
No database migration is needed. Listen to a synthetic English-description case to check live
Urdu translation and pronunciation; synthetic-provider tests verify preservation, not language quality.

Migration 0009 adds private voice turns and version-bound MP3 responses. The backend accepts
recordings, saves transcription progress, proposes structured incident facts, accepts an explicit
citizen correction, and speaks current follow-up questions or the saved complaint review.
Gemini handles transcription/extraction; gTTS handles Urdu speech. Existing analysis, routing,
final authorization and simulated submission remain the filing workflow.

## Update and live check

From your repository root in Windows PowerShell, with Docker Desktop running:

```powershell
git switch be
git pull --ff-only origin be
docker compose up --build -d
docker compose exec api python -m app.voice_demo --allow-external-processing
```

Keep your existing `.env`, Gemini key/model and demo password. The command logs in as
`demo-citizen-1` using `DASTAK_DEMO_PASSWORD`; it must match that seeded account's existing password.
For a fresh database only, seed first with `docker compose run --rm api python -m app.seed`.

This opt-in command creates one synthetic draft, grants the two provider consents below,
generates fixed Urdu input, transcribes/extracts it, confirms its known synthetic ground truth,
analyzes the saved case and downloads its spoken review. It sends synthetic audio/text to the
providers: normally three Gemini calls and two gTTS calls, subject to your provider quota.
It stops before final filing authorization and submission. It never copies arbitrary AI output
into confirmed facts. Its JSON reports `submitted: false`, `review_ready`,
`proposal_amount_matches`, `unknown_date_preserved`, case/turn IDs and `review_audio_file`.

Expected: the three check flags are true and status is `CITIZEN_REVIEW`. A model/provider error,
quota failure or changed routing policy can prevent that result; inspect the printed case ID
and saved progress rather than repeatedly creating drafts. No hidden provider retry is performed.
The fake-provider regression suite does not prove live Urdu accuracy or playback quality.

The helper prints fixed stage names before each API/provider step. If it fails at
`generate_synthetic_urdu_input`, gTTS could not produce the test input and Gemini has not been
called. Check that service directly from the existing API container:

```powershell
docker compose exec api python -c "from app.voice.providers import GTTSSpeaker; audio=GTTSSpeaker().synthesize('Synthetic voice connectivity check'); print('gTTS OK:', len(audio), 'bytes')"
```

A successful result prints `gTTS OK` with a positive byte count. A safe `VoiceError` identifies
a speech-provider failure. This probe uses fixed synthetic text and no Gemini key. An API
connection/timeout error names the API stage instead; inspect the printed case's saved voice
history before rerunning work that may already have completed. The older generic message
`Voice provider or local API connection failed` cannot distinguish these two causes.

To listen, use the exact `/tmp/...mp3` path printed by the container:

```powershell
New-Item -ItemType Directory -Force voice-output | Out-Null
docker compose cp api:/tmp/REPLACE_WITH_PRINTED_FILENAME.mp3 ./voice-output/review.mp3
Start-Process ./voice-output/review.mp3
```

Listen for the fixed 1500 PKR amount, an unknown date/reference and a clear simulated,
unfiled review. `voice-output/` is gitignored. This creates another synthetic case on each run.

## Contract and permissions

All paths below start with `/api/v1/complaints/{id}`. All seven operations require the active
owning Citizen; Helpers, Officers and Admins cannot access this private voice history/audio.
JWT or a currently valid scoped API key works. Writes require `complaints:write`; reads require
`complaints:read`. Current ownership, account state and key validity still apply.

| Method | Suffix | Purpose |
| --- | --- | --- |
| POST | `/voice-inputs` | Receive a recording and persist a reviewed-later proposal |
| GET | `/voice-inputs` | Paginated owner history; `limit`, `before`, `X-Next-Cursor` |
| GET | `/voice-inputs/{turn_id}` | Recover transcript, proposal, checkpoint and safe error code |
| POST | `/voice-inputs/{turn_id}/retry` | Retry extraction from a saved transcript without reupload |
| POST | `/voice-inputs/{turn_id}/confirm` | Explicitly apply only the citizen-reviewed incident patch |
| POST | `/speech` | Generate speech from a current saved source |
| GET | `/speech/{speech_id}/audio` | Retrieve protected MP3 for the current case version |

Create scoped grants through the existing `POST /consents` on this complaint:

```json
{"recipient":"service:gemini-voice","purpose":"voice_processing","data_scopes":["voice_audio","voice_transcript"]}
```

```json
{"recipient":"service:gtts","purpose":"speech_synthesis","data_scopes":["spoken_text"]}
```

Mixed-language speech additionally requires:

```json
{"recipient":"service:gemini-speech","purpose":"speech_translation","data_scopes":["spoken_text"]}
```

Already-Urdu speech needs only gTTS consent. These grants stay independent of Gemini recording
consent and of the complaint's required-sharing bundle.

Every new provider operation also requires `allow_external_processing: true`. Voice permission
does not grant text assessment, helper access, authority access or final filing authorization.
Withdrawal blocks subsequent provider disclosures; results arriving after a consent change,
account/key revocation or case edit are discarded. Owner reads of already received history/current
audio can continue without granting another provider disclosure. Audit projections contain
identifiers and fixed messages, excluding private transcript/text/audio.

## Recorder, corrections and recovery

Create a draft first. POST multipart with exactly one `file` and one
`allow_external_processing` field containing the string `true`. Include `If-Match: "1"`
(the actual current positive case version in quotes) and a unique `Idempotency-Key` of at most
128 characters. WAV, MP3, M4A, Ogg and browser WebM are detected from content, bounded to 5 MiB
and 60 seconds. Bundled FFmpeg converts bounded WebM locally into mono WAV; no system FFmpeg
installation is needed. Raw recordings are transient and are not saved as evidence or in SQL.
Transcripts, proposals and corrected transcripts are private SQL records.

The initial response is a proposal with `requires_citizen_review: true` and `submitted: false`.
The case is unchanged until confirmation. Show the transcript, extracted facts and uncertainties.
Optionally speak its summary using `kind: voice_summary` and `voice_turn_id` below. Unknown
dates/references remain null. The model cannot add evidence IDs or citizen-confirmed corrections.

After the citizen reviews/corrects it, POST `/voice-inputs/{turn_id}/confirm` with `If-Match`
matching the proposal's `input_version`:

```json
{
  "citizen_confirmed": true,
  "incident_patch": {"money_lost":true,"amount":1500,"currency":"PKR"},
  "transcript_correction": "Optional citizen-corrected transcript",
  "correction_note": "Optional citizen-written correction"
}
```

Only include fields the citizen has reviewed and wants to change. Do not copy unknown/null
proposal fields over previously saved facts by default. A transcript correction preserves the
original transcript; it does not rerun extraction or implicitly authorize filing. Evidence and
citizen correction history cannot be supplied through `incident_patch`.

Confirmation returns the saved case; edits invalidate its prior analysis/draft and require
the existing `/analyze` call with explicit external-processing permission. Current Urdu
follow-ups can be spoken, answered by another recording, and explicitly patched. Once ready,
review the saved formal draft, generate its spoken review, then use the existing separate
citizen authorization and submission steps in SUBMISSION.md.

If a request times out, list/get the saved turn before retrying. Transcription is committed
before extraction. A turn with a transcript and `next_step: extract` can POST `/retry` with
current `If-Match` and `{"allow_external_processing":true}`; it needs no recording or new key.
Without a saved transcript, retry the original upload bytes and key, or make a new recording.
Repeated identical upload/confirmation commands return the saved result; conflicting key/body
reuse is 409. Active work returns 429 with `Retry-After`; an abandoned lease can be reclaimed
after 300 seconds. Changed source versions are rejected and require a fresh proposal. SQL leases
and checkpoints survive process restart; they do not promise exactly-once external provider billing
if a process dies after the provider responds but before its result is committed.

## Spoken sources and frontend wiring

POST `/speech` as JSON with current `If-Match`, a stable unique `Idempotency-Key` and one source:

```json
{"kind":"voice_summary","voice_turn_id":"CURRENT_TURN_UUID","allow_external_processing":true}
```

```json
{"kind":"follow_up","question_index":0,"allow_external_processing":true}
```

```json
{"kind":"review","allow_external_processing":true}
```

The API accepts saved sources only, with no arbitrary client text. Follow-ups must come from
the current saved analysis. Review requires `CITIZEN_REVIEW` and its formal draft; the Urdu
review is built deterministically from saved facts and labels simulated/unfiled status. Long
details, evidence/contact lists and other screen-only content require the full visual review.
An unconfirmed model summary is identified as such and cannot play after its proposal is applied.

The response gives `audio_path`, `case_version`, `text_ur` and `speech_id`. MP3 bytes are private,
bounded to 2 MiB/300 seconds, hashed and cached in SQL. Fetch `audio_path` with the authenticated
client, check the response, create a Blob URL for `<audio>`, and revoke that Blob URL when done.
A plain `<audio src="/api/...">` cannot attach the Bearer/API-key header. Keep credentials out of
URLs. A changed case version rejects old playback; regenerate against the new review.

The original separate frontend recorded locally and used browser speech recognition. The
`integration/fe-be` branch now uploads actual recorder audio, displays saved proposals, requires
explicit correction and retrieves protected MP3 responses. Automated browser checks use synthetic
providers; combined browser acceptance with the user's actual microphone and providers remains
the live check described in INTEGRATION.md.
