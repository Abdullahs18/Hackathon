import { useCallback, useEffect, useState } from 'react';
import { dastakApi } from '@/lib/apiClient';
import type { AgentRunSummary, AuditLogRecord } from '@/types/dastak';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export function AdminAuditTab({initialComplaintId}: {initialComplaintId?: string | null}) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [filter, setFilter] = useState(initialComplaintId || '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try { const [a,b] = await Promise.all([dastakApi.listAudit(), dastakApi.listAgentRuns()]); setLogs(a); setRuns(b); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <Card><CardHeader><CardTitle>Safe audit and agent trace</CardTitle>
    <p className="text-sm">Metadata and fixed server explanations. Private transcripts, incident facts and evidence are excluded.</p>
    <label className="text-sm">Filter by complaint ID <input aria-label="Audit complaint filter" className="rounded border p-2" value={filter} onChange={e => setFilter(e.target.value)} /></label>
    <Button type="button" disabled={busy} onClick={() => void load()}>Refresh audit</Button>
  </CardHeader><CardContent className="space-y-4">
    {Boolean(error) && <ErrorBanner error={error} />}
    <h3 className="font-semibold">Agent progress</h3>
    {runs.filter(r => !filter || r.complaint_id.includes(filter)).map(r => <article key={r.agent_run_id} className="space-y-2 rounded border p-3 text-sm">
      <p className="font-mono">{r.complaint_id}</p><p>{r.current_status} · Next: {r.next_step} · Confirmed simulated filing: {r.submitted ? 'Yes' : 'No'}</p>
      <p>Destination: {r.destination_workspace_id || 'Unassigned'} · Rule version: {r.rule_version_id || 'None'}</p>
      <ul>{r.tools.map(t => <li key={t.call_id}>{t.tool}: {t.result_status}</li>)}</ul>
      <ul>{r.outcomes.map(o => <li key={o.code}>{o.explanation}</li>)}</ul>
    </article>)}
    <h3 className="font-semibold">Recorded events</h3>
    {logs.filter(l => !filter || l.complaint_id?.includes(filter)).map(l => <article key={l.audit_log_id} className="rounded border p-3 text-sm">
      <p>{l.timestamp} · {l.action}</p><p>{l.result}</p><p className="font-mono">{l.complaint_id || 'Account event'}</p>
    </article>)}
  </CardContent></Card>;
}

