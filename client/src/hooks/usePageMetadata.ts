import { useEffect, useState, useContext, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NavigationContext } from '../contexts/NavigationContext';

function getSchoolName(schoolId: string | null): string | null {
  if (!schoolId) return null;
  try {
    const raw = localStorage.getItem(`schofy_settings_${schoolId}`);
    if (raw) {
      const obj = JSON.parse(raw);
      return obj.schoolName;
    }
  } catch {
    // ignore
  }
  return null;
}

// Helper to get the current proper title (original behavior)
function getProperTitle(schoolId: string | null): string {
  const schoolName = getSchoolName(schoolId);
  if (schoolName) {
    return `${schoolName} - powered by Schofy`;
  } else {
    return 'Schofy';
  }
}

// Helper to get the original favicon href
function getOriginalFavicon(): string | null {
  const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  return link ? link.href : null;
}

// Helper to draw and update the loading favicon
function updateLoadingFavicon(progress: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background (dark circle)
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#1e293b'; // Slate-800
  ctx.fill();

  // Loading arc
  ctx.beginPath();
  ctx.arc(16, 16, 10, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
  ctx.strokeStyle = '#3b82f6'; // Blue-500
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Update favicon
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.getElementsByTagName('head')[0].appendChild(link);
  }
  link.href = canvas.toDataURL('image/png');
}

export function usePageMetadata() {
  const { schoolId } = useAuth();
  const navigationContext = useContext(NavigationContext);
  const isNavigating = navigationContext?.isNavigating ?? false;
  const navigationProgress = navigationContext?.navigationProgress ?? 0;
  const [currentTitle, setCurrentTitle] = useState('Schofy');
  const originalFaviconRef = useRef<string | null>(null);

  // Save original favicon on first mount
  useEffect(() => {
    originalFaviconRef.current = getOriginalFavicon();
  }, []);

  // Handle favicon and title
  useEffect(() => {
    let animationFrame: number;
    let progress = 0;

    const animateFavicon = () => {
      progress = (progress + 0.02) % 1;
      updateLoadingFavicon(progress);
      animationFrame = requestAnimationFrame(animateFavicon);
    };

    if (isNavigating) {
      // Start loading animation
      animateFavicon();
      document.title = getProperTitle(schoolId);
    } else {
      // Restore original favicon
      if (originalFaviconRef.current) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = originalFaviconRef.current;
      }
      document.title = getProperTitle(schoolId);
    }

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [isNavigating, schoolId]);

  // Also listen for settings updates to update title
  useEffect(() => {
    const handleSettingsUpdated = () => {
      document.title = getProperTitle(schoolId);
    };

    window.addEventListener('settingsUpdated', handleSettingsUpdated as EventListener);
    return () => window.removeEventListener('settingsUpdated', handleSettingsUpdated as EventListener);
  }, [schoolId]);

  return {
    title: currentTitle,
  };
}
