/**
 * Application types for the current repository contracts:
 * - ../contracts/schemas.yaml (from the frontend root)
 * - ../contracts/openapi.yaml
 *
 * Legacy raw agent types below are used only by the inherited mock preview.
 * Live Admin inspection uses AgentRunSummary. This file can be swapped with generated OpenAPI
 * types when desired without changing component imports.
 * Uses string unions instead of TypeScript enums for erasableSyntaxOnly safety.
 */

export type Role = 'Citizen' | 'Helper' | 'Officer' | 'Admin';

export type WorkflowStatus =
  | 'DRAFT'
  | 'COLLECT_INFORMATION'
  | 'VOICE_TRANSCRIPTION'
  | 'STRUCTURED_EXTRACTION'
  | 'CLASSIFICATION'
  | 'VALIDATION'
  | 'NEEDS_INFORMATION'
  | 'HUMAN_REVIEW'
  | 'ROUTING_RULE_EVALUATION'
  | 'COMPLAINT_GENERATION'
  | 'CITIZEN_REVIEW'
  | 'CONSENT_AND_AUTHORIZATION'
  | 'AGENT_EXECUTION'
  | 'MOCK_SERVICE_CALLS'
  | 'SUBMISSION_VERIFICATION'
  | 'SUBMITTED'
  | 'OFFICER_REVIEW'
  | 'RESOLVED';

export type ConsentStatus = 'granted' | 'withdrawn';

export type OfficerAction =
  | 'request_information'
  | 'accept'
  | 'reject'
  | 'escalate'
  | 'close';

export type EvidenceVerificationStatus = 'not_authenticity_verified';

export type ApiKeyScope =
  | 'complaints:read'
  | 'complaints:write'
  | 'consents:read'
  | 'consents:write'
  | 'helper:access'
  | 'officer:access'
  | 'admin:cases'
  | 'admin:users'
  | 'admin:rules'
  | 'admin:audit'
  | 'admin:api_keys'
  | 'mock:services'
  | 'notifications:read';

export interface ClassificationResult {
  incident_type: string;
  confidence: number;
  suspicious_indicators: string[];
  explanation: string;
  missing_fields: string[];
  contradiction_flags: string[];
}

export interface ComplaintDraft {
  incident_type: string;
  incident_date: string | null;
  description: string;
  amount: number | null;
  currency: string | null;
  payment_method: string | null;
  transaction_reference: string | null;
  suspect_details: string[];
  evidence_ids: string[];
  citizen_confirmed: boolean;
}

export interface IncidentInformation {
  incident_type?: string | null;
  incident_date?: string | null;
  description?: string | null;
  scam_message?: string | null;
  platform?: string | null;
  money_lost?: boolean | null;
  amount?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  suspect_details?: string[] | null;
  evidence_ids?: string[] | null;
  citizen_confirmed_corrections?: string[] | null;
}

export interface IncidentPatch {
  incident_type?: string | null;
  incident_date?: string | null;
  description?: string | null;
  scam_message?: string | null;
  platform?: string | null;
  money_lost?: boolean | null;
  amount?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  suspect_details?: string[] | null;
  evidence_ids?: string[] | null;
  citizen_confirmed_corrections?: string[] | null;
}

export interface HelperInformation {
  incident_type?: string | null;
  incident_date?: string | null;
  description?: string | null;
  scam_message?: string | null;
  platform?: string | null;
  money_lost?: boolean | null;
  amount?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  suspect_details?: string[] | null;
  evidence_ids?: string[] | null;
}

export interface UserRecord {
  user_id: string;
  role: Role;
  workspace_id: string | null;
}

export interface WorkspaceRecord {
  workspace_id: string;
  name: string;
}

export interface ComplaintRecord {
  version?: number;
  authorization_id?: string | null;
  agent_run_id?: string | null;
  submission_reference?: string | null;
  review_outcome?: ReviewOutcome;
  complaint_id: string;
  citizen_id: string;
  destination_workspace_id: string | null;
  rule_version_id: string | null;
  current_status: WorkflowStatus;
  incident_type?: string | null;
  incident_data: IncidentInformation;
  complaint_draft?: ComplaintDraft;
}

