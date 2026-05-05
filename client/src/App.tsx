import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { StudentsProvider } from './contexts/StudentsContext';
import { RealtimeSyncProvider } from './realtime/RealtimeSync';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import { useEffect, useState, lazy, Suspense } from 'react';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const StudentForm = lazy(() => import('./pages/StudentForm'));
const Admission = lazy(() => import('./pages/Admission'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Staff = lazy(() => import('./pages/Staff'));
const StaffForm = lazy(() => import('./pages/StaffForm'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Classes = lazy(() => import('./pages/Classes'));
const Subjects = lazy(() => import('./pages/Subjects'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Finance = lazy(() => import('./pages/Finance'));
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
const ReportCard = lazy(() => import('./pages/ReportCard'));
const Plans = lazy(() => import('./pages/Plans'));
const Subscription = lazy(() => import('./pages/Subscription'));
const RecycleBin = lazy(() => import('./pages/RecycleBin'));

function FullScreenLoader({ label = 'Loading Schofy...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

function MainApp() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [hasValidPlan, setHasValidPlan] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || !user) return;

    // Bypass plan check for now
    setHasValidPlan(true);
  }, [user, loading]);

  useEffect(() => {
    if (hasValidPlan === null) return;
    
    // Only redirect to subscribe if user has no plan at all
    // Users with expired or expiring plans can still access the app
    // Users with existing plans can access /plans to see their plan and upgrade options
    if (!hasValidPlan && location.pathname !== '/subscribe') {
      navigate('/subscribe', { replace: true });
    } else if (hasValidPlan && location.pathname === '/subscribe') {
      // Only redirect away from subscribe page if user has an active plan
      navigate('/', { replace: true });
    }
    // Allow users with existing plans to access /plans to see their current plan and upgrade options
  }, [hasValidPlan, location.pathname, navigate]);

  useEffect(() => {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    if (location.pathname !== '/login' && location.pathname !== '/subscribe') {
      window.sessionStorage.setItem('lastRoute', fullPath);
    }
  }, [location.pathname, location.search, location.hash]);

  if (!user && !localStorage.getItem('schofy_session')) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ErrorBoundary>
      <StudentsProvider>
        <RealtimeSyncProvider>
          <Layout>
            <Suspense fallback={null}>
              <div className="page-shell page-shell-enter">
                <Routes location={location}>
                  <Route path="/" element={<ErrorBoundary inline><Dashboard /></ErrorBoundary>} />
                  <Route path="/dashboard" element={<Navigate to="/" replace />} />
                  <Route path="/students" element={<ErrorBoundary inline><Students /></ErrorBoundary>} />
                  <Route path="/students/new" element={<ErrorBoundary inline><StudentForm /></ErrorBoundary>} />
                  <Route path="/admission" element={<ErrorBoundary inline><Admission /></ErrorBoundary>} />
                  <Route path="/students/:id" element={<ErrorBoundary inline><StudentProfile /></ErrorBoundary>} />
                  <Route path="/students/:id/edit" element={<ErrorBoundary inline><StudentForm /></ErrorBoundary>} />
                  <Route path="/staff" element={<ErrorBoundary inline><Staff /></ErrorBoundary>} />
                  <Route path="/staff/new" element={<ErrorBoundary inline><StaffForm /></ErrorBoundary>} />
                  <Route path="/staff/:id/edit" element={<ErrorBoundary inline><StaffForm /></ErrorBoundary>} />
                  <Route path="/payroll" element={<ErrorBoundary inline><Payroll /></ErrorBoundary>} />
                  <Route path="/classes" element={<ErrorBoundary inline><Classes /></ErrorBoundary>} />
                  <Route path="/subjects" element={<ErrorBoundary inline><Subjects /></ErrorBoundary>} />
                  <Route path="/attendance" element={<ErrorBoundary inline><Attendance /></ErrorBoundary>} />
                  <Route path="/finance" element={<ErrorBoundary inline><Finance /></ErrorBoundary>} />
                  <Route path="/invoices" element={<ErrorBoundary inline><Invoices /></ErrorBoundary>} />
                  <Route path="/grades" element={<ErrorBoundary inline><Grades /></ErrorBoundary>} />
                  <Route path="/exam-marks" element={<ErrorBoundary inline><ExamMarks /></ErrorBoundary>} />
                  <Route path="/report-card/:id" element={<ErrorBoundary inline><ReportCard /></ErrorBoundary>} />
                  <Route path="/transport" element={<ErrorBoundary inline><Transport /></ErrorBoundary>} />
                  <Route path="/announcements" element={<ErrorBoundary inline><Announcements /></ErrorBoundary>} />
                  <Route path="/notifications" element={<ErrorBoundary inline><Notifications /></ErrorBoundary>} />
                  <Route path="/settings" element={<ErrorBoundary inline><Settings /></ErrorBoundary>} />
                  <Route path="/plans" element={<ErrorBoundary inline><Plans /></ErrorBoundary>} />
                  <Route path="/recycle-bin" element={<ErrorBoundary inline><RecycleBin /></ErrorBoundary>} />
                  <Route path="/reports" element={<ErrorBoundary inline><Reports /></ErrorBoundary>} />
                  <Route path="/about" element={<ErrorBoundary inline><About /></ErrorBoundary>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
            </Suspense>
          </Layout>
        </RealtimeSyncProvider>
      </StudentsProvider>
    </ErrorBoundary>
  );
}

function App() {
  const { user, loading } = useAuth();
  const hasSession = !!localStorage.getItem('schofy_session');

  // No session at all — show login
  if (!hasSession && !user) {
    if (loading) return <FullScreenLoader label="Loading Schofy..." />;
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Has session or user — render app (user may still be null for <100ms, MainApp handles it)
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/subscribe" element={<Subscription />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </Suspense>
  );
}

export default App;
