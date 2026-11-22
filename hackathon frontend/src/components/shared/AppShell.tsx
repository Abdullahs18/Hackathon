import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { DropdownMenu } from 'radix-ui';
import { m } from 'motion/react';
import {
  Building2,
  ChevronDown,
  FlaskConical,
  LogOut,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { getHomePathForRole, useAuth } from '@/context/AuthContext';
import { useDraftSync } from '@/context/DraftSyncContext';
import { USE_MOCK } from '@/lib/apiClient';
import { getWorkspaceName } from '@/lib/workspaceMeta';
import { useI18n } from '@/i18n/I18nContext';
import { getFriendlyName } from '@/i18n/names';
import { ConnectionStatusPill } from '@/components/shared/ConnectionStatusPill';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { NotificationsDrawer } from '@/components/shared/NotificationsDrawer';
import { PrototypeBanner } from '@/components/shared/PrototypeBanner';
import { RoleBadge } from '@/components/shared/StatusBadge';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { FadeSlide } from '@/components/motion/presets';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0])[0] ?? '?';
  return (Array.from(parts[0])[0] ?? '') + (Array.from(parts[1])[0] ?? '');
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { simulatedOffline, toggleSimulatedOffline } = useDraftSync();
  const { t, lang, dir } = useI18n();
  const navigate = useNavigate();
  if (!user) return null;

  const name = getFriendlyName(user.user_id, lang);

  return (
    <DropdownMenu.Root dir={dir}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t('header.account')}
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card ps-1 pe-2.5 text-sm font-semibold text-foreground shadow-xs transition-[background-color,border-color,box-shadow] hover:border-primary/40 hover:bg-muted hover:shadow-sm data-[state=open]:bg-muted"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {initials(name)}
          </span>
          <span className="hidden max-w-44 truncate md:inline lg:max-w-52">{name}</span>
          <ChevronDown
            className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[70] w-72 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="space-y-2 px-2 py-2">
            <p className="text-xs text-muted-foreground">{t('header.signedInAs')}</p>
            <p className="text-base font-bold">{name}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <RoleBadge role={user.role} />
              {user.workspace_id && (
                <span className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-900">
                  <Building2 className="h-3 w-3" aria-hidden />
                  {getWorkspaceName(user.workspace_id)}
                </span>
              )}
            </div>
            <p dir="ltr" className="font-mono text-[11px] text-muted-foreground text-start">
              {user.user_id}
            </p>
          </div>

          {USE_MOCK && (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
              <p className="flex items-center gap-1.5 px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                {t('header.demoTools')} · {t('header.mockApi')}
              </p>
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  toggleSimulatedOffline();
                }}
                title={t('conn.demoHint')}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <WifiOff className="h-4 w-4" aria-hidden />
                <span className="flex-1">
                  {simulatedOffline ? t('conn.restoreSignal') : t('conn.dropSignal')}
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${simulatedOffline ? 'bg-destructive' : 'bg-primary'}`}
                  aria-hidden
                />
              </DropdownMenu.Item>
            </>
          )}

          <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => {
              logout();
              navigate('/login');
            }}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium text-destructive outline-none data-[highlighted]:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden />
            {t('header.signOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isOnline } = useDraftSync();
  const { t, lang } = useI18n();
  const location = useLocation();

  const navItems: Array<{ to: string; label: string }> = [];
  if (user?.role === 'Citizen') {
    navItems.push({ to: '/citizen', label: t('nav.myComplaints') });
    navItems.push({ to: '/citizen/new', label: t('nav.reportFraud') });
  } else if (user?.role === 'Helper') {
    navItems.push({ to: '/helper', label: t('nav.helperCases') });
  } else if (user?.role === 'Officer') {
    navItems.push({ to: '/officer', label: t('nav.officerQueue') });
  } else if (user?.role === 'Admin') {
    navItems.push({ to: '/admin', label: t('nav.admin') });
  }

  // Exactly one tab is active: the longest matching route prefix.
  const activeTo = navItems
    .filter(
      (i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/'),
    )
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

  const renderNav = (scope: 'desktop' | 'mobile') =>
    user && navItems.length > 0 ? (
      <nav aria-label={t('nav.main')} className="flex items-center gap-1 rounded-full border border-border/80 bg-muted/85 p-1 shadow-inner">
        {navItems.map((item) => {
          const active = item.to === activeTo;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <m.span
                  layoutId={`nav-pill-${scope}`}
                  className="absolute inset-0 rounded-full bg-primary shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    ) : null;

  return (
    <div className="civic-canvas min-h-screen bg-background text-foreground">
      {/* Banner + header live in one sticky block: banner takes real layout space, nothing can sit under it. */}
      <div className="sticky top-0 z-40">
        <PrototypeBanner />
        <header className="border-b border-border/90 bg-card/95 shadow-[0_8px_24px_-22px_rgb(15_23_42/0.5)] backdrop-blur supports-[backdrop-filter]:bg-card/88">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Link
              to={user ? getHomePathForRole(user.role) : '/login'}
              className="group flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-none"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-white/20 transition-transform duration-200 group-hover:-rotate-2 group-hover:scale-[1.04]">
                <ShieldCheck className="h-5 w-5 transition-transform duration-200 group-hover:scale-105" aria-hidden />
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-bold tracking-tight">
                  {lang === 'ur' ? 'دستک' : 'Dastak'}
                </span>
                <span className="hidden text-[11px] text-muted-foreground sm:block">
                  {t('app.tagline')}
                </span>
              </span>
            </Link>

            <div className="hidden md:block md:ms-3">{renderNav('desktop')}</div>

            <div className="ms-auto flex w-full min-w-0 flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
              {user && <ConnectionStatusPill />}
              <LanguageSwitcher />
              <ThemeToggle />
              {user && (
                <>
                  <NotificationsDrawer />
                  <UserMenu />
                </>
              )}
            </div>
          </div>
          {user && navItems.length > 0 && (
            <div className="mx-auto flex max-w-6xl overflow-x-auto px-4 pb-3 sm:px-6 md:hidden">
              {renderNav('mobile')}
            </div>
          )}
        </header>

        {!isOnline && (
          <div className="border-b border-[#EA580C] bg-[#FFEDD5] px-4 py-2 text-xs font-medium text-[#9A3412]">
            <div className="mx-auto flex max-w-6xl items-center gap-2">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t('conn.weakBanner')}</span>
            </div>
          </div>
        )}
      </div>

      <main className="relative mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <FadeSlide key={location.pathname} className="space-y-7 sm:space-y-8">
          {children}
        </FadeSlide>
        {/* Soft cross-fade when the language flips (no remount, so form state survives) */}
        <m.div
          key={lang}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background"
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </main>
    </div>
  );
}
