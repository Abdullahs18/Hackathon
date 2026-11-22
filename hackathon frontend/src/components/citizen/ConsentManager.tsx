import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { useCallback, useEffect, useState } from 'react';
import { dastakApi } from '@/lib/apiClient';
import type { ComplaintRecord, ConsentRecord } from '@/types/dastak';
import { coversConsent, requiredSharing } from '@/lib/consentRequirements';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

const OPTIONS = [
  {recipient:'workspace:mock-financial-fraud', label:'Mock Financial Fraud Intake', purpose:'complaint_submission', scopes:['case_status','incident_data','evidence']},
  {recipient:'workspace:mock-digital-safety', label:'Mock Digital Safety Intake', purpose:'complaint_submission', scopes:['case_status','incident_data','evidence']},
  {recipient:'service:mock-identity', label:'Simulated identity check', purpose:'mock_identity_check', scopes:['case_status','identity_reference']},
  {recipient:'service:mock-data', label:'Simulated reporting requirements', purpose:'mock_requirements_lookup', scopes:['case_status','incident_data.incident_type']},
  {recipient:'service:mock-payment', label:'Simulated payment lookup (when a reference is supplied)', purpose:'mock_payment_lookup', scopes:['case_status','incident_data.transaction_reference','incident_data.amount','incident_data.currency','incident_data.payment_method']},
  {recipient:'user:demo-helper', label:'Demo community helper', purpose:'helper_assistance', scopes:['case_status','incident_data','evidence']},
  {recipient:'service:gemini-voice', label:'Gemini voice processing', purpose:'voice_processing', scopes:['voice_audio','voice_transcript']},
  {recipient:'service:gtts', label:'gTTS Urdu speech', purpose:'speech_synthesis', scopes:['spoken_text']},
  {recipient:'service:gemini-speech', label:'Gemini Urdu translation', purpose:'speech_translation', scopes:['spoken_text']},
];

const SCOPE_LABELS:Record<string,string> = {
  case_status:'Case status',incident_data:'Incident details',evidence:'Evidence files',identity_reference:'Synthetic identity reference',
  'incident_data.incident_type':'Incident type','incident_data.transaction_reference':'Transaction reference',
  'incident_data.amount':'Amount','incident_data.currency':'Currency','incident_data.payment_method':'Payment method',
  'incident_data.incident_date':'Incident date','incident_data.description':'Complaint description','incident_data.suspect_details':'Reported suspect details',
  voice_audio:'Voice recording',voice_transcript:'Voice transcript',spoken_text:'Text to read aloud',
};

