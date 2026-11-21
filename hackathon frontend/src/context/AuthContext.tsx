import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  dastakApi,
  getAuthToken,
  isDastakApiError,
  onUnauthorized,
} from '@/lib/apiClient';
import type { Role, UserRecord } from '@/types/dastak';

interface AuthContextValue {
  user: UserRecord | null;
  loading: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  login: (user_id: string, password: string) => Promise<UserRecord>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function getHomePathForRole(role: Role): string {
  switch (role) {
    case 'Citizen':
      return '/citizen';
    case 'Helper':
      return '/helper';
    case 'Officer':
      return '/officer';
    case 'Admin':
      return '/admin';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await dastakApi.getMe();
      setUser(me);
      setAuthNotice(null);
    } catch (err) {
      if (isDastakApiError(err) && err.status === 0) {
        setAuthNotice(
          'Offline or backend unreachable while restoring session. Check connection or sign in again.',
        );
      } else {
        dastakApi.logout();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    return onUnauthorized((reason) => {
      setUser(null);
      setAuthNotice(
        reason || 'Your session expired or was rejected (401). Please sign in again.',
      );
    });
  }, []);

  const login = useCallback(async (user_id: string, password: string) => {
    setAuthNotice(null);
    await dastakApi.login({ user_id, password });
    const me = await dastakApi.getMe();
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    dastakApi.logout();
    setUser(null);
    setAuthNotice(null);
  }, []);

  const clearAuthNotice = useCallback(() => {
    setAuthNotice(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authNotice,
        clearAuthNotice,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
