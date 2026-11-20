# Backend implementation map

Follow plan.md and the canonical contracts. The current commit is a foundation/authentication
increment; it is not an end-to-end MVP. Work only on `be`.

| Increment | Backend deliverables | Required verification | State |
| --- | --- | --- | --- |
| Foundation and login | FastAPI, configuration, PostgreSQL, Alembic, users/workspaces, seeds, JWT, Admin users, health, auth audit foundation | Contract validity, migrated schemas, login failures, role restrictions, seed repeatability, audit immutability | Implemented; see test/CI results for verification |
| Contract/voice proof | Agree voice requests/responses; Urdu STT and spoken summary proof; pin mock-server tooling | Real Urdu input and output, provider failure paths, mock contract validation | Gemini/gTTS adapters and local CLI implemented; user live proof and mock-server tooling remain pending. See VOICE_PROOF.md. |
| Complaints and access | Complaint lifecycle, draft create/read/patch/list, helper grants, assignments, access policies | Ownership, active grants, officer assignment and cross-workspace raw API denial | Next |
| Evidence | Private image/PDF originals, content/type/size validation, SHA-256 metadata, protected retrieval | Invalid file content, unauthorized reads, hash preservation | Pending; retrieval endpoint requires contract extension |
| Consent foundations | Recipient/purpose/data scopes, view/grant/change/withdraw, current authorization checks | Immediate withdrawal blocks helper/recipient/evidence reads; Admin has no bypass | Implement alongside access-sensitive case operations, not as a late security patch |
| AI flow | Voice interfaces, extraction, classification, readiness, follow-ups, formal draft | Structured-output errors, unknown values, thresholds, contradiction/duplicate hard stops | Pending |
| Routing | DB rules, immutable versions, deterministic evaluation, Admin edit endpoints | New cases follow updated rules, old cases retain pinned versions, no-match handoff | Pending |
| Agent and mock services | Persisted LangGraph transitions, allowlisted typed tools, identity/payment/requirements fixtures, authorization gate, submission/confirmation | No submission without citizen approval/current consent, atomic idempotency, conflict and uncertain-timeout recovery | Pending |
| Completion | Officer actions and legal transitions, notifications, scoped API keys, audit/agent inspection, safe draft retries | Expired/revoked keys, least privilege, notification ownership/current consent, historical trace, connection recovery | Pending |
| Stabilization | Clean startup/seeds, complete contract suite, surprise cases, README demo | Full live citizen/helper/officer/admin story and final plan.md definition of done | Pending |

## Decisions carried forward

- One category: suspected online financial fraud. Two pre-seeded simulated workspaces.
- Modular monolith; React frontend is a separate workstream.
- API keys must be hashed, scoped, expiring and revocable, and bound to a principal.
- No LLM permission or unrestricted submission decisions. Never infer citizen authorization.
- Keep original evidence private and label it not authenticity-verified; no OCR or forgery detection.
- Reconcile stored agent state against current consent before every sensitive action.
- Readiness: 0.35 classification + 0.30 completeness + 0.20 consistency + 0.15 route match.
  At least 0.85 permits citizen review; 0.60–0.84 asks for information; below 0.60 or any hard stop
  goes to human review. These are prototype policies, not proof of fraud.
- Idempotency binds principal, complaint and approved payload. Identical replay returns prior
  confirmation; conflicting key reuse is 409. Check by key before retrying an uncertain result.
- Ordinary application logs exclude bodies, credentials, URLs, evidence and personal information.
- Existing public contract still needs decisions for voice, evidence reads, helper-grant management,
  officer assignment, complaint history and recoverable citizen progress beyond the minimal record.
  Do not silently add frontend-facing endpoints without updating and reviewing contracts.
- Contract fields describe API records, not every private database field. Password hashes and
  API-key principal bindings are private persistence concerns and must not leak in responses.

## Integration checkpoints

Hour 8: exercise real auth/me through the frontend and validate contract responses.
Hour 20: exercise the ready complaint/analysis/voice endpoints and validate contract responses.
Unavailable endpoints are explicitly recorded; do not claim a checkpoint passed before the team
  has performed it. Provider credentials and a real Urdu sample are still needed for live voice proof.
