import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { m } from 'motion/react';
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  History,
  KeyRound,
  Keyboard,
  Link2,
  Loader2,
  type LucideIcon,
  Mic,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { staggerChild, staggerParent } from '@/components/motion/presets';
import { useAuth } from '@/context/AuthContext';
import { useDraftSync, type LocalDraftPayload } from '@/context/DraftSyncContext';
import { useI18n } from '@/i18n/I18nContext';
import type { TranslationKey } from '@/i18n/en';
import { getFriendlyName } from '@/i18n/names';
import { dastakApi } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import type { ComplaintRecord } from '@/types/dastak';

const SCAM_TYPES: Array<{
  id: 'relief' | 'bank' | 'link' | 'transfer';
  icon: LucideIcon;
  title: TranslationKey;
  desc: TranslationKey;
  tone: string;
}> = [
  { id: 'relief', icon: Smartphone, title: 'scam.relief.title', desc: 'scam.relief.desc', tone: 'bg-amber-100 text-amber-800' },
  { id: 'bank', icon: PhoneCall, title: 'scam.bank.title', desc: 'scam.bank.desc', tone: 'bg-indigo-100 text-indigo-800' },
  { id: 'link', icon: Link2, title: 'scam.link.title', desc: 'scam.link.desc', tone: 'bg-blue-100 text-blue-950' },
  { id: 'transfer', icon: WalletCards, title: 'scam.transfer.title', desc: 'scam.transfer.desc', tone: 'bg-red-100 text-red-900' },
];

const HOW_STEPS: Array<{
  icon: LucideIcon;
  title: TranslationKey;
  desc: TranslationKey;
}> = [
  { icon: Mic, title: 'cit.step1.title', desc: 'cit.step1.desc' },
  { icon: ClipboardCheck, title: 'cit.step2.title', desc: 'cit.step2.desc' },
  { icon: Search, title: 'cit.step3.title', desc: 'cit.step3.desc' },
];

