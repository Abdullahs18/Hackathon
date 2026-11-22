# Review before case-access implementation

Reviewed foundation/voice commit `dbddc65546d318089a29d7d30795d4989c2fbe11` against plan.md,
then implemented the case-access increment. Work stays on branch `be`.

## Evidence and findings

- The baseline rerun passed all 77 tests. The prior CI had passed PostgreSQL, Compose and image build.
- The user confirmed local Docker readiness, migration/seed success, login/role checks and the live
  Gemini `gemini-3.1-flash-lite` plus gTTS proof. Their supplied synthetic result preserved 1500 PKR,
  an unknown date, citizen-review-required and unsubmitted flags. Playback quality is user-confirmed,
  not independently auditioned here. Identifier spelling/spacing still needs citizen confirmation.
- This satisfies the initial provider proof, not the plan's complete persisted voice-to-complaint flow.
- Swagger's implemented-route projection omitted path-level parameters. That was not exercised by
  the original parameter-free routes; it is fixed for new complaint/consent paths and contract-tested.
- Readiness previously checked only the users table. It now verifies the current Alembic heads,
  preventing an out-of-date database from being advertised as ready after schema changes.
- Consent had recipient/purpose/scope strings without enforceable shared vocabulary, and there were
  no helper grant-management or officer assignment contracts. These are now explicit shared schemas
  and operations, with backend and test changes in the same increment.
- Draft retries lacked a specified mechanism for creation duplicates and lost updates. Optional
  citizen-bound creation keys, saved timestamps/versions, ETag and If-Match now define that behaviour.
- The frontend needs CORS access to If-Match/ETag; both request and exposed response headers are set.

## Access design checked during this increment

1. Citizen ownership is derived from authentication; posted owner/status/workspace values cannot
   bypass canonical request validation. Omitted fields and explicit null have different PATCH semantics.
2. Helpers require a specific active grant plus current recipient/purpose consent. Lists and reads
   filter incident fields by scope. Updates outside scope fail; helpers cannot confirm corrections.
3. Consent withdrawal/scope or recipient changes affect subsequent reads and writes. An independent
   helper grant never substitutes for consent. A partial unique index prevents overlapping active
   records for the same case, recipient and purpose while retaining withdrawn history.
4. Officers require a submitted, assigned case and matching account/assignment/case workspace, plus
   current workspace consent. Even a forged mismatched assignment cannot grant cross-workspace access.
5. Admin assignment exposes only assignment metadata and cannot submit a draft or read its incident.
6. PostgreSQL row locks serialize case edits and sharing changes; authorization is re-evaluated from
   current DB records after locks. Concurrent creation keys and conditional edits have PostgreSQL tests.
7. Migration 0002 adds tables without rewriting the audit table or its immutable triggers. Upgrade
   tests preserve existing password hashes/audit history and re-check readiness and append-only guards.
8. Incident narrative/references are excluded from ordinary logs and draft-write audit metadata.
   Consent/grant/assignment changes are recorded transactionally with their structured scope/IDs.
9. Scoped write responses are snapshotted before releasing the case lock. A regression simulates
   consent narrowing and a private update immediately after commit, ensuring an expired ORM object's
   subsequent reload cannot leak newly private data into the earlier authorized response.

## Current completion boundary

Foundation, initial live provider proof, draft persistence and core case-access controls are now
implemented increments. They do not mean the complete plan is finished. Evidence, case-integrated
AI, readiness/handoff, versioned routing, LangGraph, explicit submission approval, simulated filing,
officer decisions, notifications, API keys and complete audit browsing remain. Full tenant workflow
demonstration still needs routing/submission; current officer policy tests use synthetic fixtures.

The frontend/testing owners still need to review contract changes and perform the real auth/case
integration checkpoints. A pinned OpenAPI mock server and its verified fixture responses remain
unresolved work; CI against the real app does not substitute for those requirements.

See CASE_ACCESS.md for the implemented routes, consent semantics and local manual checks. The commit
and GitHub Actions results provide the final regression evidence for this increment. Never mark a
future workflow feature complete merely because its schema already exists.
