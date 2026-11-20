# Pre-analysis audit and saved-case assessment review

## Existing build audit

Baseline `5c1cffb` passed the local regression run: 140 passed and three PostgreSQL-only checks
skipped. Its previous CI run also passed all 143 PostgreSQL tests, contract checks, Docker build,
Compose validation and private-volume application-user access. The user separately confirmed
local evidence upload/download/retry checks. These establish tested behavior, not a guarantee
against all defects or a claim that the end-to-end MVP is complete.

Review covered canonical/runtime OpenAPI agreement, JWT/current-account permissions, case
ownership, Helper grants/current scoped consent, Officer assignment/workspace checks, draft
version/retry semantics, migrations, immutable audit records, provider failure handling, and
private original evidence storage. Admin retains no automatic incident/evidence bypass.

## Reproduced issue and fix

A PDF containing a Link annotation with a GoToE action passed upload validation, despite the
documented static-PDF policy. A new regression test reproduced 201 where rejection was required.
The parser now rejects all action dictionaries through the /A key and additional active widget,
media and associated-file structures. This closes that tested gap; it is not an antivirus,
forgery-detection or universal PDF safety guarantee. Existing accepted files are not silently
rewritten or deleted; authorized downloads remain attachments with integrity checks and no-store.

CI storage verification now writes with UID 10001 in one disposable container and verifies the
same original bytes from a second container using the named volume before cleanup. This checks
persistence across container recreation as well as permissions.

## New increment and plan alignment

CASE_ANALYSIS.md describes the two new owner-only assessment operations and migration 0004.
Provider permission is explicit. Extraction stays unconfirmed and never overwrites citizen
facts. Saved version/account checks reject outputs made stale by concurrent changes. Cached
results, preserved historical records, deterministic contradiction/duplicate safeguards and
Urdu follow-up questions move the text workflow forward without granting filing authority.

Routing does not exist yet, so its score contribution is zero and routing_unavailable forces
HUMAN_REVIEW. This honors the plan's no-match hard stop and avoids pretending the review/filing
workflow is complete. Owners can correct facts in that state, returning to DRAFT and invalidating
the old result. No route, formal draft, citizen confirmation or submission is invented.

Shared contracts are extended with the implementation/tests in the same commit. Frontend/test
owner review, real frontend checkpoints and pinned mock-server conformance remain pending.
The CLI live voice proof remains user-confirmed; the new API assessment still needs a live local
Gemini check. Automated tests use fake providers, including real concurrency/revalidation paths.

The user-approved later RAG extension and separately branched full data collection are tracked
as follow-on work. No knowledge documents or real personal data are added to this backend commit.
