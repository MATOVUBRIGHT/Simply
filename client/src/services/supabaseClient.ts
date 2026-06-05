import { createClient, SupabaseClient } from '@supabase/supabase-js';

const GLOBAL_KEY = '__SCHOFY_SUPABASE_CLIENTS__' as const;

type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: Map<string, SupabaseClient> };

/**
 * Process-wide Supabase clients (StrictMode / HMR safe), keyed by project.
 * Always import `supabase` from `../lib/supabase` in app code.
 */
export function getSchofySupabaseClient(url: string, anonKey: string): SupabaseClient {
  const g = globalThis as GlobalWithClient;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  const cacheKey = `${url.trim()}::${anonKey.trim()}`;
  const existing = g[GLOBAL_KEY].get(cacheKey);
  if (existing) return existing;
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Completely disable locking mechanism for single-instance Electron apps
      lockType: 'null',
    } as any,
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  g[GLOBAL_KEY].set(cacheKey, client);
  return client;
}
