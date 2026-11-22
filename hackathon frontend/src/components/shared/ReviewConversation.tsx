import { useCallback, useEffect, useRef, useState } from 'react';
import { dastakApi, generateIdempotencyKey, USE_MOCK } from '@/lib/apiClient';
import type { ComplaintRecord, ReviewEvent } from '@/types/dastak';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBanner } from './ErrorBanner';

export function ReviewConversation({complaint, officer=false, onChanged}: {complaint:ComplaintRecord; officer?:boolean; onChanged?:(record:ComplaintRecord)=>void}) {
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
  return <section className="space-y-3 rounded-xl border p-4" aria-label="Officer review conversation">
    <h3 className="font-semibold">Officer review conversation</h3>
    <p>Outcome: {complaint.review_outcome||'pending'}</p>
    {events.map(e=><article key={e.event_id} className="rounded border p-2 text-sm"><p>{e.action} · {e.actor_id} · {e.timestamp}</p><p>{e.message}</p></article>)}
    {!officer&&complaint.review_outcome==='information_requested'&&<>
      <Textarea aria-label="Reply to officer" value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000}/>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={sharing} onChange={e=>setSharing(e.target.checked)}/>I permit sharing this clarification with the assigned officer.</label>
      <Button type="button" disabled={!message.trim()||!sharing||busy} onClick={()=>void reply()}>Send citizen clarification</Button>
    </>}
    {Boolean(error)&&<ErrorBanner error={error}/>}
  </section>;
}
