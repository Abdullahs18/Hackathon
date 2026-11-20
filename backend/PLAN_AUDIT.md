# Backend audit against plan.md

Reviewed backend commit `065286c3649c9af23072e6dec0cc38770f5bdb01` on branch `be`.
This is a foundation-stage review, not acceptance of the complete MVP.

## Verified evidence

- All 38 remote files matched the local files byte for byte before this documentation update.
- A fresh local run passed all 41 tests; Ruff lint and formatting also passed.
- GitHub Actions run `44795091023` completed successfully for this exact commit, including the
  test suite on SQLite and PostgreSQL 16, Compose validation, and Docker image build.
- The successful CI run is existing evidence; the PostgreSQL/container checks were not rerun
  locally during this review because this execution environment has neither Docker nor PostgreSQL.
- The canonical contract contains 37 operations; 6 operations are implemented (health x2,
  auth x2, Admin users x2). Swagger deliberately exposes only implemented operations.
- Three domain tables are migrated: users, workspaces and audit_logs. The remaining domain
  tables in plan.md section 11 do not exist yet. Alembic's version table is migration metadata.
- `main` remains at `43e0620a8ebe6b2687fd5dffcc87853b07cb0236`.

CI: https://github.com/mugheeskhan5/we-in/actions/runs/44795091023

## Definition-of-done assessment (plan.md section 21)

| Requirement | Current evidence / remaining work | Status |
| --- | --- | --- |
| Four roles with backend permissions | All four can authenticate; Admin user-management restrictions are tested. Case permissions are absent. | Partial |
| Citizen creates and tracks fraud complaints | No complaint tables or endpoints yet. | Pending |
| Urdu voice input and spoken responses | No provider integration or real audio proof. | Pending |
| AI classification and follow-up questions | Shared classification schema exists; execution does not. | Pending |
| Complaint validation through shared schemas | Canonical schemas exist; complaint request handling is absent. | Partial |
| Admin edits routing without redeployment | No rule models, engine or endpoints. | Pending |
| Existing cases retain routing versions | No immutable rule versions or case linkage yet. | Pending |
| Citizen reviews and corrects complaint | No complaint/draft review flow yet. | Pending |
| View, change and withdraw consent | Schemas/contracts only. No consent enforcement yet. | Pending |
| Explicit final citizen authorization | Contract only; no submission flow exists. | Pending |
| LangGraph tools and recorded actions | No LangGraph graph, persisted state or tools. | Pending |
| Reference number and duplicate-safe submission | Contract specifies idempotency; no implementation yet. | Pending |
| Helper/officer raw API permissions | Admin boundary tests exist; case-level helper/officer tests await implementation. | Pending |
| Officer information/accept/reject/escalate/close | No case assignment, transitions or officer endpoints. | Pending |
| Complete audit and explainability | DB protects audit rows; auth/user creation emit events. Case/AI/tool/consent traces and inspection are absent. | Partial |
| Two isolated seeded workspaces | Two are seeded; there are no case queries to demonstrate tenant isolation yet. | Partial |
| In-app notifications | Contracts only. | Pending |
| API keys and Swagger | Implemented Swagger uses canonical shapes; API keys are deliberately unsupported and fail closed. | Partial |
| Drafts survive connection interruption | No draft persistence or retry flow yet. | Pending |
| Contract checks against mock and real backends | Current implemented responses pass in-process real-app checks. No pinned mock server or network-level frontend checkpoint yet. | Partial |
| Migrations, logs and basic tests | Foundation migration, safe request logging and test suite exist. Feature-specific migrations/tests remain incremental work. | Foundation complete |
| Synthetic data and simulated integrations only | Current fixtures are synthetic; no live government integration exists. | Currently satisfied |

Counts above measure implemented surface, not percentage completion or equal feature effort.

## Process gaps and immediate priorities

1. **Live voice proof is overdue relative to plan sections 5.1 and 17.** The foundation passed,
   but that does not satisfy the plan's first-two-hours STT/TTS proof. Test the chosen providers
   with real spoken Urdu and synthetic incident content before investing further in AI flow.
2. **Frontend integration checkpoint is unperformed.** The frontend owner needs to call real
   auth/login and auth/me. CI does not substitute for the hour-8 team checkpoint.
3. **Mock-server tooling is unselected/unpinned.** Choose the shared tool and pin its version;
   verify representative mock responses against the canonical contract.
