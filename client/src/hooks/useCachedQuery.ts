import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

type Key = readonly unknown[];

/**
 * Opinionated useQuery defaults for Schofy: long stale time, deduped fetches, no focus refetch.
 */
export function useCachedQuery<T>(
  queryKey: Key,
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
): UseQueryResult<T> {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    ...options,
  });
}
