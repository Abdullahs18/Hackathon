export class DastakApiError extends Error {
  status: number;
  errorCode: string;
  detail: string;
  validationErrors?: string[];

  constructor(
    status: number,
    errorCode: string,
    detail: string,
    validationErrors?: string[],
  ) {
    super(detail);
    this.name = 'DastakApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.detail = detail;
    this.validationErrors = validationErrors;
  }
}

export function isDastakApiError(err: unknown): err is DastakApiError {
  return err instanceof DastakApiError;
}

export function formatShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
