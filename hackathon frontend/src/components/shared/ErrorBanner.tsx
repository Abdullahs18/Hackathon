import { AlertCircle, Lock, RefreshCw, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isDastakApiError } from '@/lib/apiClient';

interface ErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  titleOverride?: string;
}

export function ErrorBanner({ error, onRetry, titleOverride }: ErrorBannerProps) {
  if (!error) return null;

  let title = titleOverride || 'Request Failed';
  let detail =
    error instanceof Error ? error.message : 'An unexpected error occurred.';
  let icon = <AlertCircle className="h-4 w-4" aria-hidden />;
  let isAccessDenied = false;
  let isNetwork = false;
  let validationList: string[] | undefined;

  if (isDastakApiError(error)) {
    detail = error.detail;
    validationList = error.validationErrors;
    if (error.status === 403) {
      title = titleOverride || 'Access Denied (403 Forbidden)';
      icon = <Lock className="h-4 w-4" aria-hidden />;
      isAccessDenied = true;
    } else if (error.status === 0) {
      title = titleOverride || 'Weak / Disconnected Network';
      icon = <WifiOff className="h-4 w-4" aria-hidden />;
      isNetwork = true;
    } else if (error.status === 409) {
      title = titleOverride || 'State or Idempotency Conflict (409)';
    } else if (error.status === 422 || error.status === 400) {
      title = titleOverride || `Validation Error (${error.status})`;
    } else if (error.status === 404) {
      title = titleOverride || 'Not Found (404)';
    }
  }

  return (
    <Alert
      variant={isNetwork ? 'default' : 'destructive'}
      className={
        isNetwork
          ? 'border-[#EA580C] bg-[#FFEDD5] text-[#9A3412]'
          : isAccessDenied
            ? 'border-[#B91C1C] bg-[#FEF2F2] text-[#991B1B]'
            : undefined
      }
    >
      {icon}
      <AlertTitle className="font-semibold">{title}</AlertTitle>
      <AlertDescription className="mt-1 space-y-2">
        <p className="text-sm">{detail}</p>
        {validationList && validationList.length > 0 && (
          <ul className="list-disc ps-5 text-xs">
            {validationList.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 h-8 gap-1.5 bg-white text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span>Retry</span>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
