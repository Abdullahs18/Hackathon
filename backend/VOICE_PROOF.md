# Gemini + gTTS: first live Urdu proof

This increment adds replaceable Gemini transcription/extraction and gTTS speech adapters, plus
an explicit local CLI. It proves provider compatibility before case integration. The API still
has six implemented operations. No voice REST endpoint or complaint submission is added here.

The shared `VoiceExtraction` schema references canonical `IncidentInformation`. Gemini is given
a JSON Schema derived from these definitions; outputs are validated locally with JSON Schema
and Pydantic. Unknown facts remain missing/null. AI cannot attach evidence IDs, assert citizen
corrections, authorize a complaint or file anything through this command.

Live speech accuracy and Urdu playback are **not verified** by automated tests. They require
your key, recording and listening check below. A successful API response alone is insufficient.

## 1. Update your local clone

In Windows PowerShell, from the repository root (your `hackathon` folder):

```powershell
git fetch origin
git switch be
git pull --ff-only origin be
notepad .env
```

Keep your existing database password, demo password and JWT secret. Do not copy `.env.example`
over an existing `.env`. Add these two lines locally:

```env
GEMINI_API_KEY=YOUR_ACTUAL_KEY_HERE
DASTAK_GEMINI_MODEL=
```

Never commit or share the actual key. No change to Google billing is required by these steps;
choose a model supported by your own free-tier project and available quota.

Rebuild and apply environment changes:

```powershell
docker compose up --build -d
docker compose run --rm --no-deps api python -m app.voice_proof --list-models
```

The list shows models advertised for `generateContent`; it does not guarantee free-tier quota,
audio support or structured-output support for every listed model. Pick a general-purpose Gemini
Flash/Flash-Lite model with audio input and structured output support that AI Studio shows as
available to your project. Avoid TTS-only, embedding, image-generation-only and Live-only models.
If unsure, share just the model names so we can choose; model names are not secrets.

Set `DASTAK_GEMINI_MODEL` to the exact selected name (without `models/`) in `.env` and save it.
There is intentionally no hardcoded model default or automatic fallback to a potentially paid
model. One-off `docker compose run` commands read the updated `.env` on each invocation.

## 2. Prepare a recording

```powershell
New-Item -ItemType Directory -Force voice-samples | Out-Null
```

Put a **15–30 second** Urdu recording of a made-up incident in `voice-samples`. Use WAV, MP3,
M4A or Ogg; content is parsed rather than trusting the extension. The maximum is 5 MiB and
60 seconds. WebM is not supported by this initial CLI; use your recorder's M4A or WAV output.
Keep your actual extension, for example `scam.m4a`.

Suggested synthetic script (do not supply real names, accounts or transaction details):

> مجھے ایک جعلی امدادی پیغام ملا۔ میں نے پندرہ سو روپے بھیجے۔ میری ٹرانزیکشن کا حوالہ
> ڈی ای ایم او ون ٹو تھری ہے۔ مجھے واقعے کی تاریخ یاد نہیں۔

Expected facts: reported fake assistance message, 1500 rupees, money reportedly lost, spoken
reference DEMO123 (check how the letters/digits are transcribed), and unknown incident date.
Transcription may vary; manually check the amount/reference and correct errors before later
using any extracted data. This is not a verification of whether fraud occurred.

## 3. Run the live pipeline

For an M4A file named `scam.m4a`:

```powershell
docker compose run --rm --no-deps -v "${PWD}/voice-samples:/samples" api python -m app.voice_proof --audio /samples/scam.m4a --output-dir /samples/run1 --allow-external-processing
```

Change the filename if your recording is WAV/MP3/Ogg. The explicit flag permits this proof command
to send your selected synthetic audio/text to Gemini and summary text to Google Translate's gTTS
service. It does not grant or replace complaint-sharing consent in the application.

Successful output appears on your Windows machine:

- `voice-samples/run1/transcript.txt`: transcription saved before extraction.
- `voice-samples/run1/result.json`: validated extraction and Urdu summary, marked unsubmitted and
  requiring citizen review. Saved before attempting speech generation.
