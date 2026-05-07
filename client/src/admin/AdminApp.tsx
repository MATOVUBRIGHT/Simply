import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext';
import { AdminThemeProvider } from './AdminThemeContext';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminSchools from './pages/AdminSchools';
import AdminSchoolDetail from './pages/AdminSchoolDetail';
import AdminUsers from './pages/AdminUsers';
import AdminVerifications from './pages/AdminVerifications';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminSecurity from './pages/AdminSecurity';
import AdminLayout from './AdminLayout';

function AdminRoutes() {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-slate-700 border-t-indigo-500 animate-spin" />
          <p className="text-slate-400 text-sm">Loading admin portal...</p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/schools" element={<AdminSchools />} />
        <Route path="/admin/schools/:schoolId" element={<AdminSchoolDetail />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/verifications" element={<AdminVerifications />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </AdminLayout>
  );
}

export default function AdminApp() {
  return (
    <AdminThemeProvider>
      <AdminAuthProvider>
        <AdminRoutes />
      </AdminAuthProvider>
    </AdminThemeProvider>
  );
}
