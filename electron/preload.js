// Safe bridge between the game page and Electron
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tzNative', {
  quit: () => ipcRenderer.send('tz-quit'),
  openExternal: (url) => ipcRenderer.send('tz-open', String(url)),
  fullscreen: () => ipcRenderer.send('tz-fullscreen'),
  achievement: (id) => ipcRenderer.send('tz-achievement', id),
  steamName: () => ipcRenderer.sendSync('tz-steamname'),
  fs: {
    read: (name) => ipcRenderer.sendSync('fs-read', name),
    write: (name, data) => ipcRenderer.sendSync('fs-write', name, data),
    remove: (name) => ipcRenderer.sendSync('fs-remove', name),
  },
  server: {
    start: (opts) => ipcRenderer.invoke('srv-start', opts),
    stop: () => ipcRenderer.invoke('srv-stop'),
    update: (o) => ipcRenderer.send('srv-update', o),
  },
  lan: { scan: () => ipcRenderer.invoke('lan-scan'), ips: () => ipcRenderer.invoke('local-ips') },
});
