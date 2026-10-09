// =====================================================================
//  THE ZOMBIES — procedural pixel art: tiles, iso blocks, props
// =====================================================================
'use strict';
TZ.art = {};

// ---------- pixel buffer ----------
class PixelBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; return; }
    const t = a / 255, ia = this.d[i + 3] / 255, oa = t + ia * (1 - t);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * t + this.d[i + k] * ia * (1 - t)) / oa;
    this.d[i + 3] = oa * 255;
  }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null; const i = (y * this.w + x) * 4; return this.d[i + 3] ? [this.d[i], this.d[i + 1], this.d[i + 2]] : null; }
  rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  disc(cx, cy, r, colFn) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) { const c = typeof colFn === 'function' ? colFn(dx, dy, x, y) : colFn; if (c) this.set(x, y, c); } } }
  ellipse(cx, cy, rx, ry, colFn) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) { const c = typeof colFn === 'function' ? colFn(dx, dy, x, y) : colFn; if (c) this.set(x, y, c); } } }
  line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0; for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; this.set(Math.round(lerp(x0, x1, t)), Math.round(lerp(y0, y1, t)), c); } }
  canvas(outline = false, oc) {
    const c = TZ.canvas(this.w, this.h); const id = c.g.createImageData(this.w, this.h); id.data.set(this.d); c.g.putImageData(id, 0, 0);
    if (outline) TZ.outline(c, oc || [16, 13, 12]);
    return c;
  }
}
TZ.PixelBuf = PixelBuf;
const H = TZ.hash, sh = TZ.shade, hx = TZ.hex;
const jitter = (c, amt, n) => c.map(v => clamp(v + (n - 0.5) * amt, 0, 255));

// ---------- iso box ----------
// draws an iso box into buf. ox,oy = screen pos of world point (0,0,0)
// footprint [x0,x0+lx]x[y0,y0+ly] in tile units, height h px from z0.
// tex.{top,left,right}(u,v,face) -> color|null.  u,v in px along face.
function isoBox(buf, ox, oy, x0, y0, lx, ly, z0, h, tex, opts = {}) {
  const shadeTop = opts.top ?? 0.04, shadeL = opts.left ?? -0.1, shadeR = opts.right ?? -0.3;
  const zt = z0 + h;
  // top face
  if (tex.top) {
    const pts = [[x0, y0], [x0 + lx, y0], [x0 + lx, y0 + ly], [x0, y0 + ly]].map(([x, y]) => [ox + (x - y) * 16, oy + (x + y) * 8 - zt]);
    const minX = Math.floor(Math.min(...pts.map(p => p[0]))), maxX = Math.ceil(Math.max(...pts.map(p => p[0])));
    const minY = Math.floor(Math.min(...pts.map(p => p[1]))), maxY = Math.ceil(Math.max(...pts.map(p => p[1])));
    for (let py = minY; py < maxY; py++) for (let px = minX; px < maxX; px++) {
      const a = (px + 0.5 - ox) / 16, b = (py + 0.5 - oy + zt) / 8;
      const x = (a + b) / 2, y = (b - a) / 2;
      if (x < x0 || x >= x0 + lx || y < y0 || y >= y0 + ly) continue;
      const u = (x - x0) * 16, v = (y - y0) * 16;
      let c = tex.top(u, v, 'top'); if (!c) continue;
      // rim highlight
      const edge = Math.min(u, v, lx * 16 - u, ly * 16 - v);
      c = sh(c, edge < 1.2 && opts.rim !== false ? shadeTop + 0.12 : shadeTop);
      buf.set(px, py, c);
    }
  }
  // left face (plane y = y0+ly)
  if (tex.left) {
    const Y = y0 + ly;
    const sx0 = Math.floor(ox + (x0 - Y) * 16), sx1 = Math.ceil(ox + (x0 + lx - Y) * 16);
    for (let px = sx0; px < sx1; px++) {
      const x = (px + 0.5 - ox) / 16 + Y; if (x < x0 || x > x0 + lx) continue;
      const base = oy + (x + Y) * 8;
      for (let py = Math.floor(base - zt); py < Math.ceil(base - z0); py++) {
        const z = base - (py + 0.5); if (z < z0 || z > zt) continue;
        const u = (x - x0) * 16, v = z - z0;
        let c = tex.left(u, v, 'left'); if (!c) continue;
        if (opts.rim !== false && (u < 1 || zt - z < 1)) c = sh(c, 0.1);
        buf.set(px, py, sh(c, shadeL));
      }
    }
  }
  // right face (plane x = x0+lx)
  if (tex.right) {
    const X = x0 + lx;
    const sx0 = Math.floor(ox + (X - y0 - ly) * 16), sx1 = Math.ceil(ox + (X - y0) * 16);
    for (let px = sx0; px < sx1; px++) {
      const y = X - (px + 0.5 - ox) / 16; if (y < y0 || y > y0 + ly) continue;
      const base = oy + (X + y) * 8;
      for (let py = Math.floor(base - zt); py < Math.ceil(base - z0); py++) {
        const z = base - (py + 0.5); if (z < z0 || z > zt) continue;
        const u = (y0 + ly - y) * 16, v = z - z0;
        let c = tex.right(u, v, 'right'); if (!c) continue;
        if (opts.rim !== false && zt - z < 1) c = sh(c, 0.08);
        buf.set(px, py, sh(c, shadeR));
      }
    }
  }
}
TZ.isoBox = isoBox;

// ---------- textures ----------
const T = TZ.tex = {
  flat: (c, n = 10, s = 1) => (u, v) => jitter(c, n, H(u | 0, v | 0, s)),
  noise: (c, n = 18, s = 1) => (u, v) => jitter(c, n, H(u | 0, v | 0, s) * 0.6 + TZ.noise2(u / 4, v / 4, s) * 0.4),
  planksV: (c, w = 4, s = 3) => (u, v) => {
    const i = Math.floor(u / w), f = u - i * w;
    let col = sh(c, (H(i, 0, s) - 0.5) * 0.25);
    if (f < 1) col = sh(col, -0.35);
    if (H(i, Math.floor(v / 9), s + 1) < 0.08 && (v % 9) < 1) col = sh(col, -0.3);
    return jitter(col, 12, H(u | 0, v | 0, s + 2));
  },
  planksH: (c, w = 4, s = 4) => (u, v) => {
    const i = Math.floor(v / w), f = v - i * w;
    let col = sh(c, (H(i, 7, s) - 0.5) * 0.25);
    if (f < 1) col = sh(col, -0.35);
    const seg = Math.floor((u + H(i, 3, s) * 20) / 18);
    if (((u + H(i, 3, s) * 20) % 18) < 1) col = sh(col, -0.3);
    if (H(i, seg, s) < 0.15 && ((u | 0) % 7) === 3 && f > 1.5 && f < 2.5) col = sh(col, -0.25); // nail
    return jitter(col, 10, H(u | 0, v | 0, s + 2));
  },
  bricks: (c, mortar, s = 5) => (u, v) => {
    const row = Math.floor(v / 4), off = (row % 2) * 4;
    const bu = (u + off) % 8, bv = v % 4;
    if (bv < 1 || bu < 1) return jitter(mortar, 10, H(u | 0, v | 0, s));
    const bi = Math.floor((u + off) / 8);
    return jitter(sh(c, (H(bi, row, s) - 0.5) * 0.3), 14, H(u | 0, v | 0, s + 1));
  },
  corrugated: (c, s = 6) => (u, v) => {
    const k = (u % 3);
    let col = k < 1 ? sh(c, 0.15) : k < 2 ? c : sh(c, -0.2);
    const rust = TZ.noise2(u / 5, v / 5, s);
    if (rust > 0.62) col = TZ.mix(col, [120, 62, 32], (rust - 0.62) * 2.2);
    return jitter(col, 10, H(u | 0, v | 0, s));
  },
  stoneBlocks: (c, s = 7) => (u, v) => {
    const row = Math.floor(v / 5), off = (row % 2) * 5;
    const bu = (u + off) % 10, bv = v % 5;
    if (bv < 1 || bu < 1) return sh(c, -0.4);
    const bi = Math.floor((u + off) / 10);
    let col = sh(c, (H(bi, row, s) - 0.5) * 0.35);
    if (bv < 2 && bu > 1) col = sh(col, 0.1);
    return jitter(col, 16, H(u | 0, v | 0, s + 1));
  },
  plaster: (c, s = 8) => (u, v) => {
    let col = jitter(c, 14, H(u | 0, v | 0, s));
    const n = TZ.noise2(u / 6, v / 6, s);
    if (n > 0.66) col = sh(col, -0.22); // stains
    if (n < 0.2) col = TZ.mix(col, [150, 110, 90], 0.4); // exposed brick
    return col;
  },
};

