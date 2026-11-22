import { AgentProgress } from '@/components/citizen/AgentProgress';
import { PreparedComplaint } from '@/components/citizen/PreparedComplaint';
import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { FadeSlide } from '@/components/motion/presets';
import { useI18n } from '@/i18n/I18nContext';
import { SCAM_PRESETS } from '@/lib/scamPresets';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CaseVoicePanel } from '@/components/citizen/CaseVoicePanel';
import { AnalysisSuggestions } from '@/components/citizen/AnalysisSuggestions';
import { ReviewHelpPanel } from '@/components/shared/ReviewHelpPanel';
import { ConsentManager } from '@/components/citizen/ConsentManager';
import { missingSharing, requiredSharing } from '@/lib/consentRequirements';
import { EvidenceUploader } from '@/components/citizen/EvidenceUploader';
import { UrduAudioPlayer } from '@/components/citizen/UrduAudioPlayer';
import {
  UrduVoiceRecorder,
  type VoicePresetPayload,
} from '@/components/citizen/UrduVoiceRecorder';
import {
  ANALYZE_STEPS,
  SUBMIT_STEPS,
  ProcessingSteps,
} from '@/components/citizen/ProcessingSteps';
import { WorkflowSteps } from '@/components/citizen/WorkflowSteps';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { useDraftSync } from '@/context/DraftSyncContext';
import {
  dastakApi,
  generateIdempotencyKey,
  isDastakApiError,
  USE_MOCK,
} from '@/lib/apiClient';
import { FOLLOW_UP_TEMPLATES, getWorkspaceName } from '@/lib/workspaceMeta';
import type {
  AnalysisResponse,
  ComplaintRecord,
  ConsentRecord,
  EvidenceRecord,
  IncidentInformation,
  IncidentPatch,
  SubmissionConfirmation,
} from '@/types/dastak';

function emptyIncident(): IncidentInformation {
  return {
    incident_type: null,
    incident_date: '',
    description: '',
    scam_message: '',
    platform: '',
    money_lost: null,
    amount: null,
    currency: '',
    payment_method: '',
    suspect_details: [],
    evidence_ids: [],
  };
}

