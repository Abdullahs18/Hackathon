import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileEdit,
  HelpCircle,
  Send,
  ShieldCheck,
  ShieldOff,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/I18nContext';
import type { TranslationKey } from '@/i18n/en';
import type {
  ConsentStatus,
  OfficerAction,
  Role,
  WorkflowStatus,
} from '@/types/dastak';

interface StyleDef {
  label: string;
  classes: string;
  icon: 'draft' | 'needs' | 'human' | 'review' | 'submitted' | 'officer' | 'resolved' | 'pipeline';
}

const WORKFLOW_STYLE_MAP: Record<WorkflowStatus, StyleDef> = {
  DRAFT: {
    label: 'DRAFT',
    classes: 'bg-[#F1F5F9] text-[#1E293B] border-[#94A3B8]',
    icon: 'draft',
  },
  COLLECT_INFORMATION: {
    label: 'COLLECTING INFO',
    classes: 'bg-[#F1F5F9] text-[#1E293B] border-[#94A3B8]',
    icon: 'draft',
  },
  VOICE_TRANSCRIPTION: {
    label: 'VOICE TRANSCRIPTION',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  STRUCTURED_EXTRACTION: {
    label: 'EXTRACTING DETAILS',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  CLASSIFICATION: {
    label: 'AI CLASSIFICATION',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  VALIDATION: {
    label: 'VALIDATING',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  NEEDS_INFORMATION: {
    label: 'NEEDS_INFORMATION',
    classes: 'bg-[#FEF3C7] text-[#78350F] border-[#F59E0B]',
    icon: 'needs',
  },
  HUMAN_REVIEW: {
    label: 'HUMAN_REVIEW',
    classes: 'bg-[#FFEDD5] text-[#9A3412] border-[#EA580C]',
    icon: 'human',
  },
  ROUTING_RULE_EVALUATION: {
    label: 'ROUTING CHECK',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  COMPLAINT_GENERATION: {
    label: 'DRAFT GENERATED',
    classes: 'bg-[#E0E7FF] text-[#312E81] border-[#6366F1]',
    icon: 'review',
  },
  CITIZEN_REVIEW: {
    label: 'CITIZEN_REVIEW',
    classes: 'bg-[#E0E7FF] text-[#312E81] border-[#6366F1]',
    icon: 'review',
  },
  CONSENT_AND_AUTHORIZATION: {
    label: 'CONSENT & AUTH',
    classes: 'bg-[#E0E7FF] text-[#312E81] border-[#6366F1]',
    icon: 'review',
  },
  AGENT_EXECUTION: {
    label: 'AGENT RUNNING',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  MOCK_SERVICE_CALLS: {
    label: 'SIMULATED CALLS',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  SUBMISSION_VERIFICATION: {
    label: 'VERIFYING SUBMISSION',
    classes: 'bg-[#E0F2FE] text-[#075985] border-[#38BDF8]',
    icon: 'pipeline',
  },
  SUBMITTED: {
    label: 'SUBMITTED',
    classes: 'bg-[#DBEAFE] text-[#1E3A8A] border-[#3B82F6]',
    icon: 'submitted',
  },
  OFFICER_REVIEW: {
    label: 'OFFICER_REVIEW',
    classes: 'bg-[#DBEAFE] text-[#1E3A8A] border-[#3B82F6]',
    icon: 'officer',
  },
  RESOLVED: {
    label: 'RESOLVED',
    classes: 'bg-[#D1FAE5] text-[#065F46] border-[#10B981]',
    icon: 'resolved',
  },
};

function renderWorkflowIcon(icon: StyleDef['icon']) {
  switch (icon) {
    case 'draft':
      return <FileEdit className="h-3.5 w-3.5" aria-hidden />;
    case 'needs':
      return <HelpCircle className="h-3.5 w-3.5" aria-hidden />;
    case 'human':
      return <AlertTriangle className="h-3.5 w-3.5" aria-hidden />;
    case 'review':
      return <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />;
    case 'submitted':
      return <Send className="h-3.5 w-3.5" aria-hidden />;
    case 'officer':
      return <ShieldCheck className="h-3.5 w-3.5" aria-hidden />;
    case 'resolved':
      return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />;
    case 'pipeline':
      return <Cpu className="h-3.5 w-3.5" aria-hidden />;
  }
}


export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const { t } = useI18n();
  const def = WORKFLOW_STYLE_MAP[status] ?? WORKFLOW_STYLE_MAP.DRAFT;
  const key = (
    status in WORKFLOW_STYLE_MAP ? `status.${status}` : 'status.DRAFT'
  ) as TranslationKey;
  return (
    <Badge
      variant="outline"
      className={`gap-1.5 px-2.5 py-1 text-xs font-semibold ${def.classes}`}
    >
      {renderWorkflowIcon(def.icon)}
      <span>{t(key)}</span>
    </Badge>
  );
}

export function ConsentStatusBadge({ status }: { status: ConsentStatus }) {
  const { t } = useI18n();
  if (status === 'granted') {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-[#10B981] bg-[#D1FAE5] px-2.5 py-1 text-xs font-semibold text-[#065F46]"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        <span>{t('consent.granted')}</span>
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-[#EF4444] bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#991B1B]"
    >
      <ShieldOff className="h-3.5 w-3.5" aria-hidden />
      <span>{t('consent.withdrawn')}</span>
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  const styles: Record<Role, string> = {
    Citizen: 'border-[#10B981] bg-[#D1FAE5] text-[#065F46]',
    Helper: 'border-[#3B82F6] bg-[#DBEAFE] text-[#1E3A8A]',
    Officer: 'border-[#6366F1] bg-[#E0E7FF] text-[#312E81]',
    Admin: 'border-[#64748B] bg-[#F1F5F9] text-[#0F172A]',
  };
  return (
    <Badge
      variant="outline"
      className={`gap-1 px-2.5 py-0.5 text-xs font-semibold ${styles[role]}`}
    >
      <UserCheck className="h-3 w-3" aria-hidden />
      <span>{t(`role.${role}`)}</span>
    </Badge>
  );
}

export function OfficerActionBadge({ action }: { action: OfficerAction }) {
  const { t } = useI18n();
  const known: OfficerAction[] = [
    'request_information',
    'accept',
    'reject',
    'escalate',
    'close',
  ];
  return (
    <Badge variant="outline" className="bg-slate-100 text-slate-900">
      {known.includes(action) ? t(`action.${action}`) : action}
    </Badge>
  );
}
