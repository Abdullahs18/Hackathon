# Backend implementation map

Follow plan.md and the canonical contracts. Foundation through citizen-authorized simulated
submission is implemented; the complete end-to-end MVP remains in progress. Work only on `be`.

| Increment | Backend deliverables | Required verification | State |
| --- | --- | --- | --- |
| Foundation and login | FastAPI, configuration, PostgreSQL, Alembic, users/workspaces, seeds, JWT, Admin users, health, auth audit foundation | Contract validity, migrated schemas, login failures, role restrictions, seed repeatability, audit immutability | Implemented; see test/CI results for verification |
| Contract/voice proof | Agree voice requests/responses; Urdu STT and spoken summary proof; pin mock-server tooling | Real Urdu input and output, provider failure paths, mock contract validation | Gemini/gTTS CLI and user-confirmed live Urdu proof complete; saved-case integration implemented. Pinned mock-server verification remains pending. See INTEGRATED_VOICE.md. |
| Complaints and access | Complaint lifecycle, draft create/read/patch/list, helper grants, assignments, access policies | Ownership, active grants, officer assignment and cross-workspace raw API denial | Drafts, grants, assignment, scoped access, officer decisions, legal outcomes and citizen supplements implemented. See CASE_ACCESS.md and OFFICER_REVIEW.md. |
| Evidence | Private image/PDF originals, content/type/size validation, SHA-256 metadata, protected retrieval | Invalid file content, unauthorized reads, hash preservation | Implemented with canonical retrieval extensions; see EVIDENCE.md. Frontend contract review/integration pending. |
| Consent foundations | Recipient/purpose/data scopes, view/grant/change/withdraw, current authorization checks | Immediate withdrawal blocks helper/recipient/evidence reads; Admin has no bypass | Implemented for case/evidence/assignment reads and simulated service/agent actions, including invalidation of approved consent snapshots. See SUBMISSION.md. |
| AI flow | Voice interfaces, extraction, classification, readiness, follow-ups, formal draft | Structured-output errors, unknown values, thresholds, contradiction/duplicate hard stops | Saved-case assessment, classification, route-aware readiness, Urdu follow-ups, persisted draft and explicit final citizen authorization implemented. User confirmed the live Gemini API assessment. Integrated voice APIs implemented; frontend playback and integrated live-provider verification remain pending. See INTEGRATED_VOICE.md. |
| Routing | DB rules, immutable versions, deterministic evaluation, Admin edit endpoints | New cases follow updated rules, old cases retain pinned versions, no-match handoff | Implemented with immutable DB history, serialized selection, safe edit/retry headers and repeatable demo seeds. User confirmed the live routing checks passed. See ROUTING.md. |
| Agent and mock services | Persisted LangGraph transitions, allowlisted typed tools, identity/payment/requirements fixtures, authorization gate, submission/confirmation | No submission without citizen approval/current consent, atomic idempotency, conflict and uncertain-timeout recovery | Implemented with application SQL checkpoints, fixed graph steps, lease-based resume and atomic local mock receipts. User performed partial local checks; automatic submission preflight passed. See SUBMISSION.md and ITERATION_5_REVIEW.md. |
| Officer review and notifications | Legal transitions, append-only conversation, owner replies, notifications with current access gates | Request/accept/reject/escalate/close, receipt preservation, revoked access, retry and concurrent commands | Implemented; see OFFICER_REVIEW.md and ITERATION_6_REVIEW.md. |
| API keys and Admin inspection | JWT-only self-issued credentials, role/resource scopes, expiry/revocation, safe trace projections | No cross-principal issuance, expired/revoked keys, current case/consent policies, privacy and cursor pagination | Implemented; see API_KEYS_AND_AUDIT.md and ITERATION_7_REVIEW.md. All current canonical operations are implemented. |
| Integrated voice | Persisted Urdu input and spoken follow-ups/review in the actual case flow | End-to-end audio, explicit provider permission, saved-version/consent checks, connection recovery | Backend implemented with seven canonical operations, transcript checkpoints, explicit confirmation, protected MP3 and migration 0009. Automated tests use fake providers plus actual bundled WebM/Ogg decoding; integrated live-provider and frontend checks remain pending. See INTEGRATED_VOICE.md and ITERATION_8_REVIEW.md. |
| Stabilization | Clean startup/seeds, complete contract suite, surprise cases, README demo | Full live citizen/helper/officer/admin story and final plan.md definition of done | Pending |

## Decisions carried forward

- One category: suspected online financial fraud. Two pre-seeded simulated workspaces.
- Modular monolith; React frontend is a separate workstream.
- API keys must be hashed, scoped, expiring and revocable, and bound to a principal.
- No LLM permission or unrestricted submission decisions. Never infer citizen authorization.
- Later extension approved: bounded source-backed RAG after the core reporting flow works; retain deterministic routing and filing permissions. Prepare the full dataset/knowledge collection on a separate branch from current be; small feature fixtures stay with tests.
- Keep original evidence private and label it not authenticity-verified; no OCR or forgery detection.
- Reconcile stored agent state against current consent before every sensitive action.
- Readiness: 0.35 classification + 0.30 completeness + 0.20 consistency + 0.15 route match.
  At least 0.85 permits citizen review; 0.60–0.84 asks for information; below 0.60 or any hard stop
  goes to human review. These are prototype policies, not proof of fraud.
- Idempotency binds principal, complaint and approved payload. Identical replay returns prior
  confirmation; conflicting key reuse is 409. Check by key before retrying an uncertain result.
- Ordinary application logs exclude bodies, credentials, URLs, evidence and personal information.
- Public contracts now define voice input, corrections, extraction retries and spoken sources.
  Helper-grant management, officer assignment, complaint review history and draft saved-version metadata are defined.
  Do not silently add frontend-facing endpoints without updating and reviewing contracts.
- Contract fields describe API records, not every private database field. Password hashes and
  API-key principal bindings are private persistence concerns and must not leak in responses.

## Integration checkpoints

Hour 8: exercise real auth/me through the frontend and validate contract responses.
Hour 20: exercise the ready complaint/analysis/voice endpoints and validate contract responses.
Unavailable endpoints are explicitly recorded; do not claim a checkpoint passed before the team
has performed it. The user has completed the initial live provider proof. Saved-case voice APIs
are implemented; their integrated live-provider check and the frontend checkpoints remain pending.
