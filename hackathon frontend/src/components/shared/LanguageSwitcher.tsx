import { m } from 'motion/react';
import { useI18n, type Lang } from '@/i18n/I18nContext';

const OPTIONS: Array<{ value: Lang; label: string; lang: string }> = [
  { value: 'en', label: 'EN', lang: 'en' },
  { value: 'ur', label: 'اردو', lang: 'ur' },
];

/** Segmented EN | اردو switcher with a sliding shared-element pill. */
export function LanguageSwitcher({ idSuffix = 'header' }: { idSuffix?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t('lang.switch')}
      className="relative inline-flex h-10 items-center rounded-full border border-border bg-muted p-1"
      dir="ltr"
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            lang={opt.lang}
            onClick={() => setLang(opt.value)}
            className={`relative z-10 inline-flex h-8 min-w-12 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${
              opt.value === 'ur' ? 'font-urdu-ui' : ''
            } ${active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {active && (
              <m.span
                layoutId={`lang-pill-${idSuffix}`}
                className="absolute inset-0 -z-10 rounded-full bg-primary shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
