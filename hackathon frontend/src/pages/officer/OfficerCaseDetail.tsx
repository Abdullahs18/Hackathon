import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  ShieldAlert,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ReviewConversation } from '@/components/shared/ReviewConversation';
import { EvidenceGallery } from '@/components/shared/EvidenceGallery';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { dastakApi, getCachedEvidence, generateIdempotencyKey } from '@/lib/apiClient';
import { formatBytes, formatShortTime } from '@/lib/apiError';
import {
  EVIDENCE_UNVERIFIED_LABEL,
  getWorkspaceName,
} from '@/lib/workspaceMeta';
import type {
  ClientEvidencePreview,
  ComplaintRecord,
  OfficerAction,
} from '@/types/dastak';

const OFFICER_ACTIONS: Array<{
  action: OfficerAction;
  label: string;
  variant: 'default' | 'outline' | 'destructive' | 'secondary';
}> = [
  { action: 'request_information', label: 'Request Information', variant: 'outline' },
  { action: 'accept', label: 'Accept', variant: 'default' },
  { action: 'escalate', label: 'Escalate', variant: 'secondary' },
  { action: 'reject', label: 'Reject', variant: 'destructive' },
  { action: 'close', label: 'Close Case', variant: 'outline' },
];

const ALLOWED:Record<string,OfficerAction[]> = {
  pending:['request_information','accept','reject','escalate'],
  information_requested:['escalate'],information_received:['request_information','accept','reject','escalate'],
  accepted:['close','escalate'],escalated:['request_information','accept','reject'],rejected:[],closed:[],
};

