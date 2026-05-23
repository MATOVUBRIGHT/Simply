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

function hexToRgb(color: string) {
  const normalized = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  const value = Number.parseInt(normalized.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function readableSymbolColor(color: string) {
  const { r, g, b } = hexToRgb(color);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.68 ? '#111827' : '#FFFFFF';
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
    window.electronAPI?.setTitleBarTheme?.({
      color: safeColor,
      symbolColor: readableSymbolColor(safeColor),
    }).catch(() => {});
  }, [primaryColor, theme]);

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