// ---------- ground tiles ----------
const tileDefs = {
  0: (x, y, s) => { // grass
    const base = TZ.mix([72, 92, 44], [96, 104, 52], TZ.noise2(x / 6 + s, y / 6, s));
    const r = H(x, y, s);
    if (r < 0.06) return sh(base, -0.25);
    if (r < 0.09) return sh(base, 0.18);
    if (r < 0.103) return TZ.pick3(s + x, [[196, 112, 44], [170, 60, 36], [214, 168, 62]]);
    return jitter(base, 10, H(x, y, s + 9));
  },
  1: (x, y, s) => { // dry/dark grass
    const base = TZ.mix([86, 88, 44], [118, 108, 60], TZ.noise2(x / 5, y / 5, s + 2));
    const r = H(x, y, s);
    if (r < 0.08) return sh(base, -0.22);
    if (r < 0.11) return sh(base, 0.16);
    return jitter(base, 12, H(x, y, s + 3));
  },
  2: (x, y, s) => { // dirt
    const base = TZ.mix([96, 74, 52], [116, 90, 62], TZ.noise2(x / 4, y / 4, s));
    const r = H(x, y, s);
    if (r < 0.05) return [140, 128, 112];
    if (r < 0.12) return sh(base, -0.2);
    return jitter(base, 10, H(x, y, s + 1));
  },
  3: (x, y, s) => { // asphalt
    const base = TZ.mix([56, 56, 60], [70, 70, 72], TZ.noise2(x / 5, y / 5, s));
    const r = H(x, y, s);
    if (r < 0.04) return sh(base, 0.25);
    if (r < 0.09) return sh(base, -0.25);
    return jitter(base, 8, H(x, y, s + 1));
  },
  5: (x, y, s) => { // concrete sidewalk slabs
    const base = [116, 114, 108];
    const gx = Math.floor((x + y * 2 + 64) / 16), gy = Math.floor((y * 2 - x + 64) / 16);
    if (((x + y * 2 + 64) % 16) < 1 || ((y * 2 - x + 64) % 16) < 1) return sh(base, -0.3);
    return jitter(sh(base, (H(gx, gy, s) - 0.5) * 0.15), 12, H(x, y, s));
  },
  6: (x, y, s) => { // wood floor planks (diagonal in iso)
    const p = Math.floor((y * 2 - x + 64) / 4);
    const base = sh([122, 84, 54], (H(p, 0, s) - 0.5) * 0.25);
    if (((y * 2 - x + 64) % 4) < 1) return sh(base, -0.35);
    return jitter(base, 10, H(x, y, s));
  },
  7: (x, y, s) => { // gravel
    const base = [118, 108, 90];
    const r = H(x, y, s);
    if (r < 0.2) return sh(base, -0.25); if (r < 0.32) return sh(base, 0.18);
    return jitter(base, 14, H(x, y, s + 1));
  },
  8: (x, y, s) => { // forest floor with leaves
    const base = TZ.mix([62, 68, 38], [92, 70, 42], TZ.noise2(x / 5, y / 5, s + 4));
    const r = H(x, y, s);
    if (r < 0.1) return TZ.pick3(s + y, [[180, 96, 40], [150, 58, 34], [200, 150, 56]]);
    if (r < 0.18) return sh(base, -0.3);
    return jitter(base, 12, H(x, y, s + 1));
  },
  9: (x, y, s) => { // interior tiles
    const a = (x + y * 2 + 64), b = (y * 2 - x + 64);
    const chk = (Math.floor(a / 8) + Math.floor(b / 8)) % 2;
    const base = chk ? [142, 136, 124] : [120, 114, 104];
    if (a % 8 < 1 || b % 8 < 1) return [86, 82, 76];
    const dirt = TZ.noise2(x / 6, y / 6, s);
    return jitter(dirt > 0.65 ? sh(base, -0.2) : base, 8, H(x, y, s));
  },
  11: (x, y, s) => { // mud
    const base = TZ.mix([72, 58, 42], [88, 70, 50], TZ.noise2(x / 3, y / 3, s));
    if (H(x, y, s) < 0.06) return [96, 84, 60];
    return jitter(base, 10, H(x, y, s));
  },
  12: (x, y, s) => { // snow
    const base = TZ.mix([214, 222, 232], [236, 240, 246], TZ.noise2(x / 6, y / 6, s));
    const r = H(x, y, s);
    if (r < 0.05) return [255, 255, 255];
    if (r < 0.12) return sh(base, -0.06);
    return jitter(base, 6, H(x, y, s + 1));
  },
  13: (x, y, s) => { // packed / dirty snow
    const base = TZ.mix([184, 190, 200], [206, 210, 218], TZ.noise2(x / 4, y / 4, s));
    const r = H(x, y, s);
    if (r < 0.06) return [150, 146, 140];
    if (r < 0.1) return [236, 240, 246];
    return jitter(base, 8, H(x, y, s + 1));
  },
  14: (x, y, s) => { // ice
    const base = TZ.mix([150, 196, 220], [186, 220, 236], TZ.noise2(x / 8, y / 5, s));
    const a = (x + y * 2) % 23;
    if (a < 1 && H(x, y, s) < 0.7) return [236, 248, 255];
    if (H(x, y, s + 3) < 0.03) return [110, 160, 190];
    return jitter(base, 6, H(x, y, s + 1));
  },
  15: (x, y, s) => { // deep water (base frame, animated separately)
    const base = TZ.mix([40, 70, 96], [52, 88, 112], TZ.noise2(x / 6, y / 4, s));
    return jitter(base, 6, H(x, y, s));
  },
  16: (x, y, s) => { // shallow / swamp water
    const base = TZ.mix([62, 86, 72], [78, 104, 84], TZ.noise2(x / 5, y / 4, s));
    if (H(x, y, s) < 0.05) return [96, 120, 70];
    return jitter(base, 6, H(x, y, s));
  },
  17: (x, y, s) => { // sand / dust
    const base = TZ.mix([176, 150, 108], [196, 170, 124], TZ.noise2(x / 5, y / 5, s));
    const r = H(x, y, s);
    if (r < 0.06) return sh(base, -0.18);
    if (r < 0.09) return sh(base, 0.15);
    return jitter(base, 8, H(x, y, s + 1));
  },
  18: (x, y, s) => { // cracked earth
    const base = TZ.mix([150, 118, 84], [166, 132, 94], TZ.noise2(x / 6, y / 6, s));
    const cx = Math.floor((x + y * 2) / 7), cy = Math.floor((y * 2 - x + 64) / 7);
    const fx = (x + y * 2) % 7, fy = (y * 2 - x + 64) % 7;
    if ((fx < 1 && H(cx, cy, s) < 0.7) || (fy < 1 && H(cy, cx, s) < 0.7)) return sh(base, -0.35);
    return jitter(base, 8, H(x, y, s + 1));
  },
  19: (x, y, s) => { // swamp grass
    const base = TZ.mix([66, 82, 48], [84, 96, 56], TZ.noise2(x / 5, y / 5, s));
    const r = H(x, y, s);
    if (r < 0.08) return sh(base, -0.25);
    if (r < 0.1) return [120, 128, 70];
    return jitter(base, 10, H(x, y, s + 1));
  },
  20: (x, y, s) => { // snowy asphalt
    const n = TZ.noise2(x / 5, y / 3, s + 9);
    if (n > 0.55) return jitter([206, 212, 222], 8, H(x, y, s));
    const base = [70, 72, 78];
    if (H(x, y, s) < 0.06) return [196, 202, 212];
    return jitter(base, 8, H(x, y, s + 1));
  },
  21: (x, y, s) => { // plowed field
    const p = (x + y * 2) % 6;
    const base = p < 2 ? [92, 70, 48] : [112, 86, 58];
    if (p === 3 && H(x, y, s) < 0.35) return [96, 130, 60];
    return jitter(base, 10, H(x, y, s));
  },
  22: (x, y, s) => { // plains grass (lighter, golden)
    const base = TZ.mix([104, 116, 54], [132, 130, 62], TZ.noise2(x / 6 + s, y / 6, s));
    const r = H(x, y, s);
    if (r < 0.06) return sh(base, -0.2);
    if (r < 0.1) return sh(base, 0.16);
    if (r < 0.108) return [220, 200, 90];
    return jitter(base, 10, H(x, y, s + 9));
  },
  23: (x, y, s) => { // ash / burnt
    const base = TZ.mix([52, 48, 44], [72, 66, 58], TZ.noise2(x / 4, y / 4, s));
    if (H(x, y, s) < 0.04) return [200, 90, 40];
    return jitter(base, 10, H(x, y, s));
  },
  25: (x, y, s) => { // desert dune sand with wind ripples
    const base = TZ.mix([206, 172, 112], [222, 190, 128], TZ.noise2(x / 7, y / 7, s));
    const rip = Math.sin((x * 0.5 + y * 1.3) + TZ.noise2(x / 9, y / 9, s + 4) * 4);
    if (rip > 0.86) return sh(base, 0.1);
    if (rip < -0.9) return sh(base, -0.12);
    const r = H(x, y, s);
    if (r < 0.03) return sh(base, -0.22);
    return jitter(base, 6, H(x, y, s + 1));
  },
  26: (x, y, s) => { // dune ridge (shadowed slope)
    const base = TZ.mix([184, 146, 92], [204, 166, 106], TZ.noise2(x / 6, y / 6, s));
    const rip = Math.sin((x * 0.55 + y * 1.25) + TZ.noise2(x / 8, y / 8, s + 2) * 4);
    if (rip > 0.8) return sh(base, 0.14);
    if (rip < -0.85) return sh(base, -0.14);
    return jitter(base, 7, H(x, y, s + 1));
  },
  27: (x, y, s) => { // sandstone slabs
    const base = TZ.mix([170, 120, 80], [192, 142, 96], TZ.noise2(x / 5, y / 5, s));
    const a = (x + y * 2 + 64) % 12, b = (y * 2 - x + 64) % 10;
    if ((a < 1 && H(Math.floor((y * 2 - x + 64) / 10), 0, s) < 0.8) || (b < 1 && H(Math.floor((x + y * 2 + 64) / 12), 1, s) < 0.6)) return sh(base, -0.3);
    if (H(x, y, s) < 0.05) return sh(base, 0.16);
    return jitter(base, 8, H(x, y, s + 1));
  },
  24: (x, y, s) => { // carpet
    const base = [120, 44, 40];
    if (((x + y * 2) % 8) < 1) return [150, 120, 60];
    return jitter(base, 8, H(x, y, s));
  },
};
TZ.pick3 = (n, arr) => arr[Math.abs(n | 0) % arr.length];
tileDefs[4] = tileDefs[3]; tileDefs[10] = tileDefs[3];
TZ.art.tileDefs = tileDefs;

function makeTile(type, variant) {
  const buf = new PixelBuf(32, 16);
  const s = type * 31 + variant * 7 + 1;
  for (let y = 0; y < 16; y++) {
    const hw = y < 8 ? (y * 2 + 2) : ((15 - y) * 2 + 2);
    for (let x = 16 - hw; x < 16 + hw; x++) {
      let c = tileDefs[type](x + variant * 32, y + variant * 16, s);
      // road markings
      if (type === 4 || type === 10) {
        // dashed center line along tile axis
        const a = (x - 16) / 16, b = (y - 7.5) / 8; // a = tx - ty, b = tx + ty  (local -1..1)
        const along = type === 4 ? (a - b) : (a + b); // perpendicular coordinate
        const alongDir = type === 4 ? (a + b) : (b - a);
        if (Math.abs(along) < 0.12 && (alongDir + 1) % 1 < 0.6 + variant * 0) c = jitter([190, 164, 82], 14, H(x, y, 3));
      }
      buf.set(x, y, c);
    }
  }
  return buf.canvas();
}
TZ.art.tiles = {};
TZ.art.buildTiles = () => {
  for (let t = 0; t < TZ.TILE_COUNT; t++) { TZ.art.tiles[t] = []; for (let v = 0; v < 4; v++) TZ.art.tiles[t].push(makeTile(t, v)); }
  // animated water: 4 frames x 4 variants
  TZ.art.water = []; TZ.art.shallow = [];
  for (let f = 0; f < 4; f++) {
    const fr = [], fs = [];
    for (let v = 0; v < 4; v++) {
      for (const [arr, deep] of [[fr, 1], [fs, 0]]) {
        const b = new PixelBuf(32, 16);
        for (let y = 0; y < 16; y++) { const hw = y < 8 ? (y * 2 + 2) : ((15 - y) * 2 + 2); for (let x = 16 - hw; x < 16 + hw; x++) {
          let c = tileDefs[deep ? 15 : 16](x + v * 32, y + v * 16, 15 + deep);
          const wx = x + v * 32, wy = y + v * 16;
          const wave = Math.sin((wx * 0.35 + wy * 0.9) + f * Math.PI / 2) + Math.sin(wx * 0.13 - wy * 0.4 + f * Math.PI / 2 + v);
          if (wave > 1.55) c = deep ? [110, 150, 176] : [120, 146, 112];
          else if (wave > 1.25) c = sh(c, 0.12);
          b.set(x, y, c);
        } }
        arr.push(b.canvas());
      }
    }
    TZ.art.water.push(fr); TZ.art.shallow.push(fs);
  }
  // edge blend overlays: [material][edge 0..3] using dithered gradient masks
  // edges: 0 = +x neighbour (lower-right edge), 1 = -x (upper-left), 2 = +y (lower-left), 3 = -y (upper-right)
  TZ.art.blend = {};
  for (const t of [0, 1, 2, 8, 11, 12, 13, 17, 18, 19, 22, 23, 21, 25, 26, 27]) {
    TZ.art.blend[t] = [0, 1, 2, 3].map(e => {
      const b = new PixelBuf(32, 16);
      for (let y = 0; y < 16; y++) { const hw = y < 8 ? (y * 2 + 2) : ((15 - y) * 2 + 2); for (let x = 16 - hw; x < 16 + hw; x++) {
        const a = (x + 0.5 - 16) / 16, bb = (y + 0.5 - 8) / 8; const tx = (a + bb) / 2 + 0.5, ty = (bb - a) / 2 + 0.5; // 0..1 inside tile
        const d = e === 0 ? 1 - tx : e === 1 ? tx : e === 2 ? 1 - ty : ty; // distance from that edge
        const th = 0.34 + (TZ.noise2(x / 3, y / 2, t * 7 + e) - 0.5) * 0.3;
        if (d < th * (H(x, y, e + t) * 0.5 + 0.6)) b.set(x, y, tileDefs[t](x, y, t * 31 + 3));
      } }
      return b.canvas();
    });
  }
};
// blend priority (higher draws over lower neighbours)
TZ.art.blendPri = { 12: 9, 13: 8, 25: 7, 26: 6, 27: 5, 17: 7, 18: 6, 23: 6, 0: 4, 22: 4, 1: 5, 8: 5, 19: 4, 2: 3, 11: 3, 21: 2 };

