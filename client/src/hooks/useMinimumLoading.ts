import { useEffect, useState } from 'react';

export function useMinimumLoading(active: boolean, delayMs = 2000) {
  const [delayed, setDelayed] = useState(active);

  useEffect(() => {
    if (active) {
      setDelayed(true);
      return;
    }

    const timer = window.setTimeout(() => setDelayed(false), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return delayed;
}
