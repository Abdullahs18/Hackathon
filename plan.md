# Dastak — Making Public Services Accessible to Everyone

**Tagline:** You explain the problem. We help you take action.

> **Prototype notice:** Dastak is a hackathon prototype. It is not an official government service. All identity, payment, data, and complaint-submission services in the demo are simulated. Do not enter or use real personal data.

## 1. Product definition and scope

Dastak is an AI-powered assistance layer that helps people report suspected online financial fraud through an accessible, guided process. It does not replace a government portal or claim to be an official government service.

**Target user statement**

> We help a shopkeeper/any individual targeted by an online financial scam report it, even though the reporting process is confusing and their internet connection may be weak.

**The one task:** Report suspected online financial fraud, including fake relief-payment messages, phishing, impersonation, and fraudulent transfers.

A citizen explains what happened in Urdu voice or text. Dastak gathers the relevant information, identifies missing or contradictory details, prepares a complaint, explains it, obtains the citizen's consent and authorization, and submits it to a simulated reporting service. The citizen can then track the case. A Community Helper can assist with authorized cases, and a Department Officer can review the submitted complaint.

### Strict MVP boundaries

- One complaint category: suspected online financial fraud.
- One complete reporting workflow.
- One mock submission destination at a time, selected through configurable rules.
- Four roles: Citizen, Community Helper, Department Officer, and Admin.
- No real government integrations or real personal data.
- No RAG/vector database, OCR, document-forgery detection, full offline synchronization, or Playwright browser automation in the MVP.
- Do not present a simulated destination as an official authority or claim that a real government complaint has been filed.

## 2. Roles and permissions

Build four roles. There is no separate Auditor account.

| Role | Responsibilities | Restrictions |
| --- | --- | --- |
| Citizen | Create a complaint, speak or type, upload evidence, correct information, grant or withdraw consent, authorize submission, and track progress | Can access only their own cases |
| Community Helper | Assist multiple citizens, add information, upload evidence, and track authorized cases | Can access only cases with an active, specific access grant; cannot grant consent or authorize final submission on the citizen's behalf |
| Department Officer | Review assigned cases, request information, accept, reject, escalate, or close cases | Can access only cases in their assigned workspace and permitted case scope |
| Admin | Manage users, roles, routing rules, mock services, API keys, and inspect audit traces | Administrative privileges must not silently bypass citizen consent or expose evidence without authorization |

**Auditor replacement:** Add an `Audit & Explainability` section inside the Admin dashboard. It is read-only and shows the complete decision trace: relevant input, AI output, confidence signals, rule version, selected route, consent changes, agent actions, and submission result. Do not build a separate Auditor login or dashboard. The brief requires a reviewable audit trace, not necessarily a fifth account.

**Helper access:** A helper must be able to assist multiple citizens. The removed feature is the special shared-phone switching experience, not multi-citizen case assistance. Backend checks must enforce each case-level access grant on every request.

## 3. Team & Process

### 3.1 Four workstreams and ownership

Use four workstreams, with one person accountable for each. Assign real team-member names before implementation begins. The labels below are placeholders, not additional roles in the product.

| Workstream | Owner | Primary responsibility | Main deliverables |
| --- | --- | --- | --- |
| Frontend | Person 1 | React application, role-based screens, citizen workflow, voice interface, accessibility, and frontend integration | Citizen, Helper, Officer, and Admin screens; API client; loading/error states; saved-progress indicators |
| Backend | Person 2 | FastAPI, database, authentication, permissions, business services, AI orchestration, and mock service APIs | Migrations, REST endpoints, RBAC, consent enforcement, routing, LangGraph, audit events, mock APIs |
| Data/Fixtures | Person 3 | Synthetic users, workspaces, transaction records, complaint examples, voice/text examples, routing seeds, and repeatable demo data | Seed scripts, valid and invalid fixtures, duplicate and contradictory cases, mock-service responses |
| Testing | Person 4 | Acceptance criteria, OpenAPI contract checks, automated tests, security/permission checks, integration checks, and surprise-test preparation | Contract tests, API tests, negative authorization tests, end-to-end checklist, regression suite |

Each stream has one directly accountable owner. This does not mean that the owner works in isolation: contract changes require frontend, backend, and testing review; data fixtures must be usable by both backend and testing; and all four people participate in the initial contract agreement and final end-to-end demo.

### 3.2 Contract-first rule — before implementation code

**No implementation code is written until the shared API contract and shared schema file have been committed.** The first project commits must contain the agreed versions of:

1. `contracts/openapi.yaml` — the single API specification containing endpoints, methods, authentication requirements, request/response references, status codes, and error responses.
2. `contracts/schemas.yaml` — the canonical shared data-shape definitions for the entities and payloads used by the API, aligned with the database/domain model in Section 11 and API contracts in Section 12.

