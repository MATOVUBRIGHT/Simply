const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, session, safeStorage, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const http = require('http');
const fs = require('fs');

let mainWindow;
let tray;
let zoomFactor = 1;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ZOOM_FILE = 'schofy-zoom.json';
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// ── Native backup directory ───────────────────────────────────────────────────
// Stores JSON backups in the app's userData directory — persists across updates,
// survives browser cache clears, and occupies real disk space like a desktop app.
function getBackupDir() {
  const dir = path.join(app.getPath('userData'), 'schofy-backup');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeKey(key) {
  // Prevent path traversal
  return key.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 100);
}

const ALLOWED_BACKUP_KEYS = new Set([
  'schofy_session',
  'schofy_data_cache',
  'schofy_offline_queue',
  'schofy_deleted_ids',
  'schofy_storage_wrapped_key',
  'schofy_storage_device_secret',
]);

function isTrustedIpcSender(event) {
  const url = event?.senderFrame?.url || '';
  if (!url) return false;
  if (url.startsWith('file://')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.port === '4201';
  } catch {
    return false;
  }
}

function validateBackupRequest(event, key) {
  if (!isTrustedIpcSender(event)) throw new Error('Untrusted renderer');
  const safe = sanitizeKey(String(key || ''));
  if (!ALLOWED_BACKUP_KEYS.has(safe)) throw new Error('Backup key is not allowed');
  return safe;
}

function encryptBackup(data) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable; refusing to write plaintext backup data.');
  }

  return JSON.stringify({
    version: 1,
    encrypted: true,
    encoding: 'base64',
    data: safeStorage.encryptString(data).toString('base64'),
  });
}

function decryptBackup(fileContents) {
  try {
    const parsed = JSON.parse(fileContents);
    if (parsed?.encrypted && parsed?.encoding === 'base64' && typeof parsed.data === 'string') {
      return safeStorage.decryptString(Buffer.from(parsed.data, 'base64'));
    }
    if (parsed?.encrypted === false && typeof parsed.data === 'string') {
      return parsed.data;
    }
  } catch {
    // Legacy desktop backups were stored as raw JSON strings.
  }

  return fileContents;
}

function getClientAssetPath(fileName) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'client-dist', fileName)
    : path.join(__dirname, '../client/public', fileName);
}

function getZoomFilePath() {
  return path.join(app.getPath('userData'), ZOOM_FILE);
}

function loadZoomFactor() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getZoomFilePath(), 'utf8'));
    const next = Number(parsed.zoomFactor);
    if (Number.isFinite(next)) {
      zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    }
  } catch {
    zoomFactor = 1;
  }
}

function saveZoomFactor() {
  try {
    fs.writeFileSync(getZoomFilePath(), JSON.stringify({ zoomFactor }), 'utf8');
  } catch {
    // Non-critical preference.
  }
}

function zoomPercent() {
  return Math.round(zoomFactor * 100);
}

function showZoomPercent() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const percent = zoomPercent();
  mainWindow.setTitle(`Schofy - School Management System (${percent}%)`);
  mainWindow.webContents.executeJavaScript(`
    (() => {
      const id = 'schofy-zoom-indicator';
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.style.cssText = 'position:fixed;right:18px;top:18px;z-index:2147483647;padding:8px 12px;border-radius:8px;background:rgba(15,23,42,.88);color:white;font:600 13px system-ui,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.24);transition:opacity .18s ease;pointer-events:none';
        document.body.appendChild(el);
      }
      el.textContent = 'Zoom ${percent}%';
      el.style.opacity = '1';
      clearTimeout(window.__schofyZoomTimer);
      window.__schofyZoomTimer = setTimeout(() => { el.style.opacity = '0'; }, 1200);
    })();
  `).catch(() => {});
}

function applyZoom(options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.setZoomFactor(zoomFactor);
  saveZoomFactor();
  showZoomPercent();
  if (options.rebuildMenu !== false) createMenu();
}

function changeZoom(delta) {
  zoomFactor = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((zoomFactor + delta) * 10) / 10));
  applyZoom();
}