// ---------- ground decorations ----------
TZ.art.decor = {};
TZ.art.buildDecor = () => {
  const D = TZ.art.decor;
  const tuft = (cols, s) => { const b = new PixelBuf(9, 8); for (let i = 0; i < 6; i++) { const x = 1 + ((H(i, s, 1) * 7) | 0), hgt = 2 + ((H(i, s, 2) * 5) | 0); for (let j = 0; j < hgt; j++) b.set(x + (j > 2 ? (H(i, s, 3) > .5 ? 1 : -1) : 0), 7 - j, sh(cols[i % cols.length], j * 0.05)); } return b.canvas(); };
  D.tuft = [tuft([[78, 100, 46], [96, 116, 54], [64, 84, 40]], 1), tuft([[120, 112, 60], [140, 128, 70]], 2), tuft([[86, 104, 48], [110, 120, 56]], 3)];
  D.leaves = [0, 1, 2].map(s => { const b = new PixelBuf(10, 6); for (let i = 0; i < 7; i++) b.set((H(i, s, 4) * 10) | 0, (H(i, s, 5) * 6) | 0, TZ.pick3(i + s, [[200, 110, 40], [160, 58, 34], [214, 166, 60], [130, 80, 40]])); return b.canvas(); });
  D.stones = [0, 1].map(s => { const b = new PixelBuf(8, 5); b.ellipse(3, 3, 2.4, 1.6, (dx, dy) => sh([128, 124, 116], -dy * 0.25 - dx * 0.1)); if (s) b.ellipse(6, 3.5, 1.5, 1.1, [104, 100, 94]); return b.canvas(true, [40, 38, 34]); });
  D.flower = [[220, 200, 90], [200, 80, 70], [210, 210, 220]].map(c => { const b = new PixelBuf(5, 6); b.set(2, 5, [70, 96, 40]); b.set(2, 4, [70, 96, 40]); b.set(2, 3, [70, 96, 40]); b.set(1, 2, c); b.set(3, 2, c); b.set(2, 1, c); b.set(2, 2, [240, 220, 120]); return b.canvas(); });
  D.crack = [0, 1].map(s => { const b = new PixelBuf(14, 7); let x = 1, y = 3; for (let i = 0; i < 12; i++) { b.set(x, y, [36, 36, 38]); x++; y += H(i, s, 8) < 0.3 ? -1 : H(i, s, 8) > 0.7 ? 1 : 0; y = clamp(y, 0, 6); } return b.canvas(); });
  D.trash = [0, 1].map(s => { const b = new PixelBuf(8, 5); b.rect(1, 2, 3, 2, [180, 180, 170]); b.rect(4, 1, 3, 2, s ? [160, 60, 50] : [60, 90, 150]); b.set(2, 1, [210, 210, 200]); return b.canvas(); });
  D.puddle = [0].map(() => { const b = new PixelBuf(16, 7); b.ellipse(8, 3.5, 7, 3, (dx, dy) => dx * dx + dy * dy > .6 ? [52, 58, 66] : [70, 80, 96]); return b.canvas(); });
};

// ---------- trees ----------
TZ.art.trees = {};
function makePine(s, autumn = false) {
  const b = new PixelBuf(40, 60);
  const cx = 20, base = 56;
  b.rect(cx - 1, base - 12, 3, 12, [74, 50, 34]); b.rect(cx - 1, base - 12, 1, 12, [94, 66, 44]);
  const layers = 5;
  const dark = autumn ? [60, 70, 40] : [34, 62, 40], mid = autumn ? [86, 92, 48] : [46, 82, 50], light = autumn ? [118, 120, 60] : [70, 110, 62];
  for (let l = 0; l < layers; l++) {
    const top = base - 14 - l * 8 - 10, hgt = 13, wid = 16 - l * 2.6;
    for (let y = 0; y < hgt; y++) {
      const w = wid * (y / hgt) + 1;
      for (let x = -w; x <= w; x++) {
        const px = Math.round(cx + x + (H(l, y, s) - 0.5) * 1.2), py = top + y;
        const edge = (y === hgt - 1 || Math.abs(x) > w - 1.2) && H(px, py, s) < 0.5;
        if (edge && H(px, py, s + 1) < 0.4) continue;
        let c = x < -w * 0.3 ? light : x > w * 0.35 ? dark : mid;
        if (y > hgt - 3) c = sh(c, -0.18);
        b.set(px, py, jitter(c, 14, H(px, py, s + 2)));
      }
    }
  }
  return b.canvas(true, [14, 20, 14]);
}
function makeOak(s, palette) {
  const b = new PixelBuf(46, 58);
  const cx = 23, base = 55;
  // trunk & branches
  for (let y = 0; y < 22; y++) { const w = y < 4 ? 3 : 2; for (let x = -w; x <= w - 1; x++) b.set(cx + x, base - y, x < 0 ? [96, 70, 50] : [70, 50, 36]); }
  b.line(cx, base - 16, cx - 7, base - 26, [80, 58, 40]); b.line(cx, base - 18, cx + 8, base - 27, [70, 50, 36]);
  // canopy blobs
  const blobs = [];
  for (let i = 0; i < 9; i++) blobs.push([cx + (H(i, s, 1) - 0.5) * 24, base - 30 + (H(i, s, 2) - 0.5) * 16 - (i < 3 ? 6 : 0), 6 + H(i, s, 3) * 5]);
  blobs.sort((a, b2) => a[1] - b2[1]);
  for (const [bx, by, r] of blobs) {
    b.disc(bx, by, r, (dx, dy, x, y) => {
      if (Math.sqrt(dx * dx + dy * dy) > r - 1 && H(x, y, s) < 0.45) return null;
      const lightness = (-dx - dy) / (r * 2);
      const pal = palette;
      let c = lightness > 0.22 ? pal[0] : lightness > -0.1 ? pal[1] : pal[2];
      if (H(x, y, s + 5) < 0.12) c = pal[3] || sh(c, 0.2);
      return jitter(c, 16, H(x, y, s + 4));
    });
  }
  return b.canvas(true, [26, 16, 12]);
}
function makeDeadTree(s) {
  const b = new PixelBuf(36, 54);
  const cx = 18, base = 52;
  for (let y = 0; y < 30; y++) b.rect(cx - (y < 5 ? 2 : 1), base - y, y < 5 ? 4 : 2, 1, [86, 74, 64]);
  const branch = (x, y, a, len, d) => { if (d > 3 || len < 2) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; b.line(x, y, x2, y2, d < 2 ? [86, 74, 64] : [100, 88, 76]); branch(x2, y2, a - 0.5 - H(d, len, s) * 0.3, len * 0.65, d + 1); branch(x2, y2, a + 0.5 + H(len, d, s) * 0.3, len * 0.6, d + 1); };
  branch(cx, base - 26, -Math.PI / 2 - 0.5, 10, 0); branch(cx, base - 22, -Math.PI / 2 + 0.6, 9, 0); branch(cx, base - 29, -Math.PI / 2, 8, 1);
  return b.canvas(true, [22, 18, 16]);
}
TZ.art.buildTrees = () => {
  const A = TZ.art.trees;
  const pals = [
    [[230, 160, 60], [204, 112, 40], [150, 66, 30], [240, 200, 90]],   // orange
    [[214, 84, 52], [168, 48, 36], [110, 30, 28], [236, 130, 70]],     // red
    [[224, 196, 80], [190, 150, 50], [130, 100, 36], [240, 220, 120]], // yellow
    [[120, 140, 60], [86, 108, 46], [56, 74, 36], [170, 150, 60]],     // late green
  ];
  A.pine = [0, 1, 2].map(s => makePine(s * 13 + 3, s === 2));
  A.oak = [];
  for (let i = 0; i < 8; i++) A.oak.push(makeOak(i * 17 + 5, pals[i % 4]));
  A.dead = [makeDeadTree(3), makeDeadTree(9)];
  // bushes
  A.bush = [0, 1, 2, 3].map(s => {
    const b = new PixelBuf(20, 14);
    const pal = s === 3 ? pals[0] : [[96, 120, 54], [72, 96, 44], [50, 70, 34], [140, 120, 50]];
    for (let i = 0; i < 4; i++) b.disc(5 + i * 3.4, 9 - (i % 2) * 2, 4.4, (dx, dy, x, y) => { const l = (-dx - dy) / 8; return jitter(l > .15 ? pal[0] : l > -.15 ? pal[1] : pal[2], 14, H(x, y, s)); });
    return b.canvas(true, [20, 26, 14]);
  });
  // stump
  A.stump = (() => { const b = new PixelBuf(12, 10); b.rect(3, 4, 6, 5, [96, 70, 48]); b.ellipse(6, 4, 3.2, 1.7, (dx, dy) => (dx * dx + dy * dy) < 0.35 ? [176, 140, 96] : [150, 116, 78]); return b.canvas(true); })();
  // rocks
  A.rock = [0, 1, 2].map(s => {
    const b = new PixelBuf(26, 20);
    const blobs = [[12, 12, 7], [7, 14, 4.5], [17, 14, 5]];
    for (const [x, y, r] of blobs) b.ellipse(x + (H(x, s, 1) - .5) * 3, y, r, r * 0.8, (dx, dy, px, py) => {
      const l = -dx * 0.5 - dy * 0.8;
      let c = l > 0.3 ? [150, 146, 136] : l > -0.2 ? [118, 114, 108] : [86, 82, 78];
      if (H(px, py, s) < 0.07) c = [80, 120, 70]; // moss
      return jitter(c, 12, H(px, py, s + 2));
    });
    return b.canvas(true, [30, 28, 26]);
  });
  A.scrap = [0, 1].map(s => {
    const b = new PixelBuf(24, 16);
    for (let i = 0; i < 9; i++) { const x = 3 + H(i, s, 1) * 16, y = 6 + H(i, s, 2) * 8, w = 3 + H(i, s, 3) * 6; const c = TZ.pick3(i + s, [[120, 120, 126], [130, 74, 44], [90, 92, 98], [150, 96, 52]]); b.rect(x | 0, y | 0, w | 0, 2, c); b.rect(x | 0, (y | 0) - 1, (w | 0) - 1, 1, sh(c, 0.2)); }
    return b.canvas(true);
  });
};

// ---------- iso block sprites (walls, structures, props) ----------
// standard sprite canvas for a 1x1 tile object: 32 x (16 + height + pad)
// anchor: (16, 8 + top) is the tile center at ground.
TZ.art.blocks = {};
const blockCache = new Map();
function blockSprite(key, lx, ly, maxH, drawFn, outline = true) {
  if (blockCache.has(key)) return blockCache.get(key);
  const w = Math.ceil((lx + ly) * 16) + 2, top = maxH + 4, h = Math.ceil((lx + ly) * 8) + top + 2;
  const buf = new PixelBuf(w, h);
  const ox = ly * 16 + 1, oy = top; // world (0,0,0) -> (ox,oy)
  drawFn(buf, ox, oy);
  const c = buf.canvas(outline, [16, 13, 12]);
  const spr = { c, ax: ox, ay: oy, w, h }; // anchor of world (0,0)
  blockCache.set(key, spr);
  return spr;
}
TZ.art.blockSprite = blockSprite;

