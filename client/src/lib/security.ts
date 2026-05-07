/**
 * Security utilities — input sanitization, validation, injection prevention.
 * All user input should pass through these before being stored or displayed.
 */

// Strip HTML tags and dangerous characters to prevent XSS
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '') // strip angle brackets (HTML tags)
    .replace(/javascript:/gi, '') // strip JS protocol
    .replace(/on\w+\s*=/gi, '') // strip event handlers
    .trim();
}

// Sanitize for use in display (encode HTML entities)
export function escapeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

// Validate password strength
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 6) return { valid: false, error: 'Password must be at least 6 characters' };
  if (password.length > 128) return { valid: false, error: 'Password too long' };
  return { valid: true };
}

// Sanitize a staff ID (alphanumeric + dash/underscore only)
export function sanitizeStaffId(id: string): string {
  return id.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 32);
}

// Hash a password client-side using SHA-256 (for local staff auth only)
// NOTE: This is NOT a replacement for server-side hashing — it's a lightweight
// client-side check so plaintext passwords are never stored in localStorage.
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'schofy_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify a hashed password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}

// Rate limiting — track failed login attempts in memory
const failedAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(identifier: string): { allowed: boolean; remainingMs?: number } {
  const now = Date.now();
  const record = failedAttempts.get(identifier);

  if (!record) return { allowed: true };

  // Reset if lockout period has passed
  if (now - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.delete(identifier);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const remainingMs = LOCKOUT_MS - (now - record.lastAttempt);
    return { allowed: false, remainingMs };
  }

  return { allowed: true };
}

export function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const record = failedAttempts.get(identifier);
  if (!record || now - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.set(identifier, { count: 1, lastAttempt: now });
  } else {
    failedAttempts.set(identifier, { count: record.count + 1, lastAttempt: now });
  }
}

export function clearFailedAttempts(identifier: string): void {
  failedAttempts.delete(identifier);
}

// Sanitize an object's string fields recursively
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeText(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