The OpenAPI specification must reference the shared schemas rather than duplicate their field definitions. Keep one source of truth for each field. Pin the OpenAPI version and the validator/mock-server versions used by the project so that all contributors validate the same contract.

The first contract should cover at least authentication, users/roles, workspaces, complaints, evidence metadata, helper access grants, consent, routing rules and versions, agent runs/actions, submissions, audit events, notifications, API keys, and mock identity/payment/data/complaint services. It is acceptable to agree the minimum request and response shapes first and extend them as implementation progresses, but do not start independent frontend/backend implementations before those initial files are committed.

**Contract change rule:** Any change to an endpoint, field, enum, required/optional status, or data shape must be made in the shared contract files first. The contract update, corresponding implementation change, and relevant test updates must be included in the same commit. Do not communicate API changes only verbally, in chat, or through an uncommitted local edit. Review the change with the other affected stream owners before committing it.

### 3.3 Frontend mock server and backend implementation

- Generate/run a mock API server from `contracts/openapi.yaml` (for example, with a spec-driven OpenAPI mock-server tool).
- Frontend development uses this mock server and the shared schemas from the start. The frontend must not wait for real backend endpoints to be completed.
- Backend implements the real FastAPI endpoints against the same OpenAPI contract and schema file.
- Keep mock responses representative of the synthetic fixtures and documented response shapes.
- The frontend must be able to switch between the mock base URL and real backend base URL through configuration, not code edits scattered throughout the application.
- The Testing owner validates both mock and real responses against the same contract.

### 3.4 Integration checkpoints

There are two mandatory short integration checkpoints in the schedule, at approximately hour 8 and hour 20.

At each checkpoint:

1. Frontend temporarily points its API base URL at the real backend instead of the mock server.
2. Backend exposes the endpoints scheduled to be ready by that checkpoint.
3. Testing runs the contract checks against the real backend and compares status codes, headers, required fields, types, enums, response schemas, and documented error formats with `openapi.yaml` and `schemas.yaml`.
4. Any contract drift is recorded immediately and fixed through the contract-first, same-commit rule.
5. Frontend returns to the mock server for continued independent work after the checkpoint unless the team agrees to continue real-backend integration.

Each checkpoint is a **10–15 minute session**, not a full integration phase. “Matches the spec exactly” means schema and protocol conformance; dynamic values such as generated IDs and timestamps are not expected to be byte-for-byte identical to mock fixtures. Do not silently waive a mismatch because the frontend can work around it.

### 3.5 Working agreements

- Keep commits small and attributable to a workstream.
- Do not change API shapes without updating the shared contract first.
- Use seeded fixtures rather than manually editing the database during demos.
- Report blockers directly to the relevant stream owner as soon as they appear.
- Test new behavior when it is introduced; do not leave all testing until the final hours.
- Reserve the last four hours for stabilization, demo rehearsal, and documentation. No new major features during that period.

## 4. Required platform features and selected SaaS extras

### 4.1 Mandatory platform features

These are required by the brief:

1. Secure login using JWT or OAuth and backend-enforced role-based access control.
2. Dashboards showing case progress, status, and history.
3. Case management: create, assign, escalate, and close.
4. Public REST API, API-key authentication, and Swagger/OpenAPI documentation.
5. Audit logs for user, AI, and agent actions.
6. Consent management: view, grant, change, withdraw, and correct data.
7. Mock identity, payment, and data services behind clean APIs.

### 4.2 Three selected SaaS extras

Implement these three and demonstrate each live:

**A. Multi-tenant workspaces**

Create two pre-seeded simulated workspaces, such as `Mock Financial Fraud Intake` and `Mock Digital Safety Intake`. Do not build dynamic workspace creation or a workspace-management UI. Pre-seeded workspaces only count as a meaningful multi-tenant feature if officers and case records are actually isolated by workspace on the backend. Raw API requests must not bypass that isolation.

**B. Admin rule editor**

Admin can change routing rules through the interface without editing code or restarting the application. Every change creates a new immutable rule version.

**C. In-app notifications**

Generate notifications for complaint submission, assignment, information requests, acceptance, rejection, escalation, closure, and relevant consent changes. No SMS, WhatsApp, or email integration is required.

Do not build officer priority sorting, analytics dashboards, subscription management, or background-job queues as separate features.

## 5. AI features

The brief requires at least three AI features to work live and be linked in one flow. Build these three:

### 5.1 Voice — Urdu speech-to-text and text-to-speech

- Citizen explains the incident in Urdu.
- The system transcribes the speech.
- The system asks relevant follow-up questions in Urdu.
- The system reads the complaint summary aloud.
- The citizen can correct information before authorizing submission.

The voice feature must move the actual complaint workflow forward. A transcription-only demo is insufficient. Prove the speech-to-text and text-to-speech provider works in the first two hours.

