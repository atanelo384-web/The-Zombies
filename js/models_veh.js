// =====================================================================
//  THE ZOMBIES 4.0 — smooth vehicle models
//  Cars are built from rounded / sliced / cylindrical primitives sampled
//  below voxel size (see voxel.js), so bodies have curved hoods, sloped
//  windscreens, wheel arches, real round wheels with rims and spokes.
//  Units: 1 = 1.45 world voxels (vs). Forward = +x, left = +y, up = +z.
// =====================================================================
'use strict';
(() => {
const V = TZ.Vox, H = TZ.hash, jit = V.jit, sh = TZ.shade, M = TZ.Models;
const VS = 1.45;
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
// cutting plane through point p (box-local coords, relative to the box centre); samples beyond it are removed
const cut = (nx, ny, nz, px, py, pz) => { const n = nrm(nx, ny, nz); return [n[0], n[1], n[2], n[0] * px + n[1] * py + n[2] * pz]; };
const GLASS = [38, 52, 70], GLASS_HI = [120, 150, 180], TIRE = [26, 26, 28], RIM = [170, 172, 178], DARK = [40, 40, 44], CHROME = [200, 204, 212];

// ------------------------------------------------------------ shapes
// L,W: length & width; zb: bottom of body; bh: body height; hood/deck: front/rear deck length
// cab: [rear x, front x] of the greenhouse; rh: roof height; inset: side inset; wr/ww: wheel radius & width
const SHAPES = {
  sedan:  { L: 42, W: 19, zb: 3, bh: 8, cab: [-11, 9], rh: 7.5, inset: 1.5, ws: 0.62, rs: 0.5, wr: 4.2, ww: 3, wx: 13, paint: [150, 60, 40], hoodDrop: 1.6 },
  hatch:  { L: 36, W: 18, zb: 3, bh: 8, cab: [-15, 8], rh: 8, inset: 1.5, ws: 0.7, rs: 0.22, wr: 4.0, ww: 3, wx: 11, paint: [70, 110, 150], hoodDrop: 1.4 },
  pickup: { L: 47, W: 20, zb: 4.5, bh: 9, cab: [-3, 12], rh: 8, inset: 1.2, ws: 0.6, rs: 0.15, wr: 5.2, ww: 3.4, wx: 15, paint: [160, 140, 60], bed: true, hoodDrop: 1.2 },
  police: { L: 42, W: 19, zb: 3, bh: 8, cab: [-11, 9], rh: 7.5, inset: 1.5, ws: 0.62, rs: 0.5, wr: 4.2, ww: 3, wx: 13, paint: [34, 36, 42], police: true, hoodDrop: 1.6 },
  uaz:    { L: 41, W: 20, zb: 5, bh: 10, cab: [-17, 8], rh: 9, inset: 0.8, ws: 0.35, rs: 0.05, wr: 5.2, ww: 3.4, wx: 13, paint: [86, 98, 58], boxy: true, hoodDrop: 0.6 },
};
const wheelFn = (cx, cz, wr, state, knobby) => (vx, vy, vz, f, fx, fy, fz) => {
  const dx = fx - cx, dz = fz - cz, r = Math.hypot(dx, dz) / wr, a = Math.atan2(dz, dx);
  if (state === 2) return r > 0.78 ? null : r > 0.5 ? [40, 34, 30] : [70, 62, 56];
  if (r > 0.66) { // tyre
    if (knobby && r > 0.86 && ((a * 7 / Math.PI) % 1 + 1) % 1 < 0.45) return [16, 16, 18];
    return r > 0.92 ? [20, 20, 22] : r < 0.72 ? [44, 44, 48] : TIRE;
  }
  if (f === '+y' || f === '-y') { // rim face
    if (r < 0.16) return [90, 90, 96];
    const spoke = ((a * 5 / Math.PI) % 2 + 2) % 2 < 0.55;
    if (r > 0.56) return [110, 112, 118];
    return spoke ? RIM : [60, 62, 68];
  }
  return [52, 52, 56];
};
// a pair of wheels as separate parts (front ones steer)
const addWheels = (parts, s, wx, wr, ww, W, zc, state, knobby, inset = 0) => {
  const yo = W / 2 - ww / 2 - inset;
  for (const [n, x, y] of [['wFL', wx, yo], ['wFR', wx, -yo], ['wBL', -wx, yo], ['wBR', -wx, -yo]]) {
    parts.push({ n, pv: [x, y, zc], boxes: [[x - wr, y - ww / 2, zc - wr, x + wr, y + ww / 2, zc + wr, wheelFn(x, zc, wr, state, knobby), { shape: 'cyl', axis: 'y', r: 0.9, spec: 0.5 }]] });
  }
};

// ------------------------------------------------------------ road cars
const car = (kind, paint, state, seed) => {
  const S = SHAPES[kind], pc = paint || S.paint;
  const L = S.L, Wd = S.W, hl = L / 2, hw = Wd / 2, zb = S.zb, zt = zb + S.bh, burnt = state === 2, dmg = state >= 1;
  const wzc = S.wr; // wheel centre height
  const rust = (x, y, z) => TZ.noise2(x * 0.22 + seed, y * 0.25 + z * 0.3, 7);
  const paintAt = (base, x, y, z, f) => {
    let c = base;
    if (burnt) { const n = TZ.noise2(x * 0.3, y * 0.3 + z * 0.5, seed); c = n > 0.62 ? [56, 46, 40] : n > 0.38 ? [120, 68, 38] : [146, 90, 50]; if (f === '+z' && H(x, y, seed + 3) < 0.35) c = [110, 104, 96]; return jit(c, 14, H(x, y + z, seed)); }
    if (dmg && rust(x, y, z) > 0.64) c = TZ.mix(c, [118, 66, 36], 0.8);
    if (dmg && H(x, y * 3 + z, seed) < 0.04) c = sh(c, -0.4);
    return jit(c, 6, H(x * 3 + y, z, seed));
  };
  const bodyFn = (x, y, z, f, fx, fy, fz) => {
    let c = pc;
    const front = f === '+x', rear = f === '-x', side = f === '+y' || f === '-y';
    if (S.police && side && fz > zb + 2.5 && fz < zt - 1 && fx > -9 && fx < 9) c = [232, 232, 232];
    if (S.police && f === '+z' && Math.abs(fx) < 6 && fx > 0) c = [232, 232, 232];
    if (!burnt) {
      if (fz < zb + 2.4) c = (front || rear) ? [54, 54, 58] : sh(pc, -0.35); // bumpers & sills
      if (front && fz > zt - 4.2 && fz < zt - 1.6 && Math.abs(fy) > hw - 5.5) return Math.abs(fy) > hw - 4.8 ? [255, 246, 200] : [200, 200, 190]; // headlights
      if (front && fz > zb + 2.6 && fz < zt - 4 && Math.abs(fy) < hw - 6.5) return (Math.round(fz * 2) % 2) ? [24, 24, 26] : [70, 70, 76]; // grille
      if (rear && fz > zt - 4 && fz < zt - 1.6 && Math.abs(fy) > hw - 5) return [210, 34, 30]; // tail lights
      if (rear && fz > zb + 3 && fz < zb + 4.4 && Math.abs(fy) < 3) return [220, 210, 120]; // plate
      if (side && Math.abs(fx - (S.cab[0] + S.cab[1]) / 2) < 0.35 && fz > zb + 2.4) c = sh(c, -0.35); // door seam
      if (side && Math.abs(fx - S.cab[1] + 1) < 0.35 && fz > zb + 2.4) c = sh(c, -0.3);
      if (side && Math.abs(fz - (zt - 2.5)) < 0.4) c = sh(c, 0.12); // waist line highlight
      if (side && Math.abs(fx - (S.cab[1] - 4)) < 0.9 && Math.abs(fz - (zt - 3.4)) < 0.45) c = CHROME; // door handle
    }
    return paintAt(c, x, y, z, f);
  };
  const cabFn = (x, y, z, f, fx, fy, fz) => {
    const roof = f === '+z' || fz > zt + S.rh - 1.2;
    if (roof) { let c = paintAt(sh(pc, 0.06), x, y, z, '+z'); if (S.police && !burnt) c = [232, 232, 232]; if (kind === 'uaz' && !burnt && Math.abs(fy) < hw - 2 && (Math.round(fx) % 4 === 0)) c = [60, 60, 56]; return c; }
    if (fz < zt + 0.8) return paintAt(pc, x, y, z, f);
    const side = f === '+y' || f === '-y', mid = (S.cab[0] + S.cab[1]) / 2;
    if (side && (Math.abs(fx - S.cab[0] - 1.2) < 1.1 || Math.abs(fx - S.cab[1] + 1.4) < 1.1 || Math.abs(fx - mid) < 0.8)) return paintAt(sh(pc, -0.08), x, y, z, f); // pillars
    if (burnt) return H(x, y, z) < 0.45 ? null : [30, 26, 24];
    if (dmg && H(x, y + z, seed) < 0.25) return [160, 176, 186];
    const band = ((fx + fz * 1.3) % 9 + 9) % 9 < 1.4; // reflection streak
    return band ? GLASS_HI : TZ.mix(GLASS, [70, 90, 110], Math.max(0, Math.min(1, (fz - zt) / S.rh)));
  };
  const parts = [];
  const arches = [-S.wx, S.wx].map(x => ({ c: [x, 0, wzc], r: S.wr + 1.1, axis: 'y' }));
  const body = [];
  // main body: rounded box, nose chamfer + sloping hood, wheel arches cut out
  body.push([-hl, -hw, zb, hl, hw, zt, bodyFn, { r: S.boxy ? 1.4 : 2.6, spec: burnt ? 0 : 0.9, sub: arches, cut: [cut(S.hoodDrop / (hl * 0.6), 0, 1, hl * 0.4, 0, S.bh / 2), cut(1, 0, 0.7, hl - 0.6, 0, S.bh / 2 - 1.2), cut(-1, 0, 0.8, -hl + 0.6, 0, S.bh / 2 - 1)] }]);
  // greenhouse
  const c0 = S.cab[0], c1 = S.cab[1], cz0 = zt - 0.5, cz1 = zt + S.rh, cw = hw - S.inset, cc = (c0 + c1) / 2, chx = (c1 - c0) / 2, chz = (cz1 - cz0) / 2;
  body.push([c0, -cw, cz0, c1, cw, cz1, cabFn, { r: S.boxy ? 1.0 : 2.2, spec: burnt ? 0 : 0.7, cut: [cut(1, 0, S.ws, chx, 0, -chz), cut(-1, 0, S.rs, -chx, 0, -chz)] }]);
  // pickup bed
  if (S.bed) {
    const bx0 = -hl + 0.5, bx1 = c0 - 0.5, bz0 = zt - 0.6, bz1 = zt + 3.2;
    const bedC = (x, y, z, f) => f === '+z' ? paintAt(sh(pc, 0.1), x, y, z, f) : paintAt(pc, x, y, z, f);
    body.push([bx0, -hw, bz0, bx1, -hw + 1.3, bz1, bedC, { r: 0.5 }], [bx0, hw - 1.3, bz0, bx1, hw, bz1, bedC, { r: 0.5 }], [bx0, -hw, bz0, bx0 + 1.3, hw, bz1, bedC, { r: 0.5 }]);
    body.push([bx0 + 1.3, -hw + 1.3, zt - 0.8, bx1, hw - 1.3, zt - 0.2, burnt ? [40, 34, 30] : [52, 50, 48], { r: 0 }]);
  }
  // mirrors
  if (!burnt) for (const sgn of [-1, 1]) body.push([c1 - 1.5, sgn > 0 ? cw - 0.2 : -cw - 1.6, zt + 0.6, c1, sgn > 0 ? cw + 1.6 : -cw + 0.2, zt + 2.2, pc, { r: 0.6 }]);
  // police light bar
  if (S.police && !burnt) { body.push([cc - 1.2, -4.5, cz1 - 0.3, cc + 1.2, -0.3, cz1 + 1.6, [230, 30, 30], { shape: 'ell', spec: 1.5 }], [cc - 1.2, 0.3, cz1 - 0.3, cc + 1.2, 4.5, cz1 + 1.6, [40, 80, 240], { shape: 'ell', spec: 1.5 }]); }
  // UAZ: spare wheel on the back, roof rack
  if (kind === 'uaz') {
    body.push([-hl - 2.6, -4, zb + 2, -hl + 0.2, 4, zb + 10, wheelFn(-hl - 1.2, zb + 6, 4, state, true), { shape: 'cyl', axis: 'x', r: 0.8 }]);
    if (!burnt) for (const y of [-cw + 1, cw - 1]) body.push([c0 + 1, y - 0.5, cz1, c1 - 2, y + 0.5, cz1 + 1, DARK, { r: 0.4 }]);
  }
  parts.push({ n: 'body', boxes: body });
  addWheels(parts, S, S.wx, S.wr, S.ww, Wd - 0.6, wzc, state, kind === 'uaz' || kind === 'pickup', 0.2);
  return { parts, vs: VS, W: 128, H: 92, AX: 64, AY: 56, kind, round: 1.5, spec: 0.8 };
};

// ------------------------------------------------------------ buggy (craftable, upgradeable)
// mods: { ram, spikes, armor, engine (0..2), tank, light }
const buggy = (paint, state, seed, mods) => {
  mods = mods || {};
  const pc = paint || [180, 110, 40], burnt = state === 2, dmg = state >= 1;
  const hl = 17, hw = 9.5, zb = 4.5, wr = 5.6, wx = 11.5;
  const P = (c, x, y, z) => burnt ? jit(TZ.noise2(x * 0.3, y * 0.3 + z, seed) > 0.5 ? [56, 46, 40] : [120, 70, 40], 12, H(x, y, z)) : dmg && TZ.noise2(x * 0.25, y * 0.25 + z * 0.3, seed + 5) > 0.66 ? TZ.mix(c, [118, 66, 36], 0.7) : jit(c, 6, H(x * 3 + y, z, seed));
  const tube = burnt ? [44, 40, 36] : [56, 58, 62];
  const body = [];
  // floor pan + nose wedge
  body.push([-hl + 2, -hw + 2.5, zb, hl - 1, hw - 2.5, zb + 3, (x, y, z, f, fx, fy, fz) => P(fz > zb + 2.2 ? sh(pc, 0.06) : pc, x, y, z), { r: 1.4, spec: 0.8, cut: [cut(0.5, 0, 1, 9, 0, 1.5)] }]);
  // side pods
  for (const s of [-1, 1]) body.push([-6, s > 0 ? hw - 4 : -hw + 1, zb + 0.5, 8, s > 0 ? hw - 1 : -hw + 4, zb + 4.2, (x, y, z) => P(sh(pc, -0.1), x, y, z), { r: 1.4, spec: 0.7 }]);
  // seats
  for (const y of [-3.2, 3.2]) { body.push([-4, y - 2, zb + 3, 0, y + 2, zb + 5, burnt ? [30, 26, 24] : [36, 34, 32], { r: 1 }], [-5, y - 2, zb + 3, -3.2, y + 2, zb + 9, burnt ? [30, 26, 24] : [44, 40, 38], { r: 0.9 }]); }
  // steering wheel
  body.push([2.2, 1.6, zb + 5.4, 3.2, 4.8, zb + 8.6, [30, 30, 32], { shape: 'cyl', axis: 'x', r: 0.3 }]);
  // roll cage: hoops + side rails (thin rounded tubes)
  const t = (x0, y0, z0, x1, y1, z1) => body.push([x0, y0, z0, x1, y1, z1, tube, { r: 0.55, spec: 1.1 }]);
  for (const s of [-1, 1]) { const y = s * (hw - 3); t(-6.4, y - 0.6, zb + 3, -5.2, y + 0.6, zb + 13); t(4.2, y - 0.6, zb + 3, 5.4, y + 0.6, zb + 12); t(-6.4, y - 0.6, zb + 12, 5.4, y + 0.6, zb + 13.2); }
  t(-6.4, -hw + 2.4, zb + 12, -5.2, hw - 2.4, zb + 13.2); t(4.2, -hw + 2.4, zb + 11, 5.4, hw - 2.4, zb + 12.2);
  // rear engine block
  const eng = mods.engine | 0;
  const engC = (x, y, z, f, fx, fy, fz) => burnt ? [40, 36, 32] : ((Math.round(fz * 2) % 2) && f !== '+z' ? [70, 72, 78] : [110, 112, 120]);
  body.push([-hl + 1, -4.5, zb + 2.5, -8, 4.5, zb + 7 + eng, engC, { r: 1.2, spec: 1.3 }]);
  if (eng >= 1) body.push([-hl + 4, -1.6, zb + 7 + eng, -9.5, 1.6, zb + 9.5 + eng, burnt ? [40, 36, 32] : [190, 40, 34], { r: 1, spec: 1.2 }]); // turbo scoop
  for (const y of eng >= 2 ? [-3.2, -1.2, 1.2, 3.2] : [-2.5, 2.5]) body.push([-hl - 2, y - 0.7, zb + 4, -hl + 2, y + 0.7, zb + 5.4, CHROME, { shape: 'cyl', axis: 'x', spec: 1.5 }]); // exhausts
  // fuel tank upgrade: barrel behind seats
  if (mods.tank) body.push([-8.5, -6.5, zb + 4, -6.5, -1.5, zb + 9, burnt ? [40, 36, 32] : [200, 40, 34], { shape: 'cyl', axis: 'y', r: 0.6, spec: 1 }]);
  // headlights / light bar
  for (const y of [-5.5, 5.5]) body.push([hl - 3, y - 1.4, zb + 3, hl - 1.2, y + 1.4, zb + 5, burnt ? [40, 36, 32] : [255, 244, 200], { shape: 'ell', spec: 1.4 }]);
  if (mods.light && !burnt) { t(4.2, -5, zb + 12.2, 5.4, 5, zb + 13.4); for (const y of [-3.6, -1.2, 1.2, 3.6]) body.push([4.6, y - 0.9, zb + 13.2, 6, y + 0.9, zb + 14.8, [255, 246, 210], { r: 0.4, spec: 1.5 }]); }
  // RAM: heavy front bumper with plates
  if (mods.ram) {
    const ramC = (x, y, z, f, fx, fy, fz) => burnt ? [40, 36, 32] : (f === '+x' && (Math.round(fy) % 3 === 0)) ? [140, 142, 150] : [86, 88, 96];
    body.push([hl - 1, -hw + 0.5, zb + 0.5, hl + 3.2, hw - 0.5, zb + 4.8, ramC, { r: 0.9, spec: 1.2, cut: [cut(1, 0, 0.8, 1.6, 0, 2.15)] }]);
    for (const y of [-6, -2, 2, 6]) body.push([hl + 1, y - 0.8, zb - 0.5, hl + 4.6, y + 0.8, zb + 5.6, [70, 72, 78], { r: 0.4 }]);
  }
  // SPIKES along both sides and on the ram
  if (mods.spikes) {
    const sp = burnt ? [50, 46, 42] : [210, 212, 220];
    for (const s of [-1, 1]) for (const x of [-8, -3, 2, 7]) body.push([x - 0.8, s > 0 ? hw - 1.4 : -hw - 2.6, zb + 2.2, x + 0.8, s > 0 ? hw + 2.6 : -hw + 1.4, zb + 3.8, sp, { shape: 'ell', spec: 1.6 }]);
    if (mods.ram) for (const y of [-6, -2, 2, 6]) body.push([hl + 3.6, y - 0.6, zb + 1.8, hl + 6.4, y + 0.6, zb + 3.4, sp, { shape: 'ell', spec: 1.6 }]);
  }
  // ARMOR: riveted plates over the sides and nose
  if (mods.armor) {
    const plate = (x, y, z, f, fx, fy, fz) => burnt ? [44, 40, 36] : ((Math.abs((fx % 4 + 4) % 4 - 2) < 0.4 && Math.abs(fz - zb - 4) < 0.5) ? [160, 160, 166] : TZ.mix([96, 100, 92], pc, 0.15));
    for (const s of [-1, 1]) body.push([-9, s > 0 ? hw - 2 : -hw, zb + 1, 9, s > 0 ? hw : -hw + 2, zb + 7, plate, { r: 0.6, spec: 0.8 }]);
    body.push([hl - 6, -hw + 2, zb + 3, hl - 1, hw - 2, zb + 5, plate, { r: 0.6, cut: [cut(0.6, 0, 1, 0, 0, 1)] }]);
  }
  const parts = [{ n: 'body', boxes: body }];
  addWheels(parts, null, wx, wr, mods.tires ? 4.4 : 3.8, hw * 2 + 1.5, wr, state, true, 0);
  return { parts, vs: VS, W: 128, H: 96, AX: 64, AY: 58, kind: 'buggy', round: 1.2, spec: 0.8 };
};

// ------------------------------------------------------------ snowmobile
const snowmobile = (paint, state, seed) => {
  const pc = paint || [200, 40, 40], burnt = state === 2;
  const P = (c, x, y, z) => burnt ? jit([60, 50, 44], 14, H(x, y, z)) : jit(c, 6, H(x * 3 + y, z, seed));
  const body = [];
  body.push([-10, -5, 3, 13, 5, 8, (x, y, z, f, fx, fy, fz) => P(fz > 7 ? sh(pc, 0.1) : pc, x, y, z), { r: 2.4, spec: 1, cut: [cut(0.8, 0, 1, 5, 0, 2.5)] }]);
  body.push([-10, -4, 8, 2, 4, 10.5, burnt ? [30, 26, 24] : [36, 34, 32], { r: 1.2 }]); // seat
  body.push([5, -4.5, 8, 7, 4.5, 13, burnt ? null : [150, 190, 220], { r: 0.8, spec: 2, cut: [cut(1, 0, 0.5, 1, 0, -2.5)] }]); // windscreen
  body.push([3, -4, 9.5, 4.5, 4, 10.5, [40, 40, 44], { r: 0.4 }]); // handlebar
  body.push([-13, -4, 0, -2, 4, 4, (x, y, z, f, fx) => (Math.round(fx) % 2) ? [30, 30, 32] : [50, 50, 54], { r: 1.6 }]); // track
  for (const y of [-6.5, 6.5]) { body.push([2, y - 1, 0, 17, y + 1, 1.2, [70, 72, 78], { r: 0.5, spec: 1, cut: [cut(1, 0, -1.4, 5.5, 0, -0.6)] }]); body.push([5, y - 0.4, 0.8, 6, y + 0.4, 4, [60, 60, 66], { r: 0.3 }]); }
  body.push([12, -2.5, 4.5, 13.6, 2.5, 6.5, [255, 244, 200], { shape: 'ell', spec: 1.5 }]);
  return { parts: [{ n: 'body', boxes: body }], vs: VS, W: 128, H: 92, AX: 64, AY: 56, kind: 'snowmobile', round: 1.4, spec: 0.8 };
};

// ------------------------------------------------------------ aircraft & boats (4.1)
// shared colouring: burnt / damaged / painted with jitter
const paintF = (state, seed) => (c, x, y, z) => state === 2 ? jit(TZ.noise2(x * 0.3, y * 0.3 + z, seed) > 0.5 ? [56, 46, 40] : [110, 70, 44], 12, H(x, y, z)) : state === 1 && TZ.noise2(x * 0.22, y * 0.22 + z * 0.3, seed + 5) > 0.68 ? TZ.mix(c, [118, 66, 36], 0.7) : jit(c, 5, H(x * 3 + y, z, seed));
const glassF = (state) => (x, y, z, f, fx, fy, fz) => state === 2 ? (H(x, y, z) < 0.4 ? null : [30, 26, 24]) : ((fx + fz * 1.2) % 8 + 8) % 8 < 1.3 ? GLASS_HI : GLASS;
// helicopter (Mi-2 style): rounded cabin with a glass nose, engine hump, tail boom, skids. Main rotor is drawn by the renderer.
const heli = (paint, state, seed) => {
  const pc = paint || [78, 96, 62], P = paintF(state, seed), body = [], dk = sh(pc, -0.3);
  const cab = (x, y, z, f, fx, fy, fz) => { if (fx > 7 && fz > 7) return glassF(state)(x, y, z, f, fx, fy, fz); if ((f === '+y' || f === '-y') && fz > 10 && fz < 14 && fx > -4 && fx < 6) return glassF(state)(x, y, z, f, fx, fy, fz); if (Math.abs(fz - 7) < 0.5) return P([210, 196, 120], x, y, z); return P(fz < 5 ? dk : pc, x, y, z); };
  body.push([-10, -7, 2.5, 16, 7, 17, cab, { shape: 'ell', spec: 1, sub: [] }]);
  body.push([-8, -6, 14, 7, 6, 20, (x, y, z) => P(sh(pc, 0.08), x, y, z), { r: 2.4, spec: 1 }]); // engine hump
  for (const yy of [-3.5, 3.5]) body.push([-9, yy - 1.4, 15, -6, yy + 1.4, 18, [44, 44, 46], { shape: 'cyl', axis: 'x' }]); // exhausts
  body.push([-38, -1.6, 11, -8, 1.6, 15, (x, y, z) => P(pc, x, y, z), { shape: 'cyl', axis: 'x', r: 0.9, spec: 0.8 }]); // tail boom
  body.push([-40, -0.6, 11, -34, 0.6, 24, (x, y, z) => P(dk, x, y, z), { r: 0.8, cut: [cut(1, 0, -0.6, 2, 0, 3)] }]); // fin
  body.push([-37, -6, 12, -33, 6, 13, (x, y, z) => P(dk, x, y, z), { r: 0.5 }]); // stabiliser
  body.push([-40.5, 0.7, 16, -36, 1.5, 21, state === 2 ? null : [70, 70, 74], { shape: 'cyl', axis: 'y', r: 0.6 }]); // tail rotor disc
  body.push([-1.2, -1.2, 20, 1.2, 1.2, 24, [50, 50, 54], { shape: 'cyl', axis: 'z' }]); // mast
  for (const yy of [-7.5, 7.5]) { body.push([-9, yy - 0.8, 0, 13, yy + 0.8, 1.4, [52, 52, 56], { r: 0.6, spec: 1, cut: [cut(1, 0, -1, 10.5, 0, 0)] }]); for (const xx of [-5, 7]) body.push([xx - 0.6, yy * 0.75 - 0.6, 0.8, xx + 0.6, yy * 0.75 + 0.6, 4.5, [52, 52, 56], { r: 0.4 }]); }
  if (state !== 2) body.push([-1, -7.2, 8.5, 9, 7.2, 9.6, [196, 40, 34], { r: 0.4 }]); // red cheat line
  return { parts: [{ n: 'body', boxes: body }], vs: VS * 1.35, W: 228, H: 164, AX: 114, AY: 100, kind: 'heli', round: 1.4, spec: 0.9, mast: 24 };
};
// An-2 biplane: fuselage, two wings with struts, tail, radial engine, tail-dragger gear
const plane = (paint, state, seed) => {
  const pc = paint || [206, 206, 196], P = paintF(state, seed), body = [], st = [190, 40, 34];
  const fus = (x, y, z, f, fx, fy, fz) => { if (fx > 11 && fx < 17 && fz > 12) return glassF(state)(x, y, z, f, fx, fy, fz); if ((f === '+y' || f === '-y') && fz > 9.5 && fz < 12.5 && fx > -14 && fx < 8 && (((fx + 40) % 5) < 2.6)) return glassF(state)(x, y, z, f, fx, fy, fz); if (Math.abs(fz - 8) < 0.6) return P(st, x, y, z); return P(pc, x, y, z); };
  body.push([-28, -5.5, 3, 22, 5.5, 16, fus, { r: 4, spec: 1, cut: [cut(-1, 0, 0.9, -21, 0, 3), cut(0, 0, -1, 0, 0, -5.5)] }]);
  body.push([20, -5.5, 3.5, 27, 5.5, 15, (x, y, z, f, fx, fy, fz) => state === 2 ? [40, 36, 32] : Math.hypot(fy, fz - 0) < 1.6 ? [30, 30, 32] : (Math.round(Math.atan2(fz, fy) * 3) % 2 ? [60, 60, 64] : [100, 100, 106]), { shape: 'cyl', axis: 'x', r: 0.6, spec: 1.2 }]); // cowling
  const wing = (x, y, z, f, fx, fy, fz) => { let c = Math.abs(fy) > 30 ? st : pc; if (Math.abs((fy % 6 + 6) % 6 - 3) < 0.3 && f === '+z') c = sh(c, -0.15); return P(c, x, y, z); };
  body.push([4, -34, 3.5, 13, 34, 5.2, wing, { r: 0.8, spec: 0.7 }]); // lower wing
  body.push([6, -38, 19, 15, 38, 20.8, wing, { r: 0.8, spec: 0.7 }]); // upper wing
  for (const yy of [-26, -12, 12, 26]) body.push([8.5, yy - 0.5, 5, 9.7, yy + 0.5, 19, [60, 60, 64], { r: 0.4 }]); // struts
  body.push([-29, -13, 12, -22, 13, 13.6, (x, y, z) => P(pc, x, y, z), { r: 0.8 }]); // tailplane
  body.push([-30, -0.7, 12, -21, 0.7, 26, (x, y, z, f, fx, fy, fz) => P(fz > 22 ? st : pc, x, y, z), { r: 0.8, cut: [cut(1, 0, -0.9, 2, 0, 2)] }]); // fin
  for (const yy of [-6.5, 6.5]) { body.push([10, yy - 1.4, 0, 18, yy + 1.4, 8, wheelFn(14, 4, 4, state, false), { shape: 'cyl', axis: 'y', r: 0.9 }]); body.push([12.5, yy * 0.7 - 0.6, 4, 13.5, yy * 0.7 + 0.6, 6, [50, 50, 54], { r: 0.4 }]); }
  body.push([-27, -1, 0, -24, 1, 3, [30, 30, 32], { shape: 'cyl', axis: 'y' }]); // tail wheel
  return { parts: [{ n: 'body', boxes: body }], vs: VS * 1.25, W: 292, H: 196, AX: 146, AY: 116, kind: 'plane', round: 1.2, spec: 0.8, nose: 28 };
};
// home-made aircraft from pipes: open tube frame, seat, pusher engine
const pipeC = (state) => state === 2 ? [44, 40, 36] : [150, 152, 158];
const tube = (body, state, x0, y0, z0, x1, y1, z1) => body.push([x0, y0, z0, x1, y1, z1, pipeC(state), { r: 0.55, spec: 1.3 }]);
const gyro = (paint, state, seed) => {
  const pc = paint || [214, 160, 40], P = paintF(state, seed), body = [];
  for (const yy of [-4, 4]) tube(body, state, -10, yy - 0.6, 1, 12, yy + 0.6, 2.2);         // skids
  tube(body, state, -2, -4, 1.5, 0, 4, 2.6); tube(body, state, 8, -4, 1.5, 10, 4, 2.6);
  tube(body, state, -1, -0.6, 2, 0.4, 0.6, 22); tube(body, state, -6, -0.6, 2, -4.6, 0.6, 14); // mast & rear post
  tube(body, state, -22, -0.5, 9, -4, 0.5, 10.2);                                            // tail boom
  body.push([-24, -0.5, 8, -19, 0.5, 18, (x, y, z) => P(pc, x, y, z), { r: 0.6 }]);          // fin
  body.push([1, -3, 2.5, 9, 3, 6, (x, y, z) => P(pc, x, y, z), { r: 2, spec: 1, cut: [cut(1, 0, 0.6, 2.5, 0, 1)] }]); // nose pod
  body.push([-3, -2.6, 3, 2, 2.6, 5, [40, 38, 36], { r: 1 }]); body.push([-4, -2.6, 3, -2.2, 2.6, 10, [44, 40, 38], { r: 0.9 }]); // seat
  body.push([-9, -2.6, 6, -4, 2.6, 11, (x, y, z, f, fx, fy, fz) => state === 2 ? [40, 36, 32] : (Math.round(fz * 2) % 2 ? [70, 72, 78] : [120, 122, 128]), { r: 1.2, spec: 1.2 }]); // engine
  body.push([-10.5, -6, 2, -9.5, 6, 15, state === 2 ? null : [80, 80, 84], { shape: 'cyl', axis: 'x', r: 0.5 }]); // pusher prop disc
  body.push([-1, -1, 21, 1, 1, 23.5, [50, 50, 54], { shape: 'cyl', axis: 'z' }]);
  return { parts: [{ n: 'body', boxes: body }], vs: VS * 1.25, W: 176, H: 140, AX: 88, AY: 88, kind: 'gyro', round: 1, spec: 0.8, mast: 23.5 };
};
const ultralight = (paint, state, seed) => {
  const pc = paint || [60, 120, 190], P = paintF(state, seed), body = [];
  const sail = (x, y, z, f, fx, fy, fz) => { const c = Math.abs(fy) > 22 ? [230, 220, 200] : pc; return state === 2 ? (H(x, y, z) < 0.5 ? null : [50, 40, 34]) : P(Math.abs((fx % 3 + 3) % 3) < 0.4 ? sh(c, -0.12) : c, x, y, z); };
  body.push([-4, -30, 18, 9, 30, 19.2, sail, { r: 0.5, cut: [cut(1, 0.42, 0, 5.5, 26, 0), cut(1, -0.42, 0, 5.5, -26, 0)] }]); // delta wing
  tube(body, state, 1, -0.6, 3, 2.2, 0.6, 18); tube(body, state, -8, -0.6, 3, -6.8, 0.6, 18);   // A-frame
  tube(body, state, -9, -0.5, 2.6, 12, 0.5, 3.8);                                                // keel
  for (const yy of [-5, 5]) { tube(body, state, -2, yy - 0.5, 0, 6, yy + 0.5, 1); body.push([1, yy - 1, 0, 4, yy + 1, 3, wheelFn(2.5, 1.5, 1.5, state, false), { shape: 'cyl', axis: 'y' }]); }
  body.push([9, -0.8, 0, 11.5, 0.8, 2.5, wheelFn(10.2, 1.2, 1.2, state, false), { shape: 'cyl', axis: 'y' }]);
  body.push([0, -2.4, 3.4, 5, 2.4, 5, [40, 38, 36], { r: 0.8 }]); body.push([-1, -2.4, 3.4, 0.8, 2.4, 9, [44, 40, 38], { r: 0.7 }]);
  body.push([-6, -2.4, 4, -1.5, 2.4, 8, (x, y, z, f, fx, fy, fz) => state === 2 ? [40, 36, 32] : (Math.round(fz * 2) % 2 ? [70, 72, 78] : [120, 122, 128]), { r: 1, spec: 1.2 }]);
  body.push([-7.6, -5, 1.5, -6.8, 5, 11, state === 2 ? null : [80, 80, 84], { shape: 'cyl', axis: 'x', r: 0.5 }]);
  return { parts: [{ n: 'body', boxes: body }], vs: VS * 1.25, W: 222, H: 142, AX: 111, AY: 90, kind: 'ultralight', round: 1, spec: 0.8 };
};
// wooden rowing boat and a white motor boat
const boat = (paint, state, seed) => {
  const wood = [128, 88, 54], P = paintF(state, seed), body = [];
  const hull = (x, y, z, f, fx, fy, fz) => { let c = Math.abs(((fz * 1.2) % 2.4 + 2.4) % 2.4) < 0.35 ? sh(wood, -0.3) : wood; if (fz > 5.4) c = sh(wood, 0.15); return P(c, x, y, z); };
  body.push([-17, -8, 0, 17, 8, 7, hull, { shape: 'ell', axis: 'x', spec: 0.5, sub: [{ c: [0, 0, 7.5], r: 6.6, axis: 'x' }], cut: [cut(0, 0, 1, 0, 0, 3.2)] }]);
  body.push([-14, -6.5, 1.5, 14, 6.5, 2.4, P(sh(wood, -0.25), 0, 0, 0), { r: 0.5 }]); // floor boards
  for (const xx of [-6, 4]) body.push([xx - 1.5, -6.6, 4.2, xx + 1.5, 6.6, 5.2, (x, y, z) => P(sh(wood, 0.12), x, y, z), { r: 0.3 }]); // thwarts
  if (state !== 2) for (const s of [-1, 1]) body.push([-6, s * 7.5 - 0.5, 5, 10, s * 7.5 + 0.5, 6, [150, 112, 70], { r: 0.4 }]); // oars
  return { parts: [{ n: 'body', boxes: body }], vs: VS, W: 120, H: 84, AX: 60, AY: 52, kind: 'boat', round: 1.2, spec: 0.5 };
};
const motorboat = (paint, state, seed) => {
  const pc = paint || [232, 232, 226], P = paintF(state, seed), body = [], blue = [40, 80, 150];
  const hull = (x, y, z, f, fx, fy, fz) => { if (fz < 3.2) return P([200, 60, 44], x, y, z); if (Math.abs(fz - 6) < 0.7) return P(blue, x, y, z); return P(pc, x, y, z); };
  body.push([-24, -11, 0, 26, 11, 9, hull, { r: 3, spec: 1.1, sub: [{ c: [-6, 0, 12], r: 9.6, axis: 'x' }], cut: [cut(1, 0.75, 0, 18, 6, 0), cut(1, -0.75, 0, 18, -6, 0), cut(0.6, 0, -1, 18, 0, -2)] }]);
  body.push([-20, -9.5, 2, 16, 9.5, 3.6, [170, 150, 120], { r: 0.6 }]); // deck floor
  body.push([2, -6, 8, 6, 6, 13, glassF(state), { r: 0.8, spec: 2, cut: [cut(1, 0, 0.7, 1, 0, -1)] }]); // windscreen
  body.push([-4, -3, 3, 2, 3, 9, (x, y, z) => P(pc, x, y, z), { r: 1 }]); // console
  for (const yy of [-5, 5]) body.push([-12, yy - 2.5, 3, -6, yy + 2.5, 6.5, state === 2 ? [30, 26, 24] : [60, 90, 140], { r: 1.2 }]); // seats
  body.push([-29, -2.4, 1, -23, 2.4, 11, (x, y, z, f, fx, fy, fz) => state === 2 ? [40, 36, 32] : fz > 7 ? [40, 40, 44] : [70, 72, 78], { r: 1.2, spec: 1.3 }]); // outboard motor
  return { parts: [{ n: 'body', boxes: body }], vs: VS * 1.1, W: 166, H: 112, AX: 83, AY: 66, kind: 'motorboat', round: 1.2, spec: 0.9 };
};
const EXTRA = { heli, plane, gyro, ultralight, boat, motorboat };
M.vehicle = (kind, paint, state = 0, seed = 1, mods) => EXTRA[kind] ? EXTRA[kind](paint, state, seed) : kind === 'buggy' ? buggy(paint, state, seed, mods) : kind === 'snowmobile' ? snowmobile(paint, state, seed) : car(kind, paint, state, seed);
// 16 directions, states 0 ok, 1 damaged, 2 burnt; steer frames for the front wheels
M.vehicleSet = (kind, paint, seed, mods) => {
  const models = [0, 1, 2].map(s => M.vehicle(kind, paint, s, seed, mods));
  const set = new V.Set((state, steer, d) => {
    const P = {}; if (steer) { P.wFL = { rz: steer * 0.42 }; P.wFR = { rz: steer * 0.42 }; }
    return V.render(models[state], P, V.dirAngle(d, 16), { crease: 1.1 });
  }, 16);
  return set;
};
M.VEHICLE_SHAPES = Object.assign({ buggy: { L: 34 }, snowmobile: { L: 30 }, heli: { L: 56 }, plane: { L: 55 }, gyro: { L: 36 }, ultralight: { L: 30 }, boat: { L: 34 }, motorboat: { L: 55 } }, SHAPES);
})();
