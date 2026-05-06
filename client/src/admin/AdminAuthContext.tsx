import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const ADMIN_SESSION_KEY = 'schofy_admin_session';

// Admin credentials from env vars (set in Vercel env)
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@schofy.com';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'schofy_admin_2024';

interface AdminUser {
  email: string;
  name: string;
  loginAt: string;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(ADMIN_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AdminUser;
        // Session expires after 8 hours
        const loginTime = new Date(parsed.loginAt).getTime();
        if (Date.now() - loginTime < 8 * 60 * 60 * 1000) {
          setAdmin(parsed);
        } else {
          localStorage.removeItem(ADMIN_SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(ADMIN_SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  function login(email: string, password: string): { success: boolean; error?: string } {
    if (
      email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim() &&
      password === ADMIN_PASSWORD
    ) {
      const adminUser: AdminUser = {
        email: email.toLowerCase().trim(),
        name: 'Super Admin',
        loginAt: new Date().toISOString(),
      };
      setAdmin(adminUser);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminUser));
      return { success: true };
    }
    return { success: false, error: 'Invalid admin credentials' };
  }

  function logout() {
    setAdmin(null);
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
