import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Building2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useWorkflowCopy } from '@/i18n/workflowCopy';
import { dastakApi } from '@/lib/apiClient';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import type { ComplaintRecord } from '@/types/dastak';

export function OfficerDashboard() {
  const { user } = useAuth();
  const { copy } = useWorkflowCopy();
  const navigate = useNavigate();

  const [cases, setCases] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [lookupId, setLookupId] = useState('');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dastakApi.listOfficerComplaints();
      setCases(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = lookupId.trim();
    if (!cleaned) return;
    navigate(`/officer/complaints/${encodeURIComponent(cleaned)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-xs sm:flex-row sm:items-center">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-800" aria-hidden />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {copy(getWorkspaceName(user?.workspace_id))}
            </h1>
            <Badge className="bg-indigo-800 text-white">
              {copy("Simulated Workspace • Tenant Isolated")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Department Officer:{' '}
            <span className="font-mono text-foreground">{user?.user_id}</span>.
            Showing assigned cases strictly scoped to{' '}
            <span className="font-mono">{user?.workspace_id}</span>.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadQueue()}
          className="min-h-10 gap-1.5 bg-card"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden
          />
          <span>{copy("Refresh Queue")}</span>
        </Button>
      </div>

      {/* Cross-workspace isolation verification helper */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            <span>{copy("Direct Case Review & Workspace Isolation Check")}</span>
          </CardTitle>
          <CardDescription>
            Enter a complaint ID (e.g.{' '}
            <code className="font-mono">CMP-2026-004</code> from{' '}
            <em>Mock Digital Safety Intake</em>) to verify backend{' '}
            <code className="font-mono">403 Forbidden</code> tenant isolation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="flex flex-wrap gap-2">
            <Input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="e.g., CMP-2026-004"
              dir="ltr"
              className="min-h-11 max-w-xs font-mono"
            />
            <Button type="submit" variant="outline" className="min-h-11 gap-1.5">
              <Search className="h-4 w-4" aria-hidden />
              <span>{copy("Inspect Case")}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      <ErrorBanner error={error} onRetry={() => void loadQueue()} />

      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-lg">
            {copy("Assigned Workspace Queue")} ({cases.length})
          </CardTitle>
          <CardDescription>
            {copy("Standard chronological queue (no AI priority or confidence sorting). Officers make the final review decision.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && cases.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>{copy("Loading assigned cases…")}</span>
            </div>
          ) : cases.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No cases assigned to this officer inside{' '}
              {getWorkspaceName(user?.workspace_id)}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy("Complaint ID")}</TableHead>
                  <TableHead>{copy("Citizen")}</TableHead>
                  <TableHead>{copy("Incident Type")}</TableHead>
                  <TableHead>{copy("Status")}</TableHead>
                  <TableHead>{copy("Rule Version")}</TableHead>
                  <TableHead className="text-end">{copy("Action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((item) => (
                  <TableRow key={item.complaint_id}>
                    <TableCell className="font-mono font-semibold text-primary">
                      {item.complaint_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.citizen_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.incident_type || item.incident_data.incident_type}
                    </TableCell>
                    <TableCell>
                      <WorkflowStatusBadge status={item.current_status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.rule_version_id || '—'}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button asChild size="sm" className="gap-1.5">
                        <Link
                          to={`/officer/complaints/${encodeURIComponent(item.complaint_id)}`}
                        >
                          <span>{copy("Review")}</span>
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