export function CitizenWizard() {
  const {copy, lang} = useWorkflowCopy();
  const { id: routeComplaintId } = useParams();
  const [searchParams] = useSearchParams();
  const recoverFlag = searchParams.get('recover') === '1';
  const scamParam = searchParams.get('scam');
  const modeParam = searchParams.get('mode');
  const { t } = useI18n();

  const {
    isOnline,
    saveLocalDraft,
    getLocalDraft,
    clearLocalDraft,
    markRemoteSynced,
    setSyncState,
  } = useDraftSync();

  const [providerPermission, setProviderPermission] = useState(false);
  const [step, setStep] = useState(0);
  const [complaintId, setComplaintId] = useState<string | undefined>(
    routeComplaintId,
  );
  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [incident, setIncident] = useState<IncidentInformation>(emptyIncident);
  const [suspectText, setSuspectText] = useState('');
  const [txUnknown, setTxUnknown] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateIdempotencyKey(),
  );

  // Follow-up & Review states
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>(
    {},
  );
  const [followUpUnknowns, setFollowUpUnknowns] = useState<
    Record<string, boolean>
  >({});
  const [reviewDescription, setReviewDescription] = useState('');
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewPaymentMethod, setReviewPaymentMethod] = useState('');
  const [reviewTxRef, setReviewTxRef] = useState('');
  const [reviewTxUnknown, setReviewTxUnknown] = useState(false);
  const [citizenAuthorizedChecked, setCitizenAuthorizedChecked] =
    useState(false);
  const [confirmation, setConfirmation] =
    useState<SubmissionConfirmation | null>(null);

  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionTimedOut, setSubmissionTimedOut] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reviewDirty = Boolean(complaint?.complaint_draft && (
    reviewDescription.trim() !== complaint.complaint_draft.description.trim() ||
    (reviewAmount.trim() ? Number(reviewAmount) : null) !== complaint.complaint_draft.amount ||
    (reviewPaymentMethod.trim() || null) !== complaint.complaint_draft.payment_method ||
    (reviewTxUnknown ? null : reviewTxRef.trim() || null) !== complaint.complaint_draft.transaction_reference
  ));
  useEffect(() => { setCitizenAuthorizedChecked(false); }, [complaint?.version, reviewDirty]);

  const debounceTimerRef = useRef<number | null>(null);

  const syncFormFromComplaint = useCallback((record: ComplaintRecord) => {
    setComplaint(record);
    setComplaintId(record.complaint_id);
    setIncident(record.incident_data);
    setSuspectText((record.incident_data.suspect_details ?? []).join(', '));
    setTxUnknown(record.incident_data.transaction_reference === null);
    setReviewDescription(
      record.complaint_draft?.description ||
        record.incident_data.description ||
        '',
    );
    setReviewAmount(
      record.complaint_draft?.amount != null
        ? String(record.complaint_draft.amount)
        : record.incident_data.amount != null
          ? String(record.incident_data.amount)
          : '',
    );
    setReviewPaymentMethod(
      record.complaint_draft?.payment_method ||
        record.incident_data.payment_method ||
        '',
    );
    const tx =
      record.complaint_draft?.transaction_reference ??
      record.incident_data.transaction_reference;
    setReviewTxRef(tx ?? '');
    setReviewTxUnknown(tx === null);

    if (record.current_status === 'CITIZEN_REVIEW') {
      setStep(2);
    } else if (
      record.current_status === 'NEEDS_INFORMATION' ||
      record.current_status === 'HUMAN_REVIEW'
    ) {
      setStep(1);
    } else if (record.current_status === 'SUBMITTED') {
      setStep(3);
      if (record.submission_reference) setConfirmation({complaint_id:record.complaint_id, idempotency_key:'', submission_reference:record.submission_reference});
    } else if (['CONSENT_AND_AUTHORIZATION','AGENT_EXECUTION','MOCK_SERVICE_CALLS','SUBMISSION_VERIFICATION'].includes(record.current_status)) {
      setStep(2);
      setSubmissionTimedOut(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const local = getLocalDraft();
      if (routeComplaintId) {
        setLoading(true);
        try {
          const remote = await dastakApi.getComplaint(routeComplaintId);
          if (!active) return;
          if (local?.complaintId === routeComplaintId) setIdempotencyKey(local.idempotencyKey);
          if (
            recoverFlag &&
            local &&
            local.complaintId === routeComplaintId &&
            local.pendingRemoteSync
          ) {
            setComplaint(remote);
            setComplaintId(remote.complaint_id);
            setIncident(local.incident);
            setSuspectText((local.incident.suspect_details ?? []).join(', '));
            setTxUnknown(local.incident.transaction_reference === null);
            setIdempotencyKey(local.idempotencyKey);
            setStep(local.step);
            setRecoveryNotice(
              'Recovered your unsynced local edits after connection drop.',
            );
          } else {
            syncFormFromComplaint(remote);
            try { const saved = await dastakApi.getAnalysis(remote.complaint_id); if (active) setAnalysis(saved); } catch (cause) { if (isDastakApiError(cause) && cause.status !== 404) throw cause; }
          }
        } catch (err) {
          if (!active) return;
          if (local && local.complaintId === routeComplaintId) {
            setIncident(local.incident);
            setSuspectText((local.incident.suspect_details ?? []).join(', '));
            setIdempotencyKey(local.idempotencyKey);
            setStep(local.step);
            setRecoveryNotice(
              'Loaded locally cached draft because server could not be reached.',
            );
          } else {
            setError(err);
          }
        } finally {
          if (active) setLoading(false);
        }
      } else if (recoverFlag && local && !local.complaintId) {
        setIncident(local.incident);
        setSuspectText((local.incident.suspect_details ?? []).join(', '));
        setTxUnknown(local.incident.transaction_reference === null);
        setIdempotencyKey(local.idempotencyKey);
        setStep(local.step);
        setRecoveryNotice('Recovered your saved local draft.');
      } else if (!routeComplaintId && scamParam && SCAM_PRESETS[scamParam]) {
        // One-tap quick start: pre-fill context only; citizen still reviews everything.
        const preset = SCAM_PRESETS[scamParam];
        setIncident((prev) => ({
          ...prev,
          description: preset.description,
          platform: preset.platform,
        }));
        setRecoveryNotice(t('wiz.quickStarted'));
      }
    };
    void init();
    return () => {
      active = false;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeComplaintId, recoverFlag, getLocalDraft, syncFormFromComplaint, scamParam]);

  useEffect(() => {
    if (modeParam !== 'text' && !scamParam) return;
    const timer = window.setTimeout(() => {
      document.getElementById('incident-description')?.focus();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [modeParam, scamParam]);

  const buildCleanedPayload = useCallback(
    (source: IncidentInformation): IncidentInformation => {
      const suspects = suspectText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const out: IncidentInformation = {
        incident_type: source.incident_type?.trim() || null,
        description: source.description?.trim() || null,
        scam_message: source.scam_message?.trim() || null,
        incident_date: source.incident_date?.trim() || null,
        platform: source.platform?.trim() || null,
        money_lost: source.money_lost ?? null,
        amount: source.amount ?? null,
        currency: source.currency?.trim() || null,
        payment_method: source.payment_method?.trim() || null,
        suspect_details: suspects,
        evidence_ids: source.evidence_ids ?? [],
      };
      if (txUnknown) {
        out.transaction_reference = null;
      } else if (
        source.transaction_reference &&
        source.transaction_reference.trim().length > 0
      ) {
        out.transaction_reference = source.transaction_reference.trim();
      }
      return out;
    },
    [suspectText, txUnknown],
  );

  // Keep local edits until an explicit save reconciles them against the displayed revision.
  const persistChange = useCallback(
    (nextIncident: IncidentInformation, nextStep = step) => {
      saveLocalDraft({
        complaintId,
        step: nextStep,
        incident: nextIncident,
        transcriptUrdu: nextIncident.description ?? '',
        idempotencyKey,
        pendingRemoteSync: true,
      });

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }

    },
    [
      step,
      complaintId,
      idempotencyKey,
      isOnline,
      saveLocalDraft,
      buildCleanedPayload,
      markRemoteSynced,
      setSyncState,
    ],
  );

  const updateField = <K extends keyof IncidentInformation>(
    key: K,
    value: IncidentInformation[K],
  ) => {
    const next = { ...incident, [key]: value };
    setIncident(next);
    persistChange(next);
  };

  const ensureComplaintDraftOnServer = useCallback(async (): Promise<
    string | null
  > => {
    const payload = buildCleanedPayload(incident);
    if (complaintId) {
      const updated = await dastakApi.updateComplaint(complaintId, payload, complaint?.version);
      setComplaint(updated);
      markRemoteSynced(updated.complaint_id);
      return updated.complaint_id;
    }
    const created = await dastakApi.createComplaint(payload, idempotencyKey);
    setComplaint(created);
    setComplaintId(created.complaint_id);
    saveLocalDraft({
      complaintId: created.complaint_id,
      step,
      incident: created.incident_data,
      transcriptUrdu: created.incident_data.description ?? '',
      idempotencyKey,
      pendingRemoteSync: false,
    });
    markRemoteSynced(created.complaint_id);
    return created.complaint_id;
  }, [
    buildCleanedPayload,
    incident,
    complaintId,
    complaint?.version,
    idempotencyKey,
    step,
    saveLocalDraft,
    markRemoteSynced,
  ]);

  const handleSyncRecoveredDraftNow = async () => {
    setError(null);
    setSyncState('saving');
    try {
      await ensureComplaintDraftOnServer();
      setRecoveryNotice('Local draft synced to backend cleanly.');
    } catch (err) {
      setSyncState('error');
      setError(err);
    }
  };

  const handleVoicePreset = (preset: VoicePresetPayload) => {
    const next: IncidentInformation = {
      ...incident,
      description: preset.description,
      scam_message: preset.scam_message,
      platform: preset.platform,
      incident_date: preset.incident_date,
      money_lost: preset.money_lost,
      amount: preset.amount,
      currency: 'PKR',
      payment_method: preset.payment_method,
      transaction_reference: preset.transaction_reference,
      suspect_details: preset.suspect_details,
    };
    setSuspectText(preset.suspect_details.join(', '));
    setTxUnknown(preset.transaction_reference === null);
    setIncident(next);
    persistChange(next);
  };

  const handleEvidenceUploaded = (_ev: EvidenceRecord) => {
    if (complaintId) void dastakApi.getComplaint(complaintId).then(record => {
      setComplaint(record);
      setIncident(prev => ({...prev, evidence_ids:record.incident_data.evidence_ids}));
    }).catch(setError);
  };

  const handleAnalyze = async () => {
    setError(null);
    setAnalyzing(true);
    try {
      setSyncState('saving');
      const targetId = await ensureComplaintDraftOnServer();
      if (!targetId) return;
      const result = await dastakApi.analyzeComplaint(targetId, providerPermission);
      setAnalysis(result);
      const refreshed = await dastakApi.getComplaint(targetId);
      setComplaint(refreshed);
      setReviewDescription(
        refreshed.complaint_draft?.description ||
          refreshed.incident_data.description ||
          '',
      );
      setReviewAmount(
        refreshed.complaint_draft?.amount != null
          ? String(refreshed.complaint_draft.amount)
          : refreshed.incident_data.amount != null
            ? String(refreshed.incident_data.amount)
            : '',
      );
      setReviewPaymentMethod(
        refreshed.complaint_draft?.payment_method ||
          refreshed.incident_data.payment_method ||
          '',
      );
      const tx =
        refreshed.complaint_draft?.transaction_reference ??
        refreshed.incident_data.transaction_reference;
      setReviewTxRef(tx ?? '');
      setReviewTxUnknown(tx === null);

      setFollowUpAnswers({});
      setFollowUpUnknowns({});
      setStep(1);
      saveLocalDraft({
        complaintId: targetId,
        step: 1,
        incident: refreshed.incident_data,
        transcriptUrdu: refreshed.incident_data.description ?? '',
        idempotencyKey,
        pendingRemoteSync: false,
      });
      markRemoteSynced(targetId);
    } catch (err) {
      setSyncState('error');
      setError(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyFollowUpsAndReanalyze = async () => {
    if (!complaintId || !analysis) return;
    setError(null);
    setAnalyzing(true);
    try {
      const patch: IncidentPatch = {};
      for (const field of analysis.classification.missing_fields) {
        const isUnknown = Boolean(followUpUnknowns[field]);
        const val = (followUpAnswers[field] ?? '').trim();

        if (isUnknown) {
          if (field === 'suspect_details') {
            patch.suspect_details = [];
          } else {
            (patch as Record<string, unknown>)[field] = null;
          }
          continue;
        }

        if (!val) continue;
        if (field === 'amount') {
          const parsed = Number(val);
          if (!Number.isNaN(parsed)) patch.amount = parsed;
        } else if (field === 'money_lost') {
          patch.money_lost = /^(yes|true|1|جی|ہاں)/i.test(val);
        } else if (field === 'suspect_details') {
          patch.suspect_details = val
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          (patch as Record<string, unknown>)[field] = val;
        }
      }

      if (Object.keys(patch).length > 0) {
        const updated = await dastakApi.updateComplaint(complaintId, patch, complaint?.version);
        setIncident(updated.incident_data);
        setSuspectText((updated.incident_data.suspect_details ?? []).join(', '));
        setTxUnknown(updated.incident_data.transaction_reference === null);
      }

      const nextAnalysis = await dastakApi.analyzeComplaint(complaintId, providerPermission);
      setAnalysis(nextAnalysis);
      const refreshed = await dastakApi.getComplaint(complaintId);
      setComplaint(refreshed);
      setReviewDescription(
        refreshed.complaint_draft?.description ||
          refreshed.incident_data.description ||
          '',
      );
      setReviewAmount(
        refreshed.complaint_draft?.amount != null
          ? String(refreshed.complaint_draft.amount)
          : '',
      );
      setReviewPaymentMethod(refreshed.complaint_draft?.payment_method || '');
      const tx = refreshed.complaint_draft?.transaction_reference;
      setReviewTxRef(tx ?? '');
      setReviewTxUnknown(tx === null);
      markRemoteSynced(complaintId);
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveReviewCorrections = async () => {
    if (!complaintId) return;
    setError(null);
    setLoading(true);
    try {
      if (!providerPermission) throw new Error('Permit Gemini to analyze the revised complaint before saving corrections.');
      const parsedAmount = reviewAmount.trim() ? Number(reviewAmount) : null;
      const patch: IncidentPatch = {
        description: reviewDescription.trim(),
        amount:
          parsedAmount !== null && !Number.isNaN(parsedAmount)
            ? parsedAmount
            : null,
        payment_method: reviewPaymentMethod.trim() || null,
        transaction_reference: reviewTxUnknown
          ? null
          : reviewTxRef.trim() || null,
        citizen_confirmed_corrections: [
          `Citizen reviewed and confirmed summary at ${new Date().toISOString()}`,
        ],
      };
      const updated = await dastakApi.updateComplaint(complaintId, patch, complaint?.version);
      setComplaint(updated);
      setIncident(updated.incident_data);
      setCitizenAuthorizedChecked(false);
      const reassessed = await dastakApi.analyzeComplaint(complaintId, providerPermission);
      setAnalysis(reassessed);
      syncFormFromComplaint(await dastakApi.getComplaint(complaintId));
      markRemoteSynced(complaintId);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const requiredSharingReady = useMemo(() => {
    return requiredSharing(complaint).length > 0 && missingSharing(complaint, consents).length === 0;
  }, [complaint, consents]);

  const handleAuthorizeAndSubmit = async (checkExistingFirst = false) => {
    if (!complaintId) return;
    saveLocalDraft({complaintId,step:2,incident,transcriptUrdu:incident.description || '',idempotencyKey,pendingRemoteSync:false});
    setError(null);
    setSubmitting(true);
    setSubmissionTimedOut(false);
    try {
      if (checkExistingFirst) {
        try {
          const prior = await dastakApi.findMockSubmission(idempotencyKey);
          setConfirmation(prior);
          const refreshed = await dastakApi.getComplaint(complaintId);
          setComplaint(refreshed);
          clearLocalDraft();
          setStep(3);
          return;
        } catch (checkErr) {
          if (!isDastakApiError(checkErr) || checkErr.status !== 404) {
            throw checkErr;
          }
          // Not submitted yet; proceed safely with same idempotencyKey
        }
      }

      if (!citizenAuthorizedChecked || !complaint?.version || reviewDirty) {
        throw new Error('Review the current saved complaint and explicitly authorize submission.');
      }
      let authorized = complaint;
      if (!authorized.authorization_id || authorized.current_status !== 'CONSENT_AND_AUTHORIZATION') {
        authorized = await dastakApi.authorizeSubmission(
          complaintId,
          {citizen_authorized:true, citizen_confirmed:true, reviewed_version:complaint.version},
          idempotencyKey,
        );
        setComplaint(authorized);
      }
      if (!authorized.authorization_id) throw new Error('The saved authorization is unavailable. Reload the case.');
      const execution = await dastakApi.executeSubmission(complaintId, authorized.authorization_id, idempotencyKey);
      if (!execution.submitted || !execution.submission_reference) {
        const latest = await dastakApi.getComplaint(complaintId);
        setComplaint(latest);
        throw new Error(execution.errors.join(', ') || 'Submission has not been confirmed. Recover the saved agent progress.');
      }
      const conf = await dastakApi.findMockSubmission(idempotencyKey);
      setComplaint(await dastakApi.getComplaint(complaintId));

      setConfirmation(conf);
      clearLocalDraft();
      setStep(3);
    } catch (err) {
      if (isDastakApiError(err) && [0,429,502,503,504].includes(err.status)) {
        setSubmissionTimedOut(true);
      }
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { title: t('wiz.step1'), subtitle: t('wiz.step1sub') },
    {
      title: t('wiz.step2'),
      subtitle: t('wiz.step2sub'),
      status:
        complaint?.current_status === 'HUMAN_REVIEW'
          ? ('error' as const)
          : undefined,
    },
    { title: t('wiz.step3'), subtitle: t('wiz.step3sub') },
    { title: t('wiz.step4'), subtitle: t('wiz.step4sub') },
  ];

  const urduFollowUpScript = useMemo(() => {
    if (!analysis || analysis.classification.missing_fields.length === 0) {
      return 'آپ کی فراہم کردہ تفصیلات مکمل لگتی ہیں۔ براہِ کرم اگلے مرحلے پر جائزہ اور رضامندی مکمل کریں۔';
    }
    return analysis.classification.missing_fields
      .map(
        (f) =>
          FOLLOW_UP_TEMPLATES[f]?.question_ur ??
          `براہِ کرم ${f} سے متعلق مزید معلومات درج کریں۔`,
      )
      .join(' ');
  }, [analysis]);

  const urduSummaryScript = useMemo(() => {
    const amt = reviewAmount ? `${reviewAmount} روپے` : 'رقم نامعلوم';
    const method = reviewPaymentMethod || 'نامعلوم ذریعہ';
    const dest = getWorkspaceName(complaint?.destination_workspace_id);
    return `خلاصہ شکایت: آپ کی شکایت آن لائن مالی فراڈ کے زمرے میں درج کی جا رہی ہے۔ بیان: ${reviewDescription || 'درج شدہ بیان'}۔ رقم: ${amt}، ذریعہ ادائیگی: ${method}۔ مجوزہ فرضی دفتر: ${dest}۔ اگر کوئی تبدیلی کرنی ہو تو ترمیم کر کے تصدیق کریں۔`;
  }, [
    reviewAmount,
    reviewPaymentMethod,
    reviewDescription,
    complaint?.destination_workspace_id,
  ]);

  if (loading && !complaint && routeComplaintId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Loading complaint draft…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="min-h-10 gap-1.5">
            <Link to="/citizen">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>{t('wiz.dashboard')}</span>
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">
                {t('wiz.title')}
              </h1>
              {complaint && (
                <>
                  <span
                    dir="ltr"
                    className="font-mono text-sm font-semibold text-primary"
                  >
                    {complaint.complaint_id}
                  </span>
                  <WorkflowStatusBadge status={complaint.current_status} />
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('wiz.subtitle')}
            </p>
          </div>
        </div>

        {isOnline && getLocalDraft()?.pendingRemoteSync && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSyncRecoveredDraftNow()}
            className="gap-1.5 border-amber-400 bg-amber-50 text-amber-950"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span>{t('wiz.syncNow')}</span>
          </Button>
        )}
      </div>

      <WorkflowSteps
        steps={steps}
        currentIndex={step}
        onSelectStep={(idx) => {
          if (idx <= step && step < 3) setStep(idx);
        }}
      />

      {recoveryNotice && (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
          <AlertDescription className="text-xs font-medium">
            {recoveryNotice}
          </AlertDescription>
        </Alert>
      )}

      <ErrorBanner error={error} />
      {complaint && (submitting || complaint.agent_run_id || step===3) && <AgentProgress complaintId={complaint.complaint_id} active={submitting}/>}

      <FadeSlide key={step} className="space-y-6">
      {/* STEP 0 — EXPLAIN & EVIDENCE */}
      {step === 0 && (
        <Card className="border-border shadow-xs">
          <CardHeader>
            <CardTitle>{t('wiz.s0Title')}</CardTitle>
            <CardDescription>{t('wiz.s0Desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!USE_MOCK && <CaseVoicePanel complaint={complaint} ensureComplaint={ensureComplaintDraftOnServer} onConfirmed={record => { syncFormFromComplaint(record); setAnalysis(null); setCitizenAuthorizedChecked(false); }} />}
            {USE_MOCK && <UrduVoiceRecorder
              onTranscriptCaptured={(text) => {
                const combined = incident.description
                  ? `${incident.description}\n${text}`
                  : text;
                updateField('description', combined);
              }}
              onPresetApplied={handleVoicePreset}
            />}

            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" checked={providerPermission} onChange={e => setProviderPermission(e.target.checked)} />
              {copy("I permit this saved complaint to be sent to Gemini for analysis. This does not authorize filing.")}
            </label>
            <div className="space-y-2">
              <Label htmlFor="incident-description">
                {copy("Incident Description (Urdu RTL or English) *")}
              </Label>
              <Textarea
                id="incident-description"
                dir="rtl"
                lang="ur"
                rows={4}
                value={incident.description ?? ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="یہاں اردو یا انگریزی میں بتائیں کہ آپ کے ساتھ کیا فراڈ ہوا..."
                className="font-urdu min-h-28 text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scam-message">
                {copy("Scam SMS / WhatsApp Message Text (if available)")}
              </Label>
              <Textarea
                id="scam-message"
                rows={2}
                value={incident.scam_message ?? ''}
                onChange={(e) => updateField('scam_message', e.target.value)}
                placeholder={copy("Paste or type suspicious message text, fake relief claim, or link...")}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="incident-date">
                  {copy("Incident Date (exact or approx)")}
                </Label>
                <Input
                  id="incident-date"
                  value={incident.incident_date ?? ''}
                  onChange={(e) => updateField('incident_date', e.target.value)}
                  placeholder={copy("e.g., 2026-11-19 or Yesterday")}
                  className="min-h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-platform">{copy("Channel / Platform")}</Label>
                <Select
                  value={incident.platform || 'unknown'}
                  onValueChange={(val) => updateField('platform', val === 'unknown' ? null : val)}
                >
                  <SelectTrigger id="incident-platform" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">{copy("Unknown")}</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    <SelectItem value="Phone Call">{copy("Phone Call")}</SelectItem>
                    <SelectItem value="SMS / Phone Call">
                      {copy("SMS / Phone Call")}
                    </SelectItem>
                    <SelectItem value="Website / Link">{copy("Website / Link")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="money-lost">{copy("Was Money Lost?")}</Label>
                <Select
                  value={
                    incident.money_lost === true
                      ? 'yes'
                      : incident.money_lost === false
                        ? 'no'
                        : 'unknown'
                  }
                  onValueChange={(val) =>
                    updateField(
                      'money_lost',
                      val === 'yes' ? true : val === 'no' ? false : null,
                    )
                  }
                >
                  <SelectTrigger id="money-lost" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes — Money was transferred</SelectItem>
                    <SelectItem value="no">
                      No — Attempt failed / no loss
                    </SelectItem>
                    <SelectItem value="unknown">{copy("Not sure yet")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="amount-pkr">{copy("Amount Lost")}</Label>
                <Input
                  id="amount-pkr"
                  type="number"
                  min={0}
                  dir="ltr"
                  value={incident.amount ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateField('amount', val === '' ? null : Number(val));
                  }}
                  placeholder="e.g., 15000"
                  className="min-h-11 font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="incident-currency">{copy("Currency")}</Label>
                <Input id="incident-currency" value={incident.currency || ''} placeholder={copy("e.g., PKR, or leave unknown")} onChange={e => updateField('currency', e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-method">{copy("Payment Method")}</Label>
                <Select
                  value={incident.payment_method || 'none'}
                  onValueChange={(val) =>
                    updateField('payment_method', val === 'none' ? null : val)
                  }
                >
                  <SelectTrigger id="payment-method" className="min-h-11 w-full">
                    <SelectValue placeholder={copy("Select method")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{copy("Unknown / Not applicable")}</SelectItem>
                    <SelectItem value="Easypaisa">Easypaisa</SelectItem>
                    <SelectItem value="JazzCash">JazzCash</SelectItem>
                    <SelectItem value="Raast">Raast / Bank</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="tx-ref">{copy("Transaction Reference")}</Label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={txUnknown}
                      onCheckedChange={(checked) => {
                        const nextUnknown = Boolean(checked);
                        setTxUnknown(nextUnknown);
                        updateField(
                          'transaction_reference',
                          nextUnknown ? null : undefined,
                        );
                      }}
                    />
                    <span>{copy("Unknown / معلوم نہیں")}</span>
                  </label>
                </div>
                <Input
                  id="tx-ref"
                  dir="ltr"
                  disabled={txUnknown}
                  value={txUnknown ? '' : incident.transaction_reference ?? ''}
                  onChange={(e) =>
                    updateField(
                      'transaction_reference',
                      e.target.value || undefined,
                    )
                  }
                  placeholder={
                    txUnknown
                      ? copy("Recorded as unknown (null)")
                      : copy("Optional e.g., SYN-TXN-2026-0041")
                  }
                  className="min-h-11 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suspect-details">
                {copy("Suspect Phone Numbers, URLs, or Account Handles (comma or line separated, synthetic only)")}
              </Label>
              <Input
                id="suspect-details"
                dir="ltr"
                value={suspectText}
                onChange={(e) => {
                  const val = e.target.value;
                  setSuspectText(val);
                  const arr = val
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  updateField('suspect_details', arr);
                }}
                placeholder="e.g., +92-300-0000999, relief-verify-demo.example"
                className="min-h-11 font-mono"
              />
            </div>

            <EvidenceUploader
              complaintId={complaintId}
              ensureComplaintId={ensureComplaintDraftOnServer}
              evidenceIds={incident.evidence_ids ?? []}
              onUploaded={handleEvidenceUploaded}
            />

            <ProcessingSteps active={analyzing} steps={ANALYZE_STEPS} title="AI is analyzing / AI تجزیہ کر رہا ہے" />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {lang === 'ur' ? 'اگلا قدم: معاون واقعے کی قسم، متضاد معلومات اور دستیاب فرضی دفتر کے قواعد دیکھے گا۔' : 'Next: AI classifies the incident, checks for contradictions, and evaluates active demo routing rules.'}
              </p>
              <Button
                type="button"
                disabled={analyzing || !providerPermission || !(incident.description ?? '').trim()}
                onClick={() => void handleAnalyze()}
                className="min-h-12 gap-2 px-6 text-base font-semibold"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    <span>Analyzing Incident…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    <span>{copy("Save & Analyze with AI")}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 — AI CLASSIFICATION, READINESS & FOLLOW-UP / HUMAN REVIEW */}
      {step === 1 && <Button type="button" variant="outline" onClick={() => setStep(0)}>{copy("Edit incident details")}</Button>}
      {step === 1 && (
        <div className="space-y-5">
          {analysis && complaint && <AnalysisSuggestions key={complaint.version} analysis={analysis} complaint={complaint} onApplied={record => {
            syncFormFromComplaint(record);
            saveLocalDraft({complaintId:record.complaint_id,step:0,incident:record.incident_data,transcriptUrdu:record.incident_data.description || '',idempotencyKey,pendingRemoteSync:false});
            markRemoteSynced(record.complaint_id);
            setAnalysis(null); setCitizenAuthorizedChecked(false); setStep(0);
          }} />}
          <Card className="border-border shadow-xs">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{copy("Step 2: AI Classification & Readiness")}</CardTitle>
                  <CardDescription>
                    {copy("Advisory classification and deterministic rule check. Low confidence or contradictions stop automatically for Human Review.")}
                  </CardDescription>
                </div>
                {complaint && (
                  <WorkflowStatusBadge status={complaint.current_status} />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {!analysis ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
                  <p className="text-sm text-muted-foreground">
                    Run AI analysis on the latest saved details to refresh the
                    readiness score and follow-up check.
                  </p>
                  <Button
                    type="button"
                    disabled={analyzing}
                    onClick={() => void handleAnalyze()}
                  >
                    {analyzing ? 'Analyzing…' : copy("Run AI Analysis")}
                  </Button>
                </div>
              ) : (
                <>
                  <p className="rounded-lg border border-primary/20 bg-card p-4 text-sm leading-relaxed" dir="auto">{analysis.extraction?.spoken_summary_ur || copy('Review your saved details before continuing.')}</p>
                  <details className="space-y-4 rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">{copy('More details')}</summary>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Classified Incident Type
                      </p>
                      <p
                        dir="ltr"
                        className="font-mono text-base font-bold text-foreground"
                      >
                        {analysis.classification.incident_type}
                      </p>
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>AI Confidence Indicator</span>
                          <span className="font-mono font-semibold">
                            {Math.round(
                              analysis.classification.confidence * 100,
                            )}
                            %
                          </span>
                        </div>
                        <Progress
                          value={analysis.classification.confidence * 100}
                          className="h-2"
                        />
                        <p className="text-[11px] text-amber-800">
                          Confidence is an advisory signal only — never proof
                          that fraud occurred.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Prototype Readiness Policy Score
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold text-primary">
                          {analysis.readiness_score !== null
                            ? analysis.readiness_score.toFixed(2)
                            : 'N/A'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          / 1.00 (Threshold ≥ 0.85 to prepare review)
                        </span>
                      </div>
                      <Progress
                        value={(analysis.readiness_score ?? 0) * 100}
                        className="h-2"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        0.60–0.84 asks follow-ups • &lt; 0.60, contradiction, or
                        no matching rule stops for Human Review.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      AI Explanation
                    </p>
                    <p className="rounded-lg border border-border bg-white p-3 text-sm text-foreground">
                      {analysis.classification.explanation}
                    </p>
                  </div>

                  {analysis.classification.suspicious_indicators.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Detected Suspicious Signals
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.classification.suspicious_indicators.map(
                          (sig, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-xs text-amber-950"
                            >
                              {sig}
                            </Badge>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                  </details>
                </>
              )}

              {/* HUMAN REVIEW HARD STOP */}
              {(complaint?.current_status === 'HUMAN_REVIEW' ||
                analysis?.current_status === 'HUMAN_REVIEW') && (
                <Alert className="border-[#EA580C] bg-[#FFEDD5] text-[#9A3412]">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                  <AlertTitle className="text-base font-bold">
                    {copy('Needs human review — not submitted')}
                  </AlertTitle>
                  <AlertDescription className="mt-2 space-y-3 text-sm">
                    <p>
                      Dastak stopped automatically rather than guessing or
                      silently filing a conflicting or unroutable report.
                    </p>
                    {analysis &&
                      analysis.classification.contradiction_flags.length > 0 && (
                        <ul className="list-disc space-y-1 ps-5 font-medium">
                          {analysis.classification.contradiction_flags.map(
                            (flag, idx) => (
                              <li key={idx}>{flag}</li>
                            ),
                          )}
                        </ul>
                      )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(0)}
                        className="min-h-10 bg-white text-foreground"
                      >
                        {copy("Edit Incident Details")}
                      </Button>
                      <Button asChild variant="secondary" className="min-h-10">
                        <Link to="/citizen">
                          Keep in Human Review & Return to Dashboard
                        </Link>
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {complaint && ['HUMAN_REVIEW','NEEDS_INFORMATION'].includes(complaint.current_status) && <ReviewHelpPanel complaint={complaint}/>}

              {/* NEEDS INFORMATION FOLLOW-UP QUESTIONS */}
              {(complaint?.current_status === 'NEEDS_INFORMATION' ||
                analysis?.current_status === 'NEEDS_INFORMATION') &&
                analysis && (
                  <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                    <div className="flex items-center gap-2 text-amber-950">
                      <HelpCircle className="h-5 w-5 shrink-0" aria-hidden />
                      <h3 className="text-base font-semibold">
                        A Few Follow-Up Details Are Needed
                      </h3>
                    </div>

                    {!USE_MOCK && <CaseVoicePanel complaint={complaint} ensureComplaint={async () => complaintId || null} onConfirmed={record => { syncFormFromComplaint(record); setAnalysis(null); setStep(0); }} />}
                    <UrduAudioPlayer
                      title="Spoken Urdu Follow-Up Questions"
                      urduText={analysis.follow_up_questions_ur?.[0] || urduFollowUpScript}
                      complaint={complaint}
                      kind="follow_up"
                      englishSubtitle="Answer what you know below, or select 'Unknown' for any detail you do not have."
                    />

                    <div className="space-y-3">
                      {analysis.classification.missing_fields.map((field) => {
                        const tpl = FOLLOW_UP_TEMPLATES[field];
                        const isUnknown = Boolean(followUpUnknowns[field]);

                        return (
                          <div
                            key={field}
                            className="space-y-2 rounded-lg border border-amber-200 bg-white p-3.5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="space-y-1">
                                <Label className="text-sm font-semibold">
                                  {tpl?.question_en ??
                                    `Please provide: ${field}`}
                                </Label>
                                {tpl?.question_ur && (
                                  <p
                                    dir="rtl"
                                    lang="ur"
                                    className="font-urdu text-sm text-primary"
                                  >
                                    {tpl.question_ur}
                                  </p>
                                )}
                              </div>

                              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Checkbox
                                  checked={isUnknown}
                                  onCheckedChange={(checked) =>
                                    setFollowUpUnknowns((prev) => ({
                                      ...prev,
                                      [field]: Boolean(checked),
                                    }))
                                  }
                                />
                                <span>I don&apos;t know / معلوم نہیں</span>
                              </label>
                            </div>

                            <Input
                              disabled={isUnknown}
                              value={followUpAnswers[field] ?? ''}
                              onChange={(e) =>
                                setFollowUpAnswers((prev) => ({
                                  ...prev,
                                  [field]: e.target.value,
                                }))
                              }
                              placeholder={
                                isUnknown
                                  ? 'Marked as unknown (null)'
                                  : tpl?.placeholder ?? 'Enter answer...'
                              }
                              className="min-h-11"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap justify-between gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(0)}
                        className="min-h-11 bg-white"
                      >
                        Back to Step 1
                      </Button>
                      <Button
                        type="button"
                        disabled={analyzing}
                        onClick={() => void handleApplyFollowUpsAndReanalyze()}
                        className="min-h-11 gap-2"
                      >
                        {analyzing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Re-Analyzing…</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" aria-hidden />
                            <span>Update & Re-Analyze</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

              {/* READY FOR CITIZEN REVIEW */}
              {complaint?.current_status === 'CITIZEN_REVIEW' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-emerald-950">
                      Formal Complaint Prepared & Routed
                    </p>
                    <p className="text-xs text-emerald-900">
                      Destination:{' '}
                      <strong>
                        {getWorkspaceName(complaint.destination_workspace_id)}
                      </strong>{' '}
                      (Simulated) • Rule Version:{' '}
                      <span className="font-mono">
                        {complaint.rule_version_id}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setStep(2)}
                    className="min-h-12 gap-2 px-5 font-semibold"
                  >
                    <span>Review, Consent & Authorize</span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 2 — REVIEW, CONSENT & EXPLICIT AUTHORIZATION */}
      {step === 2 && complaint && (
        <div className="space-y-5">
          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle>{copy("Step 3A: Review & Correct Complaint Summary")}</CardTitle>
              <CardDescription>
                {copy("Listen to the Urdu summary below, correct any detail, and save before granting data-sharing consent.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PreparedComplaint complaint={complaint} dirty={reviewDirty}/>
              <UrduAudioPlayer
                title={copy("Spoken Urdu Complaint Summary")}
                urduText={urduSummaryScript}
                complaint={reviewDirty ? null : complaint}
                kind="review"
                englishSubtitle="Verify that the amount, payment method, and summary accurately reflect what happened."
              />

              <div className="space-y-2">
                <Label htmlFor="review-desc">{copy("Formal Complaint Summary")}</Label>
                <Textarea
                  id="review-desc"
                  dir="auto"
                  rows={3}
                  value={reviewDescription}
                  onChange={(e) => setReviewDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="review-amount">{copy("Amount (PKR)")}</Label>
                  <Input
                    id="review-amount"
                    type="number"
                    dir="ltr"
                    value={reviewAmount}
                    onChange={(e) => setReviewAmount(e.target.value)}
                    className="min-h-11 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="review-method">{copy("Payment Method")}</Label>
                  <Input
                    id="review-method"
                    value={reviewPaymentMethod}
                    onChange={(e) => setReviewPaymentMethod(e.target.value)}
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="review-tx">{copy("Transaction Reference")}</Label>
                    <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={reviewTxUnknown}
                        onCheckedChange={(c) => setReviewTxUnknown(Boolean(c))}
                      />
                      <span>{copy("Unknown")}</span>
                    </label>
                  </div>
                  <Input
                    id="review-tx"
                    dir="ltr"
                    disabled={reviewTxUnknown}
                    value={reviewTxUnknown ? '' : reviewTxRef}
                    onChange={(e) => setReviewTxRef(e.target.value)}
                    className="min-h-11 font-mono"
                  />
                </div>
              </div>

              <label className="flex gap-2 text-sm"><input type="checkbox" checked={providerPermission} onChange={e => setProviderPermission(e.target.checked)} />{copy("I permit Gemini to analyze my saved summary corrections.")}</label>
              {reviewDirty && <p role="status" className="text-sm">Save and analyze your summary corrections before authorizing submission.</p>}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void handleSaveReviewCorrections()}
                  className="min-h-10"
                >
                  {loading ? 'Saving Corrections…' : copy("Save Summary Corrections")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-indigo-200 bg-indigo-50/40 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-indigo-800" aria-hidden />
                <span>{copy("Step 3B: Simulated Routing Destination")}</span>
              </CardTitle>
              <CardDescription>
                Selected dynamically by the backend versioned rule engine — not
                hardcoded and not an official government authority.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">
                  {getWorkspaceName(complaint.destination_workspace_id)}
                </span>
                <Badge className="bg-indigo-700 text-white">
                  Simulated Service
                </Badge>
                <span
                  dir="ltr"
                  className="rounded border border-indigo-200 bg-white px-2 py-0.5 font-mono text-xs text-indigo-950"
                >
                  Rule Version: {complaint.rule_version_id || 'Unassigned'}
                </span>
              </div>
              {analysis?.classification.explanation && (
                <p className="text-xs text-slate-700">
                  {analysis.classification.explanation}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle>{copy("Step 3C: Granular Data-Sharing Consent")}</CardTitle>
              <CardDescription>
                {copy("Choose exactly who receives your data, for what purpose, and which scopes are shared. You can withdraw consent anytime.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConsentManager
                complaint={complaint}
                complaintId={complaint.complaint_id}
                recommendedRecipient={complaint.destination_workspace_id}
                onConsentsChange={setConsents}
              />
            </CardContent>
          </Card>

          {/* EXPLICIT CITIZEN AUTHORIZATION GATE */}
          <Card className="border-2 border-primary bg-emerald-50/40 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden />
                <span>{copy("Step 3D: Explicit Authorization Gate")}</span>
              </CardTitle>
              <CardDescription>
                Dastak never submits automatically. Only your explicit action
                below triggers the constrained agent to call simulated services.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!requiredSharingReady && (
                <Alert className="border-amber-400 bg-amber-50 text-amber-950">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  <AlertDescription className="text-xs font-medium">
                    Allow the missing required sharing permissions above:{' '}
                    <strong>
                      {missingSharing(complaint, consents).map(need => need.label).join(', ')}
                    </strong>{' '}
                    before authorizing submission.
                  </AlertDescription>
                </Alert>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-200 bg-white p-3.5 text-sm">
                <Checkbox
                  checked={citizenAuthorizedChecked}
                  onCheckedChange={(c) =>
                    setCitizenAuthorizedChecked(Boolean(c))
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-semibold text-foreground">
                    {lang === 'ur' ? 'میں نے شکایت کا یہ خلاصہ پڑھ لیا ہے اور دستک کو اسے اس فرضی دفتر میں جمع کرنے کی واضح اجازت دیتا/دیتی ہوں: ' : 'I reviewed this complaint summary and explicitly authorize Dastak to submit it to '}
                    {copy(getWorkspaceName(complaint.destination_workspace_id))}{' '}
                    {lang === 'ur' ? ' (فرضی خدمت)۔' : '(Simulated Service).'}
                  </span>
                  {lang !== 'ur' && (<span
                    dir="rtl"
                    lang="ur"
                    className="font-urdu mt-1 block text-sm text-primary"
                  >
                    میں نے شکایت کا جائزہ لے لیا ہے اور فرضی سروس کو جمع کروانے
                    کی باقاعدہ اجازت دیتا/دیتی ہوں۔
                  </span>)}
                </span>
              </label>

              {submissionTimedOut && (
                <Alert className="border-[#EA580C] bg-[#FFEDD5] text-[#9A3412]">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  <AlertTitle>{copy("Connection Dropped During Submission")}</AlertTitle>
                  <AlertDescription className="mt-1 space-y-2 text-xs">
                    <p>
                      Your Idempotency-Key (
                      <span dir="ltr" className="font-mono">
                        {idempotencyKey}
                      </span>
                      ) is preserved so checking or retrying will not create a
                      duplicate submission.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={submitting}
                      onClick={() => void handleAuthorizeAndSubmit(true)}
                      className="bg-[#9A3412] text-white hover:bg-[#7C2D12]"
                    >
                      Check Prior Submission & Retry Safely
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <ProcessingSteps active={submitting} steps={SUBMIT_STEPS} title="Submitting safely / محفوظ طریقے سے جمع ہو رہا ہے" intervalMs={2200} />

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>button]:w-full sm:[&>button]:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="min-h-11 bg-white"
                >
                  {copy("Back")}
                </Button>

                <Button
                  type="button"
                  disabled={
                    submitting ||
                    reviewDirty ||
                    !requiredSharingReady ||
                    !citizenAuthorizedChecked
                  }
                  onClick={() => void handleAuthorizeAndSubmit(false)}
                  className="min-h-13 gap-2 px-6 text-base font-bold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                      <span>Running Constrained Agent…</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" aria-hidden />
                      <span>{copy("Authorize & Submit")}</span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 3 — CONFIRMATION SCREEN */}
      {step === 3 && complaint && (
        <Card className="border-2 border-emerald-500 bg-white shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden />
              <CardTitle className="text-xl text-primary">
                Simulated Complaint Submitted
              </CardTitle>
              <Badge className="bg-amber-100 text-amber-900">
                Simulated Service Only
              </Badge>
            </div>
            <CardDescription>
              Your authorized complaint was processed by the constrained agent
              and assigned a simulated reference number. This is NOT an official
              government filing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                  Simulated Reference Number
                </p>
                <p
                  dir="ltr"
                  className="mt-1 font-mono text-2xl font-bold text-emerald-950"
                >
                  {confirmation?.submission_reference || complaint.submission_reference || 'Confirmation unavailable — recover the saved receipt.'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                  Simulated Destination Workspace
                </p>
                <p className="mt-1 text-base font-semibold text-emerald-950">
                  {getWorkspaceName(complaint.destination_workspace_id)}
                </p>
                <p
                  dir="ltr"
                  className="font-mono text-xs text-emerald-800"
                >
                  Pinned Rule Version: {complaint.rule_version_id}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                <strong>Complaint ID:</strong>{' '}
                <span dir="ltr" className="font-mono text-foreground">
                  {complaint.complaint_id}
                </span>
              </p>
              <p className="mt-1">
                <strong>Idempotency Key:</strong>{' '}
                <span dir="ltr" className="font-mono text-foreground">
                  {confirmation?.idempotency_key || idempotencyKey}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" className="min-h-11"><a href="/citizen/new">Start a new report</a></Button>
              <Button asChild className="min-h-11">
                <Link
                  to={`/citizen/complaints/${encodeURIComponent(complaint.complaint_id)}`}
                >
                  Track Timeline & Manage Consent
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/citizen">Return to Citizen Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </FadeSlide>
    </div>
  );
}

