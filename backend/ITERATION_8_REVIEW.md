# Saved-case Urdu voice review

This increment implements the plan's voice intake, Urdu response and citizen correction loop
in the persisted complaint workflow. Seven canonical operations, migration 0009, provider scopes,
durable transcript checkpoints and private MP3 responses ship together. There are 64 current
canonical operations. plan.md remains unchanged; commits stay on be.

Audio is bounded and content-validated, including real browser WebM normalized by bundled FFmpeg.
Raw recordings are transient; transcription is committed before extraction so a failed extraction
can resume without another upload or transcription. Short fenced SQL leases coordinate retries.
Provider calls run outside case locks; current account, key, version and exact consent snapshot
are checked before disclosure and before saving results. Cached results and command fingerprints
recover lost acknowledgements without reapplying confirmed patches.

AI extraction never edits a case automatically. Citizen confirmation applies a selected explicit
patch, preserves original/corrected transcripts and invalidates prior analysis when facts change.
Unknown facts remain missing, and model evidence/correction/authorization fields are rejected.
The existing text assessment controls readiness and routing. Spoken follow-ups use current saved
analysis; review speech uses deterministic Urdu built from saved facts, including explicit no-loss
and unknown date/reference cases. Final filing still needs separate citizen authorization.

Owner-only speech is version-bound, integrity-checked and served through an authenticated binary
endpoint. Helpers, Officers and Admins receive no raw voice access. Scoped keys share those gates.
Consent withdrawal and key/account changes block future provider work. Admin audit projections
show fixed metadata, without transcript, spoken prose or recording bytes.

Regression coverage includes the full voice-to-confirmation-to-analysis-to-spoken-review-to-mock
filing path, follow-up answers, current consent/version enforcement, malformed multipart/audio,
real WebM/Ogg decoding, model field injection, revoked credentials, process restart recovery,
expired leases, stale speech, corrupted MP3 cache and lost save/confirmation acknowledgements.
PostgreSQL additionally exercises concurrent voice execution. Migration/model agreement and
canonical response/scope coverage are checked alongside the existing backend regression suite.
CI also decodes synthetic browser audio in the built Linux image as its non-root application user.

Automated provider behavior uses fakes. The original live Urdu provider proof was user-confirmed;
this integrated flow still needs the opt-in live command and listening check in INTEGRATED_VOICE.md.
Frontend wiring and combined browser acceptance, pinned mock-server verification and final
stabilization remain pending. Bounded RAG and the authentic knowledge collection are subsequent
work, with data prepared on a separate branch. No authentic source files are added here.