export interface ComplaintAccessGrant {
  complaint_id: string;
  helper_id: string;
  active: boolean;
}

export interface CaseAssignment {
  complaint_id: string;
  officer_id: string;
  workspace_id: string;
}

export interface AdminAssignmentCase {
  complaint_id: string;
  submission_reference: string;
  destination_workspace_id: string;
  current_status: 'SUBMITTED' | 'OFFICER_REVIEW';
  review_outcome: ReviewOutcome;
  submitted_at: string;
  assigned_officer_id: string | null;
  recipient_consent_active: boolean;
}

export interface AdminAssignmentQueue {
  items: AdminAssignmentCase[];
  officers: Array<{user_id: string; workspace_id: string}>;
  next_cursor: string | null;
}

export interface EvidenceRecord {
  evidence_id: string;
  complaint_id: string;
  uploader_id: string;
  timestamp: string;
  file_name: string;
  file_type: string;
  file_size: number;
  sha256: string;
  verification_status: EvidenceVerificationStatus;
}

export interface ConsentGrant {
  recipient: string;
  purpose: string;
  data_scopes: string[];
}

export interface ConsentChange {
  recipient?: string;
  purpose?: string;
  data_scopes?: string[];
}

export interface ConsentRecord {
  consent_id: string;
  complaint_id: string;
  citizen_id: string;
  recipient: string;
  purpose: string;
  data_scopes: string[];
  status: ConsentStatus;
  granted_at: string;
  changed_at: string | null;
  withdrawn_at: string | null;
}

export interface RuleCreate {
  name: string;
  incident_type: string;
  destination_workspace_id: string;
  priority: number;
  active: boolean;
  explanation: string;
  justification: string;
}

export interface RuleChange {
  name?: string;
  incident_type?: string;
  destination_workspace_id?: string;
  priority?: number;
  active?: boolean;
  explanation?: string;
  justification?: string;
}

export interface RoutingRuleVersionRecord {
  rule_id: string;
  rule_version_id: string;
  name: string;
  incident_type: string;
  destination_workspace_id: string;
  priority: number;
  active: boolean;
  explanation: string;
  justification: string;
  created_by: string;
  timestamp: string;
}

export interface RoutingRuleRecord {
  rule_id: string;
  rule_version_id: string;
  name: string;
  incident_type: string;
  destination_workspace_id: string;
  priority: number;
  active: boolean;
  explanation: string;
  justification: string;
  created_by: string;
  timestamp: string;
}

export interface AgentRunRecord {
  agent_run_id: string;
  complaint_id: string;
  citizen_id: string;
  language: string;
  transcript: string | null;
  incident_data: IncidentInformation;
  classification: ClassificationResult | null;
  readiness_score: number | null;
  missing_fields: string[];
  contradiction_flags: string[];
  rule_version_id: string | null;
  destination_workspace_id: string | null;
  consent_granted: boolean;
  citizen_authorized: boolean;
  idempotency_key: string;
  submission_reference: string | null;
  current_status: WorkflowStatus;
  errors: string[];
}

export interface AgentActionRecord {
  agent_action_id: string;
  agent_run_id: string;
  action: string;
  input: string;
  result: string | null;
  timestamp: string;
}

export interface SubmissionRecord {
  submission_id: string;
  complaint_id: string;
  idempotency_key: string;
  submission_reference: string | null;
  result: string | null;
  timestamp: string;
}

export interface SubmissionConfirmation {
  complaint_id: string;
  idempotency_key: string;
  submission_reference: string;
}

export interface SubmissionRequest {
  complaint_id: string;
  complaint_draft: ComplaintDraft;
}

export interface AuditLogRecord {
  audit_log_id: string;
  complaint_id: string | null;
  user_id: string | null;
  agent_run_id: string | null;
  action: string;
  input: string | null;
  result: string | null;
  rule_version_id: string | null;
  timestamp: string;
}

