// =====================================================================
//  THE ZOMBIES 5.0 — online services: session, API, progress sync,
//  live notifications (friends, messages, invites, clans, payments).
//  Progress is checked and stored by the server (anti-cheat): the game only
//  reports what happened, the server decides how much RN / coins it is worth.
// =====================================================================
'use strict';
(() => {
const O = TZ.Online = { me: null, token: null, ws: null, listeners: {}, unread: 0 };
const S = TZ.store;

O.base = () => {
  const own = (S.get('serverUrl', '') || '').trim();
  if (own) return own.replace(/\/+$/, '');
  if (/^https?:$/.test(location.protocol) && location.pathname.startsWith('/play')) return location.origin;
  return (TZ.SERVER_URL || '').replace(/\/+$/, '');
};
O.wsBase = () => O.base().replace(/^http/, 'ws');
O.signedIn = () => !!(O.token && O.me);

// ---------------------------------------------------------------- HTTP
class ApiErr extends Error { constructor(msg, code, status) { super(msg); this.code = code; this.status = status; } }
O.api = async (method, path, body, opt = {}) => {
  if (!O.base()) throw new ApiErr(TZ.t('Онлайн-сервер ещё не подключён. Укажите его адрес: Настройки → Интерфейс → «Адрес онлайн-сервера».'), 'noserver', 0);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = setTimeout(() => ctl && ctl.abort(), opt.timeout || 15000);
  let r;
  try {
    r = await fetch(O.base() + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, O.token ? { Authorization: 'Bearer ' + O.token } : {}), body: body ? JSON.stringify(body) : undefined, signal: ctl && ctl.signal });
  } catch (e) { throw new ApiErr(TZ.t('Нет связи с сервером. Проверьте интернет.'), 'offline', 0); }
  finally { clearTimeout(to); }
  let j = {}; try { j = await r.json(); } catch (e) { }
  if (!r.ok) {
    if (r.status === 401 && O.token && !opt.noLogout) O.expired();
    throw new ApiErr(j.message || ('HTTP ' + r.status), j.error || 'http', r.status);
  }
  return j;
};
O.get = (p) => O.api('GET', p);
O.post = (p, b) => O.api('POST', p, b || {});

// ---------------------------------------------------------------- session
O.setSession = (token, me) => {
  O.token = token; S.set('session', token); O.applyMe(me);
  TZ.Account.useOnline();
  O.connect(); O.emit('login', me);
};
O.applyMe = (me) => {
  if (!me) return; O.me = me;
  const a = O.data = me.data; a.id = me.id; a.name = me.name; a.created = me.created;
  // keep optimistic, not yet confirmed numbers visible
  const q = O.queue; for (const k in q.stats) a.stats[k] = (a.stats[k] || 0) + q.stats[k];
  O.emit('me', me);
};
O.restore = async () => {
  const t = S.get('session', null); if (!t || !O.base()) return false;
  O.token = t;
  try { const r = await O.api('GET', '/api/me', null, { timeout: 8000, noLogout: true }); O.applyMe(r.me); TZ.Account.useOnline(); O.connect(); O.flush(); return true; }
  catch (e) {
    if (e.status === 401) { O.token = null; S.del('session'); return false; }
    if (e.status === 403 && e.code === 'banned') { O.banned = e.message; return 'banned'; }
    // offline: play with the cached profile, sync later
    const cached = S.get('meCache', null);
    if (cached) { O.applyMe(cached); O.offline = true; TZ.Account.useOnline(); setTimeout(() => O.restore(), 30000); return true; }
    O.token = null; return false;
  }
};
O.expired = () => { O.token = null; O.me = null; S.del('session'); O.disconnect(); O.emit('logout', { expired: true }); };
O.logout = async () => { try { await O.post('/api/auth/logout'); } catch (e) { } O.token = null; O.me = null; S.del('session'); S.del('meCache'); O.disconnect(); TZ.Account.useNone(); O.emit('logout', {}); };
setInterval(() => { if (O.me) S.set('meCache', O.me); }, 30000);

// auth helpers (return the server answer; caller shows errors)
O.register = (email, password, name) => O.post('/api/auth/register', { email, password, name });
O.verify = async (email, code) => { const r = await O.post('/api/auth/verify', { email, code }); O.setSession(r.token, r.me); return r; };
O.login = async (email, password) => { const r = await O.post('/api/auth/login', { email, password }); if (r.token) O.setSession(r.token, r.me); return r; };
O.forgot = (email) => O.post('/api/auth/forgot', { email });
O.reset = async (email, code, password) => { const r = await O.post('/api/auth/reset', { email, code, password }); O.setSession(r.token, r.me); return r; };
O.idToken = async (kind, idToken, name) => { const r = await O.post('/api/auth/' + kind, { idToken, name }); O.setSession(r.token, r.me); return r; };
// apps: sign in with Google / Apple on the website and confirm with a code
O.deviceLogin = async (onCode, isCancelled) => {
  const d = await O.post('/api/auth/device/start');
  onCode(d);
  const until = Date.now() + d.expires * 1000;
  while (Date.now() < until) {
    await new Promise(r => setTimeout(r, 3000));
    if (isCancelled && isCancelled()) return null;
    try { const r = await O.post('/api/auth/device/poll', { poll: d.poll }); if (r.token) { O.setSession(r.token, r.me); return r; } } catch (e) { if (e.code === 'expired') break; }
  }
  throw new Error(TZ.t('Время входа истекло. Попробуйте ещё раз.'));
};
O.updateMe = async (patch) => { const r = await O.api('PATCH', '/api/me', patch); O.applyMe(r.me); return r.me; };

