import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export function useBackOrFallback(fallbackPath: string) {
  const navigate = useNavigate();

  return useCallback(() => {
    const historyState = window.history.state as { idx?: number } | null;
    if (typeof historyState?.idx === 'number' && historyState.idx > 0) {
      navigate(-1);
      return;
    }
    navigate(fallbackPath);
  }, [fallbackPath, navigate]);
}
