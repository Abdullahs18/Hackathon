import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export interface ProcessingStep {
  en: string;
  ur: string;
}

export const ANALYZE_STEPS: ProcessingStep[] = [
  { en: 'Saving your report', ur: 'آپ کی رپورٹ محفوظ ہو رہی ہے' },
  { en: 'Understanding the incident', ur: 'واقعہ سمجھا جا رہا ہے' },
  { en: 'Checking for contradictions', ur: 'تضاد کی جانچ' },
  { en: 'Finding the right office', ur: 'درست دفتر کا انتخاب' },
];

export const SUBMIT_STEPS: ProcessingStep[] = [
  { en: 'Checking your consent', ur: 'آپ کی رضامندی کی جانچ' },
  { en: 'Preparing the complaint', ur: 'شکایت تیار ہو رہی ہے' },
  { en: 'Sending to simulated office', ur: 'فرضی دفتر کو بھیجا جا رہا ہے' },
  { en: 'Saving confirmation', ur: 'تصدیق محفوظ ہو رہی ہے' },
];

/** Lightweight step-by-step progress; advances on a timer, holds on the last step until `active` ends. */
export function ProcessingSteps({
  active,
  steps,
  title,
  intervalMs = 1800,
}: {
  active: boolean;
  steps: ProcessingStep[];
  title: string;
  intervalMs?: number;
}) {
  const [current, setCurrent] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    setCurrent(0);
    setSlow(false);
    const t = window.setInterval(
      () => setCurrent((c) => Math.min(c + 1, steps.length - 1)),
      intervalMs,
    );
    const s = window.setTimeout(() => setSlow(true), 8000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(s);
    };
  }, [active, steps.length, intervalMs]);

  if (!active) return null;
  const pct = Math.round(((current + 1) / (steps.length + 1)) * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full space-y-3 rounded-xl border border-primary/30 bg-emerald-50/60 p-3 sm:p-4"
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
        <div
          className="progress-shimmer h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li
              key={s.en}
              className={`animate-step-in flex items-center justify-between gap-3 text-sm ${
                done ? 'text-emerald-800' : now ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                ) : now ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 opacity-40" aria-hidden />
                )}
                <span>{s.en}</span>
              </span>
              <span dir="rtl" lang="ur" className="font-urdu text-xs">{s.ur}</span>
            </li>
          );
        })}
      </ol>
      {slow && (
        <p className="text-xs text-amber-800">
          Slow connection — still working. Your draft is saved; please keep this page open.
          <span dir="rtl" lang="ur" className="font-urdu block text-xs">
            انٹرنیٹ سست ہے — کام جاری ہے۔ آپ کا مسودہ محفوظ ہے، صفحہ بند نہ کریں۔
          </span>
        </p>
      )}
    </div>
  );
}