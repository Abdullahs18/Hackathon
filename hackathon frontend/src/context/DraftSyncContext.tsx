import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  generateIdempotencyKey,
  isSimulatedOffline,
  setSimulatedOffline,
  USE_MOCK,
} from '@/lib/apiClient';
import { useAuth } from '@/context/AuthContext';
import type { IncidentInformation } from '@/types/dastak';

export type DraftSyncStatus =
  | 'idle'
  | 'saving'
  | 'saved_cloud'
  | 'saved_local'
  | 'offline_local'
  | 'error';

export interface LocalDraftPayload {
  complaintId?: string;
  step: number;
  incident: IncidentInformation;
  transcriptUrdu: string;
  idempotencyKey: string;
  updatedAt: string;
  pendingRemoteSync: boolean;
}

interface DraftSyncContextValue {
  isOnline: boolean;
  simulatedOffline: boolean;
  syncStatus: DraftSyncStatus;
  lastSavedAt: string | null;
  toggleSimulatedOffline: () => void;
  setSyncState: (status: DraftSyncStatus, timestamp?: string) => void;
  saveLocalDraft: (
    draft: Omit<LocalDraftPayload, 'updatedAt' | 'idempotencyKey'> & {
      idempotencyKey?: string;
    },
  ) => LocalDraftPayload | null;
  getLocalDraft: () => LocalDraftPayload | null;
  clearLocalDraft: () => void;
  markRemoteSynced: (complaintId?: string) => void;
}

const DraftSyncContext = createContext<DraftSyncContextValue | null>(null);

function storageKeyForUser(userId: string): string {
  return `dastak_local_draft_${userId}`;
}

export function DraftSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [simOffline, setSimOffline] = useState<boolean>(() =>
    isSimulatedOffline(),
  );
  const [syncStatus, setSyncStatus] = useState<DraftSyncStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => {
      setBrowserOnline(false);
      setSyncStatus('offline_local');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isOnline = browserOnline && !(USE_MOCK && simOffline);

  const toggleSimulatedOffline = useCallback(() => {
    if (!USE_MOCK) return;
    setSimOffline((prev) => {
      const next = !prev;
      setSimulatedOffline(next);
      if (next) {
        setSyncStatus('offline_local');
      } else {
        setSyncStatus((curr) => (curr === 'offline_local' ? 'saved_local' : curr));
      }
      return next;
    });
  }, []);

  const setSyncState = useCallback(
    (status: DraftSyncStatus, timestamp?: string) => {
      setSyncStatus(status);
      if (timestamp) {
        setLastSavedAt(timestamp);
      }
    },
    [],
  );

  const getLocalDraft = useCallback((): LocalDraftPayload | null => {
    if (!user) return null;
    try {
      const raw = localStorage.getItem(storageKeyForUser(user.user_id));
      if (!raw) return null;
      return JSON.parse(raw) as LocalDraftPayload;
    } catch {
      return null;
    }
  }, [user]);

  const saveLocalDraft = useCallback(
    (
      draft: Omit<LocalDraftPayload, 'updatedAt' | 'idempotencyKey'> & {
        idempotencyKey?: string;
      },
    ): LocalDraftPayload | null => {
      if (!user) return null;
      const existing = getLocalDraft();
      const now = new Date().toISOString();
      const payload: LocalDraftPayload = {
        ...draft,
        idempotencyKey:
          draft.idempotencyKey ||
          existing?.idempotencyKey ||
          generateIdempotencyKey(),
        updatedAt: now,
      };
      try {
        localStorage.setItem(
          storageKeyForUser(user.user_id),
          JSON.stringify(payload),
        );
      } catch {
        setSyncStatus('error');
        return null;
      }
      setLastSavedAt(now);
      setSyncStatus(isOnline ? 'saved_local' : 'offline_local');
      return payload;
    },
    [user, getLocalDraft, isOnline],
  );

  const markRemoteSynced = useCallback(
    (complaintId?: string) => {
      if (!user) return;
      const existing = getLocalDraft();
      const now = new Date().toISOString();
      if (existing) {
        const updated: LocalDraftPayload = {
          ...existing,
          complaintId: complaintId ?? existing.complaintId,
          pendingRemoteSync: false,
          updatedAt: now,
        };
        // Preserve the command key that will be used to recover uncertain submission results.
        try {
          localStorage.setItem(
            storageKeyForUser(user.user_id),
            JSON.stringify(updated),
          );
        } catch {
          // ignore
        }
      }
      setLastSavedAt(now);
      setSyncStatus('saved_cloud');
    },
    [user, getLocalDraft],
  );

  const clearLocalDraft = useCallback(() => {
    if (!user) return;
    try {
      localStorage.removeItem(storageKeyForUser(user.user_id));
    } catch {
      // ignore
    }
    setSyncStatus('idle');
  }, [user]);

  return (
    <DraftSyncContext.Provider
      value={{
        isOnline,
        simulatedOffline: USE_MOCK && simOffline,
        syncStatus,
        lastSavedAt,
        toggleSimulatedOffline,
        setSyncState,
        saveLocalDraft,
        getLocalDraft,
        clearLocalDraft,
        markRemoteSynced,
      }}
    >
      {children}
    </DraftSyncContext.Provider>
  );
}

export function useDraftSync(): DraftSyncContextValue {
  const ctx = useContext(DraftSyncContext);
  if (!ctx) {
    throw new Error('useDraftSync must be used inside DraftSyncProvider');
  }
  return ctx;
}

