import { useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  FileText,
  ImageIcon,
  Loader2,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dastakApi, getCachedEvidence, isDastakApiError } from '@/lib/apiClient';
import { formatBytes, formatShortTime } from '@/lib/apiError';
import { EVIDENCE_UNVERIFIED_LABEL } from '@/lib/workspaceMeta';
import type { EvidenceRecord } from '@/types/dastak';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

async function validateFileMagicBytes(file: File): Promise<string | null> {
  if (!ALLOWED_MIME.has(file.type)) {
    return 'Unsupported file type. Please attach a PNG, JPEG, WebP image or PDF document.';
  }
  if (file.size <= 0) {
    return 'Selected file is empty.';
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File exceeds the 5 MB upload limit (${formatBytes(file.size)}).`;
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === 'image/png') {
    const isPng =
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47;
    if (!isPng) return 'File content does not match a valid PNG image header.';
  } else if (file.type === 'image/jpeg') {
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (!isJpeg) return 'File content does not match a valid JPEG image header.';
  } else if (file.type === 'image/webp') {
    const riff =
      String.fromCharCode(header[0], header[1], header[2], header[3]) === 'RIFF';
    const webp =
      String.fromCharCode(header[8], header[9], header[10], header[11]) === 'WEBP';
    if (!riff || !webp) {
      return 'File content does not match a valid WebP image header.';
    }
  } else if (file.type === 'application/pdf') {
    const isPdf =
      String.fromCharCode(header[0], header[1], header[2], header[3]) === '%PDF';
    if (!isPdf) return 'File content does not match a valid PDF document header.';
  }
  return null;
}

interface EvidenceUploaderProps {
  complaintId?: string;
  ensureComplaintId?: () => Promise<string | null>;
  evidenceIds: string[];
  onUploaded: (evidence: EvidenceRecord) => void;
  disabled?: boolean;
}

export function EvidenceUploader({
  complaintId,
  ensureComplaintId,
  evidenceIds,
  onUploaded,
  disabled = false,
}: EvidenceUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedMap, setUploadedMap] = useState<Record<string, EvidenceRecord>>(
    {},
  );

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    const validationErr = await validateFileMagicBytes(file);
    if (validationErr) {
      setUploadError(validationErr);
      return;
    }

    setUploading(true);
    try {
      let targetId = complaintId;
      if (!targetId && ensureComplaintId) {
        targetId = (await ensureComplaintId()) ?? undefined;
      }
      if (!targetId) {
        setUploadError(
          'Please enter a short description or voice note first so a draft ID can be created before attaching files.',
        );
        return;
      }

      const record = await dastakApi.uploadEvidence(targetId, file);
      setUploadedMap((prev) => ({ ...prev, [record.evidence_id]: record }));
      onUploaded(record);
    } catch (err) {
      setUploadError(
        isDastakApiError(err)
          ? err.detail
          : 'Failed to upload supporting evidence file.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Supporting Evidence (Images or PDFs — Max 5 MB)
          </h3>
          <p className="text-xs text-muted-foreground">
            Attach transaction screenshots, receipts, or scam message captures.
            File contents and SHA-256 hashes are checked; no OCR is run.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => void handleFileSelected(e)}
          disabled={disabled || uploading}
        />

        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className="min-h-11 gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>Checking & Uploading…</span>
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" aria-hidden />
              <span>Attach Screenshot / PDF</span>
            </>
          )}
        </Button>
      </div>

      {uploadError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertDescription className="text-xs">{uploadError}</AlertDescription>
        </Alert>
      )}

      {evidenceIds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
          No evidence files attached yet. Attachments are helpful but optional.
        </div>
      ) : (
        <div className="space-y-2.5">
          {evidenceIds.map((evId) => {
            const cached = getCachedEvidence(evId);
            const meta = uploadedMap[evId] ?? cached?.evidence;
            const previewUrl = cached?.preview_data_url;

            return (
              <div
                key={evId}
                className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex items-start gap-3">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={meta?.file_name || evId}
                      className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted-foreground">
                      {meta?.file_type === 'application/pdf' ? (
                        <FileText className="h-5 w-5" aria-hidden />
                      ) : (
                        <ImageIcon className="h-5 w-5" aria-hidden />
                      )}
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {meta ? meta.file_name : `Evidence ${evId}`}
                      </span>
                      <span
                        dir="ltr"
                        className="font-mono text-[11px] text-muted-foreground"
                      >
                        {evId}
                      </span>
                    </div>

                    {meta && (
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(meta.file_size)} • Uploaded by{' '}
                        <span className="font-mono">{meta.uploader_id}</span> •{' '}
                        {formatShortTime(meta.timestamp)}
                      </p>
                    )}

                    {meta?.sha256 && (
                      <p
                        dir="ltr"
                        className="truncate font-mono text-[11px] text-slate-600"
                      >
                        SHA-256: {meta.sha256.slice(0, 20)}…
                      </p>
                    )}
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className="w-fit shrink-0 gap-1 border-[#D97706] bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-semibold text-[#92400E]"
                >
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                  <span>{EVIDENCE_UNVERIFIED_LABEL}</span>
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