export function ConsentManager({complaintId, complaint, recommendedRecipient, onConsentsChange}: {complaintId:string; complaint?:ComplaintRecord; recommendedRecipient?:string|null; onConsentsChange?:(rows:ConsentRecord[])=>void}) {
  const {copy} = useWorkflowCopy();
  const [rows, setRows] = useState<ConsentRecord[]>([]);
  const [selected, setSelected] = useState(recommendedRecipient ? 'workspace:'+recommendedRecipient : OPTIONS[0].recipient);
  const option = OPTIONS.find(o => o.recipient === selected) || OPTIONS[0];
  const [scopes, setScopes] = useState<string[]>(option.scopes);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [savedCase, setSavedCase] = useState<ComplaintRecord | null>(null);
  const [allowedBundleKey, setAllowedBundleKey] = useState<string | null>(null);
  const needs = requiredSharing(complaint || savedCase);
  const missing = needs.filter(need => !coversConsent(rows, need));
  const requirementsKey = JSON.stringify(needs);
  const bundleKey = complaintId + requirementsKey;
  const bundleAllowed = allowedBundleKey === bundleKey;
  const load = useCallback(async () => {
    const [current, record] = await Promise.all([dastakApi.listConsents(complaintId), dastakApi.getComplaint(complaintId)]);
    setSavedCase(record);
    setRows(current); onConsentsChange?.(current);
  }, [complaintId, onConsentsChange]);
  useEffect(() => { void load().catch(setError); }, [load]);
  useEffect(() => {
    const changed = (event: Event) => {if ((event as CustomEvent<string>).detail === complaintId) void load().catch(setError);};
    window.addEventListener('dastak:consents-changed', changed);
    return () => window.removeEventListener('dastak:consents-changed', changed);
  }, [complaintId, load]);
  async function command(action:()=>Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause); }
    finally { try {await load();} catch (cause) {setError(cause);} setBusy(false); }
  }
  async function grantBundle() {
    await command(async () => {
      const latest = await dastakApi.getComplaint(complaintId);
      const currentNeeds = requiredSharing(latest);
      if (JSON.stringify(currentNeeds) !== requirementsKey) {
        setAllowedBundleKey(null);
        throw new Error('The complaint sharing requirements changed. Refresh the saved complaint and review the recipients again.');
      }
      const currentRows = await dastakApi.listConsents(complaintId);
      const outcomes = await Promise.allSettled(currentNeeds.filter(need => !coversConsent(currentRows, need)).map(need => {
        const {recipient, purpose, data_scopes} = need;
        const existing = currentRows.find(row => row.status === 'granted' && row.recipient === recipient && row.purpose === purpose);
        return existing ? dastakApi.changeConsent(existing.consent_id, {data_scopes: [...new Set([...existing.data_scopes, ...data_scopes])]}) : dastakApi.grantConsent(complaintId, {recipient, purpose, data_scopes});
      }));
      if (outcomes.some(outcome => outcome.status === 'rejected')) throw new Error('Some permissions could not be saved. Saved grants are shown below; retry to complete only the missing permissions.');
      setAllowedBundleKey(null);
    });
  }
  return <section id="sharing-settings" className="space-y-4 scroll-mt-48" aria-label="Data sharing consent">
    {Boolean(error) && <ErrorBanner error={error} />}
    <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4" aria-label="Required complaint sharing">
      <h3 className="font-semibold text-foreground">{copy("Allow required complaint sharing")}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{copy("Review these recipients, then allow them together. This saves a separate permission for each recipient. It does not file your complaint. Helper access and voice providers are optional.")}</p>
      {needs.length ? <ul className="space-y-2.5">{needs.map(need => <li key={need.recipient} className="min-w-0 rounded-lg border border-border/70 bg-card p-3 text-sm leading-relaxed"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong className="text-foreground">{copy(need.label)}</strong><span className="text-muted-foreground"> — </span><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${coversConsent(rows, need) ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{copy(coversConsent(rows, need) ? 'Allowed' : 'Permission needed')}</span></span></div><p className="mt-1 break-words text-xs text-muted-foreground">{need.data_scopes.map(scope => copy(SCOPE_LABELS[scope] || scope)).join(', ')}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">{copy("Analyze the saved complaint to see its required recipients.")}</p>}
      {missing.length > 0 ? <><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-card p-3 text-sm leading-relaxed"><input className="mt-1 shrink-0 accent-primary" type="checkbox" checked={bundleAllowed} onChange={event => setAllowedBundleKey(event.target.checked ? bundleKey : null)} /><span>{copy("I allow the listed required recipients to use the listed data for this simulated complaint.")}</span></label><Button type="button" className="h-auto min-h-11 whitespace-normal" disabled={busy || !bundleAllowed} onClick={() => void grantBundle()}>{copy(busy ? 'Saving permissions…' : 'Allow required sharing')}</Button></> : needs.length > 0 && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-950">{copy("All required sharing permissions are ready. You can review final submission approval below.")}</p>}
    </div>
    <details className="space-y-4 rounded-xl border border-border bg-card p-4">
    <summary className="cursor-pointer text-sm font-semibold text-foreground select-none">{copy("Manage individual permissions and optional services")}</summary>
    <div className="space-y-3 pt-2">
    {rows.map(r => <article className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm" key={r.consent_id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{OPTIONS.find(o => o.recipient === r.recipient)?.label || r.recipient} · <span className={r.status === 'granted' ? 'text-primary' : 'text-muted-foreground'}>{r.status}</span></p>
      </div>
      <p className="text-xs text-muted-foreground">{r.data_scopes.map(s=>SCOPE_LABELS[s] || s).join(', ')}</p>
      <div className="flex flex-wrap gap-2">
        {r.status === 'granted' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void command(() => dastakApi.withdrawConsent(r.consent_id))}>Withdraw {OPTIONS.find(o => o.recipient === r.recipient)?.label || r.recipient}</Button>}
        {r.recipient.startsWith('user:') && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void command(() => dastakApi.revokeHelper(complaintId,r.recipient.slice(5)))}>Revoke helper access</Button>}
      </div>
    </article>)}
    <label className="block space-y-1.5 text-sm font-medium text-foreground">
      <span>{copy("Recipient and purpose")}</span>
      <select aria-label="Consent recipient" className="dastak-select h-10 w-full rounded-lg border border-input bg-background ps-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={selected} onChange={e => {setSelected(e.target.value); setScopes(OPTIONS.find(o => o.recipient === e.target.value)!.scopes);}}>
        {OPTIONS.map(o => <option key={o.recipient} value={o.recipient}>{o.label}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-2.5">{option.scopes.map(s => <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-1.5 text-sm transition-colors hover:border-primary/40" key={s}><input type="checkbox" className="accent-primary" checked={scopes.includes(s)} onChange={e => setScopes(prev => e.target.checked ? [...prev,s] : prev.filter(v => v !== s))} /><span>{SCOPE_LABELS[s] || s}</span></label>)}</div>
    <Button type="button" disabled={busy || !scopes.length} onClick={() => void command(async () => {
      if(option.recipient.startsWith('user:')) await dastakApi.grantHelper(complaintId,option.recipient.slice(5));
      const existing=rows.find(r=>r.recipient===option.recipient && r.purpose===option.purpose && r.status==='granted');
      return existing ? dastakApi.changeConsent(existing.consent_id,{data_scopes:scopes}) : dastakApi.grantConsent(complaintId,{recipient:option.recipient,purpose:option.purpose,data_scopes:scopes});
    })}>{busy ? 'Saving consent…' : option.recipient.startsWith('user:') ? 'Grant helper access and selected consent' : 'Grant selected consent'}</Button>
    </div>
    </details>
  </section>;
}

