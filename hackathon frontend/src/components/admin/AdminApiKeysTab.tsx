import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
import { dastakApi, generateIdempotencyKey } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import { ALL_API_KEY_SCOPES } from '@/lib/workspaceMeta';
import type { ApiKeyIssued, ApiKeyMetadata, ApiKeyScope } from '@/types/dastak';

export function AdminApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [open, setOpen] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>([
    'admin:rules',
  ]);
  const [expiryDays, setExpiryDays] = useState('30');
  const [creating, setCreating] = useState(false);
  const [issuedKey, setIssuedKey] = useState<ApiKeyIssued | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const pendingIssue = useRef<{signature:string; key:string; expiresAt:string} | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dastakApi.listApiKeys();
      setKeys(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const toggleScope = (scope: ApiKeyScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope],
    );
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedScopes.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const signature = JSON.stringify([[...selectedScopes].sort(),expiryDays]);
      if (pendingIssue.current?.signature !== signature) pendingIssue.current = {
        signature, key:generateIdempotencyKey(),
        expiresAt:new Date(Date.now()+Number(expiryDays||'30')*24*60*60*1000).toISOString(),
      };
      const {expiresAt,key} = pendingIssue.current;
      const issued = await dastakApi.createApiKey({
        scopes: selectedScopes,
        expires_at: expiresAt,
      }, key);
      setIssuedKey(issued);
      pendingIssue.current = null;
      setCopied(false);
      setOpen(false);
      await loadKeys();
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setError(null);
    try {
      await dastakApi.revokeApiKey(id);
      if (issuedKey?.api_key_id === id) setIssuedKey(null);
      await loadKeys();
    } catch (err) {
      setError(err);
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopySecret = async () => {
    if (!issuedKey) return;
    try {
      await navigator.clipboard.writeText(issuedKey.api_key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onRetry={() => void loadKeys()} />

      {issuedKey && (
        <Alert className="border-emerald-400 bg-emerald-50 text-emerald-950">
          <KeyRound className="h-4 w-4 text-emerald-800" aria-hidden />
          <AlertTitle className="font-semibold">
            Scoped API Key Issued (Shown Once Only)
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2 text-xs">
            <p>
              Copy this <code className="font-mono">X-API-Key</code> secret now.
              Only its hash is retained by the backend.
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-white p-2.5">
              <code dir="ltr" className="font-mono text-xs font-bold text-slate-900">
                {issuedKey.api_key}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopySecret()}
                className="ms-auto h-7 gap-1 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-700" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-border shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden />
              <span>Scoped External API Keys ({keys.length})</span>
            </CardTitle>
            <CardDescription>
              Keys use <code className="font-mono">X-API-Key</code> scopes from
              the OpenAPI specification and can be revoked immediately.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadKeys()}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              <span>Refresh</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" aria-hidden />
                  <span>Issue API Key</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Issue Scoped API Key</DialogTitle>
                  <DialogDescription>
                    Select resource scopes and an expiry window.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Allowed Scopes *</Label>
                    <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                      {ALL_API_KEY_SCOPES.filter(scope => scope.startsWith('admin:') || scope === 'mock:services' || scope === 'notifications:read').map((scope) => (
                        <label
                          key={scope}
                          className="flex cursor-pointer items-center gap-2 text-xs"
                        >
                          <Checkbox
                            checked={selectedScopes.includes(scope)}
                            onCheckedChange={() => toggleScope(scope)}
                          />
                          <span className="font-mono">{scope}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="key-expiry">Expiration Window</Label>
                    <Select value={expiryDays} onValueChange={setExpiryDays}>
                      <SelectTrigger id="key-expiry" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={creating || selectedScopes.length === 0}
                    >
                      {creating ? 'Issuing…' : 'Issue Key'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {loading && keys.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Loading API keys…</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.api_key_id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {k.api_key_id}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((sc) => (
                          <Badge
                            key={sc}
                            variant="outline"
                            className="font-mono text-[10px]"
                          >
                            {sc}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatShortTime(k.expires_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          k.revoked
                            ? 'bg-red-100 text-red-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }
                      >
                        {k.revoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      {!k.revoked && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={revokingId === k.api_key_id}
                          onClick={() => void handleRevoke(k.api_key_id)}
                          className="h-8 gap-1 text-xs"
                        >
                          <Ban className="h-3 w-3" aria-hidden />
                          <span>
                            {revokingId === k.api_key_id
                              ? 'Revoking…'
                              : 'Revoke'}
                          </span>
                        </Button>
                      )}
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

