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

  /** Open a trusted update/download link in the user's default browser */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  /** Match the native title bar to the current app theme */
  setTitleBarTheme: (theme) => ipcRenderer.invoke('set-title-bar-theme', theme),

  /** Check if the backend is reachable */
  checkOnline: () => ipcRenderer.invoke('check-online'),
});
