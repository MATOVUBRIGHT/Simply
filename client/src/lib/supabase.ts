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
