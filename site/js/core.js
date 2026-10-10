// =====================================================================
//  THE ZOMBIES — website core: DOM builder (XSS-safe), i18n, API client,
//  session, toasts, modals, router.
//  Rule: user text is only ever inserted as text nodes / attributes via h(),
//  never through innerHTML.
// =====================================================================
'use strict';
(function () {
const S = window.TZS = { me: null, cfg: null, pages: {} };

// ---------------------------------------------------------------- storage (may throw in private mode)
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};
S.store = store;

// ---------------------------------------------------------------- DOM
const SAFE_URL = /^(https?:\/\/|\/(?!\/)|#|mailto:)/i;
S.safeUrl = (u) => { u = String(u == null ? '' : u).trim(); return SAFE_URL.test(u) ? u : '#'; };
function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  if (m[2]) for (const p of m[2].match(/[.#][\w-]+/g)) { if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1); }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const k in attrs) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') { for (const c of String(v).split(/\s+/)) if (c) el.classList.add(c); }
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'style' && typeof v === 'object') { for (const s in v) if (v[s] != null) el.style.setProperty(s, String(v[s])); }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith('on')) continue; // never string handlers
    else if (k === 'href' || k === 'src' || k === 'action') el.setAttribute(k, k === 'src' && /^data:image\/png;base64,/.test(v) ? v : S.safeUrl(v));
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required' || k === 'hidden' || k === 'multiple') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, kids); return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) add(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
  return el;
}
S.h = h; S.add = add;
S.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
S.$ = (q, root) => (root || document).querySelector(q);
S.img = (canvas, cls, alt) => h('img', { class: cls, src: window.PX.url(canvas), alt: alt || '', draggable: 'false' });
S.color = (c, def) => /^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : (def || '#c8d0d8');

// ---------------------------------------------------------------- i18n
const I = window.TZ_I18N;
const LANGS = I.langs.map(l => l[0]);
function pickLang() {
  const saved = store.get('tz_site_lang'); if (saved && LANGS.includes(saved)) return saved;
  const nav = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']).map(x => String(x).toLowerCase());
  for (const n of nav) { const c = n.slice(0, 2); if (LANGS.includes(c)) return c; if (c === 'be' || c === 'kk') return 'ru'; }
  return 'en';
}
S.lang = pickLang();
const t = S.t = (key, vars) => {
  const d = I[S.lang] || {}; let s = d[key]; if (s == null) s = (I.en || {})[key]; if (s == null) s = (I.ru || {})[key]; if (s == null) s = key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? String(vars[k]) : m);
  return s;
};
S.has = (key) => { const d = I[S.lang] || {}; return d[key] != null || (I.en || {})[key] != null; };
S.setLang = (l) => { if (!LANGS.includes(l)) return; S.lang = l; store.set('tz_site_lang', l); applyLang(); S.route(true); };
function applyLang() {
  document.documentElement.lang = S.lang;
  document.documentElement.dataset.lang = S.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  const sel = document.getElementById('langsel'); if (sel) sel.value = S.lang;
  const cur = document.getElementById('langcur'); if (cur) cur.textContent = S.lang.toUpperCase();
}
S.applyLang = applyLang;
// locale helpers
const LOC = { ru: 'ru-RU', en: 'en-GB', uk: 'uk-UA', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', pl: 'pl-PL', tr: 'tr-TR', zh: 'zh-CN', ja: 'ja-JP' };
S.loc = () => LOC[S.lang] || 'en-GB';
S.num = (n) => { try { return Number(n || 0).toLocaleString(S.loc()); } catch (e) { return String(n); } };
S.date = (ms) => ms ? new Date(ms).toLocaleDateString(S.loc(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
S.sdate = (ms) => ms ? new Date(ms).toLocaleDateString(S.loc(), { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
S.dt = (ms) => ms ? new Date(ms).toLocaleString(S.loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
S.ago = (ms) => {
  if (!ms) return '—'; const s = Math.max(0, (Date.now() - ms) / 1000);
  try { const rtf = new Intl.RelativeTimeFormat(S.loc(), { numeric: 'auto' });
    if (s < 60) return rtf.format(0, 'second'); if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute'); if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour'); if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), 'day');
  } catch (e) { /* old browser */ }
  return S.date(ms);
};
S.size = (b) => { if (!b) return ''; const mb = b / 1048576; return mb >= 1 ? (mb >= 100 ? Math.round(mb) : mb.toFixed(1)) + ' ' + t('u.mb') : Math.max(1, Math.round(b / 1024)) + ' ' + t('u.kb'); };
// names that come from the server in Russian (ranks, products, classes, history)
const RANKS = [['Новичок', '#9a9a8c'], ['Бронза', '#c07a3a'], ['Серебро', '#c8d0d8'], ['Золото', '#f0c040'], ['Платина', '#6fe0d0'], ['Алмаз', '#7ab8ff'], ['Легенда', '#ff5a4a']];
S.rank = (name) => { const i = RANKS.findIndex(r => r[0] === name); return i < 0 ? { name: String(name || ''), color: '#9a9a8c' } : { name: t('rank.' + i), color: RANKS[i][1] }; };
S.pname = (p) => S.lang === 'ru' ? p.name : (S.has('prod.' + p.id) ? t('prod.' + p.id) : p.name);
S.pdesc = (p) => S.lang === 'ru' ? p.desc : (S.has('prodd.' + p.id) ? t('prodd.' + p.id) : p.desc);
S.cname = (c) => { const id = typeof c === 'string' ? c : c.id; return S.has('cls.' + id) ? t('cls.' + id) : (c && c.name) || id; };
S.cdesc = (c) => S.lang === 'ru' ? c.desc : (S.has('clsd.' + c.id) ? t('clsd.' + c.id) : c.desc);
const WHY = { 'достижение': 'ach', 'ночь пережита': 'night', 'Бегемот': 'boss', 'эвакуация': 'evac', 'смерть': 'death', 'задание дня': 'daily', 'все задания дня': 'dailyall', 'поддержка': 'support' };
S.why = (w) => WHY[w] ? t('why.' + WHY[w]) : String(w || '');

// ---------------------------------------------------------------- API
const base = () => String(window.TZ_API || '').replace(/\/+$/, '');
S.token = () => store.get('tz_site_token');
S.setToken = (tk) => store.set('tz_site_token', tk || null);
const ERR_MAP = { bad_name: (m) => /клан/i.test(m) ? 'err.bad_clan_name' : 'err.bad_name' };
S.errText = (e) => {
  if (!e) return t('err.unknown');
  if (e.code === 'network') return t('err.network');
  if (S.lang === 'ru' && e.message) return e.message;
  if (e.code === 'banned') { const m = /заблокирован(?::\s*(.*?))?\s+до\s/.exec(e.message || ''); const until = e.data && e.data.until; return t('err.banned', { until: until ? S.dt(until) : '' }) + (m && m[1] ? ' — ' + m[1] : ''); }
  if (e.code === 'full' && /максимум/.test(e.message || '')) return t('err.full');
  const key = ERR_MAP[e.code] ? ERR_MAP[e.code](e.message || '') : 'err.' + e.code;
  return S.has(key) ? t(key) : (e.message || t('err.unknown'));
};
S.api = async (method, path, body) => {
  const headers = {}; if (body !== undefined) headers['Content-Type'] = 'application/json';
  const tk = S.token(); if (tk) headers.Authorization = 'Bearer ' + tk;
  let r;
  try { r = await fetch(base() + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
  catch (x) { const e = new Error('network'); e.code = 'network'; throw e; }
  let j = null; try { j = await r.json(); } catch (x) { j = null; }
  if (!r.ok) {
    const e = new Error((j && j.message) || ('HTTP ' + r.status)); e.status = r.status; e.code = (j && j.error) || 'http'; e.data = j;
    if (r.status === 401 && e.code === 'auth' && tk) { S.setToken(null); S.me = null; S.renderUser(); setTimeout(() => S.route(true), 0); }
    throw e;
  }
  return j || {};
};
S.get = (p) => S.api('GET', p);
S.post = (p, b) => S.api('POST', p, b || {});
S.login = (res) => { // {token, me}
  if (res && res.token) S.setToken(res.token);
  if (res && res.me) S.me = res.me;
  S.renderUser();
};
S.loadMe = async () => {
  if (!S.token()) { S.me = null; return null; }
  try { const r = await S.get('/api/me'); S.me = r.me; } catch (e) { if (e.status === 401 || e.status === 403) { S.me = null; if (e.status === 401) S.setToken(null); } }
  S.renderUser(); return S.me;
};
S.config = async () => { if (S.cfg) return S.cfg; try { S.cfg = await S.get('/api/config'); } catch (e) { S.cfg = { google: null, apple: null }; } return S.cfg; };

// ---------------------------------------------------------------- toasts & modals
S.toast = (msg, kind) => {
  const box = document.getElementById('toasts'); if (!box) return;
  const el = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, msg);
  box.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, kind === 'err' ? 5200 : 3200);
};
S.fail = (e) => S.toast(S.errText(e), 'err');
S.modal = (title, body, opts = {}) => {
  const close = () => { wrap.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => wrap.remove(), 200); if (opts.onClose) opts.onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div.modal.panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.mhead', h('h3', title), h('button.xbtn', { type: 'button', 'aria-label': t('ui.close'), onclick: close }, '×')),
    h('div.mbody', body));
  const wrap = h('div.mwrap', { onclick: (e) => { if (e.target === wrap) close(); } }, box);
  document.body.appendChild(wrap); document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => { wrap.classList.add('in'); const f = box.querySelector('input,textarea,select,button.btn'); if (f) f.focus(); });
  return { close, box };
};
S.confirm = (title, text, okLabel, danger) => new Promise((res) => {
  let done = false;
  const m = S.modal(title, [h('p.mtext', text), h('div.row.end',
    h('button.btn.ghost', { type: 'button', onclick: () => { done = true; m.close(); res(false); } }, t('ui.cancel')),
    h('button.btn' + (danger ? '.red' : '.green'), { type: 'button', onclick: () => { done = true; m.close(); res(true); } }, okLabel || t('ui.ok')))],
  { onClose: () => { if (!done) res(false); } });
});
// run an async action with a busy button
S.busy = async (btn, fn) => {
  if (btn && btn.disabled) return; if (btn) { btn.disabled = true; btn.classList.add('wait'); }
  try { return await fn(); } catch (e) { S.fail(e); return undefined; } finally { if (btn) { btn.disabled = false; btn.classList.remove('wait'); } }
};
S.copy = async (text, btn) => {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } }); ta.value = text; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (x) { ok = false; } ta.remove();
  }
  S.toast(ok ? t('ui.copied') : t('ui.copyfail'), ok ? 'ok' : 'err');
  if (btn && ok) { btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 1200); }
};

