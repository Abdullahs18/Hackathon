import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { m } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Mic,
  RotateCcw,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { PrototypeBanner } from '@/components/shared/PrototypeBanner';
import { RoleBadge } from '@/components/shared/StatusBadge';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { FadeSlide, staggerChild, staggerParent } from '@/components/motion/presets';
import { getHomePathForRole, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import type { TranslationKey } from '@/i18n/en';
import { getFriendlyName } from '@/i18n/names';
import {
  API_BASE_URL,
  isDastakApiError,
  resetDemoState,
  USE_MOCK,
} from '@/lib/apiClient';
import { DEMO_ACCOUNTS } from '@/lib/workspaceMeta';
import { SecurityCursor } from '@/pages/landing/SecurityCursor';

export function LoginPage() {
  const { user, login, authNotice, clearAuthNotice } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const rtl = lang === 'ur';

  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const performLogin = async (id: string, pass: string) => {
    setSubmitting(true);
    setError(null);
    clearAuthNotice();
    try {
      const user = await login(id, pass);
      navigate(getHomePathForRole(user.role), { replace: true });
    } catch (err) {
      setError(isDastakApiError(err) ? err.detail : t('login.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void performLogin(userId.trim(), password);
  };

  const trustPoints = [
    { icon: ShieldCheck, text: t('login.trust1') },
    { icon: Mic, text: t('login.trust2') },
    { icon: Wifi, text: t('login.trust3') },
  ];

  return (
    <div className="civic-canvas min-h-screen bg-background text-foreground">
      <SecurityCursor />
      <PrototypeBanner />

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            aria-label={rtl ? 'دستک ہوم' : 'Dastak home'}
            className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md ring-1 ring-white/20 transition-transform motion-safe:group-hover:-rotate-2">
              <ShieldCheck className="h-6 w-6 shrink-0" aria-hidden />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-2xl font-bold tracking-tight">
                {rtl ? 'دستک' : 'Dastak'}
              </span>
              <span className="hidden max-w-48 text-xs text-muted-foreground xl:block">
                {t('app.taglineLogin')}
              </span>
            </span>
          </Link>

          <div className="ms-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
                <span>{rtl ? 'ہوم پیج' : 'Back to Home'}</span>
              </Link>
            </Button>
            {user && (
              <Button asChild size="sm" className="hidden gap-1.5 sm:inline-flex">
                <Link to={getHomePathForRole(user.role)}>
                  <span>{rtl ? 'ڈیش بورڈ کھولیں' : 'Open Workspace'}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
                </Link>
              </Button>
            )}
            <LanguageSwitcher idSuffix="login" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">

        <FadeSlide className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Main citizen sign-in */}
          <div className="space-y-4 lg:col-span-5">
            <Card className="overflow-hidden border-border shadow-sm">
              <div className="relative isolate overflow-hidden bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] px-5 py-6 text-white sm:px-6">
                <span className="pointer-events-none absolute -end-8 -top-12 h-36 w-36 rounded-full border border-white/15 bg-white/[0.06]" aria-hidden />
                <span className="pointer-events-none absolute -bottom-14 end-16 h-28 w-28 rounded-full border border-white/10" aria-hidden />
                <div className="relative">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20">
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">{t('login.title')}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/85">{t('login.subtitle')}</p>
                </div>
              </div>
              <CardContent className="space-y-4 pt-5">
                {authNotice && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    <AlertTitle>{t('login.sessionNotice')}</AlertTitle>
                    <AlertDescription>{authNotice}</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    <AlertTitle>{t('login.errorTitle')}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-user-id">{t('login.userId')}</Label>
                    <Input
                      id="login-user-id"
                      dir="ltr"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder={t('login.userIdPh')}
                      autoComplete="username"
                      required
                      className="min-h-12 font-mono text-start"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">{t('login.password')}</Label>
                    <Input
                      id="login-password"
                      dir="ltr"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('login.passwordPh')}
                      autoComplete="current-password"
                      required
                      className="min-h-12 text-start"
                    />
                  </div>
                  <m.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      type="submit"
                      disabled={submitting || !userId.trim() || !password}
                      className="min-h-12 w-full text-base font-semibold"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          {t('login.signingIn')}
                        </>
                      ) : (
                        t('login.signIn')
                      )}
                    </Button>
                  </m.div>
                </form>

                <ul className="space-y-2 rounded-xl border border-border/70 bg-muted/55 p-3.5 text-xs text-muted-foreground">
                  {trustPoints.map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t('login.privacy')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('login.connMode')}:{' '}
                  <span dir="ltr" className="font-mono">
                    {USE_MOCK ? t('login.connMock') : API_BASE_URL}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Demo accounts: clearly separated from real sign-in */}
          <div className="lg:col-span-7">
            {USE_MOCK ? (
              <Card className="h-full border-dashed border-primary/40 bg-primary/[0.04] shadow-none">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FlaskConical className="h-5 w-5 text-primary" aria-hidden />
                      <span>{t('login.demoTitle')}</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{t('login.demoDesc')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetDemoState();
                      setResetDone(true);
                    }}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    <span>{t('login.demoReset')}</span>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resetDone && (
                    <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      <AlertDescription className="text-xs font-medium">
                        {t('login.demoResetDone')}
                      </AlertDescription>
                    </Alert>
                  )}
                  <m.div
                    className="grid gap-2.5 sm:grid-cols-2"
                    variants={staggerParent}
                    initial="hidden"
                    animate="show"
                  >
                    {DEMO_ACCOUNTS.map((acct) => (
                      <m.button
                        key={acct.user_id}
                        type="button"
                        variants={staggerChild}
                        whileHover={{ y: -3, boxShadow: '0 10px 24px -12px rgb(0 0 0 / 0.35)' }}
                        whileTap={{ scale: 0.98 }}
                        disabled={submitting}
                        onClick={() => void performLogin(acct.user_id, acct.password)}
                        className="group flex min-h-24 w-full flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-4 text-start shadow-xs transition-[border-color,box-shadow,background-color] hover:border-primary/70 hover:bg-accent/30 disabled:opacity-50"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold">
                            {getFriendlyName(acct.user_id, lang)}
                          </span>
                          <RoleBadge role={acct.role} />
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(`demo.${acct.user_id}.sub` as TranslationKey)}
                        </span>
                        <span className="mt-auto flex items-center gap-1.5 text-[11px] font-bold text-primary">
                          <span>{t('login.demoTap')}</span>
                          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
                        </span>
                      </m.button>
                    ))}
                  </m.div>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex h-full flex-col justify-between border-border bg-card/95 shadow-sm">
                <CardHeader className="space-y-2 pb-4">
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                    <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <span>{t('header.liveApi')}</span>
                  </div>
                  <CardTitle className="text-xl tracking-tight">{t('login.liveTitle')}</CardTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t('login.liveDesc', { url: API_BASE_URL })}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {(['Citizen', 'Helper', 'Officer', 'Admin'] as const).map((role) => (
                      <div key={role} className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/35 p-3">
                        <RoleBadge role={role} />
                        <span className="text-xs font-medium text-foreground">{t(`role.${role}`)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="leading-relaxed">{t('login.liveRoles')}</p>
                  <p className="rounded-xl border border-border/70 bg-muted/40 p-3.5 text-xs leading-relaxed">
                    {t('login.liveSim')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </FadeSlide>
      </main>
    </div>
  );
}
