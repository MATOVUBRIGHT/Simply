import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type AdminTheme = 'dark' | 'light';
const THEME_KEY = 'schofy_admin_theme';

interface AdminThemeContextType {
  theme: AdminTheme;
  toggle: () => void;
  isDark: boolean;
  // Shared design tokens
  t: {
    bg: string;
    surface: string;
    surfaceHover: string;
    border: string;
    text: string;
    muted: string;
    subtle: string;
    input: string;
    navActive: string;
    navInactive: string;
    headerBg: string;
    sidebarBg: string;
    divider: string;
    rowHover: string;
    badge: (color: 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'indigo') => string;
    statCard: (color: 'indigo' | 'green' | 'red' | 'amber' | 'violet' | 'cyan') => string;
  };
}

const AdminThemeContext = createContext<AdminThemeContextType>({} as AdminThemeContextType);

function buildTokens(isDark: boolean) {
  if (isDark) {
    return {
      bg: 'bg-slate-950',
      surface: 'bg-slate-900 border-slate-800',
      surfaceHover: 'hover:bg-slate-800/50',
      border: 'border-slate-800',
      text: 'text-white',
      muted: 'text-slate-400',
      subtle: 'text-slate-500',
      input: 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:ring-indigo-500',
      navActive: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20',
      navInactive: 'text-slate-400 hover:text-white hover:bg-slate-800',
      headerBg: 'bg-slate-900/90 border-slate-800 backdrop-blur',
      sidebarBg: 'bg-slate-900 border-slate-800',
      divider: 'border-slate-800',
      rowHover: 'hover:bg-slate-800/40',
      badge: (color: string) => {
        const map: Record<string, string> = {
          green: 'bg-green-900/40 text-green-400 border border-green-800/50',
          red: 'bg-red-900/40 text-red-400 border border-red-800/50',
          amber: 'bg-amber-900/40 text-amber-400 border border-amber-800/50',
          blue: 'bg-blue-900/40 text-blue-400 border border-blue-800/50',
          violet: 'bg-violet-900/40 text-violet-400 border border-violet-800/50',
          indigo: 'bg-indigo-900/40 text-indigo-400 border border-indigo-800/50',
        };
        return map[color] || map.indigo;
      },
      statCard: (color: string) => {
        const map: Record<string, string> = {
          indigo: 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-indigo-500/30',
          green: 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-emerald-500/30',
          red: 'bg-gradient-to-br from-red-600 to-red-700 text-white border-red-500/30',
          amber: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-400/30',
          violet: 'bg-gradient-to-br from-violet-600 to-violet-700 text-white border-violet-500/30',
          cyan: 'bg-gradient-to-br from-cyan-600 to-cyan-700 text-white border-cyan-500/30',
        };
        return map[color] || map.indigo;
      },
    };
  }

  // Light mode — vibrant, clean
  return {
    bg: 'bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20',
    surface: 'bg-white border-slate-200 shadow-sm',
    surfaceHover: 'hover:bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-900',
    muted: 'text-slate-500',
    subtle: 'text-slate-400',
    input: 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-indigo-500 shadow-sm',
    navActive: 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25',
    navInactive: 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50',
    headerBg: 'bg-white/90 border-slate-200 backdrop-blur shadow-sm',
    sidebarBg: 'bg-white border-slate-200 shadow-lg',
    divider: 'border-slate-100',
    rowHover: 'hover:bg-indigo-50/50',
    badge: (color: string) => {
      const map: Record<string, string> = {
        green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        red: 'bg-red-50 text-red-700 border border-red-200',
        amber: 'bg-amber-50 text-amber-700 border border-amber-200',
        blue: 'bg-blue-50 text-blue-700 border border-blue-200',
        violet: 'bg-violet-50 text-violet-700 border border-violet-200',
        indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      };
      return map[color] || map.indigo;
    },
    statCard: (color: string) => {
      const map: Record<string, string> = {
        indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-indigo-400/20 shadow-lg shadow-indigo-500/20',
        green: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-400/20 shadow-lg shadow-emerald-500/20',
        red: 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-400/20 shadow-lg shadow-rose-500/20',
        amber: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white border-amber-300/20 shadow-lg shadow-amber-500/20',
        violet: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white border-violet-400/20 shadow-lg shadow-violet-500/20',
        cyan: 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white border-cyan-400/20 shadow-lg shadow-cyan-500/20',
      };
      return map[color] || map.indigo;
    },
  };
}

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>(() => {
    return (localStorage.getItem(THEME_KEY) as AdminTheme) || 'dark';
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const isDark = theme === 'dark';
  const t = buildTokens(isDark) as any;

  return (
    <AdminThemeContext.Provider value={{ theme, toggle, isDark, t }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
