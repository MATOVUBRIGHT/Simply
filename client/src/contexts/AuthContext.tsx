import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { userDBManager } from '../lib/database/UserDatabaseManager';

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
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🌐 Online - syncing with cloud');
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('📴 Offline - using local data');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    restoreSession();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function restoreSession() {
    const savedUser = getSession();
    
    if (!isSupabaseConfigured || !supabase) {
      console.log('Supabase not configured');
      if (savedUser) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
      }
      setLoading(false);
      return;
    }

    if (savedUser && isOnline) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', savedUser.id)
          .single();

        if (error && error.code === 'PGRST116') {
          console.log('User not found in Supabase, clearing session');
          clearSession();
          setUser(null);
          setSchoolId(null);
        } else if (data) {
          const userData: LocalUser = {
            id: data.id,
            schoolId: data.school_id,
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
          
          // Initialize sync service for restored session
          try {
            const { syncService } = await import('../services/sync');
            if (supabase) {
              syncService.configure({ supabaseClient: supabase });
              syncService.setUserId(userData.id);
              syncService.setSchoolId(userData.schoolId);
              
              // Enable sync automatically for restored sessions
              localStorage.setItem('schofy_sync_enabled', 'true');
              if (navigator.onLine) {
                syncService.enableSync();
                console.log('🔄 Auto-sync enabled for restored session:', userData.email);
              }
            }
          } catch (syncError) {
            console.warn('Failed to initialize sync service during session restore:', syncError);
          }
          
          console.log('Session restored from cloud');
        }
      } catch (err) {
        console.error('Failed to verify session with cloud:', err);
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
      }
    } else if (savedUser && !isOnline) {
      console.log('Offline - using cached session');
      setUser(savedUser);
      setSchoolId(savedUser.schoolId);
      
      await userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
    } else {
      setLoading(false);
    }
    
    setLoading(false);
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
        return { success: true };
      }
      return { success: false, error: 'You are offline. Please connect to login for the first time.' };
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: false, error: 'No account found with this email' };
        }
        return { success: false, error: error.message };
      }

      if (!data.is_active) {
        return { success: false, error: 'This account has been deactivated' };
      }

      const userData: LocalUser = {
        id: data.id,
        schoolId: data.school_id,
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

      // Initialize sync service for this user
      try {
        const { syncService } = await import('../services/sync');
        if (supabase) {
          syncService.configure({ supabaseClient: supabase });
          syncService.setUserId(userData.id);
          syncService.setSchoolId(userData.schoolId);
          
          // Enable sync automatically for logged in users
          localStorage.setItem('schofy_sync_enabled', 'true');
          if (navigator.onLine) {
            syncService.enableSync();
            console.log('🔄 Auto-sync enabled for user:', userData.email);
          }
        }
      } catch (syncError) {
        console.warn('Failed to initialize sync service:', syncError);
      }

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
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (existing) {
        return { success: false, error: 'An account with this email already exists' };
      }

      const { data, error } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          first_name: firstName,
          last_name: lastName,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message };
      }

      const userData: LocalUser = {
        id: data.id,
        schoolId: data.school_id,
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

      // Initialize sync service for this user
      try {
        const { syncService } = await import('../services/sync');
        if (supabase) {
          syncService.configure({ supabaseClient: supabase });
          syncService.setUserId(userData.id);
          syncService.setSchoolId(userData.schoolId);
          
          // Enable sync by default for new users
          localStorage.setItem('schofy_sync_enabled', 'true');
          if (navigator.onLine) {
            syncService.enableSync();
            console.log('🔄 Auto-sync enabled for new user:', userData.email);
          }
        }
      } catch (syncError) {
        console.warn('Failed to initialize sync service:', syncError);
      }

      return { success: true, user: { id: userData.id } };
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
