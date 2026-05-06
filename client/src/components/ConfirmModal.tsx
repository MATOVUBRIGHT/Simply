/**
 * Global full-page confirm modal — blurs entire page, centered.
 * Modern SaaS design: soft icon, clean typography, smooth animation.
 * Usage: const confirm = useConfirm(); await confirm({ title, description, confirmLabel, variant });
 */
import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Portal } from './Portal';
import { AlertTriangle, Trash2 as TrashIcon, Info, CheckCircle, X } from 'lucide-react';
// Build: 2026-05-07

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (v: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [visible, setVisible] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setPending({ ...opts, resolve });
      // Slight delay so the animation triggers after mount
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  function handleConfirm() {
    setVisible(false);
    setTimeout(() => { pending?.resolve(true); setPending(null); }, 180);
  }

  function handleCancel() {
    setVisible(false);
    setTimeout(() => { pending?.resolve(false); setPending(null); }, 180);
  }

  // ESC key closes modal
  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [pending]);

  const variant = pending?.variant ?? 'warning';

  const iconConfig = {
    danger: {
      icon: <TrashIcon size={20} className="text-red-600" />,
      bg: 'bg-red-100 dark:bg-red-900/30',
      btn: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-red-200 dark:shadow-red-900/30',
    },
    warning: {
      icon: <AlertTriangle size={20} className="text-amber-600" />,
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      btn: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-amber-200 dark:shadow-amber-900/30',
    },
    info: {
      icon: <Info size={20} className="text-blue-600" />,
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      btn: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-200 dark:shadow-blue-900/30',
    },
    success: {
      icon: <CheckCircle size={20} className="text-emerald-600" />,
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      btn: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-200 dark:shadow-emerald-900/30',
    },
  };

  const cfg = iconConfig[variant];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Portal>
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{
              backgroundColor: visible ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
              backdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
              transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
            }}
            onClick={handleCancel}
          >
            <div
              className="bg-white dark:bg-slate-800 w-full max-w-[420px] overflow-hidden"
              style={{
                borderRadius: '20px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
                border: '1px solid rgba(0,0,0,0.06)',
                transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(16px)',
                opacity: visible ? 1 : 0,
                transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="p-7">
                {/* Icon + Title */}
                <div className="flex items-start gap-4 mb-4">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="font-bold text-slate-900 dark:text-white text-[17px] leading-snug">
                      {pending.title}
                    </h3>
                    <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      {pending.description}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    onClick={handleCancel}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: '#F3F4F6' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#E5E7EB')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#F3F4F6')}
                  >
                    {pending.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    onClick={handleConfirm}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] ${cfg.btn}`}
                  >
                    {pending.confirmLabel ?? 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </ConfirmContext.Provider>
  );
}
