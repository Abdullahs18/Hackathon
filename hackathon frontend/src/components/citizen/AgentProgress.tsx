import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { dastakApi, USE_MOCK } from '@/lib/apiClient';
import type { CitizenAgentProgress } from '@/types/dastak';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

const STEPS=[['identity','Check synthetic identity','فرضی شناخت کی جانچ'],['payment','Check supplied payment reference','دیے گئے ٹرانزیکشن حوالہ کی جانچ'],['requirements','Check required reporting details','شکایت کی ضروری معلومات کی جانچ'],['submit','Send the approved complaint','اجازت دیا گیا فارم بھیجنا'],['verify','Verify the saved receipt','محفوظ رسید کی تصدیق']] as const;

export function AgentProgress({complaintId, active=false}:{complaintId:string;active?:boolean}) {
  const {lang}=useI18n();const say=(en:string,ur:string)=>lang==='ur'?ur:en;
  const [data,setData]=useState<CitizenAgentProgress|null>(null);const [error,setError]=useState<unknown>(null);
  const generation=useRef(0);
  const load=useCallback(async()=>{
    const current=++generation.current;
    try {const result=await dastakApi.getAgentProgress(complaintId);if(current===generation.current){setData(result);setError(null);}}
    catch(cause){if(current===generation.current)setError(cause);}
  },[complaintId]);
  useEffect(()=>{
    if(USE_MOCK)return;
    void load();const timer=active?window.setInterval(()=>void load(),1500):undefined;
    return()=>{generation.current++;window.clearInterval(timer);};
  },[load,active]);
  if(USE_MOCK)return null;
  const run=data?.runs[0];
  return <section aria-label="Saved agent activity" className="min-w-0 space-y-4 rounded-xl border border-primary/30 bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{say('Your filing assistant’s recorded work','شکایت بھیجنے والے مددگار کا محفوظ کام')}</h3><Button type="button" variant="outline" onClick={()=>void load()}>{say('Refresh agent progress','مددگار کی پیش رفت دوبارہ دیکھیں')}</Button></div>
    <p className="text-sm leading-relaxed">{say('Each result below comes from a saved backend checkpoint. The assistant uses only your approved complaint; it cannot grant permission or make the officer’s decision.','نیچے ہر نتیجہ نظام میں محفوظ کام سے لیا گیا ہے۔ مددگار صرف آپ کا اجازت دیا گیا فارم استعمال کرتا ہے؛ خود اجازت نہیں دے سکتا اور افسر کا فیصلہ نہیں کر سکتا۔')}</p>
    {!run&&<p role="status" className="text-sm">{say('No execution checkpoint is recorded yet. Review and authorize the saved form to start.','ابھی کام کی کوئی محفوظ پیش رفت موجود نہیں۔ پہلے فارم دیکھیں اور اسے جمع کرنے کی اجازت دیں۔')}</p>}
    <ol className="space-y-3">{STEPS.map(([step,en,ur])=>{
      const saved=run?.steps.find(item=>item.step===step);
      const label=saved?.status==='completed'?say('Completed','مکمل'):saved?.status==='skipped'?say('Skipped — reference unknown','حوالہ معلوم نہیں؛ یہ جانچ چھوڑ دی گئی'):saved?.status==='blocked'?say('Stopped — clarification or human help needed','رک گیا؛ وضاحت یا انسانی مدد درکار ہے'):say('Not recorded yet','ابھی محفوظ نہیں ہوا');
      return <li key={step} className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm" data-agent-step={step} data-status={saved?.status || 'pending'}><span className="font-medium">{lang==='ur'?ur:en}</span><span className="min-w-0 text-end"><span className="block">{label}</span>{saved&&<time className="text-xs text-muted-foreground" dateTime={saved.timestamp}>{new Date(saved.timestamp).toLocaleTimeString()}</time>}</span></li>;
    })}</ol>
    {run?.submission_reference&&run.steps.some(step=>step.step==='verify'&&step.status==='completed')&&<p className="break-words rounded-lg border border-primary/30 p-3 text-sm"><strong>{say('Confirmed simulated reference','تصدیق شدہ فرضی حوالہ')}: </strong><bdi dir="ltr">{run.submission_reference}</bdi></p>}
    {run&&<details className="text-xs"><summary>{say('Execution details','کام کی مزید تفصیل')}</summary><p className="mt-2 break-all">{say('Run','کام')}: <bdi dir="ltr">{run.agent_run_id}</bdi></p><p>{say('Next step','اگلا قدم')}: {run.next_step}</p></details>}
    {Boolean(error)&&<ErrorBanner error={error}/>}
  </section>;
}
