import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AdminApp from './admin/AdminApp';
import { AuthProvider } from './contexts/AuthContext';
import { StaffAuthProvider } from './contexts/StaffAuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { SyncProvider } from './contexts/SyncContext';
import { getQueryClient } from './lib/queryClient';
import { ConfirmProvider } from './components/ConfirmModal';
import { isCloudSyncEnabled } from './utils/desktopSyncPreference';
import './index.css';

const queryClient = getQueryClient();
const isFileProtocol = window.location.protocol === 'file:';
const AppRouter = isFileProtocol ? HashRouter : BrowserRouter;

// Detect if we're on the admin portal path
const isAdminPath = isFileProtocol
  ? window.location.hash.startsWith('#/admin')
  : window.location.pathname.startsWith('/admin');

// Keep the Vite dev server free from stale service-worker caches.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then(registrations => registrations.forEach(registration => registration.unregister()))
    .catch(() => {/* ignore */});
}

// Register service worker for offline support in production only (main app only).
if (import.meta.env.PROD && !isFileProtocol && !isAdminPath && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Check for updates every 30 minutes
        setInterval(() => reg.update(), 30 * 60 * 1000);

        // After SW is active, tell it to cache the app shell, public assets,
        // built chunks, and main routes so the web app opens offline.
        navigator.serviceWorker.ready.then(sw => {
          const appRoutes = [
            '/', '/students', '/admission', '/staff', '/classes',
            '/subjects', '/attendance', '/day-boarding', '/finance', '/invoices',
            '/grades', '/exam-marks', '/transport', '/announcements',
            '/notifications', '/settings', '/reports', '/plans',
            '/recycle-bin', '/about',
          ];
          const documentAssets = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLScriptElement | HTMLImageElement>(
            'link[href], script[src], img[src]'
          ))
            .map(el => ('href' in el ? el.href : el.src))
            .filter(Boolean);
          const loadedAssets = performance.getEntriesByType('resource')
            .map(entry => entry.name)
            .filter(name => {
              try {
                return new URL(name).origin === window.location.origin;
              } catch {
                return false;
              }
            });
          const publicAssets = [
            '/manifest.json',
            '/favicon.png',
            '/icon-192.png',
            '/icon-512.png',
            '/cover.jpg',
            '/schofy.logo.png',
            '/schofy-assistant-icon.png',
            '/sound/success.mp3',
            '/sound/error.wav',
          ];
          sw.active?.postMessage({
            type: 'CACHE_APP_SHELL',
            urls: Array.from(new Set([...appRoutes, ...publicAssets, ...documentAssets, ...loadedAssets])),
          });
        });
      })
      .catch(() => {/* SW not supported or blocked */});
  });
}

// Flush offline queue when connection is restored
window.addEventListener('online', () => {
  if (!isCloudSyncEnabled()) return;
  import('./lib/database/SupabaseDataService').then(({ dataService }) => {
    void (dataService as any).flushOfflineQueue?.();
  });
});

// Smoothly hand wheel scrolling from focused/nested panels to the next
// scrollable parent so long lists never trap the page at their edges.
function isScrollableVertically(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  return /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
}

function findScrollableFrom(start: Element | null) {
  let el = start instanceof HTMLElement ? start : start?.parentElement || null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (isScrollableVertically(el)) return el;
    el = el.parentElement;
  }
  return null;
}

window.addEventListener('wheel', (event) => {
  if (event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  const target = event.target as Element | null;
  const active = document.activeElement instanceof Element ? document.activeElement : null;
  const start = active && active !== document.body && active !== document.documentElement
    && (active.contains(target) || target?.contains(active))
    ? active
    : target;

  let remainingDelta = event.deltaY;
  let scrollTarget = findScrollableFrom(start);
  let didScroll = false;

  while (scrollTarget && Math.abs(remainingDelta) > 0.5) {
    const maxTop = scrollTarget.scrollHeight - scrollTarget.clientHeight;
    const available = remainingDelta > 0 ? maxTop - scrollTarget.scrollTop : scrollTarget.scrollTop;
    if (available > 0) {
      const step = Math.sign(remainingDelta) * Math.min(Math.abs(remainingDelta), available);
      scrollTarget.scrollTop += step;
      remainingDelta -= step;
      didScroll = true;
    }
    if (Math.abs(remainingDelta) <= 0.5) break;
    scrollTarget = findScrollableFrom(scrollTarget.parentElement);
  }

  if (Math.abs(remainingDelta) > 0.5) {
    window.scrollBy({ top: remainingDelta, behavior: 'auto' });
    didScroll = true;
  }
  if (didScroll) event.preventDefault();
}, { passive: false });

// Bootstrap cache into store BEFORE React renders (main app only)
if (!isAdminPath) {
  import('./lib/ServiceManager').then(({ serviceManager }) => {
    const session = localStorage.getItem('schofy_session');
    if (session) {
      try {
        const user = JSON.parse(session);
        if (isCloudSyncEnabled() && !user.localOnly) {
          serviceManager.initialize(user.id, user.schoolId || user.id);
        }
      } catch { /* ignore */ }
    }
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
if (isAdminPath) {
  // Admin portal — minimal providers, no school auth
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <AppRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminApp />
    </AppRouter>
  );
} else {
  // Main school app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
      <AppRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <StaffAuthProvider>
                <ConfirmProvider>
                  <SyncProvider>
                    <App />
                  </SyncProvider>
                </ConfirmProvider>
              </StaffAuthProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </AppRouter>
    </QueryClientProvider>
  );
}