### 5.2 Classification and routing

- Classify the incident as a type of suspected online financial fraud.
- Identify suspicious signals in scam-message text supplied through the conversation.
- Produce a confidence indicator and an explanation.
- Pass the classification and structured incident details to a deterministic, versioned routing engine.

The AI classifier identifies the incident. The deterministic rule engine applies the current administrator-configured route. The rule engine alone does not count as an AI feature. Do not treat a confidence score as proof that fraud occurred.

### 5.3 Autonomous agent and tool-calling

Use a constrained LangGraph workflow to complete the reporting task step by step. Its tools interact with the mock identity, payment, data, and complaint APIs. The agent must only call approved tools with validated inputs; it must not have unrestricted access to the application.

### 5.4 Cross-cutting requirements (not counted as extra AI features)

Pydantic structured outputs, validation, guardrails, human approval, explainability, and audit traces are required safety and engineering mechanisms. They are not being used to inflate the count of three AI features.

## 6. Citizen workflow

1. Citizen logs in and selects **Report an online scam**.
2. Citizen describes what happened using Urdu voice or text.
3. Citizen can attach a transaction screenshot, receipt, chat, or other supporting file.
4. AI transcribes speech and extracts information into a structured incident record.
5. AI classifies the incident and identifies missing or contradictory information.
6. The system asks only the necessary follow-up questions.
7. A versioned routing rule selects the simulated destination.
8. Dastak generates a formal complaint.
9. The complaint summary is read aloud in Urdu and displayed for correction.
10. Citizen reviews the information and grants the necessary data-sharing consent.
11. Citizen explicitly authorizes final submission.
12. The constrained agent calls the mock services and submits the complaint.
13. The mock service returns a reference number and confirmation.
14. Citizen sees the submission status and tracks the complaint.
15. Department Officer reviews the complaint and takes an action.
16. Citizen receives an in-app notification about the status change.

**Authorization rule:** The AI must never silently submit a complaint. A complete form or high confidence is not a substitute for citizen authorization. The Department Officer, not the AI, makes the department's review decision.

## 7. AI schemas and wrong-versus-slow policy

Use Pydantic models for important AI outputs. Validate every output before saving it or passing it to another service.

### 7.1 Incident information

A complaint may capture:

- Incident type.
- Incident date or approximate date.
- Incident description.
- Scam message or communication text, when available.
- Platform or communication channel.
- Whether money was lost or the attempt was unsuccessful.
- Amount and currency, when applicable.
- Payment method.
- Transaction reference, if known.
- Suspect phone number, URL, account, or profile, if available.
- Evidence references.
- Citizen-confirmed corrections.

Do not force the citizen to provide information they do not have. Represent unknown values as unknown; never invent them.

### 7.2 Classification output example

```python
from pydantic import BaseModel, Field

class ClassificationResult(BaseModel):
    incident_type: str
    confidence: float = Field(ge=0, le=1)
    suspicious_indicators: list[str]
    explanation: str
    missing_fields: list[str]
    contradiction_flags: list[str]
```

### 7.3 Complaint output example

```python
from pydantic import BaseModel

class ComplaintDraft(BaseModel):
    incident_type: str
    incident_date: str | None
    description: str
    amount: float | None
    currency: str | None
    payment_method: str | None
    transaction_reference: str | None
    suspect_details: list[str]
    evidence_ids: list[str]
    citizen_confirmed: bool
```

The final shared schema file must be the canonical contract for API payloads. The examples above illustrate the shape; do not create a second competing definition in code without keeping the shared contract synchronized.

### 7.4 Readiness and handoff policy

| Readiness result | System action |
| --- | --- |
| 0.85 or higher, mandatory information present, no unresolved contradiction, and a valid routing rule | Prepare the complaint for citizen review |
| 0.60–0.84 or correctable missing information | Ask the citizen for clarification |
| Below 0.60, unresolved contradiction, uncertain duplicate, or no matching route | Stop and send for human review |

One initial readiness calculation for the prototype is:

```text
Readiness =
    0.35 × classification confidence
  + 0.30 × required-field completeness
  + 0.20 × data consistency
  + 0.15 × routing-rule match
```

These values are prototype policy thresholds, not statistically calibrated guarantees. Hard-stop conditions override the score. Never auto-approve or auto-submit based on it. The score determines whether the system can prepare the case or needs clarification/human review. Citizen authorization is still required before submission.

## 8. Routing without RAG

No vector database, embeddings, retrieval pipeline, or official-document knowledge base is required for this MVP.

Store routing rules in PostgreSQL. Each rule should contain:

- Rule name.
- Incident category or matching conditions.
- Destination workspace.
- Priority/order of evaluation.
- Active/inactive state.
- Explanation shown to the citizen.
- Rule version.
- Source or justification.
- Created by and timestamp.

Safeguards:

- Never hardcode routing decisions in the prompt or frontend.
- Every complaint stores the exact rule version used.
- Editing a rule creates a new version.
- Old cases retain their original decision and rule version.
- A newly created case uses the updated rule immediately.
- If no rule matches, send the case to human review.

For the rule-change demo, keep the single complaint category unchanged and demonstrate the admin rule editor by switching its destination between the two seeded workspaces; this is a routing change, not the addition of a second complaint category.

Until official reporting-channel documentation has been verified, these are **demo routing rules only**. Do not present a simulated workspace as an actual authority or claim it is the official reporting destination.

## 9. Evidence handling — no OCR in the MVP

The explicit MVP decision is **no OCR**. Citizens provide transaction details through Urdu voice or text and upload screenshots, receipts, chats, or other relevant files as supporting evidence.

Evidence handling:

- Accept relevant image and PDF attachments.
- Validate file type and size.
- Validate file contents, not only filename extensions.
- Store the original file.
- Compute and record a SHA-256 hash.
- Record uploader, timestamp, and associated complaint.
- Restrict access according to complaint permissions and active consent.
- Display evidence to an authorized officer.

Label evidence as **citizen-submitted and not authenticity-verified**. The system must not claim that an uploaded image or document is genuine, forged, or unaltered. When evidence appears suspicious, information conflicts, or authenticity cannot be assessed, explain the uncertainty and request human review.

## 10. Technical architecture

Use a modular monolith. Do not build unnecessary microservices.

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Validation | Pydantic |
| Database | PostgreSQL |
| ORM and migrations | SQLAlchemy, Alembic |
| Authentication | JWT |
| AI orchestration | LangGraph |
| AI model | LLM with structured outputs and tool-calling support |
| Voice | Urdu-capable speech-to-text and text-to-speech provider |
| Evidence storage | Local persistent storage for the prototype |
| API documentation | FastAPI Swagger/OpenAPI |
| Deployment | Docker Compose |

No Redis, Celery, vector database, OCR framework, or Playwright dependency is needed for the MVP. Keep model and voice integrations behind small interfaces so providers can be replaced without rewriting the application.

## 11. Database schema

Build only the tables needed for the reduced workflow.

| Table | Purpose |
| --- | --- |
| `users` | User accounts, roles, and workspace association |
| `workspaces` | Pre-seeded simulated department workspaces |
| `complaints` | Main complaint records and current status |
| `complaint_access_grants` | Helper access to individual citizen cases |
| `case_assignments` | Officer and workspace assignments |
| `evidence` | File metadata, hashes, ownership, and verification status |
| `consents` | Recipient, purpose, data scopes, grant, modification, and withdrawal |
| `routing_rules` | Current routing rule definitions |
| `routing_rule_versions` | Immutable history of routing changes |
| `agent_runs` | Persisted LangGraph execution state |
| `agent_actions` | Individual agent and tool-call records |
| `submissions` | Mock service submission attempts and references |
| `audit_logs` | Append-only user, AI, agent, consent, and administrative trace |
| `notifications` | In-app notifications |
| `api_keys` | Hashed API keys, scopes, expiry, and revocation |
| `mock_identity_records` | Synthetic identity records |
| `mock_payment_transactions` | Synthetic payment transaction fixtures |
| `mock_reporting_requirements` | Simulated data-service requirements |

Important relationships:

- One citizen can own many complaints.
- A complaint can have multiple evidence files.
- A complaint can have multiple helpers, each with a separate access grant.
- A complaint can be assigned to an officer within a workspace.
- A complaint can have multiple consent records and submission attempts.
- A complaint stores the routing-rule version used.
- An agent run can contain many agent actions.
- Every significant operation creates an audit event.

Use workspace identifiers on officer-owned records and enforce workspace access in backend queries. Keep audit history append-only. Do not put unnecessary personal information or entire evidence files in audit metadata.

## 12. REST API contracts

Use a consistent `/api/v1` prefix. The exact request/response schemas, status codes, authentication requirements, and error formats must be committed in `contracts/openapi.yaml` and `contracts/schemas.yaml` before implementation. The endpoints below are the planned surface; the shared OpenAPI contract is authoritative.

### Authentication

```text
POST   /api/v1/auth/login
GET    /api/v1/auth/me
```

### Citizen complaints

```text
POST   /api/v1/complaints
GET    /api/v1/complaints
GET    /api/v1/complaints/{id}
PATCH  /api/v1/complaints/{id}
POST   /api/v1/complaints/{id}/evidence
POST   /api/v1/complaints/{id}/analyze
POST   /api/v1/complaints/{id}/authorize-submission
```

### Consent

```text
GET    /api/v1/complaints/{id}/consents
POST   /api/v1/complaints/{id}/consents
PATCH  /api/v1/consents/{id}
POST   /api/v1/consents/{id}/withdraw
```