4. **Contract gaps need decisions before related code.** Voice input/output, protected evidence
   retrieval, helper grant/revocation management, officer assignment, and citizen history/progress
   need explicit contracts as applicable. Do not implement hidden frontend-facing endpoints.
5. **Case authorization is unfinished.** Seeded workspace IDs alone do not prove multi-tenancy.
   Add complaint ownership, active helper grants/current consent, officer assignment/workspace
   queries and their negative raw API tests together.
6. **Contract agreement is a team action.** The files were committed before application code,
   but this repository does not prove frontend/testing-owner review. Review the added health
   endpoints and password limits with affected owners; keep future contract/code/tests together.

## Confirmed provider/runtime choices

- Gemini Developer API, **free tier**, for structured AI processing and audio transcription.
- **gTTS** for Urdu spoken responses.
- **Windows with Docker Desktop/Compose** for the user's local runtime.
- Model IDs will remain configurable. Pick from models actually available to this project,
  then pin/test the chosen integration; free-tier access and quotas must not be assumed universal.
- No Gemini or gTTS integration is implemented by this documentation commit. A chosen provider
  is not a passed live test. A Gemini key is not required for the current foundation tests.
- Keep the key local/server-side. Do not paste it into chat, put it in frontend code, or commit it.
  `GEMINI_API_KEY` is the planned provider variable; Compose/settings wiring is still pending.

Official references:

- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/audio
- https://ai.google.dev/gemini-api/docs/pricing

## User actions now: Windows/Docker smoke test

1. Start Docker Desktop and wait for its engine to be running.
2. From your local clone, fetch and switch to `be`. If already on `be`, pull only with
   `git pull --ff-only origin be`. Preserve/commit any unrelated local changes before switching.
3. Copy root `.env.example` to root `.env` **only if `.env` does not already exist**. Set a
   random JWT secret, a URL-safe database password and a synthetic demo password of at least
   12 characters. These values stay local. For a JWT secret, if Python is installed:
   `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   Otherwise use:
   `docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_urlsafe(48))"`.
4. From repository root run:

   ```powershell
   docker compose up --build -d
   docker compose run --rm api python -m app.seed
   docker compose ps -a
   ```

   Expected: database/API running and healthy; migration service exited with code 0.
5. Open `http://localhost:8000/api/v1/health/ready`.
   Expected: HTTP 200 with `{"status":"ok","simulated":true}`.
6. Open `http://localhost:8000/docs`. In `POST /api/v1/auth/login`, use `demo-admin` and your
   local demo password. Copy the returned access_token into Swagger's Bearer authorization.
   `GET /api/v1/auth/me` should return Admin, and `GET /api/v1/admin/users` should list six
   accounts on a freshly seeded database, without passwords/hashes.
7. Replace the authorization token with one obtained for `demo-citizen-1`. auth/me should
   return Citizen; Admin user listing must return 403. Incorrect login credentials should return
   401; invalid login payloads should return 400, with no password echoed.
8. Run `docker compose restart api` and log in again. Existing accounts should remain.
   Rerun the seed command and confirm no duplicate accounts. Existing passwords are preserved.

Report which step failed and its response/status if anything differs. Useful diagnostics:

```powershell
docker compose ps -a
docker compose logs --tail 100 migrate api
```

Review diagnostic output before sharing it and omit local secrets. No need to repeat the entire
automated suite manually; this smoke test checks your actual Docker machine and browser/API path.
Do not use a volume-removal command to troubleshoot a database whose data you want to preserve.

## Provider and team checks before the AI increment

- Create a Gemini API key in Google AI Studio if you have not already. Tell us that it is ready,
  not the key value. Model names/available free-tier quota are useful non-secret information.
- Prepare a 15–30 second Urdu recording describing a made-up scam and its expected transcript.
  Include an amount and transaction reference, then check those values are transcribed faithfully.
- After the provider integration exists: test Urdu audio to transcript, extraction to validated
  fields, gTTS playback for clarity, missing-information questions, and timeout/quota failures.
  A canned/mocked model response does not count as the live voice proof.
- Frontend owner: switch to the real backend for login/auth-me, verify role/workspace values,
  CORS/loading/error handling, then record the first team integration checkpoint.
- Backend will add synthetic case fixtures and automated negative permission, consent, routing,
  idempotency, agent and weak-connection tests as those features are implemented.
