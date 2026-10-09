// The Zombies — Electron entry point (desktop / Steam build)
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
let server = null;
try { server = require('./server'); } catch (e) { console.log('LAN server unavailable:', e.message); }

// ---- optional Steamworks (achievements, overlay) ----
let steam = null;
try {
  const idFile = path.join(path.dirname(app.getPath('exe')), 'steam_appid.txt');
  const devId = path.join(__dirname, '..', 'steam', 'steam_appid.txt');
  const file = fs.existsSync(idFile) ? idFile : devId;
  const appId = fs.existsSync(file) ? parseInt(fs.readFileSync(file, 'utf8').trim(), 10) : 0;
  if (appId) { const sw = require('steamworks.js'); steam = sw.init(appId); sw.electronEnableSteamOverlay(); }
} catch (e) { console.log('Steam not available:', e.message); steam = null; }

// ---- saves: one JSON file per key in the user data folder ----
const saveDir = () => { const d = path.join(app.getPath('userData'), 'saves'); fs.mkdirSync(d, { recursive: true }); return d; };
const safe = (n) => String(n).replace(/[^a-z0-9_\-]/gi, '_');
ipcMain.on('fs-read', (e, name) => { try { e.returnValue = fs.readFileSync(path.join(saveDir(), safe(name) + '.json'), 'utf8'); } catch (err) { e.returnValue = null; } });
ipcMain.on('fs-write', (e, name, data) => { try { const f = path.join(saveDir(), safe(name) + '.json'); fs.writeFileSync(f + '.tmp', data); fs.renameSync(f + '.tmp', f); e.returnValue = true; } catch (err) { e.returnValue = false; } });
ipcMain.on('fs-remove', (e, name) => { try { fs.unlinkSync(path.join(saveDir(), safe(name) + '.json')); } catch (err) { } e.returnValue = true; });

// ---- multiplayer ----
ipcMain.handle('srv-start', (e, opts) => server ? server.start(Object.assign({}, opts, { root: path.join(__dirname, '..') })) : { ok: false, error: 'Модуль сервера не установлен (npm install)' });
ipcMain.handle('srv-stop', () => { if (server) server.stop(); return true; });
ipcMain.on('srv-update', (e, o) => { if (server) server.update(o); });
ipcMain.handle('lan-scan', () => server ? server.scan() : []);
ipcMain.handle('local-ips', () => server ? server.localIPs() : []);

let win;
function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 640, backgroundColor: '#0b0d09', title: 'The Zombies', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.setFullScreen(true); win.show(); });
}
ipcMain.on('tz-quit', () => app.quit());
ipcMain.on('tz-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('tz-achievement', (_e, id) => { if (!steam) return; try { steam.achievement.activate(String(id).toUpperCase()); } catch (e) { } });
ipcMain.on('tz-steamname', (e) => { try { e.returnValue = steam ? steam.localplayer.getName() : null; } catch (err) { e.returnValue = null; } });

app.whenReady().then(() => {
  // voice chat: allow the game page to use the microphone
  try { const { session } = require('electron'); session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media' || perm === 'fullscreen' || perm === 'pointerLock')); session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' || perm === 'fullscreen'); } catch (e) { }
  createWindow();
});
app.on('window-all-closed', () => { if (server) server.stop(); app.quit(); });
