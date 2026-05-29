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
import { appIconFileName, isUnlockedRelease } from './utils/releaseChannel';
import './index.css';

const queryClient = getQueryClient();
const isFileProtocol = window.location.protocol === 'file:';
const AppRouter = isFileProtocol ? HashRouter : BrowserRouter;
const assetBase = import.meta.env.BASE_URL || '/';
const publicAssetPath = (fileName: string) => `${assetBase.endsWith('/') ? assetBase : `${assetBase}/`}${fileName}`;

if (isUnlockedRelease) {
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
    link.href = publicAssetPath(appIconFileName);
  });
}

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

// Register service worker for offline support in production only.
if (import.meta.env.PROD && !isFileProtocol && 'serviceWorker' in navigator) {
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
            '/parents', '/parent-emails', '/classes/timetable', '/subjects',
            '/homework-tests', '/attendance', '/day-boarding', '/finance',
            '/payment-accounts', '/expenses', '/invoices',
            '/grades', '/exam-marks', '/transport', '/announcements',
            '/notifications', '/settings', '/reports', '/plans',
            '/recycle-bin', '/roles', '/about',
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
            '/favicon-unlocked.png',
            '/icon-192.png',
            '/icon-192-unlocked.png',
            '/icon-512.png',
            '/icon-512-unlocked.png',
            '/cover.jpg',
            '/schofy.logo.png',
            '/Schofy.logo_unlocked.png',
            '/chat icon.png',
            '/chat%20icon.png',
            '/schofy-assistant-icon.png',
            '/sound/success.mp3',
            '/sound/error.wav',
            '/sounds/success.mp3',
            '/sounds/error.wav',
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

const buttonScrollSelector = [
  '.button-scroll',
  '.button-scroll-both',
  '.button-scroll-y',
  '.toolbar-scroll',
  '.action-row',
  '.filter-row',
  '.page-actions',
  '[data-button-scroll]',
].join(',');

const clampScrollDelta = (delta: number) => Math.max(-90, Math.min(90, delta * 0.85));

window.addEventListener('wheel', (event) => {
  if (event.ctrlKey || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  const scroller = target.closest<HTMLElement>(buttonScrollSelector);
  if (!scroller) return;

  const canScrollX = scroller.scrollWidth > scroller.clientWidth + 2;
  const canScrollY = scroller.scrollHeight > scroller.clientHeight + 2;
  if (!canScrollX && !canScrollY) return;

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

  if (canScrollX && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    const before = scroller.scrollLeft;
    scroller.scrollLeft += clampScrollDelta(delta);
    if (scroller.scrollLeft !== before) event.preventDefault();
    return;
  }

  if (canScrollY && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    const before = scroller.scrollTop;
    scroller.scrollTop += clampScrollDelta(event.deltaX);
    if (scroller.scrollTop !== before) event.preventDefault();
  }
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
