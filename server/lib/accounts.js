'use strict';
// Accounts: registration, login (e-mail / Google / Apple), sessions, password reset,
// profile, server-side progress with anti-cheat, classes, coins, kits, skins.
const U = require('./util');
const R = require('../../js/rules.js');
const { fail, v } = U;

const SESSION_DAYS = 60;
const CODE_MIN = 15;
const TZ_OFFSET = 3 * 3600e3; // daily tasks switch at midnight Moscow time

function freshData() {
  return { look: { skin: 1, hair: 1, style: 0, outfit: 0 }, avatar: 'self', frame: 'wood', bg: 'dusk', medals: [], rn: 1000, rnPeak: 1000, coins: 150,
    stats: {}, ach: {}, history: [], daily: null, classes: ['survivor'], cls: 'survivor', skin: null, kits: [], cosmetics: { frames: [], bgs: [] } };
}
const today = () => new Date(Date.now() + TZ_OFFSET).toISOString().slice(0, 10);

module.exports = function (ctx) {
  const { db, cfg, mail } = ctx;
  const A = {};

  // ---------------------------------------------------------------- loading / saving
  A.load = (id) => { const u = db.get('SELECT * FROM users WHERE id = ?', id); if (u) { u.d = JSON.parse(u.data); u.acs = JSON.parse(u.ac || '{}'); } return u; };
  A.byPub = (pub) => { const u = db.get('SELECT * FROM users WHERE pubid = ?', pub); if (u) { u.d = JSON.parse(u.data); u.acs = JSON.parse(u.ac || '{}'); } return u; };
  A.save = (u) => db.run('UPDATE users SET data = ?, ac = ?, sus = ?, name = ? WHERE id = ?', JSON.stringify(u.d), JSON.stringify(u.acs || {}), u.sus || 0, u.name, u.id);
  A.isAdmin = (u) => u && (u.role === 'admin' || (u.email && cfg.adminEmails.includes(u.email)));

  function create(fields) {
    let pub; do { pub = U.pubId(); } while (db.get('SELECT 1 FROM users WHERE pubid = ?', pub));
    const d = freshData(); d.created = Date.now();
    const r = db.run('INSERT INTO users (pubid, email, email_verified, pass_hash, google_sub, apple_sub, name, created, data) VALUES (?,?,?,?,?,?,?,?,?)',
      pub, fields.email || null, fields.verified ? 1 : 0, fields.pass || null, fields.google || null, fields.apple || null, fields.name, Date.now(), JSON.stringify(d));
    return A.load(Number(r.lastInsertRowid));
  }
  function newSession(u, req) {
    const t = U.token(32);
    db.run('INSERT INTO sessions (token_hash, user_id, created, expires, ip, ua) VALUES (?,?,?,?,?,?)', U.sha256(t), u.id, Date.now(), Date.now() + SESSION_DAYS * 864e5, req ? U.clientIp(req, cfg.trustProxy) : '', req ? String(req.headers['user-agent'] || '').slice(0, 200) : '');
    db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created DESC LIMIT 10)', u.id, u.id);
    return t;
  }
  A.fromToken = (t) => {
    if (!t || typeof t !== 'string' || t.length > 100) return null;
    const s = db.get('SELECT user_id, expires FROM sessions WHERE token_hash = ?', U.sha256(t));
    if (!s || s.expires < Date.now()) return null;
    const u = A.load(s.user_id); if (!u) return null;
    if (Date.now() - u.last_seen > 60e3) db.run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), u.id);
    return u;
  };
  A.auth = (req, opt = {}) => {
    const h = String(req.headers.authorization || '');
    const u = A.fromToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!u) fail(401, 'auth', 'Войдите в аккаунт');
    if (u.banned_until > Date.now() && !opt.allowBanned) fail(403, 'banned', 'Аккаунт заблокирован' + (u.ban_reason ? ': ' + u.ban_reason : '') + ' до ' + new Date(u.banned_until).toLocaleString('ru-RU'), { until: u.banned_until });
    return u;
  };
  A.authAdmin = (req) => { const u = A.auth(req); if (!A.isAdmin(u)) fail(403, 'forbidden', 'Нет доступа'); return u; };

  // ---------------------------------------------------------------- views
  A.clanOf = (uid) => db.get('SELECT c.id, c.name, c.tag, c.color, c.pvp, c.markers, m.role FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = ?', uid) || null;
  A.publicView = (u, online) => {
    const d = u.d, s = d.stats || {};
    return { id: u.pubid, name: u.name, look: d.look, avatar: d.avatar, frame: d.frame, bg: d.bg, medals: (d.medals || []).slice(0, 3), rn: d.rn, rnPeak: d.rnPeak,
      rank: R.rankOf(d.rn).name, level: R.levelOf(d.rn), cls: d.cls, skin: d.skin, created: u.created, achCount: Object.keys(d.ach || {}).length, online: !!online, lastSeen: u.last_seen,
      clan: A.clanOf(u.id), role: A.isAdmin(u) ? 'support' : undefined,
      stats: { kills: s.kills || 0, deaths: s.deaths || 0, nights: s.nights || 0, maxDay: s.maxDay || 0, built: s.built || 0, km: +(s.km || 0).toFixed(1), recruited: s.recruited || 0, animals: s.animals || 0, heads: s.heads || 0, pvpKills: s.pvpKills || 0, boss: s.k_boss || 0 } };
  };
  A.selfView = (u) => Object.assign(A.publicView(u, true), { email: u.email, verified: !!u.email_verified, hasPassword: !!u.pass_hash, google: !!u.google_sub, apple: !!u.apple_sub, admin: A.isAdmin(u), data: dailyFresh(u) });
  function dailyFresh(u) { const d = u.d; if (!d.daily || d.daily.date !== today()) d.daily = R.dailyFor(today(), u.pubid); return d; }

  // ---------------------------------------------------------------- email codes
  async function sendCode(email, purpose, ip) {
    U.limit('code:' + email, 3, 3); U.limit('codeip:' + ip, 10, 10);
    const code = U.code6();
    db.run('INSERT OR REPLACE INTO codes (email, purpose, code_hash, expires, attempts, sent) VALUES (?,?,?,?,0,?)', email, purpose, U.sha256(purpose + ':' + code), Date.now() + CODE_MIN * 60e3, Date.now());
    const title = purpose === 'reset' ? 'Сброс пароля' : 'Подтверждение почты';
    const line = purpose === 'reset' ? 'Кто-то (надеемся, вы) запросил сброс пароля. Введите этот код в игре или на сайте:' : 'Добро пожаловать в The Zombies! Введите этот код, чтобы подтвердить почту:';
    await mail.send(email, `The Zombies — ${title}: ${code}`, title, [line, `Код действует ${CODE_MIN} минут.`], code);
    return cfg.devShowCodes ? code : undefined;
  }
  function useCode(email, purpose, code) {
    const row = db.get('SELECT * FROM codes WHERE email = ? AND purpose = ?', email, purpose);
    if (!row || row.expires < Date.now()) fail(400, 'code_expired', 'Код истёк — запросите новый');
    if (row.attempts >= 5) { db.run('DELETE FROM codes WHERE email = ? AND purpose = ?', email, purpose); fail(400, 'code_attempts', 'Слишком много попыток — запросите новый код'); }
    if (!U.safeEq(row.code_hash, U.sha256(purpose + ':' + String(code || '').trim()))) { db.run('UPDATE codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?', email, purpose); fail(400, 'bad_code', 'Неверный код'); }
    db.run('DELETE FROM codes WHERE email = ? AND purpose = ?', email, purpose);
  }
  const ok = (u, req) => ({ token: newSession(u, req), me: A.selfView(u) });

  // ---------------------------------------------------------------- auth endpoints
  A.register = async (req, b) => {
    const ip = U.clientIp(req, cfg.trustProxy); U.limit('reg:' + ip, 5, 5);
    const email = v.email(b.email), pw = v.password(b.password), name = v.name(b.name);
    const ex = db.get('SELECT * FROM users WHERE email = ?', email);
    if (ex && ex.email_verified) fail(409, 'email_taken', 'Эта почта уже зарегистрирована. Войдите или восстановите пароль.');
    if (ex) db.run('UPDATE users SET pass_hash = ?, name = ? WHERE id = ?', U.hashPassword(pw), name, ex.id);
    else create({ email, pass: U.hashPassword(pw), name });
    const dev = await sendCode(email, 'verify', ip);
    return { needVerify: true, email, devCode: dev };
  };
  A.verify = (req, b) => {
    const email = v.email(b.email); U.limit('verify:' + email, 10, 10);
    useCode(email, 'verify', b.code);
    db.run('UPDATE users SET email_verified = 1 WHERE email = ?', email);
    const u = A.load(db.get('SELECT id FROM users WHERE email = ?', email).id);
    return ok(u, req);
  };
  A.resend = async (req, b) => { const email = v.email(b.email); const u = db.get('SELECT email_verified FROM users WHERE email = ?', email); const dev = u && !u.email_verified ? await sendCode(email, 'verify', U.clientIp(req, cfg.trustProxy)) : undefined; return { ok: true, devCode: dev }; };
  A.login = async (req, b) => {
    const ip = U.clientIp(req, cfg.trustProxy);
    const email = v.email(b.email); const pw = String(b.password || '').slice(0, 128);
    U.limit('loginip:' + ip, 20, 20); U.limit('login:' + email, 8, 8);
    const row = db.get('SELECT * FROM users WHERE email = ?', email);
    if (!row || !U.checkPassword(pw, row.pass_hash)) fail(401, 'bad_login', 'Неверная почта или пароль');
    if (!row.email_verified) { const dev = await sendCode(email, 'verify', ip); return { needVerify: true, email, devCode: dev }; }
    return ok(A.load(row.id), req);
  };
  async function social(req, kind, sub, email, emailVerified, nameHint) {
    const col = kind === 'google' ? 'google_sub' : 'apple_sub';
    let row = db.get(`SELECT id FROM users WHERE ${col} = ?`, sub);
    if (!row && email && emailVerified) { // link to an existing e-mail account
      row = db.get('SELECT id FROM users WHERE email = ?', email);
      if (row) db.run(`UPDATE users SET ${col} = ?, email_verified = 1 WHERE id = ?`, sub, row.id);
    }
    let u;
    if (row) u = A.load(row.id);
    else {
      let name = String(nameHint || (email || '').split('@')[0] || 'Выживший').replace(/[^A-Za-zА-Яа-яЁё0-9_\-. ]/g, '').slice(0, 16);
      if (name.length < 3) name = 'Выживший';
      u = create({ email: emailVerified ? email : null, verified: !!emailVerified, name, [kind]: sub });
      u.isNew = true;
    }
    const r = ok(u, req); r.isNew = !!u.isNew; return r;
  }
  A.google = async (req, b) => {
    if (!cfg.googleClientId) fail(501, 'not_configured', 'Вход через Google ещё не настроен на сервере');
    U.limit('oauth:' + U.clientIp(req, cfg.trustProxy), 20, 20);
    const p = await U.verifyJwt(b.idToken, { jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['accounts.google.com', 'https://accounts.google.com'], audience: [cfg.googleClientId].concat(cfg.googleExtraClientIds || []) });
    return social(req, 'google', p.sub, p.email && String(p.email).toLowerCase(), p.email_verified === true || p.email_verified === 'true', p.given_name || p.name);
  };
  A.apple = async (req, b) => {
    if (!cfg.appleClientId) fail(501, 'not_configured', 'Вход через Apple ещё не настроен на сервере');
    U.limit('oauth:' + U.clientIp(req, cfg.trustProxy), 20, 20);
    const p = await U.verifyJwt(b.idToken, { jwksUrl: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'], audience: [cfg.appleClientId].concat(cfg.appleExtraClientIds || []) });
    return social(req, 'apple', p.sub, p.email && String(p.email).toLowerCase(), p.email_verified === true || p.email_verified === 'true', b.name);
  };
  A.forgot = async (req, b) => {
    const email = v.email(b.email);
    const row = db.get('SELECT id FROM users WHERE email = ?', email);
    let dev; if (row) dev = await sendCode(email, 'reset', U.clientIp(req, cfg.trustProxy));
    else U.limit('forgot:' + U.clientIp(req, cfg.trustProxy), 5, 5);
    return { ok: true, devCode: dev }; // same answer whether or not the e-mail exists
  };
  A.reset = (req, b) => {
    const email = v.email(b.email); const pw = v.password(b.password); U.limit('reset:' + email, 10, 10);
    useCode(email, 'reset', b.code);
    const row = db.get('SELECT id FROM users WHERE email = ?', email); if (!row) fail(400, 'bad_code', 'Неверный код');
    db.run('UPDATE users SET pass_hash = ?, email_verified = 1 WHERE id = ?', U.hashPassword(pw), row.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', row.id); // log out everywhere
    return ok(A.load(row.id), req);
  };
  A.changePassword = (req, b) => {
    const u = A.auth(req); U.limit('pw:' + u.id, 5, 5);
    if (u.pass_hash && !U.checkPassword(String(b.old || ''), u.pass_hash)) fail(401, 'bad_login', 'Старый пароль неверен');
    db.run('UPDATE users SET pass_hash = ? WHERE id = ?', U.hashPassword(v.password(b.password)), u.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
    return ok(u, req);
  };
  A.linkEmail = async (req, b) => { // Google/Apple users can add an e-mail + password for recovery
    const u = A.auth(req); const email = v.email(b.email);
    if (db.get('SELECT 1 FROM users WHERE email = ? AND id != ?', email, u.id)) fail(409, 'email_taken', 'Эта почта уже занята');
    db.run('UPDATE users SET email = ?, email_verified = 0, pass_hash = COALESCE(?, pass_hash) WHERE id = ?', email, b.password ? U.hashPassword(v.password(b.password)) : null, u.id);
    return { needVerify: true, email, devCode: await sendCode(email, 'verify', U.clientIp(req, cfg.trustProxy)) };
  };
  A.logout = (req) => { const h = String(req.headers.authorization || ''); if (h.startsWith('Bearer ')) db.run('DELETE FROM sessions WHERE token_hash = ?', U.sha256(h.slice(7))); return { ok: true }; };
  A.logoutAll = (req) => { const u = A.auth(req); db.run('DELETE FROM sessions WHERE user_id = ?', u.id); return { ok: true }; };

  // ---------------------------------------------------------------- profile edits (only unlocked cosmetics)
  function unlocked(u, kind, id) {
    const T = { frame: ctx.FRAMES, bg: ctx.BGS, avatar: ctx.AVATARS }[kind];
    if (!T || !T[id]) return false; if (T[id].free) return true;
    const d = u.d; if (kind === 'frame' && d.cosmetics.frames.includes(id)) return true; if (kind === 'bg' && d.cosmetics.bgs.includes(id)) return true;
    if (kind === 'avatar' && id.startsWith('look')) return true;
    return R.ACH.some(c => c[kind] === id && d.ach[c.id]);
  }
  A.updateMe = (req, b) => {
    const u = A.auth(req); U.limit('me:' + u.id, 30, 30); const d = u.d;
    if (b.name != null && b.name !== u.name) { U.limit('rename:' + u.id, 2, 3); u.name = v.name(b.name); }
    if (b.look && typeof b.look === 'object') { const L = {}; for (const k of ['skin', 'hair', 'style', 'outfit', 'hairColor', 'eyes', 'beard']) if (b.look[k] != null) L[k] = v.int(b.look[k], 0, 40, 0); d.look = L; }
    for (const k of ['avatar', 'frame', 'bg']) if (b[k] != null) { if (!unlocked(u, k, String(b[k]))) fail(403, 'locked', 'Это ещё не открыто'); d[k] = String(b[k]); }
    if (Array.isArray(b.medals)) d.medals = b.medals.map(String).filter(id => d.ach[id]).slice(0, 3);
    if (b.cls != null) { if (!d.classes.includes(String(b.cls))) fail(403, 'locked', 'Этот класс не куплен'); d.cls = String(b.cls); }
    if (b.skin !== undefined) {
      if (b.skin === null) d.skin = null;
      else { const s = db.get('SELECT id, status FROM skins WHERE id = ? AND user_id = ?', v.int(b.skin, 1, 1e12), u.id); if (!s || s.status === 'rejected') fail(404, 'no_skin', 'Скин не найден'); d.skin = s.id; }
    }
    A.save(u); return { me: A.selfView(u) };
  };

  // ---------------------------------------------------------------- progress (anti-cheat)
  function grantAch(u, out) {
    const d = u.d;
    for (const c of R.ACH) {
      if (d.ach[c.id]) continue;
      if ((d.stats[c.stat] || 0) >= c.n) {
        d.ach[c.id] = Date.now(); if (d.medals.length < 3 && !d.medals.includes(c.id)) d.medals.push(c.id);
        addRn(u, c.rn, 'достижение'); d.coins += c.rn * R.COIN_RULES.achMul; out.ach.push(c.id);
      }
    }
  }
  function addRn(u, n, why) {
    const d = u.d; n = Math.round(n); if (!n) return;
    d.rn = Math.max(0, d.rn + n); d.rnPeak = Math.max(d.rnPeak || 0, d.rn);
    d.history.push({ t: Date.now(), d: n, why }); if (d.history.length > 60) d.history.splice(0, d.history.length - 60);
  }
  A.addRn = addRn; A.grantAch = grantAch;
  A.recount = (u) => { // stats the server knows itself
    const d = u.d; d.stats.classes = d.classes.length;
    d.stats.friends = db.get("SELECT COUNT(*) n FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'", u.id, u.id).n / 2;
  };
  A.progress = (req, b) => {
    const u = A.auth(req); U.limit('prog:' + u.id, 10, 10);
    const d = u.d, ac = u.acs, now = Date.now();
    if (b.seq != null && ac.seq != null && b.seq <= ac.seq) return { me: A.selfView(u), dup: true }; // replay of an old batch
    // refill allowance buckets
    const mins = Math.min(R.BUCKET_MIN, (now - (ac.at || u.created)) / 60000);
    ac.b = ac.b || {};
    const rate = (k) => R.STAT_RATE[k] != null ? R.STAT_RATE[k] : R.DEFAULT_RATE;
    for (const k of Object.keys(R.STAT_RATE)) ac.b[k] = Math.min(rate(k) * R.BUCKET_MIN, (ac.b[k] != null ? ac.b[k] : rate(k) * 5) + rate(k) * mins);
    for (const k of Object.keys(ac.b)) if (R.STAT_RATE[k] == null) ac.b[k] = Math.min(rate(k) * R.BUCKET_MIN, ac.b[k] + rate(k) * mins);
    ac.at = now; if (b.seq != null) ac.seq = v.int(b.seq, 0, 1e12, 0);
    const out = { ach: [], rejected: {} }, got = {};
    const st = Object.assign({}, b.stats && typeof b.stats === 'object' && !Array.isArray(b.stats) ? b.stats : {});
    const carry = ac.c || {}; ac.c = {};
    for (const k of Object.keys(carry)) st[k] = (Number(st[k]) || 0) + carry[k]; // small leftovers from the last sync
    let n = 0, susAdd = 0;
    for (const [k, raw] of Object.entries(st)) {
      if (++n > 80) break;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,23}$/.test(k) || ['classes', 'friends', 'biomeCount', 'maxDay', 'dailySets', 'pvpKills', 'biomes'].includes(k)) continue;
      const x = Number(raw); if (!Number.isFinite(x) || x <= 0) continue;
      if (ac.b[k] == null) ac.b[k] = rate(k) * 5 + rate(k) * mins;
      const fl = k === 'km' || k.endsWith('Km'); let take = Math.min(x, ac.b[k]); if (!fl) take = Math.floor(take + 1e-9); ac.b[k] -= take;
      if (take > 0) { d.stats[k] = fl ? +((d.stats[k] || 0) + take).toFixed(3) : (d.stats[k] || 0) + take; got[k] = take; }
      const left = x - take; if (left > 1e-6) { const keep = Math.min(left, Math.max(1, rate(k) * 10)); ac.c[k] = keep; if (left - keep > 1e-6) { out.rejected[k] = +(left - keep).toFixed(2); susAdd += (left - keep) / Math.max(1, rate(k) * 3); } }
    }
    // biomes (0..9), max day: can't exceed nights survived + 1
    if (Array.isArray(b.biomes)) { d.stats.biomes = d.stats.biomes || {}; for (const x of b.biomes.slice(0, 10)) { const i = v.int(x, 0, 9, -1); if (i >= 0) d.stats.biomes[i] = 1; } d.stats.biomeCount = Object.keys(d.stats.biomes).length; }
    { const want = Math.max(b.maxDay != null ? v.int(b.maxDay, 0, 100000, 0) : 0, ac.wd || 0), cap = (d.stats.nights || 0) + 1; ac.wd = 0;
      if (want > cap) { if (want - cap <= 2) ac.wd = want; else { susAdd += (want - cap) / 3; out.rejected.maxDay = want - cap; } }
      d.stats.maxDay = Math.max(d.stats.maxDay || 0, Math.min(want, cap)); }
    // events give RN / coins only when backed by accepted stats
    const budget = { night: got.nights || 0, boss: got.k_boss || 0, evac: got.evac || 0, death: got.deaths || 0 };
    const ev = (ac.pe || []).concat(Array.isArray(b.events) ? b.events.slice(0, 200) : []); ac.pe = [];
    for (const e of ev) {
      if (!e || typeof e !== 'object') continue;
      const mul = R.DIFF_RN[e.diff] || 1;
      if (e.t === 'night' && budget.night >= 1) { budget.night--; const day = Math.min(v.int(e.day, 1, 100000, 1), d.stats.maxDay || 1); addRn(u, R.RN_RULES.night(day, mul), 'ночь пережита'); d.coins += R.COIN_RULES.night; }
      else if (e.t === 'boss' && budget.boss >= 1) { budget.boss--; addRn(u, R.RN_RULES.boss(mul), 'Бегемот'); d.coins += R.COIN_RULES.boss; }
      else if (e.t === 'evac' && budget.evac >= 1) { budget.evac--; addRn(u, R.RN_RULES.evac(mul), 'эвакуация'); d.coins += R.COIN_RULES.evac; }
      else if (e.t === 'death' && budget.death >= 1) { budget.death--; addRn(u, R.RN_RULES.death(mul), 'смерть'); }
      else if (['night', 'boss', 'evac'].includes(e.t) && ac.pe.length < 4) ac.pe.push({ t: e.t, day: e.day, diff: e.diff }); // wait for the stat to catch up
    }
    // deaths that were reported as a stat but without an event still cost RN
    for (let i = 0; i < Math.floor(budget.death); i++) addRn(u, R.RN_RULES.death(1), 'смерть');
    // daily tasks
    dailyFresh(u); const dl = d.daily;
    for (const t of dl.tasks) {
      if (t.done || !got[t.id]) continue;
      t.got = Math.min(t.need, t.got + got[t.id]);
      if (t.got >= t.need - 1e-6) { t.done = true; addRn(u, R.DAILY_RN[t.tier], 'задание дня'); d.coins += R.DAILY_COINS[t.tier]; out.daily = (out.daily || 0) + 1; }
    }
    if (!dl.all && dl.tasks.every(t => t.done)) { dl.all = true; addRn(u, R.DAILY_BONUS, 'все задания дня'); d.coins += R.DAILY_COIN_BONUS; d.stats.dailySets = (d.stats.dailySets || 0) + 1; }
    A.recount(u); grantAch(u, out);
    // suspicion score: decays slowly, admins see it, big scores freeze rewards
    u.sus = Math.max(0, (u.sus || 0) * 0.97 + susAdd);
    if (susAdd > 3) db.run('INSERT INTO reports (user_id, by_id, kind, detail, created) VALUES (?,?,?,?,?)', u.id, null, 'progress', JSON.stringify(out.rejected).slice(0, 500), now);
    u.acs = ac; A.save(u);
    return { me: A.selfView(u), ach: out.ach, rejected: Object.keys(out.rejected).length ? out.rejected : undefined };
  };

  // ---------------------------------------------------------------- coins: classes and kits
  A.buyClass = (req, b) => {
    const u = A.auth(req); const c = R.CLASS[String(b.id)]; if (!c) fail(404, 'no_class', 'Нет такого класса');
    const d = u.d; if (d.classes.includes(c.id)) fail(409, 'owned', 'Класс уже куплен');
    if (d.coins < c.price) fail(402, 'coins', 'Не хватает монет');
    d.coins -= c.price; d.classes.push(c.id); d.cls = c.id; A.recount(u); const out = { ach: [] }; grantAch(u, out); A.save(u);
    return { me: A.selfView(u), ach: out.ach };
  };
  A.buyKit = (req, b) => {
    const u = A.auth(req); const id = String(b.id); const price = R.COIN_KITS[id]; const p = R.PRODUCT[id];
    if (!price || !p) fail(404, 'no_kit', 'Нет такого набора');
    if (u.d.coins < price) fail(402, 'coins', 'Не хватает монет');
    u.d.coins -= price; A.giveKit(u, p); A.save(u); return { me: A.selfView(u) };
  };
  A.giveKit = (u, p) => { if (p.items) u.d.kits.push({ id: U.token(6), product: p.id, name: p.name, items: p.items, t: Date.now() }); };
  A.claimKit = (req, b) => {
    const u = A.auth(req); U.limit('kit:' + u.id, 20, 20);
    const i = u.d.kits.findIndex(k => k.id === String(b.id)); if (i < 0) fail(404, 'no_kit', 'Набор уже получен');
    const k = u.d.kits.splice(i, 1)[0]; A.save(u); return { items: k.items, me: A.selfView(u) };
  };

  // ---------------------------------------------------------------- skins (64×64 PNG)
  function pngSize(buf) {
    if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  A.uploadSkin = (req, b) => {
    const u = A.auth(req); U.limit('skin:' + u.id, 6, 6);
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.png || '')); if (!m) fail(400, 'bad_png', 'Нужен PNG-файл');
    const buf = Buffer.from(m[1], 'base64'); if (buf.length > 48 * 1024) fail(400, 'big_png', 'Файл больше 48 КБ');
    const s = pngSize(buf); if (!s || s.w !== 64 || s.h !== 64) fail(400, 'bad_size', 'Скин должен быть PNG 64×64 по шаблону');
    if (db.get('SELECT COUNT(*) n FROM skins WHERE user_id = ?', u.id).n >= 12) fail(400, 'too_many', 'Не больше 12 скинов — удалите старые');
    const r = db.run('INSERT INTO skins (user_id, name, png, status, created) VALUES (?,?,?,?,?)', u.id, v.text(b.name || 'Скин', 24), buf, 'ok', Date.now());
    u.d.skin = Number(r.lastInsertRowid); A.save(u);
    return { id: u.d.skin, me: A.selfView(u) };
  };
  A.mySkins = (req) => { const u = A.auth(req); return { skins: db.all('SELECT id, name, status, created FROM skins WHERE user_id = ? ORDER BY id DESC', u.id) }; };
  A.deleteSkin = (req, b) => { const u = A.auth(req); db.run('DELETE FROM skins WHERE id = ? AND user_id = ?', v.int(b.id, 1, 1e12), u.id); if (u.d.skin === b.id) { u.d.skin = null; A.save(u); } return { ok: true }; };
  A.skinPng = (id) => db.get("SELECT png FROM skins WHERE id = ? AND status != 'rejected'", id);


  // ---------------------------------------------------------------- device login (apps: sign in with Google/Apple on the website)
  const devices = new Map();
  A.deviceStart = (req) => {
    U.limit('dev:' + U.clientIp(req, cfg.trustProxy), 10, 10);
    const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let code = '';
    for (let i = 0; i < 8; i++) code += ALPH[require('crypto').randomInt(0, ALPH.length)];
    code = code.slice(0, 4) + '-' + code.slice(4);
    const poll = U.token(24);
    devices.set(poll, { code, at: Date.now(), uid: 0 });
    for (const [k, d] of devices) if (Date.now() - d.at > 15 * 60e3) devices.delete(k);
    return { code, poll, url: cfg.publicUrl.replace(/\/$/, '') + '/#/device/' + code, expires: 10 * 60 };
  };
  A.deviceApprove = (req, b) => {
    const u = A.auth(req); const code = String(b.code || '').trim().toUpperCase();
    for (const d of devices.values()) if (d.code === code && Date.now() - d.at < 10 * 60e3) { d.uid = u.id; return { ok: true }; }
    fail(404, 'no_code', 'Код не найден или устарел — получите новый в игре');
  };
  A.devicePoll = (req, b) => {
    const d = devices.get(String(b.poll || '')); if (!d || Date.now() - d.at > 10 * 60e3) fail(404, 'expired', 'Код устарел');
    if (!d.uid) return { wait: true };
    devices.delete(String(b.poll)); return ok(A.load(d.uid), req);
  };

  return A;
};
module.exports.freshData = freshData;
