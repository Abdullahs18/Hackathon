# Citizen approval and simulated submission

This increment follows the user-confirmed live routing check. All identity/payment lookups and
filings are synthetic. A `SIM-...` reference is not a government filing. Use synthetic facts only.
Migration 0006 adds approved revisions, service fixtures, durable agent runs/tool results and
simulated receipts. Existing cases, evidence, saved analyses and immutable routes are preserved.

## Update and start

From the repository root in PowerShell, with Docker Desktop running:

```powershell
git switch be
git pull --ff-only origin be
docker compose up --build -d
docker compose run --rm api python -m app.seed
docker compose ps -a
```

The migration container should exit with code 0; API and database should be healthy. Keep the
existing `.env` and passwords. Seeding adds missing synthetic service fixtures without resetting
accounts, changing existing rules or overwriting edited fixtures. Do not remove database volumes.

## Swagger walkthrough

Open `http://localhost:8000/docs`. Log in as `demo-citizen-1` with your existing demo password and
use **Authorize** with the returned access token. Log in again if an expired token causes 401.

1. Create a **new** complaint using `POST /api/v1/complaints`. For the simplest check use:

   ```json
   {
     "description": "I received a synthetic fake aid message and sent 1500 Pakistani rupees.",
     "money_lost": true,
     "amount": 1500,
     "currency": "PKR"
   }
   ```

   An unknown date/reference stays unknown. To exercise a known payment fixture, add
   `"transaction_reference": "DEMO-SUBMIT-001", "payment_method": "demo_wallet"`.
   Use that reference only once; an existing report with the same reference triggers duplicate
   review rather than another filing. For further normal-flow checks omit the optional reference.

2. Analyze using `POST /api/v1/complaints/{id}/analyze` with
   `{"allow_external_processing": true}`. This explicitly sends these synthetic facts to Gemini.
   Read `GET /api/v1/complaints/{id}`. Proceed only when `current_status` is `CITIZEN_REVIEW`.
   Check the draft, recipient workspace and pinned rule. If Gemini asks for information, correct
   the actual missing facts and analyze again. Do not force an approval on a review/handoff case.

3. Grant each required consent with separate `POST /api/v1/complaints/{id}/consents` calls.
   Replace `WORKSPACE_ID` below with the case's actual `destination_workspace_id`:

   | recipient | purpose | data_scopes |
   | --- | --- | --- |
   | `workspace:WORKSPACE_ID` | `complaint_submission` | `["case_status", "incident_data"]` |
   | `service:mock-identity` | `mock_identity_check` | `["case_status", "identity_reference"]` |
   | `service:mock-data` | `mock_requirements_lookup` | `["case_status", "incident_data.incident_type"]` |
   | `service:mock-payment` (only with a transaction reference) | `mock_payment_lookup` | `["case_status", "incident_data"]` |

   For example, the identity consent body is:

   ```json
   {
     "recipient": "service:mock-identity",
     "purpose": "mock_identity_check",
     "data_scopes": ["case_status", "identity_reference"]
   }
   ```

   If the review draft contains evidence IDs, also add `"evidence"` to the workspace grant.
   These broad incident scopes are convenient for this demo; granular approved draft fields
   also work. A helper grant or external Gemini permission does not authorize filing or services.
   View existing grants first; do not create duplicate active recipient/purpose grants.

4. Read the latest case `version`. After reviewing its draft, call
   `POST /api/v1/complaints/{id}/authorize-submission`:

   ```json
   {
     "citizen_authorized": true,
     "citizen_confirmed": true,
     "reviewed_version": 2
   }
   ```

   Replace `2` with the actual reviewed version. Both flags must be true. Copy `authorization_id`
   from the response. Approval binds the exact facts, draft, evidence IDs, route, owner and
   current required consent records. It does not call the mock services yet.

5. Call `POST /api/v1/complaints/{id}/submit`. Enter a new nonempty `Idempotency-Key`, such as
   `citizen-demo-filing-001`, in the header field, and use:

   ```json
   {"authorization_id": "PASTE_THE_RETURNED_AUTHORIZATION_ID"}
   ```

   Expected: HTTP 200, `simulated: true`, `submitted: true`, `current_status: SUBMITTED` and a
   `SIM-...` reference. With an unknown optional reference, payment lookup is explicitly skipped.

