import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
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
import { ConsentManager } from '@/components/citizen/ConsentManager';
import { EvidenceUploader } from '@/components/citizen/EvidenceUploader';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { dastakApi } from '@/lib/apiClient';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import type { ComplaintRecord, EvidenceRecord } from '@/types/dastak';

export function CitizenComplaintDetail() {
  const { id } = useParams();
  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadComplaint = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await dastakApi.getComplaint(id);
      setComplaint(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadComplaint();
  }, [loadComplaint]);

  const handleEvidenceUploaded = (ev: EvidenceRecord) => {
    setComplaint((prev) =>
      prev
        ? {
            ...prev,
            incident_data: {
              ...prev.incident_data,
              evidence_ids: [
                ...(prev.incident_data.evidence_ids ?? []),
                ev.evidence_id,
              ],
            },
          }
        : prev,
    );
  };

  if (loading && !complaint) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Loading complaint details…</span>
        </CardContent>
      </Card>
    );
  }

  const timelineStages = [
    { key: 'DRAFT', label: 'Draft Captured' },
    { key: 'ANALYSIS', label: 'AI Analysis & Routing' },
    { key: 'CITIZEN_REVIEW', label: 'Review & Consent' },
    { key: 'SUBMITTED', label: 'Submitted (Simulated)' },
    { key: 'OFFICER_REVIEW', label: 'Officer Review' },
    { key: 'RESOLVED', label: 'Resolved' },
  ];

  const getStageIndex = (status: ComplaintRecord['current_status']) => {
    switch (status) {
      case 'DRAFT':
      case 'COLLECT_INFORMATION':
        return 0;
      case 'VOICE_TRANSCRIPTION':
      case 'STRUCTURED_EXTRACTION':
      case 'CLASSIFICATION':
      case 'VALIDATION':
      case 'NEEDS_INFORMATION':
      case 'HUMAN_REVIEW':
      case 'ROUTING_RULE_EVALUATION':
      case 'COMPLAINT_GENERATION':
        return 1;
      case 'CITIZEN_REVIEW':
      case 'CONSENT_AND_AUTHORIZATION':
        return 2;
      case 'AGENT_EXECUTION':
      case 'MOCK_SERVICE_CALLS':
      case 'SUBMISSION_VERIFICATION':
      case 'SUBMITTED':
        return 3;
      case 'OFFICER_REVIEW':
        return 4;
      case 'RESOLVED':
        return 5;
    }
  };

  const activeIdx = complaint ? getStageIndex(complaint.current_status) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="min-h-10 gap-1.5">
            <Link to="/citizen">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>Dashboard</span>
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 dir="ltr" className="font-mono text-xl font-bold text-primary">
                {id}
              </h1>
              {complaint && (
                <WorkflowStatusBadge status={complaint.current_status} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Track progress, view attachments, and grant or withdraw consent.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadComplaint()}
            className="min-h-10 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span>Refresh</span>
          </Button>
          {complaint &&
            complaint.current_status !== 'SUBMITTED' &&
            complaint.current_status !== 'OFFICER_REVIEW' &&
            complaint.current_status !== 'RESOLVED' && (
              <Button asChild size="sm" className="min-h-10">
                <Link
                  to={`/citizen/complaints/${encodeURIComponent(complaint.complaint_id)}/wizard`}
                >
                  Open Guided Wizard
                </Link>
              </Button>
            )}
        </div>
      </div>

      <ErrorBanner error={error} onRetry={() => void loadComplaint()} />

      {complaint && (
        <>
          {/* STATUS TIMELINE */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Case Progress Timeline</CardTitle>
              <CardDescription>
                {complaint.destination_workspace_id ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    <span>
                      Routed to{' '}
                      <strong>
                        {getWorkspaceName(complaint.destination_workspace_id)}
                      </strong>{' '}
                      (Simulated Service) • Rule:{' '}
                      <span dir="ltr" className="font-mono">
                        {complaint.rule_version_id}
                      </span>
                    </span>
                  </span>
                ) : (
                  'Routing rule will be evaluated when AI analysis completes.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 sm:grid-cols-6">
                {timelineStages.map((stage, idx) => {
                  const done = idx <= activeIdx;
                  return (
                    <li
                      key={stage.key}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium ${
                        done
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                          : 'border-border bg-muted/30 text-muted-foreground'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-primary"
                          aria-hidden
                        />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span>{stage.label}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {/* INCIDENT & DRAFT RECORD */}
          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">
                Incident & Formal Complaint Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Citizen Narrative / Formal Summary
                </p>
                <p
                  dir="auto"
                  className="mt-1 rounded-lg border border-border bg-muted/30 p-3 text-foreground"
                >
                  {complaint.complaint_draft?.description ||
                    complaint.incident_data.description ||
                    '—'}
                </p>
              </div>

              {complaint.incident_data.scam_message && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reported Scam Message
                  </p>
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50/70 p-3 font-mono text-xs text-amber-950">
                    {complaint.incident_data.scam_message}
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <p className="mt-0.5 font-medium">
                    {complaint.incident_data.incident_date || 'Unknown'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <p dir="ltr" className="mt-0.5 font-mono font-semibold">
                    {complaint.incident_data.amount != null
                      ? `${complaint.incident_data.amount.toLocaleString()} ${complaint.incident_data.currency || 'PKR'}`
                      : 'Unknown'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Method</span>
                  <p className="mt-0.5 font-medium">
                    {complaint.incident_data.payment_method || 'Unknown'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">
                    Transaction Ref
                  </span>
                  <p dir="ltr" className="mt-0.5 font-mono text-xs">
                    {complaint.incident_data.transaction_reference || 'Unknown'}
                  </p>
                </div>
              </div>

              {(complaint.incident_data.suspect_details ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Suspect Details:
                  </span>
                  {(complaint.incident_data.suspect_details ?? []).map(
                    (s, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        dir="ltr"
                        className="font-mono text-xs"
                      >
                        {s}
                      </Badge>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <EvidenceUploader
            complaintId={complaint.complaint_id}
            evidenceIds={complaint.incident_data.evidence_ids ?? []}
            onUploaded={handleEvidenceUploaded}
            disabled={complaint.current_status === 'RESOLVED'}
          />

          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">
                Consent Management & Take-Back
              </CardTitle>
              <CardDescription>
                View, modify approved scopes, or withdraw consent at any time.
                Withdrawing consent immediately blocks subsequent Helper or
                Officer API reads through Dastak.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConsentManager
                complaintId={complaint.complaint_id}
                recommendedRecipient={complaint.destination_workspace_id}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
