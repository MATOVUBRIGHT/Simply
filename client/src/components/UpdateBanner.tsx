import { useState, useEffect } from 'react';
import { CheckCircle, Sparkles, X } from 'lucide-react';
import { appLogoFileName, releaseChannelLabel } from '../utils/releaseChannel';

const APP_VERSION = 'Version 1.1';
const STORAGE_KEY = `schofy_seen_update_items_${releaseChannelLabel}`;
const LEGACY_STORAGE_KEY = `schofy_seen_update_popup_${releaseChannelLabel}_Version1.1`;
const assetBase = import.meta.env.BASE_URL || '/';
const APP_LOGO = `${assetBase.endsWith('/') ? assetBase : `${assetBase}/`}${appLogoFileName}`;

const CHANGELOG = [
  { id: '2026-06-07-unlimited-codes', text: 'Unlimited verification codes were updated from the private verification workbook and now work in the Schofy Unlimited desktop release.' },
  { id: '2026-06-07-staff-plan-limits', text: 'Plan limits now keep students and staff separate, for example Starter allows 100 students and 15 staff.' },
  { id: '2026-06-07-staff-import-exact', text: 'Staff imports now show the exact imported, replaced, and plan-skipped numbers.' },
  { id: '2026-06-07-student-import-exact', text: 'Student imports now report exact accepted and skipped counts when a plan limit is reached.' },
  { id: '2026-06-07-recycle-bulk-restore', text: 'Recycle Bin restores deleted students in bulk while preserving the exact restored records.' },
  { id: '2026-06-07-release-refresh', text: 'Version 1.1 release installers were refreshed in the dated release folder.' },
  { id: '2026-06-06-imports', text: 'Student and staff import previews gained better field detection, custom mapping, draft recovery, and progress feedback.' },
  { id: '2026-06-06-theme', text: 'Themes, loaders, notifications, plan highlights, and page transitions were adjusted to follow the selected app theme.' },
  { id: '2026-06-06-finance', text: 'Invoices and payment methods were improved with a smaller record-payment popup and safer saved payment-method data.' },
  { id: '2026-06-06-access', text: 'Secure access and offline plan checks were improved for first-time online activation and later offline use.' },
  { id: '2026-06-06-dashboard', text: 'Dashboard cards, figures, colors, and search display behavior were refined.' },
  { id: '2026-06-06-records', text: 'Class detection, stream fields, day/boarding fields, profile labels, duplicate cleanup, backup import, and bulk delete/restore flows were improved.' },
  { id: '2026-06-01-v11-core', text: 'Version 1.1 added report card templates, timetable improvements, student profile subjects, finance tools, verification codes, imports, search, sync, and offline performance fixes.' },
];

function readSeenUpdateIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function saveSeenUpdateIds(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
  localStorage.setItem(`${STORAGE_KEY}_last_seen_at`, new Date().toISOString());
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [itemsToShow, setItemsToShow] = useState(CHANGELOG);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const seenIds = readSeenUpdateIds();
      const unseenItems = CHANGELOG.filter(item => !seenIds.has(item.id));
      if (unseenItems.length > 0) {
        setItemsToShow(unseenItems);
        setVisible(true);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    saveSeenUpdateIds(CHANGELOG.map(item => item.id));
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
                <p className="text-base font-bold leading-tight text-white">Schofy updates - {APP_VERSION}</p>
                <Sparkles size={15} className="text-white/85" />
              </div>
              <p className="mt-0.5 text-xs font-medium text-white/75">{itemsToShow.length} new {releaseChannelLabel} change{itemsToShow.length === 1 ? '' : 's'}</p>
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
            {itemsToShow.map((item) => (
              <div key={item.id} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
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
