/**
 * UUID Generation Utility with Fallback
 * Provides consistent UUID generation across all browsers
 */

/**
 * Generate a UUID v4 with fallback for browsers that don't support crypto.randomUUID
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      // Fall back to manual generation if native method fails
      console.warn('crypto.randomUUID failed, using fallback:', error);
    }
  }
  
  // Manual UUID v4 generation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a short ID (8 characters) for temporary identifiers
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Generate a timestamp-based ID
 */
export function generateTimestampId(): string {
  return `${Date.now()}-${generateShortId()}`;
}
