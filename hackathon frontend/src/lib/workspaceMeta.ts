import type { ApiKeyScope, Role, WorkspaceRecord } from '@/types/dastak';

export const PRE_SEEDED_WORKSPACES: WorkspaceRecord[] = [
  {
    workspace_id: 'ws_financial_fraud_intake',
    name: 'Mock Financial Fraud Intake',
  },
  {
    workspace_id: 'ws_digital_safety_intake',
    name: 'Mock Digital Safety Intake',
  },
];

export function getWorkspaceName(workspaceId: string | null | undefined): string {
  if (!workspaceId) return 'Unassigned';
  const found = PRE_SEEDED_WORKSPACES.find(
    (ws) => ws.workspace_id === workspaceId,
  );
  return found ? found.name : workspaceId;
}

export interface DataScopeOption {
  id: string;
  label: string;
  description: string;
}

export const STANDARD_DATA_SCOPES: DataScopeOption[] = [
  {
    id: 'incident_summary',
    label: 'Incident Summary & Dates',
    description: 'Narrative description, incident type, channel, and date.',
  },
  {
    id: 'transaction_details',
    label: 'Transaction & Payment Details',
    description: 'Reported loss amount, currency, payment channel, and reference.',
  },
  {
    id: 'suspect_details',
    label: 'Suspect Numbers / Links',
    description: 'Reported suspect phone numbers, URLs, or account handles.',
  },
  {
    id: 'evidence_attachments',
    label: 'Uploaded Evidence Files',
    description: 'Screenshots, receipts, or PDFs with SHA-256 metadata.',
  },
  {
    id: 'synthetic_identity_ref',
    label: 'Synthetic Demo Identity Ref',
    description: 'Simulated identity reference bound to this demo account.',
  },
];

export const ALL_API_KEY_SCOPES: ApiKeyScope[] = [
  'complaints:read',
  'complaints:write',
  'consents:read',
  'consents:write',
  'helper:access',
  'officer:access',
  'admin:users',
  'admin:rules',
  'admin:audit',
  'admin:api_keys',
  'mock:services',
  'notifications:read',
];

export interface FollowUpQuestionTemplate {
  field: string;
  label: string;
  question_en: string;
  question_ur: string;
  placeholder: string;
}

export const FOLLOW_UP_TEMPLATES: Record<string, FollowUpQuestionTemplate> = {
  description: {
    field: 'description',
    label: 'What happened?',
    question_en: 'Please describe briefly what happened in your own words.',
    question_ur: 'براہِ کرم مختصراً بتائیں کہ آپ کے ساتھ کیا واقعہ پیش آیا؟',
    placeholder: 'Describe the call, message, or transfer...',
  },
  incident_date: {
    field: 'incident_date',
    label: 'Approximate Date',
    question_en: 'When did this incident happen (exact or approximate date)?',
    question_ur: 'یہ واقعہ کس تاریخ یا کب پیش آیا؟ (اندازاً تاریخ بھی لکھ سکتے ہیں)',
    placeholder: 'e.g., 2026-11-18 or Yesterday evening',
  },
  platform: {
    field: 'platform',
    label: 'Channel / Platform',
    question_en: 'Through which app or channel did the sender contact you (SMS, WhatsApp, Call)?',
    question_ur: 'آپ سے کس ذریعے سے رابطہ کیا گیا؟ (مثلاً SMS، واٹس ایپ، یا فون کال)',
    placeholder: 'e.g., SMS, WhatsApp, Phone Call',
  },
  money_lost: {
    field: 'money_lost',
    label: 'Was money transferred?',
    question_en: 'Was any money actually deducted or sent, or was it an unsuccessful attempt?',
    question_ur: 'کیا آپ کے اکاؤنٹ سے رقم کٹ گئی یا صرف دھوکہ دہی کی کوشش تھی؟',
    placeholder: 'Yes / No',
  },
  amount: {
    field: 'amount',
    label: 'Amount (PKR)',
    question_en: 'Approximately how much money was lost (in PKR)?',
    question_ur: 'تقریباً کتنی رقم کا نقصان ہوا (روپے میں)؟',
    placeholder: 'e.g., 15000',
  },
  payment_method: {
    field: 'payment_method',
    label: 'Payment Method',
    question_en: 'Which payment wallet or bank method was used (Easypaisa, JazzCash, Bank/Raast)?',
    question_ur: 'رقم کس ذریعے سے بھیجی گئی؟ (مثلاً ایزی پیسہ، جاز کیش، یا بینک/راست)',
    placeholder: 'e.g., Easypaisa, JazzCash, Raast',
  },
  transaction_reference: {
    field: 'transaction_reference',
    label: 'Transaction Reference ID',
    question_en: 'Do you have a transaction reference ID (optional — choose unknown if unavailable)?',
    question_ur: 'کیا آپ کے پاس ٹرانزیکشن نمبر یا حوالہ موجود ہے؟ (نہ ہو تو معلوم نہیں منتخب کریں)',
    placeholder: 'e.g., SYN-TXN-2026-0041',
  },
  suspect_details: {
    field: 'suspect_details',
    label: 'Suspect Contact / Link',
    question_en: 'What phone number, URL, or account did the scammer use?',
    question_ur: 'فراڈ کرنے والے کا فون نمبر، لنک یا اکاؤنٹ کیا تھا؟',
    placeholder: 'e.g., +92-300-0000999 or fake-relief-link.example',
  },
};

export interface DemoAccountPreset {
  user_id: string;
  password: string;
  displayName: string;
  role: Role;
  subtitle: string;
  workspaceLabel?: string;
}

export const DEMO_ACCOUNTS: DemoAccountPreset[] = [
  {
    user_id: 'cit_tariq_01',
    password: 'demo1234',
    displayName: 'Tariq Mehmood (Demo Shopkeeper)',
    role: 'Citizen',
    subtitle: 'Primary Urdu voice/text reporting flow, drafts, consent & withdrawal',
  },
  {
    user_id: 'hlp_bilal_01',
    password: 'demo1234',
    displayName: 'Bilal Ahmed (Demo Community Helper)',
    role: 'Helper',
    subtitle: 'Authorized for CMP-2026-001 & CMP-2026-002; denied on CMP-2026-004',
  },
  {
    user_id: 'off_nadia_01',
    password: 'demo1234',
    displayName: 'Nadia Khan (Demo Officer)',
    role: 'Officer',
    subtitle: 'Tenant-isolated to Financial Fraud workspace',
    workspaceLabel: 'Mock Financial Fraud Intake',
  },
  {
    user_id: 'off_zain_02',
    password: 'demo1234',
    displayName: 'Zain Raza (Demo Officer)',
    role: 'Officer',
    subtitle: 'Tenant-isolated to Digital Safety workspace',
    workspaceLabel: 'Mock Digital Safety Intake',
  },
  {
    user_id: 'adm_farhan_01',
    password: 'demo1234',
    displayName: 'Farhan Siddiqui (Demo Admin)',
    role: 'Admin',
    subtitle: 'Routing rule editor, users, API keys & Read-Only Audit',
  },
];

export const PROTOTYPE_BANNER_TEXT =
  'Dastak Hackathon Prototype — Simulated Services Only. Not an Official Government Portal. Do Not Enter Real Personal Data.';

export const EVIDENCE_UNVERIFIED_LABEL =
  'Citizen-submitted and not authenticity-verified';
