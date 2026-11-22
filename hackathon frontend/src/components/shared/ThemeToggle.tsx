import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useTheme } from '@/theme/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const dark = theme === 'dark';
  const reduceMotion = useReducedMotion();
  return (
    <m.button
      type="button"
      onClick={toggleTheme}
      whileHover={reduceMotion ? undefined : { rotate: 4, scale: 1.04 }}
      whileTap={reduceMotion ? undefined : { scale: 0.92 }}
      aria-label={dark ? t('theme.toLight') : t('theme.toDark')}
      title={dark ? t('theme.toLight') : t('theme.toDark')}
      className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-card text-foreground shadow-xs transition-[background-color,border-color,box-shadow] hover:border-primary/40 hover:bg-muted hover:shadow-sm"
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={theme}
          initial={reduceMotion ? false : { y: -14, opacity: 0, rotate: -60 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={reduceMotion ? undefined : { y: 14, opacity: 0, rotate: 60 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          className="inline-flex"
        >
          {dark ? (
            <Sun className="h-5 w-5 text-[#fbbf24]" aria-hidden />
          ) : (
            <Moon className="h-5 w-5" aria-hidden />
          )}
        </m.span>
      </AnimatePresence>
    </m.button>
  );
}
