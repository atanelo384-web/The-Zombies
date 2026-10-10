'use strict';
// =====================================================================
//  THE ZOMBIES 5.0 — online server
//  One process: website, web version of the game, REST API, realtime relay.
//  Run:  node index.js        (Node 22.13+; settings in config.json)
// =====================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const U = require('./lib/util');
const R = require('../js/rules.js');

const ROOT = __dirname;
const cfg = require('./lib/config').load(ROOT);
const DBFILE = path.join(cfg.dataDir, 'tz.db');
fs.mkdirSync(cfg.dataDir, { recursive: true });
const Backup = require('./lib/backup');
(async () => {
try { if (!fs.existsSync(DBFILE)) await Backup.restore(cfg, DBFILE); } catch (e) { console.error('Не удалось восстановить базу из Turso:', e.message); if (cfg.turso && cfg.turso.url) { console.error('Остановка, чтобы не затереть копию пустой базой. Проверьте TURSO_URL и TURSO_TOKEN.'); process.exit(1); } }
const db = require('./lib/db').open(DBFILE);
const backup = Backup.start(cfg, db, DBFILE);
db.onWrite = () => backup.dirty();
const mail = require('./lib/mail'); mail.init(cfg);

const ctx = { db, cfg, mail, FRAMES: R.FRAMES, BGS: R.BGS, AVATARS: R.AVATARS };
ctx.isOnline = () => false; ctx.playingOf = () => null; ctx.push = () => { };
const A = ctx.A = require('./lib/accounts')(ctx);
const S = ctx.S = require('./lib/social')(ctx);
const RT = ctx.RT = require('./lib/realtime')(ctx);
const SH = ctx.SH = require('./lib/shop')(ctx);

// admins from config get the role on start
for (const e of cfg.adminEmails) db.run("UPDATE users SET role = 'admin' WHERE email = ?", e);

// ---------------------------------------------------------------- routes
const routes = [];
const on = (method, pattern, fn, opt = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, opt });
const body = (fn) => async (req, p, q) => fn(req, await U.readJson(req), p, q);

// auth
on('POST', '/api/auth/register', body(A.register));
on('POST', '/api/auth/verify', body(A.verify));
on('POST', '/api/auth/resend', body(A.resend));
on('POST', '/api/auth/login', body(A.login));
on('POST', '/api/auth/google', body(A.google));
on('POST', '/api/auth/apple', body(A.apple));
on('POST', '/api/auth/forgot', body(A.forgot));
on('POST', '/api/auth/reset', body(A.reset));
on('POST', '/api/auth/password', body(A.changePassword));
on('POST', '/api/auth/email', body(A.linkEmail));
on('POST', '/api/auth/device/start', (req) => A.deviceStart(req));
on('POST', '/api/auth/device/approve', body(A.deviceApprove));
on('POST', '/api/auth/device/poll', body(A.devicePoll));
on('POST', '/api/auth/logout', (req) => A.logout(req));
on('POST', '/api/auth/logout-all', (req) => A.logoutAll(req));
on('GET', '/api/config', () => ({ version: R.VERSION, google: cfg.googleClientId || null, apple: cfg.appleClientId || null, pay: !!(cfg.yoomoney.wallet && cfg.yoomoney.secret), serverPrice: cfg.serverPrice, url: cfg.publicUrl }));
// me / progress
on('GET', '/api/me', (req) => ({ me: A.selfView(A.auth(req)) }));
on('PATCH', '/api/me', body(A.updateMe));
on('POST', '/api/progress', body(A.progress));
on('POST', '/api/classes/buy', body(A.buyClass));
on('POST', '/api/kits/buy', body(A.buyKit));
on('POST', '/api/kits/claim', body(A.claimKit));
on('GET', '/api/skins', (req) => A.mySkins(req));
on('POST', '/api/skins', async (req) => A.uploadSkin(req, await U.readJson(req, 96 * 1024)));
on('POST', '/api/skins/delete', body(A.deleteSkin));
// players / friends / messages
on('GET', '/api/users/:id', (req, p) => S.profile(req, p.id));
on('GET', '/api/search', (req, p, q) => S.search(req, q.get('q')));
on('GET', '/api/friends', (req) => S.list(req));
on('POST', '/api/friends/request', body(S.request));
on('POST', '/api/friends/accept', body(S.accept));
on('POST', '/api/friends/decline', body(S.decline));
on('POST', '/api/friends/remove', body(S.remove));
on('POST', '/api/block', body(S.block));
on('POST', '/api/unblock', body(S.unblock));
on('GET', '/api/messages/:id', (req, p, q) => S.thread(req, p.id, q.get('before')));
on('POST', '/api/messages', body(S.sendMsg));
on('POST', '/api/invite', body((req, b) => { const u = A.auth(req); U.limit('inv:' + u.id, 20, 10); const r = RT.invite(u.id, U.v.pub(b.to)); if (!r.ok) U.fail(400, 'invite', r.why); return r; }));
on('GET', '/api/rooms', (req) => { const u = A.auth(req); return { friends: RT.friendRooms(u.id), servers: RT.publicRooms() }; });
// clans
on('GET', '/api/clans', (req, p, q) => S.clans(req, q.get('q')));
on('GET', '/api/clans/mine', (req) => S.myClan(req));
on('GET', '/api/clans/:id', (req, p) => S.clan(req, p.id));
on('POST', '/api/clans', body(S.createClan));
on('POST', '/api/clans/edit', body(S.editClan));
on('POST', '/api/clans/invite', body(S.inviteClan));
on('POST', '/api/clans/join', body(S.joinClan));
on('POST', '/api/clans/decline', body(S.declineClan));
on('POST', '/api/clans/leave', (req) => S.leaveClan(req));
on('POST', '/api/clans/manage', body(S.manageClan));
on('GET', '/api/clans/:id/messages', (req, p, q) => S.clanMsgs(req, p.id, q.get('before')));
on('POST', '/api/clans/messages', body(S.clanSend));
// servers
on('GET', '/api/servers', () => ({ servers: RT.publicRooms() }));
on('GET', '/api/servers/mine', (req) => SH.myServers(req));
on('POST', '/api/servers/edit', body(SH.editServer));
on('POST', '/api/servers/action', body(SH.serverAction));
// shop
on('GET', '/api/shop', () => SH.products());
on('POST', '/api/shop/order', body(SH.order));
on('GET', '/api/shop/orders', (req) => SH.myOrders(req));
on('GET', '/api/shop/orders/:label', (req, p) => SH.orderStatus(req, p.label));
// support
on('POST', '/api/support', body(SH.newTicket));
on('GET', '/api/support', (req) => SH.myTickets(req));
on('GET', '/api/support/:id', (req, p) => SH.ticket(req, p.id));
on('POST', '/api/support/:id', body((req, b, p) => SH.replyTicket(req, p.id, b)));
// admin
const AD = SH.admin;
on('GET', '/api/admin/stats', (req) => AD.stats(req));
on('GET', '/api/admin/tickets', (req, p, q) => AD.tickets(req, q.get('status')));
on('GET', '/api/admin/users', (req, p, q) => AD.users(req, q.get('q')));
on('POST', '/api/admin/users/:id', body((req, b, p) => AD.user(req, p.id, b)));
on('GET', '/api/admin/reports', (req) => AD.reports(req));
on('GET', '/api/admin/skins', (req) => AD.skins(req));
on('POST', '/api/admin/skins/:id', body((req, b, p) => AD.skin(req, p.id, b)));
on('GET', '/api/admin/orders', (req) => AD.orders(req));
on('POST', '/api/admin/orders/:label/paid', (req, p) => AD.markPaid(req, p.label));
on('GET', '/api/admin/servers', (req) => AD.servers(req));
on('POST', '/api/admin/servers/:id/days', body((req, b, p) => AD.serverDays(req, p.id, b)));
// live numbers for the site
on('GET', '/api/stats', () => { const rt = RT.stats(); return { online: rt.online, playing: rt.playing, servers: RT.publicRooms().length, players: db.get('SELECT COUNT(*) n FROM users').n, clans: db.get('SELECT COUNT(*) n FROM clans').n }; });

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.apk': 'application/vnd.android.package-archive', '.ipa': 'application/octet-stream', '.zip': 'application/zip', '.exe': 'application/octet-stream' };
const GAME = path.resolve(ROOT, '..');               // the game folder (index.html, js, css ...)
const SITE = path.resolve(ROOT, '..', 'site');       // the website
const DL = path.resolve(cfg.dataDir, 'downloads');    // put TheZombies.apk / .ipa / .zip here
fs.mkdirSync(DL, { recursive: true });
const GAME_DIRS = new Set(['css', 'js', 'fonts', 'assets', 'sounds']);
function serveFile(res, file, cache, extra) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    const h = Object.assign({ 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache || 'no-cache', 'Last-Modified': st.mtime.toUTCString() }, U.SEC_HEADERS, extra || {});
    res.writeHead(200, h); fs.createReadStream(file).pipe(res);
  });
}
function inside(base, rel) { const f = path.resolve(base, '.' + path.sep + rel); return f.startsWith(base + path.sep) || f === base ? f : null; }
const SITE_CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://accounts.google.com https://appleid.cdn-apple.com; frame-src https://accounts.google.com https://appleid.apple.com; connect-src 'self' wss: ws: https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://yoomoney.ru";

