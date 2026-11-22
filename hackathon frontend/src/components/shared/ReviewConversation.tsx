import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { dastakApi, generateIdempotencyKey, USE_MOCK } from '@/lib/apiClient';
import type { ComplaintRecord, ReviewEvent } from '@/types/dastak';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBanner } from './ErrorBanner';

export function ReviewConversation({complaint, officer=false, onChanged}: {complaint:ComplaintRecord; officer?:boolean; onChanged?:(record:ComplaintRecord)=>void}) {
  const {copy} = useWorkflowCopy();
  const [events,setEvents]=useState<ReviewEvent[]>([]);
  const [message,setMessage]=useState('');
  const [sharing,setSharing]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const [busy,setBusy]=useState(false);
  const command=useRef<{signature:string;key:string}|null>(null);
  const load=useCallback(async()=>{setEvents(await dastakApi.listReviewEvents(complaint.complaint_id,officer));},[complaint.complaint_id,officer]);
  useEffect(()=>{if(!USE_MOCK) void load().catch(setError);},[load,complaint.version]);
  async function reply(){
    if (!sharing) return;
    const signature=JSON.stringify([complaint.complaint_id,complaint.version,message]);
    if(command.current?.signature!==signature)command.current={signature,key:generateIdempotencyKey()};
    setBusy(true);setError(null);
    try{const record=await dastakApi.replyToOfficer(complaint.complaint_id,message,complaint.version,command.current.key);setMessage('');onChanged?.(record);await load();}
    catch(cause){setError(cause);}finally{setBusy(false);}
  }
  if(USE_MOCK)return null;
  return <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Officer review conversation">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">{copy("Officer review conversation")}</h3>
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Outcome: {complaint.review_outcome||'pending'}</span>
    </div>
    {events.map(e=><article key={e.event_id} className="space-y-1 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm"><p className="text-xs font-medium text-muted-foreground">{e.action} · <span className="font-mono">{e.actor_id}</span> · {e.timestamp}</p><p className="text-foreground">{e.message}</p></article>)}
    {!officer&&complaint.review_outcome==='information_requested'&&<>
      <Textarea aria-label="Reply to officer" value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000}/>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm"><input className="mt-1 shrink-0 accent-primary" type="checkbox" checked={sharing} onChange={e=>setSharing(e.target.checked)}/><span>I permit sharing this clarification with the assigned officer.</span></label>
      <Button type="button" disabled={!message.trim()||!sharing||busy} onClick={()=>void reply()}>Send citizen clarification</Button>
    </>}
    {Boolean(error)&&<ErrorBanner error={error}/>}
  </section>;
}
