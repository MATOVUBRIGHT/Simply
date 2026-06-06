import { BookOpen, CheckCircle2, LockKeyhole, Mail, MessageCircle, Phone, ScrollText, ShieldCheck, WifiOff } from 'lucide-react';
import { appLogoFileName } from '../utils/releaseChannel';

function publicAssetPath(fileName: string) {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${fileName}`;
}

const APP_LOGO = publicAssetPath(appLogoFileName);
const APP_VERSION = 'Version 1.1';

const appHighlights = [
  'Student, staff, attendance, grades, finance, invoices, reports, and settings stay available for daily work.',
  'Schools can work offline first, then sync approved records when online access is enabled.',
  'Plan verification, local access control, backups, exports, and printable documents are built into the workflow.',
  'The app is shaped for administrators, accountants, and teachers who need records to open quickly and stay organized.',
];

const privacyPoints = [
  'Schofy stores school information, student records, parent contacts, staff details, attendance, grades, finance records, invoices, expenses, reports, settings, and uploaded school logos only to support school management features.',
  'When cloud sync is enabled, records may be sent to the configured online database so the same school account can access matching data on approved devices.',
  'When working offline or in desktop mode, records may be cached locally on the device so the app can continue without internet.',
  'Payment verification uses plan, amount, status, and verification metadata to confirm access. Users should not share private verification codes publicly.',
  'Schofy does not sell school, student, parent, staff, or finance data. Access should be limited to authorized school users only.',
  'Schools remain responsible for entering accurate data, protecting device access, controlling staff permissions, and following local privacy laws for learners and guardians.',
];

const termsPoints = [
  'Users must use Schofy for lawful school administration and must not attempt to bypass plan verification, payment controls, roles, permissions, or security checks.',
  'Each school is responsible for the accuracy of its own records, reports, balances, invoices, grades, attendance, and communication details.',
  'Plan access may require internet for first-time verification. Offline use depends on a previously verified plan and valid local device cache.',
  'Payment requests, renewals, trials, and upgrades may require admin approval before access changes appear in the app.',
  'Users should keep backups of important records and confirm printed or exported documents before official use.',
  'Schofy may improve features, security, sync behavior, plan rules, and desktop releases over time. Continued use means the school accepts those updates.',
  'Misuse, forged access, unauthorized account sharing, harmful uploads, or attempts to damage the system may lead to suspended access.',
];

const supportItems = [
  { icon: MessageCircle, title: 'WhatsApp support', text: 'Send payment, setup, sync, or access questions to Schofy support for guidance.' },
  { icon: Phone, title: 'Phone support', text: 'Use the school support contact shared with your installation or payment instructions.' },
  { icon: Mail, title: 'Email and records', text: 'Use parent and student email tools for school communication, then keep copies where needed.' },
  { icon: BookOpen, title: 'In-app guidance', text: 'Use Settings shortcuts, Schofy support, and page actions to find common workflows quickly.' },
];

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-lg border bg-white p-5 shadow-sm dark:bg-slate-800" style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 18%, #e2e8f0)' }}>
      <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--primary-color)' }}>{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

function AnchorLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-lg border bg-white/90 px-4 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:-translate-y-0.5 dark:bg-slate-900/80 dark:text-white"
      style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 22%, #e2e8f0)' }}
    >
      {children}
    </a>
  );
}

export default function About() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <section
        className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-900"
        style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 24%, #e2e8f0)' }}
      >
        <div className="h-2" style={{ backgroundColor: 'var(--primary-color)' }} />
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_300px] lg:items-center">
          <div className="flex min-w-0 gap-5">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-950"
              style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 24%, #e2e8f0)' }}
            >
              <img src={APP_LOGO} alt="Schofy app logo" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg px-3 py-1 text-xs font-black uppercase text-white" style={{ backgroundColor: 'var(--primary-color)' }}>
                  Schofy
                </span>
                <span className="rounded-lg px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--primary-color-50)', color: 'var(--primary-color-700)' }}>
                  {APP_VERSION}
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white">About Schofy</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Schofy is an offline-first school management system for keeping daily school records organized, printable, and ready to sync when online access is enabled.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <AnchorLink href="#privacy">Privacy Policy</AnchorLink>
            <AnchorLink href="#terms">Terms of Use</AnchorLink>
            <AnchorLink href="#support">Help & Support</AnchorLink>
          </div>
        </div>
      </section>

      <Section eyebrow="App Information" title="What Schofy Helps Schools Do">
        <div className="grid gap-3 md:grid-cols-2">
          {appHighlights.map(item => (
            <div key={item} className="flex gap-3 rounded-lg p-3" style={{ backgroundColor: 'var(--primary-color-50)' }}>
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--primary-color)' }} />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="privacy" eyebrow="Privacy Policy" title="How School Data Is Handled">
        <div className="mb-4 flex items-start gap-3 rounded-lg p-3" style={{ backgroundColor: 'var(--primary-color-50)', color: 'var(--primary-color-800)' }}>
          <LockKeyhole size={20} className="mt-0.5 shrink-0" />
          <p className="font-semibold">Schofy is designed to keep school data useful to the school, protected from casual access, and available offline when needed.</p>
        </div>
        <ul className="space-y-3">
          {privacyPoints.map(point => (
            <li key={point} className="flex gap-3">
              <ShieldCheck size={17} className="mt-1 shrink-0" style={{ color: 'var(--primary-color)' }} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="terms" eyebrow="Terms of Use" title="Rules for Using Schofy">
        <div className="mb-4 flex items-start gap-3 rounded-lg p-3 theme-note">
          <ScrollText size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--primary-color)' }} />
          <p className="font-semibold text-slate-700 dark:text-slate-200">Using Schofy means the school agrees to manage records responsibly, respect access controls, and use verified plans properly.</p>
        </div>
        <ul className="space-y-3">
          {termsPoints.map(point => (
            <li key={point} className="flex gap-3">
              <CheckCircle2 size={17} className="mt-1 shrink-0" style={{ color: 'var(--primary-color)' }} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="support" eyebrow="Help & Support" title="Where to Get Help">
        <div className="grid gap-3 md:grid-cols-2">
          {supportItems.map(item => (
            <div key={item.title} className="rounded-lg border p-4 dark:border-slate-700" style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 16%, #e2e8f0)' }}>
              <div className="mb-2 flex items-center gap-2">
                <item.icon size={18} style={{ color: 'var(--primary-color)' }} />
                <h3 className="font-black text-slate-900 dark:text-white">{item.title}</h3>
              </div>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/60">
          <WifiOff size={20} className="mt-0.5 shrink-0 text-slate-500" />
          <p>For offline access issues, connect to internet first, open Plans, submit payment through WhatsApp, then enter the one-time verification code after approval.</p>
        </div>
      </Section>

      <footer className="rounded-lg border bg-white p-5 text-center shadow-sm dark:bg-slate-800" style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 18%, #e2e8f0)' }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-900" style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 24%, #e2e8f0)' }}>
          <img src={APP_LOGO} alt="Schofy app logo" className="h-full w-full object-cover" />
        </div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Powered by <span className="font-black" style={{ color: 'var(--primary-color)' }}>Schofy</span> - School Management System
        </p>
      </footer>
    </div>
  );
}