// palisade (wood wall): vertical sharpened logs, connected to neighbours.
// mask bits: 1 = +x, 2 = -x, 4 = +y, 8 = -y
TZ.art.palisade = (mask = 0, damaged = 0) => blockSprite('pal' + mask + '_' + damaged, 1, 1, 30, (b, ox, oy) => {
  const posts = [[0.5, 0.5]];
  const dirs = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];
  const any = mask & 15;
  for (const [dx, dy, bit] of dirs) {
    if (any && !(mask & bit)) continue;
    const ts = any ? [0.17, 0.34, 0.5] : [0.2];
    for (const t of ts) posts.push([0.5 + dx * t, 0.5 + dy * t]);
  }
  posts.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
  const wood = [134, 96, 60];
  posts.forEach(([px, py], i) => {
    const sx = Math.round(ox + (px - py) * 16), sy = Math.round(oy + (px + py) * 8);
    const k = H((px * 97) | 0, (py * 89) | 0, 7);
    let hgt = 18 + ((k * 5) | 0);
    if (damaged) hgt -= ((H(i, 5, 3) * 9) | 0);
    const col = sh(wood, (k - 0.5) * 0.3);
    for (let y = 0; y < hgt + 3; y++) {
      const tipW = y >= hgt ? 3 - (y - hgt) : 3;           // sharpened tip
      for (let x = -1; x <= 2; x++) {
        if (y >= hgt && (x < -1 + (y - hgt) || x > 2 - (y - hgt))) continue;
        let c = x === -1 ? sh(col, 0.18) : x === 2 ? sh(col, -0.32) : x === 1 ? sh(col, -0.1) : col;
        if (y === 5 || y === 13) c = [62, 52, 44];                  // rope bands
        if (y >= hgt) c = sh([176, 138, 94], x * -0.1);               // fresh cut tip
        if (H(x + 9, y, i + 3) < 0.08) c = sh(c, -0.2);
        b.set(sx + x, sy - y, c);
      }
    }
    b.set(sx, sy + 1, [50, 40, 32]); b.set(sx + 1, sy + 1, [50, 40, 32]);
  });
});
TZ.art.stoneWall = (variant = 0) => blockSprite('stw' + variant, 1, 1, 26, (b, ox, oy) => {
  const c = [132, 128, 120];
  isoBox(b, ox, oy, 0.08, 0.08, 0.84, 0.84, 0, 22, { top: T.noise(sh(c, 0.1), 16, variant), left: T.stoneBlocks(c, variant), right: T.stoneBlocks(c, variant + 1) });
});
TZ.art.metalWall = (variant = 0) => blockSprite('mtw' + variant, 1, 1, 28, (b, ox, oy) => {
  const c = [118, 124, 130];
  isoBox(b, ox, oy, 0.06, 0.06, 0.88, 0.88, 0, 24, { top: T.flat([96, 100, 104], 10), left: T.corrugated(c, variant + 2), right: T.corrugated(c, variant + 5) });
  // rivets / frame posts
});
TZ.art.sandbags = (variant = 0) => blockSprite('sb' + variant, 1, 1, 14, (b, ox, oy) => {
  const c = [164, 146, 104];
  const bag = (u, v) => { const row = Math.floor(v / 4), off = row % 2 * 4; const bu = (u + off) % 8, bv = v % 4; if (bu < 0.8 || bv < 0.7) return sh(c, -0.35); return jitter(sh(c, (bv > 2.5 ? -0.12 : 0.05)), 14, H(u | 0, v | 0, variant)); };
  isoBox(b, ox, oy, 0.1, 0.1, 0.8, 0.8, 0, 12, { top: (u, v) => { const k = Math.floor(u / 6) + Math.floor(v / 6); return jitter(k % 2 ? c : sh(c, -0.1), 14, H(u | 0, v | 0, 3)); }, left: bag, right: bag });
});
TZ.art.gate = (open = 0) => blockSprite('gate' + open, 1, 1, 30, (b, ox, oy) => {
  const wood = [116, 82, 50];
  // posts
  isoBox(b, ox, oy, 0.05, 0.05, 0.22, 0.22, 0, 26, { top: T.flat([140, 104, 70]), left: T.planksV(wood, 3), right: T.planksV(wood, 3) });
  isoBox(b, ox, oy, 0.73, 0.73, 0.22, 0.22, 0, 26, { top: T.flat([140, 104, 70]), left: T.planksV(wood, 3), right: T.planksV(wood, 3) });
  if (!open) {
    const door = (u, v) => { if (v > 18) return null; let c = T.planksV(wood, 4, 9)(u, v); if (Math.abs(v - 4) < 1 || Math.abs(v - 14) < 1) c = [74, 74, 80]; if (Math.abs(u - v * 0.9) < 1) c = sh(wood, -0.3); return c; };
    isoBox(b, ox, oy, 0.27, 0.27, 0.46, 0.46, 0, 18, { top: T.flat([130, 96, 64]), left: door, right: door });
  } else {
    isoBox(b, ox, oy, 0.27, 0.27, 0.46, 0.46, 0, 2, { top: T.planksV(wood, 4, 9), left: T.flat(sh(wood, -0.2)), right: T.flat(sh(wood, -0.3)) });
  }
});

// house walls: material 0 brick, 1 plaster, 2 concrete, 3 painted wood
// thin wall segments joined toward neighbouring wall tiles (mask: 1 +x, 2 -x, 4 +y, 8 -y)
TZ.art.houseWall = (mat, variant, windowSide, ruin, mask = 15) => blockSprite(`hw${mat}_${variant}_${windowSide}_${ruin}_${mask}`, 1, 1, 36, (b, ox, oy) => {
  const mats = [
    { tex: T.bricks([150, 74, 56], [120, 112, 100], variant), top: [118, 104, 94] },
    { tex: T.plaster([186, 172, 140], variant), top: [150, 138, 116] },
    { tex: T.stoneBlocks([140, 138, 132], variant), top: [116, 114, 110] },
    { tex: T.planksH([90, 110, 120], 4, variant), top: [104, 84, 62] },
  ][mat];
  const hgt = 28;
  const jag = (u) => ruin ? ((TZ.noise2(u / 5, variant, 9) * 13) | 0) : 0;
  const face = (side, off) => (u0, v) => {
    const u = u0 + off;
    if (v > hgt - jag(u + (side === 'r' ? 40 : 0))) return null;
    if ((windowSide === 1 && side === 'l') || (windowSide === 2 && side === 'r')) {
      if (u > 3 && u < 13 && v > 10 && v < 22) {
        if (u < 4.2 || u > 11.8 || v < 11 || v > 21) return [74, 56, 40];
        if (Math.abs(u - 8) < 0.6 || Math.abs(v - 16) < 0.6) return [74, 56, 40];
        return H(u | 0, v | 0, variant) < 0.14 ? [150, 170, 180] : [24, 28, 34];
      }
    }
    let c = mats.tex(u, v);
    if (v < 3) c = sh(c, -0.25);
    if (v > hgt - 2 && !ruin) c = sh(c, 0.12);
    return c;
  };
  const top = (u, v) => jitter(H(u | 0, v | 0, 4) < 0.15 ? sh(mats.top, -0.15) : mats.top, 12, H(u | 0, v | 0, 1));
  const lo = 0.36, w = 0.28, hi = lo + w;
  const boxes = [];
  if (mask & 8) boxes.push([lo, 0, w, hi]);
  if (mask & 2) boxes.push([0, lo, hi, w]);
  boxes.push([lo, lo, w, w]);
  if (mask & 1) boxes.push([lo, lo, 1 - lo, w]);
  if (mask & 4) boxes.push([lo, lo, w, 1 - lo]);
  for (const [x0, y0, lx, ly] of boxes) {
    const offL = x0 * 16, offR = (1 - (y0 + ly)) * 16;
    isoBox(b, ox, oy, x0, y0, lx, ly, 0, hgt, { top: ruin ? (u, v) => top(u, v) : top, left: face('l', offL), right: face('r', offR) }, { rim: false });
  }
  if (ruin) for (let i = 0; i < 6; i++) { const rx = 0.2 + H(i, variant, 3) * 0.6, ry = 0.2 + H(variant, i, 4) * 0.6; b.set(Math.round(ox + (rx - ry) * 16), Math.round(oy + (rx + ry) * 8), sh(mats.top, -0.2)); }
});

// generic crate
TZ.art.crate = (kind = 0) => blockSprite('crate' + kind, 1, 1, 18, (b, ox, oy) => {
  if (kind === 0) { // wooden crate
    const c = [150, 108, 62];
    const tex = (u, v) => { let col = T.planksH(c, 4, 2)(u, v); if (u < 1.5 || u > 9.5 || v < 1.2 || v > 9.8) col = sh(c, -0.25); if (Math.abs(u - v) < 0.9) col = sh(c, -0.15); return col; };
    isoBox(b, ox, oy, 0.2, 0.2, 0.68, 0.68, 0, 11, { top: T.planksV(sh(c, 0.1), 4), left: tex, right: tex });
  } else if (kind === 1) { // military crate (olive)
    const c = [86, 96, 58];
    const tex = (u, v) => { let col = T.flat(c, 8)(u, v); if (u < 1 || v < 1 || v > 9) col = sh(c, -0.3); if (v > 4 && v < 6 && u > 4 && u < 10) col = [210, 200, 120]; return col; };
    isoBox(b, ox, oy, 0.1, 0.25, 0.8, 0.55, 0, 10, { top: T.flat(sh(c, 0.08), 8), left: tex, right: tex });
  } else if (kind === 2) { // supply drop (blue with parachute rope)
    const c = [60, 90, 140];
    const tex = (u, v) => { let col = T.flat(c, 10)(u, v); if (u < 1 || v < 1 || v > 12) col = [200, 200, 200]; if (Math.abs(v - 7) < 1) col = [220, 60, 50]; return col; };
    isoBox(b, ox, oy, 0.12, 0.12, 0.76, 0.76, 0, 14, { top: T.flat(sh(c, 0.1), 8), left: tex, right: tex });
  }
});
TZ.art.barrel = (col = [150, 60, 44], kind = 0) => blockSprite('barrel' + col.join() + kind, 1, 1, 20, (b, ox, oy) => {
  const cx = ox + 16 - 16, cy = oy + 8; // tile center
  const r = 5, hgt = 13;
  for (let y = 0; y < hgt; y++) for (let x = -r; x <= r; x++) {
    const ny = Math.sqrt(Math.max(0, 1 - (x / (r + 0.5)) ** 2)) * 2;
    const py = cy - y + ny - 1;
    let c = sh(col, -x / r * 0.35 + 0.05);
    if (y === 3 || y === 9) c = sh(c, -0.3);
    if (kind === 1 && y > 4 && y < 8) c = [220, 190, 60];
    if (TZ.noise2(x / 2, y / 2, 4) > 0.7) c = TZ.mix(c, [110, 60, 30], 0.6);
    b.set(cx + x, py, c);
  }
  b.ellipse(cx + 0.5, cy - hgt + 1, r + 0.5, 2.2, (dx, dy) => (dx * dx + dy * dy) < 0.3 ? sh(col, -0.4) : sh(col, 0.15));
});

