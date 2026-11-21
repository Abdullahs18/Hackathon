import { useCallback, useEffect, useRef, useState } from 'react';
import { dastakApi, USE_MOCK } from '@/lib/apiClient';
import type { EvidenceRecord } from '@/types/dastak';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from './ErrorBanner';

export function EvidenceGallery({complaintId}: {complaintId:string}) {
  const [files, setFiles] = useState<EvidenceRecord[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [opened, setOpened] = useState<{url:string; file:EvidenceRecord} | null>(null);
  const [busy, setBusy] = useState(false);
  const url = useRef<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    setError(null); setOpened(null);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    try { setFiles(await dastakApi.listEvidence(complaintId)); }
    catch (cause) { setFiles([]); setError(cause); }
  }, [complaintId]);
  useEffect(() => {
    generation.current += 1;
    if (!USE_MOCK) void refresh();
    return () => { generation.current += 1; if(url.current) URL.revokeObjectURL(url.current); url.current=null; };
  }, [refresh]);
  if (USE_MOCK) return null;
  async function open(file:EvidenceRecord) {
    const current = generation.current;
    setBusy(true); setError(null); setOpened(null);
    try {
      const blob = await dastakApi.getPrivateBlob(`/api/v1/complaints/${encodeURIComponent(complaintId)}/evidence/${encodeURIComponent(file.evidence_id)}/content`);
      if(current!==generation.current) return;
      if(url.current) URL.revokeObjectURL(url.current);
      url.current=URL.createObjectURL(blob);
      setOpened({url:url.current,file});
    } catch(cause) { setError(cause); }
    finally { if(current===generation.current) setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border p-4" aria-label="Private evidence">
    <h3 className="font-semibold">Private evidence</h3>
    <p className="text-sm">Citizen-supplied originals; not authenticity-verified.</p>
    <Button variant="outline" type="button" onClick={() => void refresh()}>Refresh evidence</Button>
    {Boolean(error) && <ErrorBanner error={error} />}
    {files.map(f=><article key={f.evidence_id} className="space-y-1 rounded border p-2 text-sm">
      <p>{f.file_name} · {f.file_size} bytes</p><p className="break-all font-mono text-xs">Recorded SHA-256: {f.sha256}</p>
      <Button variant="outline" type="button" disabled={busy} onClick={() => void open(f)}>Open {f.file_name}</Button>
    </article>)}
    {opened && <div className="space-y-2">
      {opened.file.file_type.startsWith('image/') && <img src={opened.url} alt={opened.file.file_name} className="max-h-96 object-contain" />}
      <a className="underline" href={opened.url} download={opened.file.file_name}>Download original {opened.file.file_name}</a>
    </div>}
  </section>;
}
