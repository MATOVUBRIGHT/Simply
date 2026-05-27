// client/src/components/VirtualizedList.tsx
// High-performance list component using virtualization

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  onScroll?: (scrollTop: number) => void;
  className?: string;
  keyExtractor?: (item: T, index: number) => string | number;
}

/**
 * Memory-efficient list component for large datasets
 * - Only renders visible + overscan items
 * - Handles 10k+ items with smooth scrolling
 * - Significant performance improvement over regular lists
 */
function VirtualizedListComponent<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  onScroll,
  className = '',
  keyExtractor,
}: VirtualizedListProps<T>) {
    const [scrollTop, setScrollTop] = useState(0);
    const frameRef = useRef<number | null>(null);
    const latestScrollTopRef = useRef(0);

    // Calculate visible range
    const visibleRange = useMemo(() => {
      const visibleCount = Math.ceil(containerHeight / itemHeight);
      const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
      const endIndex = Math.min(
        items.length,
        startIndex + visibleCount + overscan * 2
      );

      return { startIndex, endIndex, visibleCount };
    }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

    const visibleItems = useMemo(
      () => items.slice(visibleRange.startIndex, visibleRange.endIndex),
      [items, visibleRange]
    );

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        latestScrollTopRef.current = e.currentTarget.scrollTop;
        if (frameRef.current !== null) return;
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null;
          setScrollTop(latestScrollTopRef.current);
          onScroll?.(latestScrollTopRef.current);
        });
      },
      [onScroll]
    );

    useEffect(() => {
      return () => {
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      };
    }, []);

    const offsetY = visibleRange.startIndex * itemHeight;
    const totalHeight = items.length * itemHeight;

    return (
      <div
        className={`overflow-y-auto ${className}`}
        style={{ height: containerHeight, contain: 'strict', willChange: 'scroll-position' }}
        onScroll={handleScroll}
      >
        {/* Spacer before visible items */}
        <div style={{ height: offsetY }} />

        {/* Visible items */}
        {visibleItems.map((item, index) => (
          <div
            key={
              keyExtractor
                ? keyExtractor(item, visibleRange.startIndex + index)
                : visibleRange.startIndex + index
            }
            style={{ height: itemHeight }}
          >
            {renderItem(item, visibleRange.startIndex + index)}
          </div>
        ))}

        {/* Spacer after visible items */}
        <div style={{ height: Math.max(0, totalHeight - (offsetY + visibleItems.length * itemHeight)) }} />
      </div>
    );
}

export const VirtualizedList = React.memo(VirtualizedListComponent) as typeof VirtualizedListComponent;

/**
 * Hook for managing virtualized list state
 */
export function useVirtualizedList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan = 3
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

    return {
      startIndex,
      endIndex,
      visibleCount,
      offsetY: startIndex * itemHeight,
      totalHeight: items.length * itemHeight,
    };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  const visibleItems = items.slice(visibleRange.startIndex, visibleRange.endIndex);

  return {
    visibleItems,
    visibleRange,
    scrollTop,
    setScrollTop,
  };
}
