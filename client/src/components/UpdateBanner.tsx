import { useState, useEffect } from 'react';
import { CheckCircle, Sparkles, X } from 'lucide-react';
import { appLogoFileName, releaseChannelLabel } from '../utils/releaseChannel';

// Bump this version string whenever you deploy new features.
// The popup shows once per version and release channel.
const APP_VERSION = 'Version1.1';
const STORAGE_KEY = `schofy_seen_update_popup_${releaseChannelLabel}_${APP_VERSION}`;
const assetBase = import.meta.env.BASE_URL || '/';
const APP_LOGO = `${assetBase.endsWith('/') ? assetBase : `${assetBase}/`}${appLogoFileName}`;

const CHANGELOG = [
  { text: 'New report card templates with school logo watermark and PDF export.' },
  { text: 'Classes & Timetables now includes colored timetable blocks, full screen editing, room, exam, event, and free-time support.' },
  { text: 'Student profiles now include Subjects, optional OPs, and S5/S6 combinations.' },
  { text: 'Finance adds expenses, profit reporting, payment accounts, invoice improvements, and one-time verification codes.' },
  { text: 'Parents & Emails, Assignments, custom grading, sidebar organization, and assistant read-aloud are now available.' },
  { text: 'Sync, offline queue handling, list performance, imports, searches, filters, and responsive scrolling were improved.' },
];

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, '1');
        setVisible(true);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-backdrop-in">
      <div className="w-full max-w-[min(92vw,34rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-modal-in">
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ backgroundColor: 'var(--primary-color)' }}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/90 p-1.5 shadow-sm ring-1 ring-white/40">
              <img src={APP_LOGO} alt="Schofy" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold leading-tight text-white">Schofy updated to {APP_VERSION}</p>
                <Sparkles size={15} className="text-white/85" />
              </div>
              <p className="mt-0.5 text-xs font-medium text-white/75">{releaseChannelLabel} updates and improvements</p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1.5 text-white transition-colors hover:bg-white/20"
            title="Dismiss"
            aria-label="Dismiss update notes"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {CHANGELOG.map((item) => (
              <div key={item.text} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
                <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button type="button" onClick={dismiss} className="btn btn-primary w-full justify-center">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
