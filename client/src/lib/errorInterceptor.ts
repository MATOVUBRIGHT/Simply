/**
 * Global error interceptor — catches unhandled promise rejections and
 * window errors, then shows a clean toast instead of a raw crash.
 *
 * Call `initErrorInterceptor(addToast)` once at app startup.
 */

type AddToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;

// Messages that are noisy but harmless — suppress entirely
const SUPPRESS_PATTERNS = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection/i,
  /Loading chunk/i,
  /ChunkLoadError/i,
  /NetworkError/i,
  /Failed to fetch/i,
  /Load failed/i,
  /AbortError/i,
  /The operation was aborted/i,
  /Script error/i,
  /cross-origin/i,
  /supabase.*rate limit/i,
  /JWT expired/i,
];

// Messages that should show as a warning (not error)
const WARNING_PATTERNS = [
  /offline/i,
  /network/i,
  /timeout/i,
  /connection/i,
];

function classify(msg: string): 'suppress' | 'warning' | 'error' {
  if (SUPPRESS_PATTERNS.some(p => p.test(msg))) return 'suppress';
  if (WARNING_PATTERNS.some(p => p.test(msg))) return 'warning';
  return 'error';
}

function friendlyMessage(raw: string): string {
  if (/offline|network|connection/i.test(raw)) return 'You appear to be offline. Changes are saved locally.';
  if (/timeout/i.test(raw)) return 'Request timed out. Will retry when online.';
  if (/permission|unauthorized|403/i.test(raw)) return 'Permission denied. Please check your access.';
  if (/not found|404/i.test(raw)) return 'Resource not found.';
  if (/storage|quota/i.test(raw)) return 'Storage is full. Some data may not be saved.';
  return 'Something went wrong. Please try again.';
}

let _addToast: AddToast | null = null;
let _installed = false;

export function initErrorInterceptor(addToast: AddToast) {
  _addToast = addToast;
  if (_installed) return;
  _installed = true;

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event.reason?.message || event.reason || '');
    const level = classify(msg);
    if (level === 'suppress') { event.preventDefault(); return; }
    event.preventDefault(); // prevent console error
    if (_addToast) {
      _addToast(friendlyMessage(msg), level === 'warning' ? 'warning' : 'error');
    }
  });

  // Uncaught synchronous errors (rare in React apps but possible)
  window.addEventListener('error', (event) => {
    const msg = String(event.message || '');
    const level = classify(msg);
    if (level === 'suppress') { event.preventDefault(); return; }
    // Don't intercept script load errors (they have no message)
    if (!msg || msg === 'Script error.') return;
    event.preventDefault();
    if (_addToast) {
      _addToast(friendlyMessage(msg), level === 'warning' ? 'warning' : 'error');
    }
  });

  // Patch console.error to suppress noisy Supabase / React internals in production
  if (!import.meta.env.DEV) {
    const _origError = console.error.bind(console);
    console.error = (...args: any[]) => {
      const msg = args.map(a => String(a?.message || a || '')).join(' ');
      if (SUPPRESS_PATTERNS.some(p => p.test(msg))) return;
      _origError(...args);
    };
  }
}
