import { ShieldAlert } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

/** Mandatory simulated-prototype notice. Lives in normal flow (callers wrap it in a sticky container), so it can never cover content. */
export function PrototypeBanner() {
  const { t } = useI18n();
  return (
    <div
      role="region"
      aria-label={t('banner.label')}
      className="border-b-2 border-[#D97706] bg-[#FEF3C7] px-3 py-2 text-[#92400E] shadow-[0_1px_0_rgb(146_64_14/0.08)]"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-center text-[11px] leading-snug font-semibold sm:text-xs">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FDE68A] ring-1 ring-[#D97706]/30">
          <ShieldAlert className="h-3.5 w-3.5 text-[#B45309]" aria-hidden />
        </span>
        <span>{t('banner.text')}</span>
      </div>
    </div>
  );
}
