// =====================================================================
//  THE ZOMBIES — website: procedural pixel art (logo, medals, icons, sprites).
//  Same drawing rules as the game (js/uikit.js, js/account.js).
// =====================================================================
'use strict';
(function () {
const PX = window.PX = {};

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => { h = String(h).replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const shade = (c, f) => f >= 0 ? c.map(v => Math.round(v + (255 - v) * f)) : c.map(v => Math.round(v * (1 + f)));
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c, a) => a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function RNG(seed) { let s = seed >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; c.g = g; return c; };
Object.assign(PX, { lerp, hex, shade, mix, rgb, hash, RNG, canvas });

class PixelBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; return; }
    const t = a / 255, ia = this.d[i + 3] / 255, oa = t + ia * (1 - t); if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * t + this.d[i + k] * ia * (1 - t)) / oa;
    this.d[i + 3] = oa * 255;
  }
  rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  disc(cx, cy, r, colFn) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) { const c = typeof colFn === 'function' ? colFn(dx, dy, x, y) : colFn; if (c) this.set(x, y, c); } } }
  canvas(outline, oc) {
    const c = canvas(this.w, this.h); const id = c.g.createImageData(this.w, this.h); id.data.set(this.d); c.g.putImageData(id, 0, 0);
    if (outline) PX.outline(c, oc || [16, 13, 12]); return c;
  }
}
PX.PixelBuf = PixelBuf;
PX.outline = (c, col) => {
  const g = c.g, w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), p = d.data, src = new Uint8ClampedArray(p);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (src[i + 3] > 40) continue;
    const n = (x > 0 && src[i - 1] > 140) || (x < w - 1 && src[i + 7] > 140) || (y > 0 && src[i - w * 4 + 3] > 140) || (y < h - 1 && src[i + w * 4 + 3] > 140);
    if (n) { p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; p[i + 3] = 255; }
  }
  g.putImageData(d, 0, 0);
};
const scaled = (src, k) => { const c = canvas(src.width * k, src.height * k); c.g.drawImage(src, 0, 0, c.width, c.height); return c; };
PX.scaled = scaled;
const cache = new Map();
PX.url = (c) => { if (!c) return ''; if (!c._url) c._url = c.toDataURL(); return c._url; };

// ---------------------------------------------------------------- the logo (weathered letters + blood drips)
PX.logo = (text = 'ZOMBIES', px = 16, seed = 7) => {
  const w = text.length * px + 8, h = px + 22, c = canvas(w, h), g = c.g;
  g.font = `${px}px "Press Start 2P"`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(text, 4, 3);
  const src = g.getImageData(0, 0, w, h).data, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 110;
  const W2 = w + 4, H2 = h + 4, out = new PixelBuf(W2, H2), solid = new Uint8Array(W2 * H2);
  const R = RNG(seed);
  let top = h, bot = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  if (bot <= top) return null; // font not ready
  const put = (x, y, col) => { out.set(x + 2, y + 2, col); solid[(y + 2) * W2 + x + 2] = 1; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const t = (y - top) / Math.max(1, bot - top);
    let col = t < 0.42 ? mix([246, 238, 214], [214, 200, 168], t / 0.42) : mix([196, 34, 24], [104, 10, 8], (t - 0.42) / 0.58);
    if (t > 0.38 && t < 0.5) col = [150, 20, 14];
    if (!on(x, y - 1)) col = shade(col, 0.22);
    if (hash(x, y, seed) < 0.05 && on(x + 1, y) && on(x - 1, y) && on(x, y + 1) && on(x, y - 1)) col = shade(col, -0.45);
    put(x, y, col);
  }
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) {
    if (!on(x, y)) continue; if (on(x, y + 1) || R() > 0.16) break;
    const len = 2 + (R() * R() * 14 | 0); let yy = y + 1;
    for (let k = 0; k < len && yy < h + 1; k++, yy++) put(x, yy, k > len - 2 ? [210, 40, 30] : [140, 14, 10]);
    if (len > 6 && x + 1 < w) { put(x + 1, yy - 2, [120, 10, 8]); put(x, yy, [200, 36, 28]); put(x + 1, yy - 1, [170, 24, 18]); }
    break;
  }
  const res = canvas(W2 + 3, H2 + 3), rg = res.g, id = rg.createImageData(W2 + 3, H2 + 3), d = id.data;
  const at = (x, y) => x >= 0 && y >= 0 && x < W2 && y < H2 && solid[y * W2 + x];
  for (let y = 0; y < H2 + 3; y++) for (let x = 0; x < W2 + 3; x++) {
    const k = (y * (W2 + 3) + x) * 4;
    if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) || at(x - 1, y - 1) || at(x + 1, y + 1))) { d[k] = 8; d[k + 1] = 4; d[k + 2] = 4; d[k + 3] = 255; }
    else if (!at(x, y) && (at(x - 3, y - 3) || at(x - 2, y - 3) || at(x - 3, y - 2))) { d[k + 3] = 170; }
  }
  rg.putImageData(id, 0, 0); rg.drawImage(out.canvas(), 0, 0);
  return res;
};
// a one-colour copy of a canvas (for the glitch layers)
PX.tint = (src, col) => {
  const c = canvas(src.width, src.height); c.g.drawImage(src, 0, 0);
  c.g.globalCompositeOperation = 'source-in'; c.g.fillStyle = col; c.g.fillRect(0, 0, c.width, c.height); return c;
};

