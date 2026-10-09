// =====================================================================
//  THE ZOMBIES — voxel model renderer
//  Models are built from boxes of voxels, posed per frame and rendered
//  in true isometric projection with lighting, creases and outline.
//  Result: crisp pixel-art sprites in any direction (8 for characters,
//  16 for vehicles) with smooth limb animation.
// =====================================================================
'use strict';
(() => {
const V = TZ.Vox = {};
const LIGHT = (() => { const l = [-0.45, 0.55, 1.25]; const n = Math.hypot(...l); return l.map(v => v / n); })();
const VIEW = (() => { const l = [1, 1, 1.15]; const n = Math.hypot(...l); return l.map(v => v / n); })();
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// 3x3 rotation helpers
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul = (A, B) => { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
const app = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// part transform: local point -> model space. Returns {M, t} so p' = M p + t
function partXf(model, part, pose, cache) {
  if (cache[part.n]) return cache[part.n];
  const p = pose[part.n] || {};
  let M = I3;
  if (p.rz) M = mul(M, rotZ(p.rz));
  if (p.ry) M = mul(M, rotY(p.ry));
  if (p.rx) M = mul(M, rotX(p.rx));
  const pv = part.pv || [0, 0, 0];
  // p' = M (p - pv) + pv + d
  const Mpv = app(M, pv);
  let t = [pv[0] - Mpv[0] + (p.dx || 0), pv[1] - Mpv[1] + (p.dy || 0), pv[2] - Mpv[2] + (p.dz || 0)];
  if (part.parent) {
    const P = partXf(model, model.byName[part.parent], pose, cache);
    t = app(P.M, t).map((v, i) => v + P.t[i]);
    M = mul(P.M, M);
  }
  return cache[part.n] = { M, t };
}

// render a posed model. yaw in radians (model forward +x).
V.render = (model, pose, yaw, opts = {}) => {
  if (!model.byName) { model.byName = {}; for (const p of model.parts) model.byName[p.n] = p; }
  const vs = model.vs || 1, S = 0.72 * vs, SZ = 0.9 * vs;
  const W = model.W, Hh = model.H, AX = model.AX, AY = model.AY;
  const N = W * Hh;
  const col = new Uint8ClampedArray(N * 3), dep = new Float32Array(N).fill(-1e9), has = new Uint8Array(N);
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const Y = rotZ(yaw);
  const cache = {};
  const tint = opts.tint, flatShade = opts.flat;
  const globalRoot = pose._root || null; // {rx, ry, dz} whole body (used for dead pose)
  let RM = I3, Rt = [0, 0, 0];
  if (globalRoot) {
    if (globalRoot.ry) RM = mul(RM, rotY(globalRoot.ry));
    if (globalRoot.rx) RM = mul(RM, rotX(globalRoot.rx));
    const pv = globalRoot.pv || [0, 0, 0]; const m = app(RM, pv);
    Rt = [pv[0] - m[0] + (globalRoot.dx || 0), pv[1] - m[1] + (globalRoot.dy || 0), pv[2] - m[2] + (globalRoot.dz || 0)];
  }
  // ---- smooth sub-voxel sampling ----
  // Every box is sampled on a fine grid and tested against a signed-distance shape
  // (rounded box, ellipsoid, cylinder, optional cutting planes and subtracted holes).
  // Surface samples get a smooth normal, so forms read as rounded 3D shapes, not cubes.
  const st = opts.step || 0.5, shell = st * 1.7, defR = opts.round ?? model.round ?? 0, spec = opts.spec ?? model.spec ?? 0;
  const lvl = opts.levels || 10;
  for (const part of model.parts) {
    if (pose[part.n] && pose[part.n].hide) continue;
    const X = partXf(model, part, pose, cache);
    let M = mul(RM, X.M), t = app(RM, X.t).map((v, i) => v + Rt[i]);
    const MY = mul(Y, M), tY = app(Y, t);
    for (const b of part.boxes) {
      const [x0, y0, z0, x1, y1, z1, c, o0] = b;
      const o = o0 || {};
      const fn = typeof c === 'function';
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
      const shape = o.shape || 'box', ax = o.axis || 'y';
      const mh = Math.min(hx, hy, hz);
      const r = Math.max(0, Math.min(o.r ?? Math.min(defR, mh * 0.85), shape === 'cyl' ? Math.min(ax === 'x' ? hx : ax === 'y' ? hy : hz, ax === 'x' ? Math.min(hy, hz) : ax === 'y' ? Math.min(hx, hz) : Math.min(hx, hy)) * 0.95 : mh * 0.98));
      const cuts = o.cut || null, subs = o.sub || null, solid = b.solid || o.solid, spc = o.spec ?? spec;
      for (let sz = z0 + st / 2; sz < z1; sz += st) for (let sy = y0 + st / 2; sy < y1; sy += st) for (let sx = x0 + st / 2; sx < x1; sx += st) {
        const px = sx - cx, py = sy - cy, pz = sz - cz;
        let d, nx = 0, ny = 0, nz = 0;
        if (shape === 'ell') {
          const ex = px / hx, ey = py / hy, ez = pz / hz, k = Math.sqrt(ex * ex + ey * ey + ez * ez);
          d = (k - 1) * mh; nx = ex / hx; ny = ey / hy; nz = ez / hz;
        } else if (shape === 'cyl') {
          // axis a, radial plane (u, v)
          let pa, pu, pv, ha, R;
          if (ax === 'x') { pa = px; pu = py; pv = pz; ha = hx; R = Math.min(hy, hz); } else if (ax === 'y') { pa = py; pu = px; pv = pz; ha = hy; R = Math.min(hx, hz); } else { pa = pz; pu = px; pv = py; ha = hz; R = Math.min(hx, hy); }
          const rl = Math.hypot(pu, pv), qa = Math.abs(pa) - (ha - r), qr = rl - (R - r);
          d = Math.hypot(Math.max(qa, 0), Math.max(qr, 0)) + Math.min(Math.max(qa, qr), 0) - r;
          let na, nu, nv;
          if (qa > 0 || qr > 0) { const ka = Math.max(qa, 0) * Math.sign(pa), kr = Math.max(qr, 0) / (rl || 1); na = ka; nu = pu * kr; nv = pv * kr; }
          else if (qa > qr) { na = Math.sign(pa); nu = nv = 0; } else { na = 0; nu = pu / (rl || 1); nv = pv / (rl || 1); }
          if (ax === 'x') { nx = na; ny = nu; nz = nv; } else if (ax === 'y') { ny = na; nx = nu; nz = nv; } else { nz = na; nx = nu; ny = nv; }
        } else {
          const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r), qz = Math.abs(pz) - (hz - r);
          const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
          d = Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
          if (mx || my || mz) { nx = mx * Math.sign(px); ny = my * Math.sign(py); nz = mz * Math.sign(pz); }
          else if (qx >= qy && qx >= qz) nx = Math.sign(px); else if (qy >= qz) ny = Math.sign(py); else nz = Math.sign(pz);
        }
        if (cuts) for (const cp of cuts) { const dc = cp[0] * px + cp[1] * py + cp[2] * pz - cp[3]; if (dc > d) { d = dc; nx = cp[0]; ny = cp[1]; nz = cp[2]; } }
        if (d > 0) continue;
        let keep = solid || d > -shell;
        if (subs) {
          let inHole = false;
          for (const h of subs) {
            const dx = sx - h.c[0], dy = sy - h.c[1], dz = sz - h.c[2];
            const rl = h.axis === 'x' ? Math.hypot(dy, dz) : h.axis === 'z' ? Math.hypot(dx, dy) : Math.hypot(dx, dz);
            if (rl < h.r) { inHole = true; break; }
            if (rl < h.r + shell) { keep = true; if (rl - h.r < -d) { if (h.axis === 'x') { nx = 0; ny = -dy; nz = -dz; } else if (h.axis === 'z') { nx = -dx; ny = -dy; nz = 0; } else { nx = -dx; ny = 0; nz = -dz; } } }
          }
          if (inHole) continue;
        }
        if (!keep) continue;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);
        const face = anx >= any && anx >= anz ? (nx > 0 ? '+x' : '-x') : any >= anz ? (ny > 0 ? '+y' : '-y') : (nz > 0 ? '+z' : '-z');
        const vx = Math.floor(sx), vy = Math.floor(sy), vz = Math.floor(sz);
        const rgb = fn ? c(vx, vy, vz, face, sx, sy, sz) : c;
        if (!rgb) continue;
        // world normal
        const wnx = MY[0] * nx + MY[1] * ny + MY[2] * nz, wny = MY[3] * nx + MY[4] * ny + MY[5] * nz, wnz = MY[6] * nx + MY[7] * ny + MY[8] * nz;
        const vdot = wnx * VIEW[0] + wny * VIEW[1] + wnz * VIEW[2];
        if (vdot < -0.35 && !solid) continue; // back-facing sample, hidden anyway
        let shd = 1;
        if (!flatShade) {
          const l = Math.max(0, wnx * LIGHT[0] + wny * LIGHT[1] + wnz * LIGHT[2]);
          shd = 0.6 + l * 0.52 + (wnz > 0.75 ? 0.04 : 0) - (1 - Math.max(0, vdot)) * 0.08;
        }
        const q = Math.round(shd * lvl) / lvl;
        let rr = rgb[0] * q, gg = rgb[1] * q, bb = rgb[2] * q;
        if (spc && !flatShade) { // specular glint (paint, glass, metal)
          const hx2 = LIGHT[0] + VIEW[0], hy2 = LIGHT[1] + VIEW[1], hz2 = LIGHT[2] + VIEW[2], hl = Math.hypot(hx2, hy2, hz2);
          const sp = Math.pow(Math.max(0, (wnx * hx2 + wny * hy2 + wnz * hz2) / hl), 18) * spc;
          if (sp > 0.3) { const k = Math.min(1, Math.round(sp * 3) / 3) * 75; rr += k; gg += k; bb += k; }
        }
        if (tint) { rr = rr * (1 - tint[3]) + tint[0] * tint[3]; gg = gg * (1 - tint[3]) + tint[1] * tint[3]; bb = bb * (1 - tint[3]) + tint[2] * tint[3]; }
        const wx = MY[0] * sx + MY[1] * sy + MY[2] * sz + tY[0];
        const wy = MY[3] * sx + MY[4] * sy + MY[5] * sz + tY[1];
        const wz = MY[6] * sx + MY[7] * sy + MY[8] * sz + tY[2];
        const ppx = Math.floor(AX + (wx - wy) * S), ppy = Math.floor(AY + (wx + wy) * S * 0.5 - wz * SZ);
        if (ppx < 0 || ppy < 0 || ppx >= W || ppy >= Hh) continue;
        const i = ppy * W + ppx, dd = wx + wy + wz * 1.15;
        if (dd <= dep[i]) continue;
        dep[i] = dd; has[i] = 1; col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb;
      }
    }
  }
  // named marks (e.g. hand positions) projected into sprite space relative to the anchor
  let marks = null;
  if (model.marks) {
    marks = {};
    for (const k in model.marks) {
      const m = model.marks[k], part = model.byName[m.part]; if (!part) continue;
      if (pose[part.n] && pose[part.n].hide) continue;
      const X = partXf(model, part, pose, cache);
      const M = mul(RM, X.M), t = app(RM, X.t).map((v, i) => v + Rt[i]);
      const MY = mul(Y, M), tY = app(Y, t);
      const w = app(MY, m.p).map((v, i) => v + tY[i]);
      marks[k] = { x: (w[0] - w[1]) * S, y: (w[0] + w[1]) * S * 0.5 - w[2] * SZ, d: w[0] + w[1] + w[2] * 1.15 };
    }
  }
  // post: creases + outline
  const cv = TZ.canvas(W, Hh), id = cv.g.createImageData(W, Hh), D = id.data;
  const crease = (opts.crease ?? 1.6) * vs;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    if (has[i]) {
      let k = 1;
      // darken pixels that sit just behind a nearer neighbour (creases between limbs)
      if (x > 0 && has[i - 1] && dep[i - 1] - dep[i] > crease) k = 0.72;
      else if (y > 0 && has[i - W] && dep[i - W] - dep[i] > crease) k = 0.78;
      else if (x < W - 1 && has[i + 1] && dep[i + 1] - dep[i] > crease) k = 0.8;
      D[o] = col[i * 3] * k; D[o + 1] = col[i * 3 + 1] * k; D[o + 2] = col[i * 3 + 2] * k; D[o + 3] = 255;
    } else if (opts.outline !== false) {
      const n = (x > 0 && has[i - 1]) || (x < W - 1 && has[i + 1]) || (y > 0 && has[i - W]) || (y < Hh - 1 && has[i + W]);
      if (n) { D[o] = 16; D[o + 1] = 12; D[o + 2] = 11; D[o + 3] = 255; }
    }
  }
  cv.g.putImageData(id, 0, 0);
  return { c: cv, ax: AX, ay: AY, marks };
};

