# Dastak backend

Synthetic hackathon prototype for assisted reporting of suspected online financial fraud.
All identities, payments, workspaces and eventual submissions are simulated. Use no real personal data.

The product specification is [plan.md](plan.md). Shared API contracts live in
[contracts/openapi.yaml](contracts/openapi.yaml) and [contracts/schemas.yaml](contracts/schemas.yaml).
Backend work is committed to **`be`**. Do not commit this work to `main`.

## Current increment

Implemented foundation: FastAPI app factory, PostgreSQL configuration, SQLAlchemy, Alembic migrations,
two synthetic workspaces, six repeatable demo accounts, Argon2 password hashing, JWT login,
current-account lookup, Admin user list/create, process liveness/database readiness, safe error
bodies, process-local login throttling, CORS, request IDs, and append-only audit events for
authentication and user creation. PostgreSQL rejects audit UPDATE, DELETE and TRUNCATE.

Foundation endpoints:

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/health` | Public process liveness |
| GET | `/api/v1/health/ready` | Public DB/current-migration readiness |
| POST | `/api/v1/auth/login` | Public JSON credentials, rate limited |
| GET | `/api/v1/auth/me` | Active JWT account |
| GET | `/api/v1/admin/users` | Admin JWT account |
| POST | `/api/v1/admin/users` | Admin JWT account |

Case drafts, helper grants, scoped consent and officer access are now implemented. Follow
[backend/CASE_ACCESS.md](backend/CASE_ACCESS.md) for the additional 16 operations, migration 0002,
retry/version semantics and local checks. [The iteration review](backend/ITERATION_2_REVIEW.md)
records plan alignment, the confirmed live voice proof, fixes and remaining gaps.

The canonical contract includes future endpoints. They are not implemented stubs and return 404
until built. API keys are not implemented yet; presenting only `X-API-Key` fails authentication.
Swagger currently lists the implemented subset at `/docs`; it is not a completion claim for the
entire contract. Private evidence upload/list/metadata/download are implemented; see
[backend/EVIDENCE.md](backend/EVIDENCE.md) for migration 0003, persistent storage and local checks.
Readiness now also checks private storage writability. Saved-case Gemini text assessment and
owner-only result recovery are implemented; see [backend/CASE_ANALYSIS.md](backend/CASE_ANALYSIS.md)
for explicit provider permission, migration 0004 and local checks. The user confirmed this live
Gemini API assessment works. Versioned routing, immutable history, route-aware readiness and
unconfirmed structured review drafts are implemented in migration 0005; follow
[backend/ROUTING.md](backend/ROUTING.md) for seeding and the Admin rule-change demo.
[The pre-analysis audit](backend/ITERATION_3_REVIEW.md) records a reproduced PDF validation fix
and the verification boundaries. The user confirmed the live routing checks passed.
Explicit citizen approval, scoped simulated services, a fixed LangGraph workflow with durable SQL
progress and idempotent simulated filing/confirmation are implemented in migration 0006. Follow
[backend/SUBMISSION.md](backend/SUBMISSION.md) for the update commands, consent bodies, approval,
submission, retries and withdrawal checks. [The submission review](backend/ITERATION_5_REVIEW.md)
records the persistence and verification boundaries. Officer decisions, legal review outcomes,
citizen clarification replies and persisted in-app notifications are implemented in migration 0007.
Follow [backend/OFFICER_REVIEW.md](backend/OFFICER_REVIEW.md) for assignment, decision/reply headers,
the transition table and withdrawal checks. The full integrated voice flow, API keys and complete
Admin audit browsing remain to be implemented.
See [backend/ROADMAP.md](backend/ROADMAP.md).

The latest foundation review, plan gaps, confirmed provider choices and Windows/Docker manual
checks are recorded in [backend/PLAN_AUDIT.md](backend/PLAN_AUDIT.md).

Gemini/gTTS provider adapters and the local Urdu proof command are now available.
Follow [backend/VOICE_PROOF.md](backend/VOICE_PROOF.md) to configure your key locally, select a
model available to your free-tier project, and test a synthetic recording. This does not yet
connect voice to persisted complaints or add voice API endpoints.

## Run with Docker Compose

Requires Docker with Compose. For first-time setup, from repository root:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Edit `.env`: use the generated JWT secret and set database/demo passwords. Use a URL-safe database
password (letters, digits, hyphens or underscores), because Compose places it into a connection URL.
Never commit `.env`. Then:

```powershell
docker compose up --build -d
docker compose run --rm api python -m app.seed
docker compose logs api
```

Compose waits for PostgreSQL, applies migrations once through the `migrate` service, and starts
the API on `http://localhost:8000`. Readiness is `http://localhost:8000/api/v1/health/ready`.
Seeding is explicit and non-destructive. Rerunning it does not reset existing passwords or erase cases.
Database data persists in the named `postgres_data` volume. Ordinary `docker compose down` preserves it.
Run one API worker for this prototype: login throttling is in memory and is not shared across workers.
The server ignores forwarded client IP headers; configure a trusted proxy deliberately if deployed.

