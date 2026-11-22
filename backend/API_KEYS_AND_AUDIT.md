# Scoped application keys and safe Admin inspection

Migration 0008 adds hashed application credentials. These keys are separate from
`GEMINI_API_KEY`; they authenticate callers to Dastak. No real personal data is needed.

## Update

With Docker Desktop running, from the repository root:

```powershell
git switch be
git pull --ff-only origin be
docker compose up --build -d
```

Compose applies migration 0008 before starting the API. Existing cases, receipts, review history,
notifications, routing snapshots and account passwords are preserved. There are no seeded keys
and no additional environment variables. The full integrated audio flow remains separate work.

## Issue and try a key

1. Open `http://localhost:8000/docs`. Log in as `demo-citizen-1` using the existing demo password.
   Authorize with its Bearer token. Leave the API-key authorization field empty.
2. Generate a future expiry in PowerShell:

   ```powershell
   (Get-Date).ToUniversalTime().AddHours(1).ToString('o')
   ```

3. `POST /api/v1/api-keys` requires an `Idempotency-Key`, for example `citizen-key-001`.
   Paste the generated expiry into this body:

   ```json
   {
     "scopes":["complaints:read"],
     "expires_at":"PASTE_FUTURE_TIMEZONE_AWARE_TIMESTAMP"
   }
   ```

   Expected: 201 with `api_key_id` and an `api_key` starting `dastak_`. Copy the secret privately
   now: it is returned only once. The database stores its SHA-256 hash, not the secret. Expiry
   must include a timezone, be in the future, and be at most 90 days away. Keys bind to the
   JWT account that issues them. There is no target-principal field: even Admin cannot mint
   another account's credentials. This is enforced by the API and a database constraint.

4. In Swagger **Authorize**, clear the Bearer token and enter the raw application key under
   `ApiKeyAuth`. Send exactly one authentication method; sending both is rejected with 401.
   `GET /auth/me` should identify `demo-citizen-1`. `GET /complaints` should list only that
   Citizen's cases. Writes with this read-only key and Admin operations return 403. Another
   Citizen's case remains forbidden even when the key has the correct resource scope.
5. Clear the application key and reauthorize with the Admin JWT. `GET /admin/api-keys` shows
   metadata only. `POST /admin/api-keys/{id}/revoke` returns `revoked: true`. A repeat is safe.
   The owning Citizen can alternatively list/revoke their own keys through `/api-keys` using
   their own JWT. Switch back to the revoked key: a protected request now returns 401. Expired credentials and
   keys belonging to inactive accounts also fail. Current role/workspace still come from the DB.

## Role and scope boundaries

| Bound account | Allowed scopes |
| --- | --- |
| Citizen | complaints:read, complaints:write, consents:read, consents:write, mock:services, notifications:read |
| Helper | helper:access, notifications:read |
| Officer | officer:access, notifications:read |
| Admin | admin:users, admin:cases, admin:rules, admin:audit, admin:api_keys, mock:services, notifications:read |

Every protected operation has an explicit scope mapping; an unmapped future operation fails closed.
`/auth/me` needs a valid credential, with no additional resource scope. Self-service key lifecycle
routes require JWT authentication and reject application keys. Public login/health remain
public. Evidence URLs accept the corresponding owner, Helper or Officer resource scope, then
apply the same current case/evidence consent policy as JWT requests. A scope never substitutes
for a helper grant, assigned workspace, owner check, reviewed approval or recipient consent.

`notifications:read` includes marking one's own message read. `mock:services` permits only the
already authorized mock operations; it does not let Admin file for a Citizen or bypass consent.
The `admin:api_keys` scope permits metadata listing and revocation, including self-revocation.
**Issuance always requires the account's own JWT** so a scoped key cannot mint wider or longer
credentials. `POST /admin/api-keys` is retained for Admin self-issuance; it cannot target Citizens,
Helpers or Officers. Users manage only their own keys via JWT-only `/api-keys` routes; Admin can
inspect metadata and revoke credentials through the existing Admin routes without impersonation.

Keys are checked on every protected request and before every fixed agent tool. Revocation or
expiry during a run stops the next tool. Existing saved progress/receipts remain recoverable by
the owning Citizen using a fresh valid credential; retry the same submission key. Revocation
cannot retract a copy already received or a filing already committed. A provider assessment
completed after key revocation is discarded rather than saved.

## Creation and revocation recovery

- Keep the issuance command key stable across a lost response. Replaying a creation command is
  409, never a second secret or a second row. Concurrent identical commands return one 201 and
  one 409. This differs deliberately from replaying a simulated filing receipt.
- If creation reports an uncertain save (503), use your JWT to list your own metadata, identify/revoke any orphaned key,
  and issue a new command/key if necessary. A secret that was not received cannot be recovered
  from its hash. Record the returned key ID privately when issuance succeeds.
- Listing/revoking returns no hashes, raw keys, principal bindings, issuance command keys or
  fingerprints. Principal/issuer bindings are private persistence fields. Never commit secrets.
- Revocation is idempotent. After an uncertain revocation response, recover metadata and retry.

## Admin audit and agent inspection

As Admin JWT, or an Admin key with only `admin:audit`:

- `GET /api/v1/admin/audit` lists safe audit summaries. Use optional `complaint_id` to follow a
  case. Actions have fixed explanations; `input` contains only selected validated identifiers,
  revision counters, allowlisted step/outcome names and field counts. Unknown/private stored
  values are omitted. Legacy run references are linked without rewriting append-only history.
- `GET /api/v1/admin/agent-runs` lists safe run/route/status/tool summaries. Each tool shows its
  allowlisted name, checkpoint status and timestamp. Server outcome codes have fixed explanations;
  unrecognized private failures/warnings are represented only as unknown_failure/unknown_warning.
  A completed agent's status is its execution snapshot; current human review progress remains
  on the case. The original routing version remains visible through immutable rule history.

Both responses are marked `redacted: true`. They do not return incident facts, transcripts,
classification prose, private evidence details, review conversation text, transaction references,
receipt numbers, raw tool inputs/outputs, command keys or credentials. Admin still cannot use
the Citizen/Officer raw-case endpoints as a data-consent bypass. Full private records remain
subject to their existing owner/assignment/consent gates; no new Admin raw-data grant is added.

Audit, agent-run and API-key metadata lists are bounded to 50 by default, with `limit=1..100`.
Responses stay arrays. If `X-Next-Cursor` is present, pass it unchanged as `before` with the same
filters to fetch older records. Self-service cursors cannot refer to another account's keys.
Tied timestamps use IDs for stable ordering. The cursor header
is exposed through CORS; unknown cursors or mismatched case filters are 400. Reads do not mutate
or backfill audit/agent history.

Automated checks cover role/scope enforcement, ownership and consent, current account state,
revocation between tools/provider results, shared evidence scopes, single-use issuance, lost
responses, PostgreSQL issuance races, safe trace projections, malformed legacy data, pagination
and migration/model agreement. These tests use synthetic provider fixtures; live integrated
audio and frontend/mock-server checkpoints remain separate verification work.
