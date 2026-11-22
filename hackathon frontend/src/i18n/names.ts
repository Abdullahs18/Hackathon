import type { Lang } from './I18nContext';

const NAMES: Record<string, { en: string; ur: string }> = {
  cit_tariq_01: { en: 'Tariq Mehmood', ur: 'طارق محمود' },
  hlp_bilal_01: { en: 'Bilal Ahmed', ur: 'بلال احمد' },
  off_nadia_01: { en: 'Nadia Khan', ur: 'نادیہ خان' },
  off_zain_02: { en: 'Zain Raza', ur: 'زین رضا' },
  adm_farhan_01: { en: 'Farhan Siddiqui', ur: 'فرحان صدیقی' },
};

/** Friendly display name for a user id; falls back to the raw id for unknown users. */
export function getFriendlyName(userId: string | undefined, lang: Lang): string {
  if (!userId) return '';
  const hit = NAMES[userId];
  return hit ? hit[lang] : userId;
}
