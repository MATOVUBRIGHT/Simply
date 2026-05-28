import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, ShieldCheck, X } from 'lucide-react';

type UpdateManifest = {
  version: string;
  downloadUrl: string;
  notes?: string[];
  required?: boolean;
};

type UpdateState = {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  notes: string[];
  required: boolean;
};

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = 'schofy_desktop_update_check';
const DISMISS_PREFIX = 'schofy_desktop_update_dismissed_';
const SHOWN_PREFIX = 'schofy_desktop_update_shown_';
const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/MATOVUBRIGHT/Simply/main/desktop/update-manifest.json';

function normalizeVersion(version: string): number[] {
  return version
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part.replace(/\D.*/, ''), 10) || 0);
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = normalizeVersion(latest);
  const currentParts = normalizeVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const latestPart = latestParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

async function loadManifest(): Promise<UpdateManifest | null> {
  const manifestUrl =
    (import.meta.env.VITE_DESKTOP_UPDATE_MANIFEST_URL as string | undefined) || DEFAULT_MANIFEST_URL;
  const fallbackVersion = import.meta.env.VITE_DESKTOP_LATEST_VERSION as string | undefined;
  const fallbackDownloadUrl = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined;

  if (manifestUrl) {
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Update manifest returned ${response.status}`);
    return response.json() as Promise<UpdateManifest>;
  }

  if (fallbackVersion && fallbackDownloadUrl) {
    return {
      version: fallbackVersion,
      downloadUrl: fallbackDownloadUrl,
      notes: ['Desktop update available'],
      required: false,
    };
  }

  return null;
}

function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI?.getAppVersion === 'function';
}

export default function DesktopUpdatePrompt() {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const visible = useMemo(() => Boolean(update && !dismissed), [update, dismissed]);

  useEffect(() => {
    if (!isDesktopApp()) return;

    let cancelled = false;

    const checkForUpdate = async (force = false) => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!force && cached) {
          const parsed = JSON.parse(cached) as { checkedAt: number };
          if (Date.now() - parsed.checkedAt < CHECK_INTERVAL_MS) return;
        }

        setChecking(true);
        const [currentVersion, manifest] = await Promise.all([
          window.electronAPI?.getAppVersion?.(),
          loadManifest(),
        ]);

        localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now() }));

        if (!currentVersion || !manifest?.version || !manifest.downloadUrl) return;

        const dismissedKey = `${DISMISS_PREFIX}${manifest.version}`;
        const shownKey = `${SHOWN_PREFIX}${manifest.version}`;
        if (!manifest.required && (localStorage.getItem(dismissedKey) === '1' || localStorage.getItem(shownKey) === '1')) return;

        if (!isNewerVersion(manifest.version, currentVersion)) return;

        if (!cancelled) {
          if (!manifest.required) localStorage.setItem(shownKey, '1');
          setUpdate({
            currentVersion,
            latestVersion: manifest.version,
            downloadUrl: manifest.downloadUrl,
            notes: manifest.notes?.slice(0, 3) ?? [],
            required: Boolean(manifest.required),
          });
        }
      } catch (error) {
        console.warn('[desktop-update] Update check failed:', error);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    const initialTimer = window.setTimeout(() => checkForUpdate(), 2000);
    const interval = window.setInterval(() => checkForUpdate(), CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, []);

  if (!visible || !update) return null;

  const dismiss = () => {
    if (!update.required) {
      localStorage.setItem(`${DISMISS_PREFIX}${update.latestVersion}`, '1');
    }
    setDismissed(true);
  };

  const installUpdate = async () => {
    localStorage.setItem(`${DISMISS_PREFIX}${update.latestVersion}`, '1');
    setDismissed(true);
    const result = await window.electronAPI?.openExternal?.(update.downloadUrl);
    if (!result?.success) {
      window.open(update.downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm print:hidden"
      onClick={() => {
        if (!update.required) dismiss();
      }}
    >
      <div className="modal-card popup-card-centered w-full max-w-md" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between bg-emerald-600 px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black">Desktop update available</h2>
              <p className="mt-0.5 text-xs font-medium text-emerald-50">
                Version {update.latestVersion} is ready
              </p>
            </div>
          </div>
          {!update.required && (
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Dismiss desktop update"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="modal-body p-5">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            You are using version <span className="font-bold text-slate-900 dark:text-white">{update.currentVersion}</span>. Install the new Schofy desktop release to get the latest fixes and features.
          </p>

          {update.notes.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="mb-2 text-xs font-black uppercase text-slate-500 dark:text-slate-400">What changed</p>
              <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
                {update.notes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="min-w-0 break-words">{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Your local data and sync queue stay safe during reinstall.</span>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!update.required && (
              <button
                type="button"
                onClick={dismiss}
                className="btn btn-secondary justify-center"
              >
                Later
              </button>
            )}
            <button
              type="button"
              onClick={installUpdate}
              className="btn btn-primary justify-center bg-emerald-600 hover:bg-emerald-700"
              disabled={checking}
            >
              <Download className="h-4 w-4" />
              {checking ? 'Checking...' : 'Update now'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
