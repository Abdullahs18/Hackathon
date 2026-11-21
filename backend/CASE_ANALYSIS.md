# Saved-case text assessment

Migration `0004` adds private versioned case assessments. Routing migration `0005` extends their
readiness and review behavior. There are now 32 implemented operations out of 46 planned operations.

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

## Routing, readiness and review

The deterministic versioned routing engine is implemented; see ROUTING.md. An active matching
demo rule contributes 0.15 and pins the exact immutable version. Missing/invalid/mismatched routes
and other hard stops produce HUMAN_REVIEW. Otherwise missing required facts or a score below
0.85 produce NEEDS_INFORMATION; complete cases at least 0.85 get CITIZEN_REVIEW and a structured
draft assembled from saved facts. Unknown optional values remain unknown. The draft is unconfirmed,
requires_citizen_review is true, and submitted is false. No consent or filing authority is inferred.
These states do not claim an Officer handoff queue or real government integration is implemented.

Owners and permitted Helpers may correct facts on a HUMAN_REVIEW case; a meaningful change
returns it to DRAFT and requires a fresh analysis. This does not bypass any review/filing gate.

## Persistence, failures and concurrency

Analysis updates complaint status/version and returns the new ETag and `complaint_version`.
Reanalysis of the unchanged current version returns the cached result. Unrouted cases reevaluate
when the rule catalog changes, reusing the saved assessment without another provider call. Older
pre-routing results upgrade this way on POST; GET continues to return the stored snapshot.
Meaningful incident edits
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
docker compose run --rm api python -m app.seed
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
   extraction/classification, an Urdu summary and `submitted: false`. With an active matching
   rule and sufficient readiness, expect CITIZEN_REVIEW and an unconfirmed draft; missing facts
   or hard stops give NEEDS_INFORMATION/HUMAN_REVIEW. Existing duplicated DEMO123 references may
   trigger review; omit unknown references or use unique synthetic references for a normal case.
   Unknown dates must not be invented. ROUTING.md provides a complete rule-change check.
4. GET `/analysis`, repeat POST on the unchanged version, and restart the API. The saved result
   must be recoverable; repeat requests use the cache rather than invoking Gemini again.
5. PATCH a meaningful fact such as amount, or upload new synthetic evidence. GET `/analysis`
   must now return 404. Reanalyze the changed case and verify a new analysis/version is saved.
6. Another Citizen, Helper or Admin must receive 403 for POST/GET analysis. False external
   permission returns 400. Do not share your Gemini key or full tokens when reporting results.

Automated tests use a fake provider and make no paid/external calls. The user confirmed both the
CLI provider proof and the saved-case API Gemini assessment worked locally. The routing rule-change
demo has subsequently passed according to the user's live check.

Explicit final authorization and the durable LangGraph/mock submission flow are now implemented;
see SUBMISSION.md. Still pending: integrated voice/audio endpoints and playback, officer decisions,
notifications, API keys, complete audit browsing, frontend
integration checkpoints and pinned mock-server validation. RAG remains a bounded extension after
the core reporting flow works; the full dataset/knowledge collection will use a separate branch.
