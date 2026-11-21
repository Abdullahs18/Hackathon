# Versioned demo routing and review readiness

Migration `0005` adds current routing pointers, immutable snapshots and a serialized catalog.
There are now 32 implemented operations out of 46 planned canonical operations. All destinations
are simulated workspaces; this does not connect to or file with a government service.

| Method | Path after `/api/v1/admin` | Purpose |
| --- | --- | --- |
| GET | `/routing-rules` | Current rules, ordered by priority and rule ID |
| POST | `/routing-rules` | Create a rule and its first immutable version |
| PATCH | `/routing-rules/{id}` | Create a new version for a meaningful edit |
| GET | `/routing-rules/{id}/versions` | Read immutable history |

All four operations require an active Admin account. Rule management grants no case/evidence
access or filing authority. Schemas remain in contracts/schemas.yaml. Supported matching values
are the five fraud subtypes in RuleCreate; `unclear` and `out of scope` are not routing targets.
They stay within the single suspected-online-financial-fraud workflow. Destinations must be one
of the existing seeded simulated workspaces. Name, explanation and justification must be nonblank;
text/priority bounds are enforced by the canonical schema. There is no arbitrary code, regex,
prompt or external URL execution in rule evaluation.

Active rules match the classifier's exact subtype. Lower priority numbers evaluate first;
ties use ascending rule_id. Rule updates take effect without redeployment or restart. A catalog
row lock serializes rule changes and route selection, so the decision uses one committed catalog
state. Model calls release case/catalog locks; routing is evaluated after the provider finishes
and the case version/account are rechecked.

## Immutable decisions and safe edits

First matching evaluation pins the snapshot ID and destination on the case, even if more facts
are needed before citizen review. Subsequent admin edits/deactivation do not rewrite that pin.
Correcting case facts preserves the pin; if a later classifier subtype conflicts with it, the
case goes to HUMAN_REVIEW with pinned_route_mismatch. There is no silent rerouting endpoint.
Legacy unknown/missing/inconsistent pins also fail closed with invalid_pinned_route and preserve
the historical identifiers. They do not count as a valid route or permit Officer assignment.

Historical rule versions reject UPDATE/DELETE at the database level; PostgreSQL also rejects
TRUNCATE. Current pointers reference stored versions. Complaint pins remain logical historical
references so migration does not discard legacy values; the resolver validates each used pin.

Optional Idempotency-Key on rule creation binds Admin and normalized creation payload. Identical
replay returns the current rule with 200; conflicting reuse returns 409. Creation otherwise
returns 201. Create/PATCH responses include an ETag containing the quoted current version UUID.
Use it as If-Match on PATCH: stale edits return 412. A semantic no-op returns the existing version
without manufacturing another snapshot. An uncertain creation save returns 503: retry with the
same key. After an uncertain edit save, reload the current rule before retrying.

## Readiness and structured review draft

Readiness follows plan.md: 0.35 classification confidence + 0.30 required-field completeness +
0.20 consistency + 0.15 routing match. Threshold decisions use the unrounded score; the returned
score is rounded for display. Description and money-loss indication are required; if money was
lost, positive amount and currency are required for automatic review preparation. Unknown dates,
payment methods, suspect details or transaction references do not become invented mandatory facts.

| Result | State |
| --- | --- |
| Missing/invalid/mismatched route, unresolved contradiction, possible duplicate, unclear/out-of-scope classification, or readiness below 0.60 | HUMAN_REVIEW |
| Otherwise missing required facts or readiness below 0.85 | NEEDS_INFORMATION, with Urdu clarification questions |
| Otherwise readiness at least 0.85 | CITIZEN_REVIEW, with a structured unconfirmed complaint_draft |

