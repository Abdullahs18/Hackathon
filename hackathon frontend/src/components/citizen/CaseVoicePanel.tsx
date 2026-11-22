import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { UrduVoiceRecorder } from './UrduVoiceRecorder';
import { UrduAudioPlayer } from './UrduAudioPlayer';
import { dastakApi, generateIdempotencyKey } from '@/lib/apiClient';
import { ensureProviderConsent } from '@/lib/providerConsent';
import type { ComplaintRecord, IncidentPatch, VoiceInput } from '@/types/dastak';

interface Props {
  complaint: ComplaintRecord | null;
  ensureComplaint: () => Promise<string | null>;
  onConfirmed: (record: ComplaintRecord) => void;
}

const FIELD_LABELS: Record<string,string> = {
  incident_type:'Incident type',incident_date:'Incident date',description:'What happened',scam_message:'Scam message',
  platform:'Contact channel',money_lost:'Was money lost?',amount:'Amount',currency:'Currency',payment_method:'Payment method',
  transaction_reference:'Transaction reference',suspect_details:'Suspect contacts or links',
};

export function CaseVoicePanel({complaint, ensureComplaint, onConfirmed}: Props) {
  const {copy} = useWorkflowCopy();
  const [allowed, setAllowed] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [turn, setTurn] = useState<VoiceInput | null>(null);
  const [patchText, setPatchText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [transcript, setTranscript] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const uploadKey = useRef(generateIdempotencyKey());
  const mounted = useRef(true);

  function showTurn(next: VoiceInput | null) {
    setTurn(next);
    setConfirmed(false);
    setTranscript(next?.confirmed_transcript || next?.transcript || '');
    const facts = {...next?.extraction?.incident_data};
    delete facts.evidence_ids;
    delete facts.citizen_confirmed_corrections;
    // Unknown proposal values do not erase previously saved information.
    const proposed = Object.fromEntries(Object.entries(facts).filter(([,v]) => v !== null && v !== undefined));
    setPatchText(JSON.stringify(proposed));
    setSelected(Object.keys(proposed));
  }

  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (complaint?.complaint_id) {
      void dastakApi.listVoiceInputs(complaint.complaint_id).then(rows => {
        if (active) showTurn(rows.find(r => r.input_version === complaint.version && r.status !== 'APPLIED') || null);
      }).catch(cause => { if (active) setError(cause); });
    }
    return () => { active = false; mounted.current = false; };
  }, [complaint?.complaint_id, complaint?.version]);

  async function recover() {
    if (!complaint) return;
    setError(null);
    setBusy(true);
    try {
      const rows = await dastakApi.listVoiceInputs(complaint.complaint_id);
      showTurn(rows.find(r => r.input_version === complaint.version && r.status !== 'APPLIED') || null);
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  async function process(resume = false) {
    if (!allowed || busy || (!resume && !blob)) return;
    setBusy(true);
    setError(null);
    try {
      const id = resume ? complaint?.complaint_id : await ensureComplaint();
      if (!id) throw new Error('Save this complaint before processing a recording.');
      const current = await dastakApi.getComplaint(id);
      await ensureProviderConsent(id, false);
      const next = resume && turn
        ? await dastakApi.retryVoiceInput(id, turn, current.version)
        : await dastakApi.createVoiceInput(id, blob!, current.version, uploadKey.current);
      if (mounted.current) showTurn(next);
    } catch (cause) { if (mounted.current) setError(cause); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function apply() {
    if (!confirmed || !turn || !complaint || busy) return;
    setBusy(true);
    setError(null);
    try {
      const patch = Object.fromEntries(Object.entries(JSON.parse(patchText)).filter(([field])=>selected.includes(field))) as IncidentPatch;
      if (!patch || Array.isArray(patch) || typeof patch !== 'object' || !Object.keys(patch).length) throw new Error('Review at least one incident field.');
      if ('evidence_ids' in patch || 'citizen_confirmed_corrections' in patch) throw new Error('Voice facts cannot attach evidence or replace correction history.');
      const record = await dastakApi.confirmVoiceInput(complaint.complaint_id, turn, patch, transcript);
      showTurn({...turn, status:'APPLIED'});
      setBlob(null);
      onConfirmed(record);
    } catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }

  function recordingReady(next: Blob) {
    setError(null);
    if (!next.size || next.size > 5 * 1024 * 1024) { setError(new Error('Use nonempty audio up to 5 MiB and 60 seconds.')); return; }
    uploadKey.current = generateIdempotencyKey();
    setBlob(next);
    showTurn(null);
  }

  return <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4" aria-label="Saved complaint voice input">
    <h3 className="text-sm font-semibold text-foreground">{copy("Urdu voice input")}</h3>
    <UrduVoiceRecorder onTranscriptCaptured={() => {}} onRecordingReady={recordingReady} disabled={busy} />
    <label className="block space-y-1.5 text-sm font-medium text-foreground">
      <span>{copy("Or choose an audio recording (5 MiB, 60 seconds)")}</span>
      <input aria-label="Upload Urdu recording" type="file" accept="audio/*,.ogg,.webm,.m4a" disabled={busy} className="block w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-xs text-muted-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20" onChange={e => { const file=e.target.files?.[0]; if(file) recordingReady(file); }} />
    </label>
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-card p-3 text-sm leading-relaxed"><input className="mt-1 shrink-0 accent-primary" type="checkbox" checked={allowed} onChange={e => setAllowed(e.target.checked)} />
      <span>{copy("I consent to send this recording and transcript to Gemini for this complaint. No filing is authorized.")}</span>
    </label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={!allowed || !blob || busy} onClick={() => void process()}>{copy("Transcribe recording")}</Button>
      {complaint && <Button type="button" variant="outline" disabled={busy} onClick={() => void recover()}>{copy("Recover saved voice progress")}</Button>}
    </div>
    {busy && <p role="status">Processing saved voice work…</p>}
    {Boolean(error) && <ErrorBanner error={error} />}
    {turn && <div className="space-y-3">
      <p role="status">{{PROCESSING:'Processing your recording…',READY:'Your transcript and proposed facts are ready for review.',FAILED:'Voice processing paused.',STALE:'The complaint changed; make a new recording for the current version.',APPLIED:'Reviewed voice facts saved.'}[turn.status]}</p>
      {turn.error_code && <p>Recover saved progress before starting another recording. A saved transcript can be reused.</p>}
      {turn.transcript && <label className="block text-sm">{copy("Review transcript")}
        <Textarea aria-label="Review transcript" dir="auto" value={transcript} onChange={e => setTranscript(e.target.value)} disabled={turn.status !== 'READY'} />
      </label>}
      {turn.status === 'READY' && <p className="text-sm">If you edit the transcript, the corrected text becomes a citizen correction included when you share incident details. An unchanged transcript stays in your private voice history.</p>}
      {turn.status !== 'READY' && turn.status !== 'APPLIED' && turn.transcript && turn.next_step === 'extract' && <Button type="button" disabled={!allowed || busy} onClick={() => void process(true)}>{copy("Retry saved extraction")}</Button>}
      {turn.status === 'READY' && <>
        {complaint && <UrduAudioPlayer title={copy("Unconfirmed voice summary")} urduText={turn.extraction?.spoken_summary_ur || ''} complaint={complaint} kind="voice_summary" voiceTurnId={turn.voice_turn_id} />}
        <p className="text-sm">{copy("Review the proposed facts. Uncheck any fact you do not want to change. Unknown details will stay unknown.")}</p>
        <fieldset aria-label="Reviewed voice facts" className="space-y-3">
          {Object.entries(JSON.parse(patchText || '{}')).map(([field,value]) => {
            const label=copy(FIELD_LABELS[field] || field);
            const update=(next:unknown)=>setPatchText(JSON.stringify({...JSON.parse(patchText),[field]:next}));
            return <div className="space-y-1 rounded border p-2" key={field}>
              <label className="flex gap-2 text-sm"><input type="checkbox" aria-label={'Apply '+label} checked={selected.includes(field)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,field]:prev.filter(f=>f!==field))}/>{copy("Use this fact:")} {label}</label>
              <label className="block text-sm" htmlFor={'voice-fact-'+field}>{label}</label>
              {typeof value==='boolean' ? <select id={'voice-fact-'+field} className="rounded border bg-background p-2" value={String(value)} onChange={e=>update(e.target.value==='true')}><option value="true">{copy("Yes")}</option><option value="false">{copy("No")}</option></select>
                : field==='amount' ? <input id={'voice-fact-'+field} type="number" min="0" className="rounded border bg-background p-2" value={value===null?'':String(value)} onChange={e=>update(e.target.value===''?null:Number(e.target.value))}/>
                : <Textarea id={'voice-fact-'+field} dir="auto" value={Array.isArray(value)?value.join('\n'):String(value ?? '')} onChange={e=>update(Array.isArray(value)?e.target.value.split('\n').filter(Boolean):e.target.value)}/>}
            </div>;
          })}
        </fieldset>
        <ul className="text-sm">{turn.extraction?.uncertainties.map((u,i) => <li key={i}>{u}</li>)}</ul>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{copy("I reviewed these fields and want to apply these corrections.")}</label>
        <Button type="button" disabled={!confirmed || !selected.length || busy} onClick={() => void apply()}>{copy("Apply reviewed voice facts")}</Button>
      </>}
    </div>}
  </section>;
}
