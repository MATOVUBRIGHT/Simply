import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { dataService, cacheReady } from '../lib/database/SupabaseDataService';
import { usersApi } from '../services/apiService';
import { serviceManager } from '../lib/ServiceManager';
import { readElectronBackup, writeElectronBackup } from '../lib/database/StorageManager';
import { generateUUID } from '../utils/uuid';
import { prefetchCriticalTables } from '../lib/store';
import { store } from '../lib/store';
import { getSubscriptionAccessState } from '../utils/plans';
import { isDesktopApp, setCloudSyncEnabled } from '../utils/desktopSyncPreference';
import { loginLocal, registerLocal } from '../lib/auth/LocalAuth';
import { createVerifiedPlanProof, readVerifiedPlanProof, restoreVerifiedPlanProof } from '../utils/planProof';
import { canUseUnlimitedAccountAccess } from '../utils/unlimitedAccess';
import {
  clearStorageEncryption,
  unlockStorageEncryption,
  unlockStorageEncryptionFromDesktopBackup,
} from '../lib/database/StorageCrypto';

export interface LocalUser {
  id: string;
  schoolId: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  localOnly?: boolean;
  adminLoginSaved?: boolean;
}

type AuthResult = { success: boolean; error?: string; localFallback?: boolean; fallbackMode?: 'login' | 'register' };

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  login: (email: string, password: string, options?: { rememberAdmin?: boolean }) => Promise<AuthResult>;
  register: (email: string, password: string, firstName: string, lastName: string, phone?: string) => Promise<AuthResult & { user?: { id: string }; needsVerification?: boolean }>;
  loginOffline: (email: string, password: string) => Promise<AuthResult>;
  registerOffline: (email: string, password: string, firstName: string, lastName: string) => Promise<AuthResult>;
  continueLocally: (profile: { email: string; password?: string; firstName?: string; lastName?: string; mode?: 'login' | 'register' }) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  resendVerification: (email: string) => Promise<{ success: boolean; error?: string }>;
  activateSecureLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isOnline: boolean;
  schoolId: string | null;
  isSupabaseAvailable: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'schofy_session';
const LOCAL_ONLY_SESSION_KEY = 'schofy_local_only_session';
const LOCAL_FALLBACK_REASON_KEY = 'schofy_local_fallback_reason';
const DESKTOP_OFFLINE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_SESSION_KEYS = [
  'schofy_sub_expiry',
  'schofy_sub_status',
  'schofy_sub_plan',
  'schofy_sub_pending',
  'schofy_sub_tid',
];

async function backupVerifiedPlan(tenantId: string | null | undefined) {
  if (!tenantId) return;
  const status = localStorage.getItem('schofy_sub_status');
  const pending = localStorage.getItem('schofy_sub_pending') === '1';
  const plan = localStorage.getItem('schofy_sub_plan');
  const expiryIso = localStorage.getItem('schofy_sub_expiry');
  const expiry = expiryIso ? new Date(expiryIso) : null;
  const active = status === 'active' || status === 'expiring';
  const notExpired = expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
  if (!active || pending || !plan || !notExpired) return;
  const verificationCodeHash = localStorage.getItem('schofy_plan_verification_code_hash') || undefined;
  const proofSource = verificationCodeHash ? 'verification_code' : 'remote_subscription';
  if (!canUseUnlimitedAccountAccess({ planId: plan, source: proofSource, verificationCodeHash })) return;

  await createVerifiedPlanProof({
    tenantId,
    schofy_sub_expiry: expiryIso!,
    schofy_sub_status: status!,
    schofy_sub_plan: plan!,
    schofy_sub_pending: '0',
    remoteVerifiedAt: localStorage.getItem('schofy_plan_remote_verified_at') || new Date().toISOString(),
    verificationCodeHash,
    source: proofSource,
  });
}

async function restoreVerifiedPlan(tenantId: string | null | undefined) {
  if (!tenantId) return false;
  return restoreVerifiedPlanProof(tenantId);
}

async function hasUsableVerifiedPlanBackup(tenantId: string | null | undefined) {
  if (!tenantId) return false;
  return Boolean(await readVerifiedPlanProof(tenantId));
}

