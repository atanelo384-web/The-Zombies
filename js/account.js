// =====================================================================
//  THE ZOMBIES 2.0 — storage, worlds, accounts, RN rating, cosmetics
// =====================================================================
'use strict';
(() => {
// ---------------------------------------------------------------- file storage
// Electron: files in the user data folder (no size limit). Browser: localStorage (compressed).
const native = () => window.tzNative && window.tzNative.fs;
const Store = TZ.Disk = {
  read(name) {
    try { if (native()) { const s = native().read(name); return s ? JSON.parse(s) : null; } } catch (e) { console.warn(e); }
    try { const s = localStorage.getItem('tz2_' + name); if (!s) return null; return JSON.parse(s[0] === '{' || s[0] === '[' ? s : LZString.decompressFromUTF16(s)); } catch (e) { return null; }
  },
  write(name, data) {
    const json = JSON.stringify(data);
    try { if (native()) { native().write(name, json); return true; } } catch (e) { console.warn(e); }
    try { localStorage.setItem('tz2_' + name, json.length > 4000 ? LZString.compressToUTF16(json) : json); return true; } catch (e) { console.warn('save failed', e); return false; }
  },
  remove(name) { try { if (native()) native().remove(name); } catch (e) { } try { localStorage.removeItem('tz2_' + name); } catch (e) { } },
};

// ---------------------------------------------------------------- worlds
TZ.Saves = {
  list() { return (Store.read('worlds') || []).sort((a, b) => (b.played || 0) - (a.played || 0)); },
  meta(id) { return this.list().find(w => w.id === id) || null; },
  create(o) {
    const id = 'w' + Date.now().toString(36) + ((Math.random() * 1e4) | 0);
    const seed = o.seed != null && o.seed !== '' ? (isNaN(+o.seed) ? hashStr(String(o.seed)) : (+o.seed >>> 0)) : ((Math.random() * 1e9) | 0);
    const m = { id, name: o.name || 'Новый мир', seed, diff: o.diff || 'normal', story: o.story !== false, pvp: !!o.pvp, created: Date.now(), played: Date.now(), day: 1 };
    const L = Store.read('worlds') || []; L.push(m); Store.write('worlds', L);
    return m;
  },
  load(id) { return Store.read('world_' + id); },
  save(id, data) {
    const ok = Store.write('world_' + id, data);
    const L = Store.read('worlds') || []; const m = L.find(w => w.id === id);
    if (m) { m.played = Date.now(); m.day = data.day; m.hasSave = true; Store.write('worlds', L); }
    return ok;
  },
  remove(id) { Store.remove('world_' + id); Store.write('worlds', (Store.read('worlds') || []).filter(w => w.id !== id)); },
  rename(id, name) { const L = Store.read('worlds') || []; const m = L.find(w => w.id === id); if (m) { m.name = name; Store.write('worlds', L); } },
};
const hashStr = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------------------------------------------------------- shared tables (js/rules.js — the server uses the same file)
const RU = TZ.RULES;
const RANKS = RU.RANKS;
const A = TZ.ACH = RU.ACH;
TZ.FRAMES = RU.FRAMES; TZ.BGS = RU.BGS; TZ.AVATARS = RU.AVATARS; TZ.CLASSES = RU.CLASSES; TZ.CLASS = RU.CLASS;

// ---------------------------------------------------------------- accounts
// Two kinds: ONLINE (stored and checked on the server — rating, coins, classes, multiplayer)
// and GUEST (only on this device, no multiplayer, no shop). Old local accounts become the guest.
const fresh = (name) => ({ id: 'guest', name: name || 'Гость', created: Date.now(), look: TZ.Chars ? TZ.Chars.defaultLook() : { skin: 1, hair: 1, style: 0, outfit: 0 }, avatar: 'self', frame: 'wood', bg: 'dusk', medals: [], rn: 1000, rnPeak: 1000, coins: 0, stats: {}, ach: {}, history: [], classes: ['survivor'], cls: 'survivor', kits: [], cosmetics: { frames: [], bgs: [] } });
function loadGuest() {
  let g = Store.read('guest');
  if (!g) { // migrate the last used local account of older versions (once)
    const old = Store.read('accounts'); let id = null; try { id = localStorage.getItem('tz2_last'); } catch (e) { }
    if (old && old.length) { const o = old.find(x => x.id === id) || old[0]; g = Object.assign(fresh(o.name), o, { id: 'guest' }); Store.write('guest', g); }
  }
  if (g) { const f = fresh(); for (const k in f) if (g[k] === undefined) g[k] = f[k]; }
  return g;
}
const Acc = TZ.Account = {
  mode: 'none', _cur: null,
  isOnline() { return this.mode === 'online' && !!TZ.Online.data; },
  isGuest() { return this.mode === 'guest'; },
  useOnline() { this.mode = 'online'; this._cur = null; },
  useGuest() { let g = loadGuest(); if (!g) { g = fresh(); Store.write('guest', g); } this.mode = 'guest'; this._cur = g; TZ.store.set('guestMode', true); },
  useNone() { this.mode = 'none'; this._cur = null; TZ.store.del('guestMode'); },
  guestExists() { return !!loadGuest(); },
  active() {
    if (this.mode === 'online' && TZ.Online.data) return TZ.Online.data;
    if (this._cur) return this._cur;
    return this._dummy || (this._dummy = fresh('Выживший'));
  },
  data() { return this.active(); },
  save() { if (this.mode === 'guest' && this._cur) Store.write('guest', this._cur); },
  // cosmetic / profile edits: online goes through the server (it checks what is unlocked)
  async setProfile(patch) {
    if (this.isOnline()) { try { await TZ.Online.updateMe(patch); } catch (e) { TZ.app.alert(e.message); } return; }
    const a = this.active(); Object.assign(a, patch); this.save();
  },
  stat(k, n) {
    const a = this.active(); if (!n && k !== 'km') return;
    if (k === 'km') { const g = TZ.game; if (g && g.me.vehicle) { const v = g.vehicles.find(v => v.id === g.me.vehicle); if (v && v.seats[0] === g.me.pid) { const d = v.km - (this._lastKm || v.km); this._lastKm = v.km; if (d > 0 && d < 1) { this.stat2('km', d); } } } else this._lastKm = null; return; }
    this.stat2(k, n);
  },
  stat2(k, n) {
    if (TZ.game && TZ.game.demo) return;
    const a = this.active();
    a.stats[k] = (a.stats[k] || 0) + n;
    if (this.isOnline()) { TZ.Online.addStat(k, n); return; }
    if (this.mode !== 'guest') return;
    TZ.Daily.track(k, n); this.dirty = true; this.check();
  },
  max(k, v) {
    const a = this.active(); if ((a.stats[k] || 0) >= v) return;
    a.stats[k] = v;
    if (this.isOnline()) { if (k === 'maxDay') TZ.Online.setMaxDay(v); return; }
    this.dirty = true; this.check();
  },
  biome(b) {
    const a = this.active(); a.stats.biomes = a.stats.biomes || {}; if (a.stats.biomes[b]) return;
    a.stats.biomes[b] = 1; a.stats.biomeCount = Object.keys(a.stats.biomes).length;
    if (this.isOnline()) { TZ.Online.addBiome(+b); return; }
    this.dirty = true; this.check();
  },
  // RN: online accounts only report the event — the server decides the amount
  rn(delta, why, ev) {
    delta = Math.round(delta); if (!delta) return;
    if (this.isOnline()) {
      const map = { 'ночь пережита': 'night', 'Бегемот': 'boss', 'эвакуация': 'evac', 'смерть': 'death' };
      if (!map[why]) return; // PvP and the rest are counted by the server itself
      TZ.Online.addEvent(Object.assign({ t: map[why] }, ev || {}));
      if (TZ.game && TZ.game.ui) TZ.game.ui.rnToast(delta, why);
      return;
    }
    if (this.mode !== 'guest') return;
    const a = this.active();
    a.rn = Math.max(0, a.rn + delta); a.rnPeak = Math.max(a.rnPeak || 0, a.rn);
    a.history.push({ t: Date.now(), d: delta, why }); if (a.history.length > 40) a.history.shift();
    this.dirty = true;
    if (TZ.game && TZ.game.ui) TZ.game.ui.rnToast(delta, why);
    this.save();
  },
  announceAch(id) {
    const c = A.find(c => c.id === id); if (!c) return;
    const rewards = [];
    if (c.frame) rewards.push(TZ.t('рамка') + ' «' + TZ.t(TZ.FRAMES[c.frame].name) + '»');
    if (c.bg) rewards.push(TZ.t('фон') + ' «' + TZ.t(TZ.BGS[c.bg].name) + '»');
    if (c.avatar) rewards.push(TZ.t('аватар') + ' «' + TZ.t(TZ.AVATARS[c.avatar].name) + '»');
    TZ.notify(TZ.t('Достижение') + ': ' + TZ.t(c.name), TZ.t(c.desc) + (rewards.length ? ' · ' + TZ.t('Награда') + ': ' + rewards.join(', ') : ''), { ach: c.id });
    try { window.tzNative && window.tzNative.achievement && window.tzNative.achievement(c.id); } catch (e) { }
  },
  check() { // guest only: the server checks online accounts
    if (this.mode !== 'guest') return;
    const a = this.active();
    for (const c of A) {
      if (a.ach[c.id]) continue;
      if ((a.stats[c.stat] || 0) >= c.n) {
        a.ach[c.id] = Date.now();
        if (a.medals.length < 3 && !a.medals.includes(c.id)) a.medals.push(c.id);
        this.announceAch(c.id);
        this.rn(c.rn, 'достижение');
      }
    }
    if (this.dirty) { this.dirty = false; clearTimeout(this._st); this._st = setTimeout(() => this.save(), 1500); }
  },
  unlocked(kind, id) {
    const a = this.active();
    const table = kind === 'frame' ? TZ.FRAMES : kind === 'bg' ? TZ.BGS : TZ.AVATARS;
    if (!table[id]) return false; if (table[id].free) return true;
    if (kind === 'avatar' && id.startsWith('look')) return true;
    const cz = a.cosmetics || {}; if (kind === 'frame' && (cz.frames || []).includes(id)) return true; if (kind === 'bg' && (cz.bgs || []).includes(id)) return true;
    return A.some(c => c[kind] === id && a.ach[c.id]);
  },
  requirement(kind, id) { const table = kind === 'frame' ? TZ.FRAMES : kind === 'bg' ? TZ.BGS : TZ.AVATARS; if (table[id] && table[id].shop) return TZ.t('Магазин') + ': ' + TZ.t(RU.PRODUCT[table[id].shop].name); const c = A.find(c => c[kind] === id); return c ? `${TZ.t(c.name)}: ${TZ.t(c.desc)}` : ''; },
  rankOf(rn) { return RU.rankOf(rn); },
  levelOf(rn) { return RU.levelOf(rn); },
  nextRank(rn) { return RANKS.find(k => k.min > rn) || null; },
  cls() { const a = this.active(); return a.cls || 'survivor'; },
  // compact profile for other players
  profile() {
    const a = this.active(), s = a.stats, me = TZ.Online.me;
    return { dev: TZ.isTouch ? 'phone' : 'pc', uid: a.id, name: a.name, look: this.lookWithSkin ? this.lookWithSkin() : a.look, avatar: a.avatar, frame: a.frame, bg: a.bg, medals: (a.medals || []).slice(0, 3), rn: a.rn, rnPeak: a.rnPeak, created: a.created, cls: a.cls || 'survivor', skin: a.skin || null,
      clan: this.isOnline() && me ? me.clan : null, guest: !this.isOnline(),
      stats: { kills: s.kills || 0, deaths: s.deaths || 0, nights: s.nights || 0, maxDay: s.maxDay || 0, built: s.built || 0, km: +(s.km || 0).toFixed(1), recruited: s.recruited || 0, animals: s.animals || 0, heads: s.heads || 0, pvpKills: s.pvpKills || 0, boss: s.k_boss || 0 }, achCount: Object.keys(a.ach).length };
  },
};
TZ.RANKS = RANKS;

// ---------------------------------------------------------------- daily challenges (3 per day; online — counted by the server)
const DAILY_POOL = RU.DAILY_POOL, DAILY_RN = RU.DAILY_RN, DAILY_BONUS = RU.DAILY_BONUS;
const Daily = TZ.Daily = {
  today() { const d = new Date(Date.now() + 3 * 3600e3); return d.toISOString().slice(0, 10); },
  get() {
    const a = Acc.active(); if (!a || Acc.mode === 'none') return null; const day = this.today();
    if (!a.daily || a.daily.date !== day) { a.daily = RU.dailyFor(day, a.id); Acc.dirty = true; }
    return a.daily;
  },
  text(t) { const q = DAILY_POOL.find(q => q.id === t.id); return q ? TZ.t(q.t).replace('{n}', t.need) : t.id; },
  track(k, n) {
    if (!n || TZ.game && TZ.game.demo || Acc.mode !== 'guest') return; const d = this.get(); if (!d) return;
    for (const t of d.tasks) {
      if (t.done || t.id !== k) continue;
      t.got = Math.min(t.need, t.got + n);
      if (t.got >= t.need - 1e-6) {
        t.done = true; Acc.rn(DAILY_RN[t.tier], 'задание дня');
        TZ.notify(TZ.t('Задание дня выполнено'), this.text(t) + ` · +${DAILY_RN[t.tier]} RN`);
        TZ.audio && TZ.audio.play('unlock');
      }
    }
    if (!d.all && d.tasks.every(t => t.done)) { d.all = true; Acc.rn(DAILY_BONUS, 'все задания дня'); Acc.stat('dailySets', 1); TZ.notify(TZ.t('Все задания дня!'), TZ.t('Бонус') + ` +${DAILY_BONUS} RN`); }
    Acc.dirty = true;
  },
  html() {
    const d = this.get(); if (!d) return '';
    const on = Acc.isOnline();
    return d.tasks.map(t => `<div class="dtask ${t.done ? 'done' : ''}"><span class="dtier t${t.tier}"></span><span class="dtxt">${TZ.esc(this.text(t))}</span><span class="dprog">${t.done ? '✓' : (t.id === 'km' ? (+t.got).toFixed(1) : Math.floor(t.got)) + '/' + t.need}</span><span class="drn">+${DAILY_RN[t.tier]}${on ? ' · +' + RU.DAILY_COINS[t.tier] + '<i class="coin"></i>' : ''}</span></div>`).join('');
  },
};

// ---------------------------------------------------------------- cosmetics rendering
const Cos = TZ.Cosmetics = {};
const cache = new Map();
const cv = (w, h) => TZ.canvas(w, h);
// pixel glyphs for medals (7x7)
const GLYPH = {
  shield: ['#######', '#.....#', '#.###.#', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  coin: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  globe: ['..###..', '.#.#.#.', '#######', '#..#..#', '#######', '.#.#.#.', '..###..'],
  skull: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#.#.#.', '.......'],
  moon: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  eye: ['.......', '.#####.', '##...##', '#..#..#', '##...##', '.#####.', '.......'],
  brick: ['#######', '#..#..#', '#######', '..#..#.', '#######', '#..#..#', '#######'],
  people: ['.#...#.', '###.###', '.#...#.', '##.#.##', '#.###.#', '..###..', '.#...#.'],
  wheel: ['..###..', '.#...#.', '#..#..#', '#.###.#', '#..#..#', '.#...#.', '..###..'],
  wrench: ['.....##', '....#.#', '...###.', '..###..', '.###...', '###....', '##.....'],
  bomb: ['.....#.', '....#..', '..###..', '.#####.', '.#####.', '.#####.', '..###..'],
  fist: ['.#.#.#.', '#######', '#######', '#######', '.#####.', '.#####.', '..###..'],
  helmet: ['..###..', '.#####.', '#######', '#######', '#.....#', '.......', '.......'],
  heli: ['#######', '...#...', '.####..', '##..###', '.####..', '.#..#..', '######.'],
  flake: ['#..#..#', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '#..#..#'],
  compass: ['...#...', '..###..', '.#.#.#.', '###.###', '.#.#.#.', '..###..', '...#...'],
  paw: ['.#...#.', '.#.#.#.', '...#...', '.#####.', '#######', '.#####.', '..###..'],
  cross: ['...#...', '...#...', '..###..', '###.###', '..###..', '...#...', '...#...'],
  blade: ['......#', '.....#.', '....#..', '...#...', '#.#....', '.#.....', '#.#....'],
  flame: ['...#...', '..##...', '..###..', '.####..', '.#####.', '#######', '.#####.'],
  pot: ['.......', '#######', '.#####.', '.#####.', '.#####.', '..###..', '.......'],
  axe: ['..###..', '.####..', '.###...', '..##...', '...#...', '...#...', '...#...'],
  fish: ['.......', '..###.#', '.#####.', '##.####', '.#####.', '..###.#', '.......'],
  phone: ['.#####.', '.#...#.', '.#...#.', '.#...#.', '.#...#.', '.#####.', '.##.##.'],
  spade: ['...#...', '..###..', '.#####.', '.#####.', '..###..', '...#...', '..###..'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  check: ['.......', '......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
};
Cos.medal = (id, size = 40) => { const c = A.find(a => a.id === id); if (!c) return null; return Cos.badge(c.medal, size, 'm' + id + size); };
Cos.badge = (medal, size = 40, key) => {
  const k = key || 'bd' + medal.join() + size; if (cache.has(k)) return cache.get(k);
  const [shape, color, glyph] = medal; const base = TZ.hex(color);
  const S = 20, b = new TZ.PixelBuf(S, S);
  const dk = TZ.shade(base, -0.45), lt = TZ.shade(base, 0.35);
  // ribbon
  for (let y = 0; y < 5; y++) { b.rect(5, y, 3, 1, [170, 40, 36]); b.rect(12, y, 3, 1, [50, 70, 150]); }
  const cx = 10, cy = 12;
  if (shape === 'circle') b.disc(cx, cy, 7.5, (dx, dy) => Math.hypot(dx, dy) > 6.4 ? dk : (dx + dy < -3 ? lt : base));
  else if (shape === 'star') { for (let y = 4; y < 20; y++) for (let x = 2; x < 18; x++) { const a = Math.atan2(y + .5 - cy, x + .5 - cx), r = Math.hypot(x + .5 - cx, y + .5 - cy); const lim = 4.6 + 3.2 * (0.5 + 0.5 * Math.cos(a * 5 + Math.PI / 2)); if (r < lim) b.set(x, y, r > lim - 1.2 ? dk : (x + y < 20 ? lt : base)); } }
  else { for (let y = 5; y < 20; y++) { const w = y < 13 ? 7 : 7 - (y - 13) * 1.1; for (let x = -w; x <= w; x++) { const px = Math.round(cx + x - .5); b.set(px, y, Math.abs(x) > w - 1.2 || y === 5 || y > 17 ? dk : (x < -1 ? lt : base)); } } }
  const g = GLYPH[glyph] || GLYPH.skull;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (g[y][x] === '#') b.set(cx - 3 + x - 0.5, cy - 3 + y, dk);
  const out = b.canvas(true, [16, 12, 10]);
  const big = cv(size, size); big.g.imageSmoothingEnabled = false; big.g.drawImage(out, 0, 0, size, size);
  cache.set(k, big); return big;
};
// frame: draws a pixel border onto a square canvas around an avatar
Cos.frame = (id, size = 96, t = 0) => {
  const k = 'f' + id + size + (TZ.FRAMES[id] && TZ.FRAMES[id].anim ? (t | 0) % 4 : 0); if (cache.has(k)) return cache.get(k);
  const P = 24, b = new TZ.PixelBuf(P, P), ph = (t | 0) % 4;
  const ring = (w, colFn) => { for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) { const e = Math.min(x, y, P - 1 - x, P - 1 - y); if (e < w) { const c = colFn(x, y, e); if (c) b.set(x, y, c); } } };
  const H = TZ.hash;
  switch (id) {
    case 'none': break;
    case 'wood': ring(2, (x, y, e) => e === 0 ? [70, 46, 30] : ((x + y) % 4 === 0 ? [110, 76, 46] : [140, 98, 60])); break;
    case 'iron': ring(2, (x, y, e) => e === 0 ? [50, 52, 58] : ((x === 2 || x === P - 3) && (y === 2 || y === P - 3) ? [200, 200, 210] : [120, 124, 132])); break;
    case 'rust': ring(2, (x, y, e) => e === 0 ? [60, 30, 18] : H(x, y, 3) < 0.4 ? [150, 80, 40] : [110, 100, 92]); break;
    case 'steel': ring(3, (x, y, e) => e === 0 ? [40, 44, 50] : e === 1 ? [190, 196, 206] : [120, 128, 140]); break;
    case 'stone': ring(3, (x, y, e) => e === 0 ? [50, 48, 44] : ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? [150, 146, 136] : [120, 116, 108])); break;
    case 'wood2': ring(3, (x, y, e) => e === 0 ? [40, 60, 30] : H(x, y, 4) < 0.3 ? [200, 110, 40] : [90, 120, 54]); break;
    case 'blood': ring(3, (x, y, e) => e === 0 ? [60, 6, 6] : [150 + (H(x, y, 1) * 40 | 0), 20, 16]); for (let i = 0; i < 6; i++) { const x = 3 + (H(i, 5, 2) * 18 | 0); for (let k = 0; k < 2 + (H(i, 4, 1) * 4 | 0); k++) b.set(x, 3 + k, [150, 20, 16]); } break;
    case 'gold': ring(3, (x, y, e) => e === 0 ? [90, 60, 10] : e === 1 ? [255, 230, 120] : [220, 170, 40]); for (const [x, y] of [[1, 1], [P - 2, 1], [1, P - 2], [P - 2, P - 2]]) b.set(x, y, [255, 255, 220]); break;
    case 'ice': ring(3, (x, y, e) => e === 0 ? [40, 80, 120] : H(x, y, 2) < 0.25 ? [240, 250, 255] : [150, 210, 240]); for (let i = 0; i < 5; i++) { const x = 3 + (H(i, 1, 9) * 18 | 0); for (let k = 0; k < 3; k++) b.set(x, P - 3 + k - 3, [200, 236, 255]); } break;
    case 'fire': ring(3, (x, y, e) => { const n = H(x, y + ph * 7, 5); return e === 0 ? [80, 20, 6] : n < 0.33 ? [255, 220, 90] : n < 0.66 ? [240, 120, 30] : [190, 50, 20]; }); break;
    case 'toxic': ring(3, (x, y, e) => { const n = H(x + ph * 3, y, 6); return e === 0 ? [20, 50, 10] : n < 0.3 ? [200, 255, 80] : [100, 170, 40]; }); break;
    case 'behemoth': ring(3, (x, y, e) => e === 0 ? [30, 10, 8] : [110, 30, 24]); for (let i = 2; i < P - 2; i += 4) { b.set(i, 0, [220, 210, 190]); b.set(i, P - 1, [220, 210, 190]); b.set(0, i, [220, 210, 190]); b.set(P - 1, i, [220, 210, 190]); } break;
    case 'nightmare': ring(3, (x, y, e) => { const n = H(x, y, ph + 8); return e === 0 ? [10, 0, 0] : n < 0.15 ? [255, 40, 30] : [40 + (n * 60 | 0), 6, 10]; }); break;
    case 'hero': ring(3, (x, y, e) => e === 0 ? [20, 60, 30] : e === 1 ? [120, 230, 120] : [60, 150, 70]); b.rect(10, 0, 4, 2, [240, 220, 120]); break;
    case 'sniper': ring(2, (x, y, e) => e === 0 ? [20, 20, 20] : [70, 74, 66]); for (let i = 0; i < 5; i++) { b.set(12, i, [220, 40, 30]); b.set(12, P - 1 - i, [220, 40, 30]); b.set(i, 12, [220, 40, 30]); b.set(P - 1 - i, 12, [220, 40, 30]); } break;
    case 'duel': ring(3, (x, y, e) => e === 0 ? [40, 10, 40] : ((x + y) % 3 ? [180, 40, 60] : [230, 200, 80])); break;
    case 'daily': ring(3, (x, y, e) => e === 0 ? [20, 50, 20] : ((x + y) % 4 < 2 ? [120, 216, 110] : [70, 150, 60])); for (const [x, y] of [[1, 1], [P - 2, 1], [1, P - 2], [P - 2, P - 2]]) b.set(x, y, [240, 255, 200]); break;
    case 'cross': ring(3, (x, y, e) => { const n = ((x * 3 + y * 2 + ph * 6) % 24) / 24; return e === 0 ? [10, 30, 50] : n < 0.5 ? [95, 208, 255] : [232, 176, 48]; }); break;
    case 'legion': ring(3, (x, y, e) => { const n = ((x + y + ph * 3) % 12) / 12; return e === 0 ? [30, 10, 50] : e === 1 ? (n < 0.5 ? [255, 214, 90] : [200, 140, 255]) : [110, 50, 170]; }); for (const [x, y] of [[1, 1], [P - 2, 1], [1, P - 2], [P - 2, P - 2], [11, 0], [12, 0], [11, P - 1], [12, P - 1]]) b.set(x, y, [255, 240, 180]); break;
    case 'legend': ring(3, (x, y, e) => { const hue = ((x + y) * 15 + ph * 40) % 360; const c = hsl(hue, 0.8, e === 1 ? 0.7 : 0.5); return e === 0 ? [20, 20, 20] : c; }); break;
  }
  const out = b.canvas();
  const big = cv(size, size); big.g.imageSmoothingEnabled = false; big.g.drawImage(out, 0, 0, size, size);
  cache.set(k, big); return big;
};
const hsl = (h, s, l) => { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
Cos.avatar = (id, look, size = 80) => {
  const k = 'a' + id + JSON.stringify(look) + size; if (cache.has(k)) return cache.get(k);
  const C = TZ.Chars; let set;
  if (id === 'self' || !TZ.AVATARS[id]) set = C.playerSet(look, { head: 'cap' });
  else if (id === 'look1') set = C.playerSet({ skin: 2, hair: 0, style: 0, outfit: 0 }, { head: 'ushanka', body: 'parka' });
  else if (id === 'look2') set = C.playerSet({ skin: 1, hair: 6, style: 4, outfit: 3 }, {});
  else if (id === 'look3') set = C.playerSet({ skin: 0, hair: 3, style: 2, outfit: 4 }, {});
  else if (id === 'surv') set = C.playerSet({ skin: 3, hair: 0, style: 0, outfit: 0 }, { head: 'helmet', body: 'vest' });
  else if (id === 'wolf' || id === 'bear' || id === 'dog') set = C.animalSet(id);
  else set = C.zombieSet(id.slice(2), 1, 0);
  const bgc = { z_walker: '#3a2a22', z_exploder: '#4a2a10', z_boss: '#401010', z_brute: '#2a3020', z_soldier: '#26301c', z_frozen: '#1c3040', wolf: '#2a2a30', bear: '#302418', dog: '#3a2c1c' }[id] || '#22281c';
  const c = cv(size, size); c.g.fillStyle = bgc; c.g.fillRect(0, 0, size, size);
  const gr = c.g.createRadialGradient(size / 2, size * 0.4, 2, size / 2, size / 2, size * 0.7); gr.addColorStop(0, 'rgba(255,220,160,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); c.g.fillStyle = gr; c.g.fillRect(0, 0, size, size);
  const fr = set.get('idle', 0, 1), m = set.model;
  c.g.imageSmoothingEnabled = false;
  if (id === 'wolf' || id === 'bear') { const s = size / 34; c.g.drawImage(fr.c, m.AX - 22, m.AY - 28, 40, 34, 0, 4, size * 1.2, size); }
  else { const top = m.AY - (m.headTop || 28) * 0.9 - 3, h = ((m.headTop || 28) - (m.zT || 21)) * 0.9 + 12; const w = h; c.g.drawImage(fr.c, m.AX - w / 2, top, w, h, 0, size * 0.06, size, size); }
  cache.set(k, c); return c;
};
// procedural pixel landscapes for profile backgrounds (160x60, scaled)
Cos.background = (id, w = 320, h = 120) => {
  const k = 'b' + id + w + h; if (cache.has(k)) return cache.get(k);
  const W = 160, Hh = 60, b = new TZ.PixelBuf(W, Hh), H = TZ.hash;
  const sky = { legion: [[16, 6, 34], [120, 50, 150]], dusk: [[40, 30, 60], [220, 110, 70]], forest: [[60, 70, 90], [200, 150, 90]], snow: [[90, 110, 140], [200, 214, 230]], highway: [[30, 30, 50], [170, 90, 60]], fortress: [[20, 24, 40], [90, 70, 80]], bloodmoon: [[20, 4, 6], [120, 20, 16]], ash: [[40, 36, 34], [120, 100, 80]], heli: [[70, 120, 170], [230, 210, 160]], inferno: [[40, 6, 4], [255, 120, 30]], swamp: [[40, 56, 50], [120, 140, 100]], horde: [[24, 20, 28], [140, 50, 40]], lake: [[50, 80, 120], [240, 190, 140]] }[id] || [[40, 30, 60], [220, 110, 70]];
  for (let y = 0; y < Hh; y++) { const c = TZ.mix(sky[0], sky[1], Math.pow(y / Hh, 1.3)); for (let x = 0; x < W; x++) b.set(x, y, (H(x, y, 3) < 0.04 && y < 25) ? TZ.shade(c, 0.15) : c); }
  const disc = (cx, cy, r, c) => b.disc(cx, cy, r, c);
  if (id === 'bloodmoon') disc(120, 16, 9, [200, 30, 24]);
  else if (id === 'dusk' || id === 'highway' || id === 'inferno') disc(40, 44, 10, id === 'inferno' ? [255, 200, 80] : [250, 170, 90]);
  else if (id === 'snow' || id === 'fortress' || id === 'horde') disc(124, 14, 6, [230, 230, 220]);
  const ridge = (base, amp, freq, col, seed) => { for (let x = 0; x < W; x++) { const y0 = Math.round(base + Math.sin(x * freq + seed) * amp + TZ.noise2(x / 9, seed, seed) * amp * 1.5); for (let y = y0; y < Hh; y++) b.set(x, y, col); } };
  if (id === 'snow') { ridge(30, 4, 0.05, [170, 186, 206], 1); ridge(40, 3, 0.08, [214, 224, 236], 2); for (let i = 0; i < 18; i++) { const x = (H(i, 1, 1) * W) | 0, y = 40 + (H(i, 2, 1) * 10 | 0); for (let k = 0; k < 9; k++) b.rect(x - (k >> 1), y - 9 + k, k + 1, 1, k % 3 === 0 ? [240, 246, 255] : [40, 70, 56]); } }
  else if (id === 'swamp') { ridge(38, 2, 0.06, [60, 76, 52], 3); for (let y = 46; y < Hh; y++) for (let x = 0; x < W; x++) b.set(x, y, H(x, y, 4) < 0.1 ? [100, 130, 110] : [56, 80, 70]); for (let i = 0; i < 6; i++) { const x = (H(i, 4, 2) * W) | 0; b.rect(x, 22, 2, 26, [40, 34, 28]); b.line(x, 26, x - 6, 18, [40, 34, 28]); b.line(x + 1, 28, x + 7, 21, [40, 34, 28]); } }
  else if (id === 'highway') { ridge(40, 2, 0.04, [40, 36, 40], 5); b.rect(0, 48, W, 12, [50, 50, 54]); for (let x = 0; x < W; x += 10) b.rect(x, 53, 5, 1, [220, 190, 80]); b.rect(70, 41, 20, 7, [150, 60, 40]); b.rect(74, 37, 12, 5, [60, 70, 90]); b.rect(72, 47, 3, 2, [20, 20, 20]); b.rect(85, 47, 3, 2, [20, 20, 20]); }
  else if (id === 'fortress') { ridge(42, 1, 0.02, [40, 40, 36], 6); for (let x = 20; x < 140; x++) { const y = 30 + ((x % 8) < 4 ? 0 : 2); b.rect(x, y, 1, 18, (x % 8) === 0 ? [80, 80, 76] : [120, 118, 110]); } b.rect(70, 34, 20, 14, [60, 50, 40]); for (const tx of [30, 120]) { b.rect(tx, 16, 8, 32, [100, 98, 92]); b.rect(tx - 1, 14, 10, 3, [140, 136, 126]); b.rect(tx + 3, 10, 2, 4, [255, 200, 80]); } }
  else if (id === 'heli') { ridge(42, 3, 0.05, [70, 110, 60], 7); b.rect(60, 20, 30, 10, [70, 90, 50]); b.rect(88, 23, 22, 3, [70, 90, 50]); b.rect(64, 22, 8, 5, [150, 200, 230]); b.rect(40, 18, 70, 1, [30, 30, 30]); b.disc(76, 25, 3, [240, 240, 240]); b.rect(75, 23, 2, 5, [200, 40, 30]); b.rect(73, 24, 6, 2, [200, 40, 30]); b.rect(62, 31, 24, 1, [40, 40, 40]); }
  else if (id === 'inferno' || id === 'ash') { ridge(40, 4, 0.07, id === 'inferno' ? [60, 14, 10] : [50, 46, 44], 8); for (let i = 0; i < 9; i++) { const x = (H(i, 6, 3) * W) | 0, hh = 6 + (H(i, 7, 3) * 16 | 0); b.rect(x, 44 - hh, 6 + (H(i, 8, 1) * 8 | 0), hh, [30, 26, 24]); if (id === 'inferno') for (let k = 0; k < 10; k++) b.set(x + (H(i, k, 4) * 10 | 0), 44 - hh - (H(k, i, 5) * 6 | 0), [255, 140 + (H(i, k, 6) * 80 | 0), 40]); } }
  else if (id === 'lake') { disc(110, 30, 8, [255, 210, 150]); ridge(30, 5, 0.05, [60, 80, 90], 12); ridge(36, 3, 0.09, [50, 70, 60], 13); for (let y = 42; y < Hh; y++) for (let x = 0; x < W; x++) b.set(x, y, Math.abs(x - 110) < 10 - (y - 42) * 0.3 && H(x, y, 5) < 0.5 ? [250, 200, 150] : H(x, y, 6) < 0.08 ? [120, 160, 190] : [60, 100, 140]); b.rect(20, 44, 30, 3, [100, 70, 44]); b.rect(26, 34, 2, 10, [60, 50, 40]); b.line(28, 34, 46, 30, [70, 60, 50]); b.line(46, 30, 46, 46, [200, 200, 200]); }
  else if (id === 'legion') { for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (H(x, y, 21) < 0.02) b.set(x, y, [255, 230, 160]); disc(80, 22, 11, [255, 210, 90]); disc(80, 22, 8, [255, 240, 180]); ridge(42, 3, 0.05, [40, 16, 60], 21); for (let i = 0; i < 7; i++) { const x = 12 + i * 22; b.rect(x, 30, 3, 14, [70, 30, 100]); b.rect(x - 2, 28, 7, 3, [255, 210, 90]); } }
  else if (id === 'horde') { ridge(44, 2, 0.05, [36, 30, 30], 9); for (let i = 0; i < 40; i++) { const x = (H(i, 9, 1) * W) | 0, y = 40 + (H(i, 10, 1) * 14 | 0); b.rect(x, y - 7, 3, 7, [60 + (H(i, 1, 2) * 30 | 0), 70, 50]); b.rect(x, y - 9, 3, 2, [100, 110, 80]); b.set(x + 3, y - 6, [100, 110, 80]); b.set(x + 1, y - 8, [255, 40, 30]); } }
  else { ridge(36, 4, 0.06, [60, 50, 50], 10); for (let i = 0; i < 22; i++) { const x = (H(i, 11, 1) * W) | 0, y = 46 + (H(i, 12, 1) * 8 | 0); const col = id === 'forest' ? [[220, 130, 40], [190, 60, 30], [230, 190, 60]][i % 3] : [[120, 70, 50], [90, 50, 40]][i % 2]; b.disc(x, y - 10, 6, col); b.rect(x, y - 5, 2, 6, [50, 36, 26]); } ridge(52, 1, 0.1, [40, 34, 30], 11); }
  const out = b.canvas();
  const big = cv(w, h); big.g.imageSmoothingEnabled = false; big.g.drawImage(out, 0, 0, w, h);
  cache.set(k, big); return big;
};
Cos.url = (canvas) => canvas ? canvas.toDataURL() : '';
// HTML card for a profile (own or another player's)
Cos.card = (p, opts = {}) => {
  const rank = Acc.rankOf(p.rn), lvl = Acc.levelOf(p.rn);
  const av = Cos.url(Cos.avatar(p.avatar, p.look, 96)), fr = Cos.url(Cos.frame(p.frame, 96));
  const bg = Cos.url(Cos.background(p.bg));
  const medals = (p.medals || []).map(id => { const c = A.find(a => a.id === id); return c ? `<div class="pmedal" title="${c.name}: ${c.desc}"><img src="${Cos.url(Cos.medal(id))}"><span>${c.name}</span></div>` : ''; }).join('') || '<div class="pnone">Медали не выбраны</div>';
  const s = p.stats || {};
  const next = Acc.nextRank(p.rn);
  const prog = next ? Math.round((p.rn - rank.min) / (next.min - Math.max(0, rank.min)) * 100) : 100;
  return `<div class="pcard ${TZ.FRAMES[p.frame] && TZ.FRAMES[p.frame].anim ? 'anim-' + p.frame : ''}">
    <div class="pbg" style="background-image:url(${bg})"></div>
    <div class="phead2">
      <div class="pav"><img class="pavimg" src="${av}"><img class="pfr" src="${fr}"></div>
      <div class="pinfo"><div class="pname">${esc(p.name)}</div>
        <div class="prank" style="color:${rank.color}"><span class="rbadge" style="background:${rank.color}"></span>${rank.name} · Уровень ${lvl}</div>
        <div class="prn"><b>${p.rn}</b> RN <small>рекорд ${p.rnPeak || p.rn}</small></div>
        <div class="pbar"><i style="width:${clamp(prog, 0, 100)}%;background:${rank.color}"></i></div>
        ${next ? `<div class="pnext">До ранга «${next.name}»: ${next.min - p.rn} RN</div>` : '<div class="pnext">Максимальный ранг</div>'}
      </div>
    </div>
    <div class="pmedals">${medals}</div>
    <div class="pstats">
      <div><b>${s.kills || 0}</b><span>убито зомби</span></div><div><b>${s.maxDay || 0}</b><span>лучший день</span></div><div><b>${s.nights || 0}</b><span>ночей пережито</span></div>
      <div><b>${s.built || 0}</b><span>построено</span></div><div><b>${s.km || 0}</b><span>км за рулём</span></div><div><b>${s.recruited || 0}</b><span>выживших спасено</span></div>
      <div><b>${s.deaths || 0}</b><span>смертей</span></div><div><b>${s.heads || 0}</b><span>в голову</span></div><div><b>${p.achCount || 0}/${A.length}</b><span>достижений</span></div>
    </div>
  </div>`;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
TZ.esc = esc;
})();
