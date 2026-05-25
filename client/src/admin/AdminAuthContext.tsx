import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const ADMIN_SESSION_KEY = 'schofy_admin_session';

// Production credentials are baked in at build time from environment variables.
// To change them, set VITE_ADMIN_EMAIL and VITE_ADMIN_PASSWORD in your deployment environment, then redeploy.
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() || '';
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || '';
const LOCAL_TEST_ADMIN_EMAIL = 'admin@school.com';
const LOCAL_TEST_ADMIN_PASSWORD = 'Admin 123';

function isLocalAdminDemoEnabled() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

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
        // Session expires after 8 hours.
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
    const normalizedEmail = email.toLowerCase().trim();
    const configuredEmail = ADMIN_EMAIL.toLowerCase().trim();
    const configuredMatch = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD)
      && normalizedEmail === configuredEmail
      && password === ADMIN_PASSWORD;
    const localTestMatch = isLocalAdminDemoEnabled()
      && normalizedEmail === LOCAL_TEST_ADMIN_EMAIL
      && password === LOCAL_TEST_ADMIN_PASSWORD;

    if (configuredMatch || localTestMatch) {
      const adminUser: AdminUser = {
        email: normalizedEmail,
        name: 'Schofy assistant',
        loginAt: new Date().toISOString(),
      };
      setAdmin(adminUser);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminUser));
      return { success: true };
    }

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return {
        success: false,
        error: isLocalAdminDemoEnabled() ? 'Invalid credentials' : 'Admin login is not configured',
      };
    }

    return { success: false, error: 'Invalid credentials' };
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