The review draft is assembled from saved citizen facts and the classifier subtype. It does not
copy unconfirmed extraction suggestions over citizen facts, invent a legal narrative, establish
guilt, declare evidence genuine or claim a completed filing. Its citizen_confirmed flag is false.
The response still requires_citizen_review=true and submitted=false. Final explicit authorization,
recipient consent checks and actual simulated filing are subsequent increments.

Meaningful fact/evidence edits invalidate current analysis and the review draft. Unchanged
pinned cases retain their saved result through later catalog changes. An unrouted result is
reevaluated when rules change; the validated current saved assessment is reused without another
Gemini call. Existing pre-routing assessments are upgraded this way on the next POST /analyze.
GET /analysis is a persisted snapshot read and does not silently recalculate old results.

## Local update and seed

Keep the existing .env and database/evidence volumes. From repository root:

```powershell
git switch be
git pull origin be
docker compose up --build -d
docker compose run --rm api python -m app.seed
docker compose ps -a
```

The explicit seed command installs five demo subtype rules targeting mock-financial-fraud only
when the catalog has no rules at all. Repeating it preserves existing rules, edits, deactivation
and passwords. It does not reset admin configuration or add default fallbacks to a custom catalog.
The small demo seeds support the feature; the full dataset/knowledge collection remains later work.

## Rule-change check in Swagger

1. Open http://localhost:8000/docs. Log in as demo-admin and authorize with its token.
   GET /admin/routing-rules; locate incident_type="fake aid scam". Note its rule_id, version A
   and destination. On a fresh default seed this is mock-financial-fraud.
2. Switch authorization to demo-citizen-1. Create case A with these synthetic facts. Leave an
   unknown transaction reference omitted, or use a new unique demo reference each time so the
   duplicate safeguard does not distract from this routing check.

```json
{
  "description": "مجھے جعلی امدادی پیغام ملا جس میں امداد حاصل کرنے کے لیے فیس بھیجنے کو کہا گیا۔ میں نے 1500 پاکستانی روپے بھیج دیے۔ تاریخ اور ٹرانزیکشن ریفرنس معلوم نہیں۔",
  "money_lost": true,
  "amount": 1500,
  "currency": "PKR",
  "incident_date": null
}
```

3. POST case A /analyze with {"allow_external_processing":true}. For a clear supported
   classification with sufficient readiness and no hard-stop flags, expect CITIZEN_REVIEW,
   routing version A and an unconfirmed draft. If clarification/handoff is returned, inspect
   classification, missing_fields and handoff_reasons rather than bypassing them.
4. Switch authorization back to demo-admin. PATCH the same rule:

```json
{"destination_workspace_id":"mock-digital-safety"}
```

   If using If-Match, enter version A wrapped in double quotes. Note the returned version B.
   A stale version gives 412; reload current rules before editing again.
5. Switch back to demo-citizen-1. Read case A and its analysis: destination/version A remain.
   Repeated analysis of unchanged A also keeps the same result.
6. Create a fresh case B with the same supported incident facts and no repeated reference.
   Analyze it: it should use destination mock-digital-safety and version B.
7. As Admin, GET /routing-rules/{id}/versions: both snapshots remain. Non-Admin raw requests to
   rule-management endpoints must return 403. Restart the API and check both decisions persist.
8. Optionally deactivate the rule. Existing case A keeps its original decision; a fresh matching
   case without another active matching rule goes to HUMAN_REVIEW with no_matching_rule.

Do not edit database statuses to simulate submission. Officer assignment still requires a
submitted/review case, a valid pinned snapshot and current workspace consent. Automated policy
fixtures explicitly synthesize submitted states. The citizen-authorized simulated submission flow
is now implemented separately; follow SUBMISSION.md to create a submitted case through the API.

User-confirmed live Gemini assessment succeeded before this increment. Automated routing tests
use a fake provider, exercise real API/DB policies and make no paid calls. The live Admin rule-change
demo above has since passed according to the user's live check. Frontend rule editor integration and contract-owner
review remain team checkpoints; backend conformance alone does not claim those passed.
