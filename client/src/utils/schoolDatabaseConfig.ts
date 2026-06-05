import type { SupabaseClient } from '@supabase/supabase-js';
import { getSchofySupabaseClient } from '../services/supabaseClient';
import { supabaseAnonKey, supabaseUrl } from '../lib/supabase';

export type SchoolDatabaseConfig = {
  provider: 'database';
  enabled: boolean;
  url: string;
  anonKey: string;
  shareToDevices?: boolean;
  savedAt?: string;
  lastCheckedAt?: string;
};

export const schoolDatabaseConfigKey = (schoolId: string) => `schofy_school_database_${schoolId}`;

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export function readSchoolDatabaseConfig(schoolId?: string | null): SchoolDatabaseConfig | null {
  if (!schoolId) return null;
  try {
    const raw = localStorage.getItem(schoolDatabaseConfigKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SchoolDatabaseConfig;
    const provider = parsed?.provider === 'database' || (parsed as any)?.provider === 'supabase';
    if (!provider) return null;
    if (!parsed.enabled) {
      return { provider: 'database', enabled: false, url: '', anonKey: '', shareToDevices: false, savedAt: parsed.savedAt };
    }
    if (!parsed.url || !parsed.anonKey) return null;
    return { ...parsed, provider: 'database', url: normalizeUrl(parsed.url), anonKey: parsed.anonKey.trim() };
  } catch {
    return null;
  }
}

export function saveSchoolDatabaseConfig(schoolId: string, config: SchoolDatabaseConfig) {
  const payload: SchoolDatabaseConfig = {
    provider: 'database',
    enabled: config.enabled,
    url: normalizeUrl(config.url),
    anonKey: config.anonKey.trim(),
    shareToDevices: !!config.shareToDevices,
    savedAt: new Date().toISOString(),
    lastCheckedAt: config.lastCheckedAt,
  };
  localStorage.setItem(schoolDatabaseConfigKey(schoolId), JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('schofyDatabaseConfigChanged', { detail: { schoolId } }));
}

export function clearSchoolDatabaseConfig(schoolId: string) {
  localStorage.setItem(schoolDatabaseConfigKey(schoolId), JSON.stringify({
    provider: 'database',
    enabled: false,
    url: '',
    anonKey: '',
    shareToDevices: false,
    savedAt: new Date().toISOString(),
  }));
  window.dispatchEvent(new CustomEvent('schofyDatabaseConfigChanged', { detail: { schoolId } }));
}

export function getSupabaseKeyRole(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return JSON.parse(json)?.role || null;
  } catch {
    return null;
  }
}

export function isServiceRoleKey(key: string) {
  return getSupabaseKeyRole(key) === 'service_role';
}

export function getActiveDatabaseConfig(schoolId?: string | null): SchoolDatabaseConfig | null {
  const custom = readSchoolDatabaseConfig(schoolId);
  if (custom) return custom.enabled ? custom : null;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return {
    provider: 'database',
    enabled: true,
    url: normalizeUrl(supabaseUrl),
    anonKey: supabaseAnonKey,
  };
}

export function getActiveSupabaseClient(schoolId?: string | null): SupabaseClient | null {
  const config = getActiveDatabaseConfig(schoolId);
  if (!config?.url || !config.anonKey) return null;
  return getSchofySupabaseClient(config.url, config.anonKey);
}

export function hasActiveSupabaseConfig(schoolId?: string | null) {
  return !!getActiveDatabaseConfig(schoolId);
}

export async function testSchoolDatabaseConnection(config: Pick<SchoolDatabaseConfig, 'url' | 'anonKey'>) {
  const url = normalizeUrl(config.url);
  const anonKey = config.anonKey.trim();
  if (!url || !anonKey) {
    return { success: false, message: 'Enter the database URL and public access key.' };
  }
  if (!/^https:\/\/.+/i.test(url)) {
    return { success: false, message: 'Use a secure HTTPS database URL.' };
  }
  if (isServiceRoleKey(anonKey)) {
    return { success: false, message: 'Do not paste an admin or service-role key. Use a limited public key only.' };
  }

  const client = getSchofySupabaseClient(url, anonKey);
  const { error } = await client.from('schools').select('id').limit(1);
  if (error) {
    return {
      success: false,
      message: `Database reached, but Schofy tables or permissions are not ready: ${error.message}`,
    };
  }
  return { success: true, message: 'Connected. Schofy tables are reachable.' };
}

export function toSharedSchoolDatabaseConfig(config: SchoolDatabaseConfig): SchoolDatabaseConfig {
  return {
    provider: 'database',
    enabled: true,
    url: normalizeUrl(config.url),
    anonKey: config.anonKey.trim(),
    shareToDevices: true,
    savedAt: new Date().toISOString(),
    lastCheckedAt: config.lastCheckedAt,
  };
}
