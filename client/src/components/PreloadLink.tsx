
import { useState, useCallback, useRef } from 'react';
import { Link, LinkProps } from 'react-router-dom';

const PRELOAD_DELAY = 100; // ms to wait before preloading

type PreloadLinkProps = LinkProps & {
  preload?: () => void;
};

export function PreloadLink({ children, preload, ...props }: PreloadLinkProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (preload) preload();
    }, PRELOAD_DELAY);
  }, [preload]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return (
    <Link
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={preload} // Preload immediately on touch
      {...props}
    >
      {children}
    </Link>
  );
}
