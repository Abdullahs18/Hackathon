import { DastakApiError } from '@/lib/apiError';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import type {
  AgentRunRecord,
  AnalysisResponse,
  ApiKeyCreate,
  ApiKeyIssued,
  ApiKeyMetadata,
  ApiKeyScope,
  AuditLogRecord,
  AuthorizeSubmission,
  CaseAssignment,
  ClassificationResult,
  ComplaintAccessGrant,
  ComplaintDraft,
  ComplaintRecord,
  ConsentChange,
  ConsentGrant,
  ConsentRecord,
  EvidenceRecord,
  HelperInformation,
  IncidentInformation,
  IncidentPatch,
  LoginRequest,
  LoginResult,
  MockIdentityRecord,
  MockPaymentTransaction,
  MockReportingRequirements,
  NotificationRecord,
  OfficerDecision,
  RoutingRuleRecord,
  RoutingRuleVersionRecord,
  RuleChange,
  RuleCreate,
  SubmissionConfirmation,
  SubmissionRecord,
  SubmissionRequest,
  UserCreate,
  UserRecord,
} from '@/types/dastak';

const MOCK_DB_STORAGE_KEY = 'dastak_mock_db_v2';
const MOCK_OFFLINE_STORAGE_KEY = 'dastak_mock_offline_sim';

interface StoredUser extends UserRecord {
  password: string;
  synthetic_identity_ref: string | null;
}

interface StoredApiKey extends ApiKeyMetadata {
  key_hash: string;
}

interface MockDatabase {
  users: StoredUser[];
  complaints: ComplaintRecord[];
  complaint_access_grants: ComplaintAccessGrant[];
  case_assignments: CaseAssignment[];
  evidence: EvidenceRecord[];
  evidence_previews: Record<string, string>;
  consents: ConsentRecord[];
  routing_rules: RoutingRuleRecord[];
  routing_rule_versions: RoutingRuleVersionRecord[];
  agent_runs: AgentRunRecord[];
  submissions: SubmissionRecord[];
  audit_logs: AuditLogRecord[];
  notifications: NotificationRecord[];
  api_keys: StoredApiKey[];
  mock_identity_records: MockIdentityRecord[];
  mock_payment_transactions: MockPaymentTransaction[];
  mock_reporting_requirements: MockReportingRequirements[];
  counters: {
    complaint: number;
    evidence: number;
    consent: number;
    rule: number;
    agent_run: number;
    submission: number;
    audit: number;
    notification: number;
    api_key: number;
  };
}