function saveSession(user: LocalUser, options: { persistentAdmin?: boolean } = {}) {
  const now = Date.now();
  const shouldPersist = options.persistentAdmin || user.adminLoginSaved;
  const sessionUser = isDesktopApp()
    ? { ...user, adminLoginSaved: shouldPersist, sessionSavedAt: now, offlineExpiresAt: shouldPersist ? 0 : now + DESKTOP_OFFLINE_SESSION_MS }
    : user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  localStorage.setItem('schofy_current_user_id', user.id);
  localStorage.setItem('schofy_current_school_id', user.schoolId || user.id);
  void restoreVerifiedPlan(user.schoolId || user.id);
  void writeElectronBackup(SESSION_KEY, sessionUser);
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
  const tenantId = localStorage.getItem('schofy_current_school_id') || localStorage.getItem('schofy_current_user_id');
  void backupVerifiedPlan(tenantId);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('schofy_current_user_id');
  localStorage.removeItem('schofy_current_school_id');
  SUBSCRIPTION_SESSION_KEYS.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(LOCAL_ONLY_SESSION_KEY);
  localStorage.removeItem(LOCAL_FALLBACK_REASON_KEY);
  sessionStorage.removeItem('lastRoute');
  localStorage.removeItem('schofy_last_route');
  store.clearAll();
  void writeElectronBackup(SESSION_KEY, null);
}

function isRecoverableCloudProblem(error: any): boolean {
  const message = String(error?.message || error?.error_description || error || '').toLowerCase();
  const status = Number(error?.status || error?.code || 0);
  return (
    status === 402 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('quota') ||
    message.includes('resource exhausted') ||
    message.includes('too many requests') ||
    message.includes('service unavailable') ||
    message.includes('exceed_egress_quota')
  );
}

function markLocalUnlimitedAccess(user: LocalUser) {
  localStorage.setItem(`schofy_local_backup_email_${user.schoolId}`, user.email.toLowerCase());
}

function mapLocalAccount(user: any): LocalUser {
  return {
    id: user.id,
    schoolId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    localOnly: true,
  };
}

function isDesktopSessionExpired(user: any): boolean {
  if (!isDesktopApp()) return false;
  if (user?.adminLoginSaved) return false;
  const expiresAt = Number(user?.offlineExpiresAt || 0);
  return Boolean(expiresAt && Date.now() > expiresAt);
}

async function getLocalUserByEmail(email: string): Promise<LocalUser | null> {
  const { userIndexDB } = await import('../lib/database/UserIndexDB');
  const local = await userIndexDB.getUserByEmail(email.trim().toLowerCase());
  return local ? mapLocalAccount(local) : null;
}

