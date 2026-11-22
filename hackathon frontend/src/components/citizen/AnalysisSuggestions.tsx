import { useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { dastakApi } from '@/lib/apiClient';
import type { AnalysisResponse, ComplaintRecord, IncidentPatch } from '@/types/dastak';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

const LABELS: Record<string, [string, string]> = {
  incident_type: ['Incident type', 'واقعے کی قسم'], incident_date: ['Incident date', 'واقعے کی تاریخ'],
  description: ['Description', 'واقعے کی تفصیل'], scam_message: ['Scam message', 'مشکوک پیغام'],
  platform: ['Contact channel', 'رابطہ کیسے ہوا'], money_lost: ['Money lost', 'رقم کا نقصان'],
  amount: ['Amount', 'رقم'], currency: ['Currency', 'کرنسی'], payment_method: ['Payment method', 'ادائیگی کا طریقہ'],
  transaction_reference: ['Transaction reference', 'ٹرانزیکشن کا حوالہ'], suspect_details: ['Reported contacts', 'بتائے گئے رابطے'],
};

export function AnalysisSuggestions({analysis, complaint, onApplied}: {analysis: AnalysisResponse; complaint: ComplaintRecord; onApplied: (record: ComplaintRecord) => void}) {
  const {lang} = useI18n(); const say = (en: string, ur: string) => lang === 'ur' ? ur : en;
  const suggestions = Object.entries(analysis.extraction?.incident_data || {}).filter(([field, value]) => field in LABELS && value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0) && JSON.stringify(value) !== JSON.stringify(complaint.incident_data[field as keyof typeof complaint.incident_data]));
  const [selected, setSelected] = useState<string[]>(() => suggestions.filter(([field]) => [null, undefined, ''].includes(complaint.incident_data[field as keyof typeof complaint.incident_data] as string | null | undefined)).map(([field]) => field));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  if (!suggestions.length) return null;
  async function apply() {
    if (!confirmed || !selected.length || busy) return;
    setBusy(true); setError(null);
    try {
      const patch = Object.fromEntries(suggestions.filter(([field]) => selected.includes(field))) as IncidentPatch;
      const updated = await dastakApi.updateComplaint(complaint.complaint_id, patch, complaint.version);
      onApplied(updated);
    } catch (cause) {setError(cause);} finally {setBusy(false);}
  }
  return <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4" aria-label="AI suggested complaint fields">
    <h3 className="font-semibold">{say('Details found in your explanation', 'آپ کی بات سے سمجھی گئی تفصیلات')}</h3>
    <p className="text-sm leading-relaxed">{say('Review these suggestions before filling your form. Existing answers stay unchanged unless you select their replacement. Unknown facts remain unknown.', 'فارم بھرنے سے پہلے یہ تجاویز دیکھیں۔ آپ کی پرانی معلومات صرف تب بدلیں گی جب آپ ان کی تبدیلی منتخب کریں۔ نامعلوم باتیں نامعلوم رہیں گی۔')}</p>
    <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">{say('Choose the facts to apply', 'محفوظ کرنے والی معلومات منتخب کریں')}</legend>{suggestions.map(([field, value]) => <label key={field} className="flex min-w-0 items-start gap-3 rounded-lg border p-3 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={selected.includes(field)} onChange={event => setSelected(previous => event.target.checked ? [...previous, field] : previous.filter(item => item !== field))}/><span className="min-w-0"><strong className="block">{LABELS[field][lang === 'ur' ? 1 : 0]}</strong><span dir="auto" className="block whitespace-pre-wrap break-words">{typeof value === 'boolean' ? (value ? say('Yes', 'ہاں') : say('No', 'نہیں')) : Array.isArray(value) ? value.join('\n') : String(value)}</span></span></label>)}</fieldset>
    <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{say('I checked the selected facts and want them saved in my form.', 'میں نے منتخب معلومات دیکھ لی ہیں اور انہیں اپنے فارم میں محفوظ کرنا چاہتا/چاہتی ہوں۔')}</span></label>
    <Button type="button" disabled={!confirmed || !selected.length || busy} onClick={() => void apply()}>{busy ? say('Saving…', 'محفوظ ہو رہا ہے…') : say('Apply selected suggestions', 'منتخب درست معلومات فارم میں بھریں')}</Button>
    <p className="text-xs text-muted-foreground">{say('After saving, check the updated form and analyze again. This does not grant permission or submit your complaint.', 'محفوظ ہونے کے بعد فارم دیکھیں اور دوبارہ جانچ کریں۔ اس سے کوئی اجازت نہیں دی جائے گی اور شکایت جمع نہیں ہوگی۔')}</p>
    {Boolean(error) && <ErrorBanner error={error}/>}
  </section>;
}