6. Repeat the **same** request with the **same** key. It must return the same run/reference,
   without another filing. Read `GET /api/v1/complaints/{id}/agent-runs` to see the saved run and
   `next_step: done`. `GET /api/v1/mock/complaints/by-idempotency-key/{key}` returns the simulated
   recipient confirmation while consent remains current. Your case also retains its receipt.

7. Withdraw the workspace consent using `POST /api/v1/consents/{id}/withdraw`, then repeat the
   mock confirmation read: expected **403**. Your own saved case/reference remains readable.
   Withdrawal blocks future sharing; it cannot retract an already recorded simulated filing.

## Recovery and expected stops

- A lost response is not permission to choose a new submission key. First recover the case,
  approval and runs. Retry the same approval/key; previously checkpointed tools are not repeated.
- One approval has one run/key. Reusing its key for a different case/approval, changing the
  approved payload, or choosing a different key for that approval returns 409.
- A live execution lease returns 429 with `Retry-After: 60`; wait before retrying. A crashed
  worker's lease expires after 60 seconds. Completed requests replay immediately.
- Relevant consent changes or withdrawal invalidate the approval. Restoring a grant does not
  silently restore approval. Before filing, revoke via
  `POST /api/v1/complaints/{id}/authorization/revoke`, correct/reanalyze as needed, review the
  latest revision and explicitly authorize it again. Use a new key for this new approval.
- Missing consent is 403; stale/unreviewed approval is 409. Missing identity fixtures or required
  reporting fields stop for information. Conflicting known payment facts stop for human review
  without overwriting citizen facts. A missing optional payment fixture gives a warning; it does
  not prove a transaction invalid. Invalid requirements fail closed.
- If filing committed but the response was lost, the saved receipt and `next_step: verify`
  recover the existing result. Verification reads the receipt already received by the citizen;
  it does not disclose data or issue another recipient request. This local verification may
  finish after withdrawal. A new mock recipient read still requires current consent.
- A receipt cannot be undone by revoking approval: this returns 409 even when local verification
  has not yet finished. Revoking an active unfiled approval returns the case to DRAFT. A run
  already stopped for information/human review can be corrected and analyzed again.

## Implementation and access boundaries

The actual LangGraph `StateGraph` follows five fixed tools: identity, payment, requirements,
submission and receipt verification. The LLM cannot choose tools, authorize sharing or file.
Typed tool inputs and canonical output validation are shared with the REST adapters.

Durability uses **application SQL checkpoints**, not LangGraph's native checkpointer API. A run
stores its next step and state, each tool stores its input/result, and case progress is committed
after every important transition. The local mock filing, receipt and submit checkpoint share
one transaction, so there is no external side effect outside this atomic boundary. Resume starts
the graph at the saved step. A short database lease and case row lock serialize workers; unique
constraints protect principal/key, approval/run, case/filing and known transaction/filing bindings.
Real external services would need their own idempotent recipient contract and reconciliation.

Each sensitive tool reloads the active citizen, approved revision, pinned route and scoped consent.
The graph carries only opaque run/step metadata; incident facts and evidence bytes are not sent to
an agent model. Tool records stay in the private database. Ordinary logs exclude payloads and keys.
External LangSmith tracing is explicitly disabled for this graph, even if environment flags enable it.
Evidence original hashes are checked before filing; the mock payload contains evidence IDs, not
public file URLs. No authenticity claim or OCR is added.

Only the owning citizen may authorize, run or inspect these case runs/receipts. Helpers cannot
authorize for citizens. Admin may inspect synthetic fixture lookups but gets no case/receipt
consent bypass. `POST /mock/complaints` is a compatible adapter through the same complete graph;
it cannot skip identity, requirements or authorization checks. Its first creation returns 201,
replay returns 200, and its draft must exactly equal the citizen-approved draft.

New public contract fields/endpoints ship with schema tests. Frontend/test-owner review and the
mock-server/integration checkpoints remain required. Officer actions and notifications are now
implemented; see OFFICER_REVIEW.md. Scoped keys and safe Admin trace inspection are implemented;
see API_KEYS_AND_AUDIT.md. Full case-integrated voice remains a later increment.
Source-backed RAG/full dataset collection remain the approved follow-on after the core workflow.
