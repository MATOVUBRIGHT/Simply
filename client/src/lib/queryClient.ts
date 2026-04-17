import { QueryClient } from '@tanstack/react-query';

function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: { retry: 0 },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return createAppQueryClient();
  }
  if (!browserClient) {
    browserClient = createAppQueryClient();
  }
  return browserClient;
}