async function getBackedUpSession(): Promise<LocalUser | null> {
  const local = getSession();
  if (local) {
    if (isDesktopApp() && isDesktopSessionExpired(local)) {
      clearSession();
      return null;
    }
    return local;
  }

  if (!isDesktopApp()) return null;
  const backedUp = await readElectronBackup(SESSION_KEY);
  if (backedUp?.id) {
    if (isDesktopSessionExpired(backedUp)) {
      clearSession();
      return null;
    }
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

    const { data: { subscription } } = supabase
      ? supabase.auth.onAuthStateChange((event) => {
      if (active) {
        if (event === 'SIGNED_OUT' && !localStorage.getItem(SESSION_KEY)) {
          setUser(null);
          setSchoolId(null);
          clearSession();
        }
      }
    })
      : { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('forceSignOutAllUsers', handleForceSignOut);
    };
  }, []);

  function initializeSyncForUser(userData: LocalUser, options: { wait?: boolean } = {}): void {
    const localOnly = userData.localOnly || localStorage.getItem(LOCAL_ONLY_SESSION_KEY) === 'true';
    if (localOnly) {
      const bootstrap = dataService.bootstrapSession(userData.id, userData.schoolId || userData.id);
      if (options.wait) {
        (userData as any)._bootstrapPromise = bootstrap;
      }
      prefetchCriticalTables(userData.schoolId || userData.id);
      import('../utils/recycleBin').then(({ hydrateRecycleBin }) => {
        void hydrateRecycleBin(userData.schoolId || userData.id);
      });
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
      return;
    }

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
      if (isDesktopApp()) {
        const desktopRestored = await unlockStorageEncryptionFromDesktopBackup(savedUser.id, savedUser.schoolId, savedUser.email);
        if (!desktopRestored) {
          clearSession();
          if (!stale()) setLoading(false);
          return;
        }
      } else if (online) {
        try {
          const { data, error } = await usersApi.getById(savedUser.id);
          if (stale()) return;
          if (data?.is_active === false) {
            clearSession();
            setUser(null);
            setSchoolId(null);
            setLoading(false);
            return;
          }
          if (!data || error) {
            throw error || new Error('Saved session could not be verified remotely.');
          }

          const userData: LocalUser = {
            id: data.id,
            schoolId: data.school_id || data.id,
            email: data.email,
            firstName: data.first_name,
            lastName: data.last_name,
            isActive: data.is_active,
            createdAt: data.created_at,
            adminLoginSaved: savedUser.adminLoginSaved,
          };
          saveSession(userData, { persistentAdmin: savedUser.adminLoginSaved });
          setUser(userData);
          setSchoolId(userData.schoolId);
          initializeSyncForUser(userData);
          setLoading(false);
          return;
        } catch {
          // If the browser still has a cached session but the network check fails,
          // keep the app usable from IndexedDB and let sync retry when online.
        }
      }

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

      // Desktop is allowed to restore a cached/offline session. Web waits for
      // authoritative Supabase verification and never accepts stale local state.
      if (!stale()) {
        setUser(savedUser);
        setSchoolId(savedUser.schoolId);
        setLoading(false);
      }

      initializeSyncForUser(savedUser);

      // Verify session with server in background for desktop cached sessions.
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
              adminLoginSaved: savedUser.adminLoginSaved,
            };
            saveSession(userData, { persistentAdmin: savedUser.adminLoginSaved });
            if (!stale()) { setUser(userData); setSchoolId(userData.schoolId); }
          }
        }).catch(() => {});
      }
      return;
    }

    if (!savedUser && online && !isDesktopApp()) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data } = await usersApi.getById(session.user.id);
          if (data?.is_active) {
            const userData: LocalUser = {
              id: data.id,
              schoolId: data.school_id || data.id,
              email: data.email,
              firstName: data.first_name,
              lastName: data.last_name,
              isActive: data.is_active,
              createdAt: data.created_at,
            };
            saveSession(userData);
            if (!stale()) {
              setUser(userData);
              setSchoolId(userData.schoolId);
            }
            initializeSyncForUser(userData);
          } else {
            clearSession();
          }
        }
      } catch {
        clearSession();
      }
      if (!stale()) setLoading(false);
      return;
    }

    if (!stale()) setLoading(false);
  }

  async function login(email: string, password: string, options: { rememberAdmin?: boolean } = {}): Promise<AuthResult> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        success: false,
        error: isDesktopApp() ? 'Cloud authentication is unavailable. You can continue locally on this desktop.' : 'Cloud space is not configured. Cannot login.',
        localFallback: isDesktopApp(),
        fallbackMode: 'login',
      };
    }

    if (!isOnline) {
      if (isDesktopApp()) {
        const localResult = await loginLocal(email.toLowerCase().trim(), password, { syncToCloud: false });
        if (localResult.success && localResult.user) {
          const userData = mapLocalAccount(localResult.user);
          if (!(await hasUsableVerifiedPlanBackup(userData.schoolId))) {
            return { success: false, error: 'Offline login requires an active Schofy plan already verified by code on this device. Connect to internet, send payment by WhatsApp, then enter your verification code on Plans.' };
          }
          await unlockStorageEncryption({
            userId: userData.id,
            schoolId: userData.schoolId,
            email: userData.email,
            password,
          });
          setCloudSyncEnabled(false);
          markLocalUnlimitedAccess(userData);
          saveSession({ ...userData, adminLoginSaved: options.rememberAdmin }, { persistentAdmin: options.rememberAdmin });
          await restoreVerifiedPlan(userData.schoolId);
          setUser(userData);
          setSchoolId(userData.schoolId);
          initializeSyncForUser(userData);
          return { success: true };
        }
      }
      return {
        success: false,
        error: isDesktopApp() ? 'You are offline. Continue locally on this desktop.' : 'You are offline. Please connect to login for the first time.',
        localFallback: isDesktopApp(),
        fallbackMode: 'login',
      };
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });
      if (authError || !authData.user) {
        if (isDesktopApp() && isRecoverableCloudProblem(authError)) {
          return {
            success: false,
            error: 'Cloud space could not be reached. You can keep working locally on this desktop.',
            localFallback: true,
            fallbackMode: 'login',
          };
        }
        const message = authError?.message || '';
        if (/confirm|verified/i.test(message)) {
          return { success: false, error: 'Please verify your email before signing in. Check your inbox for the verification link.' };
        }
        return { success: false, error: 'Invalid email or password. Use Forgot password if this account was created before secure email login was enabled.' };
      }
      if (!authData.user.email_confirmed_at) {
        await supabase.auth.signOut();
        return { success: false, error: 'Please verify your email before signing in. Check your inbox for the verification link.' };
      }

      const { data, error } = await usersApi.getById(authData.user.id);

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
      const cachedLocalUser = savedUser.localOnly
        ? await getLocalUserByEmail(savedUser.email).catch(() => null)
        : null;
      void userDBManager.openDatabase((cachedLocalUser?.schoolId || savedUser.schoolId)).catch(() => {});
            return { success: true };
          }
          // No cached session — create a minimal offline session so user can access the app
          // They'll see the subscription gate and can navigate to Plans
          return {
            success: false,
            error: 'Cloud space is currently unavailable. You can continue locally on this desktop.',
            localFallback: isDesktopApp(),
            fallbackMode: 'login',
          };
        }
        return { success: false, error: error.message };
      }

      let account = data;

      if (!account) {
        const { data: legacyAccount } = await usersApi.getByEmail(email);
        if (legacyAccount?.email?.toLowerCase() === authData.user.email?.toLowerCase()) {
          account = legacyAccount;
        }
      }

      if (!account) {
        const now = new Date().toISOString();
        const meta = authData.user.user_metadata || {};
        const firstName = String(meta.first_name || authData.user.email?.split('@')[0] || 'School');
        const lastName = String(meta.last_name || '');
        const phone = String(meta.phone || '');
        const { data: createdUser, error: createUserError } = await supabase
          .from('users')
          .upsert(
            {
              id: authData.user.id,
              school_id: authData.user.id,
              email: authData.user.email?.toLowerCase() || email.toLowerCase(),
              first_name: firstName,
              last_name: lastName,
              phone,
              is_active: true,
              created_at: now,
              updated_at: now,
            },
            { onConflict: 'id' }
          )
          .select()
          .single();

        if (createUserError || !createdUser) {
          return { success: false, error: createUserError?.message || 'Could not create your account profile' };
        }

        await supabase.from('schools').upsert({
          id: authData.user.id,
          name: `${firstName}'s School`,
          phone,
          email: authData.user.email?.toLowerCase() || email.toLowerCase(),
          updated_at: now,
        }, { onConflict: 'id' });

        account = createdUser;
      }

      if (!account) {
        return { success: false, error: 'No account found for this sign in' };
      }

      if (!account.is_active) {
        return { success: false, error: 'This account has been deactivated' };
      }

      const userData: LocalUser = {
        id: account.id,
        schoolId: account.school_id || account.id,
        email: account.email,
        firstName: account.first_name,
        lastName: account.last_name,
        isActive: account.is_active,
        createdAt: account.created_at,
      };

      await unlockStorageEncryption({
        userId: userData.id,
        schoolId: userData.schoolId,
        email: userData.email,
        password,
      });
      setUser(userData);
      setSchoolId(userData.schoolId);
      saveSession({ ...userData, adminLoginSaved: options.rememberAdmin }, { persistentAdmin: options.rememberAdmin });

      void userDBManager.openDatabase(userData.schoolId).catch(() => {});
      
      // If online, perform a full blocking sync before letting the user in.
      // Verified plan proof is restored locally so the account can continue offline later.
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
      if (isDesktopApp() && isRecoverableCloudProblem(error)) {
        return {
          success: false,
          error: 'Cloud space could not be reached. You can continue locally on this desktop.',
          localFallback: true,
          fallbackMode: 'login',
        };
      }
      return { success: false, error: error.message || 'Login failed' };
    }
  }

  async function register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone = ''
  ): Promise<AuthResult & { user?: { id: string }; needsVerification?: boolean }> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        success: false,
        error: isDesktopApp()
          ? 'Cloud registration is unavailable. Connect to internet to create an account, then activate a plan with a Schofy verification code.'
          : 'Cloud space is not configured. Cannot register.',
      };
    }

    if (!isOnline) {
      return {
        success: false,
        error: 'You are offline. Please connect to the internet to create an account and activate a plan with a Schofy verification code.',
      };
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone,
          },
        },
      });
      if (authError) {
        if (isDesktopApp() && isRecoverableCloudProblem(authError)) {
          return {
            success: false,
            error: 'Cloud space could not create the account right now. Connect to internet before creating an account or activating a plan.',
          };
        }
        return { success: false, error: authError.message };
      }

      const newId = authData.user?.id || generateUUID();
      const now = new Date().toISOString();
      if (!authData.session || !authData.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        return { success: true, user: { id: newId }, needsVerification: true };
      }

      const { data, error } = await supabase
        .from('users')
        .upsert(
          {
            id: newId,
            school_id: newId,
            email: email.toLowerCase(),
            first_name: firstName,
            last_name: lastName,
            phone,
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
        if (isDesktopApp() && isRecoverableCloudProblem(error)) {
          return {
            success: false,
            error: 'Cloud space could not save the account profile right now. Connect to internet before creating an account or activating a plan.',
          };
        }
        return { success: false, error: error.message };
      }

      // Also create the school record so foreign keys/tenant logic works in Supabase
      await supabase.from('schools').upsert({
        id: newId,
        name: `${firstName}'s School`,
        phone,
        email: email.toLowerCase(),
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

      await unlockStorageEncryption({
        userId: userData.id,
        schoolId: userData.schoolId,
        email: userData.email,
        password,
      });
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
      if (isDesktopApp() && isRecoverableCloudProblem(error)) {
        return {
          success: false,
          error: 'Cloud space could not be reached. Connect to internet before creating an account or activating a plan.',
        };
      }
      return { success: false, error: error.message || 'Registration failed' };
    }
  }

  async function continueLocally(profile: { email: string; password?: string; firstName?: string; lastName?: string; mode?: 'login' | 'register' }): Promise<AuthResult> {
    if (!isDesktopApp()) {
      return { success: false, error: 'Local sessions are available only in the desktop app.' };
    }

    const cleanEmail = profile.email.trim().toLowerCase();
    if (!cleanEmail) return { success: false, error: 'Enter an email first.' };

    if (profile.mode === 'register') {
      const result = await registerLocal(cleanEmail, profile.password || '', profile.firstName || 'School', profile.lastName || 'Admin', { syncToCloud: false });
      if (!result.success || !result.user) return { success: false, error: result.error || 'Offline registration failed' };
      const userData = mapLocalAccount(result.user);
      await unlockStorageEncryption({
        userId: userData.id,
        schoolId: userData.schoolId,
        email: userData.email,
        password: profile.password || '',
      });
      setCloudSyncEnabled(false);
      markLocalUnlimitedAccess(userData);
      localStorage.setItem(LOCAL_FALLBACK_REASON_KEY, 'locked_local_registration_pending_plan');
      saveSession(userData);
      setUser(userData);
      setSchoolId(userData.schoolId);
      initializeSyncForUser(userData);
      return { success: true };
    }

    const cleanPassword = profile.password || '';
    if (profile.mode === 'login' && !cleanPassword) {
      return {
        success: false,
        error: 'This desktop can only sign in offline with an existing offline account password. Cloud accounts must reconnect to the internet after logout.',
      };
    }

    if (cleanPassword) {
      const loginResult = await loginLocal(cleanEmail, cleanPassword, { syncToCloud: false });
      if (loginResult.success && loginResult.user) {
        const userData = mapLocalAccount(loginResult.user);
        if (!(await hasUsableVerifiedPlanBackup(userData.schoolId))) {
          return { success: false, error: 'This local account has no active verified plan. Connect to internet, open Plans, send payment by WhatsApp, then enter your Schofy verification code for offline access.' };
        }
        await unlockStorageEncryption({
          userId: userData.id,
          schoolId: userData.schoolId,
          email: userData.email,
          password: cleanPassword,
        });
        setCloudSyncEnabled(false);
        markLocalUnlimitedAccess(userData);
        localStorage.setItem(LOCAL_FALLBACK_REASON_KEY, 'cloud_unavailable');
        saveSession(userData);
        await restoreVerifiedPlan(userData.schoolId);
        setUser(userData);
        setSchoolId(userData.schoolId);
        initializeSyncForUser(userData);
        return { success: true };
      }

      if (profile.mode === 'login') {
        return { success: false, error: 'No matching verified local account exists on this desktop. Connect to internet to sign in or create an account.' };
      }
    }
    return { success: false, error: 'Local access requires an existing verified plan cache on this desktop. Connect to internet to activate with a verification code first.' };
  }

  async function loginOffline(email: string, password: string): Promise<AuthResult> {
    if (!isDesktopApp()) {
      return { success: false, error: 'Offline desktop login is available only in the desktop app.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { success: false, error: 'Enter your email and password.' };
    }

    const result = await loginLocal(cleanEmail, password, { syncToCloud: false });
    if (!result.success || !result.user) {
      return { success: false, error: result.error || 'Invalid local email or password' };
    }

    const userData = mapLocalAccount(result.user);
    if (!(await hasUsableVerifiedPlanBackup(userData.schoolId))) {
      return { success: false, error: 'This local account has no active verified plan. Connect to internet, open Plans, send payment by WhatsApp, then enter your Schofy verification code for offline access.' };
    }
    await unlockStorageEncryption({
      userId: userData.id,
      schoolId: userData.schoolId,
      email: userData.email,
      password,
    });
    setCloudSyncEnabled(false);
    markLocalUnlimitedAccess(userData);
    localStorage.setItem(LOCAL_FALLBACK_REASON_KEY, 'desktop_offline_auth');
    saveSession(userData);
    await restoreVerifiedPlan(userData.schoolId);
    setUser(userData);
    setSchoolId(userData.schoolId);
    initializeSyncForUser(userData);
    return { success: true };
  }

  async function registerOffline(email: string, password: string, firstName: string, lastName: string): Promise<AuthResult> {
    if (!isDesktopApp()) {
      return { success: false, error: 'Offline local account creation is available only in the desktop app.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const result = await registerLocal(cleanEmail, password, firstName || 'School', lastName || 'Admin', { syncToCloud: false });
    if (!result.success || !result.user) return { success: false, error: result.error || 'Offline registration failed' };
    const userData = mapLocalAccount(result.user);
    await unlockStorageEncryption({
      userId: userData.id,
      schoolId: userData.schoolId,
      email: userData.email,
      password,
    });
    setCloudSyncEnabled(false);
    markLocalUnlimitedAccess(userData);
    localStorage.setItem(LOCAL_FALLBACK_REASON_KEY, 'locked_offline_registration_pending_plan');
    saveSession(userData);
    setUser(userData);
    setSchoolId(userData.schoolId);
    initializeSyncForUser(userData);
    return { success: true };
  }

  async function sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Cloud space is not configured. Cannot send reset email.' };
    }

    if (!isOnline) {
      return { success: false, error: 'Please connect to the internet to reset your password.' };
    }

    const redirectTo = `${window.location.origin}/login`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), { redirectTo });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async function resendVerification(email: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Cloud space is not configured. Cannot resend verification.' };
    }

    if (!isOnline) {
      return { success: false, error: 'Please connect to the internet to resend verification.' };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.toLowerCase().trim(),
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async function activateSecureLogin(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Cloud space is not configured. Cannot activate secure login.' };
    }

    if (!isOnline) {
      return { success: false, error: 'Please connect to the internet to activate secure login.' };
    }

    if (password.length < 6) {
      return { success: false, error: 'Enter a password with at least 6 characters.' };
    }

    const { error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async function logout() {
    clearStorageEncryption();
    clearSession();
    setUser(null);
    setSchoolId(null);
    try {
      if (supabase) await supabase.auth.signOut();
      dataService.stopRealtimeSync();
      serviceManager.reset();
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold">Initializing workspace...</h2>
          <p className="text-gray-400 mt-2">Connecting to cloud space and restoring session</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginOffline, registerOffline, continueLocally, sendPasswordReset, resendVerification, activateSecureLogin, logout, isOnline, schoolId, isSupabaseAvailable: isSupabaseConfigured && !!supabase }}>
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


