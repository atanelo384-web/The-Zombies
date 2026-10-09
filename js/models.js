// =====================================================================
//  THE ZOMBIES — voxel models: humans, zombies, animals, vehicles, gates
// =====================================================================
'use strict';
(() => {
const V = TZ.Vox, H = TZ.hash, jit = V.jit, sh = TZ.shade;
const M = TZ.Models = {};
const BLOOD = [[124, 18, 14], [96, 12, 10], [150, 26, 18]];

// ---------------------------------------------------------------
//  HUMANOID
//  axes: +x forward, +y left, +z up. feet at z=0, centre at x=y=0
// ---------------------------------------------------------------
// cfg: skin, hair, hairStyle(short|long|bald|patchy|ponytail|mohawk), shirt, shirt2, pants, shoes,
//      vest, backpack, hat(cap|beanie|helmet|hood|band|ushanka), hatColor, beard, cross, coat (long coat),
//      zombie, blood(0..2), torn(0..2), eyes, build(normal|thin|big|bloated|huge), gasmask, glasses, scarf, armorPlates
M.human = (cfg) => {
  const seed = cfg.seed || 1;
  const B = {
    normal: { legH: 11, legW: 3, torsoW: 8, torsoD: 4, torsoH: 10, armW: 2, head: 6, armL: 10 },
    thin: { legH: 12, legW: 3, torsoW: 7, torsoD: 4, torsoH: 10, armW: 2, head: 6, armL: 11 },
    big: { legH: 12, legW: 4, torsoW: 12, torsoD: 7, torsoH: 12, armW: 4, head: 7, armL: 13 },
    bloated: { legH: 10, legW: 3, torsoW: 10, torsoD: 8, torsoH: 11, armW: 2, head: 6, armL: 10 },
    huge: { legH: 20, legW: 7, torsoW: 22, torsoD: 13, torsoH: 20, armW: 7, head: 11, armL: 23 },
    child: { legH: 8, legW: 2, torsoW: 6, torsoD: 3, torsoH: 7, armW: 2, head: 6, armL: 7 },
  }[cfg.build || 'normal'];
  const { legH, legW, torsoW, torsoD, torsoH, armW, head, armL } = B;
  const zT = legH + torsoH; // top of torso
  const skin = cfg.skin, shirt = cfg.shirt, pants = cfg.pants, shoes = cfg.shoes || [56, 42, 34];
  const blood = (x, y, z, base, f = 1) => {
    if (!cfg.blood) return base;
    const n = TZ.noise2(x * 0.7 + y * 0.31, z * 0.6 + y * 0.2, seed + 77);
    if (n > 1 - cfg.blood * 0.22 * f) return BLOOD[(H(x, z, seed) * 3) | 0];
    return base;
  };
  const torn = (x, y, z, base) => { if (cfg.torn && H(x * 3 + y, z, seed + 9) < cfg.torn * 0.12) return sh(skin, -0.12); return base; };
  const rot = (x, y, z, base) => cfg.zombie && H(x + 40, y * 7 + z, seed) < 0.08 ? sh(base, -0.22) : base;
  const parts = [];
  // ---- legs ----
  const leg = (n, y0) => {
    const yy = y0;
    parts.push({ n, pv: [0, yy + legW / 2, legH], parent: null, boxes: [
      [-1, yy, 2, 2, yy + legW, legH, (x, y, z, f) => {
        let c = pants;
        if (cfg.coat && z > legH - 5) c = shirt;
        if (x === -1 && f === '-x') c = sh(c, -0.1);
        if (z === legH - 4 && cfg.kneepad) c = cfg.kneepad;
        c = jit(c, 10, H(x, y + z * 3, seed));
        if (cfg.torn && z < 6 && H(x, y * 5 + z, seed + 2) < cfg.torn * 0.15) c = sh(skin, -0.15);
        return blood(x, y, z, c, 0.8);
      }],
      [-1, yy, 0, 3, yy + legW, 2, (x, y, z) => z === 1 ? sh(shoes, 0.12) : shoes],
    ] });
  };
  if (!cfg.noLegs) { leg('legL', 0); leg('legR', -legW); }
  // ---- torso ----
  const tx0 = -Math.floor(torsoD / 2), tx1 = tx0 + torsoD, ty0 = -torsoW / 2, ty1 = torsoW / 2;
  const torsoFn = (x, y, z, f) => {
    let c = shirt;
    const front = f === '+x';
    if (z === legH) c = cfg.belt || sh(pants, -0.35);
    else if (z === legH + 1 && cfg.belt) c = cfg.belt;
    if (cfg.shirt2 && front && (y === -1 || y === 0)) c = cfg.shirt2;         // open jacket / zipper
    if (cfg.stripe && z === zT - 4) c = cfg.stripe;
    if (cfg.vest && z > legH + 1 && z < zT - 1) { c = cfg.vest; if (front && (z === legH + 4 || z === legH + 6) && Math.abs(y + 0.5) > 1) c = sh(cfg.vest, -0.22); }
    if (cfg.armorPlates && z > legH + 2 && z < zT - 1 && (front || f === '-x')) c = (z % 3 === 0) ? sh(cfg.armorPlates, -0.2) : cfg.armorPlates;
    if (cfg.cross && front && y >= 1 && y <= 3) { const cx = 2, cz = zT - 4; if ((y === cx && Math.abs(z - cz) <= 1) || (z === cz && Math.abs(y - cx) <= 1)) c = [210, 34, 30]; }
    if (cfg.scarf && z >= zT - 2) c = cfg.scarf;
    if (z === zT - 1 && front && Math.abs(y + 0.5) < 2) c = sh(c, -0.18); // collar
    if (cfg.bloated && front && z > legH + 1 && z < zT - 2) c = TZ.mix(c, [132, 150, 84], 0.55);
    c = rot(x, y, z, torn(x, y, z, jit(c, 9, H(x * 5 + y, z, seed + 1))));
    return blood(x, y, z, c);
  };
  const torsoBoxes = [[tx0, ty0, legH, tx1, ty1, zT, torsoFn]];
  if (cfg.bloated) torsoBoxes.push([tx1 - 1, ty0 + 1, legH + 2, tx1 + 2, ty1 - 1, zT - 2, (x, y, z) => { let c = TZ.mix(skin, [120, 150, 70], 0.4); if (H(x, y * 3 + z, seed) < 0.15) c = [150, 180, 60]; if (H(x + 9, y + z, seed) < 0.06) c = BLOOD[0]; return jit(c, 12, H(y, z, seed)); }]);
  if (cfg.coat) torsoBoxes.push([tx0 - 1, ty0, legH - 5, tx1, ty1, legH, (x, y, z, f) => f === '+x' && (y === -1 || y === 0) ? null : jit(shirt, 10, H(x, y + z, seed))]);
  if (cfg.backpack) torsoBoxes.push([tx0 - 3, ty0 + 1, legH + 2, tx0, ty1 - 1, zT - 1, (x, y, z) => { let c = cfg.backpack; if (z === legH + 6) c = sh(c, -0.3); if (x === tx0 - 3 && z > legH + 3 && z < legH + 6 && Math.abs(y + 0.5) < 2) c = sh(c, 0.15); return jit(c, 10, H(x, y + z, seed)); }],
    [tx0 - 3, ty0 + 1, zT - 1, tx0 - 1, ty1 - 1, zT + 1, sh(cfg.backpack, -0.15)]);
  if (cfg.tank) torsoBoxes.push([tx0 - 3, ty0 + 2, legH + 1, tx0, ty0 + 4, zT, [200, 50, 40]], [tx0 - 3, ty1 - 4, legH + 1, tx0, ty1 - 2, zT, [200, 50, 40]]);
  parts.push({ n: 'torso', pv: [0, 0, legH], boxes: torsoBoxes });
  // ---- arms ----
  const armCol = cfg.sleeves === false ? skin : shirt;
  const arm = (n, side) => {
    const y0 = side > 0 ? ty1 : ty0 - armW;
    parts.push({ n, parent: 'torso', pv: [0, y0 + armW / 2, zT - 1], boxes: [
      [-1, y0, zT - armL, -1 + armW, y0 + armW, zT, (x, y, z) => {
        let c = z < zT - armL + 2 ? skin : armCol;
        if (cfg.gloves && z < zT - armL + 2) c = cfg.gloves;
        if (cfg.vest && z > zT - 3 && cfg.sleeves !== false) c = armCol;
        c = rot(x, y, z, torn(x, y, z, jit(c, 10, H(x, y * 3 + z, seed + 5))));
        return blood(x, y, z, c, 0.7);
      }],
    ] });
  };
  arm('armL', 1); arm('armR', -1);
  // ---- head ----
  const hz0 = zT, hz1 = zT + head, hx0 = -Math.floor(head / 2), hx1 = hx0 + head, hy0 = -head / 2, hy1 = head / 2;
  const hairC = cfg.hair || [60, 44, 32], hs = cfg.hairStyle || 'short';
  const eyeZ = hz0 + Math.floor(head * 0.5);
  const headFn = (x, y, z, f) => {
    let c = skin;
    const front = f === '+x' && x === hx1 - 1;
    // hair
    const top = z >= hz1 - 1;
    const back = x === hx0;
    let hair = false;
    if (hs !== 'bald') {
      if (top && !(hs === 'mohawk' && Math.abs(y + 0.5) > 1)) hair = true;
      if (hs !== 'mohawk') {
        if (back && z >= hz0 + (hs === 'long' ? 0 : 2)) hair = true;
        if ((y === hy0 || y === hy1 - 1) && z >= hz1 - 2 && x < hx1 - 1) hair = true;
        if (hs === 'long' && (y === hy0 || y === hy1 - 1) && x < hx1 - 2) hair = true;
        if (front && z === hz1 - 2 && hs !== 'patchy') hair = H(y, 3, seed) < 0.6;
      }
      if (hs === 'patchy' && H(x * 3 + y, z, seed) < 0.45) hair = false;
    }
    if (hair) c = jit(hairC, 14, H(x + y * 3, z, seed + 3));
    if (front && !hair) {
      const ey = eyeZ;
      const eyeL = Math.floor(head / 2) - 2, eyeR = -Math.floor(head / 2) + 1;
      if (z === ey && (y === eyeL || y === eyeR)) return cfg.zombie ? (cfg.eyes || [235, 48, 30]) : [24, 18, 18];
      if (z === ey + 1 && (y === eyeL || y === eyeR) && !cfg.zombie) return sh(hairC, -0.1);
      if (cfg.glasses && z === ey && Math.abs(y + 0.5) < head / 2 - 0.5) return [40, 40, 44];
      if (z === ey - 2 && cfg.zombie && y >= -1 && y <= 0) return [70, 14, 12];
      if (z === ey - 2 && !cfg.zombie && y >= -1 && y <= 0 && !cfg.beard) c = sh(skin, -0.18);
      if (cfg.beard && z <= ey - 1) c = jit(cfg.beard, 12, H(y, z, seed));
      if (cfg.gasmask && z <= ey + 1 && z >= hz0) { c = (z === ey - 1 && Math.abs(y + 0.5) < 1) ? [30, 30, 30] : [70, 74, 66]; if (z === ey && (y === eyeL || y === eyeR)) return [150, 200, 210]; }
    }
    if (!hair && !front && cfg.zombie && H(x, y * 3 + z, seed + 4) < 0.1) c = sh(skin, -0.25);
    if (cfg.blood && !hair && H(x * 7 + y, z, seed + 8) < cfg.blood * 0.08) c = BLOOD[1];
    return hair ? c : jit(c, 7, H(x * 3 + y, z * 5, seed + 2));
  };
  const headBoxes = [[hx0, hy0, hz0, hx1, hy1, hz1, headFn]];
  if (hs === 'ponytail') headBoxes.push([hx0 - 2, -1, hz1 - 4, hx0, 1, hz1 - 1, hairC]);
  if (hs === 'mohawk') headBoxes.push([hx0, -1, hz1, hx1 - 1, 1, hz1 + 2, (x, y, z) => jit(hairC, 20, H(x, z, seed))]);
  const hc = cfg.hatColor || [70, 80, 50];
  if (cfg.hat === 'cap') headBoxes.push([hx0, hy0, hz1 - 1, hx1, hy1, hz1 + 1, (x, y, z) => z === hz1 ? sh(hc, 0.1) : hc], [hx1, hy0 + 1, hz1 - 1, hx1 + 2, hy1 - 1, hz1, sh(hc, -0.2)]);
  if (cfg.hat === 'beanie') headBoxes.push([hx0, hy0, hz1 - 2, hx1, hy1, hz1 + 1, (x, y, z) => z === hz1 - 2 ? sh(hc, -0.2) : jit(hc, 10, H(x, y, z))]);
  if (cfg.hat === 'helmet') headBoxes.push([hx0 - 1, hy0 - 1, hz1 - 2, hx1 + 1, hy1 + 1, hz1 + 1, (x, y, z) => jit(z === hz1 - 2 ? sh(hc, -0.25) : hc, 8, H(x, y, z + 3))]);
  if (cfg.hat === 'hood') headBoxes.push([hx0 - 1, hy0 - 1, hz0 + 1, hx1 - 1, hy1 + 1, hz1 + 1, (x, y, z, f) => (f === '+x' && x === hx1 - 2) ? null : jit(hc, 10, H(x, y, z))]);
  if (cfg.hat === 'band') headBoxes.push([hx0, hy0, hz1 - 2, hx1, hy1, hz1 - 1, hc]);
  if (cfg.hat === 'ushanka') headBoxes.push([hx0 - 1, hy0 - 1, hz1 - 2, hx1 + 1, hy1 + 1, hz1 + 2, (x, y, z) => z >= hz1 ? jit(hc, 10, H(x, y, z)) : jit([170, 150, 120], 16, H(x, y, z))], [hx0, hy0 - 1, hz0 + 1, hx1 - 2, hy0, hz1 - 2, [170, 150, 120]], [hx0, hy1, hz0 + 1, hx1 - 2, hy1 + 1, hz1 - 2, [170, 150, 120]]);
  if (cfg.hat === 'crown') headBoxes.push([hx0 + 1, hy0 + 1, hz1, hx1 - 1, hy1 - 1, hz1 + 2, (x, y, z) => (z === hz1 + 1 && (x + y) % 2) ? null : [230, 190, 60]]);
  parts.push({ n: 'head', parent: 'torso', pv: [0, 0, hz0], boxes: headBoxes });
  // size of output canvas
  const big = cfg.build === 'huge' ? 2.1 : cfg.build === 'big' ? 1.35 : 1;
  const W = Math.round(44 * big), Hh = Math.round(48 * big);
  const hand = (side) => { const y0 = side > 0 ? ty1 : ty0 - armW; return [0, y0 + armW / 2, zT - armL + 1]; };
  const marks = { handR: { part: 'armR', p: hand(-1) }, handL: { part: 'armL', p: hand(1) }, chest: { part: 'torso', p: [0, 0, legH + torsoH * 0.6] } };
  return { parts, marks, W, H: Hh, AX: W >> 1, AY: Hh - Math.round(7 * big), cfg, legH, zT, headTop: hz1, armL, round: 2.2 };
};

// ---------- poses ----------
// armMode: 'free' | 'one' | 'two' | 'melee'
M.humanPose = (model, anim, f, opts = {}) => {
  const P = {}; const cfg = model.cfg;
  const zombie = cfg.zombie, armMode = opts.arm || 'free';
  let bob = 0;
  if (anim === 'walk' || anim === 'run') {
    const n = 8, ph = (f / n) * Math.PI * 2;
    const amp = anim === 'run' ? 0.85 : zombie ? 0.42 : 0.6;
    P.legL = { ry: Math.sin(ph) * amp }; P.legR = { ry: -Math.sin(ph) * amp };
    if (zombie && cfg.limp) P.legR.ry *= 0.4;
    bob = Math.abs(Math.cos(ph)) * (anim === 'run' ? 1.3 : 0.8);
    P.armL = { ry: -Math.sin(ph) * amp * 0.8 }; P.armR = { ry: Math.sin(ph) * amp * 0.8 };
    P.torso = { ry: anim === 'run' ? 0.18 : zombie ? 0.2 : 0.04, rx: zombie ? Math.sin(ph) * 0.06 : 0 };
  } else if (anim === 'idle') {
    P.torso = { ry: zombie ? 0.18 : 0, rx: zombie ? 0.05 * (f ? 1 : -1) : 0 };
    bob = f ? 0.5 : 0;
    P.armL = { ry: f ? -0.06 : 0.02 }; P.armR = { ry: f ? 0.04 : -0.02 };
  } else if (anim === 'attack') {
    P.torso = { ry: 0.3 + f * 0.12 };
    P.armL = { ry: -1.2 - f * 0.5, rz: 0.15 }; P.armR = { ry: -1.0 - f * 0.7, rz: -0.15 };
  }
  P.torso = P.torso || {};
  P.torso.dz = -bob * 0.3;
  if (P.legL) { } else { P.legL = {}; P.legR = {}; }
  // zombie reaching arms
  if (zombie && anim !== 'attack' && !cfg.armsDown) {
    const sway = anim === 'walk' ? Math.sin(f / 8 * Math.PI * 2) * 0.12 : 0;
    P.armL = { ry: -1.35 + sway, rz: 0.1 }; P.armR = { ry: -1.25 - sway, rz: -0.08 };
    if (cfg.oneArmDown) P.armR = { ry: 0.1 };
  }
  // armed humans
  if (!zombie) {
    if (armMode === 'two') { P.armR = { ry: -1.05, rz: 0.55 }; P.armL = { ry: -1.5, rz: -0.45 }; P.torso.rz = 0.12; }
    else if (armMode === 'one') { P.armR = { ry: -1.4, rz: 0.45 }; P.armL = { ry: -1.35, rz: -0.62 }; }
    else if (armMode === 'melee') { P.armR = { ry: -0.6, rz: 0.15 }; }
    else if (armMode === 'swing') { P.armR = f ? { ry: -1.25, rz: 0.75 } : { ry: -2.3, rz: -0.35 }; P.torso.rz = f ? -0.3 : 0.3; }
    else if (armMode === 'drive') { P.armR = { ry: -1.2, rz: 0.3 }; P.armL = { ry: -1.2, rz: -0.3 }; }
  }
  if (anim === 'dead') {
    P._root = { ry: -Math.PI / 2 + 0.05, pv: [0, 0, 0], dz: model.cfg.build === 'huge' ? 10 : 3, dx: -model.zT * 0.45 };
    P.armL = { ry: -0.3, rz: 0.6 }; P.armR = { ry: 0.3, rz: -0.4 }; P.legL = { rz: 0.15 }; P.legR = { rz: -0.1 };
  }
  if (anim === 'sit') { P.legL = { ry: -1.45 }; P.legR = { ry: -1.45 }; P._root = { dz: -model.legH + 3 }; }
  return P;
};

// sprite set for a humanoid. anim names: idle(2) walk(8) run(8) attack(2) dead(1); extra = arm mode
M.humanSet = (cfg) => {
  const model = M.human(cfg);
  const set = new V.Set((anim, f, d, extra) => {
    const pose = M.humanPose(model, anim, f, { arm: extra || 'free' });
    return V.render(model, pose, V.dirAngle(d, 8));
  }, 8);
  set.model = model; set.cfg = cfg;
  set.frames = { idle: 2, walk: 8, run: 8, attack: 2, dead: 1, swing: 2, sit: 1 };
  return set;
};

// ---------------------------------------------------------------
//  CRAWLER (legless zombie) — custom model
// ---------------------------------------------------------------
M.crawler = (cfg) => {
  const seed = cfg.seed || 3, skin = cfg.skin, shirt = cfg.shirt;
  const parts = [
    { n: 'torso', pv: [0, 0, 2], boxes: [[-9, -4, 0, 1, 4, 4, (x, y, z) => { let c = shirt; if (x < -6) c = H(x, y, seed) < 0.5 ? BLOOD[0] : sh(cfg.pants, 0); if (H(x * 3, y + z, seed) < 0.12) c = BLOOD[1]; return jit(c, 10, H(x, y * 3 + z, seed)); }]] },
    { n: 'head', parent: 'torso', pv: [1, 0, 2], boxes: [[1, -3, 0, 7, 3, 6, (x, y, z, f) => { if (z >= 5 || x === 1) return jit(cfg.hair, 12, H(x, y, z)); if (f === '+x' && z === 3 && (y === 1 || y === -2)) return [235, 48, 30]; if (f === '+x' && z === 1 && Math.abs(y + 0.5) < 1) return [80, 14, 12]; return jit(skin, 8, H(x * 3, y, z)); }]] },
    { n: 'armL', parent: 'torso', pv: [0, 4, 3], boxes: [[0, 4, 1, 9, 6, 3, (x, y, z) => x > 6 ? skin : jit(shirt, 8, H(x, y, z))]] },
    { n: 'armR', parent: 'torso', pv: [0, -4, 3], boxes: [[0, -6, 1, 9, -4, 3, (x, y, z) => x > 6 ? skin : jit(shirt, 8, H(x, y, z))]] },
  ];
  return { parts, W: 44, H: 30, AX: 22, AY: 22, cfg, zT: 6, round: 1.3 };
};
M.crawlerSet = (cfg) => {
  const model = M.crawler(cfg);
  const set = new V.Set((anim, f, d) => {
    const ph = f / 8 * Math.PI * 2;
    const P = { armL: { rz: Math.sin(ph) * 0.35, ry: -0.1 }, armR: { rz: -Math.sin(ph) * 0.35, ry: -0.1 }, torso: { rz: Math.sin(ph) * 0.08 }, head: { ry: anim === 'attack' ? -0.3 : 0 } };
    if (anim === 'dead') { P.head = { ry: 0.4 }; P.armL = { rz: 0.4 }; P.armR = { rz: -0.4 }; }
    return V.render(model, P, V.dirAngle(d, 8));
  });
  set.model = model; set.frames = { idle: 2, walk: 8, run: 8, attack: 2, dead: 1 };
  return set;
};

// ---------------------------------------------------------------
//  QUADRUPEDS: deer, wolf, bear
// ---------------------------------------------------------------
M.animal = (kind, seed = 1) => {
  const A = {
    deer: { body: [18, 7, 7], leg: 9, legW: 2, neck: 7, head: [6, 4, 4], col: [150, 104, 64], belly: [210, 190, 160], dark: [100, 70, 44] },
    wolf: { body: [16, 6, 6], leg: 6, legW: 2, neck: 2, head: [7, 5, 5], col: [120, 118, 112], belly: [180, 176, 166], dark: [70, 68, 66] },
    bear: { body: [22, 12, 11], leg: 7, legW: 4, neck: 1, head: [8, 8, 7], col: [92, 64, 44], belly: [120, 88, 62], dark: [56, 38, 26] },
    dog: { body: [13, 5, 5], leg: 5, legW: 2, neck: 2, head: [6, 4, 4], col: [168, 112, 60], belly: [226, 200, 160], dark: [90, 58, 32] },
  }[kind];
  const [bl, bw, bh] = A.body, L = A.leg;
  const fur = (x, y, z, f) => { let c = A.col; if (f === '-z' || z === L) c = A.belly; if (kind === 'deer' && f === '+z' && H(x, y, seed) < 0.12) c = [230, 220, 200]; if (kind === 'wolf' && f === '+z') c = sh(A.col, -0.12); return jit(c, 14, H(x * 3 + y, z * 5, seed)); };
  const parts = [{ n: 'torso', pv: [0, 0, L], boxes: [[-bl / 2, -bw / 2, L, bl / 2, bw / 2, L + bh, fur, { r: Math.min(bw, bh) * 0.48 }]] }];
  const legs = [['legFL', bl / 2 - A.legW - 1, 1], ['legFR', bl / 2 - A.legW - 1, -1], ['legBL', -bl / 2 + 1, 1], ['legBR', -bl / 2 + 1, -1]];
  for (const [n, x, s] of legs) { const y0 = s > 0 ? bw / 2 - A.legW : -bw / 2; parts.push({ n, parent: 'torso', pv: [x + A.legW / 2, y0 + A.legW / 2, L + 1], boxes: [[x, y0, 0, x + A.legW, y0 + A.legW, L + 1, (xx, yy, z) => z < 2 ? A.dark : jit(A.col, 10, H(xx, yy, z))]] }); }
  const hx = bl / 2 - 1, [hl, hw, hh] = A.head, nz = L + bh - 2 + A.neck;
  const headFn = (x, y, z, f) => { if (f === '+x' && x === hx + hl - 1 && z === nz + 1) return [30, 24, 22]; if (f === '+x' && x >= hx + hl - 2 && z <= nz + 1 && kind !== 'bear') return A.dark; if (z === nz + hh - 2 && (y === hw / 2 - 1 || y === -hw / 2) && x === hx + hl - 3) return kind === 'wolf' ? [230, 200, 60] : [20, 16, 14]; return jit(A.col, 10, H(x, y * 3, z)); };
  const headBoxes = [[hx, -hw / 2, nz, hx + hl, hw / 2, nz + hh, headFn]];
  if (A.neck > 2) headBoxes.push([hx - 2, -2, L + bh - 2, hx + 1, 2, nz + 1, (x, y, z) => jit(A.col, 10, H(x, y, z))]);
  if (kind === 'deer') { headBoxes.push([hx + 1, -3, nz + hh, hx + 2, -2, nz + hh + 5, [200, 180, 140]], [hx + 1, 2, nz + hh, hx + 2, 3, nz + hh + 5, [200, 180, 140]], [hx, -4, nz + hh + 3, hx + 1, -3, nz + hh + 4, [200, 180, 140]], [hx, 3, nz + hh + 3, hx + 1, 4, nz + hh + 4, [200, 180, 140]]); }
  if (kind === 'dog') { headBoxes.push([hx, -3, nz + 1, hx + 2, -2, nz + hh, A.dark], [hx, 2, nz + 1, hx + 2, 3, nz + hh, A.dark], [hx - 1, -3, L + bh - 2, hx, 3, L + bh, [200, 40, 34]]); }
  if (kind === 'wolf') { headBoxes.push([hx + 1, -2, nz + hh, hx + 2, -1, nz + hh + 2, A.dark], [hx + 1, 1, nz + hh, hx + 2, 2, nz + hh + 2, A.dark]); }
  if (kind === 'bear') { headBoxes.push([hx + 1, -4, nz + hh, hx + 3, -2, nz + hh + 2, A.dark], [hx + 1, 2, nz + hh, hx + 3, 4, nz + hh + 2, A.dark]); }
  parts.push({ n: 'head', parent: 'torso', pv: [hx, 0, nz], boxes: headBoxes });
  const tail = kind === 'deer' ? [[-bl / 2 - 1, -1, L + bh - 3, -bl / 2, 1, L + bh, [240, 236, 226]]] : kind === 'wolf' ? [[-bl / 2 - 6, -1, L + bh - 4, -bl / 2, 1, L + bh - 2, (x, y, z) => x < -bl / 2 - 4 ? [210, 206, 200] : A.col]] : kind === 'dog' ? [[-bl / 2 - 2, -1, L + bh - 1, -bl / 2, 1, L + bh + 4, A.col]] : [];
  if (tail.length) parts.push({ n: 'tail', parent: 'torso', pv: [-bl / 2, 0, L + bh - 2], boxes: tail });
  const k = kind === 'bear' ? 1.4 : 1;
  return { parts, W: Math.round(52 * k), H: Math.round(40 * k), AX: Math.round(26 * k), AY: Math.round(30 * k), cfg: { kind }, zT: L + bh, round: 2.6 };
};
M.animalSet = (kind, seed) => {
  const model = M.animal(kind, seed);
  const set = new V.Set((anim, f, d) => {
    const ph = f / 8 * Math.PI * 2, run = anim === 'run' ? 1.4 : 1;
    const a = anim === 'walk' || anim === 'run' ? 0.5 * run : 0;
    const P = { legFL: { ry: Math.sin(ph) * a }, legBR: { ry: Math.sin(ph) * a }, legFR: { ry: -Math.sin(ph) * a }, legBL: { ry: -Math.sin(ph) * a }, torso: { dz: anim === 'run' ? Math.abs(Math.sin(ph)) * 1 : 0 }, tail: { rz: Math.sin(ph * 2) * 0.3 } };
    if (anim === 'idle') P.head = { ry: f ? 0.5 : 0 };
    if (anim === 'attack') { P.head = { ry: 0.3 - f * 0.4 }; P.torso.ry = -0.1 * f; P.legFL.ry = -0.6; P.legFR.ry = -0.6; }
    if (anim === 'dead') P._root = { rx: Math.PI / 2, pv: [0, 0, 0], dz: model.cfg.kind === 'bear' ? 6 : 3 };
    return V.render(model, P, V.dirAngle(d, 8));
  });
  set.model = model; set.frames = { idle: 2, walk: 8, run: 8, attack: 2, dead: 1 };
  return set;
};

// ---------------------------------------------------------------
//  VEHICLES  (vs = 2 world voxel units per voxel). Forward +x.
// ---------------------------------------------------------------
M.VEHICLE_SHAPES = {
  sedan:  { len: 30, wid: 14, body: 6, cabin: 5, cabX: [-8, 7], hood: 9, wheelR: 3, paint: [150, 60, 40] },
  hatch:  { len: 26, wid: 13, body: 6, cabin: 6, cabX: [-11, 6], hood: 7, wheelR: 3, paint: [70, 110, 150] },
  pickup: { len: 34, wid: 15, body: 7, cabin: 6, cabX: [-1, 9], hood: 9, wheelR: 4, bed: true, paint: [160, 140, 60] },
  police: { len: 30, wid: 14, body: 6, cabin: 5, cabX: [-8, 7], hood: 9, wheelR: 3, paint: [34, 36, 42], police: true },
  uaz:    { len: 30, wid: 15, body: 8, cabin: 7, cabX: [-12, 6], hood: 7, wheelR: 4, paint: [86, 98, 58], boxy: true },
  buggy:  { len: 24, wid: 15, body: 3, cabin: 0, cabX: [-6, 6], hood: 6, wheelR: 4, roll: true, paint: [180, 110, 40] },
  snowmobile: { len: 22, wid: 9, body: 4, cabin: 0, cabX: [-4, 4], hood: 6, wheelR: 0, skis: true, paint: [200, 40, 40] },
};
M.vehicle = (kind, paint, state = 0, seed = 1) => {
  const S = M.VEHICLE_SHAPES[kind];
  const pc = paint || S.paint;
  const L = S.len, Wd = S.wid, hl = L / 2, hw = Wd / 2;
  const z0 = S.wheelR ? Math.max(2, S.wheelR - 1) : 2;
  const burnt = state === 2, dmg = state >= 1;
  const paintFn = (base) => (x, y, z, f) => {
    let c = base;
    if (burnt) { const n = TZ.noise2(x * 0.45, y * 0.45 + z * 0.7, seed); c = n > 0.62 ? [58, 48, 42] : n > 0.38 ? [124, 70, 40] : [150, 92, 52]; if (f === '+z' && H(x, y, seed + 3) < 0.35) c = [112, 106, 98]; if (z === z0 && f !== '+z') c = [40, 34, 30]; return jit(c, 14, H(x, y + z, seed)); }
    if (S.police && z >= z0 + 2 && z <= z0 + 3 && (f === '+y' || f === '-y')) c = [230, 230, 230];
    if (S.police && f === '+z' && Math.abs(x) < 4) c = [230, 230, 230];
    if (kind === 'buggy' && f === '+z' && (x + y) % 6 === 0) c = sh(base, -0.2);
    if (z === z0 && f !== '+z') c = [38, 38, 40]; // bumper/sill
    if (f === '+x' && x === hl - 1 && z === z0 + 2 && Math.abs(y) > hw - 4) c = [250, 240, 200]; // headlights
    if (f === '-x' && x === -hl && z === z0 + 2 && Math.abs(y) > hw - 4) c = [200, 30, 30]; // tail lights
    const n = TZ.noise2(x * 0.3 + seed, y * 0.4 + z * 0.3, 7);
    if (dmg && n > 0.62) c = TZ.mix(c, [116, 64, 36], 0.75);
    if (dmg && H(x, y * 3 + z, seed) < 0.05) c = sh(c, -0.35);
    return jit(c, 8, H(x * 3 + y, z, seed));
  };
  const parts = [];
  const body = [[-hl, -hw, z0, hl, hw, z0 + S.body, paintFn(pc)]];
  if (S.cabin) {
    const glass = (x, y, z, f) => {
      if (burnt) return H(x, y, z) < 0.4 ? null : [30, 26, 24];
      const edge = z === z0 + S.body + S.cabin - 1;
      if (edge || f === '+z') return paintFn(sh(pc, 0.06))(x, y, z, '+z');
      if (z === z0 + S.body) return paintFn(pc)(x, y, z, f);
      if ((f === '+y' || f === '-y') && (x === S.cabX[0] || x === S.cabX[1] - 1 || x === Math.round((S.cabX[0] + S.cabX[1]) / 2))) return paintFn(pc)(x, y, z, f);
      if (dmg && H(x, y + z, seed) < 0.3) return [150, 170, 180];
      return (x + z) % 5 === 0 ? [120, 140, 160] : [44, 54, 66];
    };
    body.push([S.cabX[0], -hw + 1, z0 + S.body, S.cabX[1], hw - 1, z0 + S.body + S.cabin, glass]);
  }
  if (S.bed) body.push([-hl, -hw, z0 + S.body, S.cabX[0], -hw + 1, z0 + S.body + 2, paintFn(pc)], [-hl, hw - 1, z0 + S.body, S.cabX[0], hw, z0 + S.body + 2, paintFn(pc)], [-hl, -hw, z0 + S.body, -hl + 1, hw, z0 + S.body + 2, paintFn(pc)]);
  if (S.roll) { const rc = burnt ? [40, 36, 34] : [60, 62, 66]; body.push([-6, -hw + 1, z0 + S.body, -5, -hw + 2, z0 + S.body + 8, rc], [-6, hw - 2, z0 + S.body, -5, hw - 1, z0 + S.body + 8, rc], [-6, -hw + 1, z0 + S.body + 8, 5, hw - 1, z0 + S.body + 9, rc], [4, -hw + 1, z0 + S.body, 5, -hw + 2, z0 + S.body + 8, rc], [4, hw - 2, z0 + S.body, 5, hw - 1, z0 + S.body + 8, rc], [-3, -2, z0 + S.body, 0, 2, z0 + S.body + 3, [40, 40, 40]]); }
  if (S.skis) { body.push([-hl + 2, -hw - 2, 0, hl + 2, -hw, 1, [60, 60, 66]], [-hl + 2, hw, 0, hl + 2, hw + 2, 1, [60, 60, 66]], [-2, -2, z0 + S.body, 3, 2, z0 + S.body + 2, [30, 30, 30]], [hl - 5, -3, z0 + S.body, hl - 3, 3, z0 + S.body + 4, [120, 160, 190]]); }
  if (S.police && !burnt) { body.push([-1, -3, z0 + S.body + S.cabin, 1, 0, z0 + S.body + S.cabin + 1, [220, 30, 30]], [-1, 0, z0 + S.body + S.cabin, 1, 3, z0 + S.body + S.cabin + 1, [40, 70, 230]]); }
  if (kind === 'uaz' && !burnt) body.push([-hl - 1, -3, z0 + 2, -hl, 3, z0 + 7, [50, 52, 48]]); // spare wheel
  parts.push({ n: 'body', boxes: body });
  if (S.wheelR) {
    const wr = S.wheelR, wx = hl - wr - 2;
    const wheel = (n, x, y) => parts.push({ n, pv: [x, y, wr], boxes: [[x - wr, y, 0, x + wr, y + 2, wr * 2, (xx, yy, z) => { const dx = xx + 0.5 - x, dz = z + 0.5 - wr; const r = Math.hypot(dx, dz); if (r > wr) return null; if (state === 2) return [30, 28, 26]; return r < wr * 0.45 ? [120, 120, 126] : [24, 24, 26]; }]] });
    wheel('wFL', wx, hw - 1); wheel('wFR', wx, -hw - 1); wheel('wBL', -wx, hw - 1); wheel('wBR', -wx, -hw - 1);
  }
  return { parts, vs: 2, W: 120, H: 84, AX: 60, AY: 52, kind, round: 1.5, spec: 0.8 };
};
// vehicles: 16 directions, states 0 ok, 1 damaged, 2 burnt. steer frames for front wheels.
M.vehicleSet = (kind, paint, seed) => {
  const models = [0, 1, 2].map(s => M.vehicle(kind, paint, s, seed));
  const set = new V.Set((state, steer, d) => {
    const P = {}; if (steer) { P.wFL = { rz: steer * 0.4 }; P.wFR = { rz: steer * 0.4 }; }
    return V.render(models[state], P, V.dirAngle(d, 16), { crease: 1.2 });
  }, 16);
  return set;
};

// ---------------------------------------------------------------
//  GATES (world aligned).  axis 0: along x, 1: along y. open 0..4
// ---------------------------------------------------------------
M.gate = (type, axis, open) => {
  const T = {
    wood: { post: [92, 66, 42], leaf: [128, 90, 56], band: [70, 70, 76], h: 15 },
    metal: { post: [96, 100, 106], leaf: [118, 124, 130], band: [70, 74, 80], h: 17 },
    code: { post: [80, 84, 90], leaf: [100, 108, 116], band: [190, 150, 40], h: 17, keypad: true },
    door: { post: [150, 74, 56], leaf: [132, 88, 52], band: [196, 160, 80], h: 20, single: true },
    door_code: { post: [150, 74, 56], leaf: [92, 98, 106], band: [190, 150, 40], h: 20, single: true, keypad: true },
  }[type];
  const L = 16, h = T.h, C = 8;
  // helper: box in (along, across, z) space -> world-aligned voxel box
  const box = (a0, c0, z0, a1, c1, z1, col) => axis ? [c0, a0, z0, c1, a1, z1, col] : [a0, c0, z0, a1, c1, z1, col];
  const fnA = (fn) => fn && typeof fn === 'function' ? (x, y, z, f) => axis ? fn(y, x, z, f) : fn(x, y, z, f) : fn;
  const leafFn = (a, c, z) => { let col = T.leaf; if (type === 'wood') { if ((a % 4) === 0) col = sh(col, -0.3); if (z === 3 || z === h - 4) col = T.band; } else { if (z % 4 === 0) col = sh(col, -0.18); if (a % 7 === 0) col = T.band; } return jit(col, 10, H(a, c * 3 + z, 5)); };
  const postFn = (key) => (a, c, z) => { if (key && T.keypad && z >= 7 && z <= 10 && c === C - 2) return z === 9 ? (open > 0 ? [60, 230, 90] : [230, 60, 40]) : [30, 30, 34]; return z >= h + 2 ? sh(T.post, 0.15) : jit(T.post, 8, H(a, c, z)); };
  const ang = open / 4 * Math.PI * 0.5 * (axis ? -1 : 1);
  const parts = [
    { n: 'p0', boxes: [box(-1, C - 2, 0, 2, C + 2, h + 3, fnA(postFn(false)))] },
    { n: 'p1', boxes: [box(L - 2, C - 2, 0, L + 1, C + 2, h + 3, fnA(postFn(true)))] },
    { n: 'l0', pv: axis ? [C, 1.5, 0] : [1.5, C, 0], boxes: [box(2, C - 1, 1, 8, C + 1, h, fnA(leafFn))] },
    { n: 'l1', pv: axis ? [C, L - 1.5, 0] : [L - 1.5, C, 0], boxes: [box(8, C - 1, 1, L - 2, C + 1, h, fnA(leafFn))] },
  ];
  if (T.single) { // a house door: brick jambs, lintel and one leaf hinged on the left
    const dl = (a, c, z) => { let col = T.leaf; if (type === 'door') { if (Math.abs(a - 8) > 4.2 || z === 3 || z === 10 || z === h - 3) col = sh(col, -0.22); if (a === 12 && z === 9) col = T.band; } else { if (a % 5 === 0 || z % 6 === 0) col = sh(col, -0.15); } return jit(col, 8, H(a, c * 3 + z, 9)); };
    const jamb = (key) => (a, c, z) => { if (key && T.keypad && z >= 9 && z <= 12 && c === C + 2) return z === 11 ? (open > 0 ? [60, 230, 90] : [230, 60, 40]) : [30, 30, 34]; return jit((z + (a & 1)) % 3 === 0 ? [188, 180, 168] : T.post, 10, H(a, c, z)); };
    parts.length = 0;
    parts.push({ n: 'p0', boxes: [box(-0.5, C - 2.5, 0, 2.5, C + 2.5, h + 3, fnA(jamb(false)))] }, { n: 'p1', boxes: [box(L - 2.5, C - 2.5, 0, L + 0.5, C + 2.5, h + 3, fnA(jamb(true)))] });
    parts.push({ n: 'top', boxes: [box(2.5, C - 2.5, h, L - 2.5, C + 2.5, h + 3, fnA(jamb(false)))] });
    parts.push({ n: 'l0', pv: axis ? [C, 2.5, 0] : [2.5, C, 0], boxes: [box(2.5, C - 0.8, 0.5, L - 2.5, C + 0.8, h, fnA(dl))] });
    const model = { parts, vs: 1.389, W: 64, H: 64, AX: 32, AY: 42, round: 0.4 };
    return V.render(model, { l0: { rz: ang * 1.6 } }, 0, { crease: 1.3 });
  }
  const pose = { l0: { rz: ang }, l1: { rz: -ang } };
  const model = { parts, vs: 1.389, W: 64, H: 60, AX: 32, AY: 38, round: 0.5 };
  return V.render(model, pose, 0, { crease: 1.3 });
};
})();