export interface NotificationRecord {
  notification_id: string;
  user_id: string;
  complaint_id: string;
  message: string;
  read: boolean;
  timestamp: string;
}

export interface ApiKeyMetadata {
  api_key_id: string;
  scopes: ApiKeyScope[];
  expires_at: string;
  revoked: boolean;
}

export interface ApiKeyCreate {
  scopes: ApiKeyScope[];
  expires_at: string;
}

export interface ApiKeyIssued {
  api_key_id: string;
  scopes: ApiKeyScope[];
  expires_at: string;
  revoked: boolean;
  api_key: string;
}

export interface MockIdentityRecord {
  identity_reference: string;
  user_id: string;
}

export interface MockPaymentTransaction {
  transaction_reference: string;
  amount: number;
  currency: string;
  payment_method: string | null;
}

export interface MockReportingRequirements {
  incident_type: string;
  requirements: string[];
  available_fields: string[];
}

export interface LoginRequest {
  user_id: string;
  password: string;
}

export interface LoginResult {
  access_token: string;
}

export interface UserCreate {
  user_id: string;
  password: string;
  role: Role;
  workspace_id: string | null;
}

export interface OfficerDecision {
  action: OfficerAction;
  reason: string;
}

export interface AuthorizeSubmission {
  citizen_authorized: true;
  citizen_confirmed: true;
  reviewed_version: number;
}

export interface AnalysisResponse {
  classification: ClassificationResult;
  readiness_score: number | null;
  current_status: WorkflowStatus;
  complaint_version?: number;
  follow_up_questions_ur?: string[];
  handoff_reasons?: string[];
  extraction?: VoiceExtraction;
}

export interface VoiceExtraction {
  incident_data: IncidentInformation;
  spoken_summary_ur: string;
  uncertainties: string[];
}

export interface VoiceInput {
  voice_turn_id: string;
  complaint_id: string;
  input_version: number;
  status: 'PROCESSING' | 'READY' | 'FAILED' | 'STALE' | 'APPLIED';
  next_step: 'transcribe' | 'extract' | 'done';
  transcript: string | null;
  confirmed_transcript: string | null;
  extraction: VoiceExtraction | null;
  error_code: string | null;
  requires_citizen_review: true;
  submitted: false;
}

export interface SpeechRequest {
  kind: 'voice_summary' | 'follow_up' | 'review';
  allow_external_processing: true;
  voice_turn_id?: string;
  question_index?: number;
}

export interface SpeechOutput {
  speech_id: string;
  complaint_id: string;
  case_version: number;
  text_ur: string;
  audio_path: string;
  simulated: true;
  submitted: false;
}

export interface SubmissionExecution {
  simulated: true;
  submitted: boolean;
  agent_run_id: string;
  current_status: WorkflowStatus;
  submission_reference: string | null;
  warnings: string[];
  errors: string[];
}

export type ReviewOutcome = 'pending' | 'information_requested' | 'information_received' | 'accepted' | 'rejected' | 'escalated' | 'closed';
export interface ReviewEvent {
  event_id: string;
  complaint_id: string;
  actor_id: string;
  action: OfficerAction | 'provide_information';
  message: string;
  previous_outcome: ReviewOutcome;
  outcome: ReviewOutcome;
  complaint_version: number;
  timestamp: string;
}

export interface AgentRunSummary {
  agent_run_id: string;
  complaint_id: string;
  rule_version_id: string | null;
  destination_workspace_id: string | null;
  current_status: WorkflowStatus | 'UNKNOWN';
  next_step: string;
  submitted: boolean;
  tools: {call_id: string; tool: string; result_status: string; timestamp: string}[];
  outcomes: {code: string; explanation: string}[];
  created_at: string;
  updated_at: string;
  redacted: true;
}

export interface ApiErrorBody {
  error: string;
  detail: string;
}

/** UI-only helper metadata stored alongside uploaded evidence in browser memory/sessionStorage */
export interface ClientEvidencePreview {
  evidence: EvidenceRecord;
  preview_data_url?: string;
}

