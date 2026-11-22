import { AlertCircle, Check } from 'lucide-react';
import { m } from 'motion/react';
import { useI18n } from '@/i18n/I18nContext';

export interface WizardStepDef {
  title: string;
  subtitle?: string;
  status?: 'complete' | 'current' | 'upcoming' | 'error';
}

interface WorkflowStepsProps {
  steps: WizardStepDef[];
  currentIndex: number;
  onSelectStep?: (index: number) => void;
}

export function WorkflowSteps({
  steps,
  currentIndex,
  onSelectStep,
}: WorkflowStepsProps) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('wiz.stepNav')} className="w-full">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const derivedStatus =
            step.status ??
            (index < currentIndex
              ? 'complete'
              : index === currentIndex
                ? 'current'
                : 'upcoming');

          const clickable =
            Boolean(onSelectStep) &&
            (derivedStatus === 'complete' || derivedStatus === 'current');

          const baseStyle =
            derivedStatus === 'complete'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : derivedStatus === 'error'
                ? 'border-orange-400 bg-orange-50 text-orange-950'
                : derivedStatus === 'current'
                  ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary'
                  : 'border-border bg-card text-muted-foreground';

          const markerStyle =
            derivedStatus === 'complete'
              ? 'bg-primary text-primary-foreground'
              : derivedStatus === 'error'
                ? 'bg-[#EA580C] text-white'
                : derivedStatus === 'current'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground';

          return (
            <li
              key={step.title}
              aria-current={derivedStatus === 'current' ? 'step' : undefined}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSelectStep?.(index)}
                className={`relative flex min-h-14 w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-start transition-colors ${baseStyle} ${
                  clickable
                    ? 'cursor-pointer hover:border-primary'
                    : 'cursor-default'
                }`}
              >
                {derivedStatus === 'current' && (
                  <m.span
                    layoutId="wizard-step-active"
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${markerStyle}`}
                >
                  {derivedStatus === 'complete' ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : derivedStatus === 'error' ? (
                    <AlertCircle className="h-4 w-4" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-snug font-semibold sm:text-sm">
                    {step.title}
                  </span>
                  {step.subtitle && (
                    <span className="block text-[11px] leading-snug opacity-80">
                      {step.subtitle}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