export function CitizenDashboard() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { getLocalDraft, clearLocalDraft } = useDraftSync();
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [localDraft, setLocalDraft] = useState<LocalDraftPayload | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocalDraft(getLocalDraft());
    try {
      setComplaints(await dastakApi.listComplaints());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [getLocalDraft]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRecoverDraft = () => {
    if (!localDraft) return;
    if (localDraft.complaintId) {
      navigate(
        `/citizen/complaints/${encodeURIComponent(localDraft.complaintId)}/wizard?recover=1`,
      );
    } else {
      navigate('/citizen/new?recover=1');
    }
  };

  const handleDiscardDraft = () => {
    clearLocalDraft();
    setLocalDraft(null);
  };

  const canResumeWizard = (status: ComplaintRecord['current_status']) =>
    status === 'DRAFT' ||
    status === 'COLLECT_INFORMATION' ||
    status === 'NEEDS_INFORMATION' ||
    status === 'HUMAN_REVIEW' ||
    status === 'CITIZEN_REVIEW' ||
    status === 'CONSENT_AND_AUTHORIZATION';

  const name = getFriendlyName(user?.user_id, lang);

  return (
    <div className="space-y-8">
      {/* Hero action card */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] p-6 text-white shadow-lg ring-1 ring-white/15 sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -end-16 -top-16 h-60 w-60 rounded-full bg-white/12 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 start-1/3 h-44 w-44 rounded-full bg-white/8 blur-3xl"
        />
        <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:text-start">
          <div className="flex-1 space-y-3">
            <p className="text-sm font-semibold text-white/90">
              {t('cit.welcome', { name })}
            </p>
            <h1 id="hero-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t('cit.heroTitle')}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-white/90">{t('cit.heroDesc')}</p>
            <div className="flex flex-col items-stretch gap-3 pt-2 sm:flex-row sm:items-center">
              <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link
                  to="/citizen/new?mode=voice"
                  className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[#ffffff] px-6 text-lg font-bold text-[#0f5132] shadow-md ring-1 ring-white/40 transition-colors hover:bg-[#ecfdf5] dark:bg-[#ecfdf5] dark:text-[#05261b] dark:hover:bg-[#ffffff] sm:w-auto"
                >
                  <span className="relative flex h-10 w-10 items-center justify-center">
                    <span aria-hidden className="hero-ring absolute inset-0 rounded-full bg-[#0f5132]/40" />
                    <span aria-hidden className="hero-ring absolute inset-0 rounded-full bg-[#0f5132]/30 [animation-delay:1.1s]" />
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#0f5132] text-white">
                      <Mic className="h-5 w-5" aria-hidden />
                    </span>
                  </span>
                  <span>{t('cit.speak')}</span>
                </Link>
              </m.div>
              <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link
                  to="/citizen/new?mode=text"
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full border-2 border-white/75 bg-white/5 px-6 text-base font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/15 sm:w-auto"
                >
                  <Keyboard className="h-5 w-5" aria-hidden />
                  <span>{t('cit.type')}</span>
                </Link>
              </m.div>
            </div>
            <p className="text-xs font-medium text-white/80">{t('cit.speakHint')}</p>
          </div>
        </div>
      </section>

      {/* 3-step guide */}
      <section aria-labelledby="how-title" className="space-y-3">
        <h2 id="how-title" className="text-lg font-bold">
          {t('cit.howTitle')}
        </h2>
        <m.ol
          className="grid gap-3 sm:grid-cols-3"
          variants={staggerParent}
          initial="hidden"
          animate="show"
        >
          {HOW_STEPS.map((step, i) => (
            <m.li
              key={step.title}
              variants={staggerChild}
              whileHover={{ y: -3 }}
              className="relative flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs"
            >
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <step.icon className="h-6 w-6" aria-hidden />
                <span className="absolute -top-2 -start-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-bold">{t(step.title)}</span>
                <span className="block text-sm text-muted-foreground">{t(step.desc)}</span>
              </span>
              {i < HOW_STEPS.length - 1 && (
                <ArrowRight
                  className="absolute -end-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground sm:block rtl:rotate-180"
                  aria-hidden
                />
              )}
            </m.li>
          ))}
        </m.ol>
      </section>

      {/* Quick-start scam types */}
      <section aria-labelledby="quick-title" className="space-y-3">
        <div>
          <h2 id="quick-title" className="text-lg font-bold">
            {t('cit.quickTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('cit.quickDesc')}</p>
        </div>
        <m.div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          variants={staggerParent}
          initial="hidden"
          animate="show"
        >
          {SCAM_TYPES.map((s) => (
            <m.div
              key={s.id}
              variants={staggerChild}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
            >
              <Link
                to={`/citizen/new?scam=${s.id}`}
                className="group flex h-full min-h-28 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-bold">{t(s.title)}</span>
                  <span className="block text-xs text-muted-foreground">{t(s.desc)}</span>
                </span>
                <ArrowRight
                  className="ms-auto mt-auto h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:rotate-180"
                  aria-hidden
                />
              </Link>
            </m.div>
          ))}
        </m.div>
      </section>

      {localDraft && (
        <Alert className="border-amber-400 bg-amber-50 text-amber-950">
          <RotateCcw className="h-4 w-4 text-amber-700" aria-hidden />
          <AlertTitle className="font-semibold">{t('cit.draftTitle')}</AlertTitle>
          <AlertDescription className="mt-1.5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="space-y-1 text-xs">
              <p>
                {t('cit.draftSaved', { time: formatShortTime(localDraft.updatedAt) })}
                {' • '}
                {localDraft.complaintId
                  ? t('cit.draftCase', { id: localDraft.complaintId })
                  : t('cit.draftNew')}{' '}
                {localDraft.pendingRemoteSync ? t('cit.draftPending') : ''}
              </p>
              {localDraft.incident.description && (
                <p
                  dir="rtl"
                  lang="ur"
                  className="font-urdu line-clamp-1 rounded bg-white/80 px-2 py-0.5 text-sm text-slate-900"
                >
                  {localDraft.incident.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" size="sm" onClick={handleRecoverDraft} className="min-h-10 gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span>{t('cit.draftContinue')}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleDiscardDraft}
                className="min-h-10 gap-1.5 bg-white"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                <span>{t('common.discard')}</span>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <ErrorBanner error={error} onRetry={() => void loadData()} />

      {/* My reports */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <History className="h-5 w-5 text-primary" aria-hidden />
            <span>{t('cit.myReports', { count: complaints.length })}</span>
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadData()}
            className="min-h-10 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>

        {loading && complaints.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>{t('cit.loadingReports')}</span>
            </CardContent>
          </Card>
        ) : complaints.length === 0 ? (
          <Card>
            <CardHeader className="items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <KeyRound className="h-6 w-6" aria-hidden />
              </span>
              <CardTitle>{t('cit.emptyTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('cit.emptyDesc')}</p>
            </CardHeader>
          </Card>
        ) : (
          <m.div
            className="grid gap-3"
            variants={staggerParent}
            initial="hidden"
            animate="show"
          >
            {complaints.map((item) => (
              <m.div key={item.complaint_id} variants={staggerChild} whileHover={{ y: -2 }}>
                <Card className="border-border shadow-xs">
                  <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span dir="ltr" className="font-mono text-sm font-bold text-primary">
                          {item.complaint_id}
                        </span>
                        <WorkflowStatusBadge status={item.current_status} />
                        {item.destination_workspace_id && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-slate-300 bg-slate-50 text-xs text-slate-800"
                          >
                            <Building2 className="h-3 w-3" aria-hidden />
                            <span>
                              {getWorkspaceName(item.destination_workspace_id)} ({t('common.simulated')})
                            </span>
                          </Badge>
                        )}
                        {item.rule_version_id && (
                          <span
                            dir="ltr"
                            className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground"
                          >
                            {t('cit.rule', { id: item.rule_version_id })}
                          </span>
                        )}
                      </div>

                      <p dir="auto" className="line-clamp-2 text-sm text-foreground">
                        {item.complaint_draft?.description ||
                          item.incident_data.description ||
                          t('cit.noDesc')}
                      </p>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          {t('common.date')}: {item.incident_data.incident_date || t('common.unknown')}
                        </span>
                        {item.incident_data.amount != null && (
                          <span dir="ltr">
                            {t('common.amount')}: {item.incident_data.amount.toLocaleString()}{' '}
                            {item.incident_data.currency || 'PKR'}
                          </span>
                        )}
                        {item.incident_data.payment_method && (
                          <span>
                            {t('common.method')}: {item.incident_data.payment_method}
                          </span>
                        )}
                        <span>
                          {t('common.evidence')}: {(item.incident_data.evidence_ids ?? []).length}{' '}
                          {t('common.files')}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canResumeWizard(item.current_status) && (
                        <Button asChild size="sm" className="min-h-10 gap-1.5">
                          <Link to={`/citizen/complaints/${encodeURIComponent(item.complaint_id)}/wizard`}>
                            <span>{t('cit.continue')}</span>
                            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline" className="min-h-10">
                        <Link to={`/citizen/complaints/${encodeURIComponent(item.complaint_id)}`}>
                          {t('cit.track')}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </m.div>
            ))}
          </m.div>
        )}
      </section>    </div>
  );
}
