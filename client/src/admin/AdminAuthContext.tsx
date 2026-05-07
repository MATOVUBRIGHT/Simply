import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const ADMIN_SESSION_KEY = 'schofy_admin_session';

// Credentials baked in at build time from Vercel env vars.
// If not set, fallback defaults are used.
// To change: set VITE_ADMIN_EMAIL and VITE_ADMIN_PASSWORD in Vercel → Settings → Environment Variables, then redeploy.
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim() || 'admin@schofy.com';
const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || 'Schofy@2024!';

// Export for debug display on login page (email only, never password)
export const ADMIN_EMAIL_HINT = ADMIN_EMAIL;

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
    const emailMatch = email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
    const passMatch = password === ADMIN_PASSWORD;

    if (emailMatch && passMatch) {
      const adminUser: AdminUser = {
        email: email.toLowerCase().trim(),
        name: 'Super Admin',
        loginAt: new Date().toISOString(),
      };
      setAdmin(adminUser);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminUser));
      return { success: true };
    }

    // Specific error messages to help diagnose
    if (!emailMatch) return { success: false, error: 'Email not recognised' };
    return { success: false, error: 'Incorrect password' };
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
