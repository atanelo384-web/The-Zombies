'use strict';
const crypto = require('crypto');

// ---------------------------------------------------------------- errors / responses
class ApiError extends Error { constructor(status, code, msg, extra) { super(msg || code); this.status = status; this.code = code; this.extra = extra; } }
const fail = (status, code, msg, extra) => { throw new ApiError(status, code, msg, extra); };

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
};
function sendJson(res, status, obj, extra) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }, SEC_HEADERS, extra || {}));
  res.end(body);
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new ApiError(413, 'too_large', 'Слишком большой запрос')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { const o = JSON.parse(buf.toString('utf8')); if (!o || typeof o !== 'object' || Array.isArray(o)) throw 0; return o; } catch (e) { fail(400, 'bad_json', 'Неверный формат запроса'); }
}
function clientIp(req, trustProxy) {
  if (trustProxy) { const f = req.headers['x-forwarded-for']; if (f) return String(f).split(',')[0].trim(); const r = req.headers['x-real-ip']; if (r) return String(r); }
  return req.socket.remoteAddress || '?';
}

// ---------------------------------------------------------------- rate limiting (token buckets in memory)
const buckets = new Map();
function limit(key, perMin, burst = perMin) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b) { b = { t: burst, at: now }; buckets.set(key, b); }
  b.t = Math.min(burst, b.t + (now - b.at) / 60000 * perMin); b.at = now;
  if (b.t < 1) fail(429, 'rate', 'Слишком много запросов. Подождите немного.');
  b.t -= 1;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.at > 3600e3) buckets.delete(k); }, 600e3).unref();

// ---------------------------------------------------------------- crypto
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return 'scrypt$' + salt.toString('base64') + '$' + h.toString('base64');
}
function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) { crypto.scryptSync(pw, 'x', 64); return false; }
  const [, s, h] = stored.split('$');
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(s, 'base64'), want.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(want, got);
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const code6 = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
// public account id: 8 chars, no look-alike symbols
const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const pubId = () => { let s = ''; for (let i = 0; i < 8; i++) s += ALPH[crypto.randomInt(0, ALPH.length)]; return s; };

// ---------------------------------------------------------------- JWT (Google / Apple sign-in)
const jwksCache = new Map();
async function jwks(url) {
  const c = jwksCache.get(url);
  if (c && Date.now() - c.at < 3600e3) return c.keys;
  const r = await fetch(url); if (!r.ok) fail(502, 'jwks', 'Не удалось проверить вход');
  const j = await r.json(); jwksCache.set(url, { at: Date.now(), keys: j.keys || [] }); return j.keys || [];
}
async function verifyJwt(idToken, { jwksUrl, issuers, audience }) {
  if (typeof idToken !== 'string' || idToken.length > 8192) fail(400, 'bad_token', 'Неверный токен входа');
  const parts = idToken.split('.'); if (parts.length !== 3) fail(400, 'bad_token', 'Неверный токен входа');
  let head, body;
  try { head = JSON.parse(Buffer.from(parts[0], 'base64url')); body = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch (e) { fail(400, 'bad_token', 'Неверный токен входа'); }
  if (head.alg !== 'RS256') fail(400, 'bad_token', 'Неверный токен входа');
  const keys = await jwks(jwksUrl); const jwk = keys.find(k => k.kid === head.kid);
  if (!jwk) fail(401, 'bad_token', 'Ключ входа устарел, попробуйте ещё раз');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) fail(401, 'bad_token', 'Подпись входа неверна');
  const now = Date.now() / 1000;
  if (!issuers.includes(body.iss)) fail(401, 'bad_token', 'Неверный издатель токена');
  const auds = Array.isArray(audience) ? audience : [audience];
  if (!auds.filter(Boolean).includes(body.aud)) fail(401, 'bad_token', 'Токен выдан другому приложению');
  if (!body.exp || body.exp < now - 60) fail(401, 'bad_token', 'Токен входа истёк');
  return body;
}

// ---------------------------------------------------------------- validation
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
function email(v) { v = String(v || '').trim().toLowerCase(); if (v.length > 254 || !EMAIL_RE.test(v)) fail(400, 'bad_email', 'Неверная почта'); return v; }
function password(v) { v = String(v || ''); if (v.length < 8) fail(400, 'weak_password', 'Пароль — минимум 8 символов'); if (v.length > 128) fail(400, 'bad_password', 'Слишком длинный пароль'); if (!/[A-Za-zА-Яа-яЁё]/.test(v) || !/\d/.test(v)) fail(400, 'weak_password', 'Пароль должен содержать буквы и цифры'); return v; }
const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9_\-. ]{3,16}$/;
function name(v) { v = String(v || '').trim().replace(/\s+/g, ' '); if (!NAME_RE.test(v)) fail(400, 'bad_name', 'Ник: 3–16 символов — буквы, цифры, _ - .'); return v; }
function text(v, max = 500, min = 1) { v = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim(); if (v.length < min) fail(400, 'empty', 'Пустое сообщение'); if (v.length > max) v = v.slice(0, max); return v; }
function color(v) { v = String(v || ''); if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail(400, 'bad_color', 'Неверный цвет'); return v.toLowerCase(); }
function int(v, lo, hi, def) { v = Math.round(Number(v)); if (!Number.isFinite(v)) { if (def !== undefined) return def; fail(400, 'bad_number', 'Неверное число'); } return Math.max(lo, Math.min(hi, v)); }
function pub(v) { v = String(v || '').trim().toUpperCase().replace(/^#/, ''); if (!/^[2-9A-HJ-NP-Z]{8}$/.test(v)) fail(400, 'bad_id', 'Неверный ID игрока'); return v; }

module.exports = { ApiError, fail, sendJson, readBody, readJson, clientIp, limit, sha256, token, hashPassword, checkPassword, safeEq, code6, pubId, verifyJwt, v: { email, password, name, text, color, int, pub }, SEC_HEADERS };
