const ENCRYPTED_MARKER = '__schofyEncrypted';
const CRYPTO_VERSION = 1;
const DESKTOP_KEY_BACKUP = 'schofy_storage_wrapped_key';
const DEVICE_SECRET_BACKUP = 'schofy_storage_device_secret';

let activeKey: CryptoKey | null = null;
let activeIdentity = '';

function hasCrypto(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function readBackup(key: string): Promise<any | null> {
  try {
    const raw = await window.electronAPI?.readBackup?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeBackup(key: string, value: any): Promise<void> {
  try {
    await window.electronAPI?.writeBackup?.(key, JSON.stringify(value));
  } catch {
    /* best effort */
  }
}

async function getDeviceSecret(): Promise<Uint8Array> {
  const backedUp = isElectron() ? await readBackup(DEVICE_SECRET_BACKUP) : null;
  if (typeof backedUp?.secret === 'string') return base64ToBytes(backedUp.secret);

  const secret = crypto.getRandomValues(new Uint8Array(32));
  if (isElectron()) {
    await writeBackup(DEVICE_SECRET_BACKUP, { secret: bytesToBase64(secret), createdAt: new Date().toISOString() });
  }
  return secret;
}

async function importRawAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', exactBuffer(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function unlockStorageEncryption(opts: {
  userId: string;
  schoolId: string;
  email: string;
  password: string;
}): Promise<void> {
  if (!hasCrypto() || !opts.password) return;

  const deviceSecret = await getDeviceSecret();
  const identity = `${opts.schoolId}:${opts.userId}:${opts.email.toLowerCase()}`;
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${opts.email.toLowerCase()}:${opts.password}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  activeKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`${bytesToBase64(deviceSecret)}:${opts.schoolId}`),
      iterations: 210000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  activeIdentity = identity;

  if (isElectron()) {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', activeKey));
    await writeBackup(DESKTOP_KEY_BACKUP, {
      identity,
      key: bytesToBase64(raw),
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function unlockStorageEncryptionFromDesktopBackup(userId?: string, schoolId?: string, email?: string): Promise<boolean> {
  if (!hasCrypto() || !isElectron() || activeKey) return !!activeKey;
  const backedUp = await readBackup(DESKTOP_KEY_BACKUP);
  if (typeof backedUp?.key !== 'string') return false;

  const expected = userId && schoolId && email ? `${schoolId}:${userId}:${email.toLowerCase()}` : '';
  if (expected && backedUp.identity !== expected) return false;

  activeKey = await importRawAesKey(base64ToBytes(backedUp.key));
  activeIdentity = backedUp.identity || expected;
  return true;
}

export function clearStorageEncryption(): void {
  activeKey = null;
  activeIdentity = '';
}

export function isEncryptedPayload(value: any): boolean {
  return !!value && value[ENCRYPTED_MARKER] === true;
}

export async function encryptJson<T>(value: T): Promise<T | any> {
  if (!hasCrypto() || !activeKey) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, activeKey, plaintext);
  return {
    [ENCRYPTED_MARKER]: true,
    version: CRYPTO_VERSION,
    identity: activeIdentity,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptJson<T>(value: any): Promise<T | null> {
  if (!isEncryptedPayload(value)) return value as T;
  if (!hasCrypto()) return null;
  if (!activeKey) {
    await unlockStorageEncryptionFromDesktopBackup();
  }
  if (!activeKey) return null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: exactBuffer(base64ToBytes(value.iv)) },
      activeKey,
      exactBuffer(base64ToBytes(value.data))
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    return null;
  }
}
