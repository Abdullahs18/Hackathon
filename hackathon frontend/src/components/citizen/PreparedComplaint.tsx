import { useI18n } from '@/i18n/I18nContext';
import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import type { ComplaintRecord } from '@/types/dastak';
import { Button } from '@/components/ui/button';

export function PreparedComplaint({complaint, dirty=false}:{complaint:ComplaintRecord;dirty?:boolean}) {
  const {lang}=useI18n();const {copy}=useWorkflowCopy();const say=(en:string,ur:string)=>lang==='ur'?ur:en;
  const draft=complaint.complaint_draft;
  if(!draft)return null;
  const labels:Record<string,[string,string]>={incident_type:['Suspected incident type','مشکوک واقعے کی قسم'],description:['Your statement','آپ کی بتائی ہوئی تفصیل'],incident_date:['Incident date','واقعے کی تاریخ'],amount:['Amount','رقم'],currency:['Currency','کرنسی'],payment_method:['Payment method','ادائیگی کا طریقہ'],transaction_reference:['Transaction reference','ٹرانزیکشن کا حوالہ'],suspect_details:['Reported contacts','بتائے گئے رابطے']};
  const fields=Object.entries(labels).map(([field,label])=>{
    const value=draft[field as keyof typeof draft];
    return {field,label:label[lang==='ur'?1:0],value:value==null || value==='' || (Array.isArray(value)&&!value.length) ? say('Unknown / not provided','معلوم نہیں یا نہیں بتایا گیا') : Array.isArray(value)?value.join('\n'):String(value)};
  });
  function download() {
    if(dirty)return;
    const text=[say('DASTAK — SIMULATED COMPLAINT COPY','دستک — فرضی شکایت کی نقل'),say('Not a government filing or proof of fraud.','یہ سرکاری شکایت یا فراڈ ثابت ہونے کا ثبوت نہیں۔'),`${say('Case','شکایت')}: ${complaint.complaint_id}`,`${say('Destination','منزل')}: ${copy(getWorkspaceName(complaint.destination_workspace_id))}`,`${say('Submission reference','جمع ہونے کا حوالہ')}: ${complaint.submission_reference || say('Not submitted','جمع نہیں ہوئی')}`,...fields.map(row=>row.label+': '+row.value),`${say('Evidence attachments','مددگار فائلیں')}: ${draft?.evidence_ids?.length || 0}`].join('\n\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`dastak-simulated-report-${complaint.complaint_id}.txt`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section aria-label="Prepared complaint form" className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{say('Your prepared complaint form','آپ کا تیار شکایت فارم')}</h3><Button type="button" variant="outline" disabled={dirty} onClick={download}>{say('Download prepared copy','تیار نقل ڈاؤن لوڈ کریں')}</Button></div>
    <p className="text-sm leading-relaxed">{say('These are the saved fields prepared for the simulated reporting service. You control corrections and final submission. Unknown details have not been invented.','یہ محفوظ معلومات فرضی دفتر کو بھیجنے کے لیے تیار ہیں۔ درستگی اور جمع کرنے کا آخری فیصلہ آپ کا ہے۔ نامعلوم باتیں بنائی نہیں گئی ہیں۔')}</p>
    {dirty?<p role="status" className="text-sm font-medium">{say('Save and analyze your corrections to refresh this prepared form.','یہ فارم تازہ کرنے کے لیے درست معلومات محفوظ کریں اور دوبارہ جانچ کریں۔')}</p>:<><p className="text-sm"><strong>{say('Destination','منزل')}: </strong>{copy(getWorkspaceName(complaint.destination_workspace_id))}</p><dl className="grid min-w-0 gap-4 sm:grid-cols-2">{fields.map(row=><div key={row.field} className={row.field==='description'?'min-w-0 sm:col-span-2':'min-w-0'}><dt className="text-xs font-medium text-muted-foreground">{row.label}</dt><dd dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{row.value}</dd></div>)}</dl><p className="text-xs text-muted-foreground">{say('Supporting files are citizen-submitted and not authenticity-verified. This is a simulated form.','مددگار فائلیں شہری نے فراہم کی ہیں؛ ان کی اصلیت ثابت نہیں کی گئی۔ یہ فرضی فارم ہے۔')}</p></>}
  </section>;
}
