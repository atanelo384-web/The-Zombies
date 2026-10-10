// =====================================================================
//  THE ZOMBIES — core utilities, math, RNG, input
// =====================================================================
'use strict';
const TZ = window.TZ = {};

TZ.VERSION = '5.0.0';
TZ.TW = 32;            // iso tile width  (virtual px)
TZ.TH = 16;            // iso tile height (virtual px)

// ---------- math ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const smooth = t => t * t * (3 - 2 * t);
Object.assign(TZ, { clamp, lerp, dist, dist2, angDiff, smooth });

// iso projection (tile coords -> virtual screen px, before camera)
TZ.isoX = (x, y) => (x - y) * (TZ.TW / 2);
TZ.isoY = (x, y) => (x + y) * (TZ.TH / 2);
TZ.unIso = (sx, sy) => {
  const a = sx / (TZ.TW / 2), b = sy / (TZ.TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
};

// ---------- RNG (mulberry32) ----------
TZ.RNG = function (seed) {
  let s = seed >>> 0;
  const r = () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.range = (a, b) => a + r() * (b - a);
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.state = () => s;
  return r;
};
TZ.rand = TZ.RNG((Math.random() * 1e9) | 0);

// deterministic hash for tile variants
TZ.hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// smooth value noise
TZ.noise2 = (x, y, seed = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = TZ.hash(xi, yi, seed), b = TZ.hash(xi + 1, yi, seed);
  const c = TZ.hash(xi, yi + 1, seed), d = TZ.hash(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
};
TZ.fbm = (x, y, seed = 0) => TZ.noise2(x, y, seed) * 0.6 + TZ.noise2(x * 2.1, y * 2.1, seed + 7) * 0.3 + TZ.noise2(x * 4.3, y * 4.3, seed + 13) * 0.1;

// ---------- colors ----------
TZ.hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
TZ.shade = (c, f) => { // c: [r,g,b] -> brighten (f>0) / darken (f<0)
  return f >= 0 ? c.map(v => Math.round(v + (255 - v) * f)) : c.map(v => Math.round(v * (1 + f)));
};
TZ.rgb = c => `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
TZ.mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------- canvas helpers ----------
TZ.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; c.g = g; return c; };

// pixel map -> canvas.  map: array of strings, pal: {char: '#rrggbb' | [r,g,b]}
TZ.pixmap = (map, pal, scale = 1) => {
  const h = map.length, w = Math.max(...map.map(r => r.length));
  const c = TZ.canvas(w * scale, h * scale);
  for (let y = 0; y < h; y++) for (let x = 0; x < map[y].length; x++) {
    const ch = map[y][x]; if (ch === '.' || ch === ' ') continue;
    const col = pal[ch]; if (!col) continue;
    c.g.fillStyle = typeof col === 'string' ? col : TZ.rgb(col);
    c.g.fillRect(x * scale, y * scale, scale, scale);
  }
  return c;
};

// add 1px dark outline around opaque pixels
TZ.outline = (c, col = [18, 14, 12], alpha = 255) => {
  const g = c.g || c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data, w = c.width, h = c.height;
  const src = new Uint8ClampedArray(p);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] > 40) continue;
    let n = false;
    if (x > 0 && src[i - 4 + 3] > 140) n = true;
    else if (x < w - 1 && src[i + 4 + 3] > 140) n = true;
    else if (y > 0 && src[i - w * 4 + 3] > 140) n = true;
    else if (y < h - 1 && src[i + w * 4 + 3] > 140) n = true;
    if (n) { p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; p[i + 3] = alpha; }
  }
  g.putImageData(d, 0, 0);
  return c;
};

TZ.flipH = c => { const o = TZ.canvas(c.width, c.height); o.g.translate(c.width, 0); o.g.scale(-1, 1); o.g.drawImage(c, 0, 0); return o; };

// tinted copy (for hit flash / silhouettes)
TZ.tint = (c, col) => {
  const o = TZ.canvas(c.width, c.height); o.g.drawImage(c, 0, 0);
  o.g.globalCompositeOperation = 'source-atop'; o.g.fillStyle = col; o.g.fillRect(0, 0, c.width, c.height);
  return o;
};

// ---------- key bindings (Settings → Управление) ----------
TZ.BINDS = [
  ['up', 'Вперёд', ['KeyW', 'ArrowUp']], ['down', 'Назад', ['KeyS', 'ArrowDown']], ['left', 'Влево', ['KeyA', 'ArrowLeft']], ['right', 'Вправо', ['KeyD', 'ArrowRight']],
  ['sprint', 'Бег', ['ShiftLeft', 'ShiftRight']], ['reload', 'Перезарядка', ['KeyR']], ['interact', 'Действие / обыскать / сесть', ['KeyE']], ['heal', 'Быстрое лечение', ['KeyQ']],
  ['light', 'Фонарик', ['KeyL']], ['team', 'Приказ команде', ['KeyF']], ['ping', 'Метка на карте', ['KeyG']], ['voice', 'Голос (рация, удерживать)', ['KeyZ']],
  ['inv', 'Инвентарь', ['Tab', 'KeyI']], ['craft', 'Крафт', ['KeyC']], ['build', 'Стройка', ['KeyB']], ['demolish', 'Разобрать (в стройке)', ['KeyX']],
  ['map', 'Карта мира', ['KeyM']], ['chat', 'Чат', ['KeyT', 'Enter']], ['cmd', 'Команда в чате', ['Slash']], ['phrases', 'Быстрые фразы', ['KeyV']],
  ['players', 'Список игроков', ['F3']], ['clan', 'Друзья и клан', ['KeyK']], ['help', 'Справка', ['F1']], ['brake', 'Ручник (в машине)', ['Space']], ['horn', 'Сигнал (в машине)', ['KeyH']],
];
TZ.defAct = {}; for (const [a, , c] of TZ.BINDS) for (const k of c) if (!TZ.defAct[k]) TZ.defAct[k] = a;
TZ.keyName = (c) => !c ? '—' : c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c.startsWith('Numpad') ? 'Num ' + c.slice(6) : ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'П.Shift', ControlLeft: 'Ctrl', ControlRight: 'П.Ctrl', AltLeft: 'Alt', AltRight: 'П.Alt', Space: 'Пробел', Enter: 'Enter', Tab: 'Tab', Slash: '/', Backquote: '`', CapsLock: 'Caps', Backspace: '←Bksp', Mouse3: 'Колесо', Mouse4: 'Мышь 4', Mouse5: 'Мышь 5' })[c] || c;
// ---------- input ----------
TZ.input = {
  keys: {}, pressed: {}, binds: null, capture: null,
  loadBinds() { const saved = TZ.store.get('binds', {}); this.binds = {}; for (const [a, , d] of TZ.BINDS) this.binds[a] = Array.isArray(saved[a]) ? saved[a].slice(0, 2) : d.slice(); },
  saveBinds() { TZ.store.set('binds', this.binds); },
  resetBinds() { TZ.store.del('binds'); this.loadBinds(); },
  // an action is on if any of its keys is held (or a touch button holds it)
  act(a) { if (this.pressed['@' + a]) return true; if (!this.binds) this.loadBinds(); const b = this.binds[a]; return !!b && (this.pressed[b[0]] || (b[1] && this.pressed[b[1]])); },
  on(a) { if (this.keys['@' + a]) return true; if (!this.binds) this.loadBinds(); const b = this.binds[a]; return !!b && !!(this.keys[b[0]] || (b[1] && this.keys[b[1]])); },
  vpress(code) { const a = TZ.defAct[code]; this.pressed[a ? '@' + a : code] = true; },
  vkey(code, on) { const a = TZ.defAct[code]; this.keys[a ? '@' + a : code] = on; }, mouse: { x: 0, y: 0, down: false, rdown: false, clicked: false, rclicked: false, wheel: 0 },
  init(canvas) {
    window.addEventListener('keydown', e => {
      if (this.capture) { e.preventDefault(); e.stopPropagation(); const f = this.capture; this.capture = null; f(e.code); return; }
      if (e.target && (e.target.tagName === 'INPUT')) return;
      const k = e.code;
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      if (['Tab', 'Space', 'F1', 'F3', 'F5', 'F9', 'Slash'].includes(k) || (k.startsWith('Arrow'))) e.preventDefault();
      if (TZ.app && TZ.app.state === 'game' && /^(Key|Digit|Space|Tab|Shift|Control|Alt|Quote|Semicolon|Comma|Period|Backquote|Bracket)/.test(k) && !(e.ctrlKey && (k === 'KeyC' || k === 'KeyV'))) { if (k === 'Tab' || k === 'Space' || k.startsWith('Alt') || k === 'Quote' || k === 'Slash') e.preventDefault(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    canvas.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', e => {
      if (this.capture && e.button > 0) { const f = this.capture; this.capture = null; f('Mouse' + (e.button + 1)); return; }
      if (e.button === 1 || e.button === 3 || e.button === 4) { const c = 'Mouse' + (e.button + 1); this.keys[c] = true; this.pressed[c] = true; }
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.mouse.rclicked = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button === 1 || e.button === 3 || e.button === 4) this.keys['Mouse' + (e.button + 1)] = false; if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    canvas.addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('contextmenu', e => e.preventDefault());
  },
  hit(code) { return !!this.pressed[code]; },
  endFrame() { this.pressed = {}; this.mouse.clicked = false; this.mouse.rclicked = false; this.mouse.wheel = 0; }
};

// ---------- storage (safe) ----------
TZ.store = {
  get(k, def = null) { try { const v = localStorage.getItem('thezombies_' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('thezombies_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('thezombies_' + k); } catch (e) { } }
};

// ---------- binary min-heap for Dijkstra ----------
TZ.Heap = class {
  constructor(cap) { this.k = new Int32Array(cap); this.v = new Float32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) { const nk = new Int32Array(this.k.length * 2), nv = new Float32Array(this.k.length * 2); nk.set(this.k); nv.set(this.v); this.k = nk; this.v = nv; }
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= val) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = k[0], topV = v[0]; this.lastV = topV;
    const lk = k[--this.n], lv = v[this.n]; let i = 0;
    while (true) {
      let c = i * 2 + 1; if (c >= this.n) break;
      if (c + 1 < this.n && v[c + 1] < v[c]) c++;
      if (v[c] >= lv) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = lk; v[i] = lv; return top;
  }
};

// ---------- spatial hash for entities (unbounded coordinates) ----------
TZ.Grid = class {
  constructor(_, cell = 2) { this.cell = cell; this.m = new Map(); }
  key(cx, cy) { return ((cx & 0xffff) << 16) | (cy & 0xffff); }
  clear() { if (this.m.size > 3000) this.m.clear(); else for (const a of this.m.values()) a.length = 0; }
  add(e) { const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell)); let a = this.m.get(k); if (!a) { a = []; this.m.set(k, a); } a.push(e); }
  query(x, y, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell), x1 = Math.floor((x + r) / this.cell), y0 = Math.floor((y - r) / this.cell), y1 = Math.floor((y + r) / this.cell);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const a = this.m.get(this.key(cx, cy)); if (a) for (let i = 0; i < a.length; i++) out.push(a[i]); }
    return out;
  }
};

TZ.fmtTime = mins => { const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

// ---------------------------------------------------------------- pixel QR code (qrcode-generator, MIT)
TZ.qr = (text, cell = 6) => {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), pad = 3, size = (n + pad * 2) * cell;
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  g.fillStyle = '#e8e2cc'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#14160f';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + pad) * cell, (y + pad) * cell, cell, cell);
  return cv;
};

// ---------------------------------------------------------------- platform & UI scale
(() => {
  const ua = navigator.userAgent || '', q = new URLSearchParams(location.search);
  TZ.isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  TZ.isAndroid = /Android/.test(ua);
  TZ.isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || /TheZombiesApp/.test(navigator.userAgent);
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  TZ.touchAuto = coarse || TZ.isIOS || TZ.isAndroid || (navigator.maxTouchPoints > 1 && !(window.matchMedia && matchMedia('(pointer: fine)').matches));
  TZ.touchForced = q.has('touch') ? q.get('touch') !== '0' : null;
  TZ.isTouch = TZ.touchForced ?? TZ.touchAuto;
  TZ.platform = TZ.isApp ? (TZ.isIOS ? 'ios-app' : 'android-app') : TZ.isIOS ? 'ios' : TZ.isAndroid ? 'android' : window.tzNative ? 'desktop' : 'web';
  TZ.uiz = 1;
  TZ.applyUIScale = () => {
    const W = window.innerWidth, H = window.innerHeight, set = TZ.settings || {};
    let z = set.uiScale > 0 ? set.uiScale : TZ.isTouch ? Math.min(1, Math.max(0.48, Math.min(W / 1300, H / 600))) : Math.min(1, Math.max(0.6, Math.min(W / 1500, H / 840)));
    if (set.uiScale > 0 && TZ.isTouch) z *= Math.min(1, Math.max(0.48, Math.min(W / 1300, H / 600)));
    z = Math.round(z * 100) / 100;
    TZ.uiz = z;
    const r = document.documentElement.style;
    r.setProperty('--uiz', z); r.setProperty('--VW', (W / z) + 'px'); r.setProperty('--VH', (H / z) + 'px');
    r.setProperty('--rw', W + 'px'); r.setProperty('--rh', H + 'px');
    document.body.classList.toggle('mobile', !!TZ.isTouch);
    document.body.classList.toggle('ios', !!TZ.isIOS);
    document.body.classList.toggle('portrait', TZ.isTouch && H > W);
  };
})();
