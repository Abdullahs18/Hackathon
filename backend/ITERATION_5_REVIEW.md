# Approval, fixed agent and simulated filing review

The user confirmed the preceding live routing tests passed. This increment implements the next
plan.md workflow: explicit citizen review/authorization, scoped service sharing, fixed LangGraph
steps, durable progress and simulated submission with confirmation. It does not complete the
whole MVP. The specification in plan.md remains unchanged.

## Behavior and safeguards

- Approval is separate from consent and from filing. It requires current CITIZEN_REVIEW, the
  exact reviewed revision, explicit true confirmation/authorization flags, valid pinned routing
  and every required recipient/purpose/data scope. Helpers/Admin cannot approve for a citizen.
- Approval binds facts, draft, evidence and route using a canonical fingerprint plus revision and
  consent snapshots. Withdrawal, narrowed sharing or replacement grants cannot restore stale
  authority. Every sensitive tool rereads account/owner/binding/current consent under case locks.
- Five allowlisted steps use actual LangGraph execution with SQL application checkpoints after
  each transition. No model chooses tools or security authority. Exact private tool inputs/results
  and metadata audit events are recorded; progress is recoverable across application restarts.
- Simulated identity/payment/requirements fixtures are repeatable and explicitly labelled. A
  missing lookup is not proof of fraud. Known conflicts stop without altering citizen facts;
  unknown required fields are never filled with invented values or ignored.
- One durable run per approval and one filing per case, with caller/key binding, transaction
  duplicate guards, short execution leases and transactional receipt/checkpoint persistence.
  Lost commit acknowledgements recover the saved result rather than creating another filing.
- A citizen's received receipt remains locally readable after withdrawal; new mock recipient
  reads are blocked. Local receipt verification does not perform another recipient disclosure.
  Revoking an approval cannot retract a filing that has already committed.
- Evidence IDs require consent and original integrity checks before filing. No public original
  URL, OCR, authenticity decision, real government or real payment integration is introduced.

## Verification and remaining work

Tests cover contract conformance, approval/version/flags, role and ownership denial, current
recipient scopes, withdrawal between tools, consent replacement, missing/conflicting fixtures,
unrecognized required fields, repeatable seeds, evidence integrity, safe retries, restart recovery,
lost approval/filing acknowledgements, expired leases and preserving old reviews through migration.
PostgreSQL CI additionally exercises competing execution leases. CI also runs all prior tests,
schema/model agreement, Compose validation, the container build and persistent evidence checks.
These checks establish the tested cases; they are not a guarantee against every possible defect.

SUBMISSION.md is the manual live checklist. The local graph uses application SQL checkpoints;
native LangGraph checkpoint saver/replay infrastructure is not claimed. Atomic side-effect safety
applies to these controlled in-process mock services; real recipients need separate reconciliation.

Case-integrated Urdu input/playback, officer decisions/legal lifecycle, notifications, scoped API
keys, full Admin audit/agent inspection and frontend/mock-server checkpoints remain pending.
Small synthetic fixtures accompany this feature on be; full source/data preparation and bounded
RAG remain later work on a separate branch. No authentic legal documents or personal data are
included in this commit.
