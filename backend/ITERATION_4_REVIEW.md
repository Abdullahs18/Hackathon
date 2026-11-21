# Routing and review-readiness increment

The user confirmed the saved-case Gemini assessment from ad39606 works locally. This increment
adds deterministic versioned routing and structured review preparation; it does not claim the
agent/submission, integrated voice, notification or final authorization features are complete.

## Delivered behavior

- Four Admin rule operations: list, create, revise and immutable history. Shared request bounds,
  exact subtype matching, two simulated destinations, priority and deterministic tie ordering.
- Migration 0005 with a catalog lock, current pointers and immutable DB snapshots. Meaningful
  changes create snapshots; no-ops and safe creation replays preserve the existing version.
- First selection pins the exact snapshot and destination to the case. Later rule updates or
  deactivation affect unrouted cases, preserving prior decisions. Conflicting classifier results
  and unknown legacy pins fail closed for review; they never silently switch destinations.
- Route-aware readiness, mandatory-fact validation and hard-stop precedence. Complete consistent
  cases can reach CITIZEN_REVIEW with an unconfirmed structured draft from saved facts. Unknown
  optional dates/references remain unknown; citizen confirmation and submission remain false.
- Reuse of saved validated assessments when rules become available, including pre-routing
  records. No extra Gemini call is needed to reevaluate the same unchanged incident.
- Explicit repeatable demo rule seeds on an empty catalog. Existing edits, inactive rules,
  case/evidence data, user passwords and audit history are preserved.
- Officer assignment/access now requires a real immutable snapshot matching the pinned workspace,
  strengthening the previous nonempty-identifier gate. Synthetic submitted-case tests use real
  rule snapshots while clearly identifying the manually synthesized submission state.

## Verification scope

The local affected suites cover normal review, missing facts, low/moderate readiness, contradictions,
possible duplicates, unsupported classifications, exact routing, priorities/ties, no match, destination
changes, deactivation, historical pins, classifier mismatch, legacy recovery, rule edits during a
provider call, safe retries, uncertain commit recovery, role denial, schema conformance, immutable
UPDATE/DELETE and migration/model agreement. PostgreSQL CI additionally checks conditional concurrent
edits, concurrent creation retries and immutable TRUNCATE. Full CI runs all prior auth/voice/case/
evidence tests, Compose validation, Docker build and two-container evidence persistence checks.

These are verification boundaries, not a guarantee against every defect. ROUTING.md provides
the separate live Admin rule-change check; automated fake-provider tests do not claim that the
frontend editor or that live demo has already been exercised. Shared contract/implementation/tests
ship together; frontend/test-owner review and pinned mock-server verification remain checkpoints.

Full data/knowledge collection stays on a later separate branch. Source-backed RAG remains a
bounded follow-on after the core workflow. No uploaded legal documents, personal records or
credentials are included in this backend commit.
