import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { dataService } from '../lib/database/SupabaseDataService';
import { usersApi } from '../services/apiService';
import { syncService } from '../services/sync';
import { generateUUID } from '../utils/uuid';

export interface LocalUser {
  id: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<{ success: boolean; user?: { id: string }; error?: string }>;
  logout: () => Promise<void>;
  isOnline: boolean;
  schoolId: string | null;
  isSupabaseAvailable: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'schofy_session';

function saveSession(user: LocalUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function getSession(): LocalUser | null {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  return null;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const stale = () => !active;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void restoreSessionWithGuard(stale);

    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function initializeSyncForUser(userData: LocalUser): Promise<void> {
    try {
      syncService.configure({ supabaseClient: supabase! });
      syncService.setUserId(userData.id);
      syncService.setSchoolId(userData.schoolId);
      localStorage.setItem('schofy_sync_enabled', 'true');
      if (navigator.onLine) {
        syncService.enableSync();
      }
    } catch (syncError) {
      console.warn('Failed to initialize sync service:', syncError);
    }

    try {
      await dataService.bootstrapSession(userData.id, userData.schoolId);
    } catch (syncBootstrapError) {
      console.warn('Data sync bootstrap failed:', syncBootstrapError);
    }

    // Apply persisted settings immediately so currency/schoolName are available
    try {
      const localKey = `schofy_settings_${userData.schoolId}`;
      const raw = localStorage.getItem(localKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj.currency) {
          localStorage.setItem('schofy_currency', obj.currency);
          window.dispatchEvent(new Event('currencyChanged'));
        }
        if (obj.schoolName) {
          window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: obj }));
        }
      }
    } catch { /* ignore */ }
  }

  async function restoreSessionWithGuard(stale: () => boolean) {
    const savedUser = getSession();
    const online = typeof navigator !== 'undefined' && navigator.onLine;

    if (!isSupabaseConfigured || !supabase) {
      if (savedUser && !stale()) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
      }
      if (!stale()) setLoading(false);
      return;
    }

    if (savedUser && online) {
      try {
        const { data, error } = await usersApi.getById(savedUser.id);

        if (stale()) return;

        if (error) {
          console.error('Session verify failed:', error);
          setUser(savedUser);
          setSchoolId(savedUser.schoolId);
          await userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
        } else if (!data) {
          clearSession();
          setUser(null);
          setSchoolId(null);
        } else {
          const userData: LocalUser = {
            id: data.id,
            schoolId: data.school_id || data.id,
            email: data.email,
            firstName: data.first_name,
            lastName: data.last_name,
            isActive: data.is_active,
            createdAt: data.created_at,
          };
          setUser(userData);
          setSchoolId(userData.schoolId);
          saveSession(userData);

          await userDBManager.openDatabase(userData.schoolId);
          await initializeSyncForUser(userData);
        }
      } catch (err) {
        if (stale()) return;
        console.error('Failed to verify session with cloud:', err);
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
      }
    } else if (savedUser && !online) {
      if (!stale()) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
        await userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
        // Initialize with cached data even offline
        await initializeSyncForUser(savedUser).catch(() => {});
      }
    }

    if (!stale()) setLoading(false);
  }

  async function login(email: string, _password: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase not configured. Cannot login.' };
    }

    if (!isOnline) {
      const savedUser = getSession();
      if (savedUser && savedUser.email === email) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
        await userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
        return { success: true };
      }
      return { success: false, error: 'You are offline. Please connect to login for the first time.' };
    }

    try {
      const { data, error } = await usersApi.getByEmail(email);

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'No account found with this email' };
      }

      if (!data.is_active) {
        return { success: false, error: 'This account has been deactivated' };
      }

      const userData: LocalUser = {
        id: data.id,
        schoolId: data.school_id || data.id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        isActive: data.is_active,
        createdAt: data.created_at,
      };

      setUser(userData);
      setSchoolId(userData.schoolId);
      saveSession(userData);

      await userDBManager.openDatabase(userData.schoolId);
      await initializeSyncForUser(userData);

      return { success: true };
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'Login failed' };
    }
  }

  async function register(
    email: string,
    _password: string,
    firstName: string,
    lastName: string
  ): Promise<{ success: boolean; user?: { id: string }; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase not configured. Cannot register.' };
    }

    if (!isOnline) {
      return { success: false, error: 'You are offline. Please connect to the internet to create an account.' };
    }

    try {
      const { data: existing } = await usersApi.emailExists(email);

      if (existing?.id) {
        return { success: false, error: 'An account with this email already exists' };
      }

      const newId = generateUUID();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('users')
        .upsert(
          {
            id: newId,
            school_id: newId,
            email: email.toLowerCase(),
            first_name: firstName,
            last_name: lastName,
            is_active: true,
            created_at: now,
            updated_at: now,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message };
      }

      const userData: LocalUser = {
        id: data.id,
        schoolId: data.school_id || data.id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        isActive: data.is_active,
        createdAt: data.created_at,
      };

      setUser(userData);
      setSchoolId(userData.schoolId);
      saveSession(userData);

      await userDBManager.openDatabase(userData.schoolId);
      await initializeSyncForUser(userData);

      return { success: true };
    } catch (error: any) {
      console.error('Registration error:', error);
      return { success: false, error: error.message || 'Registration failed' };
    }
  }

  async function logout() {
    clearSession();
    setUser(null);
    setSchoolId(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isOnline, schoolId, isSupabaseAvailable: isSupabaseConfigured && !!supabase }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export { userDBManager };


