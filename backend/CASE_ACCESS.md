# Complaint drafts, consent and case access

This increment adds persisted drafts and the access gates that future evidence, AI and submission
flows will reuse. Work remains on `be`. The Gemini/gTTS CLI continues to work independently.

## Update your existing Windows/Docker setup

From your repository root:

```powershell
git fetch origin
git switch be
git pull --ff-only origin be
docker compose up --build -d
docker compose ps -a
```

Migration `0002` adds four tables: complaints, complaint_access_grants, case_assignments and
consents. Existing accounts, passwords, workspaces and append-only audit history are preserved.
Keep your current `.env` and database volume. No account reset or reseeding is needed.
Readiness now verifies that the database has reached the current Alembic migration head.

## API surface added

| Method | Endpoint | Caller |
| --- | --- | --- |
| POST / GET | `/api/v1/complaints` | Citizen: create/list own drafts |
| GET | `/api/v1/complaints/{id}` | Owning Citizen, or specifically granted Helper with current consent |
| PATCH | `/api/v1/complaints/{id}` | Owning Citizen only |
| GET / POST | `/api/v1/complaints/{id}/helper-grants` | Owning Citizen only |
| POST | `/api/v1/complaints/{id}/helper-grants/{helper_id}/revoke` | Owning Citizen only |
| GET / POST | `/api/v1/complaints/{id}/consents` | Owning Citizen only |
| PATCH | `/api/v1/consents/{id}` | Owning Citizen only |
| POST | `/api/v1/consents/{id}/withdraw` | Owning Citizen only |
| GET | `/api/v1/helper/complaints` | Helper: current grant + consent, filtered per case |
| POST | `/api/v1/complaints/{id}/helper-information` | Helper: current grant + consent, fields within scope |
| GET | `/api/v1/officer/complaints` | Officer: assignment + workspace + current consent |
| GET | `/api/v1/officer/complaints/{id}` | Officer: same gates, submitted/review/resolved states only |
| POST | `/api/v1/admin/complaints/{id}/assignment` | Admin: assign an already submitted, routed, consented case |

Together with the foundation, there are 22 implemented operations. The contract now has 41 planned
operations, including those still unimplemented. Swagger only shows the implemented surface.
API keys remain unsupported and fail closed; the future assignment scope is `admin:cases`.

## Draft rules and connection recovery

- New drafts are always owned by the authenticated Citizen and start in `DRAFT`. A client cannot
  set owner, status, route, workspace, review result, authorization or generated complaint text.
- Incident payloads use the canonical shared schemas. Unknown values can be null; omitted fields
  stay unchanged on PATCH. Empty PATCHes and unknown fields are rejected with 400.
- Only DRAFT, COLLECT_INFORMATION, NEEDS_INFORMATION and CITIZEN_REVIEW can be edited. A meaningful
  edit resets the case to DRAFT and clears generated complaint text, requiring fresh analysis/review.
  Existing route identifiers are not silently rewritten. Submitted cases are not directly editable.
- Nonempty evidence IDs are rejected until the protected upload/ownership workflow exists.
- Draft reads return version, created_at and updated_at. Individual draft responses include the
  quoted version as ETag, also exposed through CORS.
- Supply an opaque `Idempotency-Key` when creating a draft. An identical retry by the same citizen
  returns 200 and the existing current draft; initial creation is 201. Different payload with the
  same key is 409. Keys are private to each citizen. Omitting a key creates a new draft each time.
- Supply the last ETag as `If-Match` when saving. If another save changed the version, 412 prevents
  overwriting it. Reload and reconcile the saved values after an uncertain outcome. Do not blindly
  retry with a stale version. Same-value PATCH without a stale precondition is a no-op.
- This supports backend persistence/safe retries. Frontend autosave, connection indicators and
  last-saved UI are still the frontend owner's work. Agent-state recovery remains a later increment.

## Consent semantics

Consent uses namespaced recipients and controlled purposes:

| Recipient | Purpose | Meaning |
| --- | --- | --- |
| `user:demo-helper` | `helper_assistance` | Named Helper may assist this case under a separate active grant |
| `workspace:mock-financial-fraud` | `complaint_submission` | The selected simulated workspace may receive the consented data |

Supported data scopes are defined once in `ConsentDataScope` in schemas.yaml:

- `case_status`: the case envelope (case/citizen IDs, status, route identifiers, version and saved times).
  Required before a helper or officer can see a case, including in lists.
