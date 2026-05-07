const fs=require('fs');

// ── StaffAuthContext ──────────────────────────────────────────────────────────
const staffCtx = `import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { verifyPassword, sanitizeText, checkRateLimit, recordFailedAttempt, clearFailedAttempts } from '../lib/security';

export type StaffRole = 'teacher' | 'accountant' | 'librarian' | 'receptionist' | 'custom';

export interface StaffMember {
  id: string; staffId: string; schoolId: string;
  firstName: string; lastName: string; role: StaffRole;
  email: string; generatedEmail: string; phone: string;
  allowedPages: string[]; isActive: boolean; isReadOnly: boolean;
  lastLoginAt: string | null; createdAt: string;
}
export interface StaffSession { staffMember: StaffMember; loginAt: string; }

const STAFF_SESSION_KEY = 'schofy_staff_session';

export function buildGeneratedEmail(firstName: string, lastName: string, staffId: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean(firstName) + '.' + clean(lastName) + '.' + staffId.replace('-','').toLowerCase() + '@staff.schofy.app';
}
export function isStaffEmail(email: string): boolean { return email.endsWith('@staff.schofy.app'); }

interface StaffAuthContextType {
  staffSession: StaffSession | null; staffLoading: boolean;
  staffLogin: (staffId: string, password: string, schoolId: string) => Promise<{ success: boolean; error?: string }>;
  staffLoginByEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  staffLogout: () => void; isStaffMode: boolean; isReadOnly: boolean;
  canAccessPage: (path: string) => boolean;
}

const StaffAuthContext = createContext<StaffAuthContextType>({
  staffSession: null, staffLoading: false,
  staffLogin: async () => ({ success: false }),
  staffLoginByEmail: async () => ({ success: false }),
  staffLogout: () => {}, isStaffMode: false, isReadOnly: false, canAccessPage: () => true,
});

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [staffLoading, setStaffLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STAFF_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StaffSession;
        if (Date.now() - new Date(parsed.loginAt).getTime() < 12 * 60 * 60 * 1000) {
          setStaffSession(parsed);
        } else { localStorage.removeItem(STAFF_SESSION_KEY); }
      } catch { localStorage.removeItem(STAFF_SESSION_KEY); }
    }
    setStaffLoading(false);
  }, []);

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

  async function doLogin(data: any, schoolId: string) {
    const member = mapRow(data);
    const now = new Date().toISOString();
    const session: StaffSession = { staffMember: member, loginAt: now };
    setStaffSession(session);
    localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
    if (supabase) void supabase.from('school_staff_users').update({ last_login_at: now }).eq('id', data.id).then(() => {});
    void logActivity(schoolId, data.id, data.staff_id, 'login', data.first_name + ' ' + data.last_name + ' logged in');
  }

  async function staffLogin(staffId: string, password: string, schoolId: string): Promise<{ success: boolean; error?: string }> {
    const cleanId = sanitizeText(staffId).toUpperCase().trim();
    const rlk = 'staff_' + schoolId + '_' + cleanId;
    const { allowed, remainingMs } = checkRateLimit(rlk);
    if (!allowed) return { success: false, error: 'Too many attempts. Try again in ' + Math.ceil((remainingMs||0)/60000) + ' min.' };
    if (!supabase) return { success: false, error: 'Not connected' };
    try {
      const { data, error } = await supabase.from('school_staff_users').select('*').eq('staff_id', cleanId).eq('school_id', schoolId).eq('is_active', true).maybeSingle();
      if (error || !data) { recordFailedAttempt(rlk); return { success: false, error: 'Staff ID not found or inactive.' }; }
      if (!await verifyPassword(password, data.password_hash)) { recordFailedAttempt(rlk); return { success: false, error: 'Incorrect password.' }; }
      clearFailedAttempts(rlk);
      await doLogin(data, schoolId);
      return { success: true };
    } catch { return { success: false, error: 'Login failed.' }; }
  }

  async function staffLoginByEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const cleanEmail = sanitizeText(email).toLowerCase().trim();
    if (!isStaffEmail(cleanEmail)) return { success: false, error: 'Not a staff email.' };
    const rlk = 'staff_email_' + cleanEmail;
    const { allowed, remainingMs } = checkRateLimit(rlk);
    if (!allowed) return { success: false, error: 'Too many attempts. Try again in ' + Math.ceil((remainingMs||0)/60000) + ' min.' };
    if (!supabase) return { success: false, error: 'Not connected' };
    try {
      const { data, error } = await supabase.from('school_staff_users').select('*').eq('generated_email', cleanEmail).eq('is_active', true).maybeSingle();
      if (error || !data) { recordFailedAttempt(rlk); return { success: false, error: 'Account not found or inactive.' }; }
      if (!await verifyPassword(password, data.password_hash)) { recordFailedAttempt(rlk); return { success: false, error: 'Incorrect password.' }; }
      clearFailedAttempts(rlk);
      await doLogin(data, data.school_id);
      return { success: true };
    } catch { return { success: false, error: 'Login failed.' }; }
  }

  function staffLogout() {
    if (staffSession) void logActivity(staffSession.staffMember.schoolId, staffSession.staffMember.id, staffSession.staffMember.staffId, 'logout', staffSession.staffMember.firstName + ' ' + staffSession.staffMember.lastName + ' logged out');
    setStaffSession(null);
    localStorage.removeItem(STAFF_SESSION_KEY);
  }

  function canAccessPage(path: string): boolean {
    if (!staffSession) return true;
    const allowed = staffSession.staffMember.allowedPages;
    if (!allowed || allowed.length === 0) return false;
    return allowed.some(p => path === p || path.startsWith(p + '/'));
  }

  return (
    <StaffAuthContext.Provider value={{ staffSession, staffLoading, staffLogin, staffLoginByEmail, staffLogout, isStaffMode: staffSession !== null, isReadOnly: staffSession?.staffMember.isReadOnly ?? false, canAccessPage }}>
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
`;
fs.writeFileSync('src/contexts/StaffAuthContext.tsx', staffCtx);
console.log('StaffAuthContext:', fs.statSync('src/contexts/StaffAuthContext.tsx').size);
