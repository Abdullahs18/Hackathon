import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '@/i18n/I18nContext';
import { dastakApi, generateIdempotencyKey, USE_MOCK } from '@/lib/apiClient';
import type { ComplaintRecord, ReviewHelpInbox } from '@/types/dastak';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBanner } from './ErrorBanner';

const FIELDS:Record<string,[string,string]> = {
  incident_type:['Incident type','واقعے کی قسم'], incident_date:['Date','تاریخ'],description:['Description','تفصیل'],
  scam_message:['Scam message','مشکوک پیغام'],platform:['Contact channel','رابطے کا طریقہ'],money_lost:['Whether money was lost','رقم کا نقصان ہوا یا نہیں'],
  amount:['Amount','رقم'],currency:['Currency','کرنسی'],payment_method:['Payment method','ادائیگی کا طریقہ'],
  transaction_reference:['Transaction reference','ٹرانزیکشن کا حوالہ'],suspect_details:['Reported contacts','بتائے گئے رابطے'],case_status:['Case status','شکایت کی حالت'],
};

export function ReviewHelpPanel({complaint, helper=false, onRefreshCase}:{complaint:ComplaintRecord;helper?:boolean;onRefreshCase?:()=>void}) {
  const {lang}=useI18n();const say=(en:string,ur:string)=>lang==='ur'?ur:en;
  const [inbox,setInbox]=useState<ReviewHelpInbox|null>(null);
  const [selected,setSelected]=useState('');const [allowed,setAllowed]=useState(false);
  const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);const [loaded,setLoaded]=useState(false);
  const key=useRef(generateIdempotencyKey());const generation=useRef(0);
  const load=useCallback(async()=>{
    const current=++generation.current;
    try {const data=await dastakApi.getReviewHelp(complaint.complaint_id);if(current===generation.current){setInbox(data);setLoaded(true);}}
    catch(cause){if(current===generation.current){setError(cause);setLoaded(true);}}
  },[complaint.complaint_id]);
  useEffect(()=>{if(USE_MOCK)return;void load();return()=>{generation.current++;};},[load]);
  const latest=inbox?.requests[0];
  useEffect(()=>{
    if(USE_MOCK || !latest || !['requested','acknowledged'].includes(latest.status) || !latest.access_active)return;
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},5000);
    return()=>window.clearInterval(timer);
  },[latest?.request_id,latest?.status,latest?.access_active,load]);
  const recipient=selected || inbox?.helpers[0]?.helper_id || '';
  const pending=latest && ['requested','acknowledged'].includes(latest.status) && latest.access_active && latest.requested_version===complaint.version;
  const canRequest=!helper && ['HUMAN_REVIEW','NEEDS_INFORMATION'].includes(complaint.current_status);
  async function command(action:()=>Promise<unknown>) {
    setBusy(true);setError(null);
    try {await action();setAllowed(false);await load();}
    catch(cause){setError(cause);}finally{setBusy(false);}
  }
  if(USE_MOCK || (loaded && !error && !latest && !canRequest))return null;
  return <section className="min-w-0 space-y-4 rounded-xl border border-primary/30 bg-card p-4" aria-label="Community human review">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{say('Ask a community Helper','کسی مددگار انسان سے مدد لیں')}</h3><Button type="button" variant="outline" disabled={busy} onClick={()=>{setError(null);void load();onRefreshCase?.();}}>{say('Refresh help request','مدد کی درخواست دوبارہ دیکھیں')}</Button></div>
    <p className="text-sm leading-relaxed">{say('A Helper can explain or clarify a stopped report. Only you can confirm corrections, grant permission and authorize filing. This is assistance, not a department decision.','مددگار آپ کی رکی ہوئی شکایت سمجھنے یا معلومات واضح کرنے میں مدد دے سکتا ہے۔ درست معلومات کی تصدیق، اجازت اور شکایت جمع کرنے کا آخری فیصلہ آپ کا ہے۔ یہ مدد ہے، کسی سرکاری دفتر کا فیصلہ نہیں۔')}</p>
    {Boolean(error)&&<ErrorBanner error={error}/>}
    {!loaded&&<p role="status">{say('Loading help requests…','مدد کی درخواستیں دیکھی جا رہی ہیں…')}</p>}
    {latest&&<article className="space-y-2 rounded-lg border p-3 text-sm" aria-label="Latest human review request">
      <p>{say('Helper','مددگار')}: <bdi dir="ltr">{latest.helper_id}</bdi></p>
      <p role="status">{!latest.access_active ? say('Sharing withdrawn or limited. The Helper cannot continue.','اجازت واپس لی گئی ہے یا محدود ہے۔ مددگار آگے کام نہیں کر سکتا۔') : latest.status==='requested' ? say('Request saved. Waiting for the named Helper to acknowledge it.','درخواست محفوظ ہے۔ منتخب مددگار کی قبولیت کا انتظار ہے۔') : latest.status==='acknowledged' ? say('The Helper acknowledged your request and is reviewing it.','مددگار نے درخواست قبول کر لی ہے اور اسے دیکھ رہا ہے۔') : latest.status==='completed' ? say('The Helper sent a response. Review it before correcting or analyzing again.','مددگار کا جواب آ گیا ہے۔ اسے پڑھ کر معلومات درست کریں اور دوبارہ جانچ کریں۔') : say('A newer request replaced this request.','اس کی جگہ نئی درخواست آ چکی ہے۔')}</p>
      <p className="text-xs text-muted-foreground">{say('Requested','درخواست کا وقت')}: {new Date(latest.requested_at).toLocaleString()}</p>
      {latest.acknowledged_at&&<p className="text-xs">{say('Acknowledged','قبولیت کا وقت')}: {new Date(latest.acknowledged_at).toLocaleString()}</p>}
      {latest.note&&<blockquote dir="auto" className="whitespace-pre-wrap break-words border-s-2 border-primary ps-3 leading-relaxed">{latest.note}</blockquote>}
      {helper&&latest.access_active&&latest.status==='requested'&&<Button type="button" disabled={busy} onClick={()=>void command(()=>dastakApi.actReviewHelp(complaint.complaint_id,latest.request_id,complaint.version))}>{say('Acknowledge review request','درخواست قبول کریں')}</Button>}
      {helper&&latest.access_active&&latest.status==='acknowledged'&&<div className="space-y-3"><label className="block space-y-2"><span>{say('Response to the citizen','شہری کے لیے جواب')}</span><Textarea aria-label="Helper review response" dir="auto" maxLength={4000} value={note} onChange={event=>setNote(event.target.value)}/></label><Button type="button" disabled={busy||!note.trim()} onClick={()=>void command(()=>dastakApi.actReviewHelp(complaint.complaint_id,latest.request_id,complaint.version,note))}>{say('Send review response','جواب محفوظ کر کے بھیجیں')}</Button></div>}
    </article>}
    {canRequest&&!pending&&<div className="space-y-3">
      <label className="block space-y-1.5 text-sm font-medium text-foreground"><span className="block">{say('Choose an active Helper','مددگار منتخب کریں')}</span><select aria-label="Human review Helper" className="dastak-select h-10 w-full rounded-lg border border-input bg-background ps-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={recipient} disabled={busy} onChange={event=>{setSelected(event.target.value);setAllowed(false);key.current=generateIdempotencyKey();}}>{inbox?.helpers.map(item=><option key={item.helper_id} value={item.helper_id}>{item.helper_id}</option>)}</select></label>
      <p className="text-sm">{say('This request shares the incident fields below. Private voice, evidence and correction history are excluded. It replaces this Helper’s previous field selection.','اس درخواست میں نیچے درج واقعے کی معلومات بھیجی جائیں گی۔ نجی آواز، فائلیں اور درستگیوں کی تاریخ شامل نہیں۔ اس مددگار کے لیے پہلے منتخب معلومات کی جگہ یہی فہرست لاگو ہوگی۔')}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{inbox?.shared_fields.map(scope=>{const field=scope.replace('incident_data.','');return <li key={scope}>{FIELDS[field]?.[lang==='ur'?1:0] || field}</li>;})}</ul>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 shrink-0" type="checkbox" checked={allowed} onChange={event=>setAllowed(event.target.checked)}/><span>{say('I allow the named Helper to access these listed details for this review.','میں اس مددگار کو اس درخواست کے لیے درج معلومات دیکھنے کی اجازت دیتا/دیتی ہوں۔')}</span></label>
      <Button type="button" disabled={busy||!allowed||!recipient} onClick={()=>void command(async()=>{await dastakApi.requestReviewHelp(complaint.complaint_id,recipient,complaint.version,key.current);key.current=generateIdempotencyKey();window.dispatchEvent(new CustomEvent('dastak:consents-changed',{detail:complaint.complaint_id}));})}>{say('Request human help','مدد کی درخواست بھیجیں')}</Button>
      {loaded&&!inbox?.helpers.length&&<p className="text-sm">{say('No active Helper is available. Keep the draft saved and try again later.','ابھی کوئی مددگار دستیاب نہیں۔ مسودہ محفوظ رکھیں اور بعد میں دوبارہ کوشش کریں۔')}</p>}
    </div>}
    {!helper&&latest&&<Link className="inline-block text-sm text-primary underline" to={`/citizen/complaints/${complaint.complaint_id}#sharing-settings`}>{say('Manage or withdraw Helper permission','مددگار کی اجازت دیکھیں یا واپس لیں')}</Link>}
    {(inbox?.requests.length||0)>1&&<details className="text-sm"><summary>{say('Previous requests','پرانی درخواستیں')}</summary>{inbox?.requests.slice(1).map(row=><p key={row.request_id} className="whitespace-pre-wrap break-words py-2" dir="auto"><bdi>{row.helper_id}</bdi> · {row.status}: {row.note || say('No response saved.','ابھی جواب محفوظ نہیں۔')}</p>)}</details>}
  </section>;
}
