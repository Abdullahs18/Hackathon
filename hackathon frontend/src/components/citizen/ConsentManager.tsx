import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  PlusCircle,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { ConsentStatusBadge } from '@/components/shared/StatusBadge';
import { dastakApi } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import {
  getWorkspaceName,
  PRE_SEEDED_WORKSPACES,
  STANDARD_DATA_SCOPES,
} from '@/lib/workspaceMeta';
import type { ConsentRecord } from '@/types/dastak';

interface ConsentManagerProps {
  complaintId: string;
  recommendedRecipient?: string | null;
  onConsentsChange?: (consents: ConsentRecord[]) => void;
}

export function ConsentManager({
  complaintId,
  recommendedRecipient,
  onConsentsChange,
}: ConsentManagerProps) {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingScopes, setEditingScopes] = useState<Record<string, string[]>>(
    {},
  );
  const [withdrawTarget, setWithdrawTarget] = useState<ConsentRecord | null>(
    null,
  );

  // New grant form state
  const [newRecipient, setNewRecipient] = useState<string>(
    recommendedRecipient || PRE_SEEDED_WORKSPACES[0].workspace_id,
  );
  const [newPurpose, setNewPurpose] = useState<string>(
    'Simulated online financial fraud intake review and mock submission',
  );
  const [newScopes, setNewScopes] = useState<string[]>(
    STANDARD_DATA_SCOPES.map((s) => s.id),
  );
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    if (recommendedRecipient) {
      setNewRecipient(recommendedRecipient);
    }
  }, [recommendedRecipient]);

  const loadConsents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dastakApi.listConsents(complaintId);
      setConsents(list);
      const scopeMap: Record<string, string[]> = {};
      for (const item of list) {
        scopeMap[item.consent_id] = item.data_scopes;
      }
      setEditingScopes(scopeMap);
      onConsentsChange?.(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [complaintId, onConsentsChange]);

  useEffect(() => {
    void loadConsents();
  }, [loadConsents]);

  const toggleExistingScope = (consentId: string, scopeId: string) => {
    setEditingScopes((prev) => {
      const current = prev[consentId] ?? [];
      const next = current.includes(scopeId)
        ? current.filter((s) => s !== scopeId)
        : [...current, scopeId];
      return { ...prev, [consentId]: next };
    });
  };

  const handleSaveScopes = async (consent: ConsentRecord) => {
    const scopes = editingScopes[consent.consent_id] ?? consent.data_scopes;
    setSavingId(consent.consent_id);
    setError(null);
    try {
      await dastakApi.changeConsent(consent.consent_id, {
        data_scopes: scopes,
      });
      await loadConsents();
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawTarget) return;
    setSavingId(withdrawTarget.consent_id);
    setError(null);
    try {
      await dastakApi.withdrawConsent(withdrawTarget.consent_id);
      setWithdrawTarget(null);
      await loadConsents();
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  };

  const handleGrantConsent = async () => {
    if (newScopes.length === 0) return;
    setGranting(true);
    setError(null);
    try {
      await dastakApi.grantConsent(complaintId, {
        recipient: newRecipient,
        purpose: newPurpose.trim() || 'Simulated complaint review',
        data_scopes: newScopes,
      });
      await loadConsents();
    } catch (err) {
      setError(err);
    } finally {
      setGranting(false);
    }
  };

  const hasGrantedForRecommended = recommendedRecipient
    ? consents.some(
        (c) =>
          c.recipient === recommendedRecipient && c.status === 'granted',
      )
    : false;

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onRetry={() => void loadConsents()} />

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading consent records…</span>
        </div>
      ) : (
        <div className="space-y-3">
          {consents.length === 0 ? (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>No Data-Sharing Consent Granted Yet</AlertTitle>
              <AlertDescription className="text-xs">
                Grant consent below so the simulated recipient workspace can
                receive only the fields you approve.
              </AlertDescription>
            </Alert>
          ) : (
            consents.map((item) => {
              const currentScopes =
                editingScopes[item.consent_id] ?? item.data_scopes;
              const isWithdrawn = item.status === 'withdrawn';

              return (
                <div
                  key={item.consent_id}
                  className={`space-y-3 rounded-xl border p-4 ${
                    isWithdrawn
                      ? 'border-red-200 bg-red-50/40'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          Recipient: {getWorkspaceName(item.recipient)}
                        </span>
                        <span
                          dir="ltr"
                          className="font-mono text-[11px] text-muted-foreground"
                        >
                          ({item.recipient})
                        </span>
                        <ConsentStatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Purpose: {item.purpose}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Granted: {formatShortTime(item.granted_at)}
                        {item.changed_at
                          ? ` • Modified: ${formatShortTime(item.changed_at)}`
                          : ''}
                        {item.withdrawn_at
                          ? ` • Withdrawn: ${formatShortTime(item.withdrawn_at)}`
                          : ''}
                      </p>
                    </div>

                    {!isWithdrawn && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={savingId === item.consent_id}
                        onClick={() => setWithdrawTarget(item)}
                        className="min-h-10 gap-1.5"
                      >
                        <ShieldOff className="h-4 w-4" aria-hidden />
                        <span>Withdraw Consent</span>
                      </Button>
                    )}
                  </div>

                  {!isWithdrawn ? (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-xs font-semibold text-foreground">
                        Approved Data Scopes (you may uncheck any field before
                        saving):
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {STANDARD_DATA_SCOPES.map((scope) => {
                          const checked = currentScopes.includes(scope.id);
                          return (
                            <label
                              key={scope.id}
                              className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent bg-white p-2 text-xs hover:border-border"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  toggleExistingScope(item.consent_id, scope.id)
                                }
                              />
                              <span>
                                <span className="block font-semibold text-foreground">
                                  {scope.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {scope.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            savingId === item.consent_id ||
                            currentScopes.length === 0
                          }
                          onClick={() => void handleSaveScopes(item)}
                          className="min-h-9"
                        >
                          {savingId === item.consent_id ? (
                            <>
                              <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            'Update Approved Scopes'
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-[#991B1B]">
                      Withdrawn: Future access by {getWorkspaceName(item.recipient)}{' '}
                      through Dastak is blocked immediately and logged in the
                      audit trail. An external recipient that already received a
                      copy may still retain that prior copy.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {(!hasGrantedForRecommended || consents.length === 0) && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Grant New Data-Sharing Consent
              </h4>
              <p className="text-xs text-muted-foreground">
                Choose the simulated recipient, purpose, and exact fields to share.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="consent-recipient">Recipient (Simulated)</Label>
              <Select value={newRecipient} onValueChange={setNewRecipient}>
                <SelectTrigger id="consent-recipient" className="min-h-11 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRE_SEEDED_WORKSPACES.map((ws) => (
                    <SelectItem key={ws.workspace_id} value={ws.workspace_id}>
                      {ws.name} (Simulated)
                    </SelectItem>
                  ))}
                  <SelectItem value="hlp_bilal_01">
                    Helper: hlp_bilal_01 (Demo Community Helper)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="consent-purpose">Purpose of Sharing</Label>
              <Input
                id="consent-purpose"
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                className="min-h-11 bg-white"
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {STANDARD_DATA_SCOPES.map((scope) => {
              const checked = newScopes.includes(scope.id);
              return (
                <label
                  key={scope.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-white p-2.5 text-xs"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      setNewScopes((prev) =>
                        prev.includes(scope.id)
                          ? prev.filter((s) => s !== scope.id)
                          : [...prev, scope.id],
                      )
                    }
                  />
                  <span>
                    <span className="block font-semibold text-foreground">
                      {scope.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {scope.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <Button
            type="button"
            disabled={granting || newScopes.length === 0}
            onClick={() => void handleGrantConsent()}
            className="min-h-11 gap-2"
          >
            {granting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>Granting Consent…</span>
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" aria-hidden />
                <span>Grant Consent / رضامندی دیں</span>
              </>
            )}
          </Button>
        </div>
      )}

      <Dialog
        open={Boolean(withdrawTarget)}
        onOpenChange={(open) => !open && setWithdrawTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff className="h-5 w-5" aria-hidden />
              <span>Withdraw Data-Sharing Consent?</span>
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-sm">
              <span className="block">
                Withdrawing consent for{' '}
                <strong>
                  {withdrawTarget
                    ? getWorkspaceName(withdrawTarget.recipient)
                    : ''}
                </strong>{' '}
                immediately blocks future API access through Dastak and appends a
                withdrawal event to the audit log.
              </span>
              <span className="block text-xs text-muted-foreground">
                Honest disclosure: If an external recipient already received a
                copy prior to withdrawal, Dastak cannot retract that copy from
                their external storage.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWithdrawTarget(null)}
            >
              Keep Consent Active
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={savingId === withdrawTarget?.consent_id}
              onClick={() => void handleConfirmWithdraw()}
            >
              {savingId === withdrawTarget?.consent_id
                ? 'Withdrawing…'
                : 'Confirm Withdrawal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
