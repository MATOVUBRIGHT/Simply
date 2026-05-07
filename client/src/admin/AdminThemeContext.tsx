import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type AdminTheme = 'dark' | 'light';
const THEME_KEY = 'schofy_admin_theme';

interface AdminThemeContextType {
  theme: AdminTheme;
  toggle: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextType>({ theme: 'dark', toggle: () => {} });

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>(() => {
    return (localStorage.getItem(THEME_KEY) as AdminTheme) || 'dark';
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute('data-admin-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <AdminThemeContext.Provider value={{ theme, toggle }}>
      <div data-admin-theme={theme} className={theme === 'light' ? 'admin-light' : 'admin-dark'}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
