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

function savedStaffLoginKey(schoolId: string) {
  return `${STAFF_SAVED_LOGIN_PREFIX}${schoolId}`;
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STAFF_SESSION_KEY) || 'null') as StaffSession | null;
      if (saved?.staffMember?.id && saved?.staffMember?.schoolId) {
        setStaffSession(saved);
      }
    } catch {
      localStorage.removeItem(STAFF_SESSION_KEY);
    }
    setStaffLoading(false);
  }, []);

  function readSavedStaffLogin(schoolId: string): SavedStaffLogin | null {
    if (!schoolId) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(savedStaffLoginKey(schoolId)) || 'null') as SavedStaffLogin | null;
      if (!saved?.staffMember?.id || !saved.passwordHash || saved.schoolId !== schoolId) return null;
      return saved;
    } catch {
      localStorage.removeItem(savedStaffLoginKey(schoolId));
      return null;
    }
  }

  function hasSavedStaffLogin(schoolId: string): boolean {
    return !!readSavedStaffLogin(schoolId);
  }

  function clearSavedStaffLogin(schoolId: string) {
    try {
      localStorage.removeItem(savedStaffLoginKey(schoolId));
      if (staffSession?.staffMember.schoolId === schoolId) {
        localStorage.removeItem(STAFF_SESSION_KEY);
        setStaffSession(null);
      }
      window.dispatchEvent(new CustomEvent('schofySavedStaffLoginChanged'));
    } catch {}
  }

  function mapRow(data: any): StaffMember {
    return {
      id: data.id, staffId: data.staff_id, schoolId: data.school_id,
      firstName: data.first_name, lastName: data.last_name, role: data.role,
      email: data.email || '',
      generatedEmail: data.generated_email || buildGeneratedEmail(data.first_name, data.last_name, data.staff_id),
      phone: data.phone || '',
      allowedPages: Array.isArray(data.allowed_pages) ? data.allowed_pages : [],
      isActive: data.is_active, isReadOnly: data.is_read_only || false,
      lastLoginAt: data.last_login_at || null, createdAt: data.created_at,
    };
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
    const normalizedName = cleanStaffName.toLowerCase();
    if (!schoolId || !normalizedName || !password) return { success: false, error: 'Enter staff name and password.' };

    const rateKey = `${schoolId}:${normalizedName}`;
    const rate = checkRateLimit(rateKey);
    if (!rate.allowed) {
      const minutes = Math.max(1, Math.ceil((rate.remainingMs || 0) / 60000));
      return { success: false, error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
    }

    async function trySavedOfflineLogin(): Promise<{ success: boolean; error?: string }> {
      const saved = readSavedStaffLogin(schoolId);
      if (!saved) return { success: false, error: 'Connect to the internet to start this shift, or save this staff login first.' };
      if (saved.normalizedName !== normalizedName) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'This saved offline login is for a different staff member.' };
      }
      const enteredHash = await hashPassword(password);
      if (enteredHash !== saved.passwordHash) {
        recordFailedAttempt(rateKey);
        return { success: false, error: 'Invalid staff name or password.' };
      }
      clearFailedAttempts(rateKey);
      const session = { staffMember: saved.staffMember, loginAt: new Date().toISOString() };
      setStaffSession(session);
      localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
      return { success: true };
    }

    if (!supabase || !navigator.onLine) return trySavedOfflineLogin();

    try {
      const { data, error } = await supabase
        .from('school_staff_users')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_active', true);

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
      if (options?.remember) {
        const passwordHash = staffRow.password_hash || await hashPassword(password);
        const saved: SavedStaffLogin = { schoolId, normalizedName, passwordHash, staffMember: member, savedAt: now };
        localStorage.setItem(savedStaffLoginKey(schoolId), JSON.stringify(saved));
        localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
        window.dispatchEvent(new CustomEvent('schofySavedStaffLoginChanged'));
      } else {
        localStorage.removeItem(STAFF_SESSION_KEY);
      }
      void supabase.from('school_staff_users').update({ last_login_at: now, updated_at: now }).eq('id', staffRow.id);
      void logActivity(schoolId, staffRow.id, staffRow.staff_id, 'login', `${staffRow.first_name} ${staffRow.last_name} started shift`);
      return { success: true };
    } catch (error: any) {
      const offlineResult = await trySavedOfflineLogin();
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