### Helper

```text
GET    /api/v1/helper/complaints
POST   /api/v1/complaints/{id}/helper-information
```

Helper access must be checked against the specific active case grant on every request.

### Officer

```text
GET    /api/v1/officer/complaints
GET    /api/v1/officer/complaints/{id}
POST   /api/v1/officer/complaints/{id}/actions
```

Officer actions use controlled values such as `request_information`, `accept`, `reject`, `escalate`, or `close`, with a reason.

### Admin

```text
GET    /api/v1/admin/users
POST   /api/v1/admin/users
GET    /api/v1/admin/routing-rules
POST   /api/v1/admin/routing-rules
PATCH  /api/v1/admin/routing-rules/{id}
GET    /api/v1/admin/audit
GET    /api/v1/admin/agent-runs
GET    /api/v1/admin/api-keys
POST   /api/v1/admin/api-keys
POST   /api/v1/admin/api-keys/{id}/revoke
```

### Mock services

```text
GET    /api/v1/mock/identity/{reference}
GET    /api/v1/mock/payments/transactions/{reference}
GET    /api/v1/mock/data/requirements/{incident_type}
POST   /api/v1/mock/complaints
GET    /api/v1/mock/complaints/by-idempotency-key/{key}
```

### Notifications

```text
GET    /api/v1/notifications
POST   /api/v1/notifications/{id}/read
```

Use JWT for the frontend and scoped `X-API-Key` authentication for external API clients. Store only hashed API keys. Swagger must document authentication, scopes, schemas, responses, and error cases.

## 13. LangGraph workflow

The agent is a restricted workflow, not an unrestricted browser operator.

```text
DRAFT
  -> COLLECT_INFORMATION
  -> VOICE_TRANSCRIPTION
  -> STRUCTURED_EXTRACTION
  -> CLASSIFICATION
  -> VALIDATION
       -> NEEDS_INFORMATION (missing or correctable fields)
       -> HUMAN_REVIEW (low confidence, contradiction, uncertain duplicate)
       -> ROUTING_RULE_EVALUATION
            -> HUMAN_REVIEW (no matching rule)
            -> COMPLAINT_GENERATION
                 -> CITIZEN_REVIEW
                 -> CONSENT_AND_AUTHORIZATION
                 -> AGENT_EXECUTION
                 -> MOCK_SERVICE_CALLS
                 -> SUBMISSION_VERIFICATION
                 -> SUBMITTED
                 -> OFFICER_REVIEW
                 -> RESOLVED
```

Persist state after every important transition. The graph must stop for clarification, human review, and citizen authorization rather than assuming it can proceed.

Persist at least:

```python
class DastakState(BaseModel):
    complaint_id: str
    citizen_id: str
    language: str
    transcript: str | None
    incident_data: dict
    classification: dict | None
    readiness_score: float | None
    missing_fields: list[str]
    contradiction_flags: list[str]
    rule_version_id: str | None
    destination_workspace_id: str | None
    consent_granted: bool
    citizen_authorized: bool
    idempotency_key: str
    submission_reference: str | None
    current_status: str
    errors: list[str]
```

The persisted state must be reconciled with current consent before every sensitive action. A stale `consent_granted` flag in an old agent state is not sufficient authorization after consent has been withdrawn.

## 14. Mock API and agent contract

All mock services must be clearly labelled simulated.

**Mock identity service:** Checks a synthetic demo identity reference associated with the logged-in user. Do not request or store real CNICs or other real identity information.

**Mock payment service:** Looks up a synthetic transaction reference from seeded test data. If it cannot find a reference, return an explicit `not_found` response. This does not prove that the citizen's transaction is invalid.

**Mock data service:** Returns simulated reporting requirements and available fields for the selected complaint category.

**Mock complaint service:** Accepts a validated complaint after authorization, stores it, and returns a simulated reference number.

Expose these services through REST endpoints and give the LangGraph agent typed, allowlisted tools using the same request/response schemas.

The agent must:

- Never submit before citizen authorization.
- Never invent missing information.
- Never treat a mock lookup failure as proof of fraud or invalidity.
- Use an idempotency key for submissions.
- Check the previous result before retrying an uncertain submission.
- Re-check active consent before sharing data.
- Record each tool call and result in the audit trail.

## 15. Authentication, consent, and security

Implement backend authorization for every sensitive endpoint.

### Access rules

- Citizens: own cases only.
- Helpers: cases with active, specific access grants only.
- Officers: assigned cases within their workspace and permitted case scope.
- Admins: user, rules, mock-service, and audit-management permissions; no automatic consent bypass.
- API keys: specific scopes, expiration, and revocation.

### Consent

A consent record identifies:

- Who granted consent.
- Who receives the data.
- What information can be shared.
- The purpose of sharing.
- When consent was granted or changed.
- Whether it has been withdrawn.

