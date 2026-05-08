/**
 * StorageWarning — shows a dismissible banner when device storage is > 80% full.
 * Listens for the 'schofy:storage-warning' custom event fired by StorageManager.
 */
import { useState, useEffect } from 'react';
import { HardDrive, X } from 'lucide-react';

interface StorageDetail {
  usedMB: number;
  quotaMB: number;
  percentUsed: number;
  isPersisted: boolean;
  message: string;
}

export default function StorageWarning() {
  const [detail, setDetail] = useState<StorageDetail | null>(null);

  useEffect(() => {
    function handleWarning(e: Event) {
      setDetail((e as CustomEvent<StorageDetail>).detail);
    }
    window.addEventListener('schofy:storage-warning', handleWarning);
    return () => window.removeEventListener('schofy:storage-warning', handleWarning);
  }, []);

  if (!detail) return null;

  const isCritical = detail.percentUsed >= 95;

  return (
    <div className="fixed top-20 right-4 z-[9997] w-80 animate-slide-up">
      <div className={`rounded-2xl shadow-xl border overflow-hidden ${
        isCritical
          ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'
      }`}>
        <div className="flex items-start gap-3 p-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isCritical ? 'bg-red-100 dark:bg-red-900/50' : 'bg-amber-100 dark:bg-amber-900/50'
          }`}>
            <HardDrive size={18} className={isCritical ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${isCritical ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}`}>
              {isCritical ? 'Storage Almost Full' : 'Storage Warning'}
            </p>
            <p className={`text-xs mt-0.5 ${isCritical ? 'text-red-600 dark:text-red-300' : 'text-amber-600 dark:text-amber-300'}`}>
              {detail.usedMB}MB used of {detail.quotaMB}MB ({detail.percentUsed}%)
            </p>
            {!detail.isPersisted && (
              <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">
                Data may be cleared by the browser. Connect to sync with the cloud.
              </p>
            )}
            {/* Storage bar */}
            <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isCritical ? 'bg-red-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(detail.percentUsed, 100)}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => setDetail(null)}
            className="p-1 hover:bg-black/10 rounded-lg transition-colors shrink-0"
          >
            <X size={14} className="text-slate-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