- `voice-samples/run1/summary.mp3`: gTTS Urdu playback.

Open the files:

```powershell
notepad voice-samples\run1\transcript.txt
notepad voice-samples\run1\result.json
Start-Process voice-samples\run1\summary.mp3
```

The samples/output folders are ignored by Git and the Docker build context. Keep each fresh full
run in a new output directory (`run2`, `run3`); previous results are never overwritten by the CLI.

## 4. Acceptance checks to report

| Check | Pass condition |
| --- | --- |
| Actual provider connection | Your selected model accepts the real recording; no mocked responses are used. |
| Urdu transcript | Accurately represents what you said; unclear words are flagged rather than guessed. |
| Critical facts | Amount and reference match your recording; no invented date, identity, evidence or authorization. |
| Structured output | `result.json` is produced after schema/Pydantic validation. Unknown date stays missing/null. |
| Spoken summary | MP3 plays, is understandable Urdu, and faithfully summarizes the supplied facts. |
| Citizen control | Result says `requires_citizen_review: true` and `submitted: false`; no case is created. |

Send the model name, whether the transcript/facts match, and whether playback is understandable.
You may share the synthetic result or safe error code. Keep key values and `.env` private.
The complete plan requires this voice flow to advance a persisted complaint later; this isolated
proof is only the initial provider milestone, not completion of the AI workflow.

## 5. Recovery without repeating unnecessary Gemini calls

If `result.json` exists but gTTS failed, retry speech only:

```powershell
docker compose run --rm --no-deps -v "${PWD}/voice-samples:/samples" api python -m app.voice_proof --speak-only --output-dir /samples/run1 --allow-external-processing
```

If transcription succeeded but extraction failed, reuse the saved transcript in a new directory:

```powershell
docker compose run --rm --no-deps -v "${PWD}/voice-samples:/samples" api python -m app.voice_proof --transcript /samples/run1/transcript.txt --output-dir /samples/run2 --allow-external-processing
```

| Error code | Action |
| --- | --- |
| `missing_key` | Save GEMINI_API_KEY in root `.env` and rerun. No need to send it here. |
| `missing_model` | Set DASTAK_GEMINI_MODEL after listing and checking available models. |
| `provider_auth` | Check the key/project permissions locally in AI Studio. |
| `provider_quota` | Check free-tier quota and wait. There are no automatic retries or model fallbacks. |
| `provider_request` | Check exact model ID, its supported features and audio format. |
| `provider_timeout` / `provider_unavailable` | Retry after connectivity/service recovers, using saved text where available. |
| `invalid_audio` | Use valid supported audio within the size/duration limits. |
| `invalid_model_output` | Do not accept the output. Review the transcript and report the safe error code. |
| `tts_unavailable` | Check connectivity to gTTS; use speech-only retry once text exists. |
| `output_exists` | Open existing results or choose a new run directory; do not overwrite your recording. |

Each Gemini stage makes one request, with automatic SDK retries/continuation disabled, bounded
request timeout, and no function tools. gTTS uses bounded connection/read timeouts per HTTP request;
longer summaries can require several requests. Ordinary CLI output contains progress/safe error
messages rather than credentials, transcripts or raw provider exception details.

For a non-Docker environment, install the updated pinned requirements, set the same variables
in `backend/.env`, and run `python -m app.voice_proof --help` from `backend/`.

## Engineering verification

Automated tests use fake provider responses and no keys/network. They exercise audio parsing,
schema rejection, nonfinite values, unsafe evidence/confirmation fields, blocked/truncated AI
outputs, quota/error sanitization, explicit external-processing authorization, persisted proof
checkpoints and retry paths. Existing auth/database/contract tests remain required.

Sources used for the provider adapters:

- https://github.com/googleapis/python-genai/blob/main/README.md
- https://ai.google.dev/gemini-api/docs/audio
- https://ai.google.dev/gemini-api/docs/structured-output
- https://gtts.readthedocs.io/en/latest/module.html
