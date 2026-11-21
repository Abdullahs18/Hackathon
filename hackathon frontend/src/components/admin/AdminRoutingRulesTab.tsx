import { useI18n } from '@/i18n/I18nContext';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Edit3,
  GitBranch,
  History,
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { dastakApi } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import { getWorkspaceName, PRE_SEEDED_WORKSPACES } from '@/lib/workspaceMeta';
import type { RoutingRuleVersionRecord, RoutingRuleRecord } from '@/types/dastak';

interface ParsedVersionRow {
  rule_version_id: string;
  rule_id?: string;
  destination?: string;
  priority?: number;
  active?: boolean;
  actor: string;
  timestamp: string;
  summary: string;
}

export function AdminRoutingRulesTab() {
  const [rules, setRules] = useState<RoutingRuleRecord[]>([]);
  const [versions, setVersions] = useState<RoutingRuleVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [editingRule, setEditingRule] = useState<RoutingRuleRecord | null>(null);
  const [editDest, setEditDest] = useState('');
  const [editPriority, setEditPriority] = useState('1');
  const [editActive, setEditActive] = useState(true);
  const [editExplanation, setEditExplanation] = useState('');
  const [editJustification, setEditJustification] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIncidentType, setNewIncidentType] = useState(
    'online_financial_fraud',
  );
  const [newDest, setNewDest] = useState(PRE_SEEDED_WORKSPACES[0].workspace_id);
  const [newPriority, setNewPriority] = useState('2');
  const [newExplanation, setNewExplanation] = useState('');
  const [newJustification, setNewJustification] = useState('');
  const [creatingRule, setCreatingRule] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ruleList = await dastakApi.listRoutingRules();
      const history = await Promise.all(ruleList.map(rule => dastakApi.listRoutingVersions(rule.rule_id)));
      setRules(ruleList);
      setVersions(history.flat());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const openEdit = (rule: RoutingRuleRecord) => {
    setEditingRule(rule);
    setEditDest(rule.destination_workspace_id);
    setEditPriority(String(rule.priority));
    setEditActive(rule.active);
    setEditExplanation(rule.explanation);
    setEditJustification(rule.justification);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    setSavingEdit(true);
    setError(null);
    try {
      await dastakApi.updateRoutingRule(editingRule.rule_id, {
        destination_workspace_id: editDest,
        priority: Number(editPriority) || 1,
        active: editActive,
        explanation: editExplanation.trim(),
        justification: editJustification.trim(),
      }, editingRule.rule_version_id);
      setEditingRule(null);
      await loadRules();
    } catch (err) {
      setError(err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (rule: RoutingRuleRecord, next: boolean) => {
    setError(null);
    try {
      await dastakApi.updateRoutingRule(rule.rule_id, {
        active: next,
        justification: next
          ? 'Re-activated routing rule via Admin Rule Editor'
          : 'Deactivated routing rule via Admin Rule Editor (unmatched cases go to Human Review)',
      }, rule.rule_version_id);
      await loadRules();
    } catch (err) {
      setError(err);
    }
  };

  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newExplanation.trim() || !newJustification.trim()) {
      return;
    }
    setCreatingRule(true);
    setError(null);
    try {
      await dastakApi.createRoutingRule({
        name: newName.trim(),
        incident_type: newIncidentType.trim() || 'online_financial_fraud',
        destination_workspace_id: newDest,
        priority: Number(newPriority) || 1,
        active: true,
        explanation: newExplanation.trim(),
        justification: newJustification.trim(),
      });
      setCreateOpen(false);
      setNewName('');
      setNewExplanation('');
      setNewJustification('');
      await loadRules();
    } catch (err) {
      setError(err);
    } finally {
      setCreatingRule(false);
    }
  };

  const versionHistory = useMemo<ParsedVersionRow[]>(() => versions.map(v => ({
    rule_version_id:v.rule_version_id,rule_id:v.rule_id,destination:v.destination_workspace_id,
    priority:v.priority,active:v.active,actor:v.created_by,timestamp:v.timestamp,summary:v.justification,
  })), [versions]);

  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <Alert className="border-amber-300 bg-amber-50 text-amber-950">
        <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
        <AlertTitle className="font-semibold">
          {t('admin.rules.noticeTitle')}
        </AlertTitle>
        <AlertDescription className="text-xs">
          {t('admin.rules.notice1')}{' '}
          <code
            dir="ltr"
            className="inline-block rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap"
          >
            rule_version_id
          </code>
          {t('admin.rules.notice2')}
        </AlertDescription>
      </Alert>

      <ErrorBanner error={error} onRetry={() => void loadRules()} />

      <Card className="border-border shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-primary" aria-hidden />
              <span>Active & Configured Routing Rules ({rules.length})</span>
            </CardTitle>
            <CardDescription>
              Switch destination between the two pre-seeded simulated workspaces
              or toggle active state.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadRules()}
              className="gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              <span>Refresh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span>New Rule</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading && rules.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Loading routing rules…</span>
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.rule_id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {rule.name}
                    </span>
                    <Badge
                      variant="outline"
                      dir="ltr"
                      className="font-mono text-xs font-semibold text-primary"
                    >
                      {rule.rule_version_id}
                    </Badge>
                    <Badge
                      className={
                        rule.active
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-slate-200 text-slate-700'
                      }
                    >
                      {rule.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      Priority: {rule.priority}
                    </span>
                  </div>

                  <p className="text-xs text-foreground">
                    Incident Type:{' '}
                    <span className="font-mono font-medium">
                      {rule.incident_type}
                    </span>{' '}
                    → Destination:{' '}
                    <strong>
                      {getWorkspaceName(rule.destination_workspace_id)}
                    </strong>{' '}
                    <span className="font-mono text-[11px] text-muted-foreground">
                      ({rule.destination_workspace_id})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Citizen explanation: {rule.explanation}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Updated by <span className="font-mono">{rule.created_by}</span>{' '}
                    at {formatShortTime(rule.timestamp)} • Justification:{' '}
                    {rule.justification}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.active}
                      onCheckedChange={(checked) =>
                        void handleToggleActive(rule, checked)
                      }
                      aria-label={`Toggle ${rule.name} active state`}
                    />
                    <span className="text-xs font-medium">
                      {rule.active ? 'Enabled' : 'Paused'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(rule)}
                    className="gap-1.5 bg-white"
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden />
                    <span>Edit Rule</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* IMMUTABLE RULE VERSION HISTORY */}
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" aria-hidden />
            <span>Immutable Rule Version History</span>
          </CardTitle>
          <CardDescription>
            Every routing rule edit appends a new immutable version while
            preserving prior versions for historical case traces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versionHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No version snapshots recorded in audit logs yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version ID</TableHead>
                  <TableHead>Destination Workspace</TableHead>
                  <TableHead>Priority / State</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Admin & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versionHistory.map((row, idx) => (
                  <TableRow key={`${row.rule_version_id}-${idx}`}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {row.rule_version_id}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.destination
                        ? getWorkspaceName(row.destination)
                        : 'See summary'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.priority !== undefined ? `P${row.priority}` : '—'}{' '}
                      {row.active !== undefined
                        ? row.active
                          ? '• Active'
                          : '• Inactive'
                        : ''}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs text-muted-foreground">
                      {row.summary}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="font-mono">{row.actor}</span> •{' '}
                      {formatShortTime(row.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* EDIT RULE DIALOG */}
      <Dialog
        open={Boolean(editingRule)}
        onOpenChange={(open) => !open && setEditingRule(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Routing Rule (Creates New Immutable Version)
            </DialogTitle>
            <DialogDescription>
              Revising <code className="font-mono">{editingRule?.rule_id}</code>{' '}
              creates a new version immediately. Existing cases retain{' '}
              <code className="font-mono">{editingRule?.rule_version_id}</code>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-dest">Destination Simulated Workspace</Label>
              <Select value={editDest} onValueChange={setEditDest}>
                <SelectTrigger id="edit-dest" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRE_SEEDED_WORKSPACES.map((ws) => (
                    <SelectItem key={ws.workspace_id} value={ws.workspace_id}>
                      {ws.name} ({ws.workspace_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-priority">Priority (lower runs first)</Label>
                <Input
                  id="edit-priority"
                  type="number"
                  min={1}
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch
                  id="edit-active"
                  checked={editActive}
                  onCheckedChange={setEditActive}
                />
                <Label htmlFor="edit-active">Rule Active</Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-explanation">
                Citizen-Facing Explanation
              </Label>
              <Textarea
                id="edit-explanation"
                rows={2}
                value={editExplanation}
                onChange={(e) => setEditExplanation(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-justification">
                Admin Change Justification
              </Label>
              <Input
                id="edit-justification"
                value={editJustification}
                onChange={(e) => setEditJustification(e.target.value)}
                placeholder="e.g., Reassigning relief fraud triage to Digital Safety Intake"
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingRule(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Publishing Version…' : 'Publish New Rule Version'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CREATE RULE DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Routing Rule</DialogTitle>
            <DialogDescription>
              Creates the initial immutable version pointing to a pre-seeded
              simulated workspace.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-name">Rule Name *</Label>
              <Input
                id="new-rule-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Phishing & Relief Scam Priority Route"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-rule-type">Incident Type</Label>
                <Input
                  id="new-rule-type"
                  value={newIncidentType}
                  onChange={(e) => setNewIncidentType(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-rule-priority">Priority</Label>
                <Input
                  id="new-rule-priority"
                  type="number"
                  min={1}
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-dest">Destination Workspace</Label>
              <Select value={newDest} onValueChange={setNewDest}>
                <SelectTrigger id="new-rule-dest" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRE_SEEDED_WORKSPACES.map((ws) => (
                    <SelectItem key={ws.workspace_id} value={ws.workspace_id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-exp">Citizen Explanation *</Label>
              <Textarea
                id="new-rule-exp"
                rows={2}
                value={newExplanation}
                onChange={(e) => setNewExplanation(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-just">Justification *</Label>
              <Input
                id="new-rule-just"
                value={newJustification}
                onChange={(e) => setNewJustification(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingRule}>
                {creatingRule ? 'Creating…' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