export function OfficerCaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] =
    useState<OfficerAction | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ClientEvidencePreview | null>(
    null,
  );

  const loadCase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await dastakApi.getOfficerComplaint(id);
      setComplaint(data);
    } catch (err) {
      setComplaint(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  const command = useRef<{signature:string; key:string} | null>(null);
  const handleAction = async (action: OfficerAction) => {
    if (!complaint) return;
    if (!reason.trim()) {
      setReasonError('A written reason is required before taking any officer action.');
      return;
    }
    const signature = JSON.stringify([complaint.complaint_id, complaint.version, action, reason.trim()]);
    if (command.current?.signature !== signature) command.current = {signature, key:generateIdempotencyKey()};
    const commandKey = command.current.key;
    setReasonError(null);
    setSubmittingAction(action);
    setError(null);
    setActionNotice(null);
    try {
      const updated = await dastakApi.takeOfficerAction(
        complaint.complaint_id,
        {
          action,
          reason: reason.trim(),
        },
        complaint.version,
        commandKey,
      );
      setComplaint(updated);
      setActionNotice(
        `Recorded "${action}" with reason: "${reason.trim()}". Citizen has been notified.`,
      );
      setReason('');
    } catch (err) {
      setError(err);
    } finally {
      setSubmittingAction(null);
    }
  };

  if (loading && !complaint && !error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Checking workspace authorization and consent…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {complaint && <EvidenceGallery complaintId={complaint.complaint_id} />}
      {complaint && <ReviewConversation complaint={complaint} officer onChanged={setComplaint} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="min-h-10 gap-1.5">
            <Link to="/officer">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>Workspace Queue</span>
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
              <Badge className="gap-1 bg-indigo-800 text-white">
                <Building2 className="h-3 w-3" aria-hidden />
                <span>{getWorkspaceName(user?.workspace_id)} (Simulated)</span>
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Department Officer review view — isolated to assigned workspace &
              subject to live citizen consent.
            </p>
          </div>
        </div>
      </div>

      <ErrorBanner error={error} onRetry={() => void loadCase()} />

      {complaint && (
        <>
          <Card className="border-border shadow-xs">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Complaint Record & Formal Draft
                </CardTitle>
                <span
                  dir="ltr"
                  className="rounded border border-border bg-muted px-2.5 py-0.5 font-mono text-xs"
                >
                  Rule Version: {complaint.rule_version_id || 'Unassigned'}
                </span>
              </div>
              <CardDescription>
                Citizen ID:{' '}
                <span className="font-mono text-foreground">
                  {complaint.citizen_id}
                </span>{' '}
                • Citizen Confirmed:{' '}
                <strong>
                  {complaint.complaint_draft?.citizen_confirmed ? 'Yes' : 'No'}
                </strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Formal Summary / Narrative
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
                    Scam Message Text
                  </p>
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 font-mono text-xs text-amber-950">
                    {complaint.incident_data.scam_message}
                  </p>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <p className="mt-0.5 font-medium">
                    {complaint.complaint_draft?.incident_date ||
                      complaint.incident_data.incident_date ||
                      'Unknown'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <p dir="ltr" className="mt-0.5 font-mono font-semibold">
                    {complaint.incident_data.amount != null
                      ? `${complaint.incident_data.amount.toLocaleString()} ${complaint.incident_data.currency || 'PKR'}`
                      : 'Unknown / Restricted'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Method</span>
                  <p className="mt-0.5 font-medium">
                    {complaint.incident_data.payment_method ||
                      'Unknown / Restricted'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">
                    Transaction Ref
                  </span>
                  <p dir="ltr" className="mt-0.5 font-mono text-xs">
                    {complaint.incident_data.transaction_reference ||
                      'Unknown / Restricted'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EVIDENCE VIEWER (NO OCR, EXPLICIT UNVERIFIED LABEL) */}
          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">
                Citizen-Submitted Evidence Viewer
              </CardTitle>
              <CardDescription>
                Evidence files carry their SHA-256 hash and remain labeled
                unverified. Officers make all authenticity and review judgments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(complaint.incident_data.evidence_ids ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No evidence files available (either none uploaded or hidden by
                  citizen consent scope).
                </div>
              ) : (
                (complaint.incident_data.evidence_ids ?? []).map((evId) => {
                  const cached = getCachedEvidence(evId);
                  const meta = cached?.evidence;
                  return (
                    <div
                      key={evId}
                      className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-white">
                          {meta?.file_type === 'application/pdf' ? (
                            <FileText className="h-5 w-5" aria-hidden />
                          ) : (
                            <ImageIcon className="h-5 w-5" aria-hidden />
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">
                              {meta ? meta.file_name : `Evidence ${evId}`}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {evId}
                            </span>
                          </div>
                          {meta && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatBytes(meta.file_size)} • Uploader:{' '}
                              <span className="font-mono">
                                {meta.uploader_id}
                              </span>{' '}
                              • {formatShortTime(meta.timestamp)}
                            </p>
                          )}
                          {meta?.sha256 && (
                            <p
                              dir="ltr"
                              className="font-mono text-[11px] text-slate-600"
                            >
                              SHA-256: {meta.sha256}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="gap-1 border-[#D97706] bg-[#FEF3C7] text-[11px] font-semibold text-[#92400E]"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                          <span>{EVIDENCE_UNVERIFIED_LABEL}</span>
                        </Badge>
                        {cached && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewItem(cached)}
                            className="gap-1.5 bg-white"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            <span>Inspect</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* CONTROLLED OFFICER ACTIONS PANEL */}
          <Card className="border-2 border-indigo-200 shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">
                Officer Review Decision (Controlled Actions)
              </CardTitle>
              <CardDescription>
                Every action requires a written reason and updates the append-only
                audit trail and citizen notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {actionNotice && (
                <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
                  <AlertTitle>Decision Recorded</AlertTitle>
                  <AlertDescription className="text-xs">
                    {actionNotice}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="officer-reason">
                  Written Decision Reason (Required) *
                </Label>
                <Textarea
                  id="officer-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(null);
                  }}
                  placeholder="Provide a clear explanation for requesting info, accepting, escalating, rejecting, or closing..."
                />
                {reasonError && (
                  <p className="text-xs font-medium text-destructive">
                    {reasonError}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2.5">
                {OFFICER_ACTIONS.map((item) => (
                  <Button
                    key={item.action}
                    type="button"
                    variant={item.variant}
                    disabled={submittingAction !== null || !reason.trim() || !(ALLOWED[complaint.review_outcome || 'pending'] || []).includes(item.action)}
                    onClick={() => void handleAction(item.action)}
                    className="min-h-11 gap-1.5"
                  >
                    {submittingAction === item.action && (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    )}
                    <span>{item.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => !open && setPreviewItem(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewItem?.evidence.file_name}</DialogTitle>
            <DialogDescription>
              {EVIDENCE_UNVERIFIED_LABEL} • SHA-256:{' '}
              <span className="font-mono text-[11px]">
                {previewItem?.evidence.sha256}
              </span>
            </DialogDescription>
          </DialogHeader>
          {previewItem?.preview_data_url ? (
            <img
              src={previewItem.preview_data_url}
              alt={previewItem.evidence.file_name}
              className="max-h-96 w-full rounded-lg border object-contain"
            />
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
              Binary preview is unavailable for this seeded or PDF attachment;
              metadata and SHA-256 integrity hash are verified above.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

