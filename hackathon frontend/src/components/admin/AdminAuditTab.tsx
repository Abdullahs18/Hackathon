import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { dastakApi } from '@/lib/apiClient';
import type { AgentRunSummary, AuditLogRecord } from '@/types/dastak';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export function AdminAuditTab({initialComplaintId}: {initialComplaintId?: string | null}) {
  const { copy } = useWorkflowCopy();
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
  const filteredRuns = runs.filter(r => !filter || r.complaint_id.includes(filter));
  const filteredLogs = logs.filter(l => !filter || l.complaint_id?.includes(filter));
  return <Card className="border-border shadow-xs">
    <CardHeader className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            <span>{copy("Safe audit and agent trace")}</span>
          </CardTitle>
          <CardDescription>
            {copy("Metadata and fixed server explanations. Private transcripts, incident facts and evidence are excluded.")}
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void load()} className="min-h-10 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          <span>{copy("Refresh audit")}</span>
        </Button>
      </div>
      <label className="block max-w-md space-y-1.5 text-sm font-medium text-foreground">
        <span>{copy("Filter by complaint ID")}</span>
        <Input aria-label="Audit complaint filter" dir="ltr" className="min-h-10 font-mono" value={filter} onChange={e => setFilter(e.target.value)} placeholder="e.g., complaint UUID" />
      </label>
    </CardHeader>
    <CardContent className="space-y-6">
      {Boolean(error) && <ErrorBanner error={error} />}
      <div className="space-y-3">
        <h3 className="text-sm font-bold tracking-tight text-foreground">{copy("Agent progress")} ({filteredRuns.length})</h3>
        {filteredRuns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">{copy("No agent runs recorded yet.")}</p>
        ) : (
          <div className="grid gap-3">
            {filteredRuns.map(r => <article key={r.agent_run_id} className="space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p dir="ltr" className="font-mono text-xs font-bold text-primary">{r.complaint_id}</p>
                <Badge variant="outline" className="text-xs">{r.current_status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Next: <strong className="text-foreground">{r.next_step}</strong> · Confirmed simulated filing: <strong className="text-foreground">{r.submitted ? 'Yes' : 'No'}</strong></p>
              <p className="text-xs text-muted-foreground">Destination: <span className="font-mono text-foreground">{r.destination_workspace_id || 'Unassigned'}</span> · Rule version: <span className="font-mono text-foreground">{r.rule_version_id || 'None'}</span></p>
              {r.tools.length > 0 && <ul className="flex flex-wrap gap-1.5 pt-1">{r.tools.map(t => <li key={t.call_id} className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[11px]">{t.tool}: {t.result_status}</li>)}</ul>}
              {r.outcomes.length > 0 && <ul className="space-y-1 pt-1 text-xs text-muted-foreground">{r.outcomes.map(o => <li key={o.code}>• {o.explanation}</li>)}</ul>}
            </article>)}
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-bold tracking-tight text-foreground">{copy("Recorded events")} ({filteredLogs.length})</h3>
        {filteredLogs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">{copy("No audit events match this filter.")}</p>
        ) : (
          <div className="grid gap-2.5">
            {filteredLogs.map(l => <article key={l.audit_log_id} className="space-y-1.5 rounded-xl border border-border/80 bg-muted/15 p-3.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className="font-mono text-[11px] font-semibold text-primary">{l.action}</Badge>
                <span dir="ltr" className="font-mono text-[11px] text-muted-foreground">{l.timestamp}</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground">{l.result}</p>
              <p dir="ltr" className="font-mono text-[11px] text-muted-foreground">{l.complaint_id || 'Account event'}</p>
            </article>)}
          </div>
        )}
      </div>
    </CardContent>
  </Card>;
}

