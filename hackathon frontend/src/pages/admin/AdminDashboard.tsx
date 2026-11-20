import { useSearchParams } from 'react-router';
import { m } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminApiKeysTab } from '@/components/admin/AdminApiKeysTab';
import { AdminAuditTab } from '@/components/admin/AdminAuditTab';
import { AdminRoutingRulesTab } from '@/components/admin/AdminRoutingRulesTab';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { FadeSlide } from '@/components/motion/presets';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { getFriendlyName } from '@/i18n/names';
import type { TranslationKey } from '@/i18n/en';

const TABS: Array<{ value: 'rules' | 'audit' | 'users' | 'keys'; label: TranslationKey }> = [
  { value: 'rules', label: 'admin.tab.rules' },
  { value: 'audit', label: 'admin.tab.audit' },
  { value: 'users', label: 'admin.tab.users' },
  { value: 'keys', label: 'admin.tab.keys' },
];

export function AdminDashboard() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') || 'rules';
  const initialComplaint = searchParams.get('complaint');

  const activeTab =
    initialTab === 'audit' ||
    initialTab === 'users' ||
    initialTab === 'keys' ||
    initialTab === 'rules'
      ? initialTab
      : 'rules';

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('admin.title')}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('admin.signedAs', { name: getFriendlyName(user?.user_id, lang) })} {t('admin.desc')}
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          const params = new URLSearchParams(searchParams);
          params.set('tab', next);
          setSearchParams(params, { replace: true });
        }}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1 sm:grid-cols-4">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="relative min-h-11 rounded-lg text-xs data-[state=active]:bg-transparent data-[state=active]:text-primary-foreground data-[state=active]:shadow-none sm:text-sm dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-primary-foreground"
            >
              {activeTab === tab.value && (
                <m.span
                  layoutId="admin-tab-pill"
                  aria-hidden
                  className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                />
              )}
              <span className="relative">{t(tab.label)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="rules">
          <FadeSlide>
            <AdminRoutingRulesTab />
          </FadeSlide>
        </TabsContent>

        <TabsContent value="audit">
          <FadeSlide>
            <AdminAuditTab initialComplaintId={initialComplaint} />
          </FadeSlide>
        </TabsContent>

        <TabsContent value="users">
          <FadeSlide>
            <AdminUsersTab />
          </FadeSlide>
        </TabsContent>

        <TabsContent value="keys">
          <FadeSlide>
            <AdminApiKeysTab />
          </FadeSlide>
        </TabsContent>
      </Tabs>
    </div>
  );
}