function staticRoute(req, res, pathname) {
  if (pathname.startsWith('/play')) { // web version of the game
    let rel = pathname.slice(5).replace(/^\/+/, '') || 'index.html';
    const top = rel.split('/')[0];
    if (rel !== 'index.html' && rel !== 'manifest.webmanifest' && !GAME_DIRS.has(top)) { res.writeHead(404); return res.end(); }
    const f = inside(GAME, rel); if (!f) { res.writeHead(403); return res.end(); }
    return serveFile(res, f, top === 'sounds' || top === 'fonts' || top === 'assets' ? 'public, max-age=86400' : 'no-cache');
  }
  if (pathname.startsWith('/dl/')) { const f = inside(DL, decodeURIComponent(pathname.slice(4))); if (!f) { res.writeHead(403); return res.end(); } return serveFile(res, f, 'no-cache', { 'Content-Disposition': 'attachment' }); }
  let rel = pathname.replace(/^\/+/, '') || 'index.html';
  const f = inside(SITE, rel); if (!f) { res.writeHead(403); return res.end(); }
  if (rel === 'index.html' || !path.extname(rel)) return serveFile(res, path.join(SITE, 'index.html'), 'no-cache', { 'Content-Security-Policy': SITE_CSP });
  return serveFile(res, f, 'public, max-age=3600');
}
// list of downloads with versions for the site
on('GET', '/api/downloads', () => {
  const files = fs.readdirSync(DL).filter(f => !f.startsWith('.')).map(f => { const st = fs.statSync(path.join(DL, f)); return { file: f, size: st.size, date: st.mtimeMs }; });
  const pick = (re) => files.filter(f => re.test(f.file)).sort((a, b) => b.date - a.date)[0] || null;
  const link = (k, local) => cfg.downloads && cfg.downloads[k] ? { file: cfg.downloads[k], url: cfg.downloads[k], size: 0, date: 0 } : local;
  return { version: R.VERSION, pc: link('pc', pick(/\.(zip|exe)$/i)), android: link('android', pick(/\.apk$/i)), ios: link('ios', pick(/\.ipa$/i)), web: '/play/' };
});

