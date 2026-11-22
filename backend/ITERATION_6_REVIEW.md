# Officer decisions and notification increment

The user asked for automatic completion of the remaining submission checks and continuation.
The preflight reran submission safety/recovery tests: 33 passed, one PostgreSQL-only skip.
The preceding commit's full PostgreSQL and Docker CI had passed. The user reported partial
local testing; this is not recorded as a complete live frontend or audio checkpoint.

This increment implements plan.md officer actions and in-app notifications. Explicit commands
support request-information, accept, reject, escalate and close with legal outcome transitions.
Citizen supplements answer information requests through a separate append-only conversation.
Original filing facts, evidence IDs, routing snapshots and simulated receipts are preserved.

Officer decisions require assignment, workspace, recorded filing and current full review scopes.
The server rejects stale versions, missing reasons, missing retry keys and terminal-state edits.
Review events are immutable in SQLite and PostgreSQL, including PostgreSQL TRUNCATE protection.
Command and case locks serialize concurrent decisions. Events, version/status, audit metadata and
generic notifications are transactional, including response-loss recovery without duplicates.

Notifications are persisted for submission, assignment, review, clarification and consent changes.
Generation and reads check current permissions. Withdrawal/reassignment/revoked helper access
blocks historical notification URLs as well as lists. Admin cannot bypass case consent. Notification
text excludes facts and free-form review messages; full conversation reads require full review scope.

OFFICER_REVIEW.md documents request bodies, retry headers, the legal transition table and local
walkthrough. Updated canonical schemas ship with implementation and contract tests. Automated
coverage includes genuine API filing through closure, citizen response, immutable history,
receipt compatibility, role/workspace denial, narrowed/withdrawn consent, reassignment, read-marker
ownership/idempotence, lost commit acknowledgements, migration preservation and PostgreSQL races.

Remaining work: scoped expiring/revocable API keys; complete Admin audit/agent inspection without
raw-data bypass; case-integrated voice/playback; frontend/mock-server checkpoints and stabilization.
Source-backed RAG remains the approved bounded follow-on after the core reporting flow. No full
knowledge/data branch or authentic source documents are committed in this backend increment.