// cars: dir 0 = along x, 1 = along y.  palette
TZ.art.car = (paint, dir = 0, wreck = 0, kind = 'car') => blockSprite(`car${paint.join()}_${dir}_${wreck}_${kind}`, dir ? 1 : 2, dir ? 2 : 1, 34, (b, ox, oy) => {
  const L = 2, W = 1;
  const lx = dir ? 0.82 : 1.84, ly = dir ? 1.84 : 0.82, x0 = dir ? 0.09 : 0.08, y0 = dir ? 0.08 : 0.09;
  const rust = (c) => (u, v) => { let col = jitter(c, 12, H(u | 0, v | 0, 3)); const n = TZ.noise2(u / 5, v / 4, paint[0]); if (n > 0.7 - wreck * 0.15) col = TZ.mix(col, [118, 62, 34], 0.7); return col; };
  // wheels
  const wheel = (wx, wy) => { const sx = ox + (wx - wy) * 16, sy = oy + (wx + wy) * 8; b.ellipse(sx, sy - 2, 3.3, 3, (dx, dy) => dx * dx + dy * dy < .25 ? [80, 80, 84] : [26, 26, 28]); };
  if (dir === 0) { wheel(0.45, 0.9); wheel(1.6, 0.9); } else { wheel(0.9, 0.45); wheel(0.9, 1.6); }
  if (kind === 'bus' || kind === 'truck') {
    // handled with bigger boxes
  }
  const hBody = kind === 'truck' ? 12 : 8, z0 = 3;
  const bodyTex = rust(paint);
  const side = (u, v) => { let c = bodyTex(u, v); if (v > hBody - 2) c = sh(c, 0.1); if (v < 1.5) c = [40, 40, 42]; if (kind === 'police' && v > 3 && v < 5) c = [230, 230, 230]; return c; };
  isoBox(b, ox, oy, x0, y0, lx, ly, z0, hBody, { top: bodyTex, left: side, right: side });
  // cabin
  const glass = (u, v) => { if (v < 1 || v > 5) return sh(paint, -0.1); const broken = wreck && H(u | 0, v | 0, 9) < 0.25; return broken ? [160, 180, 190] : (u + v) % 7 < 1.2 ? [110, 130, 150] : [40, 50, 62]; };
  const cabL = dir ? lx * 0.9 : lx * 0.48, cabW = dir ? ly * 0.48 : ly * 0.9;
  const cx0 = dir ? x0 + lx * 0.05 : x0 + lx * 0.28, cy0 = dir ? y0 + ly * 0.28 : y0 + ly * 0.05;
  if (kind !== 'truck') isoBox(b, ox, oy, cx0, cy0, cabL, cabW, z0 + hBody, 6, { top: rust(sh(paint, 0.05)), left: glass, right: glass });
  else {
    // military truck: cab front + canvas cover
    isoBox(b, ox, oy, dir ? x0 : x0 + lx * 0.7, dir ? y0 + ly * 0.7 : y0, dir ? lx : lx * 0.3, dir ? ly * 0.3 : ly, z0 + hBody, 6, { top: rust(paint), left: glass, right: glass });
    const canvasTex = (u, v) => { let c = jitter([96, 100, 66], 12, H(u | 0, v | 0, 5)); if ((u | 0) % 8 === 0) c = sh(c, -0.2); return c; };
    isoBox(b, ox, oy, dir ? x0 : x0, dir ? y0 : y0, dir ? lx : lx * 0.68, dir ? ly * 0.68 : ly, z0 + hBody, 10, { top: canvasTex, left: canvasTex, right: canvasTex });
  }
  if (kind === 'police') {
    const cxs = ox + ((cx0 + cabL / 2) - (cy0 + cabW / 2)) * 16, cys = oy + ((cx0 + cabL / 2) + (cy0 + cabW / 2)) * 8 - z0 - hBody - 7;
    b.rect(cxs - 3, cys, 3, 2, [210, 40, 40]); b.rect(cxs, cys, 3, 2, [50, 80, 220]);
  }
});
TZ.art.bus = (dir = 0) => blockSprite('bus' + dir, dir ? 1 : 4, dir ? 4 : 1, 40, (b, ox, oy) => {
  const lx = dir ? 0.9 : 3.8, ly = dir ? 3.8 : 0.9, x0 = 0.05, y0 = 0.05;
  const paint = [176, 150, 70];
  const tex = (u, v) => { let c = jitter(paint, 12, H(u | 0, v | 0, 1)); if (TZ.noise2(u / 6, v / 4, 2) > 0.62) c = TZ.mix(c, [120, 66, 36], 0.7); if (v > 12 && v < 21 && (u % 10) > 1.5) c = H(u | 0, v | 0, 4) < 0.2 ? [140, 160, 170] : [36, 44, 52]; if (v < 2) c = [36, 36, 38]; if (v > 8 && v < 10) c = [200, 200, 190]; return c; };
  const wheel = (wx, wy) => { const sx = ox + (wx - wy) * 16, sy = oy + (wx + wy) * 8; b.ellipse(sx, sy - 2, 3.5, 3.2, [26, 26, 28]); };
  if (!dir) { wheel(0.6, 0.95); wheel(3.2, 0.95); } else { wheel(0.95, 0.6); wheel(0.95, 3.2); }
  isoBox(b, ox, oy, x0, y0, lx, ly, 3, 24, { top: (u, v) => jitter([150, 146, 140], 12, H(u | 0, v | 0, 6)), left: tex, right: tex });
});

