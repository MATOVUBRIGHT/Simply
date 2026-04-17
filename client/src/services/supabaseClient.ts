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
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  });
  g[GLOBAL_KEY] = client;
  return client;
}
