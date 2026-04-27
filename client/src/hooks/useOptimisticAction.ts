import { useRef, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * Wraps an async action with:
 * - Submit guard (blocks double-clicks)
 * - Instant optimistic toast
 * - Rollback on failure
 */
export function useOptimisticAction() {
  const { addToast } = useToast();
  const inFlight = useRef(false);

  const run = useCallback(async <T>(opts: {
    optimistic?: () => void;       // update UI immediately
    action: () => Promise<{ success: boolean; error?: string } | void>;
    successMsg: string;
    errorMsg?: string;
    rollback?: () => void;         // revert UI on failure
  }): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;

    // 1. Update UI + show toast immediately
    opts.optimistic?.();
    addToast(opts.successMsg, 'success');

    try {
      const result = await opts.action();
      if (result && !result.success) {
        addToast(opts.errorMsg || result.error || 'Something went wrong', 'error');
        opts.rollback?.();
        return false;
      }
      return true;
    } catch (err: any) {
      addToast(opts.errorMsg || err?.message || 'Something went wrong', 'error');
      opts.rollback?.();
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [addToast]);

  return { run };
}
