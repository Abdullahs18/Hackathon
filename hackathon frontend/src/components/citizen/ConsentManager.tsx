import { useCallback, useEffect, useState } from 'react';
import { dastakApi } from '@/lib/apiClient';
import type { ConsentRecord } from '@/types/dastak';
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
];

const SCOPE_LABELS:Record<string,string> = {
  case_status:'Case status',incident_data:'Incident details',evidence:'Evidence files',identity_reference:'Synthetic identity reference',
  'incident_data.incident_type':'Incident type','incident_data.transaction_reference':'Transaction reference',
  'incident_data.amount':'Amount','incident_data.currency':'Currency','incident_data.payment_method':'Payment method',
  voice_audio:'Voice recording',voice_transcript:'Voice transcript',spoken_text:'Text to read aloud',
};

export function ConsentManager({complaintId, recommendedRecipient, onConsentsChange}: {complaintId:string; recommendedRecipient?:string|null; onConsentsChange?:(rows:ConsentRecord[])=>void}) {
  const [rows, setRows] = useState<ConsentRecord[]>([]);
  const [selected, setSelected] = useState(recommendedRecipient ? 'workspace:'+recommendedRecipient : OPTIONS[0].recipient);
  const option = OPTIONS.find(o => o.recipient === selected) || OPTIONS[0];
  const [scopes, setScopes] = useState<string[]>(option.scopes);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const current = await dastakApi.listConsents(complaintId);
    setRows(current); onConsentsChange?.(current);
  }, [complaintId, onConsentsChange]);
  useEffect(() => { void load().catch(setError); }, [load]);
  async function command(action:()=>Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); await load(); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4" aria-label="Data sharing consent">
    {Boolean(error) && <ErrorBanner error={error} />}
    <p className="text-sm">Each grant covers one recipient and purpose. Submission also needs the identity and reporting-requirements grants; payment lookup is needed only when you supply a transaction reference. Grants do not authorize filing.</p>
    {rows.map(r => <article className="space-y-2 rounded border p-3 text-sm" key={r.consent_id}>
      <p className="font-semibold">{OPTIONS.find(o => o.recipient === r.recipient)?.label || r.recipient} · {r.status}</p>
      <p>{r.data_scopes.map(s=>SCOPE_LABELS[s] || s).join(', ')}</p>
      {r.status === 'granted' && <Button type="button" variant="outline" disabled={busy} onClick={() => void command(() => dastakApi.withdrawConsent(r.consent_id))}>Withdraw {OPTIONS.find(o => o.recipient === r.recipient)?.label || r.recipient}</Button>}
      {r.recipient.startsWith('user:') && <Button type="button" variant="outline" disabled={busy} onClick={() => void command(() => dastakApi.revokeHelper(complaintId,r.recipient.slice(5)))}>Revoke helper access</Button>}
    </article>)}
    <label className="block text-sm">Recipient and purpose
      <select aria-label="Consent recipient" className="block w-full rounded border bg-background p-2" value={selected} onChange={e => {setSelected(e.target.value); setScopes(OPTIONS.find(o => o.recipient === e.target.value)!.scopes);}}>
        {OPTIONS.map(o => <option key={o.recipient} value={o.recipient}>{o.label}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-3">{option.scopes.map(s => <label className="flex gap-2 text-sm" key={s}><input type="checkbox" checked={scopes.includes(s)} onChange={e => setScopes(prev => e.target.checked ? [...prev,s] : prev.filter(v => v !== s))} />{SCOPE_LABELS[s] || s}</label>)}</div>
    <Button type="button" disabled={busy || !scopes.length} onClick={() => void command(async () => {
      if(option.recipient.startsWith('user:')) await dastakApi.grantHelper(complaintId,option.recipient.slice(5));
      const existing=rows.find(r=>r.recipient===option.recipient && r.purpose===option.purpose && r.status==='granted');
      return existing ? dastakApi.changeConsent(existing.consent_id,{data_scopes:scopes}) : dastakApi.grantConsent(complaintId,{recipient:option.recipient,purpose:option.purpose,data_scopes:scopes});
    })}>{busy ? 'Saving consent…' : option.recipient.startsWith('user:') ? 'Grant helper access and selected consent' : 'Grant selected consent'}</Button>
  </section>;
}

