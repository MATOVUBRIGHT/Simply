/**
 * Portal — renders children directly into document.body,
 * bypassing any CSS stacking context (overflow, transform, etc.)
 * so modals always cover the full viewport including sidebar and navbar.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  const el = useRef<HTMLDivElement | null>(null);

  if (!el.current) {
    el.current = document.createElement('div');
    el.current.setAttribute('data-portal', 'true');
  }

  useEffect(() => {
    const container = el.current!;
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  }, []);

  return createPortal(children, el.current);
}
