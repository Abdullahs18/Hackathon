# Officer review and in-app notifications

Migration 0007 adds an append-only review conversation and persisted notifications. The preceding
submission flow passed the automatic preflight; the user reported checking part of it locally.
All services and decisions here remain part of the simulated prototype.

## Start and exercise

From the repository root, with Docker Desktop running:

```powershell
git switch be
git pull --ff-only origin be
docker compose up --build -d
docker compose run --rm api python -m app.seed
```

Use an existing genuinely submitted case from SUBMISSION.md, or create one through that flow.
No manual database/status changes are needed. A case with withdrawn workspace consent must have
current consent restored before an officer can access it. Restoring consent does not silently
restore a stale citizen filing approval; these are separate permissions.

1. As `demo-admin`, call `POST /api/v1/admin/complaints/{id}/assignment` with
   `{"officer_id":"demo-officer-financial"}` for a case pinned to `mock-financial-fraud`.
   For `mock-digital-safety`, use `demo-officer-digital` instead. Assignment returns metadata;
   Admin still cannot inspect the raw case or its review conversation. Repeating the same
   assignment does not create another assignment notification.
2. Log in as the assigned Officer. `GET /api/v1/officer/complaints/{id}` returns the current
   case and its quoted `ETag`, for example `"9"`. Use that actual value in the required
   **If-Match** header. Choose a stable **Idempotency-Key**, such as `officer-request-001`.
3. Call `POST /api/v1/officer/complaints/{id}/actions` with:

   ```json
   {"action":"request_information","reason":"Please clarify how you received the message."}
   ```

   Expected: `OFFICER_REVIEW` and `review_outcome: information_requested`. Repeat the same
   key, body and original If-Match: no new event or notification is created. A replay returns
   the current permitted case view; it may reflect later review decisions.
4. As the owning Citizen, read `GET /api/v1/complaints/{id}/review-history` and
   `GET /api/v1/notifications`. The detailed request is in history, not in notification prose.
   Read the latest case version, choose a new reply key, and call
   `POST /api/v1/complaints/{id}/review-response` with its current If-Match:

   ```json
   {
     "message":"The synthetic message arrived by SMS.",
     "allow_recipient_sharing":true
   }
   ```

   Expected: `review_outcome: information_received`. This explicitly shares a supplement with
   the currently authorized pinned workspace. It preserves the original facts, evidence,
   approved filing and reference. It does not create another simulated complaint or silently
   change a previously filed amount/date/reference. No Gemini call is needed for a review reply.
5. As Officer, read the updated case/ETag. Send `{"action":"accept","reason":"The synthetic report is ready for review."}`
   with a fresh command key and current If-Match. Then read the new version and send
   `{"action":"close","reason":"The simulated review is complete."}` with another fresh key.
   Expected final state: `RESOLVED`, `review_outcome: closed`, same filing reference.
6. `GET /api/v1/officer/complaints/{id}/review-history` shows the ordered conversation.
   `POST /api/v1/notifications/{notification_id}/read` marks only the caller's notification read;
   repeating it is safe. Notifications persist across app restarts.

## Legal transitions

The workflow status stays separate from the detailed review outcome:

| Current outcome | Permitted action | New outcome / workflow status |
| --- | --- | --- |
| pending | request_information, accept, reject, escalate | information_requested, accepted, rejected, escalated |
| information_requested | citizen response | information_received / OFFICER_REVIEW |
| information_requested | escalate | escalated / OFFICER_REVIEW |
| information_received | request_information, accept, reject, escalate | corresponding outcome |
| accepted | close, escalate | closed or escalated |
| escalated | request_information, accept, reject | corresponding outcome |
| rejected or closed | no new decisions | terminal / RESOLVED |

All nonterminal review outcomes use `OFFICER_REVIEW`. Rejection and closure use `RESOLVED`.
Acceptance means accepted for review, not proof of fraud or a promise of recovery. Escalation
flags review within the original workspace; it does not silently transfer data or change routing.
Closure requires prior acceptance. An outstanding information request must be answered before
acceptance/rejection; the officer may instead escalate it. Invalid transitions return 409.

## Access and recovery checks

- Actions and full conversation reads require the assigned active Officer, matching workspace,
  a valid pinned rule, `case_status` plus either broad `incident_data` consent or individual scopes
  for every filed draft field (incident type, date, description, amount, currency, payment method,
  transaction reference and suspect details), and `evidence` consent
  when evidence is attached. Status-only consent permits the scoped status view and generic
  notifications, not decisions or unfiltered review prose. Helpers cannot decide or read this
  full conversation; the owning Citizen can always recover their own received history.
- Withdraw the workspace consent as Citizen. Officer case/history/actions and citizen sharing
  replies are blocked. Officer notifications disappear from future lists and their previously
  known notification read URLs return 403. The owner's case/history/notifications remain visible.
- Reassign to a different active Officer in the same workspace: the previous Officer loses
  case and historical notification access. A helper whose grant or scoped consent is revoked
  similarly loses historical notification reads. Admin gets no raw-case notification bypass.
- No-op consent changes preserve the existing grant and approved consent snapshot. Meaningful
  changes invalidate filing approval as before; consent notifications are committed with them.
- Required If-Match detects stale decisions (412). Required command keys bind caller, case,
  exact request body and reviewed version. Changed reuse is 409. For a lost response, recover
  the case/history and retry the original body, key and original If-Match. Previously committed
  events replay before the old version is rejected. Current access is checked even on replay.
- Case version/outcome, immutable event, metadata audit record and notifications commit together.
  A lost commit acknowledgement is 503; retrying cannot produce a second decision/notice. Failed
  transactions do not produce a successful notification. Read-marker retry is also idempotent.
- Review metadata advances the receipt's expected case revision without changing the approved
  payload or consent snapshot. A legitimate status change does not break confirmation lookup;
  withdrawal or changed consent still blocks new simulated-recipient reads.

Notifications cover confirmed submission, stopped agent runs, assignment, every review decision,
citizen replies and relevant consent grant/change/withdrawal. Messages contain no incident facts,
transaction references, evidence names, officer reasons or citizen reply text. Only the active
owner and currently authorized helpers/assigned Officer receive or read case notifications.
Historical notifications are not synthesized during migration; future events generate them.

Automated tests cover the API workflow, permissions, history immutability, receipt preservation,
notification ownership and revocation, legal transitions, safe retry, lost responses, migration
and PostgreSQL competing commands. Frontend integration and live Gemini/audio behavior remain
separate checks. API keys and safe Admin trace inspection are now implemented; see
API_KEYS_AND_AUDIT.md. Integrated voice remains pending. Full data/RAG preparation stays on its
later separate branch.
