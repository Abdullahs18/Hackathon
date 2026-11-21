# Frontend and backend integration

Work is on `integration/fe-be`, combining backend `9c40577` and frontend `e454876`.
The original `be`, `frontend` and `main` branches remain separate. The latest backend contracts
are retained; `plan.md` remains unchanged. The consent-purpose enum also includes
`speech_translation` for the optional Gemini Urdu preparation step.

## Run the combined application on Windows

Start Docker Desktop, then use PowerShell from your existing repository root:

```powershell
git fetch origin
git switch integration/fe-be
git pull --ff-only origin integration/fe-be
docker compose up --build -d
cd "hackathon frontend"
npm ci
$env:VITE_USE_MOCK = 'false'
$env:VITE_API_BASE_URL = 'http://localhost:8000'
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://localhost:5173**. Keep the existing root `.env`, database, Gemini key/model and demo
password. Provider secrets stay on the backend. Log in with `demo-citizen-1` and your existing
`DASTAK_DEMO_PASSWORD`. Fresh databases also need the existing explicit seed command; existing
data does not need resetting. Use `localhost` in the browser to match the default CORS origin.

The example frontend configuration now selects the real backend. `VITE_*` variables are public
build configuration and must never contain provider keys. The inherited `VITE_USE_MOCK=true`
mode is a legacy visual preview; acceptance checks use `false` and the actual API.

## Continuous citizen story

1. Log in as the Citizen and open Report a Scam. Type a synthetic incident or record/upload
   Urdu audio. Recording is bounded to under 60 seconds; uploads are limited to 5 MiB.
2. Permit sending the recording/transcript to Gemini, then transcribe. The proposed facts
   remain separate from the case. Review the transcript, edit labeled facts, uncheck fields
   you do not want to change, and explicitly apply the selected facts.
3. Attach a small synthetic image or PDF if desired. Evidence is private, limited to 10 MiB,
   and labeled not authenticity-verified. Original downloads use authenticated requests.
4. Permit saved-case Gemini analysis and select Save & Analyze with AI. Answer current missing
   information through text or another reviewed recording. Unknown information can stay unknown.
5. Once ready, open Review, Consent & Authorize. Permit Gemini Urdu preparation when needed
   and gTTS processing with the audio checkbox, then generate the saved
   Urdu review. Play the MP3 and compare it with the saved facts. Changed summary fields block
   authorization until saved and analyzed again; approval is reset after a case revision changes.
6. Review the required-sharing list and select **Allow required sharing** once. This saves separate
   scoped grants for the routed workspace, simulated identity check and reporting requirements.
   Payment lookup is included only when the case has a transaction reference. Optional helpers,
   another workspace and voice providers are not included. Individual grants can be withdrawn
   under **Manage individual permissions and optional services**. A partial failure shows the saved
   grants; retry completes only missing permissions. Filing stays disabled until all required grants
   cover the current complaint data.
7. Explicitly authorize the saved review. The client records approval and then calls the separate
   submission endpoint with a stable command key. Only a backend reference is displayed. If a
   result is uncertain, use Check Prior Submission & Retry Safely; a display reference is never invented.

Local edits are explicitly labeled as local until a server save succeeds. Case writes send the
displayed saved version. A conflict preserves the local edits and requires reconciling the newer
server revision. Refresh can recover saved analysis and voice checkpoints. The original recording
is held only for the current browser view; after refresh, extraction can resume from a saved
transcript, while an unsaved transcription requires reuploading the original audio.

## Helper, Officer and Admin

- Citizen case details expose a Helper grant plus recipient/purpose/scoped sharing. Grant both
  before signing in as `demo-helper`. Withdrawal or grant revocation blocks subsequent reads.
- Admin assignment accepts a submitted complaint ID and an active officer ID in its pinned
  workspace, such as `demo-officer-financial`. It grants no raw case access to Admin.
- The assigned Officer can request information, accept, escalate, reject or close according to
  the current legal outcome. Each command carries a stable key and saved version. Citizen
  clarifications require explicit recipient-sharing permission and append to review history.
- Admin routing edits carry the current immutable version; history comes from the version
  endpoint. Audit/agent screens display safe metadata and fixed explanations, excluding raw facts.
- Admin key issuance is self-issuance with role-appropriate scopes, a fixed expiry/request key
  across retries and one-time secret display. Revocation is reflected through the live API.

## Automated verification and remaining live check

The frontend workflow builds TypeScript/Vite, runs lint and exercises Playwright against a
disposable FastAPI/SQLite server on ports 5174/8011. That server is defined in
`backend/tests/browser_server.py`; it always creates temporary storage and uses synthetic
Gemini/gTTS providers. It never uses the application database or a real provider key. Browser
audio recording and WebM decoding are real; generated test speech is a valid one-second silent MP3.

The browser suite covers the complete recording/proposal/review/filing flow, real MediaRecorder
input, microphone denial, protected MP3 loading, stale revisions, unsaved summary corrections,
receipt-outage recovery and reload, all four roles, Helper withdrawal, Officer conversation,
Admin key issue/revoke, immutable rule edits, private evidence byte preservation, and offline
local-draft recovery. It also checks expired-session draft preservation and lost voice-response
recovery without another upload. The backend suite remains a separate full SQLite/PostgreSQL/Docker check.
Existing React lint warnings are tracked separately from build/test failures.

For browser checks on your own machine, install development requirements in a Python environment
and run from the frontend folder:

```powershell
npx playwright install chromium --only-shell
$env:E2E_PYTHON = (Resolve-Path '..\backend\.venv\Scripts\python.exe').Path
npm run test:e2e
```

CI runs the browser suite on Linux with fresh servers. Windows application sandboxes may prevent
system Edge launches or test-server teardown; the suite uses bundled Chromium, and
`E2E_REUSE_SERVERS=true` can attach to explicitly started disposable test servers when necessary.
It must never be used against application services.

The user already verified Gemini/gTTS API processing and Urdu playback. The remaining acceptance
check is the same story through the browser using the user's microphone and actual providers,
including listening to the review and testing refresh/reconnect. Automated synthetic-provider
results do not establish real Urdu recognition or speech quality. Authentic-data/RAG work remains
the next separate workstream after this combined browser acceptance.
