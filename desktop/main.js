// Nexusora Workforce — desktop shell (Electron).
// A thin, secure window onto the hosted web app. The app itself stays the web
// app; this just wraps it as an installable desktop application. The URL is
// configurable so the same build points at dev, staging or production.
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- App URL resolution (priority: env → user config.json → baked default) ----
// Baked default: set this to your production URL before building installers,
// or override at build/run time with WF_APP_URL.
const DEFAULT_URL = process.env.WF_APP_URL || 'https://app.nexusoraworkforce.com';

function resolveAppUrl() {
  if (process.env.WF_APP_URL) return process.env.WF_APP_URL;
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(cfgPath)) {
      const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (c && typeof c.appUrl === 'string' && c.appUrl) return c.appUrl;
    }
  } catch { /* fall through to default */ }
  return DEFAULT_URL;
}

const APP_URL = resolveAppUrl();
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#eef1f4',
    title: 'Nexusora Workforce',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,       // isolate app code from Electron internals
      nodeIntegration: false,       // no Node in the web content
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links (http/https to other origins, mailto, etc.) in the
  // user's real browser, not inside the app window.
  const appOrigin = (() => { try { return new URL(APP_URL).origin; } catch { return null; } })();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(url); } catch { /* ignore */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (appOrigin && new URL(url).origin !== appOrigin) { event.preventDefault(); shell.openExternal(url); }
    } catch { /* ignore */ }
  });

  // Friendly retry page if the app can't be reached (offline / wrong URL).
  mainWindow.webContents.on('did-fail-load', (e, code, desc, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;   // -3 = aborted (ignore)
    const html = `data:text/html,${encodeURIComponent(`
      <body style="margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#eef1f4;color:#1b2536;display:grid;place-items:center;height:100vh">
        <div style="text-align:center;max-width:420px;padding:24px">
          <div style="font-size:1.2rem;font-weight:800;color:#012158">Can’t reach Nexusora Workforce</div>
          <p style="color:#67728a;font-size:.9rem">${desc || 'The app server did not respond.'}<br>Check your connection, then retry.</p>
          <a href="${APP_URL}" style="display:inline-block;margin-top:8px;background:#012158;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700">Retry</a>
        </div>
      </body>`)}`;
    mainWindow.loadURL(html);
  });

  mainWindow.loadURL(APP_URL);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    { label: 'Edit', role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' },
    ] },
    { label: 'Window', role: 'windowMenu' },
    { label: 'Help', submenu: [
      { label: 'Open in browser', click: () => shell.openExternal(APP_URL) },
      { label: 'About', click: () => dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Nexusora Workforce',
        message: 'Nexusora Workforce', detail: `Version ${app.getVersion()}\nConnected to: ${APP_URL}`,
      }) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Single-instance: focus the existing window instead of opening a second.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
