const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, session, safeStorage } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let tray;

const TITLE_BAR_COLOR = '#4F46E5';
const TITLE_BAR_SYMBOL_COLOR = '#FFFFFF';
const TITLE_BAR_HEIGHT = 34;

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

function encryptBackup(data) {
  if (!safeStorage.isEncryptionAvailable()) {
    return JSON.stringify({ version: 1, encrypted: false, data });
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Schofy',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: TITLE_BAR_COLOR,
      symbolColor: TITLE_BAR_SYMBOL_COLOR,
      height: TITLE_BAR_HEIGHT,
    },
    backgroundColor: TITLE_BAR_COLOR,
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

    mainWindow.loadFile(indexPath).catch(err => {
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
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    app.isQuitting = true;
  });

  createMenu();
}

function createMenu() {
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
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
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

    await shell.openExternal(parsed.toString());
    return { success: true };
  } catch (error) {
    console.error('[external] Failed to open link:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-title-bar-theme', async (_event, theme = {}) => {
  if (!mainWindow || typeof mainWindow.setTitleBarOverlay !== 'function') {
    return { success: false };
  }

  const color = typeof theme.color === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(theme.color)
    ? theme.color
    : TITLE_BAR_COLOR;
  const symbolColor = typeof theme.symbolColor === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(theme.symbolColor)
    ? theme.symbolColor
    : TITLE_BAR_SYMBOL_COLOR;

  mainWindow.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
  mainWindow.setBackgroundColor(color);
  return { success: true };
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
    const safe = sanitizeKey(key);
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
    const safe = sanitizeKey(key);
    const filePath = path.join(getBackupDir(), `${safe}.json`);
    if (!fs.existsSync(filePath)) return null;
    return decryptBackup(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('[backup] Read failed:', error);
    return null;
  }
});
