import type { SupabaseClient } from '@supabase/supabase-js';
import { getSchofySupabaseClient } from '../services/supabaseClient';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Cloud sync will be disabled.');
}

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? getSchofySupabaseClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getSupabaseUrl(): string {
  return supabaseUrl;
}

// === DEBUG UTILITIES ===
export async function testSupabaseConnection(): Promise<void> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  try {
    const { error, status } = await supabase
      .from('users')
      .select('COUNT(*)', { count: 'exact', head: true })
      .limit(0);

    if (error) {
      console.error('Connection test failed:', error.message);
      return;
    }
    if (import.meta.env.DEV) {
      console.log('Supabase connection OK', status);
    }
  } catch (err: unknown) {
    console.error('Connection test exception:', err instanceof Error ? err.message : err);
  }
}

export async function testUserInsert(testUser: Record<string, unknown>): Promise<void> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  try {
    const { data, error } = await supabase.from('users').upsert(testUser, { onConflict: 'id' }).select();
    if (error) {
      console.error('Upsert failed:', error.message);
      return;
    }
    if (import.meta.env.DEV) {
      console.log('Upsert OK', data);
    }
  } catch (err: unknown) {
    console.error('Upsert exception:', err instanceof Error ? err.message : err);
  }
}

export async function checkRLSPolicies(): Promise<void> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  try {
    const testId = crypto.randomUUID();
    const { error } = await supabase
      .from('users')
      .upsert(
        {
          id: testId,
          school_id: testId,
          email: 'rls-test@test.com',
          first_name: 'RLS',
          last_name: 'Test',
          is_active: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select();

    if (error?.code === '42501') {
      console.error('RLS policy blocked write on users');
    } else if (error) {
      console.error('RLS check error:', error.message);
    } else {
      await supabase.from('users').delete().eq('id', testId);
    }
  } catch (err: unknown) {
    console.error('RLS check exception:', err instanceof Error ? err.message : err);
  }
}

export async function checkDatabaseSchema(): Promise<void> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return;
  }

  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.error('Cannot access users table:', error.message);
      return;
    }
    if (import.meta.env.DEV && data && data.length > 0) {
      console.log('Users table OK');
    }
  } catch (err: unknown) {
    console.error('Schema check exception:', err instanceof Error ? err.message : err);
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { SupabaseDebug?: Record<string, unknown> }).SupabaseDebug = {
    testSupabaseConnection,
    testUserInsert,
    checkRLSPolicies,
    checkDatabaseSchema,
    supabase,
    isSupabaseConfigured,
  };
}
