import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AdminApp from './admin/AdminApp';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { SyncProvider } from './contexts/SyncContext';
import { getQueryClient } from './lib/queryClient';
import { ConfirmProvider } from './components/ConfirmModal';
import './index.css';

const queryClient = getQueryClient();

// Detect if we're on the admin portal path
const isAdminPath = window.location.pathname.startsWith('/admin');

// Register service worker for offline support (main app only)
if (!isAdminPath && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Check for updates every 30 minutes
        setInterval(() => reg.update(), 30 * 60 * 1000);

        // After SW is active, tell it to cache all app routes
        navigator.serviceWorker.ready.then(sw => {
          const appRoutes = [
            '/', '/students', '/admission', '/staff', '/classes',
            '/subjects', '/attendance', '/finance', '/invoices',
            '/grades', '/exam-marks', '/transport', '/announcements',
            '/notifications', '/settings', '/reports', '/plans',
            '/recycle-bin', '/about',
          ];
          sw.active?.postMessage({ type: 'CACHE_URLS', urls: appRoutes });
        });
      })
      .catch(() => {/* SW not supported or blocked */});
  });
}

// Flush offline queue when connection is restored
window.addEventListener('online', () => {
  import('./lib/database/SupabaseDataService').then(({ dataService }) => {
    void (dataService as any).flushOfflineQueue?.();
  });
});

// Bootstrap cache into store BEFORE React renders (main app only)
if (!isAdminPath) {
  import('./lib/database/SupabaseDataService').then(({ dataService, cacheReady }) => {
    const session = localStorage.getItem('schofy_session');
    if (session) {
      try {
        const user = JSON.parse(session);
        const sid = user.schoolId || user.id;
        if (sid) {
          cacheReady.then(() => dataService.bootstrapSession(user.id, sid));
        }
      } catch { /* ignore */ }
    }
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
if (isAdminPath) {
  // Admin portal — minimal providers, no school auth
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminApp />
    </BrowserRouter>
  );
} else {
  // Main school app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <ConfirmProvider>
                <SyncProvider>
                  <App />
                </SyncProvider>
              </ConfirmProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
