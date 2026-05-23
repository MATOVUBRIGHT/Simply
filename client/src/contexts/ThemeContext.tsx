import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const DEFAULT_PRIMARY_COLOR = '#4F46E5';

function sanitizeColor(color: string | null) {
  const trimmed = (color || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : DEFAULT_PRIMARY_COLOR;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return (stored as Theme) || 'light';
  });

  const [primaryColor, setPrimaryColorState] = useState(() => {
    return sanitizeColor(localStorage.getItem('primaryColor'));
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const safeColor = sanitizeColor(primaryColor);
    document.documentElement.style.setProperty('--primary-color', safeColor);
    localStorage.setItem('primaryColor', safeColor);
  }, [primaryColor]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  function setPrimaryColor(color: string) {
    setPrimaryColorState(sanitizeColor(color));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, primaryColor, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
