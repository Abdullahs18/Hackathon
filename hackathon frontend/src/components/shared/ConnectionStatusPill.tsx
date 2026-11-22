import { CloudCheck, CloudOff, Loader2, Wifi, WifiOff } from 'lucide-react';
import { USE_MOCK } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import { useDraftSync } from '@/context/DraftSyncContext';
import { useI18n } from '@/i18n/I18nContext';

/** Compact, calm connection / draft-save indicator. */
export function ConnectionStatusPill() {
  const { isOnline, syncStatus, lastSavedAt } = useDraftSync();
  const { t } = useI18n();

  const time = lastSavedAt ? formatShortTime(lastSavedAt) : t('conn.notSaved');

  let tone = 'border-[#10B981]/50 bg-[#ECFDF5] text-[#065F46]';
  let icon = <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  let label = t('conn.online');

  if (!isOnline) {
    tone = 'border-[#EA580C] bg-[#FFEDD5] text-[#9A3412]';
    icon = <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />;
    label = t('conn.offline');
  } else if (syncStatus === 'saving') {
    icon = <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />;
    label = t('conn.saving');
  } else if (syncStatus === 'saved_cloud') {
    icon = <CloudCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />;
    label = t('conn.savedCloud', { time });
  } else if (syncStatus === 'saved_local') {
    label = t('conn.savedLocal', { time });
  } else if (syncStatus === 'error') {
    tone = 'border-[#EF4444] bg-[#FEE2E2] text-[#991B1B]';
    icon = <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />;
    label = t('conn.paused');
  }

  // Healthy "Online" state collapses to a dot on small screens to keep the header calm.
  const compactOnMobile = isOnline && (syncStatus === 'idle' || syncStatus === 'offline_local');

  return (
    <div
      role="status"
      aria-live="polite"
      title={label}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap ${tone}`}
    >
      {icon}
      <span className={compactOnMobile ? 'hidden md:inline' : 'hidden sm:inline'}>
        {label}
      </span>
      {USE_MOCK && <span className="sr-only">{t('header.mockApi')}</span>}
    </div>
  );
}