- `incident_data`: the incident fields, excluding evidence IDs.
- `incident_data.amount`, `incident_data.description`, etc.: individual incident fields for narrower
  sharing. An unauthorized field is omitted from responses and cannot be changed by a Helper.
- `evidence`: evidence identifiers/access, separately from incident sharing. Protected uploads and
  evidence retrieval are not implemented yet; this scope alone does not create those capabilities.

Example full incident assistance consent:

```json
{
  "recipient": "user:demo-helper",
  "purpose": "helper_assistance",
  "data_scopes": ["case_status", "incident_data"]
}
```

Only one active record per case/recipient/purpose is allowed. A duplicate grant conflicts with 409.
You can narrow scopes or change recipient/purpose immediately using PATCH. Withdrawal records its
time, blocks subsequent scoped reads/writes and keeps the old record. Withdrawn records cannot
be edited/re-enabled; a deliberate new consent grant creates a new record.

Helper grants and sharing consent are independent gates: both must remain active. Re-activating
a helper grant alone does not restore withdrawn consent. Helpers cannot confirm citizen corrections,
manage grants/consent, or edit through Citizen routes. Admin has no incident-read consent bypass.
Generated formal drafts are owner-only until a dedicated scoped draft representation is defined.

Every meaningful write records an audit event in the same transaction. Audit metadata records
changed field names, versions, recipient/scopes and assignment/grant identifiers; ordinary logs
and draft-write audit summaries exclude incident narrative, transaction references and credentials.

## Quick Swagger check on your machine

Open `http://localhost:8000/docs`. Obtain and authorize a `demo-citizen-1` token using your existing
demo password. Keep tokens local. Replace `{id}` below with the returned complaint_id.

1. POST `/complaints` with header `Idempotency-Key: citizen1-draft-test-1` and:

   ```json
   {"description":"Synthetic fake aid message","amount":1500,"currency":"PKR","incident_date":null,"transaction_reference":"DEMO123"}
   ```

   Expect 201, DRAFT, version 1. Repeat the exact request/key: expect 200 and the same complaint_id.
2. GET `/complaints/{id}`: expect the saved values and ETag `"1"`.
3. PATCH `/complaints/{id}` with `If-Match: "1"` and `{"amount":1700}`: expect 200/version 2.
   Retry using `If-Match: "1"`: expect 412. Reload to confirm the stored amount is still 1700.
4. POST `/complaints/{id}/helper-grants` with `{"helper_id":"demo-helper"}`: expect 201.
5. POST `/complaints/{id}/consents` with the consent example above: expect 201. Keep consent_id.
6. Log in as `demo-helper`, replace Swagger's authorization token, and GET `/helper/complaints`.
   Expect this case. GET `/complaints/{id}` should work. POST its `/helper-information` endpoint
   with `{"platform":"SMS"}` should work. Direct Citizen PATCH and consent management must be 403.
7. Switch back to the owning Citizen token. POST `/consents/{consent_id}/withdraw`: expect 200.
   Switch back to Helper: its list omits the case; direct reads and information writes return 403.
8. Log in as `demo-citizen-2`: the first citizen's case must not appear in `/complaints`, and direct
   reads/writes must return 403. Admin also cannot read this incident through the Citizen endpoint.
9. Restart the API (`docker compose restart api`) and sign in again: the draft and withdrawn consent
   history must remain. No manual database editing is required.

## Officer checks and deliberate boundaries

Officer list/detail checks enforce assignment, matching officer/assignment/complaint workspace,
submitted/review/resolved state, active account and current workspace consent. Responses are
filtered to consented data; workspace consent withdrawal blocks access even with an assignment.

The assignment endpoint returns metadata only. It requires a submitted/review case with a pinned
route and current workspace consent, and an active Officer in that workspace. It cannot turn a
draft into a submitted case. On a fresh manual draft, assignment returns 409 and Officer lists
remain empty. Automated policy tests use explicitly synthetic submitted-case fixtures; they do
not stand in for the future live routing/authorization/submission workflow. Do not edit database
statuses manually to pretend that submission works.

Still pending: protected evidence uploads/retrieval, persisted AI analysis/follow-ups, normalized
classification, immutable routing versions, citizen submission authorization, LangGraph/state,
typed mock services/idempotent filing, officer decisions, notifications, API keys, complete audit
inspection, pinned mock-server verification and the team frontend integration checkpoints.