// furniture / interior props
TZ.art.cabinet = (kind = 0) => blockSprite('cab' + kind, 1, 1, 24, (b, ox, oy) => {
  if (kind === 0) { // wooden cabinet / shelf
    const c = [112, 78, 50];
    const tex = (u, v) => { let col = T.flat(c, 10)(u, v); if (v % 6 < 1) col = sh(c, -0.35); if (u < 1) col = sh(c, -0.3); if (v % 6 > 2 && v % 6 < 4 && u % 5 > 2) col = TZ.pick3((u / 5 | 0) + (v / 6 | 0), [[160, 60, 50], [70, 110, 150], [200, 180, 120], [90, 120, 70]]); return col; };
    isoBox(b, ox, oy, 0.15, 0.4, 0.7, 0.45, 0, 18, { top: T.flat(sh(c, 0.1)), left: tex, right: T.planksV(c, 4) });
  } else if (kind === 1) { // fridge
    const c = [200, 200, 192];
    const tex = (u, v) => { let col = jitter(c, 10, H(u | 0, v | 0, 2)); if (Math.abs(v - 12) < 0.7) col = sh(c, -0.35); if (u > 9 && u < 10.5 && (v > 14 && v < 19)) col = [90, 90, 90]; if (TZ.noise2(u / 3, v / 3, 4) > 0.72) col = [140, 120, 90]; return col; };
    isoBox(b, ox, oy, 0.2, 0.2, 0.6, 0.6, 0, 22, { top: T.flat(c, 8), left: tex, right: T.flat(sh(c, -0.05), 8) });
  } else if (kind === 2) { // metal locker
    const c = [90, 110, 120];
    const tex = (u, v) => { let col = jitter(c, 10, H(u | 0, v | 0, 3)); if ((u | 0) % 6 === 0) col = sh(c, -0.4); if (v > 16 && v < 18 && (u | 0) % 2 === 0) col = sh(c, -0.3); return col; };
    isoBox(b, ox, oy, 0.15, 0.35, 0.7, 0.45, 0, 22, { top: T.flat(c), left: tex, right: T.flat(c) });
  } else if (kind === 3) { // dumpster / trash
    const c = [60, 92, 64];
    const tex = (u, v) => { let col = T.corrugated(c, 2)(u, v); if (v > 9) col = sh(c, -0.1); return col; };
    isoBox(b, ox, oy, 0.08, 0.2, 0.84, 0.6, 0, 11, { top: (u, v) => jitter([44, 56, 46], 10, H(u | 0, v | 0, 1)), left: tex, right: tex });
  } else if (kind === 4) { // gas pump
    const c = [190, 50, 44];
    isoBox(b, ox, oy, 0.3, 0.35, 0.4, 0.3, 0, 20, { top: T.flat([220, 220, 210]), left: (u, v) => { let col = jitter(c, 12, H(u | 0, v | 0, 1)); if (v > 12 && v < 17 && u > 1 && u < 5) col = [30, 34, 38]; return col; }, right: T.flat(c, 10) });
  }
});
TZ.art.workbench = () => blockSprite('bench', 1, 1, 22, (b, ox, oy) => {
  const c = [132, 94, 58];
  const leg = (x, y) => isoBox(b, ox, oy, x, y, 0.1, 0.1, 0, 9, { top: T.flat(c), left: T.flat(sh(c, -0.2)), right: T.flat(sh(c, -0.3)) });
  leg(0.08, 0.2); leg(0.82, 0.2); leg(0.08, 0.72); leg(0.82, 0.72);
  isoBox(b, ox, oy, 0.05, 0.15, 0.9, 0.7, 9, 3, { top: T.planksV(sh(c, 0.12), 4), left: T.flat(sh(c, -0.1)), right: T.flat(sh(c, -0.2)) });
  // vise + tools
  isoBox(b, ox, oy, 0.15, 0.3, 0.18, 0.18, 12, 4, { top: T.flat([110, 110, 120]), left: T.flat([90, 90, 100]), right: T.flat([70, 70, 80]) });
  isoBox(b, ox, oy, 0.55, 0.45, 0.3, 0.12, 12, 2, { top: T.flat([190, 60, 40]), left: T.flat([150, 40, 30]), right: T.flat([120, 30, 20]) });
  // pegboard
  isoBox(b, ox, oy, 0.05, 0.1, 0.9, 0.06, 12, 10, { top: T.flat(c), left: (u, v) => (u % 4 < 1 && v % 4 < 1) ? [40, 30, 20] : jitter([170, 140, 100], 10, H(u | 0, v | 0, 3)), right: T.flat(c) });
});
TZ.art.bed = () => blockSprite('bed', 1, 1, 16, (b, ox, oy) => {
  isoBox(b, ox, oy, 0.1, 0.05, 0.8, 0.9, 0, 6, { top: T.flat([120, 84, 52]), left: T.planksH([110, 76, 48], 3), right: T.planksH([110, 76, 48], 3) });
  isoBox(b, ox, oy, 0.12, 0.08, 0.76, 0.84, 6, 3, { top: (u, v) => { let c = (Math.floor(u / 3) + Math.floor(v / 3)) % 2 ? [168, 54, 46] : [140, 40, 36]; if (v < 3) c = [220, 214, 200]; return jitter(c, 10, H(u | 0, v | 0, 1)); }, left: T.flat([150, 44, 40]), right: T.flat([130, 36, 32]) });
  isoBox(b, ox, oy, 0.1, 0.02, 0.8, 0.12, 6, 9, { top: T.flat([130, 92, 58]), left: T.planksV([110, 76, 48], 4), right: T.flat([96, 66, 42]) });
});
TZ.art.chest = () => blockSprite('chest', 1, 1, 16, (b, ox, oy) => {
  const c = [138, 96, 54];
  const tex = (u, v) => { let col = T.planksH(c, 3, 6)(u, v); if (u < 1.5 || v > 8) col = [80, 80, 86]; if (v > 5 && v < 7 && u > 5 && u < 7) col = [210, 180, 80]; return col; };
  isoBox(b, ox, oy, 0.15, 0.25, 0.7, 0.5, 0, 10, { top: T.planksV(sh(c, 0.1), 4), left: tex, right: tex });
});
TZ.art.collector = () => blockSprite('collector', 1, 1, 26, (b, ox, oy) => {
  const cx = ox, cy = oy + 8; const col = [70, 110, 160];
  for (let y = 0; y < 12; y++) for (let x = -5; x <= 5; x++) b.set(cx + x, cy - y + Math.sqrt(Math.max(0, 1 - (x / 5.5) ** 2)) * 2 - 1, sh(col, -x / 5 * 0.35));
  b.ellipse(cx + 0.5, cy - 11, 5.5, 2.2, [40, 70, 110]);
  // tarp funnel
  for (let y = 0; y < 7; y++) { const w = 6 + y * 1.3; for (let x = -w; x <= w; x++) b.set(cx + x, cy - 13 - y, jitter([140, 120, 80], 14, H(x + 9, y, 2))); }
  b.rect(cx - 9, cy - 21, 1, 9, [90, 70, 50]); b.rect(cx + 9, cy - 21, 1, 9, [90, 70, 50]);
});
TZ.art.garden = (stage = 0) => blockSprite('garden' + stage, 1, 1, 18, (b, ox, oy) => {
  const wood = [110, 78, 48];
  isoBox(b, ox, oy, 0.05, 0.05, 0.9, 0.9, 0, 3, { top: (u, v) => jitter((u | 0) % 4 < 2 ? [74, 54, 36] : [88, 64, 42], 10, H(u | 0, v | 0, 2)), left: T.planksH(wood, 3), right: T.planksH(wood, 3) });
  if (stage > 0) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const wx = 0.25 + j * 0.45, wy = 0.2 + i * 0.2; const sx = ox + (wx - wy) * 16, sy = oy + (wx + wy) * 8 - 3;
      const hgt = stage === 1 ? 2 : stage === 2 ? 4 : 6;
      for (let k = 0; k < hgt; k++) { b.set(sx, sy - k, [70 + k * 6, 120 + k * 4, 50]); if (k > 1) { b.set(sx - 1, sy - k, [86, 140, 58]); b.set(sx + 1, sy - k + 1, [60, 110, 46]); } }
      if (stage >= 3) { b.set(sx, sy - hgt, [210, 60, 40]); b.set(sx + 1, sy - hgt + 1, [220, 80, 50]); }
    }
  }
});
TZ.art.spikes = () => blockSprite('spikes', 1, 1, 12, (b, ox, oy) => {
  for (let i = 0; i < 9; i++) {
    const wx = 0.15 + (i % 3) * 0.33, wy = 0.15 + Math.floor(i / 3) * 0.33;
    const sx = ox + (wx - wy) * 16, sy = oy + (wx + wy) * 8;
    for (let k = 0; k < 7; k++) { b.set(sx + (k > 4 ? 1 : 0) + Math.floor(k / 3), sy - k, k > 4 ? [190, 190, 196] : [120, 86, 54]); }
  }
  b.line(ox - 8, oy + 8, ox + 8, oy + 16, [90, 64, 40]); b.line(ox + 8, oy + 0, ox - 4, oy + 14, [90, 64, 40]);
});
TZ.art.beartrap = (closed) => blockSprite('beartrap' + (closed ? 1 : 0), 1, 1, 8, (b, ox, oy) => {
  const cx = ox, cy = oy + 8, M = [120, 122, 128], D = [70, 72, 78];
  b.ellipse(cx, cy, 6, 3, null);
  for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; b.set(cx + Math.cos(t) * 6, cy + Math.sin(t) * 3, a % 2 ? M : D); }
  if (closed) { b.rect(cx - 6, cy - 3, 12, 2, M); for (let x = -5; x <= 5; x += 2) b.set(cx + x, cy - 4, [200, 200, 206]); }
  else for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; b.set(cx + Math.cos(t) * 5, cy + Math.sin(t) * 2.5 - 1, [200, 200, 206]); }
  b.rect(cx - 1, cy - 1, 3, 2, [180, 60, 40]);
  b.line(cx + 6, cy, cx + 10, cy + 3, D);
});
TZ.art.sleepbag = () => blockSprite('sleepbag', 1, 1, 8, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  for (let i = -7; i <= 7; i++) for (let j = -3; j <= 3; j++) { const x = cx + i + j * 1.1, y = cy + i * 0.5 + j * 0.9 - 2; if (Math.abs(j) === 3 || Math.abs(i) === 7) b.set(x, y, [40, 70, 50]); else b.set(x, y, i < -3 ? [200, 196, 180] : (i + 20) % 4 === 0 ? [50, 90, 64] : [70, 120, 84]); }
});
TZ.art.campfireBase = () => blockSprite('campfire', 1, 1, 10, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const x = cx + Math.cos(a) * 8, y = cy + Math.sin(a) * 4; b.ellipse(x, y, 2.2, 1.6, (dx, dy) => sh([140, 136, 128], -dy * 0.3 - dx * 0.1)); }
  b.ellipse(cx, cy, 5, 2.5, [40, 30, 24]);
  b.line(cx - 4, cy + 1, cx + 4, cy - 2, [110, 72, 40]); b.line(cx - 4, cy - 2, cx + 4, cy + 1, [96, 62, 36]);
});
TZ.art.torchBase = () => blockSprite('torch', 1, 1, 22, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  b.rect(cx, cy - 16, 2, 16, [100, 70, 44]); b.rect(cx, cy - 16, 1, 16, [126, 90, 56]);
  b.rect(cx - 1, cy - 18, 4, 3, [80, 70, 60]);
});
TZ.art.floodlight = () => blockSprite('flood', 1, 1, 34, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  b.line(cx - 5, cy + 1, cx, cy - 24, [90, 92, 96]); b.line(cx + 5, cy + 1, cx, cy - 24, [70, 72, 76]); b.line(cx, cy + 3, cx, cy - 24, [110, 112, 116]);
  b.rect(cx - 5, cy - 30, 10, 6, [60, 62, 66]); b.rect(cx - 4, cy - 29, 8, 4, [250, 240, 200]);
});
TZ.art.turretBase = () => blockSprite('turret', 1, 1, 18, (b, ox, oy) => {
  isoBox(b, ox, oy, 0.15, 0.15, 0.7, 0.7, 0, 6, { top: T.flat([96, 100, 90]), left: T.corrugated([110, 116, 100], 1), right: T.corrugated([110, 116, 100], 2) });
  isoBox(b, ox, oy, 0.35, 0.35, 0.3, 0.3, 6, 5, { top: T.flat([70, 74, 70]), left: T.flat([80, 84, 78]), right: T.flat([60, 64, 58]) });
});
TZ.art.radio = () => blockSprite('radio', 1, 1, 34, (b, ox, oy) => {
  const c = [120, 86, 54];
  isoBox(b, ox, oy, 0.1, 0.2, 0.8, 0.6, 0, 10, { top: T.planksV(c, 4), left: T.planksH(sh(c, -0.1), 3), right: T.flat(sh(c, -0.2)) });
  isoBox(b, ox, oy, 0.2, 0.3, 0.5, 0.35, 10, 7, { top: T.flat([70, 76, 70]), left: (u, v) => { if (v > 2 && v < 5 && u > 1 && u < 5) return [200, 160, 60]; if (u > 6 && (u + v) % 3 < 1) return [40, 40, 40]; return jitter([90, 96, 86], 8, H(u | 0, v | 0, 1)); }, right: T.flat([70, 76, 66]) });
  const ax = ox + (0.6 - 0.4) * 16, ay = oy + (0.6 + 0.4) * 8 - 17;
  b.line(ax, ay, ax + 3, ay - 14, [150, 150, 156]);
  b.set(ax + 3, ay - 15, [240, 60, 40]);
});
TZ.art.barrier = (dir = 0) => blockSprite('barrier' + dir, 1, 1, 12, (b, ox, oy) => {
  const c = [168, 164, 154];
  const tex = (u, v) => { let col = jitter(c, 12, H(u | 0, v | 0, 4)); if (v > 4 && v < 7 && ((u / 4) | 0) % 2) col = [200, 70, 50]; return col; };
  if (dir === 0) isoBox(b, ox, oy, 0, 0.3, 1, 0.4, 0, 9, { top: T.flat(c, 10), left: tex, right: tex });
  else isoBox(b, ox, oy, 0.3, 0, 0.4, 1, 0, 9, { top: T.flat(c, 10), left: tex, right: tex });
});
TZ.art.fence = (dir = 0, variant = 0) => blockSprite('fence' + dir + variant, 1, 1, 18, (b, ox, oy) => {
  const c = [110, 92, 70];
  const tex = (u, v) => { if (v > 12 - ((u | 0) % 4 === 1 ? 1 : 0)) return null; if ((u | 0) % 4 === 3) return null; let col = jitter(sh(c, (H(u / 4 | 0, 0, variant) - .5) * .3), 12, H(u | 0, v | 0, 1)); if (Math.abs(v - 9) < 1 || Math.abs(v - 3) < 1) col = sh(c, -0.25); return col; };
  if (dir === 0) isoBox(b, ox, oy, 0, 0.45, 1, 0.1, 0, 12, { top: null, left: tex, right: T.flat(sh(c, -0.2)) }, { rim: false });
  else isoBox(b, ox, oy, 0.45, 0, 0.1, 1, 0, 12, { top: null, left: T.flat(sh(c, -0.2)), right: tex }, { rim: false });
});
TZ.art.lamppost = () => blockSprite('lamp', 1, 1, 42, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  b.rect(cx, cy - 36, 2, 36, [70, 74, 80]); b.rect(cx, cy - 36, 1, 36, [96, 100, 106]);
  b.rect(cx - 6, cy - 37, 9, 2, [70, 74, 80]); b.rect(cx - 7, cy - 35, 4, 2, [140, 140, 120]);
});
TZ.art.pole = () => blockSprite('pole', 1, 1, 48, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  b.rect(cx - 1, cy - 44, 3, 44, [92, 70, 50]); b.rect(cx - 1, cy - 44, 1, 44, [112, 88, 64]);
  b.rect(cx - 8, cy - 40, 17, 2, [80, 60, 44]); b.set(cx - 7, cy - 41, [200, 200, 190]); b.set(cx + 7, cy - 41, [200, 200, 190]);
});
TZ.art.sign = () => blockSprite('sign', 1, 1, 30, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  b.rect(cx, cy - 20, 1, 20, [120, 120, 126]);
  b.rect(cx - 6, cy - 28, 13, 9, [200, 180, 60]); b.rect(cx - 5, cy - 27, 11, 7, [30, 30, 30]); b.rect(cx - 4, cy - 26, 9, 5, [200, 180, 60]);
  b.rect(cx - 1, cy - 25, 3, 2, [30, 30, 30]); b.set(cx, cy - 23, [30, 30, 30]);
});
TZ.art.corpse = () => blockSprite('corpse', 1, 1, 8, (b, ox, oy) => {
  const cx = ox, cy = oy + 8;
  b.ellipse(cx, cy, 8, 3.5, [110, 20, 18]);
  b.rect(cx - 6, cy - 2, 10, 3, [70, 70, 80]); b.rect(cx + 4, cy - 2, 3, 3, [150, 130, 110]); b.rect(cx - 8, cy - 1, 3, 2, [50, 40, 30]);
});

// rescue helicopter (side view, facing left)
TZ.art.heli = () => {
  if (TZ.art._heli) return TZ.art._heli;
  const b = new PixelBuf(76, 34), ol = [84, 98, 56];
  // tail boom
  for (let x = 44; x < 68; x++) { const t = (x - 44) / 24, h = Math.round(5 - t * 3); for (let y = 0; y < h; y++) b.set(x, 12 + y, sh(ol, y === 0 ? 0.15 : y === h - 1 ? -0.3 : 0)); }
  for (let y = 3; y < 15; y++) for (let x = 65; x < 69; x++) b.set(x - Math.floor((15 - y) / 4), y, sh(ol, x === 65 ? 0.1 : -0.15));
  b.ellipse(70, 7, 4.5, 4.5, (dx, dy) => (dx * dx + dy * dy) > 0.7 ? [60, 60, 60] : null);
  // fuselage
  b.ellipse(28, 16, 19, 9, (dx, dy, x, y) => { let c = sh(ol, -dy * 0.35 - 0.02); if (TZ.noise2(x / 4, y / 3, 8) > 0.72) c = sh(c, -0.12); return c; });
  b.rect(20, 5, 18, 5, sh(ol, 0.05)); b.rect(20, 5, 18, 1, sh(ol, 0.3)); b.rect(34, 6, 3, 3, [40, 44, 34]);
  // cockpit glass
  b.ellipse(14, 15, 7, 6, (dx, dy) => dx > 0.6 || dy > 0.55 ? null : (dx + dy < -0.6 ? [200, 230, 245] : [96, 140, 170]));
  // door + rescue cross
  b.rect(25, 11, 10, 11, sh(ol, -0.25)); b.rect(25, 11, 10, 1, sh(ol, -0.4));
  b.disc(30, 16, 3.6, [236, 236, 230]); b.rect(29, 14, 2, 5, [210, 40, 36]); b.rect(28, 15, 5, 2, [210, 40, 36]);
  b.rect(38, 13, 4, 2, [230, 200, 60]);
  // skids
  b.rect(12, 28, 32, 2, [44, 46, 40]); b.rect(10, 27, 3, 2, [44, 46, 40]); b.rect(18, 24, 2, 4, [54, 56, 50]); b.rect(36, 24, 2, 4, [54, 56, 50]);
  // rotor mast
  b.rect(27, 2, 3, 4, [50, 52, 46]);
  return TZ.art._heli = b.canvas(true, [18, 20, 14]);
};

