export const SCHOFY_SYNC_ENABLED_KEY = 'schofy_sync_enabled';

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export function isCloudSyncEnabled(): boolean {
  if (!isDesktopApp()) return true;
  return localStorage.getItem(SCHOFY_SYNC_ENABLED_KEY) === 'true';
}

export function setCloudSyncEnabled(enabled: boolean): void {
  localStorage.setItem(SCHOFY_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('schofyCloudSyncPreferenceChanged', { detail: { enabled } }));
}