function createInitialDb(): MockDatabase {
  const nowBase = '2026-11-19T14:00:00.000Z';

  return {
    users: [
      {
        user_id: 'cit_tariq_01',
        password: 'demo1234',
        role: 'Citizen',
        workspace_id: null,
        synthetic_identity_ref: 'SYN-ID-1001',
      },
      {
        user_id: 'cit_sadia_02',
        password: 'demo1234',
        role: 'Citizen',
        workspace_id: null,
        synthetic_identity_ref: 'SYN-ID-1002',
      },
      {
        user_id: 'cit_kamran_03',
        password: 'demo1234',
        role: 'Citizen',
        workspace_id: null,
        synthetic_identity_ref: 'SYN-ID-1003',
      },
      {
        user_id: 'hlp_bilal_01',
        password: 'demo1234',
        role: 'Helper',
        workspace_id: null,
        synthetic_identity_ref: null,
      },
      {
        user_id: 'off_nadia_01',
        password: 'demo1234',
        role: 'Officer',
        workspace_id: 'mock-financial-fraud',
        synthetic_identity_ref: null,
      },
      {
        user_id: 'off_zain_02',
        password: 'demo1234',
        role: 'Officer',
        workspace_id: 'mock-digital-safety',
        synthetic_identity_ref: null,
      },
      {
        user_id: 'adm_farhan_01',
        password: 'demo1234',
        role: 'Admin',
        workspace_id: null,
        synthetic_identity_ref: null,
      },
    ],
    routing_rules: [
      {
        rule_id: 'rule_fraud_01',
        rule_version_id: 'rv_fraud_01_v1',
        name: 'Online Financial Fraud Intake Route',
        incident_type: 'online_financial_fraud',
        destination_workspace_id: 'mock-financial-fraud',
        priority: 1,
        active: true,
        explanation:
          'Demo Routing Rule v1 routes suspected online financial fraud reports to Mock Financial Fraud Intake (Simulated Service).',
        justification:
          'Baseline simulated routing rule for relief-payment, phishing, and wallet transfer fraud.',
        created_by: 'adm_farhan_01',
        timestamp: '2026-11-19T12:00:00.000Z',
      },
    ],
    routing_rule_versions: [
      {
        rule_id: 'rule_fraud_01',
        rule_version_id: 'rv_fraud_01_v1',
        name: 'Online Financial Fraud Intake Route',
        incident_type: 'online_financial_fraud',
        destination_workspace_id: 'mock-financial-fraud',
        priority: 1,
        active: true,
        explanation:
          'Demo Routing Rule v1 routes suspected online financial fraud reports to Mock Financial Fraud Intake (Simulated Service).',
        justification:
          'Baseline simulated routing rule for relief-payment, phishing, and wallet transfer fraud.',
        created_by: 'adm_farhan_01',
        timestamp: '2026-11-19T12:00:00.000Z',
      },
    ],
    complaints: [
      {
        complaint_id: 'CMP-2026-001',
        citizen_id: 'cit_tariq_01',
        destination_workspace_id: 'mock-financial-fraud',
        rule_version_id: 'rv_fraud_01_v1',
        current_status: 'SUBMITTED',
        incident_type: 'online_financial_fraud',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-18',
          description:
            'مجھے جعلی سرکاری امداد کے نام پر SMS آیا اور کال کرنے والے نے او ٹی پی کوڈ لے کر 15000 روپے ایزی پیسہ سے نکال لیے۔',
          scam_message:
            'Mubarak! Aapki 25,000 PKR relief imdad manzoor hui hai. Abhi OTP share karein aur link par verify karein.',
          platform: 'SMS / Phone Call',
          money_lost: true,
          amount: 15000,
          currency: 'PKR',
          payment_method: 'Easypaisa',
          transaction_reference: 'SYN-TXN-2026-0041',
          suspect_details: ['+92-300-0000991', 'relief-verify-demo.example'],
          evidence_ids: ['ev_001'],
          citizen_confirmed_corrections: [
            'Confirmed wallet method Easypaisa and amount 15000 PKR.',
          ],
        },
        complaint_draft: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-18',
          description:
            'Citizen shopkeeper reported a fake relief-payment SMS and impersonation call requesting an OTP code, resulting in an unauthorized 15,000 PKR Easypaisa transfer.',
          amount: 15000,
          currency: 'PKR',
          payment_method: 'Easypaisa',
          transaction_reference: 'SYN-TXN-2026-0041',
          suspect_details: ['+92-300-0000991', 'relief-verify-demo.example'],
          evidence_ids: ['ev_001'],
          citizen_confirmed: true,
        },
      },
      {
        complaint_id: 'CMP-2026-002',
        citizen_id: 'cit_sadia_02',
        destination_workspace_id: null,
        rule_version_id: null,
        current_status: 'NEEDS_INFORMATION',
        incident_type: 'online_financial_fraud',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-19',
          description:
            'واٹس ایپ پر جعلی بینک نمائندے نے لنک بھیجا اور اکاؤنٹ بلاک ہونے کا خوف دلا کر رقم ٹرانسفر کروائی۔',
          scam_message:
            'Urgent: Your mobile wallet will be blocked in 1 hour. Send verification fee 4500 PKR immediately.',
          platform: 'WhatsApp',
          money_lost: true,
          amount: 4500,
          currency: 'PKR',
          payment_method: 'JazzCash',
          suspect_details: ['+92-300-0000882'],
          evidence_ids: [],
        },
      },
      {
        complaint_id: 'CMP-2026-003',
        citizen_id: 'cit_tariq_01',
        destination_workspace_id: null,
        rule_version_id: null,
        current_status: 'HUMAN_REVIEW',
        incident_type: 'online_financial_fraud',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-17',
          description:
            'کال کرنے والے نے کہا کوئی پیسہ نہیں کٹا لیکن میسج میں 25000 روپے کی کٹوتی لکھی تھی۔',
          scam_message: '25000 PKR deducted from your wallet.',
          platform: 'Phone Call',
          money_lost: false,
          amount: 25000,
          currency: 'PKR',
          payment_method: 'Raast',
          transaction_reference: null,
          suspect_details: ['+92-300-0000773'],
          evidence_ids: [],
        },
      },
      {
        complaint_id: 'CMP-2026-004',
        citizen_id: 'cit_kamran_03',
        destination_workspace_id: 'mock-digital-safety',
        rule_version_id: 'rv_fraud_01_v1',
        current_status: 'SUBMITTED',
        incident_type: 'online_financial_fraud',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-18',
          description:
            'جعلی انعامی میسج کے ذریعے فیشنگ لنک کھلوا کر 8500 روپے جاز کیش سے منتقل کروائے گئے۔',
          scam_message:
            'Congratulations! Click link to claim digital prize and enter PIN.',
          platform: 'SMS',
          money_lost: true,
          amount: 8500,
          currency: 'PKR',
          payment_method: 'JazzCash',
          transaction_reference: 'SYN-TXN-2026-0099',
          suspect_details: ['prize-claim-demo.example'],
          evidence_ids: [],
        },
        complaint_draft: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-18',
          description:
            'Phishing prize link led to unauthorized 8,500 PKR JazzCash transfer (routed to Mock Digital Safety Intake).',
          amount: 8500,
          currency: 'PKR',
          payment_method: 'JazzCash',
          transaction_reference: 'SYN-TXN-2026-0099',
          suspect_details: ['prize-claim-demo.example'],
          evidence_ids: [],
          citizen_confirmed: true,
        },
      },
      {
        complaint_id: 'CMP-2026-005',
        citizen_id: 'cit_tariq_01',
        destination_workspace_id: 'mock-financial-fraud',
        rule_version_id: 'rv_fraud_01_v1',
        current_status: 'RESOLVED',
        incident_type: 'online_financial_fraud',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-12',
          description:
            'دکان کے نمبر پر جعلی راشن سبسڈی کال آئی، شہری نے بروقت کال بند کر دی اور کوئی رقم ضائع نہیں ہوئی۔',
          scam_message: 'Ration subsidy OTP requested on call.',
          platform: 'Phone Call',
          money_lost: false,
          amount: 0,
          currency: 'PKR',
          payment_method: null,
          transaction_reference: null,
          suspect_details: ['+92-300-0000664'],
          evidence_ids: ['ev_002'],
        },
        complaint_draft: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-12',
          description:
            'Attempted ration-subsidy impersonation scam reported by shopkeeper; no funds were lost.',
          amount: 0,
          currency: 'PKR',
          payment_method: null,
          transaction_reference: null,
          suspect_details: ['+92-300-0000664'],
          evidence_ids: ['ev_002'],
          citizen_confirmed: true,
        },
      },
    ],
    complaint_access_grants: [
      { complaint_id: 'CMP-2026-001', helper_id: 'hlp_bilal_01', active: true },
      { complaint_id: 'CMP-2026-002', helper_id: 'hlp_bilal_01', active: true },
    ],
    case_assignments: [
      {
        complaint_id: 'CMP-2026-001',
        officer_id: 'off_nadia_01',
        workspace_id: 'mock-financial-fraud',
      },
      {
        complaint_id: 'CMP-2026-004',
        officer_id: 'off_zain_02',
        workspace_id: 'mock-digital-safety',
      },
      {
        complaint_id: 'CMP-2026-005',
        officer_id: 'off_nadia_01',
        workspace_id: 'mock-financial-fraud',
      },
    ],
    evidence: [
      {
        evidence_id: 'ev_001',
        complaint_id: 'CMP-2026-001',
        uploader_id: 'cit_tariq_01',
        timestamp: '2026-11-18T15:10:00.000Z',
        file_name: 'easypaisa_receipt_demo.png',
        file_type: 'image/png',
        file_size: 148320,
        sha256:
          '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        verification_status: 'not_authenticity_verified',
      },
      {
        evidence_id: 'ev_002',
        complaint_id: 'CMP-2026-005',
        uploader_id: 'cit_tariq_01',
        timestamp: '2026-11-12T11:20:00.000Z',
        file_name: 'scam_call_log_demo.jpg',
        file_type: 'image/jpeg',
        file_size: 92410,
        sha256:
          '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
        verification_status: 'not_authenticity_verified',
      },
    ],
    evidence_previews: {},
    consents: [
      {
        consent_id: 'con_001',
        complaint_id: 'CMP-2026-001',
        citizen_id: 'cit_tariq_01',
        recipient: 'mock-financial-fraud',
        purpose:
          'Simulated online financial fraud intake review and mock submission',
        data_scopes: [
          'incident_summary',
          'transaction_details',
          'suspect_details',
          'evidence_attachments',
          'synthetic_identity_ref',
        ],
        status: 'granted',
        granted_at: '2026-11-18T15:18:00.000Z',
        changed_at: null,
        withdrawn_at: null,
      },
      {
        consent_id: 'con_002',
        complaint_id: 'CMP-2026-001',
        citizen_id: 'cit_tariq_01',
        recipient: 'hlp_bilal_01',
        purpose: 'Community Helper assistance for gathering supporting details',
        data_scopes: [
          'incident_summary',
          'transaction_details',
          'suspect_details',
          'evidence_attachments',
        ],
        status: 'granted',
        granted_at: '2026-11-18T15:05:00.000Z',
        changed_at: null,
        withdrawn_at: null,
      },
      {
        consent_id: 'con_003',
        complaint_id: 'CMP-2026-002',
        citizen_id: 'cit_sadia_02',
        recipient: 'hlp_bilal_01',
        purpose: 'Community Helper assistance for missing transaction reference',
        data_scopes: [
          'incident_summary',
          'transaction_details',
          'suspect_details',
          'evidence_attachments',
        ],
        status: 'granted',
        granted_at: '2026-11-19T10:12:00.000Z',
        changed_at: null,
        withdrawn_at: null,
      },
      {
        consent_id: 'con_004',
        complaint_id: 'CMP-2026-004',
        citizen_id: 'cit_kamran_03',
        recipient: 'mock-digital-safety',
        purpose: 'Simulated digital safety intake review',
        data_scopes: [
          'incident_summary',
          'transaction_details',
          'suspect_details',
        ],
        status: 'granted',
        granted_at: '2026-11-18T16:40:00.000Z',
        changed_at: null,
        withdrawn_at: null,
      },
      {
        consent_id: 'con_005',
        complaint_id: 'CMP-2026-005',
        citizen_id: 'cit_tariq_01',
        recipient: 'mock-financial-fraud',
        purpose: 'Simulated intake review for attempted scam call',
        data_scopes: ['incident_summary', 'suspect_details', 'evidence_attachments'],
        status: 'granted',
        granted_at: '2026-11-12T11:30:00.000Z',
        changed_at: null,
        withdrawn_at: null,
      },
    ],
    agent_runs: [
      {
        agent_run_id: 'run_001',
        complaint_id: 'CMP-2026-001',
        citizen_id: 'cit_tariq_01',
        language: 'ur',
        transcript:
          'مجھے جعلی سرکاری امداد کے نام پر SMS آیا اور کال کرنے والے نے او ٹی پی کوڈ لے کر 15000 روپے ایزی پیسہ سے نکال لیے۔',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-18',
          description:
            'مجھے جعلی سرکاری امداد کے نام پر SMS آیا اور کال کرنے والے نے او ٹی پی کوڈ لے کر 15000 روپے ایزی پیسہ سے نکال لیے۔',
          scam_message:
            'Mubarak! Aapki 25,000 PKR relief imdad manzoor hui hai. Abhi OTP share karein aur link par verify karein.',
          platform: 'SMS / Phone Call',
          money_lost: true,
          amount: 15000,
          currency: 'PKR',
          payment_method: 'Easypaisa',
          transaction_reference: 'SYN-TXN-2026-0041',
          suspect_details: ['+92-300-0000991', 'relief-verify-demo.example'],
          evidence_ids: ['ev_001'],
        },
        classification: {
          incident_type: 'online_financial_fraud',
          confidence: 0.93,
          suspicious_indicators: [
            'Fake relief-payment / imdad lure in message text',
            'OTP / verification code solicitation over phone call',
            'Suspicious external verification URL (relief-verify-demo.example)',
          ],
          explanation:
            'High-confidence match for fake relief-payment impersonation scam. Confidence is an advisory signal only and does not prove fraud occurred.',
          missing_fields: [],
          contradiction_flags: [],
        },
        readiness_score: 0.98,
        missing_fields: [],
        contradiction_flags: [],
        rule_version_id: 'rv_fraud_01_v1',
        destination_workspace_id: 'mock-financial-fraud',
        consent_granted: true,
        citizen_authorized: true,
        idempotency_key: 'idem-seed-cmp-001',
        submission_reference: 'SIM-FFI-2026-0001',
        current_status: 'SUBMITTED',
        errors: [],
      },
      {
        agent_run_id: 'run_003',
        complaint_id: 'CMP-2026-003',
        citizen_id: 'cit_tariq_01',
        language: 'ur',
        transcript:
          'کال کرنے والے نے کہا کوئی پیسہ نہیں کٹا لیکن میسج میں 25000 روپے کی کٹوتی لکھی تھی۔',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-17',
          description:
            'کال کرنے والے نے کہا کوئی پیسہ نہیں کٹا لیکن میسج میں 25000 روپے کی کٹوتی لکھی تھی۔',
          scam_message: '25000 PKR deducted from your wallet.',
          platform: 'Phone Call',
          money_lost: false,
          amount: 25000,
          currency: 'PKR',
          payment_method: 'Raast',
          transaction_reference: null,
          suspect_details: ['+92-300-0000773'],
          evidence_ids: [],
        },
        classification: {
          incident_type: 'online_financial_fraud',
          confidence: 0.72,
          suspicious_indicators: [
            'Conflicting deduction SMS claim during phone call',
          ],
          explanation:
            'Stopped for Human Review because money_lost is marked No while a 25,000 PKR loss amount is also recorded.',
          missing_fields: [],
          contradiction_flags: [
            'Contradiction: money_lost is marked No, but amount is 25000 PKR.',
          ],
        },
        readiness_score: 0.51,
        missing_fields: [],
        contradiction_flags: [
          'Contradiction: money_lost is marked No, but amount is 25000 PKR.',
        ],
        rule_version_id: null,
        destination_workspace_id: null,
        consent_granted: false,
        citizen_authorized: false,
        idempotency_key: 'idem-seed-cmp-003',
        submission_reference: null,
        current_status: 'HUMAN_REVIEW',
        errors: ['Hard stop triggered: unresolved contradiction flag.'],
      },
      {
        agent_run_id: 'run_004',
        complaint_id: 'CMP-2026-004',
        citizen_id: 'cit_kamran_03',
        language: 'ur',
        transcript:
          'جعلی انعامی میسج کے ذریعے فیشنگ لنک کھلوا کر 8500 روپے جاز کیش سے منتقل کروائے گئے۔',
        incident_data: {
          incident_type: 'online_financial_fraud',
          incident_date: '2026-11-18',
          description:
            'جعلی انعامی میسج کے ذریعے فیشنگ لنک کھلوا کر 8500 روپے جاز کیش سے منتقل کروائے گئے۔',
          scam_message:
            'Congratulations! Click link to claim digital prize and enter PIN.',
          platform: 'SMS',
          money_lost: true,
          amount: 8500,
          currency: 'PKR',
          payment_method: 'JazzCash',
          transaction_reference: 'SYN-TXN-2026-0099',
          suspect_details: ['prize-claim-demo.example'],
          evidence_ids: [],
        },
        classification: {
          incident_type: 'online_financial_fraud',
          confidence: 0.91,
          suspicious_indicators: [
            'Fake prize claim phishing link',
            'PIN entry solicitation',
          ],
          explanation:
            'Classified as online_financial_fraud (phishing prize scam) and routed under rule rv_fraud_01_v1.',
          missing_fields: [],
          contradiction_flags: [],
        },
        readiness_score: 0.94,
        missing_fields: [],
        contradiction_flags: [],
        rule_version_id: 'rv_fraud_01_v1',
        destination_workspace_id: 'mock-digital-safety',
        consent_granted: true,
        citizen_authorized: true,
        idempotency_key: 'idem-seed-cmp-004',
        submission_reference: 'SIM-DSI-2026-0002',
        current_status: 'SUBMITTED',
        errors: [],
      },
    ],
    submissions: [
      {
        submission_id: 'sub_001',
        complaint_id: 'CMP-2026-001',
        idempotency_key: 'idem-seed-cmp-001',
        submission_reference: 'SIM-FFI-2026-0001',
        result: 'Accepted by Mock Financial Fraud Intake (Simulated Service)',
        timestamp: '2026-11-18T15:20:00.000Z',
      },
      {
        submission_id: 'sub_004',
        complaint_id: 'CMP-2026-004',
        idempotency_key: 'idem-seed-cmp-004',
        submission_reference: 'SIM-DSI-2026-0002',
        result: 'Accepted by Mock Digital Safety Intake (Simulated Service)',
        timestamp: '2026-11-18T16:45:00.000Z',
      },
      {
        submission_id: 'sub_005',
        complaint_id: 'CMP-2026-005',
        idempotency_key: 'idem-seed-cmp-005',
        submission_reference: 'SIM-FFI-2026-0003',
        result: 'Accepted and closed by Mock Financial Fraud Intake (Simulated Service)',
        timestamp: '2026-11-12T11:45:00.000Z',
      },
    ],
    audit_logs: [
      {
        audit_log_id: 'aud_001',
        complaint_id: null,
        user_id: 'adm_farhan_01',
        agent_run_id: null,
        action: 'routing_rule_created',
        input: JSON.stringify({
          rule_id: 'rule_fraud_01',
          rule_version_id: 'rv_fraud_01_v1',
          name: 'Online Financial Fraud Intake Route',
          incident_type: 'online_financial_fraud',
          destination_workspace_id: 'mock-financial-fraud',
          priority: 1,
          active: true,
        }),
        result:
          'Immutable rule version rv_fraud_01_v1 -> Mock Financial Fraud Intake',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-19T12:00:00.000Z',
      },
      {
        audit_log_id: 'aud_002',
        complaint_id: 'CMP-2026-001',
        user_id: 'cit_tariq_01',
        agent_run_id: 'run_001',
        action: 'ai_classification_completed',
        input: 'Urdu narrative + SMS scam text + evidence ev_001',
        result:
          'online_financial_fraud (confidence=0.93, readiness=0.98) -> CITIZEN_REVIEW',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-18T15:14:00.000Z',
      },
      {
        audit_log_id: 'aud_003',
        complaint_id: 'CMP-2026-001',
        user_id: 'cit_tariq_01',
        agent_run_id: null,
        action: 'consent_granted',
        input: 'recipient=mock-financial-fraud, scopes=5',
        result: 'Consent con_001 recorded with status=granted',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-18T15:18:00.000Z',
      },
      {
        audit_log_id: 'aud_004',
        complaint_id: 'CMP-2026-001',
        user_id: 'cit_tariq_01',
        agent_run_id: 'run_001',
        action: 'agent_tool_mock_identity_check',
        input: 'identity_reference=SYN-ID-1001',
        result: '200 OK — matched synthetic demo user cit_tariq_01',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-18T15:19:10.000Z',
      },
      {
        audit_log_id: 'aud_005',
        complaint_id: 'CMP-2026-001',
        user_id: 'cit_tariq_01',
        agent_run_id: 'run_001',
        action: 'agent_tool_mock_payment_lookup',
        input: 'transaction_reference=SYN-TXN-2026-0041',
        result: '200 OK — synthetic payment fixture 15000 PKR (Easypaisa)',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-18T15:19:20.000Z',
      },
      {
        audit_log_id: 'aud_006',
        complaint_id: 'CMP-2026-001',
        user_id: 'cit_tariq_01',
        agent_run_id: 'run_001',
        action: 'agent_tool_mock_data_requirements',
        input: 'incident_type=online_financial_fraud',
        result: '200 OK — verified simulated reporting schema fields',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-18T15:19:30.000Z',
      },
      {
        audit_log_id: 'aud_007',
        complaint_id: 'CMP-2026-001',
        user_id: 'cit_tariq_01',
        agent_run_id: 'run_001',
        action: 'agent_tool_mock_complaint_submit',
        input:
          'idempotency_key=idem-seed-cmp-001, workspace=mock-financial-fraud',
        result: '201 Created — simulated reference SIM-FFI-2026-0001',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-18T15:20:00.000Z',
      },
      {
        audit_log_id: 'aud_008',
        complaint_id: 'CMP-2026-003',
        user_id: 'cit_tariq_01',
        agent_run_id: 'run_003',
        action: 'human_review_handoff',
        input: 'money_lost=false, amount=25000',
        result:
          'Stopped at validation: contradiction between money_lost=false and amount=25000 -> HUMAN_REVIEW',
        rule_version_id: null,
        timestamp: '2026-11-17T18:05:00.000Z',
      },
      {
        audit_log_id: 'aud_009',
        complaint_id: 'CMP-2026-005',
        user_id: 'off_nadia_01',
        agent_run_id: null,
        action: 'officer_decision_close',
        input: 'action=close',
        result:
          'Officer Nadia closed CMP-2026-005: Attempted scam call logged for awareness; no funds lost.',
        rule_version_id: 'rv_fraud_01_v1',
        timestamp: '2026-11-13T09:15:00.000Z',
      },
    ],
    notifications: [
      {
        notification_id: 'not_001',
        user_id: 'cit_tariq_01',
        complaint_id: 'CMP-2026-001',
        message:
          'Your complaint CMP-2026-001 was submitted to Mock Financial Fraud Intake (Simulated Ref: SIM-FFI-2026-0001).',
        read: false,
        timestamp: '2026-11-18T15:20:05.000Z',
      },
      {
        notification_id: 'not_002',
        user_id: 'cit_tariq_01',
        complaint_id: 'CMP-2026-003',
        message:
          'CMP-2026-003 paused for Human Review due to conflicting loss amount details.',
        read: false,
        timestamp: '2026-11-17T18:05:10.000Z',
      },
      {
        notification_id: 'not_003',
        user_id: 'cit_tariq_01',
        complaint_id: 'CMP-2026-005',
        message:
          'Officer closed CMP-2026-005: Attempted scam call logged; no funds lost.',
        read: true,
        timestamp: '2026-11-13T09:15:05.000Z',
      },
      {
        notification_id: 'not_004',
        user_id: 'hlp_bilal_01',
        complaint_id: 'CMP-2026-002',
        message:
          'Citizen Sadia needs missing transaction information on authorized case CMP-2026-002.',
        read: false,
        timestamp: '2026-11-19T10:15:00.000Z',
      },
      {
        notification_id: 'not_005',
        user_id: 'off_nadia_01',
        complaint_id: 'CMP-2026-001',
        message:
          'New simulated complaint CMP-2026-001 assigned to Mock Financial Fraud Intake.',
        read: false,
        timestamp: '2026-11-18T15:20:05.000Z',
      },
      {
        notification_id: 'not_006',
        user_id: 'off_zain_02',
        complaint_id: 'CMP-2026-004',
        message:
          'New simulated complaint CMP-2026-004 assigned to Mock Digital Safety Intake.',
        read: false,
        timestamp: '2026-11-18T16:45:05.000Z',
      },
      {
        notification_id: 'not_007',
        user_id: 'adm_farhan_01',
        complaint_id: 'CMP-2026-003',
        message:
          'Case CMP-2026-003 entered HUMAN_REVIEW; trace ready in Read-Only Audit.',
        read: false,
        timestamp: nowBase,
      },
    ],
    api_keys: [
      {
        api_key_id: 'key_demo_01',
        scopes: ['complaints:read', 'admin:rules'],
        expires_at: '2027-01-31T23:59:59.000Z',
        revoked: false,
        key_hash:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    ],
    mock_identity_records: [
      { identity_reference: 'SYN-ID-1001', user_id: 'cit_tariq_01' },
      { identity_reference: 'SYN-ID-1002', user_id: 'cit_sadia_02' },
      { identity_reference: 'SYN-ID-1003', user_id: 'cit_kamran_03' },
    ],
    mock_payment_transactions: [
      {
        transaction_reference: 'SYN-TXN-2026-0041',
        amount: 15000,
        currency: 'PKR',
        payment_method: 'Easypaisa',
      },
      {
        transaction_reference: 'SYN-TXN-2026-0077',
        amount: 15000,
        currency: 'PKR',
        payment_method: 'Easypaisa',
      },
      {
        transaction_reference: 'SYN-TXN-2026-0099',
        amount: 8500,
        currency: 'PKR',
        payment_method: 'JazzCash',
      },
    ],
    mock_reporting_requirements: [
      {
        incident_type: 'online_financial_fraud',
        requirements: [
          'description',
          'incident_date',
          'platform',
          'money_lost',
          'citizen_confirmed_consent',
        ],
        available_fields: [
          'incident_type',
          'incident_date',
          'description',
          'scam_message',
          'platform',
          'money_lost',
          'amount',
          'currency',
          'payment_method',
          'transaction_reference',
          'suspect_details',
          'evidence_ids',
        ],
      },
    ],
    counters: {
      complaint: 6,
      evidence: 3,
      consent: 6,
      rule: 2,
      agent_run: 6,
      submission: 6,
      audit: 10,
      notification: 8,
      api_key: 2,
    },
  };
}

