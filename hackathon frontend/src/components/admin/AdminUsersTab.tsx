import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Plus, RefreshCw, Users } from 'lucide-react';
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
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import { RoleBadge } from '@/components/shared/StatusBadge';
import { dastakApi } from '@/lib/apiClient';
import { getWorkspaceName, PRE_SEEDED_WORKSPACES } from '@/lib/workspaceMeta';
import type { Role, UserRecord } from '@/types/dastak';

export function AdminUsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [open, setOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newPassword, setNewPassword] = useState('demo1234');
  const [newRole, setNewRole] = useState<Role>('Citizen');
  const [newWorkspaceId, setNewWorkspaceId] = useState(
    PRE_SEEDED_WORKSPACES[0].workspace_id,
  );
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dastakApi.listUsers();
      setUsers(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim() || !newPassword) return;
    setCreating(true);
    setError(null);
    try {
      await dastakApi.createUser({
        user_id: newUserId.trim(),
        password: newPassword,
        role: newRole,
        workspace_id: newRole === 'Officer' ? newWorkspaceId : null,
      });
      setOpen(false);
      setNewUserId('');
      await loadUsers();
    } catch (err) {
      setError(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onRetry={() => void loadUsers()} />

      <Card className="border-border shadow-xs">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" aria-hidden />
              <span>Synthetic Users & Role Assignments ({users.length})</span>
            </CardTitle>
            <CardDescription>
              Four platform roles only (Citizen, Helper, Officer, Admin).
              Officers are strictly isolated to one pre-seeded simulated
              workspace.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadUsers()}
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
                  <span>Add Synthetic User</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Synthetic User</DialogTitle>
                  <DialogDescription>
                    Use synthetic demo identifiers only (no real CNICs or
                    personal emails).
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-user-id">Synthetic User ID *</Label>
                    <Input
                      id="admin-user-id"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      placeholder="e.g., cit_amina_04"
                      className="font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-user-pass">Demo Password *</Label>
                    <Input
                      id="admin-user-pass"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-user-role">Role *</Label>
                    <Select
                      value={newRole}
                      onValueChange={(v) => setNewRole(v as Role)}
                    >
                      <SelectTrigger id="admin-user-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Citizen">Citizen</SelectItem>
                        <SelectItem value="Helper">Helper</SelectItem>
                        <SelectItem value="Officer">Officer</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newRole === 'Officer' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-user-ws">
                        Pre-Seeded Simulated Workspace *
                      </Label>
                      <Select
                        value={newWorkspaceId}
                        onValueChange={setNewWorkspaceId}
                      >
                        <SelectTrigger id="admin-user-ws" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRE_SEEDED_WORKSPACES.map((ws) => (
                            <SelectItem
                              key={ws.workspace_id}
                              value={ws.workspace_id}
                            >
                              {ws.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? 'Creating…' : 'Create User'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {loading && users.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Loading users…</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Simulated Workspace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {u.user_id}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.workspace_id ? (
                        <span>
                          {getWorkspaceName(u.workspace_id)}{' '}
                          <span className="font-mono text-[11px]">
                            ({u.workspace_id})
                          </span>
                        </span>
                      ) : (
                        '—'
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
