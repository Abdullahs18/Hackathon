/** One-tap quick-start presets. Only pre-fill context; the citizen still reviews everything. */
export interface ScamPreset {
  description: string;
  scam_message: string;
  platform: string;
  payment_method: string;
}

export const SCAM_PRESETS: Record<string, ScamPreset> = {
  relief: {
    description: 'مجھے سرکاری امداد کے نام پر جعلی میسج آیا۔ ',
    scam_message: '',
    platform: 'SMS',
    payment_method: '',
  },
  bank: {
    description: 'مجھے بینک / ایزی پیسہ / جاز کیش کی طرف سے جعلی کال آئی اور او ٹی پی مانگا گیا۔ ',
    scam_message: '',
    platform: 'Phone Call',
    payment_method: '',
  },
  link: {
    description: 'مجھے ایک مشکوک لنک والا میسج آیا۔ ',
    scam_message: '',
    platform: 'WhatsApp',
    payment_method: '',
  },
  transfer: {
    description: 'میرے اکاؤنٹ سے دھوکے سے رقم منتقل ہو گئی۔ ',
    scam_message: '',
    platform: 'Other',
    payment_method: '',
  },
};
