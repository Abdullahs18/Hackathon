# Saved-case text assessment

Migration `0004` adds private versioned case assessments. There are 28 implemented operations
out of 45 canonical planned operations. The original 26 operations remain available.

| Operation | Behavior |
| --- | --- |
| POST `/api/v1/complaints/{id}/analyze` | Owning Citizen explicitly permits the current saved incident to be assessed by Gemini |
| GET `/api/v1/complaints/{id}/analysis` | Owning Citizen recovers the current saved result without a provider call |

Request body: `{"allow_external_processing": true}`. Optional `If-Match` is the current quoted
complaint ETag. Missing/false permission returns 400 before any provider call; other roles and
other citizens receive 403, even if a Helper has sharing consent. The permission is for this
assessment, not complaint submission or a reusable sharing grant.

Gemini receives saved incident fields, excluding server-managed evidence IDs and citizen-confirmed
correction records. Evidence file bytes, identity records, credentials and grants are not sent.
The serialized input is limited to 24000 characters and needs a description or scam-message text.
Use only synthetic incident data in this prototype. Startup does not require a provider key.

The provider returns structured extraction, an Urdu summary, uncertainties and classification.
Canonical JSON Schema plus strict Pydantic validation reject malformed outputs, non-finite
confidence, unrecognized field names, unsupported type labels, invented evidence IDs and asserted
citizen corrections. This validates structure and authority boundaries, not the truth of model
suggestions. Suggested facts remain in the assessment; saved citizen incident data is unchanged.
The citizen accepts/corrects suggestions using the normal complaint PATCH operation.

Initial classifier labels are `fake aid scam`, `phishing`, `impersonation`, `fraudulent transfer`,
`other suspected online financial fraud`, `out of scope` and `unclear`. These are subtypes/context
within the single reporting workflow, not additional complaint workflows or legal determinations.

Deterministic policy checks saved description and money-loss information, and amount/currency
for reported financial loss. It flags inconsistent loss/amount facts and possible duplicate
transaction references among the owner's other cases. A duplicate flag does not merge/delete a
case or prove fraud. Follow-ups use only missing fields, omit already supplied values, and ask
for optional details only if known. Unknown dates/references stay unknown. Scores and model
confidence are prototype indicators, not calibrated probabilities or fraud verdicts.

## Deliberate routing boundary

The routing engine is the next dependency. Its match contribution is currently zero and
`routing_unavailable` is always a hard-stop reason, regardless of the numeric readiness score.
Consequently the current result is `HUMAN_REVIEW`, never an apparently ready/submitted complaint.
The response includes `submitted: false` and `requires_citizen_review: true`. No authority is
selected, formal complaint generated, consent inferred or submission authorized by this feature.
This status records a need for review; it does not claim a human-review queue/UI is implemented.

Owners and permitted Helpers may correct facts on a HUMAN_REVIEW case; a meaningful change
returns it to DRAFT and requires a fresh analysis. This does not bypass any review/filing gate.

## Persistence, failures and concurrency

Analysis updates complaint status/version and returns the new ETag and `complaint_version`.
Reanalysis of the unchanged current version returns the cached result. Meaningful incident edits
or evidence uploads invalidate the current result; GET then returns 404 until reanalysis. Old
assessments remain stored for later protected historical trace, not exposed through an unscoped
history endpoint. Submitted/finalized cases cannot be analyzed through this draft operation.

The app commits an explicit permission audit record before calling Gemini and releases the case
row lock/DB connection. After the call, it rechecks current Citizen account access and complaint
version under a new lock. Concurrent edits discard the output with 409 instead of overwriting
new facts. Account changes also prevent saving. Two simultaneous provider calls are permitted
per API process, and one per complaint; excess requests return 429. Run the documented single
API process; cross-process admission control is not implemented.

No automatic provider retries are made. Invalid output returns 502, quota failure 429, and
missing configuration/transport/timeouts 503. Saved facts remain intact. An uncertain database
commit returns 503: GET the current analysis before retrying. If it committed, a new POST uses
the saved cache. Permission, success, failure and discarded-result audit events contain IDs,
versions, field names and hashes, not incident text, model payloads, filenames or secrets.
Provider calls use the same bounded timeout and configured model as the live voice proof.

## Local check

Keep the existing `.env`, Gemini key and model choice. From the repository root:

```powershell
git switch be
git pull origin be
docker compose up --build -d
docker compose ps -a
```

1. In http://localhost:8000/docs, sign in as `demo-citizen-1` and authorize with its JWT.
2. Create a fresh complaint, for example:

```json
{
  "description": "مجھے ایک جعلی امدادی پیغام ملا۔ میں نے 1500 پاکستانی روپے بھیجے۔ میری ٹرانزیکشن کا ریفرنس DEMO123 ہے۔ واقعے کی تاریخ یاد نہیں۔",
  "money_lost": true,
  "amount": 1500,
  "currency": "PKR",
  "transaction_reference": "DEMO123",
  "incident_date": null
}
```

3. POST its `/analyze` with `{"allow_external_processing": true}`. Expect 200, structured
   extraction/classification, an Urdu summary, `routing_unavailable`, `HUMAN_REVIEW` and
   `submitted: false`. Other flags depend on the input/provider. Unknown dates must not be invented.
4. GET `/analysis`, repeat POST on the unchanged version, and restart the API. The saved result
   must be recoverable; repeat requests use the cache rather than invoking Gemini again.
5. PATCH a meaningful fact such as amount, or upload new synthetic evidence. GET `/analysis`
   must now return 404. Reanalyze the changed case and verify a new analysis/version is saved.
6. Another Citizen, Helper or Admin must receive 403 for POST/GET analysis. False external
   permission returns 400. Do not share your Gemini key or full tokens when reporting results.

Automated tests use a fake provider and make no paid/external calls. Live provider proof was
previously user-confirmed for the CLI. This new endpoint's live Gemini check is a separate user
check; automated success does not claim it has been performed.

Still pending: integrated voice/audio endpoints and playback, deterministic immutable routing,
route-aware readiness and complaint generation, LangGraph/mock submission, explicit final
authorization, officer decisions, notifications, API keys, complete audit browsing, frontend
integration checkpoints and pinned mock-server validation. RAG remains a bounded extension after
the core reporting flow works; the full dataset/knowledge collection will use a separate branch.
