import { Loader2 } from 'lucide-react';
import { Portal } from './Portal';

interface OperationProgressPopupProps {
  open: boolean;
  title: string;
  detail?: string;
  progress: number;
  processed?: number;
  total?: number;
}

export function OperationProgressPopup({
  open,
  title,
  detail,
  progress,
  processed,
  total,
}: OperationProgressPopupProps) {
  if (!open) return null;

  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const hasCount = typeof processed === 'number' && typeof total === 'number' && total > 0;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[1000000] flex items-center justify-center p-4"
        style={{
          backgroundColor: 'rgba(0,0,0,0.45)',
          WebkitBackdropFilter: 'blur(4px)',
          backdropFilter: 'blur(4px)',
          transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="w-full max-w-[420px] overflow-hidden bg-white dark:bg-slate-800"
          style={{
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)',
            animation: 'modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
          onClick={event => event.stopPropagation()}
        >
          <div className="p-7">
            <div className="mb-4 flex items-start gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 14%, transparent)', color: 'var(--primary-color)' }}
              >
                <Loader2 size={22} className="animate-spin" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-[17px] font-bold leading-snug text-slate-900 dark:text-white">{title}</h3>
                {detail && <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>}
              </div>
            </div>
            <div className="mt-6">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full transition-all duration-150" style={{ width: `${safeProgress}%`, backgroundColor: 'var(--primary-color)' }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>{safeProgress}%</span>
                {hasCount && <span>{processed} / {total}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
