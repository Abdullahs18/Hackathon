import { Link } from 'react-router';
import { m, useReducedMotion } from 'motion/react';
import {
  CheckCircle2,
  FileCheck2,
  Languages,
  LockKeyhole,
  LogIn,
  MessageSquareWarning,
  Mic,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { PrototypeBanner } from '@/components/shared/PrototypeBanner';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { getHomePathForRole, useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { getFriendlyName } from '@/i18n/names';
import { SecurityCursor } from './SecurityCursor';
import { HeroParallax, LandingAction, SpotlightCard } from './PointerEffects';

const copy = {
  en: {
    navAbout: 'How it works',
    navSafety: 'Your safety',
    signIn: 'Open Dastak',
    eyebrow: 'Simple help for online fraud',
    title: 'Got a suspicious message or lost money online?',
    titleAccent: 'Dastak helps you take the next step.',
    intro:
      'Tell us what happened in your own words. Dastak helps you organize the details, understand your options, and prepare a report—without sending anything before you approve it.',
    start: 'Start with Dastak',
    seeHow: 'See how it works',
    helper: 'Speak in Urdu or type. Your progress is saved on weak internet.',
    imageAlt:
      'Animated Dastak shield showing a suspicious message becoming a protected report',
    imageBadge: 'Made for everyday people',
    problemTitle: 'Online fraud can feel confusing. Getting help should not.',
    problemText:
      'Fake relief messages, suspicious calls, phishing links, and wallet transfers often leave people unsure about what to save, who to tell, or what happens next.',
    stepsEyebrow: 'Three clear steps',
    stepsTitle: 'You tell the story. Dastak helps make it actionable.',
    step1Title: 'Speak or type',
    step1Text:
      'Explain what happened in simple Urdu or English. You do not need technical words.',
    step2Title: 'Check the details',
    step2Text:
      'Dastak organizes dates, payments, messages, and evidence into a clear summary you can correct.',
    step3Title: 'You decide',
    step3Text:
      'Review who may receive the report and approve it yourself. Nothing is submitted silently.',
    trustEyebrow: 'Built around your control',
    trustTitle: 'Your story stays yours until you choose to share it.',
    trust1: 'Nothing is sent without clear approval',
    trust2: 'You can see what information will be shared',
    trust3: 'Drafts are saved when the connection drops',
    trust4: 'Demo services never claim to prove fraud',
    voiceTitle: 'Comfortable in Urdu?',
    voiceText:
      'Use voice guidance, listen to summaries, and answer one simple question at a time.',
    offlineTitle: 'Weak internet?',
    offlineText:
      'Continue safely with local draft saving and clear online or offline status.',
    ctaTitle: 'You do not have to figure it out alone.',
    ctaText:
      'Open Dastak and use the guided demo to understand how a report can be prepared safely.',
    ctaButton: 'Open the guided service',
    disclaimer:
      'Dastak is a hackathon prototype with simulated services. It is not an official government portal. Never enter real personal, banking, or identity information.',
  },
  ur: {
    navAbout: 'یہ کیسے کام کرتا ہے',
    navSafety: 'آپ کی حفاظت',
    signIn: 'دستک کھولیں',
    eyebrow: 'آن لائن فراڈ میں آسان رہنمائی',
    title: 'مشکوک پیغام آیا یا آن لائن رقم کا نقصان ہوا؟',
    titleAccent: 'دستک آپ کو اگلا قدم سمجھاتی ہے۔',
    intro:
      'اپنی زبان میں بتائیں کہ کیا ہوا۔ دستک تفصیل ترتیب دینے، راستہ سمجھنے اور رپورٹ تیار کرنے میں مدد دیتی ہے—آپ کی اجازت کے بغیر کچھ بھی نہیں بھیجا جاتا۔',
    start: 'دستک کے ساتھ شروع کریں',
    seeHow: 'طریقہ دیکھیں',
    helper: 'اردو میں بولیں یا لکھیں۔ کمزور انٹرنیٹ پر بھی کام محفوظ رہتا ہے۔',
    imageAlt: 'دستک کی متحرک حفاظتی شیلڈ جو مشکوک پیغام کو محفوظ رپورٹ میں بدلتے دکھاتی ہے',
    imageBadge: 'عام لوگوں کے لیے بنایا گیا',
    problemTitle: 'آن لائن فراڈ الجھا سکتا ہے۔ مدد حاصل کرنا مشکل نہیں ہونا چاہیے۔',
    problemText:
      'جعلی امدادی پیغامات، مشکوک کالیں، فشنگ لنکس اور موبائل والیٹ ٹرانسفر کے بعد اکثر سمجھ نہیں آتی کہ کیا محفوظ کریں، کس کو بتائیں اور آگے کیا ہوگا۔',
    stepsEyebrow: 'صرف تین واضح قدم',
    stepsTitle: 'آپ واقعہ بتائیں، دستک اسے قابلِ عمل بناتی ہے۔',
    step1Title: 'بولیں یا لکھیں',
    step1Text: 'سادہ اردو یا انگریزی میں بتائیں کہ کیا ہوا۔ مشکل یا تکنیکی الفاظ ضروری نہیں۔',
    step2Title: 'تفصیل چیک کریں',
    step2Text:
      'دستک تاریخ، ادائیگی، پیغامات اور ثبوت کو واضح خلاصے میں ترتیب دیتی ہے جسے آپ درست کر سکتے ہیں۔',
    step3Title: 'فیصلہ آپ کا',
    step3Text:
      'دیکھیں رپورٹ کس کے ساتھ شیئر ہوگی اور خود اجازت دیں۔ کوئی چیز خاموشی سے جمع نہیں ہوتی۔',
    trustEyebrow: 'اختیار آپ کے پاس',
    trustTitle: 'جب تک آپ نہ چاہیں، آپ کی بات آپ ہی کے پاس رہتی ہے۔',
    trust1: 'واضح اجازت کے بغیر کچھ نہیں بھیجا جاتا',
    trust2: 'آپ دیکھ سکتے ہیں کون سی معلومات شیئر ہوں گی',
    trust3: 'انٹرنیٹ بند ہو تو مسودہ محفوظ رہتا ہے',
    trust4: 'ڈیمو سروس کبھی فراڈ ثابت کرنے کا دعویٰ نہیں کرتی',
    voiceTitle: 'اردو میں آسانی محسوس کرتے ہیں؟',
    voiceText: 'آواز کے ذریعے رہنمائی لیں، خلاصہ سنیں اور ایک وقت میں ایک آسان سوال کا جواب دیں۔',
    offlineTitle: 'انٹرنیٹ کمزور ہے؟',
    offlineText: 'مقامی مسودہ محفوظ رہتا ہے اور آن لائن یا آف لائن حالت واضح نظر آتی ہے۔',
    ctaTitle: 'آپ کو یہ سب اکیلے سمجھنے کی ضرورت نہیں۔',
    ctaText: 'دستک کا رہنمائی والا ڈیمو کھولیں اور محفوظ طریقے سے رپورٹ تیار کرنے کا طریقہ دیکھیں۔',
    ctaButton: 'رہنمائی والی سروس کھولیں',
    disclaimer:
      'دستک ایک ہیکاتھون پروٹوٹائپ ہے جس میں فرضی سروسز ہیں۔ یہ سرکاری پورٹل نہیں۔ حقیقی ذاتی، بینک یا شناختی معلومات درج نہ کریں۔',
  },
} as const;

export function PublicHomePage() {
  const { lang, t } = useI18n();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const c = copy[lang];
  const rtl = lang === 'ur';
  const primaryTarget = user ? getHomePathForRole(user.role) : '/login';
  const activeUserName = user ? getFriendlyName(user.user_id, lang) : null;

  const steps = [
    { icon: Mic, title: c.step1Title, text: c.step1Text },
    { icon: FileCheck2, title: c.step2Title, text: c.step2Text },
    { icon: ShieldCheck, title: c.step3Title, text: c.step3Text },
  ];

  const trustPoints = [c.trust1, c.trust2, c.trust3, c.trust4];

  const reveal = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="civic-canvas min-h-screen overflow-hidden bg-background text-foreground">
      <SecurityCursor />
      <PrototypeBanner />

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label={rtl ? 'دستک ہوم' : 'Dastak home'} className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
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

          <nav className="ms-auto hidden items-center gap-6 md:flex" aria-label="Public navigation">
            <a href="#how" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
              {c.navAbout}
            </a>
            <a href="#safety" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
              {c.navSafety}
            </a>
          </nav>

          <div className="ms-auto flex items-center gap-2 md:ms-4">
            <LanguageSwitcher idSuffix="home" />
            <ThemeToggle />
            {user ? (
              <>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/login">
                    <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{rtl ? 'لاگ اِن پیج' : 'Login Page'}</span>
                  </Link>
                </Button>
                <LandingAction to={primaryTarget} className="hidden sm:inline-flex">
                  {rtl ? `${activeUserName} کا ڈیش بورڈ` : `Continue as ${activeUserName}`}
                </LandingAction>
              </>
            ) : (
              <LandingAction to="/login">{c.signIn}</LandingAction>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_32rem)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8 lg:py-20">
            <m.div
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } } }}
              className="max-w-2xl"
            >
              <m.div variants={reveal} transition={{ duration: 0.45 }}>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                  <MessageSquareWarning className="h-4 w-4" aria-hidden />
                  {c.eyebrow}
                </span>
              </m.div>
              <m.h1
                variants={reveal}
                transition={{ duration: 0.5 }}
                className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl"
              >
                {c.title}{' '}
                <span className="text-primary">{c.titleAccent}</span>
              </m.h1>
              <m.p
                variants={reveal}
                transition={{ duration: 0.5 }}
                className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8"
              >
                {c.intro}
              </m.p>
              <m.div
                variants={reveal}
                transition={{ duration: 0.5 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
              >
                <LandingAction to={primaryTarget} large className="min-h-13">
                  {user
                    ? rtl
                      ? 'اپنے ڈیش بورڈ پر جائیں'
                      : 'Go to Workspace'
                    : c.start}
                </LandingAction>
                {user && (
                  <Button asChild size="lg" variant="secondary" className="min-h-13 gap-2">
                    <Link to="/login">
                      <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{rtl ? 'لاگ اِن پیج پر واپس' : 'Back to Login Page'}</span>
                    </Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline" className="min-h-13">
                  <a href="#how">{c.seeHow}</a>
                </Button>
              </m.div>
              <m.p
                variants={reveal}
                transition={{ duration: 0.5 }}
                className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {c.helper}
              </m.p>
            </m.div>

            <m.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, x: rtl ? -24 : 24 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.12 }}
              className="relative mx-auto w-full max-w-xl"
            >
              <HeroParallax>
              <div className="absolute -inset-5 rounded-[2.2rem] bg-primary/10 blur-2xl" aria-hidden />
              <div
                role="img"
                aria-label={c.imageAlt}
                className="relative aspect-[4/3] overflow-hidden rounded-[2rem] border border-border bg-[linear-gradient(145deg,color-mix(in_srgb,var(--card)_92%,var(--primary)),var(--card))] p-2 shadow-[0_30px_80px_-38px_rgb(15_81_50/0.55)]"
              >
                <div
                  className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle,color-mix(in_srgb,var(--primary)_28%,transparent)_1px,transparent_1px)] [background-size:22px_22px]"
                  aria-hidden
                />
                <div className="absolute inset-8 rounded-full bg-primary/10 blur-3xl" aria-hidden />

                <m.div
                  aria-hidden
                  className="absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-primary/25"
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{ duration: 22, ease: 'linear', repeat: Infinity }}
                >
                  <span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_0_6px_color-mix(in_srgb,var(--primary)_12%,transparent)]" />
                  <span className="absolute -bottom-1 left-[18%] h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_0_5px_rgb(251_191_36/0.12)]" />
                </m.div>

                <m.div
                  className="absolute left-[6%] top-[16%] z-10 w-[40%] rounded-2xl border border-amber-300/70 bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:p-4"
                  initial={false}
                  animate={
                    reduceMotion
                      ? undefined
                      : { y: [0, -7, 0], rotate: [-3, -1.5, -3] }
                  }
                  transition={{ duration: 4.2, ease: 'easeInOut', repeat: Infinity }}
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-800">
                    <MessageSquareWarning className="h-4 w-4 shrink-0" aria-hidden />
                    {rtl ? 'مشکوک پیغام' : 'Suspicious message'}
                  </span>
                  <span className="mt-3 block h-2 w-full rounded-full bg-muted" />
                  <span className="mt-1.5 block h-2 w-3/4 rounded-full bg-muted" />
                </m.div>

                <m.div
                  className="absolute bottom-[17%] right-[5%] z-10 w-[42%] rounded-2xl border border-primary/30 bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:p-4"
                  initial={false}
                  animate={
                    reduceMotion
                      ? undefined
                      : { y: [0, 7, 0], rotate: [3, 1.5, 3] }
                  }
                  transition={{
                    duration: 4.6,
                    ease: 'easeInOut',
                    repeat: Infinity,
                    delay: 0.25,
                  }}
                >
                  <span className="flex items-center gap-2 text-xs font-bold text-primary">
                    <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden />
                    {rtl ? 'رپورٹ تیار ہے' : 'Report prepared'}
                  </span>
                  <span className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {rtl ? 'آپ کی منظوری ضروری ہے' : 'Waiting for your approval'}
                  </span>
                </m.div>

                <m.div
                  className="absolute left-1/2 top-1/2 z-20 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2.25rem] bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] text-white shadow-[0_22px_55px_-20px_rgb(15_81_50/0.8)] ring-8 ring-primary/10 sm:h-40 sm:w-40"
                  initial={false}
                  animate={
                    reduceMotion
                      ? undefined
                      : { y: [0, -7, 0], scale: [1, 1.025, 1] }
                  }
                  transition={{ duration: 3.8, ease: 'easeInOut', repeat: Infinity }}
                >
                  <m.span
                    className="absolute inset-0 rounded-[2.25rem] border border-white/20"
                    animate={reduceMotion ? undefined : { opacity: [0.25, 0.8, 0.25] }}
                    transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
                  />
                  <ShieldCheck className="h-16 w-16 drop-shadow-md sm:h-20 sm:w-20" aria-hidden />
                  <span className="absolute -bottom-3 flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-[10px] font-extrabold whitespace-nowrap text-foreground shadow-md ring-1 ring-border">
                    <LockKeyhole className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {rtl ? 'اختیار آپ کا' : 'You stay in control'}
                  </span>
                </m.div>

                <div className="absolute inset-x-5 bottom-5 flex items-center gap-3 rounded-2xl border border-white/50 bg-background/90 p-3 shadow-lg backdrop-blur-md dark:border-white/10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">{c.imageBadge}</span>
                    <span className="block text-xs text-muted-foreground">
                      {rtl ? 'سادہ زبان، واضح قدم' : 'Simple language, clear next steps'}
                    </span>
                  </span>
                </div>
              </div>
              </HeroParallax>
            </m.div>
          </div>
        </section>

        <section className="border-y border-border/80 bg-card/70">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-8 sm:px-6 md:grid-cols-[0.8fr_1.2fr] md:items-center lg:px-8">
            <h2 className="text-xl leading-snug font-extrabold tracking-tight sm:text-2xl">
              {c.problemTitle}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground sm:text-base">{c.problemText}</p>
          </div>
        </section>

        <section id="how" className="scroll-mt-28 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
                {c.stepsEyebrow}
              </p>
              <h2 className="mt-3 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                {c.stepsTitle}
              </h2>
            </div>

            <m.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              variants={{ show: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } } }}
              className="mt-10 grid gap-4 md:grid-cols-3"
            >
              {steps.map(({ icon: Icon, title, text }, index) => (
                <m.article
                  key={title}
                  variants={reveal}
                  transition={{ duration: 0.4 }}
                  className="min-w-0"
                >
                  <SpotlightCard>
                  <span className="absolute end-4 top-3 text-5xl font-black text-primary/[0.06]">
                    0{index + 1}
                  </span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-lg font-extrabold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </SpotlightCard>
                </m.article>
              ))}
            </m.div>
          </div>
        </section>

        <section id="safety" className="scroll-mt-28 pb-16 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-3xl border border-border bg-[linear-gradient(135deg,var(--card),color-mix(in_srgb,var(--primary)_8%,var(--card)))] shadow-xl">
              <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
                <div className="p-6 sm:p-9 lg:p-12">
                  <p className="text-xs font-extrabold tracking-[0.18em] text-primary uppercase">
                    {c.trustEyebrow}
                  </p>
                  <h2 className="mt-3 max-w-xl text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                    {c.trustTitle}
                  </h2>
                  <ul className="mt-7 grid gap-3">
                    {trustPoints.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm leading-6">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-1 lg:border-s">
                  <div className="bg-card p-6 sm:p-8">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-950 dark:bg-blue-100">
                      <Languages className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-extrabold">{c.voiceTitle}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.voiceText}</p>
                  </div>
                  <div className="bg-card p-6 sm:p-8">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-950 dark:bg-amber-100">
                      <WifiOff className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-extrabold">{c.offlineTitle}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.offlineText}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] px-6 py-10 text-center text-white shadow-2xl sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute -start-16 -top-20 h-56 w-56 rounded-full border border-white/10 bg-white/[0.04]" />
            <div className="pointer-events-none absolute -end-16 -bottom-24 h-64 w-64 rounded-full border border-white/10" />
            <div className="relative mx-auto max-w-2xl">
              <LockKeyhole className="mx-auto h-8 w-8 text-emerald-200" aria-hidden />
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{c.ctaTitle}</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/80 sm:text-base">{c.ctaText}</p>
              <LandingAction
                to={primaryTarget}
                large
                className="mt-7 bg-[#ffffff] font-bold text-[#0f5132] shadow-lg hover:bg-[#ecfdf5] dark:bg-[#46d9a0] dark:text-[#05261b] dark:ring-2 dark:ring-white/20 dark:hover:bg-[#6ee7b7]"
              >
                {c.ctaButton}
              </LandingAction>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div className="flex items-center gap-2 font-extrabold">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md ring-1 ring-white/20">
              <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
            </span>
            {rtl ? 'دستک' : 'Dastak'}
          </div>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground md:ms-auto md:text-end">
            {c.disclaimer}
          </p>
        </div>
      </footer>
    </div>
  );
}
