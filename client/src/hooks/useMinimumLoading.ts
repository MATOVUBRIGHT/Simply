import { useEffect, useRef, useState } from 'react';

export function useMinimumLoading(active: boolean, delayMs = 2000) {
  const [visible, setVisible] = useState(active);
  const startedAtRef = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (active) {
      startedAtRef.current = Date.now();
      setVisible(true);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const startedAt = startedAtRef.current;
    if (!startedAt) {
      setVisible(false);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const remaining = Math.max(0, delayMs - (Date.now() - startedAt));
    timer = setTimeout(() => {
      startedAtRef.current = null;
      setVisible(false);
    }, remaining);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [active, delayMs]);

  return visible;
}
