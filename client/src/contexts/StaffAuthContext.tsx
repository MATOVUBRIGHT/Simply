import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { checkRateLimit, clearFailedAttempts, hashPassword, recordFailedAttempt, verifyPassword } from '../lib/security';

export type StaffRole = 'teacher' | 'accountant' | 'librarian' | 'receptionist' | 'custom';

export interface StaffMember {
  id: string; staffId: string; schoolId: string;
  firstName: string; lastName: string; role: StaffRole;
  email: string; generatedEmail: string; phone: string;
  allowedPages: string[]; isActive: boolean; isReadOnly: boolean;
  lastLoginAt: string | null; createdAt: string;
}
export interface StaffSession { staffMember: StaffMember; loginAt: string; }
interface SavedStaffLogin {
  schoolId: string;
  normalizedName: string;
  passwordHash: string;
  staffMember: StaffMember;
  savedAt: string;
}

const STAFF_SESSION_KEY = 'schofy_staff_session';
const STAFF_SAVED_LOGIN_PREFIX = 'schofy_saved_staff_login_';
const STAFF_OFFLINE_CACHE_PREFIX = 'schofy_staff_offline_cache_';

export function buildGeneratedEmail(firstName: string, lastName: string, staffId: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean(firstName) + '.' + clean(lastName) + '.' + staffId.replace('-','').toLowerCase() + '@staff.schofy.app';
}

interface StaffAuthContextType {
  staffSession: StaffSession | null; staffLoading: boolean;
  staffLogout: () => void; isStaffMode: boolean; isReadOnly: boolean;
  canAccessPage: (path: string) => boolean;
  hasSavedStaffLogin: (schoolId: string) => boolean;
  clearSavedStaffLogin: (schoolId: string) => void;
  staffLogin: (schoolId: string, staffName: string, password: string, options?: { remember?: boolean }) => Promise<{ success: boolean; error?: string }>;
}

const StaffAuthContext = createContext<StaffAuthContextType>({
  staffSession: null, staffLoading: false,
  staffLogout: () => {}, isStaffMode: false, isReadOnly: false, canAccessPage: () => true,
  hasSavedStaffLogin: () => false,
  clearSavedStaffLogin: () => {},
  staffLogin: async () => ({ success: false, error: 'Staff sign-in is unavailable.' }),
});

function normalizeStaffName(staffName: string) {
  return staffName.trim().replace(/\s+/g, ' ').toLowerCase();
}

function savedStaffLoginPrefix(schoolId: string) {
  return `${STAFF_SAVED_LOGIN_PREFIX}${schoolId}_`;
}

function savedStaffLoginKey(schoolId: string, normalizedName: string) {
  return `${savedStaffLoginPrefix(schoolId)}${encodeURIComponent(normalizedName)}`;
}

function legacySavedStaffLoginKey(schoolId: string) {
  return `${STAFF_SAVED_LOGIN_PREFIX}${schoolId}`;
}

function staffOfflineCacheKey(schoolId: string) {
  return `${STAFF_OFFLINE_CACHE_PREFIX}${schoolId}`;
}

function rowToStaffMember(data: any): StaffMember {
  return {
    id: data.id,
    staffId: data.staff_id ?? data.staffId,
    schoolId: data.school_id ?? data.schoolId,
    firstName: data.first_name ?? data.firstName,
    lastName: data.last_name ?? data.lastName,
    role: data.role,
    email: data.email || '',
    generatedEmail: data.generated_email ?? data.generatedEmail ?? buildGeneratedEmail(data.first_name ?? data.firstName, data.last_name ?? data.lastName, data.staff_id ?? data.staffId),
    phone: data.phone || '',
    allowedPages: Array.isArray(data.allowed_pages) ? data.allowed_pages : Array.isArray(data.allowedPages) ? data.allowedPages : [],
    isActive: data.is_active ?? data.isActive ?? true,
    isReadOnly: data.is_read_only ?? data.isReadOnly ?? false,
    lastLoginAt: data.last_login_at ?? data.lastLoginAt ?? null,
    createdAt: data.created_at ?? data.createdAt ?? new Date().toISOString(),
  };
}

export function cacheStaffUsersForOffline(schoolId: string, rows: any[]) {
  if (!schoolId || !Array.isArray(rows)) return;
  try {
    const cached = rows
      .filter(row => row?.id && (row.password_hash || row.passwordHash))
      .map(row => ({
        id: row.id,
        school_id: row.school_id ?? row.schoolId ?? schoolId,
        staff_id: row.staff_id ?? row.staffId,
        first_name: row.first_name ?? row.firstName,
        last_name: row.last_name ?? row.lastName,
        role: row.role,
        email: row.email || '',
        phone: row.phone || '',
        generated_email: row.generated_email ?? row.generatedEmail ?? null,
        password_hash: row.password_hash ?? row.passwordHash,
        allowed_pages: Array.isArray(row.allowed_pages) ? row.allowed_pages : Array.isArray(row.allowedPages) ? row.allowedPages : [],
        is_active: row.is_active ?? row.isActive ?? true,
        is_read_only: row.is_read_only ?? row.isReadOnly ?? false,
        last_login_at: row.last_login_at ?? row.lastLoginAt ?? null,
        created_at: row.created_at ?? row.createdAt ?? new Date().toISOString(),
        updated_at: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
      }));
    localStorage.setItem(staffOfflineCacheKey(schoolId), JSON.stringify({ savedAt: new Date().toISOString(), rows: cached }));
    localStorage.setItem(`schofy_staff_gate_enabled_${schoolId}`, cached.length > 0 ? '1' : '0');
  } catch {}
}

