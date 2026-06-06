import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const DEFAULT_PRIMARY_COLOR = '#0082FC';

function sanitizeColor(color: string | null) {
  const trimmed = (color || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : DEFAULT_PRIMARY_COLOR;
}

function hexToRgb(color: string) {
  const safe = sanitizeColor(color).replace('#', '');
  const expanded = safe.length === 3
    ? safe.split('').map(char => `${char}${char}`).join('')
    : safe;
  const value = Number.parseInt(expanded, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round((h + 360) % 360)} ${Math.round(Math.max(0, Math.min(100, s)))}% ${Math.round(Math.max(0, Math.min(100, l)))}%)`;
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
    const { r, g, b } = hexToRgb(safeColor);
    const { h, s, l } = rgbToHsl(r, g, b);
    const vivid = Math.max(45, Math.min(78, s));
    const root = document.documentElement;
    root.style.setProperty('--primary-color', safeColor);
    root.style.setProperty('--primary-color-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--primary-color-soft', `rgba(${r}, ${g}, ${b}, 0.10)`);
    root.style.setProperty('--primary-color-muted', `rgba(${r}, ${g}, ${b}, 0.18)`);
    root.style.setProperty('--primary-color-ring', `rgba(${r}, ${g}, ${b}, 0.28)`);
    root.style.setProperty('--primary-color-shadow', `rgba(${r}, ${g}, ${b}, 0.32)`);
    root.style.setProperty('--primary-color-50', `rgba(${r}, ${g}, ${b}, 0.08)`);
    root.style.setProperty('--primary-color-100', `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.style.setProperty('--primary-color-200', `rgba(${r}, ${g}, ${b}, 0.24)`);
    root.style.setProperty('--primary-color-300', `rgba(${r}, ${g}, ${b}, 0.36)`);
    root.style.setProperty('--primary-color-400', hsl(h, vivid, Math.max(48, Math.min(64, l + 10))));
    root.style.setProperty('--primary-color-500', safeColor);
    root.style.setProperty('--primary-color-600', hsl(h, vivid, Math.max(36, Math.min(50, l - 6))));
    root.style.setProperty('--primary-color-700', hsl(h, vivid, Math.max(28, Math.min(42, l - 14))));
    root.style.setProperty('--primary-color-800', hsl(h, vivid, Math.max(22, Math.min(34, l - 22))));
    root.style.setProperty('--primary-color-900', hsl(h, vivid, Math.max(16, Math.min(28, l - 30))));
    root.style.setProperty('--card-accent-1', safeColor);
    root.style.setProperty('--card-accent-2', '#2da32d');
    root.style.setProperty('--card-accent-3', '#f68818');
    root.style.setProperty('--card-accent-4', '#ed1e1e');
    root.style.setProperty('--card-accent-5', '#06b6d4');
    root.style.setProperty('--card-accent-6', '#8b5cf6');
    localStorage.setItem('primaryColor', safeColor);
    void window.electronAPI?.setTitleBarColor?.(safeColor);
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