// ---------------------------------------------------------------- progress queue (anti-cheat sync)
O.queue = S.get('pq', null) || { stats: {}, events: [], maxDay: 0, biomes: [] };
O.seq = S.get('pseq', 0) || Date.now();
let qT = 0;
const saveQ = () => { clearTimeout(qT); qT = setTimeout(() => S.set('pq', O.queue), 400); };
O.qEmpty = () => !Object.keys(O.queue.stats).length && !O.queue.events.length && !O.queue.maxDay && !O.queue.biomes.length;
O.addStat = (k, n) => { O.queue.stats[k] = +((O.queue.stats[k] || 0) + n).toFixed(4); saveQ(); };
O.addEvent = (e) => { if (O.queue.events.length < 300) O.queue.events.push(e); saveQ(); };
O.setMaxDay = (v) => { if (v > O.queue.maxDay) { O.queue.maxDay = v; saveQ(); } };
O.addBiome = (b) => { if (!O.queue.biomes.includes(b)) { O.queue.biomes.push(b); saveQ(); } };
let busy = false;
O.flush = async () => {
  if (busy || !O.token || O.qEmpty()) return;
  busy = true;
  const q = O.queue; O.queue = { stats: {}, events: [], maxDay: 0, biomes: [] };
  O.seq++; S.set('pseq', O.seq);
  try {
    const r = await O.post('/api/progress', { seq: O.seq, stats: q.stats, events: q.events, maxDay: q.maxDay || undefined, biomes: q.biomes.length ? q.biomes : undefined });
    S.set('pq', O.queue);
    const before = O.data ? Object.assign({}, O.data.ach) : {};
    O.applyMe(r.me);
    for (const id of r.ach || []) if (!before[id]) TZ.Account.announceAch(id);
    O.offline = false;
  } catch (e) {
    // put the batch back (server never saw it), unless the server refused it
    if (!e.status) { for (const k in q.stats) O.queue.stats[k] = +((O.queue.stats[k] || 0) + q.stats[k]).toFixed(4); O.queue.events = q.events.concat(O.queue.events).slice(0, 300); O.queue.maxDay = Math.max(q.maxDay, O.queue.maxDay); for (const b of q.biomes) if (!O.queue.biomes.includes(b)) O.queue.biomes.push(b); }
    S.set('pq', O.queue);
  } finally { busy = false; }
};
setInterval(() => O.flush(), 20000);
document.addEventListener('visibilitychange', () => { if (document.hidden) O.flush(); });

// ---------------------------------------------------------------- live notifications
O.on = (t, fn) => { (O.listeners[t] = O.listeners[t] || []).push(fn); };
O.emit = (t, d) => { for (const fn of O.listeners[t] || []) try { fn(d); } catch (e) { console.error(e); } };
let wsTry = 0, wsTimer = 0;
O.connect = () => {
  if (!O.base()) return;
  if (!O.token || (O.ws && O.ws.readyState <= 1)) return;
  let ws; try { ws = new WebSocket(O.wsBase() + '/ws', ['tz', O.token]); } catch (e) { return; }
  O.ws = ws;
  ws.onopen = () => { wsTry = 0; O.online = true; O.emit('online', true); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (m.t === 'me') { O.refresh(); return; } O.emit(m.t, m); O.emit('*', m); };
  ws.onclose = () => { O.online = false; O.emit('online', false); if (O.ws === ws) O.ws = null; if (O.token) { clearTimeout(wsTimer); wsTimer = setTimeout(O.connect, Math.min(30000, 1500 * 2 ** wsTry++)); } };
  ws.onerror = () => { };
};
O.disconnect = () => { clearTimeout(wsTimer); if (O.ws) { const w = O.ws; O.ws = null; try { w.close(); } catch (e) { } } };
setInterval(() => { if (O.ws && O.ws.readyState === 1) O.ws.send('{"op":"ping"}'); }, 25000);
let refT = 0;
O.refresh = () => { clearTimeout(refT); refT = setTimeout(async () => { try { const r = await O.get('/api/me'); const before = O.data ? Object.assign({}, O.data.ach) : {}; O.applyMe(r.me); for (const id in r.me.data.ach) if (!before[id]) TZ.Account.announceAch(id); } catch (e) { } }, 300); };

// ---------------------------------------------------------------- custom skins (64×64 PNG)
const skinCache = new Map();
O.skinUrl = (id) => O.base() + '/skins/' + id + '.png';
O.loadSkin = (id) => {
  if (!id) return Promise.resolve(null);
  if (skinCache.has(id)) return skinCache.get(id);
  const p = new Promise((res) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try { const cv = TZ.canvas(64, 64); cv.g.drawImage(img, 0, 0); res(cv.g.getImageData(0, 0, 64, 64)); } catch (e) { res(null); } };
    img.onerror = () => res(null);
    img.src = O.skinUrl(id);
  });
  skinCache.set(id, p); return p;
};
})();
