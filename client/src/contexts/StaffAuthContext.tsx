import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

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

interface StaffAuthContextType {
  staffSession: StaffSession | null; staffLoading: boolean;
  staffLogout: () => void; isStaffMode: boolean; isReadOnly: boolean;
  canAccessPage: (path: string) => boolean;
}

const StaffAuthContext = createContext<StaffAuthContextType>({
  staffSession: null, staffLoading: false,
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

  function staffLogout() {
    if (staffSession) void logActivity(staffSession.staffMember.schoolId, staffSession.staffMember.id, staffSession.staffMember.staffId, 'logout', staffSession.staffMember.firstName + ' ' + staffSession.staffMember.lastName + ' logged out');
    setStaffSession(null);
    // Remove staff session and also clear the main user session so regular users don't see admin data
    try {
      localStorage.removeItem(STAFF_SESSION_KEY);
      localStorage.removeItem('schofy_session');
    } catch {}
    // Notify the app and other tabs
    try {
      window.dispatchEvent(new CustomEvent('staffSignedOut'));
      window.dispatchEvent(new CustomEvent('forceSignOutAllUsers'));
      window.dispatchEvent(new CustomEvent('dataRefresh'));
    } catch {}
  }

  function canAccessPage(path: string): boolean {
    if (!staffSession) return true;
    const allowed = staffSession.staffMember.allowedPages;
    if (!allowed || allowed.length === 0) return false;
    return allowed.some(p => path === p || path.startsWith(p + '/'));
  }

  return (
    <StaffAuthContext.Provider value={{ staffSession, staffLoading, staffLogout, isStaffMode: staffSession !== null, isReadOnly: staffSession?.staffMember.isReadOnly ?? false, canAccessPage }}>
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