Withdrawing consent must immediately block future access by the relevant helper or simulated recipient through Dastak. Record withdrawal in the audit log. Because this is a controlled prototype, demonstrate that revocation blocks subsequent API reads. Be honest that a real external recipient may already have received a copy that Dastak cannot necessarily retract.

### Evidence and privacy

- Use synthetic demo data only.
- Restrict file types and upload size.
- Validate file contents, not only filename extensions.
- Do not expose private evidence through public URLs.
- Keep secrets in environment variables.
- Apply basic rate limiting and safe error handling.
- Keep sensitive data out of ordinary application logs.
- Never trust frontend permission checks.

## 16. Weak-internet handling

Do not build full offline-first synchronization. Implement the separately scored weak-internet requirements:

- Lightweight pages and minimal unnecessary requests.
- Save drafts automatically after meaningful changes.
- Persist complaint and agent progress on the backend.
- Show connection and last-saved status.
- Recover the existing draft when the connection returns.
- Retry safe requests without creating duplicate records.
- Use idempotency keys for complaint submission and other retry-sensitive operations.

A user must not lose information already entered because the connection dropped. No offline queue or conflict-resolution engine is required.

## 17. Dependency-aware implementation order

1. **Contract and voice proof:** Agree and commit the OpenAPI and schema files; prove Urdu speech-to-text and text-to-speech work.
2. **Foundation:** Docker, database, migrations, configuration, logging, and seeded data.
3. **Authentication and access:** Four roles, workspace isolation, helper grants, and negative API permission tests.
4. **Complaint and evidence:** Complaint lifecycle, drafts, file upload, metadata, hashes, and access controls.
5. **AI flow:** Voice, structured extraction, classification, confidence/handoff, and complaint generation.
6. **Routing:** Configurable rules, immutable versions, admin editing, and historical decision trace.
7. **Agent and mock services:** Typed tools, LangGraph state persistence, authorization gate, idempotency, and simulated submission.
8. **Safety and completion:** Consent/withdrawal, audit, notifications, officer actions, and weak-connection recovery.
9. **Integration and stabilization:** Surprise inputs, raw API security tests, contract checks, and live demo rehearsal.

Do not start optional features before the end-to-end complaint workflow works.

## 18. Revised 48-hour schedule — parallel workstreams

**Ownership key:** `FE` = Abdullah (Person 1); `BE` = Mughees/Alyan (Person 2); `DATA` = Lutfaan (Person 3); `TEST` = Mughees (Person 4). All four participate in contract decisions and the final demo. Work in each time block happens in parallel unless a dependency is explicitly stated.

