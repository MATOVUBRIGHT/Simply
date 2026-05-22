import { createClient, SupabaseClient } from '@supabase/supabase-js';

const GLOBAL_KEY = '__SCHOFY_SUPABASE_SINGLETON__' as const;

type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: SupabaseClient };

/**
 * Single process-wide Supabase client (StrictMode / HMR safe).
 * Always import `supabase` from `../lib/supabase` in app code.
 */
export function getSchofySupabaseClient(url: string, anonKey: string): SupabaseClient {
  const g = globalThis as GlobalWithClient;
  const existing = g[GLOBAL_KEY];
  if (existing) return existing;
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // CRITICAL FIX FOR ELECTRON:
      // This stops Supabase from calling the broken navigator.locks API
      // We use 'as any' because these properties were added in recent versions
      // and might not be reflected in the current @types/supabase-js
      lockType: 'custom',
      getLock: async () => {
        // Provide a dummy lock function that resolves immediately
        return () => {};
      }
    } as any,
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  });
  g[GLOBAL_KEY] = client;
  return client;
}
