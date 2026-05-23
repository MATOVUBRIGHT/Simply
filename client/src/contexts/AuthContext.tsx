import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { dataService, cacheReady } from '../lib/database/SupabaseDataService';
import { usersApi } from '../services/apiService';
import { serviceManager } from '../lib/ServiceManager';
import { readElectronBackup, writeElectronBackup } from '../lib/database/StorageManager';
import { generateUUID } from '../utils/uuid';
import { prefetchCriticalTables } from '../lib/store';
import { getSubscriptionAccessState } from '../utils/plans';

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
  void writeElectronBackup(SESSION_KEY, user);
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

async function getBackedUpSession(): Promise<LocalUser | null> {
  const local = getSession();
  if (local) return local;

  const backedUp = await readElectronBackup(SESSION_KEY);
  if (backedUp?.id) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(backedUp));
    return backedUp as LocalUser;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Ensure loading is false only after auth state is resolved
  useEffect(() => {
    let active = true;

    // Get initial session state
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (active) setLoading(false);
      }).catch(() => {
        if (active) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleForceSignOut = () => {
      clearSession();
      setUser(null);
      setSchoolId(null);
    };
    window.addEventListener('forceSignOutAllUsers', handleForceSignOut);

    let active = true;
    const stale = () => !active;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void restoreSessionWithGuard(stale);

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      if (active) {
        if (event === 'INITIAL_SESSION') {
          setLoading(false);
        }
        
        if (session?.user) {
          const userData: LocalUser = {
            id: session.user.id,
            schoolId: localStorage.getItem('schofy_current_school_id') || session.user.id,
            email: session.user.email || '',
            firstName: '', lastName: '', isActive: true, createdAt: new Date().toISOString()
          };
          setUser(userData);
          setSchoolId(userData.schoolId);
          // Centralized initialization - ServiceManager handles staged startup
          initializeSyncForUser(userData);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setSchoolId(null);
          clearSession();
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('forceSignOutAllUsers', handleForceSignOut);
    };
  }, []);

  function initializeSyncForUser(userData: LocalUser, options: { wait?: boolean } = {}): void {
    // Trigger staged initialization via ServiceManager
    const bootstrap = serviceManager.initialize(userData.id, userData.schoolId || userData.id);

    if (options.wait) {
      // Return the promise so it can be awaited
      (userData as any)._bootstrapPromise = bootstrap;
    }

    prefetchCriticalTables(userData.schoolId || userData.id);

    // Pre-hydrate recycle bin from IndexedDB so first read is instant
    import('../utils/recycleBin').then(({ hydrateRecycleBin }) => {
      void hydrateRecycleBin(userData.schoolId || userData.id);
    });

    // Apply persisted settings immediately
    try {
      const raw = localStorage.getItem(`schofy_settings_${userData.schoolId}`);
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
    const savedUser = await getBackedUpSession();
    const online = typeof navigator !== 'undefined' && navigator.onLine;

    if (!isSupabaseConfigured || !supabase) {
      if (savedUser && !stale()) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
        initializeSyncForUser(savedUser);
      }
      if (!stale()) setLoading(false);
      return;
    }

    if (savedUser) {
      // Background initialization
      void userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
      
      // Ensure the cache is ready before we stop loading
      // This ensures SubscriptionGate sees the correct data on first render
      try {
        await Promise.race([
          cacheReady,
          new Promise(resolve => setTimeout(resolve, 2000))
        ]);
      } catch { /* proceed anyway after 2s */ }

      if (!stale()) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
        setLoading(false); 
      }
      
      initializeSyncForUser(savedUser);

      // Verify session with server in background (non-blocking)
      if (online) {
        usersApi.getById(savedUser.id).then(({ data, error }) => {
          if (stale()) return;
          if (!data && !error) {
            clearSession(); setUser(null); setSchoolId(null);
          } else if (data) {
            const userData: LocalUser = {
              id: data.id, schoolId: data.school_id || data.id,
              email: data.email, firstName: data.first_name,
              lastName: data.last_name, isActive: data.is_active,
              createdAt: data.created_at,
            };
            saveSession(userData);
            if (!stale()) { setUser(userData); setSchoolId(userData.schoolId); }
          }
        }).catch(() => {});
      }
      return;
    }

    if (!stale()) setLoading(false);
  }

  async function login(email: string, _password: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Supabase not configured. Cannot login.' };
    }

    if (!isOnline) {
      const savedUser = await getBackedUpSession();
      if (savedUser && savedUser.email === email) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
        void userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
        return { success: true };
      }
      return { success: false, error: 'You are offline. Please connect to login for the first time.' };
    }

    try {
      const { data, error } = await usersApi.getByEmail(email);

      // If Supabase returns 402 (egress quota exceeded), fall back to cached session
      // so the user can still access the app and navigate to Plans to resolve billing
      if (error) {
        const is402 = error.message?.includes('402') ||
          error.message?.includes('Payment Required') ||
          error.message?.includes('exceed_egress_quota');
        if (is402) {
          // Try cached session first
          const savedUser = await getBackedUpSession();
          if (savedUser && savedUser.email.toLowerCase() === email.toLowerCase()) {
            setUser(savedUser);
            setSchoolId(savedUser.schoolId);
            void userDBManager.openDatabase(savedUser.schoolId).catch(() => {});
            return { success: true };
          }
          // No cached session — create a minimal offline session so user can access the app
          // They'll see the subscription gate and can navigate to Plans
          const offlineId = generateUUID();
          const offlineUser: LocalUser = {
            id: offlineId,
            schoolId: offlineId,
            email: email.toLowerCase(),
            firstName: email.split('@')[0],
            lastName: '',
            isActive: true,
            createdAt: new Date().toISOString(),
          };
          setUser(offlineUser);
          setSchoolId(offlineUser.schoolId);
          saveSession(offlineUser);
          void userDBManager.openDatabase(offlineUser.schoolId).catch(() => {});
          return { success: true };
        }
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

      void userDBManager.openDatabase(userData.schoolId).catch(() => {});
      
      // If online, perform a full blocking sync before letting the user in
      // This ensures "unlimited offline access" is ready immediately
      if (isOnline) {
        initializeSyncForUser(userData, { wait: true });
        if ((userData as any)._bootstrapPromise) {
          await (userData as any)._bootstrapPromise;
        }
      } else {
        initializeSyncForUser(userData);
      }

      // Record last login time for admin analytics (fire and forget)
      if (supabase) {
        const now = new Date().toISOString();
        const sid = userData.schoolId;
        void (async () => {
          try {
            const { data } = await supabase!.from('settings').select('value').eq('school_id', sid).eq('key', 'loginCount').single();
            const count = parseInt(String(data?.value || '0')) + 1;
            await supabase!.from('settings').upsert([
              { school_id: sid, key: 'lastLoginAt', value: now, updated_at: now },
              { school_id: sid, key: 'loginCount', value: String(count), updated_at: now },
            ], { onConflict: 'school_id,key' });
          } catch { /* ignore */ }
        })();
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

      // Also create the school record so foreign keys/tenant logic works in Supabase
      await supabase.from('schools').upsert({
        id: newId,
        name: `${firstName}'s School`,
        updated_at: now
      }, { onConflict: 'id' });

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

      void userDBManager.openDatabase(userData.schoolId).catch(() => {});
      
      // Full sync for first-time setup
      if (isOnline) {
        initializeSyncForUser(userData, { wait: true });
        if ((userData as any)._bootstrapPromise) {
          await (userData as any)._bootstrapPromise;
        }
      } else {
        initializeSyncForUser(userData);
      }

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
    try {
      if (supabase) await supabase.auth.signOut();
      dataService.stopRealtimeSync();
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold">Initializing workspace...</h2>
          <p className="text-gray-400 mt-2">Connecting to Supabase and restoring session</p>
        </div>
      </div>
    );
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