function resetZoom() {
  zoomFactor = 1;
  applyZoom();
}

function createWindow() {
  loadZoomFactor();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Schofy',
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: getClientAssetPath('icon-512.png'),
    show: false,
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!input.control && !input.meta) return;
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '');
    const code = String(input.code || '');
    if (key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd') {
      event.preventDefault();
      changeZoom(ZOOM_STEP);
    } else if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
      event.preventDefault();
      changeZoom(-ZOOM_STEP);
    } else if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
      event.preventDefault();
      resetZoom();
    }
  });

  const isDev = process.env.NODE_ENV === 'development';

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (['https:', 'http:'].includes(parsed.protocol)) {
        shell.openExternal(parsed.toString());
      }
    } catch {
      // Ignore malformed renderer navigation attempts.
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = isDev ? 'http://localhost:4201' : 'file://';
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:4201').catch(err => {
      console.error('Failed to load dev URL:', err);
      mainWindow.show(); // Show anyway to reveal error/devTools
    });
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = app.isPackaged
      ? path.join(process.resourcesPath, 'client-dist', 'index.html')
      : path.join(__dirname, '../client/dist/index.html');

    mainWindow.loadURL(pathToFileURL(indexPath).toString()).catch(err => {
      console.error('Failed to load production file:', err);
      mainWindow.show();
    });
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Page failed to load: ${errorCode} - ${errorDescription}`);
    if (isDev) {
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="background:#1a1a1a;color:#fff;padding:20px;font-family:sans-serif;"><h1>Connection Failed</h1><p>Could not connect to the development server at <b>http://localhost:4201</b>.</p><p>Please ensure your web client is running: <code>npm run dev:client</code></p><button onclick="location.reload()" style="padding:10px 20px;cursor:pointer;">Retry</button></div>';
      `);
      mainWindow.show();
    }
  });

  mainWindow.once('ready-to-show', () => {
    applyZoom({ rebuildMenu: false });
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    app.isQuitting = true;
  });

  createMenu();
}

function createMenu() {
  const percent = zoomPercent();
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: `Zoom: ${percent}%`, enabled: false },
        { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: () => changeZoom(ZOOM_STEP) },
        { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => changeZoom(-ZOOM_STEP) },
        { label: 'Reset Zoom', accelerator: 'CommandOrControl+0', click: () => resetZoom() },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  const iconPath = getClientAssetPath('icon-512.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Schofy', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Schofy - School Management System');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.schofy.desktop');
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external', async (_event, url) => {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Only http and https links can be opened');
    }

    const approvedHosts = new Set([
      'github.com',
      'www.github.com',
      'github-releases.githubusercontent.com',
      'wa.me',
      'api.whatsapp.com',
      'supabase.com',
      'cloud.supabase.com',
      'schofy.com',
      'www.schofy.com',
    ]);

    if (!approvedHosts.has(parsed.hostname.toLowerCase())) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Open Link', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Open external link?',
        message: 'This link opens outside Schofy.',
        detail: parsed.toString(),
      });
      if (result.response !== 0) return { success: false, error: 'Open cancelled' };
    }

    await shell.openExternal(parsed.toString());
    return { success: true };
  } catch (error) {
    console.error('[external] Failed to open link:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-online', async () => {
  return new Promise((resolve) => {
    http.get('http://localhost:3001/api/health', (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
});

// ── Native file backup IPC handlers ───────────────────────────────────────────

ipcMain.handle('write-backup', async (event, key, data) => {
  try {
    const safe = validateBackupRequest(event, key);
    if (typeof data !== 'string' || data.length > 25 * 1024 * 1024) {
      throw new Error('Invalid backup payload');
    }
    const filePath = path.join(getBackupDir(), `${safe}.json`);
    fs.writeFileSync(filePath, encryptBackup(data), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('[backup] Write failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-backup', async (event, key) => {
  try {
    const safe = validateBackupRequest(event, key);
    const filePath = path.join(getBackupDir(), `${safe}.json`);
    if (!fs.existsSync(filePath)) return null;
    return decryptBackup(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('[backup] Read failed:', error);
    return null;
  }
});