| Time | Frontend — Person 1 | Backend — Person 2 | Data/Fixtures — Person 3 | Testing — Person 4 |
| --- | --- | --- | --- | --- |
| **0–2 h** | Agree screen needs and API payloads; review the proposed contract. No implementation code yet. | Lead the initial OpenAPI and shared-schema drafting with input from all streams. | Define synthetic users, two workspaces, complaint cases, transaction fixtures, and expected mock-service responses. | Turn rubric criteria into acceptance checks; identify required endpoint and error cases; review contract coverage. |
| **First commits, before implementation** | Review required frontend operations and data fields. | Commit `contracts/openapi.yaml` and `contracts/schemas.yaml` as the initial shared-contract commits after team agreement. | Review schema fields against the planned fixture data. | Validate that endpoints, response/error shapes, and schemas are testable. **Implementation starts only after these files are committed.** |
| **2–5 h** | Scaffold React/TypeScript/Tailwind app; generate client types and run frontend against the OpenAPI mock server. | Set up FastAPI, PostgreSQL, Docker Compose, Alembic, configuration, and health endpoint against the committed contract. | Implement seed scripts for users, roles, workspaces, mock identities/payments, and basic complaints. | Set up test framework, contract validation, fixture loading checks, and test commands; verify the mock server responses conform to the contract. |
| **5–8 h** | Build login, role-specific navigation, dashboard shell, and API loading/error states using the mock server. | Implement JWT login, `/auth/me`, user/role models, and backend permission dependencies. | Prepare valid/invalid login fixtures, role matrix, workspace assignments, and helper-access examples. | Write authentication tests and raw API negative tests for role/ownership/workspace boundaries; prepare checkpoint test run. |
| **~8 h — Integration checkpoint 1 (10–15 min)** | Temporarily point the frontend API base URL at the **real backend**, not the mock. Exercise the ready auth/me endpoints. | Keep the agreed auth endpoints running and provide the real backend base URL. | Supply known test users and expected role/workspace outcomes. | Run contract tests against the real backend; verify status codes, headers, required fields, types, and error schemas against the shared OpenAPI/schema files; flag drift immediately. |
| **8–10 h** | Return to the mock server; continue dashboard and role-shell work, resolving issues found at checkpoint. | Fix any contract drift and continue complaint/database implementation. | Finalize complaint lifecycle fixtures and helper permission test data. | Add regression tests for checkpoint findings and complaint endpoint expectations. |
| **10–14 h** | Build citizen complaint creation/editing, evidence upload screens, helper authorized-case list, and progress states against the mock server. | Implement complaint CRUD, evidence metadata/upload, helper access grants, and resource-level checks. | Create normal, missing-field, duplicate, contradictory, unreadable-file, and unauthorized-access fixtures. | Test complaint lifecycle, file validation, hash recording, ownership, helper grants, and unauthorized raw API requests. |
| **14–20 h** | Build the Urdu voice interaction, follow-up question UI, complaint review screen, and audio playback using mocked responses where needed. | Integrate speech-to-text/text-to-speech provider, structured extraction, classification, and readiness/handoff logic. | Prepare Urdu voice/text test phrases, expected structured incident records, edge cases, and classification examples. | Test transcription-to-complaint flow, missing-field questions, malformed model output, low confidence, contradictions, and human handoff. |
| **~20 h — Integration checkpoint 2 (10–15 min)** | Temporarily point the frontend API base URL at the **real backend**, not the mock. Exercise the complaint/analysis/voice endpoints ready by this point. | Expose the scheduled complaint and AI workflow endpoints with stable contract responses. | Provide a known end-to-end fixture and expected state/result for the test run. | Run contract checks against the real backend and verify response schemas, status codes, headers, required fields, and documented errors; record and flag any drift immediately. |
| **20–24 h** | Return to the mock server; build Admin routing-rule screens and citizen route explanation/review states. | Implement deterministic routing, rule versions, and admin rule update endpoints. | Create initial routing rules, a no-match case, and a rule-change fixture with expected before/after behavior. | Test that new cases use the updated rule, old cases preserve their prior version, and no-match cases go to human review. |
| **24–30 h** | Build final authorization/submit progress UI, submission confirmation, reference display, and citizen tracking. | Implement LangGraph state persistence, typed mock-service tools, mock identity/payment/data/complaint APIs, idempotent submission, and confirmation handling. | Seed mock identity/payment responses, reporting requirements, success/failure responses, and duplicate/timeout fixtures. | Test agent state transitions, tool allowlists, authorization gate, idempotency, timeout recovery, and no duplicate submissions. |
| **30–34 h** | Build consent view/change/withdraw screens, Admin audit view, notification list, and status updates. | Implement consent enforcement/withdrawal, append-only audit events, notification APIs, and agent/action trace. | Prepare consent states, recipient/data-scope examples, and expected audit sequences. | Test that withdrawn consent blocks subsequent access; verify audit completeness, simple explanations, and notification triggers. |
| **34–37 h** | Complete Officer case list, case detail, and review action screens. | Implement officer actions, workspace-scoped queries, assignment, escalation, and closure. | Prepare officer assignments and cross-workspace cases. | Test accept/reject/request-information/escalate/close actions and raw API cross-tenant access denial. |
| **37–40 h** | Optimize page weight, add connection/last-saved indicators, and test draft recovery UI. | Finish API-key scopes/revocation, Swagger details, draft persistence, and safe retry behavior. | Prepare slow-connection/retry fixtures and API-key test accounts. | Test API-key authentication/scopes, saved drafts after interruption, retry behavior, and duplicate protection. |
| **40–44 h** | Fix integration/UI defects; no new major screens. | Fix backend defects and migration/API issues; freeze contract except for critical agreed fixes. | Run all seed scripts from a clean database and verify repeatability. | Run full surprise suite, raw API security tests, contract validation, and end-to-end regression. Log severity and verify fixes. |
| **44–48 h** | Rehearse the live citizen/helper/officer/admin demo and prepare screenshots only as supporting material. | Ensure clean startup, migrations, logs, mock labels, and end-to-end submission work without manual database fixes. | Reset and load the exact demo dataset; document expected outputs and fallback fixtures. | Run the final acceptance checklist, verify no critical regressions, and independently follow the README demo steps. |

### Schedule rules

- The hour 8 and hour 20 checkpoints are mandatory 10–15 minute sessions. Frontend switches from mock to real backend; Testing verifies conformance to the committed contract.
- Outside the checkpoints, frontend continues against the OpenAPI-generated mock server so it is not blocked by backend progress.
- Testing is continuous throughout the 48 hours, not a final-day activity.
- Data/Fixtures prepares fixtures and expected outputs in parallel with implementation; do not wait until the demo to create synthetic data.
- If an endpoint is not ready at a checkpoint, record it as unavailable rather than pretending it passed. Keep the remaining integration checks on the ready endpoints and create an explicit owner/deadline for the missing endpoint.
- If the agent submission flow is behind schedule, prioritize it over UI polish and optional features.
- No major new features after hour 40.

