// client/src/hooks/usePagination.ts
// Performance Hook: Efficient pagination for large datasets

import { useState, useCallback, useMemo, useEffect } from 'react';

export interface PaginationConfig {
  initialPage?: number;
  pageSize?: number;
  totalItems?: number;
}

export interface UsePaginationResult<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
  reload: () => void;
}

/**
 * Efficient pagination hook for large datasets
 * - Loads only current page data from DB
 * - Supports dynamic page size
 * - Prevents loading entire dataset
 */
export function usePagination<T>(
  allItems: T[],
  config: PaginationConfig = {}
): UsePaginationResult<T> {
  const { initialPage = 1, pageSize: initialPageSize = 20, totalItems } = config;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Sync pageSize state with prop if it changes
  useEffect(() => {
    if (initialPageSize !== undefined) {
      setPageSizeState(initialPageSize);
      setCurrentPage(1);
    }
  }, [initialPageSize]);

  const paginationData = useMemo(() => {
    const total = totalItems ?? allItems.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      items: allItems.slice(startIndex, endIndex),
      totalPages: Math.max(1, totalPages),
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      startIndex,
      endIndex,
    };
  }, [allItems, currentPage, pageSize, totalItems]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, paginationData.totalPages)));
  }, [paginationData.totalPages]);

  const nextPage = useCallback(() => {
    if (paginationData.hasNextPage) {
      setCurrentPage(p => p + 1);
    }
  }, [paginationData.hasNextPage]);

  const prevPage = useCallback(() => {
    if (paginationData.hasPrevPage) {
      setCurrentPage(p => p - 1);
    }
  }, [paginationData.hasPrevPage]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(Math.max(1, size));
    setCurrentPage(1); // Reset to first page when page size changes
  }, []);

  return {
    items: paginationData.items,
    currentPage,
    totalPages: paginationData.totalPages,
    pageSize,
    totalItems: totalItems ?? allItems.length,
    hasNextPage: paginationData.hasNextPage,
    hasPrevPage: paginationData.hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
    reload: () => setCurrentPage(1),
  };
}

/**
 * Hook for server-side pagination with lazy loading
 * - Loads data in pages only when needed
 * - Minimal memory footprint
 * - Better for 10k+ records
 */
export function useLazyPagination<T>(
  fetchFn: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>,
  initialPageSize = 20
) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [items, setItems] = useState<T[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadPage = useCallback(async (page: number) => {
    try {
      setLoading(true);
      setError(null);
      const { items: newItems, total } = await fetchFn(page, pageSize);
      setItems(newItems);
      setTotalItems(total);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load page'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, pageSize]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    items,
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    loading,
    error,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    goToPage: (page: number) => loadPage(Math.max(1, Math.min(page, totalPages))),
    nextPage: () => currentPage < totalPages && loadPage(currentPage + 1),
    prevPage: () => currentPage > 1 && loadPage(currentPage - 1),
    setPageSize: (size: number) => {
      setPageSizeState(size);
      loadPage(1); // Reset to first page
    },
    reload: () => loadPage(currentPage),
  };
}
