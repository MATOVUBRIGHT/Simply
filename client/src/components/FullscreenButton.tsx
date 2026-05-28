import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FullscreenButtonProps {
  target?: HTMLElement | null;
  label?: string;
  className?: string;
}

export function FullscreenButton({ target, label = 'Full screen', className = '' }: FullscreenButtonProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const element = target || document.querySelector<HTMLElement>('[data-preview-fullscreen-root]');
    await element?.requestFullscreen?.();
  }

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      title={active ? 'Exit full screen' : label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${className || 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}`}
    >
      {active ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      {active ? 'Exit full screen' : label}
    </button>
  );
}