function loadDb(): MockDatabase {
  try {
    const raw = localStorage.getItem(MOCK_DB_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as MockDatabase;
    }
  } catch {
    // Fall back to fresh DB if storage is unavailable or corrupted
  }
  const initial = createInitialDb();
  saveDb(initial);
  return initial;
}

function saveDb(db: MockDatabase): void {
  try {
    localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore quota limits for large previews; trim previews if needed
    const stripped = { ...db, evidence_previews: {} };
    try {
      localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(stripped));
    } catch {
      // ignore
    }
  }
}

export function resetMockDb(): void {
  const initial = createInitialDb();
  saveDb(initial);
}

export function isMockOfflineSimulated(): boolean {
  try {
    return localStorage.getItem(MOCK_OFFLINE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setMockOfflineSimulated(offline: boolean): void {
  try {
    localStorage.setItem(MOCK_OFFLINE_STORAGE_KEY, offline ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function assertConnected(): void {
  if (
    isMockOfflineSimulated() ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    throw new DastakApiError(
      0,
      'NETWORK_ERROR',
      'Connection unavailable (simulated weak/dropped network). Draft changes remain saved locally.',
    );
  }
}

async function delay(ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function requireUser(db: MockDatabase, token: string | null): StoredUser {
  if (!token || !token.startsWith('mock-jwt.')) {
    throw new DastakApiError(
      401,
      'unauthorized',
      'Authentication required. Please sign in with a synthetic demo account.',
    );
  }
  const parts = token.split('.');
  const userId = parts[1];
  const found = db.users.find((u) => u.user_id === userId);
  if (!found) {
    throw new DastakApiError(
      401,
      'invalid_token',
      'Session token is invalid or user no longer exists.',
    );
  }
  return found;
}

function nextId(db: MockDatabase, kind: keyof MockDatabase['counters'], prefix: string): string {
  const num = db.counters[kind];
  db.counters[kind] += 1;
  return `${prefix}${String(num).padStart(3, '0')}`;
}

function appendAudit(
  db: MockDatabase,
  entry: Omit<AuditLogRecord, 'audit_log_id' | 'timestamp'>,
): void {
  db.audit_logs.unshift({
    audit_log_id: nextId(db, 'audit', 'aud_'),
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

function appendNotification(
  db: MockDatabase,
  user_id: string,
  complaint_id: string,
  message: string,
): void {
  db.notifications.unshift({
    notification_id: nextId(db, 'notification', 'not_'),
    user_id,
    complaint_id,
    message,
    read: false,
    timestamp: new Date().toISOString(),
  });
}

function hasActiveConsentForRecipient(
  db: MockDatabase,
  complaintId: string,
  recipient: string,
): ConsentRecord | undefined {
  return db.consents.find(
    (c) =>
      c.complaint_id === complaintId &&
      c.recipient === recipient &&
      c.status === 'granted',
  );
}

function filterComplaintByScopes(
  complaint: ComplaintRecord,
  scopes: string[],
): ComplaintRecord {
  const allowSummary = scopes.includes('incident_summary');
  const allowTxn = scopes.includes('transaction_details');
  const allowSuspect = scopes.includes('suspect_details');
  const allowEvidence = scopes.includes('evidence_attachments');

  const src = complaint.incident_data;
  const filteredIncident: IncidentInformation = {
    incident_type: allowSummary ? src.incident_type : undefined,
    incident_date: allowSummary ? src.incident_date : undefined,
    description: allowSummary ? src.description : '[Hidden by citizen consent scope]',
    scam_message: allowSummary ? src.scam_message : undefined,
    platform: allowSummary ? src.platform : undefined,
    money_lost: allowTxn ? src.money_lost : undefined,
    amount: allowTxn ? src.amount : undefined,
    currency: allowTxn ? src.currency : undefined,
    payment_method: allowTxn ? src.payment_method : undefined,
    transaction_reference: allowTxn ? src.transaction_reference : undefined,
    suspect_details: allowSuspect ? src.suspect_details : [],
    evidence_ids: allowEvidence ? src.evidence_ids : [],
  };

  let filteredDraft: ComplaintDraft | undefined = complaint.complaint_draft;
  if (filteredDraft) {
    filteredDraft = {
      incident_type: filteredDraft.incident_type,
      incident_date: allowSummary ? filteredDraft.incident_date : null,
      description: allowSummary
        ? filteredDraft.description
        : '[Hidden by citizen consent scope]',
      amount: allowTxn ? filteredDraft.amount : null,
      currency: allowTxn ? filteredDraft.currency : null,
      payment_method: allowTxn ? filteredDraft.payment_method : null,
      transaction_reference: allowTxn
        ? filteredDraft.transaction_reference
        : null,
      suspect_details: allowSuspect ? filteredDraft.suspect_details : [],
      evidence_ids: allowEvidence ? filteredDraft.evidence_ids : [],
      citizen_confirmed: filteredDraft.citizen_confirmed,
    };
  }

  return {
    complaint_id: complaint.complaint_id,
    citizen_id: complaint.citizen_id,
    destination_workspace_id: complaint.destination_workspace_id,
    rule_version_id: complaint.rule_version_id,
    current_status: complaint.current_status,
    incident_type: complaint.incident_type ?? null,
    incident_data: filteredIncident,
    ...(filteredDraft ? { complaint_draft: filteredDraft } : {}),
  };
}

function sanitizeUser(u: StoredUser): UserRecord {
  return {
    user_id: u.user_id,
    role: u.role,
    workspace_id: u.workspace_id,
  };
}

function cleanIncident(input: IncidentInformation): IncidentInformation {
  const out: IncidentInformation = {};
  if (input.incident_type !== undefined) out.incident_type = input.incident_type;
  if (input.incident_date !== undefined) out.incident_date = input.incident_date;
  if (input.description !== undefined) out.description = input.description;
  if (input.scam_message !== undefined) out.scam_message = input.scam_message;
  if (input.platform !== undefined) out.platform = input.platform;
  if (input.money_lost !== undefined) out.money_lost = input.money_lost;
  if (input.amount !== undefined) out.amount = input.amount;
  if (input.currency !== undefined) out.currency = input.currency;
  if (input.payment_method !== undefined) out.payment_method = input.payment_method;
  if (input.transaction_reference !== undefined) {
    out.transaction_reference = input.transaction_reference;
  }
  if (input.suspect_details !== undefined) out.suspect_details = input.suspect_details;
  if (input.evidence_ids !== undefined) out.evidence_ids = input.evidence_ids;
  if (input.citizen_confirmed_corrections !== undefined) {
    out.citizen_confirmed_corrections = input.citizen_confirmed_corrections;
  }
  return out;
}

async function computeSha256Hex(file: File): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Fallback below if WebCrypto unavailable
  }
  const seed = `${file.name}:${file.size}:${file.lastModified}`;
  let acc = '';
  for (let i = 0; i < 64; i += 1) {
    const code = seed.charCodeAt(i % seed.length) + i * 17;
    acc += (code % 16).toString(16);
  }
  return acc;
}

function readPreviewDataUrl(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size > 1_200_000) {
      resolve(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : undefined);
    };
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
}

function extractNumbersFromText(text: string): number[] {
  const matches = text.match(/\b\d[\d,]{2,}\b/g) ?? [];
  return matches
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 100);
}

function buildClassificationAndReadiness(
  db: MockDatabase,
  complaint: ComplaintRecord,
): {
  classification: ClassificationResult;
  readiness_score: number;
  nextStatus: ComplaintRecord['current_status'];
  matchedRule: RoutingRuleRecord | null;
} {
  const data = complaint.incident_data;
  const combinedText = `${data.description ?? ''} ${data.scam_message ?? ''}`.toLowerCase();

  const indicators: string[] = [];
  if (
    /imdad|امداد|ehsaas|احساس|benazir|relief|subsidy|راشن|انعام|prize|lottery/.test(
      combinedText,
    )
  ) {
    indicators.push('Fake relief-payment, subsidy, or prize lure detected');
  }
  if (/otp|pin|code|کوڈ|او ٹی پی|پن/.test(combinedText)) {
    indicators.push('Solicitation of one-time passcode (OTP) or wallet PIN');
  }
  if (/urgent|block|suspend|فوری|بلاک|بند|verify|کلک|لنک|http|\.example/.test(combinedText)) {
    indicators.push('Urgency pressure or unverified verification link');
  }
  if (/easypaisa|jazzcash|raast|ایزی پیسہ|جاز کیش|راست|bank|بینک/.test(combinedText)) {
    indicators.push('Mobile wallet or bank transfer mechanism mentioned');
  }
  if (indicators.length === 0 && (data.description ?? '').trim().length >= 15) {
    indicators.push('Suspected online financial solicitation reported by citizen');
  }

  const contradictions: string[] = [];
  if (data.money_lost === false && data.amount != null && data.amount > 0) {
    contradictions.push(
      `Contradiction: money_lost is marked No, while reported amount is ${data.amount} ${data.currency ?? 'PKR'}.`,
    );
  }
  if (data.money_lost === true && data.amount === 0) {
    contradictions.push(
      'Contradiction: money_lost is marked Yes, while amount is 0.',
    );
  }
  if (
    data.description &&
    data.amount != null &&
    data.amount > 0 &&
    /کوئی پیسہ نہیں|no money lost|didn't lose|not lost/i.test(data.description)
  ) {
    contradictions.push(
      'Contradiction: narrative states no money was lost, yet an amount was entered.',
    );
  }

  const descNumbers = extractNumbersFromText(data.description ?? '');
  if (
    data.amount != null &&
    data.amount > 0 &&
    descNumbers.length > 0 &&
    !descNumbers.includes(data.amount) &&
    descNumbers.some((n) => n !== data.amount && n >= 500)
  ) {
    contradictions.push(
      `Contradiction: narrative mentions ${descNumbers.join(', ')} PKR while structured amount is ${data.amount} PKR.`,
    );
  }

  const txRef = data.transaction_reference?.trim();
  if (txRef) {
    const duplicate = db.complaints.find(
      (other) =>
        other.complaint_id !== complaint.complaint_id &&
        other.incident_data.transaction_reference?.trim().toLowerCase() ===
          txRef.toLowerCase(),
    );
    if (duplicate) {
      contradictions.push(
        `Possible duplicate: transaction reference ${txRef} already appears on ${duplicate.complaint_id}.`,
      );
    }
  }

  const missing: string[] = [];
  if (!data.description || data.description.trim().length < 12) {
    missing.push('description');
  }
  if (!data.incident_date || data.incident_date.trim().length === 0) {
    missing.push('incident_date');
  }
  if (!data.platform || data.platform.trim().length === 0) {
    missing.push('platform');
  }
  if (data.money_lost === undefined || data.money_lost === null) {
    missing.push('money_lost');
  } else if (data.money_lost === true) {
    if (data.amount === undefined || data.amount === null) {
      missing.push('amount');
    }
    if (!data.payment_method || data.payment_method.trim().length === 0) {
      missing.push('payment_method');
    }
    if (data.transaction_reference === undefined) {
      missing.push('transaction_reference');
    }
  }
  if (!data.suspect_details || data.suspect_details.length === 0) {
    missing.push('suspect_details');
  }

  const requiredCount = data.money_lost === true ? 8 : 5;
  const presentCount = Math.max(0, requiredCount - missing.length);
  const completeness = Math.min(1, presentCount / requiredCount);

  const incidentType = data.incident_type || 'online_financial_fraud';
  const descLen = (data.description ?? '').trim().length;
  let confidence = 0.5;
  if (descLen >= 25 && indicators.length >= 2) {
    confidence = 0.92;
  } else if (descLen >= 15 && indicators.length >= 1) {
    confidence = 0.84;
  } else if (descLen >= 10) {
    confidence = 0.68;
  }

  const activeMatchingRules = [...db.routing_rules]
    .filter(
      (r) =>
        r.active &&
        (r.incident_type === incidentType ||
          r.incident_type === 'online_financial_fraud' ||
          r.incident_type === '*'),
    )
    .sort((a, b) => a.priority - b.priority);

  const matchedRule = activeMatchingRules[0] ?? null;
  const ruleMatch = matchedRule ? 1 : 0;
  const consistency = contradictions.length === 0 ? 1 : 0.25;

  const readiness = Number(
    (
      0.35 * confidence +
      0.3 * completeness +
      0.2 * consistency +
      0.15 * ruleMatch
    ).toFixed(2),
  );

  let explanation = '';
  if (contradictions.length > 0) {
    explanation =
      'Paused for Human Review because conflicting details were detected. Confidence indicators do not prove fraud.';
  } else if (!matchedRule) {
    explanation =
      'Paused for Human Review because no active routing rule matched this incident type.';
  } else if (readiness < 0.6) {
    explanation =
      'Low readiness or sparse description — stopped and handed over for Human Review rather than guessing.';
  } else if (missing.length > 0 || readiness < 0.85) {
    explanation =
      'Classified as suspected online financial fraud. A few clarifying details are requested before preparing the formal complaint.';
  } else {
    explanation = `Ready for citizen review. Matched active rule ${matchedRule.rule_version_id} (${getWorkspaceName(matchedRule.destination_workspace_id)}). Confidence score is advisory only.`;
  }

  let nextStatus: ComplaintRecord['current_status'] = 'CITIZEN_REVIEW';
  if (contradictions.length > 0 || !matchedRule || readiness < 0.6) {
    nextStatus = 'HUMAN_REVIEW';
  } else if (missing.length > 0 || readiness < 0.85) {
    nextStatus = 'NEEDS_INFORMATION';
  }

  return {
    classification: {
      incident_type: incidentType,
      confidence,
      suspicious_indicators: indicators,
      explanation,
      missing_fields: missing,
      contradiction_flags: contradictions,
    },
    readiness_score: readiness,
    nextStatus,
    matchedRule,
  };
}

export function getMockEvidenceRecord(evidenceId: string): {
  evidence: EvidenceRecord;
  preview_data_url?: string;
} | null {
  const db = loadDb();
  const ev = db.evidence.find((e) => e.evidence_id === evidenceId);
  if (!ev) return null;
  return {
    evidence: ev,
    preview_data_url: db.evidence_previews[evidenceId],
  };
}

export const mockApi = {
  async login(payload: LoginRequest): Promise<LoginResult> {
    assertConnected();
    await delay();
    const db = loadDb();
    const user = db.users.find(
      (u) =>
        u.user_id.toLowerCase() === payload.user_id.trim().toLowerCase() &&
        u.password === payload.password,
    );
    if (!user) {
      throw new DastakApiError(
        401,
        'invalid_credentials',
        'Invalid demo user ID or password.',
      );
    }
    return {
      access_token: `mock-jwt.${user.user_id}.demo`,
    };
  },

  async getMe(token: string | null): Promise<UserRecord> {
    assertConnected();
    await delay(60);
    const db = loadDb();
    const user = requireUser(db, token);
    return sanitizeUser(user);
  },

  async createComplaint(
    token: string | null,
    payload: IncidentInformation,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay();
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Citizen') {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only a Citizen account can create a complaint draft.',
      );
    }
    const num = db.counters.complaint;
    db.counters.complaint += 1;
    const complaintId = `CMP-2026-${String(num).padStart(3, '0')}`;
    const cleaned = cleanIncident(payload);
    const record: ComplaintRecord = {
      complaint_id: complaintId,
      citizen_id: user.user_id,
      destination_workspace_id: null,
      rule_version_id: null,
      current_status: 'DRAFT',
      incident_type: cleaned.incident_type ?? 'online_financial_fraud',
      incident_data: {
        incident_type: cleaned.incident_type ?? 'online_financial_fraud',
        currency: cleaned.currency ?? 'PKR',
        evidence_ids: cleaned.evidence_ids ?? [],
        suspect_details: cleaned.suspect_details ?? [],
        ...cleaned,
      },
    };
    db.complaints.unshift(record);
    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'complaint_draft_created',
      input: `incident_type=${record.incident_type}`,
      result: `Created draft ${complaintId}`,
      rule_version_id: null,
    });
    saveDb(db);
    return record;
  },

  async listComplaints(token: string | null): Promise<ComplaintRecord[]> {
    assertConnected();
    await delay(80);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Citizen') {
      throw new DastakApiError(
        403,
        'forbidden',
        'Citizen complaint listing is restricted to Citizen accounts.',
      );
    }
    return db.complaints.filter((c) => c.citizen_id === user.user_id);
  },

  async getComplaint(
    token: string | null,
    complaintId: string,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay(80);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(
        404,
        'not_found',
        `Complaint ${complaintId} was not found.`,
      );
    }

    if (user.role === 'Citizen') {
      if (complaint.citizen_id !== user.user_id) {
        throw new DastakApiError(
          403,
          'forbidden',
          'Access denied: Citizens can only view their own complaints.',
        );
      }
      return complaint;
    }

    if (user.role === 'Helper') {
      const grant = db.complaint_access_grants.find(
        (g) =>
          g.complaint_id === complaintId &&
          g.helper_id === user.user_id &&
          g.active,
      );
      if (!grant) {
        throw new DastakApiError(
          403,
          'helper_grant_required',
          `Access denied (403): Helper ${user.user_id} has no active case-level access grant for ${complaintId}.`,
        );
      }
      const consent = hasActiveConsentForRecipient(
        db,
        complaintId,
        user.user_id,
      );
      if (!consent) {
        throw new DastakApiError(
          403,
          'consent_withdrawn',
          `Access blocked (403): Citizen withdrew or has not granted data-sharing consent for helper ${user.user_id} on ${complaintId}.`,
        );
      }
      return filterComplaintByScopes(complaint, consent.data_scopes);
    }

    throw new DastakApiError(
      403,
      'forbidden',
      `Role ${user.role} must use its role-scoped endpoint instead of Citizen complaint read.`,
    );
  },

  async updateComplaint(
    token: string | null,
    complaintId: string,
    patch: IncidentPatch,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(
        404,
        'not_found',
        `Complaint ${complaintId} was not found.`,
      );
    }
    if (user.role !== 'Citizen' || complaint.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can modify or confirm corrections on this draft.',
      );
    }

    const updatedIncident: IncidentInformation = { ...complaint.incident_data };
    const keys = Object.keys(patch) as Array<keyof IncidentPatch>;
    for (const k of keys) {
      if (patch[k] !== undefined) {
        (updatedIncident as Record<string, unknown>)[k] = patch[k];
      }
    }
    complaint.incident_data = updatedIncident;
    if (patch.incident_type !== undefined) {
      complaint.incident_type = patch.incident_type;
    }

    if (complaint.complaint_draft) {
      complaint.complaint_draft = {
        incident_type:
          updatedIncident.incident_type || complaint.complaint_draft.incident_type,
        incident_date:
          updatedIncident.incident_date !== undefined
            ? updatedIncident.incident_date
            : complaint.complaint_draft.incident_date,
        description:
          updatedIncident.description || complaint.complaint_draft.description,
        amount:
          updatedIncident.amount !== undefined
            ? updatedIncident.amount
            : complaint.complaint_draft.amount,
        currency:
          updatedIncident.currency !== undefined
            ? updatedIncident.currency
            : complaint.complaint_draft.currency,
        payment_method:
          updatedIncident.payment_method !== undefined
            ? updatedIncident.payment_method
            : complaint.complaint_draft.payment_method,
        transaction_reference:
          updatedIncident.transaction_reference !== undefined
            ? updatedIncident.transaction_reference
            : complaint.complaint_draft.transaction_reference,
        suspect_details:
          updatedIncident.suspect_details ?? complaint.complaint_draft.suspect_details,
        evidence_ids:
          updatedIncident.evidence_ids ?? complaint.complaint_draft.evidence_ids,
        citizen_confirmed:
          (patch.citizen_confirmed_corrections?.length ?? 0) > 0 ||
          complaint.complaint_draft.citizen_confirmed,
      };
    }

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'complaint_updated',
      input: `fields=${keys.join(',')}`,
      result: 'Draft updated by citizen',
      rule_version_id: complaint.rule_version_id,
    });
    saveDb(db);
    return complaint;
  },

  async uploadEvidence(
    token: string | null,
    complaintId: string,
    file: File,
  ): Promise<{ evidence: EvidenceRecord; preview_data_url?: string }> {
    assertConnected();
    await delay(140);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(
        404,
        'not_found',
        `Complaint ${complaintId} was not found.`,
      );
    }

    if (user.role === 'Citizen') {
      if (complaint.citizen_id !== user.user_id) {
        throw new DastakApiError(403, 'forbidden', 'Not complaint owner.');
      }
    } else if (user.role === 'Helper') {
      const grant = db.complaint_access_grants.find(
        (g) =>
          g.complaint_id === complaintId &&
          g.helper_id === user.user_id &&
          g.active,
      );
      const consent = hasActiveConsentForRecipient(db, complaintId, user.user_id);
      if (!grant || !consent) {
        throw new DastakApiError(
          403,
          'forbidden',
          'Helper lacks active grant and consent to attach evidence.',
        );
      }
    } else {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen or an authorized Helper can upload evidence.',
      );
    }

    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
    if (!allowed.has(file.type)) {
      throw new DastakApiError(
        400,
        'invalid_file_type',
        'Only PNG, JPEG, WebP images and PDF files are accepted.',
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new DastakApiError(
        400,
        'file_too_large',
        'Evidence file exceeds 5 MB limit.',
      );
    }

    const sha256 = await computeSha256Hex(file);
    const preview = await readPreviewDataUrl(file);
    const evidenceId = nextId(db, 'evidence', 'ev_');
    const record: EvidenceRecord = {
      evidence_id: evidenceId,
      complaint_id: complaintId,
      uploader_id: user.user_id,
      timestamp: new Date().toISOString(),
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      sha256,
      verification_status: 'not_authenticity_verified',
    };

    db.evidence.push(record);
    if (preview) {
      db.evidence_previews[evidenceId] = preview;
    }

    const currentIds = complaint.incident_data.evidence_ids ?? [];
    complaint.incident_data = {
      ...complaint.incident_data,
      evidence_ids: [...currentIds, evidenceId],
    };
    if (complaint.complaint_draft) {
      complaint.complaint_draft = {
        ...complaint.complaint_draft,
        evidence_ids: [...complaint.complaint_draft.evidence_ids, evidenceId],
      };
    }

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'evidence_uploaded',
      input: `${file.name} (${file.type}, sha256=${sha256.slice(0, 12)}...)`,
      result: 'Stored privately; labeled not_authenticity_verified',
      rule_version_id: complaint.rule_version_id,
    });
    saveDb(db);
    return { evidence: record, preview_data_url: preview };
  },

  async analyzeComplaint(
    token: string | null,
    complaintId: string,
  ): Promise<AnalysisResponse> {
    assertConnected();
    await delay(260);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(
        404,
        'not_found',
        `Complaint ${complaintId} was not found.`,
      );
    }
    if (user.role !== 'Citizen' || complaint.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can trigger AI incident analysis.',
      );
    }

    const { classification, readiness_score, nextStatus, matchedRule } =
      buildClassificationAndReadiness(db, complaint);

    complaint.current_status = nextStatus;
    complaint.incident_type = classification.incident_type;
    complaint.destination_workspace_id = matchedRule
      ? matchedRule.destination_workspace_id
      : null;
    complaint.rule_version_id = matchedRule ? matchedRule.rule_version_id : null;

    if (nextStatus === 'CITIZEN_REVIEW') {
      const d = complaint.incident_data;
      complaint.complaint_draft = {
        incident_type: classification.incident_type,
        incident_date: d.incident_date ?? null,
        description:
          d.description ??
          'Suspected online financial fraud reported by citizen.',
        amount: d.amount ?? null,
        currency: d.currency ?? 'PKR',
        payment_method: d.payment_method ?? null,
        transaction_reference: d.transaction_reference ?? null,
        suspect_details: d.suspect_details ?? [],
        evidence_ids: d.evidence_ids ?? [],
        citizen_confirmed: false,
      };
    }

    const runId = nextId(db, 'agent_run', 'run_');
    const existingRunIndex = db.agent_runs.findIndex(
      (r) => r.complaint_id === complaintId,
    );
    const runRecord: AgentRunRecord = {
      agent_run_id:
        existingRunIndex >= 0
          ? db.agent_runs[existingRunIndex].agent_run_id
          : runId,
      complaint_id: complaintId,
      citizen_id: user.user_id,
      language: 'ur',
      transcript: complaint.incident_data.description ?? null,
      incident_data: complaint.incident_data,
      classification,
      readiness_score,
      missing_fields: classification.missing_fields,
      contradiction_flags: classification.contradiction_flags,
      rule_version_id: complaint.rule_version_id,
      destination_workspace_id: complaint.destination_workspace_id,
      consent_granted: Boolean(
        complaint.destination_workspace_id &&
          hasActiveConsentForRecipient(
            db,
            complaintId,
            complaint.destination_workspace_id,
          ),
      ),
      citizen_authorized: false,
      idempotency_key: `idem-${complaintId.toLowerCase()}`,
      submission_reference: null,
      current_status: nextStatus,
      errors:
        nextStatus === 'HUMAN_REVIEW'
          ? ['Stopped for Human Review per readiness/hard-stop policy.']
          : [],
    };
    if (existingRunIndex >= 0) {
      db.agent_runs[existingRunIndex] = runRecord;
    } else {
      db.agent_runs.unshift(runRecord);
    }

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: runRecord.agent_run_id,
      action:
        nextStatus === 'HUMAN_REVIEW'
          ? 'human_review_handoff'
          : 'ai_classification_and_routing',
      input: `description_len=${(complaint.incident_data.description ?? '').length}, tx_ref=${complaint.incident_data.transaction_reference ?? 'unknown'}`,
      result: `${classification.incident_type} (conf=${classification.confidence}, readiness=${readiness_score}) -> ${nextStatus} [workspace=${complaint.destination_workspace_id ?? 'none'}]`,
      rule_version_id: complaint.rule_version_id,
    });

    saveDb(db);
    return {
      classification,
      readiness_score,
      current_status: nextStatus,
    };
  },

  async authorizeSubmission(
    token: string | null,
    complaintId: string,
    payload: AuthorizeSubmission,
    idempotencyKey: string,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay(280);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(
        404,
        'not_found',
        `Complaint ${complaintId} was not found.`,
      );
    }
    if (user.role !== 'Citizen' || complaint.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can authorize complaint submission.',
      );
    }
    if (payload.citizen_authorized !== true) {
      throw new DastakApiError(
        400,
        'authorization_required',
        'Explicit citizen_authorized=true is required.',
      );
    }

    const existingForKey = db.submissions.find(
      (s) => s.idempotency_key === idempotencyKey,
    );
    if (existingForKey) {
      if (existingForKey.complaint_id !== complaintId) {
        throw new DastakApiError(
          409,
          'idempotency_conflict',
          'Idempotency-Key was already used for a different complaint payload.',
        );
      }
      return complaint;
    }

    if (
      complaint.current_status === 'HUMAN_REVIEW' ||
      !complaint.destination_workspace_id ||
      !complaint.rule_version_id ||
      !complaint.complaint_draft
    ) {
      throw new DastakApiError(
        409,
        'invalid_state',
        'Complaint must complete AI review and have a valid routing rule before submission.',
      );
    }

    const activeConsent = hasActiveConsentForRecipient(
      db,
      complaintId,
      complaint.destination_workspace_id,
    );
    if (!activeConsent) {
      throw new DastakApiError(
        403,
        'consent_required',
        `Active data-sharing consent for ${getWorkspaceName(complaint.destination_workspace_id)} is required before submission.`,
      );
    }

    const runIndex = db.agent_runs.findIndex(
      (r) => r.complaint_id === complaintId,
    );
    const agentRunId =
      runIndex >= 0
        ? db.agent_runs[runIndex].agent_run_id
        : nextId(db, 'agent_run', 'run_');

    const storedUser = db.users.find((u) => u.user_id === user.user_id);
    const identityRef = storedUser?.synthetic_identity_ref ?? 'SYN-ID-1001';

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: agentRunId,
      action: 'agent_tool_mock_identity_check',
      input: `identity_reference=${identityRef}`,
      result: `200 OK — matched synthetic user ${user.user_id}`,
      rule_version_id: complaint.rule_version_id,
    });

    const txRef = complaint.complaint_draft.transaction_reference;
    const foundPayment = txRef
      ? db.mock_payment_transactions.find(
          (p) => p.transaction_reference === txRef,
        )
      : undefined;
    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: agentRunId,
      action: 'agent_tool_mock_payment_lookup',
      input: `transaction_reference=${txRef ?? 'none'}`,
      result: txRef
        ? foundPayment
          ? `200 OK — synthetic fixture ${foundPayment.amount} ${foundPayment.currency}`
          : '404 not_found — transaction not in simulated fixtures (does not invalidate citizen claim)'
        : 'Skipped — citizen recorded transaction reference as unknown',
      rule_version_id: complaint.rule_version_id,
    });

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: agentRunId,
      action: 'agent_tool_mock_data_requirements',
      input: `incident_type=${complaint.complaint_draft.incident_type}`,
      result: '200 OK — simulated reporting schema satisfied',
      rule_version_id: complaint.rule_version_id,
    });

    const subNum = db.counters.submission;
    db.counters.submission += 1;
    const prefix =
      complaint.destination_workspace_id === 'mock-digital-safety'
        ? 'SIM-DSI'
        : 'SIM-FFI';
    const simRef = `${prefix}-2026-${String(subNum).padStart(4, '0')}`;

    const submissionRecord: SubmissionRecord = {
      submission_id: `sub_${String(subNum).padStart(3, '0')}`,
      complaint_id: complaintId,
      idempotency_key: idempotencyKey,
      submission_reference: simRef,
      result: `Accepted by ${getWorkspaceName(complaint.destination_workspace_id)} (Simulated Service)`,
      timestamp: new Date().toISOString(),
    };
    db.submissions.push(submissionRecord);

    complaint.complaint_draft = {
      ...complaint.complaint_draft,
      citizen_confirmed: true,
    };
    complaint.current_status = 'SUBMITTED';

    const workspaceOfficer = db.users.find(
      (u) =>
        u.role === 'Officer' &&
        u.workspace_id === complaint.destination_workspace_id,
    );
    if (workspaceOfficer) {
      const existingAssign = db.case_assignments.find(
        (a) => a.complaint_id === complaintId,
      );
      if (!existingAssign) {
        db.case_assignments.push({
          complaint_id: complaintId,
          officer_id: workspaceOfficer.user_id,
          workspace_id: complaint.destination_workspace_id,
        });
      }
      appendNotification(
        db,
        workspaceOfficer.user_id,
        complaintId,
        `New authorized complaint ${complaintId} assigned to ${getWorkspaceName(complaint.destination_workspace_id)} (Simulated Ref: ${simRef}).`,
      );
    }

    if (runIndex >= 0) {
      db.agent_runs[runIndex] = {
        ...db.agent_runs[runIndex],
        consent_granted: true,
        citizen_authorized: true,
        idempotency_key: idempotencyKey,
        submission_reference: simRef,
        current_status: 'SUBMITTED',
      };
    }

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: agentRunId,
      action: 'agent_tool_mock_complaint_submit',
      input: `idempotency_key=${idempotencyKey}, workspace=${complaint.destination_workspace_id}`,
      result: `201 Created — simulated reference ${simRef}`,
      rule_version_id: complaint.rule_version_id,
    });

    appendNotification(
      db,
      user.user_id,
      complaintId,
      `Complaint ${complaintId} submitted to ${getWorkspaceName(complaint.destination_workspace_id)} (Simulated Ref: ${simRef}).`,
    );

    saveDb(db);
    return complaint;
  },

  async listConsents(
    token: string | null,
    complaintId: string,
  ): Promise<ConsentRecord[]> {
    assertConnected();
    await delay(70);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(404, 'not_found', 'Complaint not found.');
    }
    if (user.role !== 'Citizen' || complaint.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can view and manage consent records.',
      );
    }
    return db.consents.filter((c) => c.complaint_id === complaintId);
  },

  async grantConsent(
    token: string | null,
    complaintId: string,
    payload: ConsentGrant,
  ): Promise<ConsentRecord> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(404, 'not_found', 'Complaint not found.');
    }
    if (user.role !== 'Citizen' || complaint.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can grant data-sharing consent. Helpers and Admins cannot bypass consent.',
      );
    }
    if (!payload.data_scopes || payload.data_scopes.length === 0) {
      throw new DastakApiError(
        400,
        'invalid_scopes',
        'At least one data scope must be selected.',
      );
    }

    const record: ConsentRecord = {
      consent_id: nextId(db, 'consent', 'con_'),
      complaint_id: complaintId,
      citizen_id: user.user_id,
      recipient: payload.recipient,
      purpose: payload.purpose,
      data_scopes: [...new Set(payload.data_scopes)],
      status: 'granted',
      granted_at: new Date().toISOString(),
      changed_at: null,
      withdrawn_at: null,
    };
    db.consents.push(record);

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'consent_granted',
      input: `recipient=${record.recipient}, scopes=${record.data_scopes.join('|')}`,
      result: `Consent ${record.consent_id} granted`,
      rule_version_id: complaint.rule_version_id,
    });
    saveDb(db);
    return record;
  },

  async changeConsent(
    token: string | null,
    consentId: string,
    payload: ConsentChange,
  ): Promise<ConsentRecord> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    const consent = db.consents.find((c) => c.consent_id === consentId);
    if (!consent) {
      throw new DastakApiError(404, 'not_found', 'Consent record not found.');
    }
    if (user.role !== 'Citizen' || consent.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can modify this consent record.',
      );
    }
    if (consent.status === 'withdrawn') {
      throw new DastakApiError(
        409,
        'consent_already_withdrawn',
        'Withdrawn consent cannot be modified; grant a fresh consent record if needed.',
      );
    }
    if (payload.data_scopes && payload.data_scopes.length === 0) {
      throw new DastakApiError(
        400,
        'invalid_scopes',
        'At least one data scope is required; use Withdraw to revoke all access.',
      );
    }

    if (payload.recipient !== undefined) consent.recipient = payload.recipient;
    if (payload.purpose !== undefined) consent.purpose = payload.purpose;
    if (payload.data_scopes !== undefined) {
      consent.data_scopes = [...new Set(payload.data_scopes)];
    }
    consent.changed_at = new Date().toISOString();

    appendAudit(db, {
      complaint_id: consent.complaint_id,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'consent_modified',
      input: `consent_id=${consent.consent_id}, scopes=${consent.data_scopes.join('|')}`,
      result: `Updated recipient/purpose/scopes immediately`,
      rule_version_id: null,
    });
    saveDb(db);
    return consent;
  },

  async withdrawConsent(
    token: string | null,
    consentId: string,
  ): Promise<ConsentRecord> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    const consent = db.consents.find((c) => c.consent_id === consentId);
    if (!consent) {
      throw new DastakApiError(404, 'not_found', 'Consent record not found.');
    }
    if (user.role !== 'Citizen' || consent.citizen_id !== user.user_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only the owning Citizen can withdraw consent.',
      );
    }

    consent.status = 'withdrawn';
    consent.withdrawn_at = new Date().toISOString();

    appendAudit(db, {
      complaint_id: consent.complaint_id,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'consent_withdrawn',
      input: `consent_id=${consent.consent_id}, recipient=${consent.recipient}`,
      result: `Future Dastak API access for ${consent.recipient} blocked immediately`,
      rule_version_id: null,
    });

    appendNotification(
      db,
      user.user_id,
      consent.complaint_id,
      `Consent withdrawn for ${getWorkspaceName(consent.recipient)} on ${consent.complaint_id}. Future Dastak access is blocked.`,
    );

    saveDb(db);
    return consent;
  },

  async listHelperComplaints(token: string | null): Promise<ComplaintRecord[]> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Helper') {
      throw new DastakApiError(
        403,
        'forbidden',
        'Helper endpoint requires Helper role.',
      );
    }

    const activeGrantIds = new Set(
      db.complaint_access_grants
        .filter((g) => g.helper_id === user.user_id && g.active)
        .map((g) => g.complaint_id),
    );

    const results: ComplaintRecord[] = [];
    for (const complaint of db.complaints) {
      if (!activeGrantIds.has(complaint.complaint_id)) continue;
      const consent = hasActiveConsentForRecipient(
        db,
        complaint.complaint_id,
        user.user_id,
      );
      if (!consent) continue;
      results.push(filterComplaintByScopes(complaint, consent.data_scopes));
    }
    return results;
  },

  async addHelperInformation(
    token: string | null,
    complaintId: string,
    payload: HelperInformation,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay(110);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Helper') {
      throw new DastakApiError(
        403,
        'forbidden',
        'Only an authorized Community Helper can submit helper information.',
      );
    }

    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(404, 'not_found', 'Complaint not found.');
    }

    const grant = db.complaint_access_grants.find(
      (g) =>
        g.complaint_id === complaintId &&
        g.helper_id === user.user_id &&
        g.active,
    );
    const consent = hasActiveConsentForRecipient(db, complaintId, user.user_id);
    if (!grant || !consent) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Access denied (403): Helper lacks active access grant or citizen consent on this case.',
      );
    }

    const nextData: IncidentInformation = { ...complaint.incident_data };
    const keys = Object.keys(payload) as Array<keyof HelperInformation>;
    for (const k of keys) {
      if (payload[k] !== undefined) {
        (nextData as Record<string, unknown>)[k] = payload[k];
      }
    }
    complaint.incident_data = nextData;

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'helper_information_added',
      input: `helper=${user.user_id}, fields=${keys.join(',')}`,
      result: 'Helper supplemented case info; citizen confirmation still required',
      rule_version_id: complaint.rule_version_id,
    });

    appendNotification(
      db,
      complaint.citizen_id,
      complaintId,
      `Helper ${user.user_id} added supporting information to ${complaintId}.`,
    );

    saveDb(db);
    return filterComplaintByScopes(complaint, consent.data_scopes);
  },

  async listOfficerComplaints(
    token: string | null,
  ): Promise<ComplaintRecord[]> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Officer' || !user.workspace_id) {
      throw new DastakApiError(
        403,
        'forbidden',
        'Officer case queue requires an Officer role bound to a workspace.',
      );
    }

    const assignedIds = new Set(
      db.case_assignments
        .filter(
          (a) =>
            a.officer_id === user.user_id && a.workspace_id === user.workspace_id,
        )
        .map((a) => a.complaint_id),
    );

    return db.complaints
      .filter(
        (c) =>
          c.destination_workspace_id === user.workspace_id &&
          assignedIds.has(c.complaint_id),
      )
      .map((c) => {
        const consent = hasActiveConsentForRecipient(
          db,
          c.complaint_id,
          user.workspace_id!,
        );
        return consent
          ? filterComplaintByScopes(c, consent.data_scopes)
          : c;
      });
  },

  async getOfficerComplaint(
    token: string | null,
    complaintId: string,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Officer' || !user.workspace_id) {
      throw new DastakApiError(403, 'forbidden', 'Officer role required.');
    }

    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(
        404,
        'not_found',
        `Complaint ${complaintId} was not found.`,
      );
    }

    if (complaint.destination_workspace_id !== user.workspace_id) {
      throw new DastakApiError(
        403,
        'workspace_isolation_denied',
        `Access denied (403): ${complaintId} belongs to ${getWorkspaceName(complaint.destination_workspace_id)}, not your assigned workspace (${getWorkspaceName(user.workspace_id)}).`,
      );
    }

    const assigned = db.case_assignments.find(
      (a) =>
        a.complaint_id === complaintId &&
        a.officer_id === user.user_id &&
        a.workspace_id === user.workspace_id,
    );
    if (!assigned) {
      throw new DastakApiError(
        403,
        'assignment_required',
        `Access denied (403): Case ${complaintId} is not assigned to officer ${user.user_id}.`,
      );
    }

    const workspaceConsents = db.consents.filter(
      (c) =>
        c.complaint_id === complaintId && c.recipient === user.workspace_id,
    );
    const grantedConsent = workspaceConsents.find((c) => c.status === 'granted');
    if (!grantedConsent) {
      throw new DastakApiError(
        403,
        'consent_withdrawn',
        `Access blocked (403): Citizen withdrew data-sharing consent for ${getWorkspaceName(user.workspace_id)} on ${complaintId}.`,
      );
    }

    return filterComplaintByScopes(complaint, grantedConsent.data_scopes);
  },

  async takeOfficerAction(
    token: string | null,
    complaintId: string,
    decision: OfficerDecision,
  ): Promise<ComplaintRecord> {
    assertConnected();
    await delay(130);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Officer' || !user.workspace_id) {
      throw new DastakApiError(403, 'forbidden', 'Officer role required.');
    }
    if (!decision.reason || decision.reason.trim().length === 0) {
      throw new DastakApiError(
        400,
        'reason_required',
        'A clear written reason is required for every officer action.',
      );
    }

    const complaint = db.complaints.find((c) => c.complaint_id === complaintId);
    if (!complaint) {
      throw new DastakApiError(404, 'not_found', 'Complaint not found.');
    }
    if (complaint.destination_workspace_id !== user.workspace_id) {
      throw new DastakApiError(
        403,
        'workspace_isolation_denied',
        'Access denied: cross-workspace officer action blocked.',
      );
    }
    const grantedConsent = hasActiveConsentForRecipient(
      db,
      complaintId,
      user.workspace_id,
    );
    if (!grantedConsent) {
      throw new DastakApiError(
        403,
        'consent_withdrawn',
        'Access blocked: citizen withdrew consent for this workspace.',
      );
    }

    const statusByAction: Record<
      OfficerDecision['action'],
      ComplaintRecord['current_status']
    > = {
      request_information: 'NEEDS_INFORMATION',
      accept: 'OFFICER_REVIEW',
      escalate: 'HUMAN_REVIEW',
      reject: 'RESOLVED',
      close: 'RESOLVED',
    };

    complaint.current_status = statusByAction[decision.action];

    appendAudit(db, {
      complaint_id: complaintId,
      user_id: user.user_id,
      agent_run_id: null,
      action: `officer_decision_${decision.action}`,
      input: `action=${decision.action}, workspace=${user.workspace_id}`,
      result: decision.reason.trim(),
      rule_version_id: complaint.rule_version_id,
    });

    appendNotification(
      db,
      complaint.citizen_id,
      complaintId,
      `Officer action (${decision.action}) on ${complaintId}: ${decision.reason.trim()}`,
    );

    saveDb(db);
    return filterComplaintByScopes(complaint, grantedConsent.data_scopes);
  },

  async listUsers(token: string | null): Promise<UserRecord[]> {
    assertConnected();
    await delay(70);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    return db.users.map(sanitizeUser);
  },

  async createUser(
    token: string | null,
    payload: UserCreate,
  ): Promise<UserRecord> {
    assertConnected();
    await delay(100);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    if (db.users.some((u) => u.user_id === payload.user_id.trim())) {
      throw new DastakApiError(
        409,
        'user_exists',
        `User ID ${payload.user_id} already exists.`,
      );
    }
    const created: StoredUser = {
      user_id: payload.user_id.trim(),
      password: payload.password,
      role: payload.role,
      workspace_id: payload.role === 'Officer' ? payload.workspace_id : null,
      synthetic_identity_ref:
        payload.role === 'Citizen'
          ? `SYN-ID-${1010 + db.users.length}`
          : null,
    };
    db.users.push(created);
    appendAudit(db, {
      complaint_id: null,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'admin_user_created',
      input: `user_id=${created.user_id}, role=${created.role}`,
      result: `Created synthetic user (workspace=${created.workspace_id ?? 'none'})`,
      rule_version_id: null,
    });
    saveDb(db);
    return sanitizeUser(created);
  },

  async listRoutingRules(token: string | null): Promise<RoutingRuleRecord[]> {
    assertConnected();
    await delay(70);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    return db.routing_rules;
  },

  async createRoutingRule(
    token: string | null,
    payload: RuleCreate,
  ): Promise<RoutingRuleRecord> {
    assertConnected();
    await delay(110);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    const ruleId = nextId(db, 'rule', 'rule_');
    const ruleVersionId = `rv_${ruleId.replace('rule_', '')}_v1`;
    const now = new Date().toISOString();
    const rule: RoutingRuleRecord = {
      rule_id: ruleId,
      rule_version_id: ruleVersionId,
      name: payload.name,
      incident_type: payload.incident_type,
      destination_workspace_id: payload.destination_workspace_id,
      priority: payload.priority,
      active: payload.active,
      explanation: payload.explanation,
      justification: payload.justification,
      created_by: user.user_id,
      timestamp: now,
    };
    db.routing_rules.push(rule);
    db.routing_rule_versions.push({ ...rule });

    appendAudit(db, {
      complaint_id: null,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'routing_rule_created',
      input: JSON.stringify(rule),
      result: `Created ${ruleVersionId} -> ${getWorkspaceName(rule.destination_workspace_id)}`,
      rule_version_id: ruleVersionId,
    });

    saveDb(db);
    return rule;
  },

  async updateRoutingRule(
    token: string | null,
    ruleId: string,
    patch: RuleChange,
  ): Promise<RoutingRuleRecord> {
    assertConnected();
    await delay(120);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    const existing = db.routing_rules.find((r) => r.rule_id === ruleId);
    if (!existing) {
      throw new DastakApiError(404, 'not_found', 'Routing rule not found.');
    }

    const priorVersionsCount = db.routing_rule_versions.filter(
      (v) => v.rule_id === ruleId,
    ).length;
    const nextVersionNumber = priorVersionsCount + 1;
    const baseSlug = ruleId.replace(/^rule_/, '');
    const nextVersionId = `rv_${baseSlug}_v${nextVersionNumber}`;
    const now = new Date().toISOString();

    const updated: RoutingRuleRecord = {
      rule_id: existing.rule_id,
      rule_version_id: nextVersionId,
      name: patch.name ?? existing.name,
      incident_type: patch.incident_type ?? existing.incident_type,
      destination_workspace_id:
        patch.destination_workspace_id ?? existing.destination_workspace_id,
      priority: patch.priority ?? existing.priority,
      active: patch.active ?? existing.active,
      explanation: patch.explanation ?? existing.explanation,
      justification: patch.justification ?? existing.justification,
      created_by: user.user_id,
      timestamp: now,
    };

    const idx = db.routing_rules.findIndex((r) => r.rule_id === ruleId);
    db.routing_rules[idx] = updated;
    db.routing_rule_versions.push({ ...updated });

    appendAudit(db, {
      complaint_id: null,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'routing_rule_updated',
      input: JSON.stringify(updated),
      result: `New immutable version ${nextVersionId} -> ${getWorkspaceName(updated.destination_workspace_id)} (active=${String(updated.active)}). Prior cases keep their historical rule_version_id.`,
      rule_version_id: nextVersionId,
    });

    saveDb(db);
    return updated;
  },

  async listAudit(token: string | null): Promise<AuditLogRecord[]> {
    assertConnected();
    await delay(80);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    return db.audit_logs;
  },

  async listAgentRuns(token: string | null): Promise<AgentRunRecord[]> {
    assertConnected();
    await delay(80);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    return db.agent_runs;
  },

  async listApiKeys(token: string | null): Promise<ApiKeyMetadata[]> {
    assertConnected();
    await delay(70);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    return db.api_keys.map(({ api_key_id, scopes, expires_at, revoked }) => ({
      api_key_id,
      scopes,
      expires_at,
      revoked,
    }));
  },

  async createApiKey(
    token: string | null,
    payload: ApiKeyCreate,
  ): Promise<ApiKeyIssued> {
    assertConnected();
    await delay(100);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    if (!payload.scopes || payload.scopes.length === 0) {
      throw new DastakApiError(
        400,
        'scopes_required',
        'Select at least one API key scope.',
      );
    }

    const keyId = nextId(db, 'api_key', 'key_demo_');
    const rawSecret = `dsk_sim_${keyId}_${Math.random().toString(36).slice(2, 10)}`;
    const stored: StoredApiKey = {
      api_key_id: keyId,
      scopes: payload.scopes as ApiKeyScope[],
      expires_at: payload.expires_at,
      revoked: false,
      key_hash: `sha256_sim_${keyId}`,
    };
    db.api_keys.unshift(stored);

    appendAudit(db, {
      complaint_id: null,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'api_key_issued',
      input: `api_key_id=${keyId}, scopes=${payload.scopes.join(',')}`,
      result: 'Issued scoped API key; hash stored',
      rule_version_id: null,
    });
    saveDb(db);
    return {
      api_key_id: stored.api_key_id,
      scopes: stored.scopes,
      expires_at: stored.expires_at,
      revoked: stored.revoked,
      api_key: rawSecret,
    };
  },

  async revokeApiKey(
    token: string | null,
    apiKeyId: string,
  ): Promise<ApiKeyMetadata> {
    assertConnected();
    await delay(90);
    const db = loadDb();
    const user = requireUser(db, token);
    if (user.role !== 'Admin') {
      throw new DastakApiError(403, 'forbidden', 'Admin role required.');
    }
    const key = db.api_keys.find((k) => k.api_key_id === apiKeyId);
    if (!key) {
      throw new DastakApiError(404, 'not_found', 'API key not found.');
    }
    key.revoked = true;
    appendAudit(db, {
      complaint_id: null,
      user_id: user.user_id,
      agent_run_id: null,
      action: 'api_key_revoked',
      input: `api_key_id=${apiKeyId}`,
      result: 'Key revoked immediately',
      rule_version_id: null,
    });
    saveDb(db);
    return {
      api_key_id: key.api_key_id,
      scopes: key.scopes,
      expires_at: key.expires_at,
      revoked: key.revoked,
    };
  },

  async getMockIdentity(
    token: string | null,
    reference: string,
  ): Promise<MockIdentityRecord> {
    assertConnected();
    await delay(60);
    const db = loadDb();
    requireUser(db, token);
    const found = db.mock_identity_records.find(
      (r) => r.identity_reference === reference,
    );
    if (!found) {
      throw new DastakApiError(
        404,
        'not_found',
        'Synthetic identity reference not found.',
      );
    }
    return found;
  },

  async getMockPayment(
    token: string | null,
    reference: string,
  ): Promise<MockPaymentTransaction> {
    assertConnected();
    await delay(60);
    const db = loadDb();
    requireUser(db, token);
    const found = db.mock_payment_transactions.find(
      (t) => t.transaction_reference === reference,
    );
    if (!found) {
      throw new DastakApiError(
        404,
        'not_found',
        'Transaction reference not found in simulated payment fixtures. This does not prove the report is invalid.',
      );
    }
    return found;
  },

  async getMockRequirements(
    token: string | null,
    incidentType: string,
  ): Promise<MockReportingRequirements> {
    assertConnected();
    await delay(60);
    const db = loadDb();
    requireUser(db, token);
    const found = db.mock_reporting_requirements.find(
      (r) => r.incident_type === incidentType,
    );
    if (!found) {
      throw new DastakApiError(
        404,
        'not_found',
        'Simulated requirements not found for incident type.',
      );
    }
    return found;
  },

  async submitMockComplaint(
    token: string | null,
    payload: SubmissionRequest,
    idempotencyKey: string,
  ): Promise<SubmissionConfirmation> {
    assertConnected();
    await delay(80);
    const db = loadDb();
    requireUser(db, token);
    const existing = db.submissions.find(
      (s) => s.idempotency_key === idempotencyKey,
    );
    if (existing) {
      if (existing.complaint_id !== payload.complaint_id) {
        throw new DastakApiError(
          409,
          'idempotency_conflict',
          'Idempotency key already bound to another complaint.',
        );
      }
      return {
        complaint_id: existing.complaint_id,
        idempotency_key: existing.idempotency_key,
        submission_reference: existing.submission_reference ?? 'SIM-PENDING',
      };
    }
    throw new DastakApiError(
      409,
      'authorization_required',
      'Use /authorize-submission first so citizen consent and authorization are verified.',
    );
  },

  async findMockSubmission(
    token: string | null,
    idempotencyKey: string,
  ): Promise<SubmissionConfirmation> {
    assertConnected();
    await delay(70);
    const db = loadDb();
    const user = requireUser(db, token);
    const sub = db.submissions.find(
      (s) => s.idempotency_key === idempotencyKey,
    );
    if (!sub) {
      throw new DastakApiError(
        404,
        'not_found',
        'No prior simulated submission found for this Idempotency-Key.',
      );
    }
    const complaint = db.complaints.find(
      (c) => c.complaint_id === sub.complaint_id,
    );
    if (
      user.role === 'Citizen' &&
      complaint &&
      complaint.citizen_id !== user.user_id
    ) {
      throw new DastakApiError(403, 'forbidden', 'Access denied.');
    }
    return {
      complaint_id: sub.complaint_id,
      idempotency_key: sub.idempotency_key,
      submission_reference: sub.submission_reference ?? 'SIM-UNKNOWN',
    };
  },

  async listNotifications(token: string | null): Promise<NotificationRecord[]> {
    assertConnected();
    await delay(70);
    const db = loadDb();
    const user = requireUser(db, token);
    return db.notifications.filter((n) => n.user_id === user.user_id);
  },

  async readNotification(
    token: string | null,
    notificationId: string,
  ): Promise<NotificationRecord> {
    assertConnected();
    await delay(60);
    const db = loadDb();
    const user = requireUser(db, token);
    const item = db.notifications.find(
      (n) => n.notification_id === notificationId,
    );
    if (!item) {
      throw new DastakApiError(404, 'not_found', 'Notification not found.');
    }
    if (item.user_id !== user.user_id) {
      throw new DastakApiError(403, 'forbidden', 'Cannot modify another user notification.');
    }
    item.read = true;
    saveDb(db);
    return item;
  },
};