## Run locally on Windows

Requires Python 3.12 and PostgreSQL 16. Create an empty `dastak` database and application user first.
From repository root:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Edit `backend/.env` with the actual database URL, random JWT secret and synthetic demo password.
Root `.env` configures Compose; `backend/.env` configures a backend process started locally.

```powershell
alembic upgrade head
python -m app.seed
uvicorn app.main:create_app --factory --reload --no-access-log --no-proxy-headers
```

The app never creates tables on import or startup. Apply Alembic migrations explicitly.
Runtime secrets have no usable defaults; startup fails if required settings are missing.

## Synthetic accounts and login

All freshly seeded accounts use the password supplied through `DASTAK_DEMO_PASSWORD`.

| User ID | Role | Workspace |
| --- | --- | --- |
| `demo-citizen-1` | Citizen | None |
| `demo-citizen-2` | Citizen | None |
| `demo-helper` | Helper | None |
| `demo-officer-financial` | Officer | Mock Financial Fraud Intake |
| `demo-officer-digital` | Officer | Mock Digital Safety Intake |
| `demo-admin` | Admin | None |

```powershell
$credentials = @{user_id='demo-admin'; password='YOUR_SYNTHETIC_DEMO_PASSWORD'} | ConvertTo-Json
$login = Invoke-RestMethod http://localhost:8000/api/v1/auth/login -Method Post -ContentType application/json -Body $credentials
$headers = @{Authorization="Bearer $($login.access_token)"}
Invoke-RestMethod http://localhost:8000/api/v1/auth/me -Headers $headers
```

Login returns only `access_token` as agreed in the contract. Tokens expire after 30 minutes by
default and require valid issuer, audience, subject, issuance, not-before and expiry claims.
Roles, workspace and account activation are loaded from the database on each protected request.
There is no refresh-token or logout-revocation endpoint in this increment.

## Tests and dependencies

From `backend/` with the development environment active:

```powershell
python -m pytest -q
ruff check app migrations tests
ruff format --check app migrations tests
```

The default suite creates isolated SQLite databases, applies the real migrations and checks seed
repeatability, JWT failure modes, role restrictions, safe errors, audit protection, schema drift,
and actual response conformance against the canonical OpenAPI 3.0.3 contract.
SQLite is a local test aid; PostgreSQL remains the application database.

For PostgreSQL verification, set `TEST_DATABASE_URL` to a **dedicated disposable empty test database**
before running the suite. Each test applies and downgrades the migration. Never point this variable
at the application or any database whose data you want to keep.

GitHub Actions on `be` runs the suite against both SQLite and PostgreSQL 16, validates Compose,
and builds the container. Local checks do not prove the container or PostgreSQL path works;
consult the workflow result before claiming those checks passed.

`backend/uv.lock` pins runtime and development dependencies across platforms. Pip users can use
the generated pinned requirements files. To update deliberately with uv:

```powershell
uv lock --project backend
uv export --project backend --locked --no-dev --no-hashes --no-emit-project --output-file backend/requirements.txt
uv export --project backend --locked --no-hashes --no-emit-project --output-file backend/requirements-dev.txt
```

Make API shape changes in the shared contracts first and include implementation and regression
updates in the same commit. Frontend can continue using the full canonical contract with a mock
server; a mock-server tool/version and live mock validation have not yet been selected or verified.
