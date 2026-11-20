import { lazy, Suspense, type ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router';
import { Loader2, Lock } from 'lucide-react';
import { AppShell } from '@/components/shared/AppShell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AuthProvider,
  getHomePathForRole,
  useAuth,
} from '@/context/AuthContext';
import { DraftSyncProvider } from '@/context/DraftSyncContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoginPage } from '@/pages/LoginPage';
import type { Role } from '@/types/dastak';

const CitizenDashboard = lazy(() =>
  import('@/pages/citizen/CitizenDashboard').then((m) => ({
    default: m.CitizenDashboard,
  })),
);
const CitizenWizard = lazy(() =>
  import('@/pages/citizen/CitizenWizard').then((m) => ({
    default: m.CitizenWizard,
  })),
);
const CitizenComplaintDetail = lazy(() =>
  import('@/pages/citizen/CitizenComplaintDetail').then((m) => ({
    default: m.CitizenComplaintDetail,
  })),
);
const HelperDashboard = lazy(() =>
  import('@/pages/helper/HelperDashboard').then((m) => ({
    default: m.HelperDashboard,
  })),
);
const HelperCaseDetail = lazy(() =>
  import('@/pages/helper/HelperCaseDetail').then((m) => ({
    default: m.HelperCaseDetail,
  })),
);
const OfficerDashboard = lazy(() =>
  import('@/pages/officer/OfficerDashboard').then((m) => ({
    default: m.OfficerDashboard,
  })),
);
const OfficerCaseDetail = lazy(() =>
  import('@/pages/officer/OfficerCaseDetail').then((m) => ({
    default: m.OfficerCaseDetail,
  })),
);
const AdminDashboard = lazy(() =>
  import('@/pages/admin/AdminDashboard').then((m) => ({
    default: m.AdminDashboard,
  })),
);

function PageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-48 items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span>{t('common.loadingView')}</span>
      </div>
    </div>
  );
}

function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>{t('common.verifying')}</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <>
        <Card className="mx-auto max-w-lg border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Lock className="h-5 w-5" aria-hidden />
              <span>Role Access Restricted (403)</span>
            </CardTitle>
            <CardDescription>
              Signed in as <span className="font-mono">{user.user_id}</span> (
              {user.role}). This route requires one of:{' '}
              {allowedRoles.join(', ')}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={getHomePathForRole(user.role)}>
                Return to {user.role} Workspace
              </Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/** Persistent shell (header, banner, nav pill) so shared-element animations survive route changes. */
function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getHomePathForRole(user.role)} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DraftSyncProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomeRedirect />} />

            <Route element={<ShellLayout />}>

            {/* Citizen routes */}
            <Route
              path="/citizen"
              element={
                <ProtectedRoute allowedRoles={['Citizen']}>
                  <CitizenDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/citizen/new"
              element={
                <ProtectedRoute allowedRoles={['Citizen']}>
                  <CitizenWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/citizen/complaints/:id"
              element={
                <ProtectedRoute allowedRoles={['Citizen']}>
                  <CitizenComplaintDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/citizen/complaints/:id/wizard"
              element={
                <ProtectedRoute allowedRoles={['Citizen']}>
                  <CitizenWizard />
                </ProtectedRoute>
              }
            />

            {/* Helper routes */}
            <Route
              path="/helper"
              element={
                <ProtectedRoute allowedRoles={['Helper']}>
                  <HelperDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/helper/complaints/:id"
              element={
                <ProtectedRoute allowedRoles={['Helper']}>
                  <HelperCaseDetail />
                </ProtectedRoute>
              }
            />

            {/* Officer routes */}
            <Route
              path="/officer"
              element={
                <ProtectedRoute allowedRoles={['Officer']}>
                  <OfficerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/officer/complaints/:id"
              element={
                <ProtectedRoute allowedRoles={['Officer']}>
                  <OfficerCaseDetail />
                </ProtectedRoute>
              }
            />

            {/* Admin route (includes read-only Audit & Explainability tab) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            </Route>

            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </DraftSyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
