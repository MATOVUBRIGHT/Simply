import { userIndexDB, UserAccount } from '../database/UserIndexDB';
import { userDBManager } from '../database/UserDatabaseManager';
import { supabase, isSupabaseConfigured } from '../supabase';
import { generateUUID } from '../../utils/uuid';

const PBKDF2_ITERATIONS = 100000;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;

async function syncUserToSupabase(user: UserAccount): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    console.log('Supabase not configured, skipping cloud sync');
    return { success: true };
  }

  if (!supabase) {
    console.log('Supabase client is null, skipping cloud sync');
    return { success: true };
  }

  try {
    const payload = {
      id: user.id,
      school_id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      is_active: user.isActive,
      created_at: user.createdAt,
      updated_at: user.updatedAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' }).select();

    if (error) {
      if (error.code === '42501' || String(error.message || '').includes('permission')) {
        return {
          success: false,
          error: 'Supabase RLS policy blocked write — check dashboard policies.',
        };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Exception: ${msg}` };
  }
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    HASH_LENGTH * 8
  );
  
  const saltHex = arrayBufferToHex(salt.buffer);
  const hashHex = arrayBufferToHex(hash);
  
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(':');
    if (parts.length !== 2) {
      console.error('Invalid hash format:', storedHash);
      return false;
    }
    
    const [saltHex, hashHex] = parts;
    const encoder = new TextEncoder();
    
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const derivedHash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: hexToArrayBuffer(saltHex),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      HASH_LENGTH * 8
    );
    
    const derivedHashHex = arrayBufferToHex(derivedHash);
    return derivedHashHex === hashHex;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

export interface AuthResult {
  success: boolean;
  user?: UserAccount;
  error?: string;
}

export async function registerLocal(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<AuthResult> {
  const startTime = performance.now();
  
  try {
    console.log('Registration attempt for:', email);
    const existingUser = await userIndexDB.getUserByEmail(email);
    if (existingUser) {
      console.log('User already exists');
      return { success: false, error: 'Email already registered' };
    }

    console.log('Hashing password...');
    const passwordHash = await hashPassword(password);
    console.log('Password hash length:', passwordHash.length);

    const user = await userIndexDB.createUser({
      email,
      passwordHash,
      firstName,
      lastName,
      databasePath: `schofy_user_db_${generateUUID()}`,
      isActive: true,
    });
    console.log('User created in IndexedDB:', user.id);

    await userDBManager.openDatabase(user.id);

    // Sync to Supabase immediately if configured
    console.log('Attempting to sync to Supabase...');
    const syncResult = await syncUserToSupabase(user);
    if (!syncResult.success) {
      console.warn('Supabase sync failed during registration:', syncResult.error);
      // Don't fail registration if Supabase is down - user can work offline
    } else {
      console.log('User successfully synced to Supabase');
    }

    await userIndexDB.saveSession({
      lastUserId: user.id,
      sessionStart: new Date().toISOString(),
    });

    const elapsed = performance.now() - startTime;
    console.log(`Registration completed in ${elapsed.toFixed(2)}ms`);

    return { success: true, user };
  } catch (error: any) {
    console.error('Registration error:', error);
    return { success: false, error: error.message || 'Registration failed' };
  }
}

export async function loginLocal(
  email: string,
  password: string
): Promise<AuthResult> {
  const startTime = performance.now();
  
  try {
    console.log('Login attempt for email:', email);
    const user = await userIndexDB.getUserByEmail(email);
    console.log('User found:', user ? 'yes' : 'no', user?.email);
    
    if (!user) {
      console.log('User not found in database');
      return { success: false, error: 'Invalid email or password' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Account is deactivated' };
    }

    console.log('Verifying password...');
    const isValid = await verifyPassword(password, user.passwordHash);
    console.log('Password valid:', isValid);
    
    if (!isValid) {
      return { success: false, error: 'Invalid email or password' };
    }

    await userDBManager.openDatabase(user.id);
    
    await userIndexDB.updateLastLogin(user.id);

    // Sync to Supabase if configured
    const syncResult = await syncUserToSupabase(user);
    if (!syncResult.success) {
      console.warn('Supabase sync failed during login:', syncResult.error);
      // Don't fail login if Supabase is down - user can work offline
    } else {
      console.log('User synced to Supabase during login');
    }

    await userIndexDB.saveSession({
      lastUserId: user.id,
      sessionStart: new Date().toISOString(),
    });

    const elapsed = performance.now() - startTime;
    console.log(`Login completed in ${elapsed.toFixed(2)}ms`);

    return { success: true, user };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: error.message || 'Login failed' };
  }
}

export async function getLastSession(): Promise<UserAccount | null> {
  try {
    const session = await userIndexDB.getSession();
    
    if (!session?.lastUserId) {
      return null;
    }

    const user = await userIndexDB.getUserById(session.lastUserId);
    
    if (!user || !user.isActive) {
      return null;
    }

    await userDBManager.openDatabase(user.id);
    
    return user;
  } catch (error) {
    console.error('Failed to get last session:', error);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await userIndexDB.clearSession();
  } catch (error) {
    console.error('Logout error:', error);
  }
}