// blood/scorch decals
TZ.art.blood = [];
TZ.art.buildDecals = () => {
  for (let s = 0; s < 6; s++) {
    const b = new PixelBuf(24, 12);
    for (let i = 0; i < 6; i++) { const x = 12 + (H(i, s, 1) - .5) * 14, y = 6 + (H(i, s, 2) - .5) * 6, r = 1 + H(i, s, 3) * 3.5; b.ellipse(x, y, r, r * 0.5, (dx, dy, px, py) => jitter(H(px, py, s) < .5 ? [110, 16, 14] : [86, 10, 10], 12, H(px, py, s + 1))); }
    for (let i = 0; i < 8; i++) b.set(12 + (H(i, s, 4) - .5) * 22, 6 + (H(i, s, 5) - .5) * 11, [120, 20, 16]);
    TZ.art.blood.push(b.canvas());
  }
  for (let s = 0; s < 3; s++) {
    const b = new PixelBuf(24, 12);
    for (let i = 0; i < 6; i++) { const x = 12 + (H(i, s, 1) - .5) * 14, y = 6 + (H(i, s, 2) - .5) * 6, r = 1 + H(i, s, 3) * 3.5; b.ellipse(x, y, r, r * 0.5, (dx, dy, px, py) => jitter(H(px, py, s) < .5 ? [70, 120, 30] : [50, 96, 20], 12, H(px, py, s + 1))); }
    (TZ.art.acid = TZ.art.acid || []).push(b.canvas());
  }
  const sc = new PixelBuf(32, 16); sc.ellipse(16, 8, 14, 7, (dx, dy, px, py) => { const d = dx * dx + dy * dy; return d > 0.7 && H(px, py, 2) < 0.5 ? null : jitter([30, 26, 22], 10, H(px, py, 1)); });
  TZ.art.scorch = sc.canvas();
};

// =====================================================================
//  2.0 additions: snowy variants, swamp & wasteland props, interiors
// =====================================================================
// put snow on upward-facing pixels of a sprite
TZ.art.snowify = (src, amt = 1, seed = 1) => {
  const c = TZ.canvas(src.width, src.height); c.g.drawImage(src, 0, 0);
  const d = c.g.getImageData(0, 0, c.width, c.height), p = d.data, w = c.width;
  const isDark = i => p[i + 3] > 0 && p[i] < 30 && p[i + 1] < 30 && p[i + 2] < 30;
  const solid = i => p[i + 3] > 0 && !isDark(i);
  const out = new Uint8ClampedArray(p);
  for (let y = 1; y < c.height; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (!solid(i)) continue;
    const up = ((y - 1) * w + x) * 4;
    if (!solid(up)) {
      const depth = 1 + (H(x, y, seed) < 0.5 * amt ? 1 : 0) + (H(x, y + 7, seed) < 0.25 * amt ? 1 : 0);
      for (let k = 0; k < depth; k++) { const j = ((y + k) * w + x) * 4; if (y + k >= c.height || !solid(j)) break; const v = k === depth - 1 ? 214 : 238; out[j] = v; out[j + 1] = v + 4; out[j + 2] = v + 12; }
    }
  }
  d.data.set(out); c.g.putImageData(d, 0, 0); return c;
};
TZ.art.buildExtra = () => {
  const A = TZ.art.trees, D = TZ.art.decor;
  A.spine = A.pine.map((c, i) => TZ.art.snowify(c, 1.2, i + 3));
  A.sdead = A.dead.map((c, i) => TZ.art.snowify(c, 1, i + 9));
  A.srock = A.rock.map((c, i) => TZ.art.snowify(c, 1.4, i + 5));
  // ore rock: rock with metal veins
  A.ore = A.rock.map((c, i) => { const o = TZ.canvas(c.width, c.height); o.g.drawImage(c, 0, 0); const d = o.g.getImageData(0, 0, o.width, o.height); for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) { const k = (y * o.width + x) * 4; if (d.data[k + 3] && d.data[k] > 60 && H(x, y, i) < 0.12) { d.data[k] = 190; d.data[k + 1] = 140; d.data[k + 2] = 80; } } o.g.putImageData(d, 0, 0); return o; });
  // willow (swamp): drooping green-grey canopy
  A.willow = [0, 1].map(s => {
    const b = new PixelBuf(48, 58), cx = 24, base = 55;
    for (let y = 0; y < 20; y++) b.rect(cx - 2, base - y, 4, 1, y % 4 === 0 ? [70, 58, 44] : [84, 70, 52]);
    for (let i = 0; i < 9; i++) b.disc(cx + (H(i, s, 1) - .5) * 26, base - 30 + (H(i, s, 2) - .5) * 10, 7 + H(i, s, 3) * 4, (dx, dy, x, y) => jitter(dy < -2 ? [112, 128, 76] : [86, 104, 62], 14, H(x, y, s)));
    for (let i = 0; i < 26; i++) { const x = cx - 18 + i * 1.4 + H(i, s, 4) * 2, y0 = base - 28 + H(i, s, 5) * 6, len = 8 + H(i, s, 6) * 12; for (let k = 0; k < len; k++) b.set(x, y0 + k, k > len - 3 ? [70, 90, 52] : [96, 116, 66]); }
    return b.canvas(true, [20, 26, 16]);
  });
  // apple tree
  A.apple = (() => { const c = TZ.canvas(46, 58); c.g.drawImage(A.oak[3], 0, 0); const d = c.g.getImageData(0, 0, 46, 58); for (let i = 0; i < 26; i++) { const x = 8 + (H(i, 3, 1) * 30 | 0), y = 12 + (H(i, 3, 2) * 22 | 0); const k = (y * 46 + x) * 4; if (d.data[k + 3] && d.data[k + 1] > 50) { d.data[k] = 210; d.data[k + 1] = 40; d.data[k + 2] = 34; } } c.g.putImageData(d, 0, 0); return c; })();
  A.appleBare = A.oak[3];
  // dry bush
  A.dbush = [0, 1].map(s => { const b = new PixelBuf(20, 14); const br = (x, y, a, l, dd) => { if (dd > 3) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; b.line(x, y, x2, y2, dd < 2 ? [120, 96, 64] : [150, 124, 84]); br(x2, y2, a - 0.6, l * 0.65, dd + 1); br(x2, y2, a + 0.5, l * 0.6, dd + 1); }; br(10, 13, -Math.PI / 2 - 0.4, 5, 0); br(10, 13, -Math.PI / 2 + 0.5, 5, 0); return b.canvas(true, [40, 30, 20]); });
  // reeds
  A.reeds = [0, 1, 2].map(s => { const b = new PixelBuf(16, 20); for (let i = 0; i < 7; i++) { const x = 2 + H(i, s, 1) * 12 | 0, h = 8 + H(i, s, 2) * 10 | 0; for (let k = 0; k < h; k++) b.set(x + (k > h * 0.6 ? (H(i, s, 3) > .5 ? 1 : 0) : 0), 19 - k, k > h - 4 && i % 2 ? [120, 84, 50] : [100, 120, 60]); } return b.canvas(true, [30, 40, 20]); });
  A.bones = (() => { const b = new PixelBuf(16, 8); b.rect(2, 4, 8, 1, [220, 214, 196]); b.rect(1, 3, 2, 3, [220, 214, 196]); b.rect(9, 3, 2, 3, [220, 214, 196]); b.ellipse(12, 4, 2.5, 2, [232, 226, 210]); b.set(12, 4, [40, 30, 30]); return b.canvas(true, [60, 50, 40]); })();
  // berry bush variant (berries visible / picked)
  A.berry = A.bush.map((c, i) => { const o = TZ.canvas(c.width, c.height); o.g.drawImage(c, 0, 0); for (let k = 0; k < 8; k++) { o.g.fillStyle = k % 2 ? '#b02040' : '#d03850'; o.g.fillRect(3 + (H(k, i, 1) * 14 | 0), 3 + (H(k, i, 2) * 8 | 0), 1, 1); } return o; });
  // ---- desert: saguaro cactus, palm, sandstone rocks
  A.cactus = [0, 1, 2].map(s => {
    const b = new PixelBuf(26, 40), cx = 13, base = 38;
    const col = (dx, x, y) => { const t = dx; let c = t < -0.35 ? [58, 104, 52] : t > 0.45 ? [104, 150, 78] : [76, 126, 62]; if ((x + s) % 3 === 0) c = sh(c, -0.12); if (H(x, y, s + 7) < 0.06) c = [222, 214, 170]; return c; };
    const trunk = (x0, y0, y1, r) => { for (let y = y1; y <= y0; y++) for (let x = Math.floor(x0 - r); x <= x0 + r; x++) { const dx = (x + 0.5 - x0) / r; if (Math.abs(dx) <= 1) b.set(x, y, col(dx, x, y)); } b.ellipse(x0, y1, r, r * 0.9, (dx, dy, x, y) => col(dx, x, y)); };
    const h = 24 + s * 4; trunk(cx, base, base - h, 3.2);
    const arm = (side, at, len, up) => { const ax = cx + side * 6; for (let k = 0; k < 6; k++) b.rect(Math.min(cx, ax) + (side > 0 ? 2 : 0) + (side > 0 ? 0 : 1), base - at - 1, 5, 3, col(0, cx + side * k, base - at)); trunk(ax, base - at, base - at - up, 2.4); };
    arm(1, 10 + s * 2, 6, 9 + s); if (s !== 1) arm(-1, 14 + s, 6, 7 + s * 2);
    if (s === 2) b.disc(cx, base - h - 2, 1.6, [230, 90, 120]);
    return b.canvas(true, [26, 44, 22]);
  });
  A.palm = [0, 1].map(s => {
    const b = new PixelBuf(50, 62), base = 60;
    let x = 25, top = 0;
    for (let y = 0; y < 34; y++) { x = 25 + Math.sin(y / 14 + s) * (3 + s * 2); const c = y % 3 === 0 ? [104, 78, 50] : [130, 100, 64]; b.rect(Math.round(x) - 2, base - y, 4, 1, c); b.set(Math.round(x) + 1, base - y, sh(c, 0.12)); top = base - y; }
    const tx = Math.round(x);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.62 + (H(i, s, 2) - .5) * 0.2, L = 15 + H(i, s, 3) * 6;
      for (let k = 0; k < L; k++) { const t = k / L, px = tx + Math.cos(a) * k, py = top + Math.sin(a) * k + t * t * 9; const w = Math.max(1, Math.round((1 - t) * 3)); for (let j = -w; j <= w; j++) b.set(Math.round(px + j * 0.4), Math.round(py + j), j < 0 ? [70, 128, 56] : (k + j) % 3 === 0 ? [48, 96, 44] : [88, 146, 62]); }
    }
    b.disc(tx - 1, top + 2, 1.8, [110, 76, 40]); b.disc(tx + 2, top + 3, 1.6, [96, 66, 36]);
    return b.canvas(true, [26, 34, 18]);
  });
  A.sandrock = A.rock.map((c, i) => { const o = TZ.canvas(c.width, c.height); o.g.drawImage(c, 0, 0); const d = o.g.getImageData(0, 0, o.width, o.height); for (let k = 0; k < d.data.length; k += 4) { if (!d.data[k + 3]) continue; const v = (d.data[k] + d.data[k + 1] + d.data[k + 2]) / 3 / 140; d.data[k] = Math.min(255, 196 * v + 10); d.data[k + 1] = Math.min(255, 140 * v + 6); d.data[k + 2] = Math.min(255, 92 * v); } o.g.putImageData(d, 0, 0); return o; });
  A.hole = (() => { const b = new PixelBuf(20, 10); b.ellipse(10, 5, 9, 4.2, (dx, dy) => dx * dx + dy * dy > 0.55 ? [120, 92, 60] : [40, 30, 22]); b.ellipse(10, 5.6, 5, 2, [28, 20, 16]); for (const [x, y] of [[2, 2], [17, 3], [4, 8], [16, 8]]) b.rect(x, y, 2, 1, [140, 108, 70]); return b.canvas(); })();
  // decor: snow tufts & swamp mini reeds
  D.snowtuft = [0, 1].map(s => { const b = new PixelBuf(10, 5); b.ellipse(5, 3, 4, 1.6, [246, 250, 255]); b.ellipse(4, 2.5, 2, 1, [255, 255, 255]); return b.canvas(); });
  D.minireed = [0, 1].map(s => { const b = new PixelBuf(8, 9); for (let i = 0; i < 4; i++) { const x = 1 + i * 2, h = 4 + (H(i, s, 1) * 4 | 0); for (let k = 0; k < h; k++) b.set(x, 8 - k, [100, 120, 60]); } return b.canvas(); });
};

