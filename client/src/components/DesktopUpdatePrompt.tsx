import { useEffect, useMemo, useState } from 'react';
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
  const manifestUrl = import.meta.env.VITE_DESKTOP_UPDATE_MANIFEST_URL as string | undefined;
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
        if (!manifest.required && localStorage.getItem(dismissedKey) === '1') return;

        if (!isNewerVersion(manifest.version, currentVersion)) return;

        if (!cancelled) {
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
    const result = await window.electronAPI?.openExternal?.(update.downloadUrl);
    if (!result?.success) {
      window.open(update.downloadUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-emerald-200 bg-white p-4 shadow-xl shadow-slate-900/15 dark:border-emerald-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Desktop update available</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Version {update.latestVersion} is ready. You are using {update.currentVersion}.
              </p>
            </div>
            {!update.required && (
              <button
                type="button"
                onClick={dismiss}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Dismiss desktop update"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {update.notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
              {update.notes.map((note) => (
                <li key={note} className="truncate">- {note}</li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Your local data and sync queue stay safe during reinstall.</span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={installUpdate}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={checking}
            >
              <Download className="h-4 w-4" />
              Update now
            </button>
            {!update.required && (
              <button
                type="button"
                onClick={dismiss}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Later
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