// ---------- color helpers for models ----------
const H = TZ.hash, clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v;
V.jit = (c, amt, n) => [clamp8(c[0] + (n - .5) * amt), clamp8(c[1] + (n - .5) * amt), clamp8(c[2] + (n - .5) * amt)];
V.sh = (c, f) => TZ.shade(c, f);

// ---------- frame cache with lazy rendering ----------
// sprite set: get(anim, frame, dirIndex) -> {c, ax, ay}
V.Set = class {
  constructor(build, dirs = 8) { this.build = build; this.dirs = dirs; this.cache = new Map(); this.flashCache = new Map(); }
  get(anim, f, d, extra = '') {
    const k = anim + '|' + f + '|' + d + '|' + extra;
    let s = this.cache.get(k);
    if (!s) { s = this.build(anim, f, d, extra); this.cache.set(k, s); }
    return s;
  }
  flash(s) { let w = this.flashCache.get(s); if (!w) { w = TZ.tint(s.c, 'rgba(255,255,255,0.85)'); this.flashCache.set(s, w); } return w; }
};
V.dirIndex = (ang, dirs = 8) => ((Math.round(ang / (Math.PI * 2 / dirs)) % dirs) + dirs) % dirs;
V.dirAngle = (d, dirs = 8) => d * Math.PI * 2 / dirs;
})();