function readCachedStaffUsers(schoolId: string): any[] {
  if (!schoolId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(staffOfflineCacheKey(schoolId)) || 'null');
    return Array.isArray(parsed?.rows) ? parsed.rows : [];
  } catch {
    localStorage.removeItem(staffOfflineCacheKey(schoolId));
    return [];
  }
}

function readStaffSession(): StaffSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAFF_SESSION_KEY) || 'null') as StaffSession | null;
    if (!parsed?.staffMember?.id || !parsed.staffMember.schoolId) return null;
    return parsed;
  } catch {
    localStorage.removeItem(STAFF_SESSION_KEY);
    return null;
  }
}

function saveStaffSession(session: StaffSession) {
  localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  useEffect(() => {
    setStaffSession(readStaffSession());
    setStaffLoading(false);
  }, []);

  function readSavedStaffLogin(schoolId: string, normalizedName: string): SavedStaffLogin | null {
    if (!schoolId || !normalizedName) return null;
    try {
      const exactKey = savedStaffLoginKey(schoolId, normalizedName);
      let saved = JSON.parse(localStorage.getItem(exactKey) || 'null') as SavedStaffLogin | null;
      if (!saved) {
        const legacy = JSON.parse(localStorage.getItem(legacySavedStaffLoginKey(schoolId)) || 'null') as SavedStaffLogin | null;
        if (legacy?.normalizedName === normalizedName) {
          saved = legacy;
          localStorage.setItem(exactKey, JSON.stringify(legacy));
          localStorage.removeItem(legacySavedStaffLoginKey(schoolId));
        }
      }
      if (!saved?.staffMember?.id || !saved.passwordHash || saved.schoolId !== schoolId) return null;
      return saved;
    } catch {
      localStorage.removeItem(savedStaffLoginKey(schoolId, normalizedName));
      return null;
    }
  }

  function hasSavedStaffLogin(schoolId: string): boolean {
    if (!schoolId) return false;
    const prefix = savedStaffLoginPrefix(schoolId);
    if (readCachedStaffUsers(schoolId).length > 0) return true;
    if (localStorage.getItem(legacySavedStaffLoginKey(schoolId))) return true;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) return true;
    }
    return false;
  }

  function clearSavedStaffLogin(schoolId: string) {
    try {
      const prefix = savedStaffLoginPrefix(schoolId);
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      localStorage.removeItem(legacySavedStaffLoginKey(schoolId));
      localStorage.removeItem(staffOfflineCacheKey(schoolId));
      if (staffSession?.staffMember.schoolId === schoolId) {
        localStorage.removeItem(STAFF_SESSION_KEY);
        setStaffSession(null);
      }
      window.dispatchEvent(new CustomEvent('schofySavedStaffLoginChanged'));
    } catch {}
  }

  function mapRow(data: any): StaffMember {
    return rowToStaffMember(data);
  }

  function staffLogout() {
    if (staffSession) void logActivity(staffSession.staffMember.schoolId, staffSession.staffMember.id, staffSession.staffMember.staffId, 'logout', staffSession.staffMember.firstName + ' ' + staffSession.staffMember.lastName + ' logged out');
    setStaffSession(null);
    try {
      localStorage.removeItem(STAFF_SESSION_KEY);
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('staffSignedOut'));
      window.dispatchEvent(new CustomEvent('dataRefresh'));
    } catch {}
  }

  async function staffLogin(schoolId: string, staffName: string, password: string, options?: { remember?: boolean }): Promise<{ success: boolean; error?: string }> {
    const cleanStaffName = staffName.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeStaffName(cleanStaffName);
    if (!schoolId || !normalizedName || !password) return { success: false, error: 'Enter staff name and password.' };

    const rateKey = `${schoolId}:${normalizedName}`;
    const rate = checkRateLimit(rateKey);
    if (!rate.allowed) {
      const minutes = Math.max(1, Math.ceil((rate.remainingMs || 0) / 60000));
      return { success: false, error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
    }

    async function trySavedOfflineLogin(): Promise<{ success: boolean; error?: string }> {
      const saved = readSavedStaffLogin(schoolId, normalizedName);
      if (!saved) return { success: false, error: 'Connect to the internet to start this shift, or save this staff login first.' };
      const enteredHash = await hashPassword(password);
      if (enteredHash !== saved.passwordHash) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'Invalid staff name or password.' };
      }
      clearFailedAttempts(rateKey);
      const session = { staffMember: saved.staffMember, loginAt: new Date().toISOString() };
      setStaffSession(session);
      saveStaffSession(session);
      return { success: true };
    }

    async function tryCachedOfflineLogin(): Promise<{ success: boolean; error?: string }> {
      const rows = readCachedStaffUsers(schoolId).filter(row => row?.is_active !== false);
      if (rows.length === 0) return { success: false, error: 'No offline staff credentials are saved on this device. Connect once as admin and open Roles & Access.' };
      const matches = rows.filter((staff: any) => {
        const fullName = `${staff.first_name || ''} ${staff.last_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
        const reverseName = `${staff.last_name || ''} ${staff.first_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
        return normalizedName === fullName || normalizedName === reverseName;
      });
      if (matches.length === 0) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'Invalid staff name or password.' };
      }
      if (matches.length > 1) return { success: false, error: 'More than one staff member has that name. Use the full first and last name exactly.' };
      const staffRow = matches[0];
      const verified = await verifyPassword(password, staffRow.password_hash || '');
      if (!verified) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'Invalid staff name or password.' };
      }
      clearFailedAttempts(rateKey);
      const now = new Date().toISOString();
      const member = mapRow({ ...staffRow, last_login_at: now });
      const session = { staffMember: member, loginAt: now };
      setStaffSession(session);
      saveStaffSession(session);
      localStorage.setItem(savedStaffLoginKey(schoolId, normalizedName), JSON.stringify({
        schoolId,
        normalizedName,
        passwordHash: staffRow.password_hash,
        staffMember: member,
        savedAt: now,
      } satisfies SavedStaffLogin));
      window.dispatchEvent(new CustomEvent('schofySavedStaffLoginChanged'));
      return { success: true };
    }

    async function tryAnyOfflineLogin(): Promise<{ success: boolean; error?: string }> {
      const saved = await trySavedOfflineLogin();
      if (saved.success) return saved;
      const cached = await tryCachedOfflineLogin();
      if (cached.success) return cached;
      return { success: false, error: cached.error || saved.error };
    }

    if (!supabase || !navigator.onLine) return tryAnyOfflineLogin();

    try {
      const { data, error } = await supabase
        .from('school_staff_users')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_active', true);
      if (!error && Array.isArray(data)) cacheStaffUsersForOffline(schoolId, data);

      const matches = (data || []).filter((staff: any) => {
        const fullName = `${staff.first_name || ''} ${staff.last_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
        const reverseName = `${staff.last_name || ''} ${staff.first_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
        return normalizedName === fullName || normalizedName === reverseName;
      });

      if (error || matches.length === 0) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'Invalid staff name or password.' };
      }
      if (matches.length > 1) {
        return { success: false, error: 'More than one staff member has that name. Use the full first and last name exactly.' };
      }

      const staffRow = matches[0];
      if (!staffRow.is_active) return { success: false, error: 'This staff role is inactive. Contact the admin.' };

      const verified = await verifyPassword(password, staffRow.password_hash || '');
      if (!verified) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'Invalid staff name or password.' };
      }

      clearFailedAttempts(rateKey);
      const now = new Date().toISOString();
      const member = mapRow({ ...staffRow, last_login_at: now });
      const session = { staffMember: member, loginAt: now };
      setStaffSession(session);
      saveStaffSession(session);
      const passwordHash = staffRow.password_hash || await hashPassword(password);
      const saved: SavedStaffLogin = { schoolId, normalizedName, passwordHash, staffMember: member, savedAt: now };
      localStorage.setItem(savedStaffLoginKey(schoolId, normalizedName), JSON.stringify(saved));
      window.dispatchEvent(new CustomEvent('schofySavedStaffLoginChanged'));
      void supabase.from('school_staff_users').update({ last_login_at: now, updated_at: now }).eq('id', staffRow.id);
      void logActivity(schoolId, staffRow.id, staffRow.staff_id, 'login', `${staffRow.first_name} ${staffRow.last_name} started shift`);
      return { success: true };
    } catch (error: any) {
      const offlineResult = await tryAnyOfflineLogin();
      if (offlineResult.success) return offlineResult;
      return { success: false, error: error?.message || offlineResult.error || 'Could not start role shift.' };
    }
  }

  function canAccessPage(path: string): boolean {
    if (!staffSession) return true;
    const allowed = staffSession.staffMember.allowedPages;
    if (!allowed || allowed.length === 0) return false;
    return allowed.some(p => path === p || path.startsWith(p + '/'));
  }

  return (
    <StaffAuthContext.Provider value={{ staffSession, staffLoading, staffLogout, staffLogin, hasSavedStaffLogin, clearSavedStaffLogin, isStaffMode: staffSession !== null, isReadOnly: staffSession?.staffMember.isReadOnly ?? false, canAccessPage }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() { return useContext(StaffAuthContext); }

async function logActivity(schoolId: string, staffUserId: string, staffId: string, action: string, description: string) {
  if (!supabase) return;
  try { await supabase.from('staff_activity_log').insert({ id: crypto.randomUUID(), school_id: schoolId, staff_user_id: staffUserId, staff_id: staffId, action, description, created_at: new Date().toISOString() }); } catch {}
}
export { logActivity as logStaffActivity };
