import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { StudentsProvider } from './contexts/StudentsContext';
import { RealtimeSyncProvider } from './realtime/RealtimeSync';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentForm from './pages/StudentForm';
import Admission from './pages/Admission';
import StudentProfile from './pages/StudentProfile';
import Staff from './pages/Staff';
import StaffForm from './pages/StaffForm';
import Classes from './pages/Classes';
import Subjects from './pages/Subjects';
import Attendance from './pages/Attendance';
import Finance from './pages/Finance';
import Transport from './pages/Transport';
import Announcements from './pages/Announcements';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import About from './pages/About';
import NotFound from './pages/NotFound';
import Invoices from './pages/Invoices';
import Grades from './pages/Grades';
import Plans from './pages/Plans';
import Subscription from './pages/Subscription';
import RecycleBin from './pages/RecycleBin';
import { useEffect, useState } from 'react';
import { getCurrentPlanId } from './utils/plans';

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
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading || !user) return;

    async function checkPlan() {
      try {
        const planId = await getCurrentPlanId(user!.id);
        setHasPlan(!!planId);
      } catch (error) {
        console.error('Plan check error:', error);
        setHasPlan(true);
      }
    }

    checkPlan();
  }, [user, loading]);

  useEffect(() => {
    if (hasPlan === null) return;
    
    if (!hasPlan && location.pathname !== '/subscribe') {
      navigate('/subscribe', { replace: true });
    } else if (hasPlan && location.pathname === '/subscribe') {
      navigate('/', { replace: true });
    }
  }, [hasPlan, location.pathname, navigate]);

  useEffect(() => {
    const fullPath = `${location.pathname}${location.search}${location.hash}`;
    if (location.pathname !== '/login' && location.pathname !== '/subscribe') {
      sessionStorage.setItem('lastRoute', fullPath);
    }
  }, [location.pathname, location.search, location.hash]);

  if (loading) {
    return <FullScreenLoader label="Loading..." />;
  }

  return (
    <StudentsProvider>
      <RealtimeSyncProvider>
        <Layout>
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
      </Layout>
      </RealtimeSyncProvider>
    </StudentsProvider>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader label="Loading Schofy..." />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/subscribe" element={<Subscription />} />
      <Route path="/*" element={<MainApp />} />
    </Routes>
  );
}

export default App;