// ---------- interior / POI props ----------
TZ.art.shelf = () => TZ.art.blockSprite('shelf', 1, 1, 22, (b, ox, oy) => {
  const c = [100, 104, 110];
  const tex = (u, v) => { let col = T.flat(c, 8)(u, v); if (v % 6 < 1) col = sh(c, -0.4); else if (v % 6 > 1 && (u | 0) % 3 !== 0) col = TZ.pick3(((u / 3) | 0) + ((v / 6) | 0) * 3, [[200, 60, 50], [230, 200, 80], [70, 130, 190], [220, 220, 210], [90, 160, 80]]); return col; };
  isoBox(b, ox, oy, 0.1, 0.35, 0.8, 0.35, 0, 18, { top: T.flat(c), left: tex, right: T.flat(sh(c, -0.1)) });
});
TZ.art.medcab = () => TZ.art.blockSprite('medcab', 1, 1, 22, (b, ox, oy) => {
  const c = [222, 224, 220];
  const tex = (u, v) => { let col = T.flat(c, 6)(u, v); if (Math.abs(v - 9) < 0.7) col = sh(c, -0.3); if ((Math.abs(u - 6) < 1 && Math.abs(v - 14) < 3) || (Math.abs(v - 14) < 1 && Math.abs(u - 6) < 3)) col = [210, 40, 36]; return col; };
  isoBox(b, ox, oy, 0.15, 0.4, 0.7, 0.4, 0, 19, { top: T.flat(c), left: tex, right: T.flat(sh(c, -0.05)) });
});
TZ.art.toolbox = () => TZ.art.blockSprite('toolbox', 1, 1, 14, (b, ox, oy) => {
  const c = [196, 46, 40];
  const tex = (u, v) => { let col = T.flat(c, 8)(u, v); if (v % 4 < 0.8) col = sh(c, -0.35); if (Math.abs(u - 5) < 1 && v % 4 > 2) col = [200, 200, 200]; return col; };
  isoBox(b, ox, oy, 0.2, 0.3, 0.6, 0.45, 0, 12, { top: T.flat(sh(c, 0.1)), left: tex, right: T.flat(sh(c, -0.1)) });
});
TZ.art.desk = () => TZ.art.blockSprite('desk', 1, 1, 18, (b, ox, oy) => {
  const c = [180, 184, 188];
  isoBox(b, ox, oy, 0.08, 0.2, 0.84, 0.6, 0, 8, { top: T.flat(c), left: T.flat(sh(c, -0.1)), right: T.flat(sh(c, -0.2)) });
  isoBox(b, ox, oy, 0.25, 0.3, 0.3, 0.12, 8, 7, { top: T.flat([40, 40, 44]), left: (u, v) => v > 1 && v < 6 && u > 1 && u < 4 ? [80, 200, 140] : [40, 40, 44], right: T.flat([30, 30, 34]) });
  isoBox(b, ox, oy, 0.6, 0.45, 0.2, 0.2, 8, 3, { top: T.flat([220, 220, 200]), left: T.flat([200, 200, 180]), right: T.flat([180, 180, 160]) });
});
TZ.art.table = () => TZ.art.blockSprite('table', 1, 1, 12, (b, ox, oy) => {
  const c = [132, 92, 58];
  for (const [x, y] of [[0.15, 0.2], [0.75, 0.2], [0.15, 0.7], [0.75, 0.7]]) isoBox(b, ox, oy, x, y, 0.1, 0.1, 0, 7, { top: T.flat(c), left: T.flat(sh(c, -0.2)), right: T.flat(sh(c, -0.3)) });
  isoBox(b, ox, oy, 0.1, 0.15, 0.8, 0.7, 7, 2, { top: T.planksV(sh(c, 0.1), 4), left: T.flat(sh(c, -0.1)), right: T.flat(sh(c, -0.2)) });
});
TZ.art.hay = () => TZ.art.blockSprite('hay', 1, 1, 14, (b, ox, oy) => {
  const c = [210, 180, 90];
  const tex = (u, v) => { let col = jitter(c, 24, H(u | 0, v | 0, 3)); if (Math.abs(u - 4) < 0.7 || Math.abs(u - 11) < 0.7) col = [150, 110, 60]; return col; };
  isoBox(b, ox, oy, 0.12, 0.12, 0.76, 0.76, 0, 11, { top: (u, v) => jitter(sh(c, 0.08), 24, H(u | 0, v | 0, 4)), left: tex, right: tex });
});
TZ.art.tent = (v = 0) => TZ.art.blockSprite('tent' + v, 1, 1, 18, (b, ox, oy) => {
  const c = [[70, 100, 60], [170, 110, 50], [60, 90, 140]][v % 3];
  for (let y = 0; y < 16; y++) for (let x = -14; x <= 14; x++) { const top = 16 - Math.abs(x) * 1.05; if (y > top) continue; const px = ox + x, py = oy + 12 - y + Math.round(Math.abs(x) * 0.25); let col = x < 0 ? sh(c, 0.1) : sh(c, -0.2); if (x > -3 && x < 3 && y < 9) col = [30, 26, 22]; b.set(px, py, jitter(col, 10, H(x, y, v))); }
});
TZ.art.tires = () => TZ.art.blockSprite('tires', 1, 1, 14, (b, ox, oy) => {
  for (let k = 0; k < 3; k++) { const cx = ox + (k === 1 ? 4 : -2), cy = oy + 10 - k * 4; b.ellipse(cx, cy, 7, 3.5, (dx, dy) => (dx * dx + dy * dy) < 0.25 ? null : (dy < 0 ? [50, 50, 54] : [30, 30, 32])); }
});
TZ.art.helicrash = () => TZ.art.blockSprite('helicrash', 1, 1, 30, (b, ox, oy) => {
  const c = [86, 96, 58];
  isoBox(b, ox, oy, -0.6, 0.1, 2.0, 0.8, 0, 14, { top: (u, v) => jitter(TZ.noise2(u / 4, v / 4, 3) > 0.6 ? [40, 36, 30] : c, 12, H(u | 0, v | 0, 2)), left: (u, v) => { if (v > 6 && v < 11 && u > 4 && u < 12) return [30, 34, 40]; return jitter(TZ.noise2(u / 5, v / 3, 5) > 0.62 ? [50, 40, 30] : c, 12, H(u | 0, v | 0, 1)); }, right: T.flat(sh(c, -0.1)) });
  b.line(ox - 24, oy - 6, ox + 30, oy + 2, [40, 42, 40]); b.line(ox - 10, oy - 20, ox + 12, oy + 4, [50, 52, 48]);
});
TZ.art.wallConcrete = (v = 0) => TZ.art.blockSprite('wcon' + v, 1, 1, 30, (b, ox, oy) => {
  const c = [150, 148, 140];
  const tex = (u, v2) => { let col = T.noise(c, 14, v)(u, v2); if ((u | 0) % 8 === 0 || (v2 | 0) % 12 === 0) col = sh(c, -0.25); if (H(u | 0, v2 | 0, 9) < 0.02) col = [100, 96, 90]; return col; };
  isoBox(b, ox, oy, 0.04, 0.04, 0.92, 0.92, 0, 26, { top: T.flat(sh(c, 0.06), 10), left: tex, right: tex });
});
TZ.art.barbed = () => TZ.art.blockSprite('barbed', 1, 1, 12, (b, ox, oy) => {
  for (let k = 0; k < 2; k++) for (let a = 0; a < 40; a++) { const t = a / 40, x = ox - 14 + t * 28, y = oy + 8 + (k ? 3 : -2) + Math.sin(t * 24) * 3 - 4; b.set(x, y, [150, 150, 156]); if (a % 5 === 0) { b.set(x, y - 1, [200, 200, 206]); b.set(x + 1, y + 1, [200, 200, 206]); } }
  for (const x of [-12, 0, 12]) b.rect(ox + x, oy + 2, 1, 10, [100, 74, 48]);
});
TZ.art.mine = () => TZ.art.blockSprite('mine', 1, 1, 6, (b, ox, oy) => { b.ellipse(ox, oy + 8, 5, 2.5, (dx, dy) => dy < -0.2 ? [90, 96, 70] : [60, 66, 48]); b.set(ox, oy + 6, [220, 50, 30]); });
TZ.art.barrelBomb = () => TZ.art.barrel([200, 50, 30], 1);
TZ.art.turretHeavy = () => TZ.art.blockSprite('turreth', 1, 1, 20, (b, ox, oy) => {
  isoBox(b, ox, oy, 0.1, 0.1, 0.8, 0.8, 0, 7, { top: T.flat([90, 96, 84]), left: T.stoneBlocks([120, 120, 112], 1), right: T.stoneBlocks([120, 120, 112], 2) });
  isoBox(b, ox, oy, 0.3, 0.3, 0.4, 0.4, 7, 6, { top: T.flat([64, 70, 60]), left: T.flat([76, 80, 72]), right: T.flat([56, 60, 54]) });
});
TZ.art.garage = () => TZ.art.blockSprite('garagest', 1, 1, 26, (b, ox, oy) => {
  const c = [200, 160, 40];
  isoBox(b, ox, oy, 0.05, 0.05, 0.9, 0.9, 0, 2, { top: (u, v) => ((u + v) | 0) % 6 < 3 ? [40, 40, 40] : c, left: T.flat(sh(c, -0.2)), right: T.flat(sh(c, -0.3)) });
  for (const [x, y] of [[0.1, 0.1], [0.78, 0.1]]) isoBox(b, ox, oy, x, y, 0.12, 0.12, 2, 20, { top: T.flat([70, 74, 80]), left: T.flat([90, 94, 100]), right: T.flat([70, 74, 80]) });
  isoBox(b, ox, oy, 0.1, 0.1, 0.8, 0.12, 20, 3, { top: T.flat([110, 114, 120]), left: T.flat([90, 94, 100]), right: T.flat([70, 74, 80]) });
  isoBox(b, ox, oy, 0.35, 0.55, 0.3, 0.3, 2, 6, { top: T.flat([196, 46, 40]), left: T.flat([170, 40, 34]), right: T.flat([140, 30, 26]) });
});
TZ.art.floorTile = (kind) => TZ.art.blockSprite('floor' + kind, 1, 1, 2, (b, ox, oy) => {
  const tex = kind === 'wood' ? T.planksV([136, 96, 60], 4, 3) : T.stoneBlocks([138, 134, 126], 4);
  isoBox(b, ox, oy, 0, 0, 1, 1, 0, 1, { top: tex, left: T.flat(kind === 'wood' ? [100, 70, 44] : [100, 98, 92]), right: T.flat(kind === 'wood' ? [90, 62, 40] : [90, 88, 82]) }, { rim: false });
}, false);
