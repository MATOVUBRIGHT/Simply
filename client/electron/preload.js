/**
 * Electron preload script — exposes safe IPC bridges to the renderer.
 * contextIsolation: true means we must use contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Write a JSON backup to the native userData directory */
  writeBackup: (key, data) => ipcRenderer.invoke('write-backup', key, data),

  /** Read a JSON backup from the native userData directory */
  readBackup: (key) => ipcRenderer.invoke('read-backup', key),

  /** Get the app version */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /** Check if the backend is reachable */
  checkOnline: () => ipcRenderer.invoke('check-online'),
});