// ---------------------------------------------------------------- HTTP server
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' };
const srv = http.createServer(async (req, res) => {
  let url; try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      U.limit('ip:' + U.clientIp(req, cfg.trustProxy), 240, 120);
      if (p === '/api/pay/yoomoney' && req.method === 'POST') { const ok = SH.notify((await U.readBody(req, 16 * 1024)).toString('utf8')); res.writeHead(ok ? 200 : 400); return res.end(); }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(p); if (!m) continue;
        const out = await r.fn(req, m.groups || {}, url.searchParams);
        return U.sendJson(res, 200, out, CORS);
      }
      U.fail(404, 'not_found', 'Нет такого метода');
    }
    if (p.startsWith('/skins/')) {
      const id = parseInt(p.slice(7), 10); const row = Number.isFinite(id) && A.skinPng(id);
      if (!row) { res.writeHead(404); return res.end(); }
      res.writeHead(200, Object.assign({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600', 'Access-Control-Allow-Origin': '*' }, U.SEC_HEADERS)); return res.end(Buffer.from(row.png));
    }
    if (p.startsWith('/pay/')) {
      const nonce = crypto.randomBytes(12).toString('base64');
      const html = SH.payPage(decodeURIComponent(p.slice(5)), url.searchParams.get('m')).replace('NONCE', nonce);
      res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self' https://yoomoney.ru https://*.yoomoney.ru` }, U.SEC_HEADERS));
      return res.end(html);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return staticRoute(req, res, decodeURIComponent(p));
  } catch (e) {
    if (e instanceof U.ApiError) return U.sendJson(res, e.status, Object.assign({ error: e.code, message: e.message }, e.extra || {}), CORS);
    console.error(req.method, p, e);
    return U.sendJson(res, 500, { error: 'server', message: 'Ошибка сервера' }, CORS);
  }
});
srv.on('upgrade', (req, socket, head) => RT.upgrade(req, socket, head));
srv.headersTimeout = 20000; srv.requestTimeout = 30000;
srv.listen(cfg.port, () => {
  console.log(`\n  THE ZOMBIES ${R.VERSION} — сервер запущен: ${cfg.publicUrl} (порт ${cfg.port})`);
  console.log(`  Почта: ${mail.enabled() ? 'SMTP подключён' : 'SMTP не настроен — коды пишутся сюда, в консоль'}`);
  console.log(`  Оплата ЮMoney: ${cfg.yoomoney.wallet && cfg.yoomoney.secret ? 'подключена, уведомления: ' + cfg.publicUrl.replace(/\/$/, '') + '/api/pay/yoomoney' : 'не настроена (впишите wallet и secret в config.json)'}`);
  console.log(`  Google: ${cfg.googleClientId ? 'да' : 'нет'}, Apple: ${cfg.appleClientId ? 'да' : 'нет'}, админы: ${cfg.adminEmails.join(', ') || '— (впишите adminEmails)'}\n`);
});
// cleanup
setInterval(() => { const now = Date.now(); db.run('DELETE FROM sessions WHERE expires < ?', now); db.run('DELETE FROM codes WHERE expires < ?', now); db.run("DELETE FROM orders WHERE status = 'new' AND created < ?", now - 7 * 864e5); }, 3600e3).unref();
const stop = async (sig) => { console.log('Остановка…', sig); try { await backup.now('остановка сервера'); } catch (e) { } process.exit(0); };
process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
})();
