// =====================================================================
//  THE ZOMBIES — website: animated pixel background for the hero.
//  Low-resolution canvas scaled up with crisp pixels: blood-red horizon,
//  ruined city, dead trees, shambling zombies, drifting fog, embers and
//  ash, an occasional lightning strike.
// =====================================================================
'use strict';
(function () {
const { RNG, hash, hex, rgb, mix, canvas } = window.PX;

function Scene(cv) {
  this.cv = cv; this.g = cv.getContext('2d'); this.t = 0; this.running = false; this.raf = 0; this.last = 0;
  this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.resize();
}
Scene.prototype.resize = function () {
  const r = this.cv.getBoundingClientRect(); const W = Math.max(1, r.width), H = Math.max(1, r.height);
  const s = Math.max(2, Math.min(6, Math.round(Math.min(W, H * 1.4) / 170)));
  const w = Math.ceil(W / s), h = Math.ceil(H / s);
  if (w === this.w && h === this.h) return;
  this.w = w; this.h = h; this.cv.width = w; this.cv.height = h; this.g.imageSmoothingEnabled = false;
  this.build();
};
Scene.prototype.build = function () {
  const w = this.w, h = this.h, R = RNG(1337);
  this.portrait = w < h; this.hz = Math.round(h * (this.portrait ? 0.86 : 0.8)); // horizon
  // static layer: sky, moon, skyline, trees, ground
  const st = canvas(w, h), g = st.g;
  const top = [5, 6, 8], mid = [30, 13, 12], low = [140, 38, 20];
  for (let y = 0; y < h; y++) {
    const t = y / this.hz; let c;
    if (t < 0.55) c = mix(top, mid, t / 0.55); else if (t <= 1) c = mix(mid, low, Math.pow((t - 0.55) / 0.45, 1.6)); else c = [11, 13, 9];
    // ordered dither bands
    g.fillStyle = rgb(c); g.fillRect(0, y, w, 1);
    if (t > 0.3 && t < 1) for (let x = (y % 2); x < w; x += 2) if (hash(x, y, 4) < 0.18) { g.fillStyle = rgb(mix(c, low, 0.25)); g.fillRect(x, y, 1, 1); }
  }
  // stars
  for (let i = 0; i < w * h / 700; i++) { const x = R() * w | 0, y = R() * this.hz * 0.6 | 0; g.fillStyle = `rgba(230,220,200,${0.25 + R() * 0.5})`; g.fillRect(x, y, 1, 1); }
  // moon
  const mx = Math.round(w * (this.portrait ? 0.8 : 0.86)), my = Math.round(h * (this.portrait ? 0.06 : 0.17)), mr = Math.max(6, Math.round(Math.min(w, h) * (this.portrait ? 0.07 : 0.085)));
  for (let y = -mr - 6; y <= mr + 6; y++) for (let x = -mr - 6; x <= mr + 6; x++) {
    const d = Math.hypot(x, y);
    if (d <= mr) { let c = mix([236, 214, 180], [200, 120, 90], (y + mr) / (2 * mr) * 0.7); if (hash(x + 40, y + 40, 9) < 0.12 || (Math.hypot(x + mr * 0.3, y - mr * 0.2) < mr * 0.28)) c = mix(c, [150, 90, 70], 0.45); if (d > mr - 1) c = mix(c, [120, 60, 40], 0.4); g.fillStyle = rgb(c); g.fillRect(mx + x, my + y, 1, 1); }
    else if (d <= mr + 6 && hash(x, y, 2) < (1 - (d - mr) / 6) * 0.35) { g.fillStyle = 'rgba(220,120,80,.18)'; g.fillRect(mx + x, my + y, 1, 1); }
  }
  this.moon = { x: mx, y: my, r: mr };
  // far ruined skyline
  const far = [62, 22, 18], near = [16, 11, 10];
  this.windows = [];
  let x = -2;
  while (x < w) {
    const bw = 5 + (R() * 12 | 0), bh = Math.round(h * (0.06 + R() * 0.16)), base = this.hz + 1;
    g.fillStyle = rgb(far);
    for (let i = 0; i < bw; i++) { const broken = R() < 0.25 ? (R() * 4 | 0) : 0; g.fillRect(x + i, base - bh + broken, 1, bh - broken); }
    if (R() < 0.3) { g.fillRect(x + (bw >> 1), base - bh - 3, 1, 3); }
    for (let wy = base - bh + 3; wy < base - 2; wy += 3) for (let wx = x + 1; wx < x + bw - 1; wx += 2) if (R() < 0.07) this.windows.push({ x: wx, y: wy, p: R() * 10, f: 0.5 + R() * 2 });
    x += bw + (R() < 0.35 ? 4 + (R() * 14 | 0) : (R() * 3 | 0));
  }
  // near hills + dead trees
  for (let xx = 0; xx < w; xx++) {
    const hy = this.hz + 2 - Math.round(2 + Math.sin(xx * 0.05) * 2 + Math.sin(xx * 0.13 + 1) * 1.5);
    g.fillStyle = rgb(near); g.fillRect(xx, hy, 1, h - hy);
  }
  const tree = (tx, th) => {
    g.fillStyle = rgb([9, 8, 8]); g.fillRect(tx, this.hz - th, 1, th + 3);
    let bx = tx, by = this.hz - th;
    for (let k = 0; k < 4; k++) { const dir = R() < 0.5 ? -1 : 1, len = 2 + (R() * th * 0.35 | 0), sy = by + (R() * th * 0.6 | 0); for (let i = 0; i < len; i++) g.fillRect(tx + dir * i, sy - (i >> 1), 1, 1); }
    void bx;
  };
  for (let i = 0; i < Math.max(2, w / 45); i++) tree(R() * w | 0, Math.round(h * (0.08 + R() * 0.1)));
  // ground with texture
  for (let y = this.hz + 4; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const n = hash(xx, y, 7); const d = (y - this.hz) / (h - this.hz);
    g.fillStyle = rgb(mix([18, 15, 12], [8, 9, 7], d)); if (n < 0.06) g.fillStyle = rgb([28, 22, 16]); else if (n > 0.97) g.fillStyle = rgb([40, 18, 14]);
    g.fillRect(xx, y, 1, 1);
  }
  this.static = st;
  // fog texture (twice as wide, tiles horizontally)
  const fw = w * 2, fh = Math.round(h * 0.4), fog = canvas(fw, fh), fg = fog.g;
  for (let y = 0; y < fh; y++) for (let xx = 0; xx < fw; xx++) {
    const v = (Math.sin(xx * 0.035 + Math.sin(y * 0.2) * 1.5) + Math.sin(xx * 0.011 * Math.PI * 2 * (w / fw) * 3 + y * 0.1) + Math.sin((xx / fw) * Math.PI * 4)) / 3;
    const edge = Math.sin((y / fh) * Math.PI); const a = Math.max(0, v * 0.5 + 0.35) * edge;
    if (hash(xx, y, 3) < a * 0.9) { fg.fillStyle = `rgba(150,140,130,${(0.08 + a * 0.18).toFixed(3)})`; fg.fillRect(xx, y, 1, 1); }
  }
  this.fog = fog;
  // zombies
  const ZR = RNG(77); this.zombies = [];
  const nz = Math.max(3, Math.round(w / 40));
  for (let i = 0; i < nz; i++) this.zombies.push({ x: ZR() * w, dir: ZR() < 0.5 ? -1 : 1, sp: 0.6 + ZR() * 1.1, ph: ZR() * 10, depth: ZR() < 0.5 ? 0 : 1 });
  // sprites for zombies (pre-rendered)
  this.zspr = [0, 1].map(depth => PX.ZOMBIE.map(rows => { const c = canvas(rows[0].length, rows.length); for (let y = 0; y < rows.length; y++) for (let xx = 0; xx < rows[y].length; xx++) { const ch = rows[y][xx]; if (ch === '#') { c.g.fillStyle = depth ? '#060505' : '#140a09'; c.g.fillRect(xx, y, 1, 1); } else if (ch === 'e') { c.g.fillStyle = '#ff3a20'; c.g.fillRect(xx, y, 1, 1); } } return c; }));
  // particles
  this.parts = []; const n = Math.round(w * h / 260);
  for (let i = 0; i < n; i++) this.parts.push(this.spawn(true));
  this.flash = 0; this.bolt = null; this.nextBolt = 2 + Math.random() * 4;
};
Scene.prototype.spawn = function (any) {
  const w = this.w, h = this.h, ember = Math.random() < 0.7;
  return ember
    ? { e: 1, x: Math.random() * w, y: any ? Math.random() * h : h + 2, vy: -(4 + Math.random() * 10), vx: (Math.random() - 0.5) * 3, life: 0, max: 3 + Math.random() * 6, ph: Math.random() * 6 }
    : { e: 0, x: Math.random() * w * 1.2, y: any ? Math.random() * h : -2, vy: 2 + Math.random() * 4, vx: -(2 + Math.random() * 4), life: 0, max: 99, ph: Math.random() * 6 };
};
Scene.prototype.makeBolt = function () {
  const pts = []; let x = this.w * (0.15 + Math.random() * 0.7), y = 0; const end = this.hz - 2;
  while (y < end) { pts.push([x | 0, y | 0]); y += 1 + Math.random() * 3; x += (Math.random() - 0.5) * 4; }
  pts.push([x | 0, end]); return pts;
};
Scene.prototype.frame = function (dt) {
  const g = this.g, w = this.w, h = this.h, t = (this.t += dt);
  g.drawImage(this.static, 0, 0);
  // flickering windows
  for (const o of this.windows) { const v = Math.sin(t * o.f + o.p) * 0.5 + 0.5; if (v > 0.25) { g.fillStyle = `rgba(232,${140 + (v * 60 | 0)},60,${(0.35 + v * 0.5).toFixed(2)})`; g.fillRect(o.x, o.y, 1, 1); } }
  // lightning
  if (!this.reduced) {
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) { this.bolt = this.makeBolt(); this.boltT = 0.35; this.flash = 1; this.nextBolt = 7 + Math.random() * 9; }
  }
  if (this.flash > 0) { g.fillStyle = `rgba(200,210,255,${(this.flash * 0.22).toFixed(3)})`; g.fillRect(0, 0, w, this.hz + 4); }
  if (this.bolt && this.boltT > 0) {
    const on = this.boltT > 0.22 || (this.boltT > 0.08 && this.boltT < 0.14);
    if (on) { for (const [x, y] of this.bolt) { g.fillStyle = 'rgba(160,180,255,.5)'; g.fillRect(x - 1, y, 3, 1); g.fillStyle = '#f4f6ff'; g.fillRect(x, y, 1, 1); } }
    this.boltT -= dt;
  }
  this.flash = Math.max(0, this.flash - dt * 2.4); if (this.flash > 0.4 && Math.random() < 0.05) this.flash = 0.9;
  // fog (far)
  const fy = this.hz - Math.round(this.fog.height * 0.55);
  const off = (t * 3) % (w * 2); g.globalAlpha = 0.9;
  g.drawImage(this.fog, -off, fy); g.drawImage(this.fog, w * 2 - off, fy);
  g.globalAlpha = 1;
  // zombies on the horizon
  for (const z of this.zombies) {
    z.x += z.dir * z.sp * dt * (z.depth ? 1.4 : 0.9);
    if (z.x < -12) z.x = w + 10; if (z.x > w + 12) z.x = -10;
    const fr = this.zspr[z.depth][Math.floor(t * (z.depth ? 2.2 : 1.7) * z.sp + z.ph) % 3];
    const bob = Math.round(Math.abs(Math.sin(t * 2.4 * z.sp + z.ph)));
    const y = this.hz + (z.depth ? 6 : 1) - fr.height + bob;
    g.save(); if (z.dir < 0) { g.translate(Math.round(z.x) * 2 + fr.width, 0); g.scale(-1, 1); }
    g.drawImage(fr, Math.round(z.x), y); g.restore();
  }
  // near fog
  const off2 = (t * 7) % (w * 2), fy2 = this.hz - 4; g.globalAlpha = 0.65;
  g.drawImage(this.fog, -off2, fy2); g.drawImage(this.fog, w * 2 - off2, fy2); g.globalAlpha = 1;
  // embers and ash
  for (let i = 0; i < this.parts.length; i++) {
    const p = this.parts[i]; p.life += dt; p.y += p.vy * dt; p.x += (p.vx + Math.sin(t * 1.7 + p.ph) * (p.e ? 3 : 1.5)) * dt;
    if (p.y < -3 || p.y > h + 3 || p.x < -4 || p.life > p.max) { this.parts[i] = this.spawn(false); continue; }
    if (p.e) {
      const k = 1 - p.life / p.max, fl = Math.sin(t * 9 + p.ph) * 0.5 + 0.5;
      g.fillStyle = k > 0.6 ? `rgba(255,${200 + (fl * 50 | 0)},120,${k.toFixed(2)})` : `rgba(240,${90 + (fl * 60 | 0)},30,${(k * 0.9).toFixed(2)})`;
      g.fillRect(p.x | 0, p.y | 0, 1, 1);
    } else { g.fillStyle = 'rgba(170,165,155,.45)'; g.fillRect(p.x | 0, p.y | 0, 1, 1); }
  }
};
Scene.prototype.loop = function (now) {
  if (!this.running) return;
  this.raf = requestAnimationFrame((n) => this.loop(n));
  if (now - this.last < 33) return; // ~30 fps is plenty for pixels
  const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
  this.frame(dt);
};
Scene.prototype.start = function () {
  if (this.reduced) { this.frame(0); return; }
  if (this.running) return; this.running = true; this.last = 0; this.raf = requestAnimationFrame((n) => this.loop(n));
};
Scene.prototype.stop = function () { this.running = false; cancelAnimationFrame(this.raf); };

// mount on a canvas; returns a stop function
window.TZBG = function (cv) {
  const s = new Scene(cv); s.frame(0);
  let vis = true;
  const upd = () => { if (vis && !document.hidden) s.start(); else s.stop(); };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => { vis = e[0].isIntersecting; upd(); }) : null;
  if (io) io.observe(cv);
  const onVis = () => upd(); document.addEventListener('visibilitychange', onVis);
  let rt = 0; const onRes = () => { clearTimeout(rt); rt = setTimeout(() => { s.resize(); s.frame(0); }, 120); };
  window.addEventListener('resize', onRes);
  upd();
  return () => { s.stop(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', onRes); };
};
void hex;
})();
