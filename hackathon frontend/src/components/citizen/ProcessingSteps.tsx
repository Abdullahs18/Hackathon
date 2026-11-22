import { useEffect, useState } from 'react';
import { Circle, Loader2 } from 'lucide-react';

export interface ProcessingStep {en:string;ur:string}
export const ANALYZE_STEPS:ProcessingStep[] = [
  {en:'Saving your report',ur:'آپ کی رپورٹ محفوظ کرنا'},
  {en:'Understanding the incident',ur:'واقعے کو سمجھنا'},
  {en:'Checking for contradictions',ur:'تفصیلات کی جانچ'},
  {en:'Finding the right office',ur:'متعلقہ فرضی دفتر کی تلاش'},
];
export const SUBMIT_STEPS:ProcessingStep[] = [
  {en:'Checking your consent',ur:'آپ کی رضامندی کی جانچ'},
  {en:'Preparing the complaint',ur:'شکایت تیار کرنا'},
  {en:'Sending to simulated office',ur:'فرضی دفتر کو بھیجنا'},
  {en:'Saving confirmation',ur:'تصدیق محفوظ کرنا'},
];

/** Pending work is indeterminate; only saved backend responses establish completion. */
export function ProcessingSteps({active,steps,title}: {active:boolean;steps:ProcessingStep[];title:string;intervalMs?:number}) {
  const [slow,setSlow]=useState(false);
  useEffect(()=>{
    if(!active)return;
    const reset=window.setTimeout(()=>setSlow(false),0);
    const timer=window.setTimeout(()=>setSlow(true),8000);
    return()=>{window.clearTimeout(reset);window.clearTimeout(timer);};
  },[active]);
  if(!active)return null;
  return <div role="status" aria-live="polite" className="space-y-3 rounded-xl border border-primary/30 bg-emerald-50/60 p-4">
    <p className="flex items-center gap-2 font-semibold"><Loader2 className="h-4 w-4 animate-spin" aria-hidden/>{title}</p>
    <p className="text-sm">Waiting for the saved backend result. The checks below are pending until it returns.</p>
    <ul className="space-y-1 text-sm">{steps.map(step=><li key={step.en} className="flex justify-between gap-3"><span className="flex gap-2"><Circle className="h-4 w-4" aria-hidden/>{step.en}</span><span dir="rtl" lang="ur" className="font-urdu">{step.ur}</span></li>)}</ul>
    {slow&&<p className="text-sm">This can take a moment. If the connection drops, recover the saved case before retrying.</p>}
  </div>;
}
