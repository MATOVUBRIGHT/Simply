import { lazy, useEffect, useState, Suspense, useMemo, useRef, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { StudentsProvider } from './contexts/StudentsContext';
import { RealtimeSyncProvider } from './realtime/RealtimeSync';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import UpdateBanner from './components/UpdateBanner';
import DesktopUpdatePrompt from './components/DesktopUpdatePrompt';
import StorageWarning from './components/StorageWarning';
import SubscriptionGate from './components/SubscriptionGate';
import { StaffRoleGate } from './components/StaffRoleGate';
import { useStaffAuth } from './contexts/StaffAuthContext';
import { useToast } from './contexts/ToastContext';
import { useSync } from './contexts/SyncContext';
import { initErrorInterceptor } from './lib/errorInterceptor';
import { supabaseAnonKey, supabaseUrl } from './lib/supabase';
import { useConfirm } from './components/ConfirmModal';

// Lazy load pages for performance
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const Parents = lazy(() => import('./pages/Parents'));
const ParentEmails = lazy(() => import('./pages/ParentEmails'));
const StudentForm = lazy(() => import('./pages/StudentForm'));
const Admission = lazy(() => import('./pages/Admission'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Staff = lazy(() => import('./pages/Staff'));
const StaffForm = lazy(() => import('./pages/StaffForm'));
const StaffProfile = lazy(() => import('./pages/StaffProfile'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Classes = lazy(() => import('./pages/Classes'));
const ClassDetail = lazy(() => import('./pages/ClassDetail'));
const Timetable = lazy(() => import('./pages/Timetable'));
const Subjects = lazy(() => import('./pages/Subjects'));
const HomeworkTests = lazy(() => import('./pages/HomeworkTests'));
const Attendance = lazy(() => import('./pages/Attendance'));
const DayBoarding = lazy(() => import('./pages/DayBoarding'));
const Finance = lazy(() => import('./pages/Finance'));
const PaymentAccounts = lazy(() => import('./pages/PaymentAccounts'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Transport = lazy(() => import('./pages/Transport'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const About = lazy(() => import('./pages/About'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Grades = lazy(() => import('./pages/Grades'));
const ExamMarks = lazy(() => import('./pages/ExamMarks'));
const CustomGrading = lazy(() => import('./pages/CustomGrading'));
const ReportCard = lazy(() => import('./pages/ReportCard'));
const Plans = lazy(() => import('./pages/Plans'));
const RecycleBin = lazy(() => import('./pages/RecycleBin'));
const Roles = lazy(() => import('./pages/Roles'));

const offlinePageWarmers = [
  () => import('./pages/Dashboard'),
  () => import('./pages/Students'),
  () => import('./pages/Parents'),
  () => import('./pages/ParentEmails'),
  () => import('./pages/StudentForm'),
  () => import('./pages/Admission'),
  () => import('./pages/StudentProfile'),
  () => import('./pages/Staff'),
  () => import('./pages/StaffForm'),
  () => import('./pages/StaffProfile'),
  () => import('./pages/Payroll'),
  () => import('./pages/Classes'),
  () => import('./pages/ClassDetail'),
  () => import('./pages/Timetable'),
  () => import('./pages/Subjects'),
  () => import('./pages/HomeworkTests'),
  () => import('./pages/Attendance'),
  () => import('./pages/DayBoarding'),
  () => import('./pages/Finance'),
  () => import('./pages/PaymentAccounts'),
  () => import('./pages/Expenses'),
  () => import('./pages/Invoices'),
  () => import('./pages/Grades'),
  () => import('./pages/CustomGrading'),
  () => import('./pages/ExamMarks'),
  () => import('./pages/ReportCard'),
  () => import('./pages/Transport'),
  () => import('./pages/Announcements'),
  () => import('./pages/Notifications'),
  () => import('./pages/Reports'),
  () => import('./pages/Settings'),
  () => import('./pages/Plans'),
  () => import('./pages/RecycleBin'),
  () => import('./pages/Roles'),
  () => import('./pages/About'),
  () => import('./pages/NotFound'),
];

const STAFF_ADMIN_ONLY_PATHS = ['/plans', '/subscribe'];
const ROUTE_LABELS: Array<[string, string]> = [
  ['/plans', 'Plans & Billing'],
  ['/subscribe', 'Plans & Billing'],
  ['/students', 'Students'],
  ['/parents', 'Parents & Emails'],
  ['/parent-emails', 'Parent Emails'],
  ['/admission', 'Admission'],
  ['/staff', 'Teachers & Staff'],
  ['/teachers', 'Teachers & Staff'],
  ['/payroll', 'Payroll'],
  ['/classes', 'Classes & Timetables'],
  ['/subjects', 'Subjects'],
  ['/homework-tests', 'Assignments & Tests'],
  ['/attendance', 'Attendance'],
  ['/day-boarding', 'Day & Boarding'],
  ['/finance', 'Fees & Finance'],
  ['/payment-accounts', 'Payment Accounts'],
  ['/expenses', 'Expenses'],
  ['/invoices', 'Invoices'],
  ['/grades', 'Exams & Grades'],
  ['/exam-marks', 'Exam Marks'],
  ['/report-card', 'Report Card'],
  ['/transport', 'Transport'],
  ['/announcements', 'Announcements'],
  ['/notifications', 'Notifications'],
  ['/settings', 'Settings'],
  ['/recycle-bin', 'Recycle Bin'],
  ['/reports', 'Reports'],
  ['/about', 'About App'],
  ['/roles', 'Roles'],
];

function getRouteLabel(pathname: string) {
  const match = ROUTE_LABELS
    .filter(([path]) => pathname === path || pathname.startsWith(path + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (match) return match[1];
  return pathname
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(part => part.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase()))
    .join(' / ') || 'Dashboard';
}

function FullScreenLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent animate-spin" style={{ borderTopColor: 'var(--primary-color)' }} />
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function PageLoadingSpinner({ label = 'Loading page...' }: { label?: string }) {
  return (
    <div className="page-shell page-shell-enter">
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white/80 p-8 dark:border-slate-700 dark:bg-slate-900/70">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-transparent dark:border-slate-700" style={{ borderTopColor: 'var(--primary-color)' }} />
          <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function DesktopTitleBar() {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.electronAPI);
  if (!isDesktop) return null;
  const control = (action: 'minimize' | 'maximize' | 'close') => {
    void window.electronAPI?.windowControl?.(action);
  };
  return (
    <div className="desktop-titlebar">
      <div className="desktop-titlebar-brand">
        <img src="/schofy.logo.png" alt="" className="desktop-titlebar-logo" />
        <span>Schofy - School Management System</span>
      </div>
      <div className="desktop-titlebar-controls">
        <button type="button" onClick={() => control('minimize')} aria-label="Minimize">-</button>
        <button type="button" onClick={() => control('maximize')} aria-label="Maximize">□</button>
        <button type="button" onClick={() => control('close')} aria-label="Close">×</button>
      </div>
    </div>
  );
}

function MainApp() {
  const { user, loading } = useAuth();
  const { canAccessPage, isStaffMode } = useStaffAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const restrictedPathRef = useRef('');
  const restrictedPageNameRef = useRef('this page');
  const lastAllowedPathRef = useRef('/');
  const pendingRestrictedNoticeRef = useRef(false);

  // Wire global error interceptor
  useEffect(() => {
    initErrorInterceptor(addToast);
  }, [addToast]);

  useEffect(() => {
    const onPlanLimitBlocked = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; skipped?: number; table?: string }>).detail;
      const fallback = detail?.skipped
        ? `${detail.skipped.toLocaleString()} ${detail.table || 'record'} record${detail.skipped === 1 ? '' : 's'} skipped because the plan limit is reached.`
        : 'Plan limit reached. Upgrade your plan to continue.';
      addToast(detail?.message || fallback, 'error');
    };
    window.addEventListener('schofyPlanLimitBlocked', onPlanLimitBlocked);
    return () => window.removeEventListener('schofyPlanLimitBlocked', onPlanLimitBlocked);
  }, [addToast]);

  useEffect(() => {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    if (location.pathname !== '/login' && location.pathname !== '/subscribe') {
      window.sessionStorage.setItem('lastRoute', fullPath);
      window.localStorage.setItem('schofy_last_route', fullPath);
    }
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!user?.id || typeof navigator === 'undefined' || !navigator.onLine) return;
    let cancelled = false;
    let timeoutId = 0;
    let idleId: number | null = null;

    const warmOfflinePages = () => {
      if (cancelled || !navigator.onLine) return;
      void Promise.allSettled(offlinePageWarmers.map(load => load())).then(() => {
        if (cancelled || !navigator.serviceWorker?.controller) return;
        const sameOriginResources = performance.getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(name => {
            try {
              return new URL(name).origin === window.location.origin;
            } catch {
              return false;
            }
          });
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_URLS',
          urls: sameOriginResources,
        });
      });
    };

    timeoutId = window.setTimeout(() => {
      if (window.requestIdleCallback) {
        idleId = window.requestIdleCallback(warmOfflinePages, { timeout: 5000 });
      } else {
        warmOfflinePages();
      }
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (idleId !== null && window.cancelIdleCallback) window.cancelIdleCallback(idleId);
    };
  }, [user?.id]);

  // Staff access guard — redirect to dashboard if page not allowed
  useEffect(() => {
    if (false && isStaffMode && !canAccessPage(location.pathname)) {
      // Don't redirect from /roles — staff can always see their own access info
      if (location.pathname !== '/roles') {
        window.location.replace('/');
      }
    }
  }, [location.pathname, isStaffMode, canAccessPage]);

  useLayoutEffect(() => {
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const adminOnlyForStaff = STAFF_ADMIN_ONLY_PATHS.some(path => location.pathname === path || location.pathname.startsWith(path + '/'));
    const isAllowed = !isStaffMode || location.pathname === '/roles' || (!adminOnlyForStaff && canAccessPage(location.pathname));
    if (isAllowed) {
      lastAllowedPathRef.current = currentPath;
      restrictedPathRef.current = '';
      return;
    }
    if (restrictedPathRef.current === currentPath) return;
    restrictedPathRef.current = currentPath;
    restrictedPageNameRef.current = getRouteLabel(location.pathname);
    pendingRestrictedNoticeRef.current = true;
    navigate(lastAllowedPathRef.current || '/', { replace: true });
  }, [location.pathname, location.search, location.hash, isStaffMode, canAccessPage, navigate]);

  useEffect(() => {
    if (!pendingRestrictedNoticeRef.current) return;
    pendingRestrictedNoticeRef.current = false;

    void confirm({
      title: 'Access restricted',
      description: `You can't access ${restrictedPageNameRef.current} with the current staff role. You have been returned to an allowed page.`,
      confirmLabel: 'Back',
      cancelLabel: 'Close',
      variant: 'warning',
    });
  }, [location.pathname, confirm]);

  if (loading) {
    return <FullScreenLoader label="Loading..." />;
  }

  if (!user && !localStorage.getItem('schofy_session')) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ErrorBoundary>
      <StudentsProvider>
        <RealtimeSyncProvider>
          {/* SubscriptionGate wraps all content — shows blocking modal if expired/incomplete */}
          <StaffRoleGate>
            <SubscriptionGate>
            <div className="desktop-shell">
            <DesktopTitleBar />
            <Layout>
              <Suspense fallback={<PageLoadingSpinner />}>
                <div key={location.pathname} className="page-shell page-shell-enter">
                  <Routes location={location}>
                    <Route path="/" element={<ErrorBoundary inline><Dashboard /></ErrorBoundary>} />
                    <Route path="/dashboard" element={<Navigate to="/" replace />} />
                    <Route path="/students" element={<ErrorBoundary inline><Students /></ErrorBoundary>} />
                    <Route path="/parents" element={<ErrorBoundary inline><Parents /></ErrorBoundary>} />
                    <Route path="/parent-emails" element={<ErrorBoundary inline><ParentEmails /></ErrorBoundary>} />
                    <Route path="/students/new" element={<ErrorBoundary inline><StudentForm /></ErrorBoundary>} />
                    <Route path="/admission" element={<ErrorBoundary inline><Admission /></ErrorBoundary>} />
                    <Route path="/students/:id" element={<ErrorBoundary inline><StudentProfile /></ErrorBoundary>} />
                    <Route path="/students/:id/edit" element={<ErrorBoundary inline><StudentForm /></ErrorBoundary>} />
                    <Route path="/staff" element={<ErrorBoundary inline><Staff /></ErrorBoundary>} />
                    <Route path="/teachers" element={<Navigate to="/staff" replace />} />
                    <Route path="/staff/new" element={<ErrorBoundary inline><StaffForm /></ErrorBoundary>} />
                    <Route path="/staff/:id" element={<ErrorBoundary inline><StaffProfile /></ErrorBoundary>} />
                    <Route path="/teachers/:id" element={<ErrorBoundary inline><StaffProfile /></ErrorBoundary>} />
                    <Route path="/staff/:id/edit" element={<ErrorBoundary inline><StaffForm /></ErrorBoundary>} />
                    <Route path="/payroll" element={<ErrorBoundary inline><Payroll /></ErrorBoundary>} />
                    <Route path="/classes" element={<ErrorBoundary inline><Classes /></ErrorBoundary>} />
                    <Route path="/classes/timetable" element={<ErrorBoundary inline><Timetable /></ErrorBoundary>} />
                    <Route path="/classes/:id" element={<ErrorBoundary inline><ClassDetail /></ErrorBoundary>} />
                    <Route path="/subjects" element={<ErrorBoundary inline><Subjects /></ErrorBoundary>} />
                    <Route path="/homework-tests" element={<ErrorBoundary inline><HomeworkTests /></ErrorBoundary>} />
                    <Route path="/attendance" element={<ErrorBoundary inline><Attendance /></ErrorBoundary>} />
                    <Route path="/day-boarding" element={<ErrorBoundary inline><DayBoarding /></ErrorBoundary>} />
                    <Route path="/day-boarding/:boardingType/:gender" element={<ErrorBoundary inline><DayBoarding /></ErrorBoundary>} />
                    <Route path="/finance" element={<ErrorBoundary inline><Finance /></ErrorBoundary>} />
                    <Route path="/payment-accounts" element={<ErrorBoundary inline><PaymentAccounts /></ErrorBoundary>} />
                    <Route path="/expenses" element={<ErrorBoundary inline><Expenses /></ErrorBoundary>} />
                    <Route path="/invoices" element={<ErrorBoundary inline><Invoices /></ErrorBoundary>} />
                    <Route path="/grades" element={<ErrorBoundary inline><Grades /></ErrorBoundary>} />
                    <Route path="/grades/custom-grading" element={<ErrorBoundary inline><CustomGrading /></ErrorBoundary>} />
                    <Route path="/exam-marks" element={<ErrorBoundary inline><ExamMarks /></ErrorBoundary>} />
                    <Route path="/report-card/:id" element={<ErrorBoundary inline><ReportCard /></ErrorBoundary>} />
                    <Route path="/transport" element={<ErrorBoundary inline><Transport /></ErrorBoundary>} />
                    <Route path="/announcements" element={<ErrorBoundary inline><Announcements /></ErrorBoundary>} />
                    <Route path="/notifications" element={<ErrorBoundary inline><Notifications /></ErrorBoundary>} />
                    <Route path="/settings" element={<ErrorBoundary inline><Settings /></ErrorBoundary>} />
                    <Route path="/recycle-bin" element={<ErrorBoundary inline><RecycleBin /></ErrorBoundary>} />
                    <Route path="/reports" element={<ErrorBoundary inline><Reports /></ErrorBoundary>} />
                    <Route path="/plans" element={<ErrorBoundary inline><Plans /></ErrorBoundary>} />
                    <Route path="/subscribe" element={<Navigate to="/plans" replace />} />
                    <Route path="/about" element={<ErrorBoundary inline><About /></ErrorBoundary>} />
                    <Route path="/roles" element={<ErrorBoundary inline><Roles /></ErrorBoundary>} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
              </Suspense>
            </Layout>
            </div>
            </SubscriptionGate>
          <UpdateBanner />
          <StorageWarning />
          <LocalMergePrompt />
          <CloudProblemPrompt />
          </StaffRoleGate>
        </RealtimeSyncProvider>
      </StudentsProvider>
    </ErrorBoundary>
  );
}

function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const hasSession = !!localStorage.getItem('schofy_session');
  const restoredRoute = useMemo(() => {
    const stored = window.sessionStorage.getItem('lastRoute') || window.localStorage.getItem('schofy_last_route') || '/';
    return stored && !stored.startsWith('/login') && !stored.startsWith('/subscribe') ? stored : '/';
  }, [user?.id]);

  // No session at all — show login
  if (!hasSession && !user) {
    if (loading) return <FullScreenLoader label="Loading..." />;
    return (
      <>
        <Suspense fallback={<PageLoadingSpinner />}>
          <div className="page-shell">
            <Routes location={location}>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        </Suspense>
        <DesktopUpdatePrompt />
      </>
    );
  }

  // Has session or user — render app
  return (
    <>
      <Suspense fallback={<PageLoadingSpinner />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to={restoredRoute} replace /> : <Login />} />
          <Route path="/*" element={<MainApp />} />
        </Routes>
      </Suspense>
      <DesktopUpdatePrompt />
    </>
  );
}

function LocalMergePrompt() {
  const { user, isOnline } = useAuth();
  const { enableSync, isSyncEnabled, isSupabaseConfigured } = useSync();
  const [dismissed, setDismissed] = useState(localStorage.getItem('schofy_local_merge_prompt_dismissed') === '1');
  const [merging, setMerging] = useState(false);
  const [cloudRecovered, setCloudRecovered] = useState(localStorage.getItem('schofy_cloud_recovered') === '1');

  const localOnlySession = user?.localOnly || localStorage.getItem('schofy_local_only_session') === 'true';
  const canCheckCloud = false && !!localOnlySession && isOnline && isSupabaseConfigured && !isSyncEnabled && !dismissed;
  const shouldShow = canCheckCloud && cloudRecovered;

  useEffect(() => {
    if (!canCheckCloud || cloudRecovered) return;

    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const checkCloud = async () => {
      const nextCheckAt = Number(localStorage.getItem('schofy_next_cloud_health_check_at') || '0');
      const now = Date.now();
      if (nextCheckAt > now) {
        retryTimer = setTimeout(checkCloud, Math.min(nextCheckAt - now, 30 * 60 * 1000));
        return;
      }

      try {
        const controller = new AbortController();
        const abortTimer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
          headers: { apikey: supabaseAnonKey },
          signal: controller.signal,
        });
        clearTimeout(abortTimer);

        if (response.ok) {
          localStorage.setItem('schofy_cloud_recovered', '1');
          setCloudRecovered(true);
          return;
        }
      } catch { /* cloud still unavailable */ }

      localStorage.setItem('schofy_next_cloud_health_check_at', String(Date.now() + 30 * 60 * 1000));
      retryTimer = setTimeout(checkCloud, 30 * 60 * 1000);
    };

    void checkCloud();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [canCheckCloud, cloudRecovered]);

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-emerald-200 bg-white p-5 shadow-2xl dark:border-emerald-800 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
          <span className="text-sm font-bold">OK</span>
        </div>
        <h2 className="mt-4 text-center text-lg font-bold text-slate-900 dark:text-white">Cloud space is reachable again</h2>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
          This desktop is using a local backup. If this is the same school account, merge by enabling cloud sync and uploading your local data.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('schofy_local_merge_prompt_dismissed', '1');
              setDismissed(true);
            }}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Later
          </button>
          <button
            type="button"
            onClick={async () => {
              setMerging(true);
              try {
                await enableSync();
                localStorage.removeItem('schofy_local_only_session');
                localStorage.removeItem('schofy_local_fallback_reason');
                localStorage.removeItem('schofy_cloud_recovered');
                localStorage.removeItem('schofy_next_cloud_health_check_at');
                localStorage.setItem('schofy_sub_plan', '');
                const saved = localStorage.getItem('schofy_session');
                if (saved) {
                  try {
                    const parsed = JSON.parse(saved);
                    delete parsed.localOnly;
                    localStorage.setItem('schofy_session', JSON.stringify(parsed));
                  } catch { /* ignore */ }
                }
                localStorage.setItem('schofy_local_merge_prompt_dismissed', '1');
                setDismissed(true);
              } finally {
                setMerging(false);
              }
            }}
            disabled={merging}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {merging ? 'Merging...' : 'Merge account'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloudProblemPrompt() {
  const { user, schoolId } = useAuth();
  const { disableSync } = useSync();
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onCloudProblem = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || 'Cloud space is unavailable. You can keep working locally on this desktop.');
    };
    window.addEventListener('schofyCloudProblem', onCloudProblem as EventListener);
    return () => window.removeEventListener('schofyCloudProblem', onCloudProblem as EventListener);
  }, []);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-5 shadow-2xl dark:border-amber-800 dark:bg-slate-900">
        <h2 className="text-center text-lg font-bold text-slate-900 dark:text-white">Cloud sync problem</h2>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">{message}</p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Local mode stops cloud calls and keeps storing changes on this device. Access still requires an active Schofy plan verified by code.
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setMessage('')}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Keep trying
          </button>
          <button
            type="button"
            onClick={() => {
              disableSync();
              localStorage.setItem('schofy_local_only_session', 'true');
              localStorage.setItem('schofy_next_cloud_health_check_at', String(Date.now() + 30 * 60 * 1000));
              localStorage.removeItem('schofy_cloud_recovered');
              localStorage.removeItem('schofy_local_merge_prompt_dismissed');
              if (user) {
                const updatedUser = { ...user, localOnly: true };
                localStorage.setItem('schofy_session', JSON.stringify(updatedUser));
                if (schoolId || user.schoolId) {
                  localStorage.setItem(`schofy_local_backup_email_${schoolId || user.schoolId}`, user.email.toLowerCase());
                }
              }
              setMessage('');
            }}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Use local storage
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