// ---------------------------------------------------------------- motion helpers
S.reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
S.countUp = (el, to, ms = 1200) => {
  to = Math.max(0, Number(to) || 0);
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (S.reduced() || from === to) { el.textContent = S.num(to); return; }
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = S.num(Math.round(from + (to - from) * e)); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
};
let io = null;
S.reveal = (root) => {
  const els = (root || document).querySelectorAll('.reveal:not(.in)');
  if (S.reduced() || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  if (!io) io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  els.forEach((e, i) => { e.style.setProperty('--d', (i % 6) * 60 + 'ms'); io.observe(e); });
};

// ---------------------------------------------------------------- common pieces
S.sectionHead = (title, sub, right) => h('div.shead', h('div', h('h2.ttl', title), sub ? h('p.sub', sub) : null), right || null);
S.empty = (text, glyph) => h('div.empty', S.img(window.PX.glyph(glyph || 'skull', '#5a6046', 4), 'eico'), h('p', text));
S.loading = () => h('div.loading', { 'aria-busy': 'true' }, h('i'), h('i'), h('i'), h('span', t('ui.loading')));
S.errorBox = (e, retry) => h('div.empty.errbox', S.img(window.PX.glyph('skull', '#d2322a', 4), 'eico'), h('p', S.errText(e)), retry ? h('button.btn.ghost', { type: 'button', onclick: retry }, t('ui.retry')) : null);
S.field = (label, input, hint) => h('label.field', h('span.flabel', label), input, hint ? h('small.hint', hint) : null);
S.input = (attrs) => h('input.inp', Object.assign({ type: 'text' }, attrs));
S.check = (label, attrs) => h('label.chk', h('input', Object.assign({ type: 'checkbox' }, attrs)), h('i'), h('span', label));
S.coinIco = () => S.img(window.PX.coin(2), 'coin');
S.idTag = (id) => { const b = h('button.idtag', { type: 'button', title: t('ui.copyid'), 'aria-label': t('ui.copyid') }, '#' + id, h('span.cp', t('ui.copy'))); b.addEventListener('click', () => S.copy('#' + id, b)); return b; };
S.onlineDot = (on) => h('span.dot' + (on ? '.on' : ''), { title: on ? t('ui.online') : t('ui.offline') });
S.userLink = (u) => /^[2-9A-HJ-NP-Z]{8}$/.test(String(u && u.id)) ? h('a.ulink', { href: '#/u/' + u.id }, u.name) : h('span', (u && u.name) || '?');
S.clanBadge = (c) => c ? h('a.clanb', { href: '#/clan/' + encodeURIComponent(c.id), style: { '--cc': S.color(c.color, '#ff5a4a') } }, h('b', '[' + c.tag + ']'), ' ', c.name) : null;

// require a session; otherwise renders the login block into `el` and returns false
S.needLogin = (el, why) => {
  if (S.me) return true;
  S.clear(el).appendChild(h('section.sec.first', h('div.wrap.narrow', h('div.panel.pad.authpanel.reveal',
    S.img(window.PX.badge(['shield', '#d2322a', 'lock'], 64), 'authico'), h('h2.ttl.c', t('auth.need')), h('p.sub.c', why || t('auth.needsub')), S.pages.authBlock({ compact: true })))));
  S.reveal(el); return false;
};
S.goLogin = () => { store.set('tz_site_next', location.hash || '#/'); location.hash = '#/profile'; };

// ---------------------------------------------------------------- header user chip
S.renderUser = () => {
  const box = document.getElementById('userbox'); if (!box) return;
  S.clear(box);
  if (S.me) {
    const r = S.rank(S.me.rank);
    box.appendChild(h('a.uchip', { href: '#/profile', title: t('nav.profile') },
      S.img(window.PX.classIcon({ id: S.me.cls || 'survivor', color: r.color, icon: 'people', price: 0 }, 28), 'uava'),
      h('span.uname', S.me.name), h('span.ucoins', S.coinIco(), S.num(S.me.data && S.me.data.coins))));
  } else box.appendChild(h('a.btn.small.red', { href: '#/profile' }, t('nav.login')));
  for (const a of document.querySelectorAll('[data-admin]')) a.hidden = !(S.me && S.me.admin);
  document.body.classList.toggle('isadmin', !!(S.me && S.me.admin));
};

// ---------------------------------------------------------------- router
let gen = 0, timers = [], cleanups = [];
const makeCtx = (my) => ({
  every(ms, fn) { const id = setInterval(() => { if (!document.hidden && my === gen) fn(); }, ms); timers.push(id); return id; },
  later(ms, fn) { const id = setTimeout(() => { if (my === gen) fn(); }, ms); timers.push(id); return id; },
  onLeave(fn) { cleanups.push(fn); },
  alive: () => my === gen,
});
const ROUTES = [
  [/^$/, 'home'], [/^ios$/, 'ios'], [/^servers$/, 'servers'], [/^donate$/, 'donate'], [/^paid\/([\w-]{3,60})$/, 'paid'],
  [/^profile$/, 'profile'], [/^u\/#?([2-9A-HJ-NP-Za-hj-np-z]{8})$/, 'user'], [/^clans$/, 'clans'], [/^clan\/(\d{1,12})$/, 'clan'],
  [/^device\/([A-Za-z0-9-]{4,12})$/, 'device'], [/^support$/, 'support'], [/^support\/(\d{1,12})$/, 'ticket'], [/^admin$/, 'admin'],
];
S.route = (keepScroll) => {
  gen++; const my = gen;
  for (const id of timers) { clearInterval(id); clearTimeout(id); } timers = [];
  for (const f of cleanups) { try { f(); } catch (e) { /* ignore */ } } cleanups = [];
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/+$/, '');
  let name = 'notfound', params = [];
  for (const [re, n] of ROUTES) { const m = re.exec(raw); if (m) { name = n; params = m.slice(1); break; } }
  const main = document.getElementById('main');
  const y = window.scrollY;
  S.clear(main); main.className = 'pg-' + name;
  const navKey = { home: 'home', ios: 'home', servers: 'servers', donate: 'donate', paid: 'donate', profile: 'profile', user: 'profile', clans: 'clans', clan: 'clans', device: 'profile', support: 'support', ticket: 'support', admin: 'admin' }[name];
  for (const a of document.querySelectorAll('.nav a')) a.classList.toggle('on', a.dataset.nav === navKey);
  document.body.classList.remove('navopen');
  const fn = S.pages[name] || S.pages.notfound;
  const ctx = makeCtx(my);
  try { fn(main, params, ctx); } catch (e) { console.warn(e); main.appendChild(S.errorBox(e)); }
  document.title = (name === 'home' ? '' : t('title.' + name) + ' — ') + 'The Zombies';
  if (keepScroll === true) window.scrollTo(0, y); else window.scrollTo(0, 0);
  S.reveal(main);
};
S.alive = (my) => my === gen;
S.gen = () => gen;
})();
