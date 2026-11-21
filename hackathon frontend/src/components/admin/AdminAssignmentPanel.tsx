import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { dastakApi } from '@/lib/apiClient';
import type { AdminAssignmentCase, AdminAssignmentQueue } from '@/types/dastak';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/shared/ErrorBanner';

export function AdminAssignmentPanel() {
  const [filter, setFilter] = useState<'unassigned' | 'assigned' | 'all'>('unassigned');
  const [items, setItems] = useState<AdminAssignmentCase[]>([]);
  const [officers, setOfficers] = useState<AdminAssignmentQueue['officers']>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busyCase, setBusyCase] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async (before?: string) => {
    const current = ++generation.current;
    setLoading(true); setError(null);
    try {
      const result = await dastakApi.listAssignmentQueue(filter, before);
      if (current !== generation.current) return;
      setItems(previous => before ? [...new Map([...previous, ...result.items].map(row => [row.complaint_id, row])).values()] : result.items);
      setOfficers(result.officers); setNextCursor(result.next_cursor);
    } catch (cause) {if (current === generation.current) setError(cause);}
    finally {if (current === generation.current) setLoading(false);}
  }, [filter]);
  useEffect(() => {void load(); return () => {generation.current++;};}, [load]);
  async function assign(row: AdminAssignmentCase, officer: string) {
    setError(null); setNotice(''); setBusyCase(row.complaint_id);
    try {
      await dastakApi.assignOfficer(row.complaint_id, officer);
      setNotice(`${row.submission_reference} assigned to ${officer}. The officer can now find it in their queue. Workspace and current sharing permission were checked.`);
      await load();
    } catch (cause) {setError(cause);}
    finally {setBusyCase(null);}
  }
  return <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4" aria-label="Submitted case assignment queue">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-2">
      <h2 className="font-semibold">Submitted cases & officer assignment</h2>
      <p className="text-sm leading-relaxed">Confirmed simulated filings appear here automatically. Select a matching officer to assign the case; the officer then reviews and resolves it. Admins see filing metadata, without citizen statements or evidence.</p>
    </div><Button type="button" variant="outline" disabled={loading || Boolean(busyCase)} onClick={() => void load()}>Refresh submitted cases</Button></div>
    <label className="block space-y-2 text-sm"><span>Show submitted cases</span><select aria-label="Assignment queue filter" className="block w-full rounded border bg-background p-2 sm:max-w-sm" value={filter} disabled={Boolean(busyCase)} onChange={event => {setFilter(event.target.value as typeof filter); setItems([]); setNotice('');}}>
      <option value="unassigned">Awaiting assignment</option><option value="assigned">Assigned</option><option value="all">All active submitted cases</option>
    </select></label>
    {notice && <p role="status" className="break-words rounded-lg border border-primary/30 p-3 text-sm leading-relaxed">{notice}</p>}
    {Boolean(error) && <ErrorBanner error={error} />}
    {loading && <p role="status" className="text-sm">Loading submitted cases…</p>}
    {!loading && !error && items.length === 0 && <p className="text-sm leading-relaxed">{filter === 'unassigned' ? 'No submitted cases are awaiting assignment. Use Assigned to see cases already forwarded to an officer.' : 'No active submitted cases match this filter.'} Drafts and cases awaiting citizen approval appear only in the citizen workflow.</p>}
    <div className="space-y-4">{items.map(row => {
      const choices = officers.filter(officer => officer.workspace_id === row.destination_workspace_id);
      const chosen = selected[row.complaint_id] || row.assigned_officer_id || choices[0]?.user_id || '';
      const valid = choices.some(officer => officer.user_id === chosen);
      return <article key={row.complaint_id} className="min-w-0 space-y-4 rounded-xl border p-4" aria-label={`Submitted case ${row.complaint_id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h3 className="break-all font-semibold"><bdi dir="ltr">{row.submission_reference}</bdi></h3><p className="text-sm">{getWorkspaceName(row.destination_workspace_id)}</p></div><span className="rounded bg-muted px-2 py-1 text-xs">{row.current_status === 'SUBMITTED' ? 'Submitted' : 'Officer review'} · {row.review_outcome.replaceAll('_', ' ')}</span></div>
        <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0"><dt className="text-muted-foreground">Complaint ID</dt><dd className="break-all font-mono text-xs"><bdi dir="ltr">{row.complaint_id}</bdi></dd></div>
          <div><dt className="text-muted-foreground">Submitted</dt><dd>{new Date(row.submitted_at).toLocaleString()}</dd></div>
          <div className="min-w-0"><dt className="text-muted-foreground">Current officer</dt><dd className="break-all">{row.assigned_officer_id || 'Awaiting assignment'}</dd></div>
          <div><dt className="text-muted-foreground">Recipient sharing</dt><dd>{row.recipient_consent_active ? 'Active' : 'Withdrawn or limited — citizen permission is needed'}</dd></div>
        </dl>
        <div className="flex flex-wrap items-end gap-3"><label className="block w-full min-w-0 space-y-2 text-sm sm:w-auto sm:min-w-64 sm:flex-1"><span>Officer in this workspace</span><select aria-label={`Officer for ${row.submission_reference}`} className="block w-full min-w-0 rounded border bg-background p-2" value={valid ? chosen : ''} disabled={loading || Boolean(busyCase) || !row.recipient_consent_active} onChange={event => setSelected(previous => ({...previous, [row.complaint_id]:event.target.value}))}>
          {!valid && <option value="">Choose an active officer</option>}{choices.map(officer => <option key={officer.user_id} value={officer.user_id}>{officer.user_id}</option>)}
        </select></label><Button type="button" disabled={loading || Boolean(busyCase) || !row.recipient_consent_active || !valid || row.assigned_officer_id === chosen} onClick={() => void assign(row, chosen)}>{busyCase === row.complaint_id ? 'Saving assignment…' : row.assigned_officer_id ? 'Reassign officer' : 'Assign officer'}</Button><Link className="py-2 text-sm font-medium text-primary underline" to={'/admin?tab=audit&complaint=' + encodeURIComponent(row.complaint_id)}>View safe audit</Link></div>
        {choices.length === 0 && <p className="text-sm">No active officer is available in this workspace. Create an Officer account in Users & Roles, then refresh this queue.</p>}
      </article>;
    })}</div>
    {nextCursor && <Button type="button" variant="outline" disabled={loading || Boolean(busyCase)} onClick={() => void load(nextCursor)}>Load more submitted cases</Button>}
  </section>;
}
