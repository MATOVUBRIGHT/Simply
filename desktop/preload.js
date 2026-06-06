/**
 * Electron preload script — exposes safe IPC bridges to the renderer.
 * contextIsolation: true means we must use contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_BACKUP_KEYS = new Set([
  'schofy_session',
  'schofy_data_cache',
  'schofy_offline_queue',
  'schofy_deleted_ids',
  'schofy_storage_wrapped_key',
  'schofy_storage_device_secret',
]);

function assertBackupKey(key) {
  if (!ALLOWED_BACKUP_KEYS.has(String(key))) {
    throw new Error('Backup key is not allowed');
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  /** Write a JSON backup to the native userData directory */
  writeBackup: (key, data) => {
    assertBackupKey(key);
    return ipcRenderer.invoke('write-backup', key, data);
  },

  /** Read a JSON backup from the native userData directory */
  readBackup: (key) => {
    assertBackupKey(key);
    return ipcRenderer.invoke('read-backup', key);
  },

  /** Get the app version */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /** Open a trusted update/download link in the user's default browser */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /** Check if the backend is reachable */
  checkOnline: () => ipcRenderer.invoke('check-online'),
});
