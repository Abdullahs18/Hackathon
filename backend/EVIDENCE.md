# Private evidence increment

Migration `0003_evidence` adds protected original files to the existing complaint and consent
workflow. There are now 26 implemented operations out of 44 canonical planned operations.
The shared contract adds list, metadata and content retrieval; frontend/test owners still need
to review these additions and perform the pending integration checkpoints.

| Method | Path after `/api/v1` | Result |
| --- | --- | --- |
| POST | `/complaints/{id}/evidence` | Original metadata, 201; identical idempotent replay, 200 |
| GET | `/complaints/{id}/evidence` | Case evidence metadata |
| GET | `/complaints/{id}/evidence/{evidence_id}` | One evidence metadata record |
| GET | `/complaints/{id}/evidence/{evidence_id}/content` | Original bytes as an attachment |

Citizen owners may upload to editable drafts and read their own files. Helpers need an active
case-specific grant plus current `case_status` and `evidence` consent for every operation.
Officers may read only assigned submitted/review/resolved cases in the matching workspace,
with current workspace `case_status` and `evidence` consent. Officers cannot upload; Admin
does not bypass these checks. Withdrawal takes effect on subsequent requests, including retries.

Exactly one multipart `file` is accepted: PNG, JPEG, single-frame WebP or static unencrypted PDF.
Limits are 10 MiB/file, 20 megapixels/image, 25 pages/PDF and 10 files/case. Original bytes are
decoded/parsed in a bounded subprocess with a five-second timeout and two concurrent validators
per API process. Linux additionally applies CPU/memory limits. Encrypted, interactive, embedded
attachment and form PDFs are rejected. This is format validation, not antivirus, OCR or proof of
authenticity. Every record is labelled `not_authenticity_verified`.

Originals use random private names in the Docker `evidence_data` volume. Metadata includes
uploader, UTC time, original basename, actual MIME type, byte count and SHA-256; no storage paths
or public URLs are exposed. Downloads verify the stored size/hash before returning bytes and use
attachment, no-store and nosniff headers. Ordinary logs and audit event details exclude filenames,
incident narratives and file contents. Evidence operations add metadata-only audit events.

Use `Idempotency-Key` (1–128 characters) on uploads. Reusing a key for the same uploader, case,
basename, actual MIME and byte hash returns the existing record. Different content returns 409.
Optional `If-Match` uses the complaint ETag, e.g. `"1"`; stale new uploads return 412. Uploads append
server-managed `incident_data.evidence_ids`, increase the complaint version, invalidate any
generated review/draft and return `X-Complaint-Version`. Incident PATCH cannot clear or forge IDs.

File bytes and SQL cannot share one atomic transaction: known pre-commit failures remove the new
file; uncertain commit outcomes retain it so retries can recover committed metadata. A crash or
uncertain failed commit can leave private orphan files. Automated deletion/reconciliation is not
implemented; never remove files merely because a commit acknowledgement was lost. Back up and
restore the database and evidence volume together. Readiness checks storage writability as well
as database migrations. `docker compose down -v` destroys both demo volumes.

## Local check in Swagger

From the repository root, update and rebuild (keep the existing `.env` and passwords):

```powershell
git switch be
git pull origin be
docker compose up --build -d
docker compose ps -a
```

1. Open http://localhost:8000/docs. Sign in using POST `/auth/login` as `demo-citizen-1`
   and your existing `DASTAK_DEMO_PASSWORD`. Authorize with the returned token.
2. Create a draft with POST `/complaints`, e.g. `{"description":"Synthetic fake aid message"}`.
   Copy `complaint_id`.
3. POST `/complaints/{id}/evidence`: set a retry key such as `receipt-demo-1`, choose a small
   synthetic PNG/JPEG/WebP/PDF in the file picker and execute. Expect 201, the label above and a
   64-character SHA-256. Do not use real identifying evidence.
4. Repeat with the same key/file: expect 200 and the same `evidence_id`. List its metadata,
   retrieve the record and download `/content`. It must match the original. In PowerShell,
   `Get-FileHash -Algorithm SHA256 <path>` gives the local hash for comparison.
5. Restart with `docker compose restart api`; sign in again and download it. It must remain.
6. Sign in as the other Citizen or Admin and attempt that evidence read: expect 403. Follow
   CASE_ACCESS.md to grant a Helper access, adding `evidence` alongside `case_status` in consent.
   Check reading works, then withdraw the consent and check that reading returns 403.
7. A text file renamed `.png`, mismatched MIME or encrypted PDF returns 400; over-limit requests
   return 413. Normal PDFs containing active forms/links can also be rejected by the static policy.

Officer access is covered with synthetic submitted-case policy fixtures. Real citizen-approved
submission, routing, AI case integration, officer decisions, notifications and scoped API keys
remain pending; do not change database statuses to simulate completing those workflows.