// ---------------------------------------------------------------- medals / badges (7×7 glyphs)
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
  // website extras
  house: ['...#...', '..###..', '.#####.', '#######', '.#...#.', '.#.#.#.', '.#.#.#.'],
  mic: ['..###..', '..###..', '..###..', '#.###.#', '#..#..#', '.#####.', '...#...'],
  shirt: ['.##.##.', '#######', '#.###.#', '..###..', '..###..', '..###..', '..###..'],
  chat: ['#######', '#.....#', '#.#.#.#', '#.....#', '#######', '.##....', '.#.....'],
  car: ['.......', '..###..', '.#...#.', '#######', '#######', '.#...#.', '.......'],
  lock: ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'],
};
PX.GLYPH = GLYPH;
PX.badge = (medal, size = 48) => {
  const k = 'bd' + medal.join() + size; if (cache.has(k)) return cache.get(k);
  const [shape, color, glyph] = medal; const base = hex(color);
  const S = 20, b = new PixelBuf(S, S), dk = shade(base, -0.45), lt = shade(base, 0.35);
  for (let y = 0; y < 5; y++) { b.rect(5, y, 3, 1, [170, 40, 36]); b.rect(12, y, 3, 1, [50, 70, 150]); }
  const cx = 10, cy = 12;
  if (shape === 'circle') b.disc(cx, cy, 7.5, (dx, dy) => Math.hypot(dx, dy) > 6.4 ? dk : (dx + dy < -3 ? lt : base));
  else if (shape === 'star') { for (let y = 4; y < 20; y++) for (let x = 2; x < 18; x++) { const a = Math.atan2(y + .5 - cy, x + .5 - cx), r = Math.hypot(x + .5 - cx, y + .5 - cy); const lim = 4.6 + 3.2 * (0.5 + 0.5 * Math.cos(a * 5 + Math.PI / 2)); if (r < lim) b.set(x, y, r > lim - 1.2 ? dk : (x + y < 20 ? lt : base)); } }
  else { for (let y = 5; y < 20; y++) { const w = y < 13 ? 7 : 7 - (y - 13) * 1.1; for (let x = -w; x <= w; x++) { const px = Math.round(cx + x - .5); b.set(px, y, Math.abs(x) > w - 1.2 || y === 5 || y > 17 ? dk : (x < -1 ? lt : base)); } } }
  const g = GLYPH[glyph] || GLYPH.skull;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (g[y][x] === '#') b.set(cx - 3 + x - 0.5, cy - 3 + y, dk);
  const out = b.canvas(true, [16, 12, 10]);
  const big = canvas(size, size); big.g.imageSmoothingEnabled = false; big.g.drawImage(out, 0, 0, size, size);
  cache.set(k, big); return big;
};
// shop products → medal
const SHOP = { coin: ['circle', '#f0c040', 'coin'], globe: ['star', '#5fd0ff', 'globe'], star: ['star', '#c080ff', 'star'], pot: ['circle', '#e8a030', 'pot'], cross: ['circle', '#ff6a6a', 'cross'], blade: ['shield', '#c8d0d8', 'blade'], brick: ['shield', '#c07a3a', 'brick'], wrench: ['circle', '#e8a030', 'wrench'], paw: ['circle', '#a07040', 'paw'] };
PX.shopIcon = (icon, size = 64) => PX.badge(SHOP[icon] || SHOP.star, size);
PX.classIcon = (c, size = 56) => PX.badge([c.id === 'survivor' ? 'circle' : c.price >= 1000 ? 'star' : 'shield', /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#c8d0d8', c.icon], size);

// ---------------------------------------------------------------- sprites from strings
// rows of characters; each char maps to a colour in pal ('.' = transparent)
PX.sprite = (rows, pal, k = 1, outline) => {
  const key = 'sp' + rows.join('|') + JSON.stringify(pal) + k + outline; if (cache.has(key)) return cache.get(key);
  const w = Math.max(...rows.map(r => r.length)), h = rows.length, b = new PixelBuf(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) { const c = pal[rows[y][x]]; if (c) b.set(x + 1, y + 1, hex(c)); }
  const c = scaled(b.canvas(!!outline, outline ? hex(outline) : null), k); cache.set(key, c); return c;
};
// platform icons for the download buttons
const PL = {
  pc: [
    '............',
    '.##########.',
    '.#bbbbbbbb#.',
    '.#bwbbbbbb#.',
    '.#bbbbbbbb#.',
    '.#bbbbbbbb#.',
    '.#bbbbbbbb#.',
    '.##########.',
    '.....##.....',
    '...######...',
    '............',
  ],
  android: [
    '..g......g..',
    '...g....g...',
    '...gggggg...',
    '..gggggggg..',
    '..gwggggwg..',
    '..gggggggg..',
    '............',
    'g.gggggggg.g',
    'g.gggggggg.g',
    'g.gggggggg.g',
    '..gggggggg..',
    '...gg..gg...',
    '...gg..gg...',
  ],
  ios: [
    '...######...',
    '..#wwwwww#..',
    '..#w####w#..',
    '..#w#bb#w#..',
    '..#w#bb#w#..',
    '..#w####w#..',
    '..#w#bb#w#..',
    '..#w####w#..',
    '..#wwwwww#..',
    '..#www#ww#..',
    '...######...',
  ],
  web: [
    '...######...',
    '..#bbbbbb#..',
    '.#bbgbbbbb#.',
    '#bggggbbggb#',
    '#bbggggbbbb#',
    '#bbbgggbbbb#',
    '#bbbbggbgbb#',
    '#bbbbgbbggb#',
    '.#bbbbbbbb#.',
    '..#bbbbbb#..',
    '...######...',
  ],
};
const PLP = {
  pc: { '#': '#c8ccd4', b: '#2a5a8a', w: '#9ad8ff' },
  android: { g: '#8fd86a', w: '#14110c' },
  ios: { '#': '#d8dce4', w: '#3a3e48', b: '#e8b030' },
  web: { '#': '#3a7ab0', b: '#5fb0ff', g: '#8fd86a' },
};
PX.platform = (id, k = 3) => PX.sprite(PL[id], PLP[id], k, '#050605');

// small UI icons (copy, coin, user, logout …) — 7×7 like the medals, one colour
PX.glyph = (name, color = '#e6e2d4', k = 2) => {
  const g = GLYPH[name] || GLYPH.skull; return PX.sprite(g, { '#': color }, k);
};
PX.coin = (k = 2) => PX.sprite(['.###.', '#yyy#', '#ywy#', '#yyy#', '.###.'].map(r => r.replace(/#/g, 'o')), { o: '#8a5a10', y: '#f0c040', w: '#fff3b0' }, k, '#140e06');

// ---------------------------------------------------------------- shambling zombie silhouettes (for the hero)
PX.ZOMBIE = [
  [
    '..###....',
    '..####...',
    '..#e#....',
    '..###....',
    '.#####...',
    '#######..',
    '#.#####..',
    '..####.##',
    '..####...',
    '..#..#...',
    '..#..#...',
    '.##..#...',
    '.#...##..',
  ],
  [
    '..###....',
    '..####...',
    '..#e#....',
    '..###....',
    '.#####...',
    '#######..',
    '#.#####.#',
    '..######.',
    '..####...',
    '..#..#...',
    '..#.#....',
    '..#.#....',
    '..##.##..',
  ],
  [
    '...###...',
    '...####..',
    '...#e#...',
    '...###...',
    '..#####..',
    '.######..',
    '.#.#####.',
    '...####.#',
    '...####..',
    '...#..#..',
    '..#...#..',
    '..#....#.',
    '.##....##',
  ],
];
})();
