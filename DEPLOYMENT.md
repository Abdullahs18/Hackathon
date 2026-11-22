# Deploy Dastak: Render Free + Supabase Free

This repository includes a two-service Render Blueprint: a static React frontend and a
single-worker Docker API. Supabase provides PostgreSQL and a private evidence bucket.
Existing local Docker development continues to use its private local volume.

The application remains a simulated reporting prototype. Use synthetic information only.
Hosting the application does not connect it to a real government reporting service.

## 1. Create the Supabase project

Use a dedicated project for this application. Select a region near the Render backend
(the Blueprint defaults to Singapore). Keep the database password in your password manager.

In **Connect**, select **Session pooler**, using port **5432**. Copy that connection URI,
substitute the URL-encoded database password, use the `postgresql+psycopg://` scheme and
append `?sslmode=require`. The resulting form is:

```text
postgresql+psycopg://postgres.PROJECT:ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

Use the exact host and username supplied by your project's Connect panel. Session pooling
avoids IPv4/IPv6 connectivity surprises on free hosting. The application also disables
automatic prepared statements and limits its production connection pool.

Create a Storage bucket named **dastak-private**:

- Public bucket: **off**.
- File size limit: at least **10 MiB** (10485760 bytes).
- If setting allowed MIME types, allow `application/octet-stream`, because validated
  evidence is uploaded as private binary objects. Dastak validates actual file contents first.
- Do not add public/anonymous object access policies.

Copy the project URL and a **server-side secret key** (`sb_secret_...`) or legacy
`service_role` key from the project's API-key settings. These values belong only in the
backend's environment. The frontend does not need a Supabase key or Supabase Auth.

Production startup enables row-level security on application tables, without anonymous
policies, so Supabase's Data API cannot bypass Dastak's case authorization. The backend
connects as the database owner through the session pooler. Do not add public read policies
to application tables. Do not use this dedicated project for unrelated applications.

Saved Urdu speech already lives in PostgreSQL and stays there. Uploaded evidence uses
the private bucket; raw voice input is not newly retained by this deployment change.

## 2. Create the Render Blueprint

Connect Render to this GitHub repository and create a **Blueprint**, selecting
`integration/deploy-render` for the candidate deployment. Render reads `render.yaml`.
No paid disk, paid pre-deploy hook or paid database is required.

The Blueprint creates:

| Service | Type | Build/start |
| --- | --- | --- |
| dastak-api | Free Docker web service | `backend/Dockerfile`, then `python -m app.deploy` |
| dastak-web | Static site | Node 24, `npm ci`, `npm run build`, publish `dist` |

Service names may receive a suffix if a public hostname is already taken. Note the actual
frontend and API HTTPS URLs assigned by Render.

Enter these prompted backend environment values:

| Variable | Value |
| --- | --- |
| DASTAK_DATABASE_URL | The SSL-enabled session-pooler URI above |
| DASTAK_CORS_ORIGINS | JSON array of the exact frontend HTTPS origin, with no trailing slash |
| DASTAK_DEMO_PASSWORD | A new, unique password of 12-1024 characters for the synthetic accounts |
| DASTAK_SUPABASE_URL | Your Supabase project HTTPS URL |
| DASTAK_SUPABASE_SERVICE_KEY | Server secret or legacy service_role key |
| GEMINI_API_KEY | Your existing Gemini key |
| DASTAK_GEMINI_MODEL | Your available model identifier |

Render generates `DASTAK_JWT_SECRET`. Keep it stable on subsequent deployments; changing
it invalidates existing sessions. The other production settings are defined in the Blueprint.
`deploy/.env.production.example` documents the complete environment without real credentials.

Example origin configuration:

```text
["https://dastak-web-YOUR-SUFFIX.onrender.com"]
```

If you do not know the frontend URL at the initial prompt, enter its intended HTTPS origin,
then correct this value in the API service's Environment panel once Render assigns the actual
URL and redeploy the API. This is a dashboard setting; no application code edit is needed.
Origins are deliberately exact, without a wildcard or arbitrary preview-host allowance.

The frontend's public API URL is populated from the backend service's `RENDER_EXTERNAL_URL`.
Check it in the frontend service environment if you rename services or change domains.
Changing frontend environment values requires a new frontend build.

The production build refuses mock mode, a localhost/non-HTTPS API origin and common
server-secret names prefixed with `VITE_`. Never put server credentials in any frontend
environment variable, regardless of its name.

## 3. What startup does

The API startup command:

1. Validates production configuration and confirms the bucket exists and is private.
2. Acquires a PostgreSQL startup advisory lock and applies Alembic migrations.
3. Enables application-table row security for the dedicated Supabase project.
4. Seeds synthetic accounts/routing/services when `DASTAK_SEED_DEMO=true`.
5. Starts one Uvicorn worker on Render's `PORT`.

Seeding is non-destructive: existing accounts keep their passwords. Changing
`DASTAK_DEMO_PASSWORD` does not rotate passwords already in the database. Startup stops
with a sanitized error if prerequisites fail; it does not silently use SQLite or local files.

No free-tier shell or paid migration hook is needed. The Blueprint waits for
`/api/v1/health/ready`, which checks migration revision, database access and private storage.
Regular updates must still be tested against a staging database before production rollout.

Proxy headers are ignored by default. If your host supplies verified load-balancer IP/CIDR
ranges, configure `DASTAK_TRUSTED_PROXY_IPS` as a JSON array of those ranges; wildcards
are rejected. With no trusted ranges, production login throttling is scoped to the socket
address plus account, rather than grouping every role behind one proxy into one bucket.
Do not enable arbitrary forwarded-header trust to fix a login problem.

## 4. Verify the hosted application

Wait for both services to finish deployment, then open:

```text
https://YOUR_API.onrender.com/api/v1/health/ready
https://YOUR_FRONTEND.onrender.com/login
```

Expected health response: `{"status":"ok","simulated":true}`.
Refresh `/login` and a case-detail route directly to verify the SPA rewrite.

From a configured local backend Python environment, the read-only release check is:

```powershell
python -m app.release_check --base-url https://YOUR_API.onrender.com --origin https://YOUR_FRONTEND.onrender.com
```

Add `--roles` only after setting `DASTAK_DEMO_PASSWORD` in that local process environment to
match the hosted accounts. Do not paste credentials into issues, screenshots or chat.
This check creates no complaints and makes no Gemini calls.

Perform this acceptance run using synthetic data:

- Citizen login, text extraction, reviewed form filling and an Urdu recording.
- Urdu spoken review and audio replay after refreshing the browser.
- Explicit required sharing, final approval, saved graph steps and verified simulated receipt.
- Admin assignment, Officer clarification, Citizen response and Officer closure.
- Helper acknowledgment/response and loss of access after consent withdrawal.
- Upload a small synthetic image/PDF, download it and record its SHA-256.
- Restart/redeploy the API from the Dashboard. Confirm the case, evidence bytes/hash and saved
  speech remain available. Check an unauthorized role cannot fetch the evidence.
- Confirm mobile HTTPS microphone permission and direct page refreshes work.

Free Render services sleep after idle time and can take about a minute to wake. Open the
application before presenting. Free Supabase projects also have usage and inactivity limits.
Gemini quota is separate from hosting; preserve quota for the demo rather than repeatedly
running all evaluation cases. See `DEMO_AND_EVALUATION.md` for the full demo and evaluation.

## 5. Backups, updates and rollback

- Take a PostgreSQL export and a separate private-bucket backup before a significant release.
  Database exports alone do not include evidence objects. Keep a record of the matching
  database revision and release SHA, and protect both backups as private data.
- Store backups outside this repository. Free-tier hosting is not a backup strategy.
- Restore backups to a separate test project first. Reconfigure its private bucket and API
  environment, then verify cases, evidence hashes, speech and role boundaries.
- Deploy application updates only after CI passes. `autoDeployTrigger: checksPass` is set.
- For application-only rollback, select the previous verified release in Render. Review schema
  compatibility first; do not automatically downgrade a database containing newer data.
- For a database-changing release, use a tested forward fix or a verified restore procedure.
  Never run `docker compose down -v` or drop a project as a routine deployment fix.

Existing local Docker volumes are not uploaded to the new cloud project automatically.
The first hosted deployment creates a separate database. Transferring existing cases requires
a coordinated database export plus evidence-object transfer with original keys/hashes;
do not switch storage backends for an existing populated database without that transfer.

After the hosted acceptance run passes, merge the deployment candidate into `main`, switch
the Render Blueprint/services to `main`, and verify the resulting release. Until then,
`main` remains the previous version and the candidate stays isolated.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Startup failure | Environment values, database password encoding, session-pooler host/5432, SSL, private bucket and server key |
| Login network error / OPTIONS 400 | Exact frontend origin in DASTAK_CORS_ORIGINS and correct frontend API build URL |
| Ready endpoint returns 503 | Migration state, Supabase project availability, bucket privacy and key access |
| Missing evidence after switching backends | Whether both the database and evidence objects were transferred |
| Page refresh returns 404 | Static-site `/*` rewrite to `/index.html` |
| Old sessions stop working | Whether JWT secret changed |
| Model request fails | Gemini model availability/quota; do not expose provider credentials in logs |

Official references: [Render Blueprints](https://render.com/docs/blueprint-spec),
[Render free limits](https://render.com/docs/free),
[Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[private storage](https://supabase.com/docs/guides/storage/security/access-control).
