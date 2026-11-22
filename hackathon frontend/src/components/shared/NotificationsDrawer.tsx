import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Dialog } from 'radix-ui';
import { AnimatePresence, m } from 'motion/react';
import { Bell, Check, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { dastakApi, isDastakApiError } from '@/lib/apiClient';
import { formatShortTime } from '@/lib/apiError';
import { useI18n } from '@/i18n/I18nContext';
import { staggerChild, staggerParent } from '@/components/motion/presets';
import type { NotificationRecord, Role } from '@/types/dastak';

function getCaseRoute(role: Role, complaintId: string): string {
  switch (role) {
    case 'Citizen':
      return `/citizen/complaints/${encodeURIComponent(complaintId)}`;
    case 'Helper':
      return `/helper/complaints/${encodeURIComponent(complaintId)}`;
    case 'Officer':
      return `/officer/complaints/${encodeURIComponent(complaintId)}`;
    case 'Admin':
      return `/admin?tab=audit&complaint=${encodeURIComponent(complaintId)}`;
  }
}

export function NotificationsDrawer() {
  const { user } = useAuth();
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await dastakApi.listNotifications());
    } catch (err) {
      setError(isDastakApiError(err) ? err.detail : t('notif.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (open) void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      const updated = await dastakApi.readNotification(id);
      setItems((prev) => prev.map((n) => (n.notification_id === id ? updated : n)));
    } catch (err) {
      setError(isDastakApiError(err) ? err.detail : t('notif.errRead'));
    } finally {
      setMarkingId(null);
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;
  // Slide in from the inline-end edge (right in English, left in Urdu)
  const offscreen = dir === 'rtl' ? '-100%' : '100%';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <m.button
          type="button"
          whileTap={{ scale: 0.92 }}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
          aria-label={t('notif.ariaUnread', { count: unreadCount })}
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unreadCount > 0 && (
            <m.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              key={unreadCount}
              className="absolute -top-1 -end-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-bold text-destructive-foreground"
            >
              {unreadCount}
            </m.span>
          )}
        </m.button>
      </Dialog.Trigger>

      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-[70] bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <m.aside
                dir={dir}
                className="fixed inset-y-0 end-0 z-[70] flex w-full flex-col border-s border-border bg-background shadow-2xl outline-none sm:max-w-md"
                initial={{ x: offscreen }}
                animate={{ x: 0 }}
                exit={{ x: offscreen }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              >
                <div className="flex items-start gap-2 border-b border-border p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Dialog.Title className="flex items-center gap-2 text-lg font-bold">
                      <Bell className="h-5 w-5 text-primary" aria-hidden />
                      {t('notif.title')}
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                          {t('notif.unread', { count: unreadCount })}
                        </span>
                      )}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-muted-foreground">
                      {t('notif.desc')}
                    </Dialog.Description>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void loadNotifications()}
                    disabled={loading}
                    aria-label={t('notif.refresh')}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                      aria-hidden
                    />
                  </Button>
                  <Dialog.Close asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.close')}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </Dialog.Close>
                </div>

                {error && (
                  <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-4">
                  {loading && items.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t('notif.loading')}</span>
                    </div>
                  ) : items.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      {t('notif.empty')}
                    </div>
                  ) : (
                    <m.ul
                      className="space-y-3"
                      variants={staggerParent}
                      initial="hidden"
                      animate="show"
                    >
                      {items.map((item) => (
                        <m.li
                          key={item.notification_id}
                          variants={staggerChild}
                          className={`rounded-xl border p-3.5 ${
                            item.read
                              ? 'border-border bg-card'
                              : 'border-primary/40 bg-primary/10'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              dir="ltr"
                              className="font-mono text-xs font-semibold text-primary"
                            >
                              {item.complaint_id}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {formatShortTime(item.timestamp)}
                            </span>
                          </div>
                          <p dir="auto" className="mt-1.5 text-sm text-foreground">
                            {item.message}
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            {user && (
                              <Link
                                to={getCaseRoute(user.role, item.complaint_id)}
                                onClick={() => setOpen(false)}
                                className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
                              >
                                <span>{t('notif.open')}</span>
                                <ExternalLink className="h-3 w-3 rtl:-scale-x-100" aria-hidden />
                              </Link>
                            )}
                            {!item.read ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 gap-1 text-xs"
                                disabled={markingId === item.notification_id}
                                onClick={() => void handleMarkRead(item.notification_id)}
                              >
                                <Check className="h-3 w-3" aria-hidden />
                                <span>{t('notif.markRead')}</span>
                              </Button>
                            ) : (
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {t('notif.read')}
                              </span>
                            )}
                          </div>
                        </m.li>
                      ))}
                    </m.ul>
                  )}
                </div>
              </m.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
