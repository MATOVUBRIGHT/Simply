import { supabase, isSupabaseConfigured } from '../lib/supabase';

const USER_SELECT =
  'id, email, first_name, last_name, school_id, is_active, created_at, updated_at';

export const usersApi = {
  async getById(id: string) {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: new Error('Supabase not configured') };
    }
    return supabase.from('users').select(USER_SELECT).eq('id', id).maybeSingle();
  },

  async getByEmail(email: string) {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: new Error('Supabase not configured') };
    }
    return supabase.from('users').select(USER_SELECT).eq('email', email.toLowerCase()).maybeSingle();
  },

  async emailExists(email: string) {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: new Error('Supabase not configured') };
    }
    return supabase.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
  },
};
