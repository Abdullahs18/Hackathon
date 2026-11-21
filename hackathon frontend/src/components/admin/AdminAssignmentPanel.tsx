import { useState } from 'react';
import { dastakApi } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export function AdminAssignmentPanel() {
  const [caseId,setCaseId]=useState('');
  const [officer,setOfficer]=useState('demo-officer-financial');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState<unknown>(null);
  const [busy,setBusy]=useState(false);
  async function assign() {
    setError(null);setNotice('');setBusy(true);
    try {await dastakApi.assignOfficer(caseId.trim(),officer.trim());setNotice('Officer assignment saved. Workspace and citizen consent were checked by the backend.');}
    catch(cause){setError(cause);} finally{setBusy(false);}
  }
  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <h3 className="font-semibold">Assign an officer to a submitted case</h3>
    <p className="text-sm">Assignment requires the pinned destination and current citizen consent. Admins receive no raw case access.</p>
    <label className="block text-sm">Complaint ID<input aria-label="Assignment complaint ID" className="m-2 rounded border bg-background p-2" value={caseId} onChange={e=>setCaseId(e.target.value)} /></label>
    <label className="block text-sm">Officer user ID<input aria-label="Assignment officer ID" className="m-2 rounded border bg-background p-2" value={officer} onChange={e=>setOfficer(e.target.value)} /></label>
    <Button type="button" disabled={!caseId.trim()||!officer.trim()||busy} onClick={()=>void assign()}>Save officer assignment</Button>
    {notice&&<p role="status">{notice}</p>}{Boolean(error)&&<ErrorBanner error={error}/>}
  </section>;
}
