import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PlusCircle,
  ShieldAlert,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EvidenceUploader } from '@/components/citizen/EvidenceUploader';
import { EvidenceGallery } from '@/components/shared/EvidenceGallery';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { WorkflowStatusBadge } from '@/components/shared/StatusBadge';
import { dastakApi } from '@/lib/apiClient';
import type {
  ComplaintRecord,
  EvidenceRecord,
  HelperInformation,
} from '@/types/dastak';

export function HelperCaseDetail() {
  const { id } = useParams();

  const [complaint, setComplaint] = useState<ComplaintRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [noteDescription, setNoteDescription] = useState('');
  const [txRef, setTxRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [suspectContact, setSuspectContact] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const loadCase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await dastakApi.getComplaint(id);
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

  const handleAddHelperInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (!complaint) return;

    const payload: HelperInformation = {};
    if (noteDescription.trim()) {
      const existingDesc = complaint.incident_data.description ?? '';
      payload.description = existingDesc
        ? `${existingDesc}\n[Helper note]: ${noteDescription.trim()}`
        : `[Helper note]: ${noteDescription.trim()}`;
    }
    if (txRef.trim()) {
      payload.transaction_reference = txRef.trim();
    }
    if (paymentMethod.trim()) {
      payload.payment_method = paymentMethod.trim();
    }
    if (suspectContact.trim()) {
      const currentSuspects = complaint.incident_data.suspect_details ?? [];
      payload.suspect_details = [
        ...currentSuspects,
        ...suspectContact
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ];
    }

    if (Object.keys(payload).length === 0) return;

    setSavingInfo(true);
    setError(null);
    setSavedNotice(null);
    try {
      const updated = await dastakApi.addHelperInformation(
        complaint.complaint_id,
        payload,
        complaint.version,
      );
      setComplaint(updated);
      setNoteDescription('');
      setTxRef('');
      setPaymentMethod('');
      setSuspectContact('');
      setSavedNotice(
        'Supporting information saved. Note: only the owning Citizen can confirm corrections, grant consent, or authorize final submission.',
      );
    } catch (err) {
      setError(err);
    } finally {
      setSavingInfo(false);
    }
  };

  const handleEvidenceUploaded = (_ev: EvidenceRecord) => {
    void loadCase();
  };

  if (loading && !complaint && !error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Verifying helper grant and loading case…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {complaint && <EvidenceGallery complaintId={complaint.complaint_id} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="min-h-10 gap-1.5">
            <Link to="/helper">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span>Authorized Cases</span>
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
              Helper view — restricted strictly to active case grant & active
              citizen consent scope.
            </p>
          </div>
        </div>
      </div>

      <ErrorBanner error={error} onRetry={() => void loadCase()} />

      {complaint && (
        <>
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden />
            <AlertTitle className="text-sm font-semibold">
              No Consent-Granting or Final Submission Authority
            </AlertTitle>
            <AlertDescription className="text-xs">
              Assisting citizen{' '}
              <span className="font-mono font-semibold">
                {complaint.citizen_id}
              </span>
              . You may add missing information and upload evidence here, while
              citizen confirmation, consent, and submission authorization remain
              exclusively with the Citizen.
            </AlertDescription>
          </Alert>

          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">
                Authorized Case Summary
              </CardTitle>
              <CardDescription>
                Fields outside active citizen consent scopes are filtered by the
                backend.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p
                dir="auto"
                className="rounded-lg border border-border bg-muted/30 p-3 text-foreground"
              >
                {complaint.incident_data.description || '—'}
              </p>

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
                      : 'Restricted / Unknown'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">Method</span>
                  <p className="mt-0.5 font-medium">
                    {complaint.incident_data.payment_method ||
                      'Restricted / Unknown'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <span className="text-xs text-muted-foreground">
                    Transaction Ref
                  </span>
                  <p dir="ltr" className="mt-0.5 font-mono text-xs">
                    {complaint.incident_data.transaction_reference ||
                      'Missing / Unknown'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-xs">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PlusCircle className="h-5 w-5 text-primary" aria-hidden />
                <span>Add Supporting Information</span>
              </CardTitle>
              <CardDescription>
                Submits via{' '}
                <code className="font-mono">
                  POST /api/v1/complaints/{complaint.complaint_id}
                  /helper-information
                </code>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {savedNotice && (
                <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden />
                  <AlertDescription className="text-xs font-medium">
                    {savedNotice}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleAddHelperInfo} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="helper-note">
                    Additional Information / Clarification Note
                  </Label>
                  <Textarea
                    id="helper-note"
                    dir="auto"
                    rows={3}
                    value={noteDescription}
                    onChange={(e) => setNoteDescription(e.target.value)}
                    placeholder="Add details confirmed with the citizen (e.g., wallet receipt info, scam call context)..."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="helper-tx">Transaction Reference</Label>
                    <Input
                      id="helper-tx"
                      dir="ltr"
                      value={txRef}
                      onChange={(e) => setTxRef(e.target.value)}
                      placeholder="e.g., SYN-TXN-2026-0041"
                      className="min-h-11 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="helper-method">Payment Method</Label>
                    <Input
                      id="helper-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      placeholder="e.g., JazzCash / Easypaisa"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="helper-suspect">
                      Additional Suspect Number / Link
                    </Label>
                    <Input
                      id="helper-suspect"
                      dir="ltr"
                      value={suspectContact}
                      onChange={(e) => setSuspectContact(e.target.value)}
                      placeholder="e.g., +92-300-0000882"
                      className="min-h-11 font-mono"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={
                    savingInfo ||
                    (!noteDescription.trim() &&
                      !txRef.trim() &&
                      !paymentMethod.trim() &&
                      !suspectContact.trim())
                  }
                  className="min-h-11 gap-2"
                >
                  {savingInfo ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Helper Info…</span>
                    </>
                  ) : (
                    <span>Save Information to Case</span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <EvidenceUploader
            complaintId={complaint.complaint_id}
            evidenceIds={complaint.incident_data.evidence_ids ?? []}
            onUploaded={handleEvidenceUploaded}
          />
        </>
      )}
    </div>
  );
}

