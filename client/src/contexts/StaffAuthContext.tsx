/**
 * StaffAuthContext — manages sub-user (staff) sessions within a school.
 *
 * Design:
 * - School admin (main user) session is NEVER cleared when staff logs out.
 * - Staff session is stored separately under 'schofy_staff_session'.
 * - When staff logs out, only the staff session is cleared; admin session remains.
 * - Staff can only log in AFTER the school admin is already logged in.
 * - Staff login uses staffId + password (hashed with SHA-256).
 * - Page access is controlled by the allowedPages array on the staff record.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { verifyPassword, sanitizeText, checkRateLimit, recordFailedAttempt, clearFailedAttempts } from '../lib/security';

export type StaffRole = 'teacher' | 'accountant' | 'librarian' | 'receptionist' | 'custom';

export interface StaffMember {
  id: string;
  staffId: string; // e.g. TCH-001
  schoolId: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  email: string;
  phone: string;
  allowedPages: string[]; // e.g. ['/students', '/attendance']
  isActive: boolean;
  createdAt: string;
}

export interface StaffSession {
  staffMember: StaffMember;
  loginAt: string;
}

const STAFF_SESSION_KEY = 'schofy_staff_session';

interface StaffAuthContextType {
  staffSession: StaffSession | null;
  staffLoading: boolean;
  staffLogin: (staffId: string, password: string, schoolId: string) => Promise<{ success: boolean; error?: string }>;
  staffLogout: () => void;
  isStaffMode: boolean; // true when a staff member is the active user
  canAccessPage: (path: string) => boolean;
}

const StaffAuthContext = createContext<StaffAuthContextType>({
  staffSession: null,
  staffLoading: false,
  staffLogin: async () => ({ success: false }),
  staffLogout: () => {},
  isStaffMode: false,
  canAccessPage: () => true,
});

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  useEffect(() => {
    // Restore staff session from localStorage
    const saved = localStorage.getItem(STAFF_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StaffSession;
        // Staff sessions expire after 12 hours
        const loginTime = new Date(parsed.loginAt).getTime();
        if (Date.now() - loginTime < 12 * 60 * 60 * 1000) {
          setStaffSession(parsed);
        } else {
          localStorage.removeItem(STAFF_SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(STAFF_SESSION_KEY);
      }
    }
    setStaffLoading(false);
  }, []);

  async function staffLogin(
    staffId: string,
    password: string,
    schoolId: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanStaffId = sanitizeText(staffId).toUpperCase().trim();
    const rateLimitKey = `staff_${schoolId}_${cleanStaffId}`;

    // Rate limiting
    const { allowed, remainingMs } = checkRateLimit(rateLimitKey);
    if (!allowed) {
      const mins = Math.ceil((remainingMs || 0) / 60000);
      return { success: false, error: `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` };
    }

    if (!supabase) return { success: false, error: 'Not connected to server' };

    try {
      // Fetch staff member by staffId + schoolId
      const { data, error } = await supabase
        .from('school_staff_users')
        .select('*')
        .eq('staff_id', cleanStaffId)
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) return { success: false, error: 'Login failed. Please try again.' };
      if (!data) {
        recordFailedAttempt(rateLimitKey);
        return { success: false, error: 'Staff ID not found or account inactive.' };
      }

      // Verify password
      const passwordValid = await verifyPassword(password, data.password_hash);
      if (!passwordValid) {
        recordFailedAttempt(rateLimitKey);
        return { success: false, error: 'Incorrect password.' };
      }

      clearFailedAttempts(rateLimitKey);

      const member: StaffMember = {
        id: data.id,
        staffId: data.staff_id,
        schoolId: data.school_id,
        firstName: data.first_name,
        lastName: data.last_name,
        role: data.role,
        email: data.email || '',
        phone: data.phone || '',
        allowedPages: Array.isArray(data.allowed_pages) ? data.allowed_pages : [],
        isActive: data.is_active,
        createdAt: data.created_at,
      };

      const session: StaffSession = { staffMember: member, loginAt: new Date().toISOString() };
      setStaffSession(session);
      localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));

      // Log activity
      void logActivity(schoolId, member.id, member.staffId, 'login', 'Staff logged in');

      return { success: true };
    } catch {
      return { success: false, error: 'Login failed. Please try again.' };
    }
  }

  function staffLogout() {
    if (staffSession) {
      void logActivity(
        staffSession.staffMember.schoolId,
        staffSession.staffMember.id,
        staffSession.staffMember.staffId,
        'logout',
        'Staff logged out'
      );
    }
    setStaffSession(null);
    localStorage.removeItem(STAFF_SESSION_KEY);
    // NOTE: school admin session (schofy_session) is NOT touched here
  }

  function canAccessPage(path: string): boolean {
    if (!staffSession) return true; // admin mode — full access
    const allowed = staffSession.staffMember.allowedPages;
    if (!allowed || allowed.length === 0) return false;
    // Check exact match or prefix match
    return allowed.some(p => path === p || path.startsWith(p + '/'));
  }

  const isStaffMode = staffSession !== null;

  return (
    <StaffAuthContext.Provider value={{ staffSession, staffLoading, staffLogin, staffLogout, isStaffMode, canAccessPage }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  return useContext(StaffAuthContext);
}

// Log staff activity to Supabase
async function logActivity(
  schoolId: string,
  staffUserId: string,
  staffId: string,
  action: string,
  description: string
) {
  if (!supabase) return;
  try {
    await supabase.from('staff_activity_log').insert({
      id: crypto.randomUUID(),
      school_id: schoolId,
      staff_user_id: staffUserId,
      staff_id: staffId,
      action,
      description,
      created_at: new Date().toISOString(),
    });
  } catch { /* ignore — non-critical */ }
}

export { logActivity as logStaffActivity };
