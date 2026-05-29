import { useEffect, useMemo, useRef, useState } from 'react';

type Options = {
  initialCount?: number;
  step?: number;
  delayMs?: number;
};

export function useProgressiveList<T>(items: T[], options: Options = {}) {
  const initialCount = options.initialCount ?? 120;
  const step = options.step ?? 120;
  const delayMs = options.delayMs ?? 2000;
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setVisibleCount(initialCount);
    setLoadingMore(false);
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }, [items, initialCount]);

  useEffect(() => () => {
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
  }, []);

  const hasMore = visibleCount < items.length;
  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  function loadMore() {
    if (!hasMore || loadingMore || loadTimerRef.current) return;
    setLoadingMore(true);
    loadTimerRef.current = window.setTimeout(() => {
      setVisibleCount(count => Math.min(items.length, count + step));
      setLoadingMore(false);
      loadTimerRef.current = null;
    }, delayMs);
  }

  return { visibleItems, visibleCount, hasMore, loadingMore, loadMore };
}

export function ProgressiveListLoader({
  hasMore,
  loadingMore,
  onVisible,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  onVisible: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) onVisible();
    }, { rootMargin: '240px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onVisible]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
      {loadingMore ? (
        <>
          <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
          Loading more...
        </>
      ) : (
        'Scroll to load more'
      )}
    </div>
  );
}