## 19. Judge test scenarios

| Scenario | Expected behavior |
| --- | --- |
| Normal online financial fraud | Complaint completes the mock submission flow |
| Missing transaction reference | Ask for it if available; do not invent it |
| Duplicate transaction reference or possible duplicate complaint | Flag and clarify; do not silently merge or submit twice |
| Contradictory reported information | Stop and request clarification or human review |
| Unverified or suspicious document | Preserve evidence and flag uncertainty; do not claim forgery |
| Unclear classification | Stop rather than guess |
| No matching routing rule | Human review |
| Admin changes a routing rule | Next applicable case follows the new version without code changes or redeployment |
| Existing complaint after rule change | Retains its original rule version |
| Citizen withdraws consent | Subsequent access by the relevant recipient is blocked |
| Helper requests unrelated case | Backend denies access |
| Officer requests another workspace's case | Backend denies access |
| Connection drops during data entry | Saved draft is recovered |
| Submission times out | Check previous result before retrying |
| Raw API request with unauthorized role | Backend denies access |
| Response differs from OpenAPI contract | Contract test fails and the drift is corrected; no silent frontend workaround |

## 20. Demo sequence

Tell one continuous story:

1. Log in as the citizen and report a fake relief-payment scam using Urdu voice.
2. Attach a supporting transaction image.
3. Show the classifier result and explain why it needs one more piece of information.
4. Answer the follow-up question through voice.
5. Play the spoken complaint summary and correct it.
6. Show the recipient and purpose of data sharing, then authorize submission.
7. Show the agent calling mock services and returning a simulated reference number.
8. Log in as a helper and show access to multiple authorized citizens' cases, but denial for an unrelated case.
9. Log in as an officer and review the complaint, then request information or accept it.
10. Log in as Admin, change a routing rule, and demonstrate that the next case uses the new version.
11. Open the Admin audit view and show the original case's decision trace and rule version.
12. Show that withdrawn consent blocks subsequent access.

Everything shown as a government service, identity provider, payment system, or recipient must be labelled as simulated.

## 21. Definition of done

- [ ] Four roles work with backend-enforced permissions.
- [ ] Citizen can create and track an online financial fraud complaint.
- [ ] Urdu voice input and spoken responses move the task forward.
- [ ] AI classification and follow-up questions work.
- [ ] Complaint data is validated through shared structured schemas.
- [ ] Admin can change routing rules without code changes or redeployment.
- [ ] Rule versions are preserved on existing cases.
- [ ] Citizen can review and correct the complaint.
- [ ] Consent can be viewed, changed, and withdrawn.
- [ ] Citizen explicitly authorizes final submission.
- [ ] LangGraph agent calls the mock services and records its actions.
- [ ] Mock submission returns a reference and avoids duplicate retries.
- [ ] Helper and officer permissions work through raw API requests.
- [ ] Officer can request information, accept, reject, escalate, and close.
- [ ] Admin can inspect complete audit and explainability traces.
- [ ] Two seeded workspaces have real backend isolation.
- [ ] In-app notifications work.
- [ ] API keys and Swagger documentation work.
- [ ] Drafts survive a connection interruption.
- [ ] OpenAPI contract checks pass against the mock server and real backend.
- [ ] Database migrations, logs, and basic tests exist.
- [ ] No real personal data or live government integration is used.

## 22. Explicitly postponed features and development rules

### Postponed

- Separate Auditor role and login.
- RAG and vector database.
- OCR.
- Forged-document detection.
- Shared-phone Helper Mode.
- Full offline-first synchronization.
- Dynamic workspace creation and management UI.
- Officer priority/confidence sorting.
- SMS, WhatsApp, and email notifications.
- Analytics dashboard.
- Playwright browser automation.
- Multiple complaint categories.
- Real government integrations.

### Development rules

- Do not over-engineer.
- Do not add multiple complaint categories before the primary workflow works.
- Do not add multiple live authority integrations.
- Do not build complex offline synchronization.
- Avoid unnecessary microservices.
- Do not present placeholder buttons as complete features.
- Do not hardcode routing in prompts or the frontend.
- Do not let the LLM make unrestricted submission or permission decisions.
- Do not trust frontend authorization.
- Do not use real personal information.
- Never call simulated filing a real government submission.
- Prioritize a complete workflow over additional features.
- Every feature needs a purpose, defined contract, error handling, permission checks, and basic tests.
- Never claim untested functionality works.

## Final objective

Take a citizen from:

> “I have been scammed, but I don't know where to report it or what to do.”

To:

> “My complaint has been prepared, reviewed, submitted through the assisted reporting process, and I can track its progress.”

Dastak must make the reporting process accessible without taking control away from the citizen. Build one complete, reliable, demonstrable workflow rather than a collection of disconnected AI features.
