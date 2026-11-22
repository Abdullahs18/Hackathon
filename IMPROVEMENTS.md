# Rubric improvement acceptance plan

Work branch: `integration/fe-be`. Baseline: `b4c6353`.

The baseline has successful PostgreSQL/SQLite/Docker CI and 18 passing browser workflows.
The current audit additionally visits all four roles and both officer workspaces at desktop
and mobile sizes. No role-page exceptions or horizontal overflow were found. The Urdu intake
still contains English instructions. Admin user creation suggests an invalid short password.
Human-review wording currently implies a transfer without an acknowledged recipient.

## Delivery checks

- [x] Correct user-creation defaults, validation and modal errors; verify actual user creation.
- [x] Explicit citizen-requested human help, active scoped Helper access, acknowledgment and
      a saved response. Helpers cannot authorize or file. Withdrawal blocks the next helper action.
- [x] Citizen-readable prepared complaint and actual recorded LangGraph steps, timestamps,
      skipped/blocked outcomes and real confirmation; preserve owner/Admin privacy boundaries.
- [x] Urdu critical-path instructions, form labels and recovery actions; readable mobile and RTL UI.
- [x] Live-provider evaluation command and 36 labelled synthetic scenarios; report field accuracy,
      unsupported additions, uncertainty and expected handoff decisions without conflating fakes
      with model evaluation. Preserve original expected data in reports.
- [x] Reproducible startup, private storage checks, deployment/health verification and demo guide.
- [x] Usability script, time/error recording template and reproducible complete-role demonstration.
- [ ] Full contract, SQLite, PostgreSQL, browser and Docker regression on the final commit.

Authentic-source RAG remains a separate corpus/data workstream. Add it only after core acceptance
and source verification; do not label synthetic requirement fixtures as authoritative guidance.
The citizen keeps final approval. Do not introduce government browser automation, OCR, new roles
or automatic permission/filing decisions as substitutes for these acceptance checks.
