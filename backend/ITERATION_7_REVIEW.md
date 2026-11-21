# API keys and Admin trace review

This increment implements the remaining five operations in the prior canonical contract:
API-key issue/list/revoke and Admin audit/agent inspection, plus three JWT-only self-service
key operations. Self-issuance prevents Admin key management from becoming an impersonation path.
This completes the current REST
operation list, not the whole MVP: case-integrated Urdu audio and integration/stabilization
checkpoints remain pending. plan.md is unchanged.

Keys are bound to the issuing active principal, carry role-appropriate coarse resource scopes,
expire within 90 days, and store a hash of a random secret. JWT-only self-issuance prevents scoped
credentials from delegating wider privileges and prevents Admin from minting another user's key.
Metadata never returns hashes, secrets or private
principal/issuer bindings. Stable creation commands prevent duplicate issuance; raw secrets are
never replayed after a lost response. Revocation is idempotent and checked on subsequent requests.

JWT and API-key callers share all existing case/role/workspace/consent policies. Shared evidence
operations accept the corresponding role's scope. Agent tools recheck the current key before
each step; interrupted runs remain recoverable by their owner. Provider results obtained after
key revocation are discarded. The raw credential stays out of graph state, audit and normal logs.

Admin inspection exposes metadata projections with fixed explanations and allowlisted outcomes.
It excludes private prose, evidence details, credentials, raw tool payloads and command/receipt
references. SQL agent queries select only fields needed by the safe view. Unknown legacy values
are redacted; immutable audit rows are not rewritten. Cursor pagination bounds each response and
preserves stable ordering, including tied timestamps.

API_KEYS_AND_AUDIT.md records exact request examples, Swagger credential switching, scope
boundaries and recovery steps. Contract/schema changes, migration 0008, implementation and tests
ship together. Testing covers normal JWT compatibility, invalid credentials/scopes/expiry,
role/owner/consent denial, inactive accounts, key revocation during agent/provider work, evidence
permissions, lost issuance acknowledgements, API-key Officer review, privacy projections and
pagination. PostgreSQL CI additionally checks concurrent key creation; the full suite also runs
migrations, immutable history, Compose validation, the image build and evidence persistence.

Next work is case-integrated voice and spoken responses, followed by frontend/mock-server checks
and stabilization. Authentic source collection and bounded RAG remain an approved follow-on
with a separate data branch. This increment includes no real identity/payment data, authentic
legal documents, external messaging or live government integrations.
