import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Eye,
  FileSearch,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { dastakApi } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import type { AgentRunRecord, AuditLogRecord } from '@/types/dastak';

interface AdminAuditTabProps {
  initialComplaintId?: string | null;
}

export function AdminAuditTab({ initialComplaintId }: AdminAuditTabProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [selectedComplaintId, setSelectedComplaintId] = useState<string>(
    initialComplaintId || '',
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [audits, runs] = await Promise.all([
        dastakApi.listAudit(),
        dastakApi.listAgentRuns(),
      ]);
      setAuditLogs(audits);
      setAgentRuns(runs);
      setSelectedComplaintId((prev) => {
        if (prev) return prev;
        if (initialComplaintId) return initialComplaintId;
        if (runs[0]?.complaint_id) return runs[0].complaint_id;
        const firstAuditCase = audits.find((a) => a.complaint_id)?.complaint_id;
        return firstAuditCase ?? '';
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [initialComplaintId]);

  useEffect(() => {
    void loadAuditData();
  }, [loadAuditData]);

  const complaintIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of agentRuns) {
      ids.add(run.complaint_id);
    }
    for (const log of auditLogs) {
      if (log.complaint_id) ids.add(log.complaint_id);
    }
    return Array.from(ids);
  }, [agentRuns, auditLogs]);

  const selectedRun = useMemo(
    () =>
      agentRuns.find((r) => r.complaint_id === selectedComplaintId) ?? null,
    [agentRuns, selectedComplaintId],
  );

  const selectedCaseEvents = useMemo(
    () =>
      auditLogs.filter((log) => log.complaint_id === selectedComplaintId),
    [auditLogs, selectedComplaintId],
  );

  const consentEvents = useMemo(
    () =>
      selectedCaseEvents.filter((log) =>
        log.action.toLowerCase().includes('consent'),
      ),
    [selectedCaseEvents],
  );

  const agentToolEvents = useMemo(
    () =>
      selectedCaseEvents.filter(
        (log) =>
          log.agent_run_id !== null ||
          log.action.toLowerCase().includes('agent_tool'),
      ),
    [selectedCaseEvents],
  );

  const filteredStream = useMemo(() => {
    return auditLogs.filter((log) => {
      if (categoryFilter !== 'all') {
        const act = log.action.toLowerCase();
        if (categoryFilter === 'ai' && !act.includes('ai_') && !act.includes('human_review')) {
          return false;
        }
        if (categoryFilter === 'routing' && !act.includes('routing')) {
          return false;
        }
        if (categoryFilter === 'consent' && !act.includes('consent')) {
          return false;
        }
        if (categoryFilter === 'agent' && !act.includes('agent')) {
          return false;
        }
        if (categoryFilter === 'officer' && !act.includes('officer')) {
          return false;
        }
      }
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hay = `${log.complaint_id ?? ''} ${log.user_id ?? ''} ${log.action} ${log.result ?? ''} ${log.rule_version_id ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, categoryFilter, searchTerm]);

  return (
    <div className="space-y-5">
      <Alert className="border-slate-300 bg-slate-100 text-slate-900">
        <Lock className="h-4 w-4 text-slate-700" aria-hidden />
        <AlertTitle className="font-semibold">
          Read-Only Audit & Explainability Trace (Replaces Separate Auditor
          Account)
        </AlertTitle>
        <AlertDescription className="text-xs">
          Append-only inspection of user actions, AI classification, confidence,
          pinned rule version, consent history, agent tool calls, and simulated
          submission results. No edits or silent consent bypasses exist here.
        </AlertDescription>
      </Alert>

      <ErrorBanner error={error} onRetry={() => void loadAuditData()} />

      {/* COMPLAINT DECISION TRACE INSPECTOR */}
      <Card className="border-border shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSearch className="h-4 w-4 text-primary" aria-hidden />
              <span>Complaint Decision Trace Inspector</span>
            </CardTitle>
            <CardDescription>
              Select any complaint to inspect its complete AI, rule-version,
              consent, agent-tool, and submission trace.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedComplaintId}
              onValueChange={setSelectedComplaintId}
            >
              <SelectTrigger className="min-w-48 font-mono text-xs">
                <SelectValue placeholder="Select complaint ID" />
              </SelectTrigger>
              <SelectContent>
                {complaintIds.map((cid) => (
                  <SelectItem key={cid} value={cid} className="font-mono text-xs">
                    {cid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadAuditData()}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              <span>Refresh</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!selectedComplaintId ? (
            <p className="text-sm text-muted-foreground">
              Select a complaint ID above to inspect its decision trace.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* 1. INPUT & AI OUTPUT */}
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-foreground">
                    1. Input & AI Classification Output
                  </h3>
                  {selectedRun && (
                    <WorkflowStatusBadge status={selectedRun.current_status} />
                  )}
                </div>

                {selectedRun ? (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <span className="font-semibold text-muted-foreground">
                        Safe Input Summary (Language: {selectedRun.language}):
                      </span>
                      <p
                        dir="auto"
                        className="mt-1 rounded border bg-white p-2.5 text-foreground"
                      >
                        {selectedRun.transcript ||
                          selectedRun.incident_data.description ||
                          '—'}
                      </p>
                    </div>

                    {selectedRun.classification && (
                      <div className="space-y-1.5 rounded border bg-white p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Type:{' '}
                            <code className="font-mono font-semibold">
                              {selectedRun.classification.incident_type}
                            </code>
                          </span>
                          <span>
                            Confidence:{' '}
                            <strong className="font-mono">
                              {Math.round(
                                selectedRun.classification.confidence * 100,
                              )}
                              %
                            </strong>{' '}
                            • Readiness:{' '}
                            <strong className="font-mono">
                              {selectedRun.readiness_score?.toFixed(2) ?? '—'}
                            </strong>
                          </span>
                        </div>
                        <p className="text-muted-foreground">
                          {selectedRun.classification.explanation}
                        </p>
                        {selectedRun.contradiction_flags.length > 0 && (
                          <p className="font-medium text-[#9A3412]">
                            Contradictions:{' '}
                            {selectedRun.contradiction_flags.join(' | ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No LangGraph agent run recorded yet for {selectedComplaintId}
                    . See chronological audit events below.
                  </p>
                )}
              </div>

              {/* 2. ROUTING VERSION, CONSENT & SUBMISSION */}
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <h3 className="text-sm font-bold text-foreground">
                  2. Rule Version, Route, Consent & Submission Result
                </h3>

                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded border bg-white p-2.5">
                    <span className="text-muted-foreground">
                      Pinned Rule Version
                    </span>
                    <p
                      dir="ltr"
                      className="mt-0.5 font-mono font-bold text-primary"
                    >
                      {selectedRun?.rule_version_id ||
                        selectedCaseEvents.find((e) => e.rule_version_id)
                          ?.rule_version_id ||
                        'None matched'}
                    </p>
                  </div>
                  <div className="rounded border bg-white p-2.5">
                    <span className="text-muted-foreground">
                      Selected Destination
                    </span>
                    <p className="mt-0.5 font-semibold">
                      {selectedRun?.destination_workspace_id
                        ? `${getWorkspaceName(selectedRun.destination_workspace_id)} (Simulated)`
                        : 'Not routed / Human Review'}
                    </p>
                  </div>
                  <div className="rounded border bg-white p-2.5">
                    <span className="text-muted-foreground">
                      Consent & Citizen Authorization
                    </span>
                    <p className="mt-0.5 font-medium">
                      Consent:{' '}
                      {selectedRun?.consent_granted ? 'Granted' : 'Not granted'}{' '}
                      • Authorized:{' '}
                      {selectedRun?.citizen_authorized ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="rounded border bg-white p-2.5">
                    <span className="text-muted-foreground">
                      Submission Reference
                    </span>
                    <p dir="ltr" className="mt-0.5 font-mono font-bold">
                      {selectedRun?.submission_reference || 'Not submitted'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                    <span>Consent Events ({consentEvents.length})</span>
                  </p>
                  {consentEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No consent changes recorded on this case.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {consentEvents.map((ev) => (
                        <li
                          key={ev.audit_log_id}
                          className="rounded border bg-white px-2.5 py-1.5"
                        >
                          <span className="font-mono font-semibold">
                            {ev.action}
                          </span>
                          : {ev.result} ({formatShortTime(ev.timestamp)})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* 3. AGENT ACTIONS & TOOL CALLS */}
              <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4 lg:col-span-2">
                <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <Bot className="h-4 w-4 text-primary" aria-hidden />
                  <span>
                    3. Constrained Agent Tool Calls & Case Audit Sequence (
                    {agentToolEvents.length} agent/tool events,{' '}
                    {selectedCaseEvents.length} total events)
                  </span>
                </p>
                {selectedCaseEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No audit trace entries for this complaint.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedCaseEvents.map((ev) => (
                      <div
                        key={ev.audit_log_id}
                        className="flex flex-col justify-between gap-1 rounded-md border bg-white px-3 py-2 text-xs sm:flex-row sm:items-center"
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {ev.action}
                            </Badge>
                            {ev.rule_version_id && (
                              <span className="font-mono text-[11px] text-primary">
                                {ev.rule_version_id}
                              </span>
                            )}
                            {ev.agent_run_id && (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                run:{ev.agent_run_id}
                              </span>
                            )}
                          </div>
                          <p className="text-foreground">{ev.result || '—'}</p>
                          {ev.input && (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              input: {ev.input}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatShortTime(ev.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* APPEND-ONLY AUDIT STREAM */}
      <Card className="border-border shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-primary" aria-hidden />
              <span>Append-Only Audit Event Stream ({filteredStream.length})</span>
            </CardTitle>
            <CardDescription>
              Read-only log of user, AI, routing, consent, officer, and agent
              operations.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter ID, action, rule…"
              className="h-9 w-48 text-xs"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="ai">AI & Human Review</SelectItem>
                <SelectItem value="routing">Routing Rules</SelectItem>
                <SelectItem value="consent">Consent</SelectItem>
                <SelectItem value="agent">Agent Tool Calls</SelectItem>
                <SelectItem value="officer">Officer Decisions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Complaint</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Rule Version</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStream.map((ev) => (
                <TableRow key={ev.audit_log_id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatShortTime(ev.timestamp)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {ev.complaint_id ? (
                      <button
                        type="button"
                        onClick={() => setSelectedComplaintId(ev.complaint_id!)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {ev.complaint_id}
                      </button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {ev.user_id || 'System'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {ev.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-primary">
                    {ev.rule_version_id || '—'}
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-foreground">
                    {ev.result || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
