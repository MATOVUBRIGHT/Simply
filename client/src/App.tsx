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
const Plans = lazy(() => import('./pages/Plans'));
const Subscription = lazy(() => import('./pages/Subscription'));
const RecycleBin = lazy(() => import('./pages/RecycleBin'));

function FullScreenLoader({ label = 'Loading Schofy...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-primary-500/30 border-t-primary-500" />
        <div>
          <p className="text-lg font-semibold text-slate-800 dark:text-white">{label}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Preparing your workspace</p>
        </div>
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

  if (loading) {
    return <FullScreenLoader label="Loading..." />;
  }

  return (
    <ErrorBoundary>
      <StudentsProvider>
        <RealtimeSyncProvider>
          <Layout>
            <Suspense fallback={<FullScreenLoader />}>
              <div className="page-shell page-shell-enter">
                <Routes location={location}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Navigate to="/" replace />} />
                  <Route path="/students" element={<Students />} />
                  <Route path="/students/new" element={<StudentForm />} />
                  <Route path="/admission" element={<Admission />} />
                  <Route path="/students/:id" element={<StudentProfile />} />
                  <Route path="/students/:id/edit" element={<StudentForm />} />
                  <Route path="/staff" element={<Staff />} />
                  <Route path="/staff/new" element={<StaffForm />} />
                  <Route path="/staff/:id/edit" element={<StaffForm />} />
                  <Route path="/payroll" element={<Payroll />} />
                  <Route path="/classes" element={<Classes />} />
                  <Route path="/subjects" element={<Subjects />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/finance" element={<Finance />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/grades" element={<Grades />} />
                  <Route path="/transport" element={<Transport />} />
                  <Route path="/announcements" element={<Announcements />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/plans" element={<Plans />} />
                  <Route path="/recycle-bin" element={<RecycleBin />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/about" element={<About />} />
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

  if (loading) {
    return <FullScreenLoader label="Loading Schofy..." />;
  }

  if (!user) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/subscribe" element={<Subscription />} />
        <Route path="/*" element={<MainApp />} />
      </Routes>
    </Suspense>
  );
}

export default App;
