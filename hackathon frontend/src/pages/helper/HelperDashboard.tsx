import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { dastakApi } from '@/lib/apiClient';
import type { ComplaintRecord } from '@/types/dastak';

export function HelperDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [cases, setCases] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [lookupId, setLookupId] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dastakApi.listHelperComplaints();
      setCases(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = lookupId.trim();
    if (!cleaned) return;
    navigate(`/helper/complaints/${encodeURIComponent(cleaned)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-xs sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Users className="h-6 w-6 text-primary" aria-hidden />
            <span>Community Helper Workspace</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-mono">{user?.user_id}</span>.
            Assist multiple citizens only on cases with an active case-level
            access grant and active citizen consent.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void loadCases()}
          className="min-h-10 gap-1.5"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden
          />
          <span>Refresh Authorized Cases</span>
        </Button>
      </div>

      <Alert className="border-blue-200 bg-blue-50/70 text-blue-950">
        <Info className="h-4 w-4 text-[#1D4ED8]" aria-hidden />
        <AlertTitle className="font-semibold">
          Helper Permission Boundary
        </AlertTitle>
        <AlertDescription className="text-xs">
          Helpers can add supporting information and upload evidence on
          authorized cases. Helpers <strong>cannot</strong> grant or modify
          citizen consent and <strong>cannot</strong> authorize final
          submission on a citizen&apos;s behalf.
        </AlertDescription>
      </Alert>

      {/* Direct Case Access Check (supports live 403 unauthorized test) */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Open Case by ID (Permission Check)
          </CardTitle>
          <CardDescription>
            Enter any complaint ID (for example{' '}
            <code className="font-mono">CMP-2026-004</code>) to verify that
            cases without an active grant return <code className="font-mono">403 Forbidden</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="flex flex-wrap gap-2">
            <Input
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="e.g., CMP-2026-004"
              className="min-h-11 max-w-xs font-mono"
            />
            <Button type="submit" variant="outline" className="min-h-11 gap-1.5">
              <Search className="h-4 w-4" aria-hidden />
              <span>Open Case</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      <ErrorBanner error={error} onRetry={() => void loadCases()} />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Authorized Multi-Citizen Cases ({cases.length})
        </h2>

        {loading && cases.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading authorized cases…</span>
            </CardContent>
          </Card>
        ) : cases.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No authorized cases</CardTitle>
              <CardDescription>
                No citizens currently have an active access grant and consent
                for this helper account.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cases.map((item) => (
              <Card key={item.complaint_id} className="border-border shadow-xs">
                <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        dir="ltr"
                        className="font-mono text-sm font-bold text-primary"
                      >
                        {item.complaint_id}
                      </span>
                      <WorkflowStatusBadge status={item.current_status} />
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-950">
                        Citizen:{' '}
                        <span className="font-mono">{item.citizen_id}</span>
                      </span>
                    </div>

                    <p
                      dir="auto"
                      className="line-clamp-2 text-sm text-foreground"
                    >
                      {item.incident_data.description ||
                        item.complaint_draft?.description ||
                        'Restricted by citizen consent scope'}
                    </p>

                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        Date: {item.incident_data.incident_date || 'Unknown'}
                      </span>
                      {item.incident_data.amount !== undefined && (
                        <span dir="ltr">
                          Amount:{' '}
                          {item.incident_data.amount != null
                            ? `${item.incident_data.amount.toLocaleString()} ${item.incident_data.currency || 'PKR'}`
                            : 'Unknown'}
                        </span>
                      )}
                      <span>
                        Txn Ref:{' '}
                        <span className="font-mono">
                          {item.incident_data.transaction_reference ||
                            'Not provided yet'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <Button asChild size="sm" className="min-h-10 shrink-0 gap-1.5">
                    <Link
                      to={`/helper/complaints/${encodeURIComponent(item.complaint_id)}`}
                    >
                      <span>Assist Case</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
