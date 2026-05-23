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
import './index.css';

if (window.electronAPI) {
  document.documentElement.classList.add('electron-titlebar');
}

const queryClient = getQueryClient();
const isFileProtocol = window.location.protocol === 'file:';
const AppRouter = isFileProtocol ? HashRouter : BrowserRouter;

// Detect if we're on the admin portal path
const isAdminPath = isFileProtocol
  ? window.location.hash.startsWith('#/admin')
  : window.location.pathname.startsWith('/admin');

// Register service worker for offline support (main app only)
if (!isFileProtocol && !isAdminPath && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Check for updates every 30 minutes
        setInterval(() => reg.update(), 30 * 60 * 1000);

        // After SW is active, tell it to cache all app routes
        navigator.serviceWorker.ready.then(sw => {
          const appRoutes = [
            '/', '/students', '/admission', '/staff', '/classes',
            '/subjects', '/attendance', '/day-boarding', '/finance', '/invoices',
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
  import('./lib/ServiceManager').then(({ serviceManager }) => {
    const session = localStorage.getItem('schofy_session');
    if (session) {
      try {
        const user = JSON.parse(session);
        serviceManager.initialize(user.id, user.schoolId || user.id);
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
