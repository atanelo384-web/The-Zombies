// =====================================================================
//  The Zombies — LAN server (runs in the Electron main process, or
//  standalone: `node electron/server.js` for a dedicated server).
//
//  One TCP port does everything:
//   • HTTP  — serves the game itself, so phones (Android / iPhone) and
//             other PCs just open  http://<ip>:27015  in a browser.
//   • /tz-info — JSON with server name, players, version (for discovery).
//   • WebSocket — relay between the hosting game and the players.
//     The hosting game connects as role=host; players connect as clients.
//     Every client message is forwarded to the host, the host addresses
//     clients by id. In dedicated (public) mode any device may become host.
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const BEACON_PORT = 41235;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
};
const SERVE_DIRS = ['css', 'js', 'fonts', 'assets', 'sounds'];
let httpSrv = null, wss = null, host = null, clients = new Map(), nextId = 1, beacon = null, info = {}, key = '', publicMode = false, root = '';

function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  // real LAN adapters first, virtual ones (VPN / VirtualBox / WSL) after
  const score = (ip) => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : ip.startsWith('26.') || ip.startsWith('25.') ? 3 : 4;
  return out.sort((a, b) => score(a) - score(b));
}

function serveFile(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (url === '/tz-info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(Object.assign({ tz: 2, host: !!host, open: publicMode && !host, port: info.port, ips: localIPs() }, info)));
  }
  if (url === '/' || url === '') url = '/index.html';
  const rel = path.normalize(url).replace(/^([/\\])+/, '');
  const top = rel.split(/[/\\]/)[0];
  if (rel !== 'index.html' && rel !== 'manifest.webmanifest' && !SERVE_DIRS.includes(top)) { res.writeHead(404); return res.end('not found'); }
  const file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// opts: { port, name, max, ver, root, public }
function start(opts) {
  return new Promise((resolve) => {
    stop();
    key = crypto.randomBytes(12).toString('hex');
    publicMode = !!opts.public;
    root = path.resolve(opts.root || path.join(__dirname, '..'));
    info = { name: opts.name || 'Сервер', max: opts.max || 8, ver: opts.ver, players: 0, port: opts.port };
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    httpSrv = http.createServer(serveFile);
    httpSrv.on('error', (e) => finish({ ok: false, error: e.code === 'EADDRINUSE' ? `Порт ${opts.port} уже занят` : e.message }));
    wss = new WebSocketServer({ server: httpSrv, maxPayload: 4 * 1024 * 1024 });
    wss.on('connection', onConnection);
    httpSrv.listen(opts.port, '0.0.0.0', () => { startBeacon(); finish({ ok: true, port: opts.port, key, ips: localIPs() }); });
  });
}

function onConnection(ws, req) {
  const url = new URL(req.url, 'http://x');
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  if (url.searchParams.get('role') === 'host') {
    const okKey = url.searchParams.get('key') === key;
    if (host || !(okKey || publicMode)) { send(ws, { sys: 'denied', why: host ? 'На этом сервере уже есть хост' : 'Нет доступа' }); return ws.close(); }
    host = ws; info.players = 1;
    send(ws, { sys: 'ok' });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.kick) { const c = clients.get(m.kick); if (c) c.close(); return; }
      if (m.info) { Object.assign(info, m.info); return; }
      if (m.to === '*') { for (const c of clients.values()) send(c, m.d); return; }
      const c = clients.get(m.to); if (c) send(c, m.d);
    });
    ws.on('close', () => {
      if (host !== ws) return;
      host = null; info.players = 0;
      for (const c of clients.values()) { send(c, { sys: 'hostgone' }); c.close(); }
      clients.clear();
      if (publicMode) console.log('Хост вышел. Сервер ждёт нового хоста.');
    });
    if (publicMode) console.log('Хост подключился:', req.socket.remoteAddress);
    return;
  }
  const id = String(nextId++);
  let joined = false;
  ws.on('message', (raw) => {
    if (!host) { send(ws, { sys: 'hostgone' }); return ws.close(); }
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!joined) { joined = true; clients.set(id, ws); info.players = clients.size + 1; send(host, { sys: 'join', id, d: m.d }); return; }
    send(host, { from: id, d: m });
  });
  ws.on('close', () => { if (clients.delete(id) && host) { info.players = clients.size + 1; send(host, { sys: 'leave', id }); } });
}

// drop dead connections (phones that went to sleep, lost Wi-Fi, ...)
setInterval(() => {
  if (!wss) return;
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { } }
}, 10000).unref();

function send(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function stop() {
  if (beacon) { clearInterval(beacon.t); try { beacon.s.close(); } catch (e) { } beacon = null; }
  if (wss) { for (const c of wss.clients) { try { c.terminate(); } catch (e) { } } try { wss.close(); } catch (e) { } wss = null; }
  if (httpSrv) { try { httpSrv.close(); } catch (e) { } httpSrv = null; }
  host = null; clients.clear();
}
function update(o) { Object.assign(info, o); }
function startBeacon() {
  try {
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('error', () => { });
    s.bind(() => { try { s.setBroadcast(true); } catch (e) { } });
    const t = setInterval(() => {
      if (!host && !publicMode) return;
      const msg = Buffer.from(JSON.stringify({ tz: 2, name: info.name, port: info.port, players: info.players, max: info.max, ver: info.ver, open: publicMode && !host }));
      try { s.send(msg, BEACON_PORT, '255.255.255.255'); } catch (e) { }
    }, 1000);
    beacon = { s, t };
  } catch (e) { }
}
function scan(ms = 1600) {
  return new Promise((resolve) => {
    const found = new Map();
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('message', (buf, rinfo) => { try { const m = JSON.parse(buf.toString()); if (m.tz === 2) found.set(rinfo.address + ':' + m.port, Object.assign(m, { addr: rinfo.address + ':' + m.port })); } catch (e) { } });
    s.on('error', () => { });
    try { s.bind(BEACON_PORT, () => { }); } catch (e) { }
    setTimeout(() => { try { s.close(); } catch (e) { } resolve([...found.values()]); }, ms);
  });
}
module.exports = { start, stop, update, scan, localIPs };

// ---------------------------------------------------------------- dedicated server from the command line
if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const port = +arg('port', 27015);
  let ver = '';
  try { ver = /VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8'))[1]; } catch (e) { }
  start({ port, name: arg('name', 'Выделенный сервер'), max: +arg('max', 16), ver, public: true }).then((r) => {
    if (!r.ok) { console.error('Не удалось запустить сервер:', r.error); process.exit(1); }
    console.log('\n  THE ZOMBIES — сервер запущен (версия ' + ver + ')\n');
    console.log('  Откройте на телефоне или другом ПК в той же сети:');
    for (const ip of r.ips) console.log('     http://' + ip + ':' + port);
    console.log('\n  Первый, кто нажмёт «Мультиплеер → Создать сервер», станет хостом мира.');
    console.log('  Для игры через интернет откройте TCP-порт ' + port + ' на роутере.\n  Остановить: Ctrl+C\n');
  });
}
