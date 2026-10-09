// =====================================================================
//  THE ZOMBIES — procedural pixel art: characters, weapons, icons
// =====================================================================
'use strict';
(() => {
const PB = TZ.PixelBuf, H = TZ.hash, sh = TZ.shade;
const jit = (c, a, n) => c.map(v => clamp(v + (n - 0.5) * a, 0, 255));

const BUILDS = {
  normal:  { headW: 6, headH: 6, torsoW: 7, torsoH: 7, legH: 6, legW: 3, armW: 2, armH: 7, W: 26, H: 30 },
  thin:    { headW: 5, headH: 6, torsoW: 6, torsoH: 7, legH: 7, legW: 2, armW: 2, armH: 8, W: 26, H: 30 },
  big:     { headW: 7, headH: 6, torsoW: 12, torsoH: 9, legH: 7, legW: 4, armW: 4, armH: 10, W: 36, H: 38 },
  bloated: { headW: 6, headH: 6, torsoW: 10, torsoH: 8, legH: 6, legW: 3, armW: 2, armH: 7, W: 30, H: 32 },
};

// draws one frame of a humanoid. dir: 'front' | 'back'. anim: idle|walk|attack. f: frame index
function drawHuman(cfg, dir, anim, f) {
  const B = BUILDS[cfg.build || 'normal'];
  const b = new PB(B.W, B.H);
  const cx = Math.floor(B.W / 2) - 1, footY = B.H - 2;
  const seed = cfg.seed || 1;
  // animation offsets
  let bob = 0, lL = 0, lR = 0, liftL = 0, liftR = 0, armSwing = 0, lean = 0, armRaise = 0;
  if (anim === 'walk') {
    const p = f % 4;
    if (p === 0) { lL = -1; lR = 1; liftR = 1; armSwing = 1; }
    if (p === 1) { bob = -1; }
    if (p === 2) { lL = 1; lR = -1; liftL = 1; armSwing = -1; }
    if (p === 3) { bob = -1; }
    if (cfg.zombie) lean = 1;
  } else if (anim === 'idle') { bob = f % 2 ? 0 : 0; armSwing = 0; if (f % 2) armRaise = cfg.zombie ? 1 : 0; }
  else if (anim === 'attack') { lean = f ? 2 : 1; armRaise = f ? 3 : 1; bob = f ? -1 : 0; }

  const legTop = footY - 1 - B.legH + bob;
  const torsoTop = legTop - B.torsoH;
  const headTop = torsoTop - B.headH + 1;
  const tx = cx - Math.floor(B.torsoW / 2), tw = B.torsoW;
  const hx = cx - Math.floor(B.headW / 2) + (dir === 'front' ? lean : 0) + (dir === 'front' ? 1 : 0), hw = B.headW;
  const skin = cfg.skin, shirt = cfg.shirt, pants = cfg.pants, shoes = cfg.shoes || [52, 40, 32];
  const front = dir === 'front';

  const blood = (x, y, base) => {
    if (!cfg.blood) return base;
    const n = H(x, y, seed + 31);
    if (n < cfg.blood * 0.35) return jit([120, 20, 16], 20, H(x, y, seed));
    return base;
  };
  const torn = (x, y, base) => { if (cfg.torn && H(x, y, seed + 7) < cfg.torn * 0.25) return sh(skin, -0.1); return base; };

  // ---- legs ----
  const leg = (lx, lift, col) => {
    for (let y = 0; y < B.legH - lift; y++) for (let x = 0; x < B.legW; x++) {
      let c = x === 0 ? sh(col, 0.08) : x === B.legW - 1 ? sh(col, -0.18) : col;
      if (cfg.torn && y > B.legH - 4 && H(lx + x, y, seed) < 0.2) c = sh(skin, -0.15);
      b.set(lx + x, legTop + y, blood(lx + x, legTop + y, c));
    }
    // shoes
    for (let x = 0; x < B.legW + (front ? 1 : 0); x++) for (let y = 0; y < 2; y++) b.set(lx + x, footY - 1 + y - lift, y === 0 ? sh(shoes, 0.12) : shoes);
  };
  const lxL = cx - B.legW + lL + (B.build === 'big' ? 0 : 0), lxR = cx + lR + (cfg.build === 'big' ? 1 : 0);
  if (!cfg.crawl) { leg(lxL, liftL, sh(pants, -0.08)); leg(lxR, liftR, pants); }

  // ---- arms ----
  const armCol = cfg.sleeves === false ? skin : shirt;
  const drawSideArm = (ax, ay, len, col, far) => {
    for (let y = 0; y < len; y++) for (let x = 0; x < B.armW; x++) {
      let c = y >= len - 2 ? (far ? sh(skin, -0.15) : skin) : (far ? sh(col, -0.2) : x === 0 ? sh(col, 0.1) : col);
      b.set(ax + x, ay + y, torn(ax + x, ay + y, blood(ax + x, ay + y, c)));
    }
  };
  const drawReachArm = (sx, sy, len, col, far) => { // horizontal arm pointing right
    for (let x = 0; x < len; x++) for (let y = 0; y < B.armW; y++) {
      let c = x >= len - 2 ? (far ? sh(skin, -0.15) : skin) : (far ? sh(col, -0.25) : y === 0 ? sh(col, 0.1) : col);
      b.set(sx + x, sy + y + (x > len - 3 && y === B.armW - 1 ? 0 : 0), torn(sx + x, sy + y, blood(sx + x, sy + y, c)));
    }
    if (!far) b.set(sx + len - 1, sy + B.armW, sh(skin, -0.2)); // fingers
  };
  const reach = cfg.zombie && !cfg.armsDown;
  const armLen = cfg.build === 'big' ? 8 : 6;
  // far arm (behind body)
  if (cfg.hideArms) { /* arms drawn with weapon */ }
  else if (reach && front) drawReachArm(tx + tw - 2 + lean, torsoTop + 1 - armRaise + (armSwing > 0 ? 1 : 0), armLen, armCol, true);
  else if (reach && !front) drawReachArm(tx + tw - 2, torsoTop + 1 - armRaise, armLen - 2, armCol, true);
  else drawSideArm(tx - B.armW + 1, torsoTop + 1 + armSwing, B.armH, armCol, true);

  // ---- torso ----
  for (let y = 0; y < B.torsoH; y++) for (let x = 0; x < tw; x++) {
    let c = x < 1 ? sh(shirt, 0.14) : x >= tw - 2 ? sh(shirt, -0.2) : shirt;
    if (y === 0 && x > 1 && x < tw - 2 && front) c = sh(shirt, -0.25); // collar
    if (cfg.shirt2 && front && Math.abs(x - tw / 2 + 0.5) < 0.6) c = cfg.shirt2;          // zipper/open jacket
    if (cfg.vest && y > 0 && y < B.torsoH - 1 && x > 0 && x < tw - 1) { c = x % 3 === 1 && y > 2 && front ? sh(cfg.vest, -0.25) : cfg.vest; if (x < 2) c = sh(c, 0.12); }
    if (y === B.torsoH - 1) c = cfg.belt || sh(pants, -0.3); // belt
    if (cfg.bloated && y > 2 && front && x > 1) c = TZ.mix(c, [130, 150, 80], 0.5);
    c = blood(tx + x, torsoTop + y, torn(tx + x, torsoTop + y, c));
    b.set(tx + x + (front ? 0 : 0), torsoTop + y, c);
  }
  if (cfg.cross && front) { const mx = tx + 2, my = torsoTop + 2; b.set(mx + 1, my, [200, 30, 30]); b.set(mx, my + 1, [200, 30, 30]); b.set(mx + 1, my + 1, [200, 30, 30]); b.set(mx + 2, my + 1, [200, 30, 30]); b.set(mx + 1, my + 2, [200, 30, 30]); }
  // backpack
  if (cfg.backpack) {
    if (!front) { for (let y = 1; y < B.torsoH; y++) for (let x = 1; x < tw - 1; x++) { let c = x < 2 ? sh(cfg.backpack, 0.12) : x > tw - 3 ? sh(cfg.backpack, -0.2) : cfg.backpack; if (y === 4) c = sh(cfg.backpack, -0.3); b.set(tx + x, torsoTop + y - 1, c); } b.rect(tx + 2, torsoTop - 2, tw - 4, 1, sh(cfg.backpack, 0.15)); }
    else { b.set(tx + 1, torsoTop + 1, sh(cfg.backpack, -0.25)); b.set(tx + 1, torsoTop + 2, sh(cfg.backpack, -0.25)); b.set(tx + tw - 2, torsoTop + 1, sh(cfg.backpack, -0.25)); b.set(tx + tw - 2, torsoTop + 2, sh(cfg.backpack, -0.25)); b.rect(tx - 1, torsoTop + 1, 1, 5, sh(cfg.backpack, -0.1)); }
  }
  // near arm
  if (cfg.hideArms) {
    // shoulder stubs
    b.rect(tx - 1, torsoTop + 1, 2, 3, sh(armCol, front ? 0 : -0.15)); b.rect(tx + tw - 1, torsoTop + 1, 2, 3, sh(armCol, -0.1));
  } else if (reach && front) drawReachArm(tx + tw - 4 + lean, torsoTop + 2 - armRaise + (armSwing < 0 ? 1 : 0), armLen + 1, armCol, false);
  else if (reach && !front) drawReachArm(tx + tw - 3, torsoTop + 2 - armRaise, armLen - 1, armCol, false);
  else drawSideArm(tx + tw - 1, torsoTop + 1 - armSwing, B.armH, armCol, false);

  // ---- head ----
  const hairC = cfg.hair, hs = cfg.hairStyle || 'short';
  for (let y = 0; y < B.headH; y++) for (let x = 0; x < hw; x++) {
    if ((y === 0 || y === B.headH - 1) && (x === 0 || x === hw - 1)) continue; // round corners
    let c = x === 0 ? sh(skin, 0.06) : x === hw - 1 ? sh(skin, -0.16) : skin;
    if (y === B.headH - 1) c = sh(c, -0.12);
    if (cfg.zombie && H(x, y, seed + 3) < 0.12) c = sh(skin, -0.25); // rot spots
    b.set(hx + x, headTop + y, c);
  }
  // face
  if (front) {
    const ey = headTop + 3;
    const eyeC = cfg.zombie ? (cfg.eyes || [230, 50, 34]) : [26, 20, 18];
    b.set(hx + hw - 4, ey, eyeC); b.set(hx + hw - 2, ey, eyeC);
    if (!cfg.zombie) { b.set(hx + hw - 4, ey - 1, sh(hairC, -0.1)); b.set(hx + hw - 2, ey - 1, sh(hairC, -0.1)); }
    b.set(hx + hw - 1, ey + 1, sh(skin, -0.25)); // nose shadow
    if (cfg.zombie) { b.set(hx + hw - 3, ey + 2, [70, 14, 12]); b.set(hx + hw - 2, ey + 2, [110, 20, 16]); if (cfg.blood) b.set(hx + hw - 3, ey + 3, [130, 20, 16]); }
    else if (cfg.beard) { b.rect(hx + 1, ey + 1, hw - 1, 2, cfg.beard); b.set(hx + hw - 3, ey + 1, sh(skin, -0.3)); }
    b.set(hx + 1, ey, sh(skin, -0.2)); // ear
  }
  // hair / headwear
  const setH = (x, y, c) => b.set(hx + x, headTop + y, c);
  const hairAt = (x, y) => setH(x, y, jit(x < 2 ? sh(hairC, 0.1) : hairC, 10, H(x, y, seed)));
  if (hs !== 'bald') {
    if (front) {
      for (let x = 0; x < hw; x++) { if (x > 0 && x < hw - 1) hairAt(x, -1); hairAt(x, 0); if (x < hw - 2) hairAt(x, 1); }
      for (let y = 2; y < (hs === 'long' ? B.headH + 4 : 4); y++) { hairAt(0, y); if (hs === 'long' && y > 1) hairAt(1, y); }
      if (hs === 'patchy') for (let x = 0; x < hw; x++) if (H(x, 9, seed) < 0.5) setH(x, 0, sh(skin, -0.1));
    } else {
      for (let y = -1; y < B.headH - 1; y++) for (let x = 0; x < hw; x++) { if (y === -1 && (x === 0 || x === hw - 1)) continue; if (hs === 'patchy' && H(x, y, seed) < 0.4) continue; hairAt(x, y); }
      if (hs === 'long') for (let y = B.headH - 1; y < B.headH + 4; y++) for (let x = 1; x < hw - 1; x++) hairAt(x, y);
      if (hs === 'ponytail') { setH(hw / 2 | 0, B.headH, hairC); setH(hw / 2 | 0, B.headH + 1, hairC); setH(hw / 2 | 0, B.headH + 2, sh(hairC, -0.1)); }
    }
  }
  if (cfg.hat) {
    const hc = cfg.hatColor || [70, 80, 50];
    if (cfg.hat === 'cap') { for (let x = 0; x < hw; x++) { setH(x, -1, sh(hc, 0.1)); setH(x, 0, hc); setH(x, 1, x === 0 ? hc : (front ? hc : hc)); } if (front) { setH(hw, 1, sh(hc, -0.25)); setH(hw + 1, 1, sh(hc, -0.25)); } }
    if (cfg.hat === 'beanie') { for (let x = -1; x <= hw; x++) { if (x > 0 && x < hw - 1) setH(x, -2, sh(hc, 0.1)); setH(x, -1, hc); setH(x, 0, hc); setH(x, 1, sh(hc, -0.2)); } }
    if (cfg.hat === 'helmet') { for (let x = -1; x <= hw; x++) { if (x > -1 && x < hw) setH(x, -2, sh(hc, 0.15)); setH(x, -1, hc); setH(x, 0, hc); setH(x, 1, sh(hc, -0.25)); } }
    if (cfg.hat === 'band') { for (let x = 0; x < hw; x++) setH(x, 1, hc); if (!front) { setH(0, 2, hc); setH(-1, 3, hc); } }
  }
  return b;
}

function makeCrawler(cfg, f) {
  const b = new PB(28, 16); const seed = cfg.seed;
  const y0 = 11, bob = f % 2;
  // torso lying, head right
  for (let x = 0; x < 11; x++) for (let y = 0; y < 4; y++) { let c = y === 0 ? sh(cfg.shirt, 0.1) : y === 3 ? sh(cfg.shirt, -0.25) : cfg.shirt; if (H(x, y, seed) < 0.15) c = [120, 20, 16]; b.set(6 + x, y0 + y - 1, c); }
  // stump legs
  b.rect(2, y0, 4, 3, cfg.pants); b.rect(1, y0 + 1, 2, 2, [120, 20, 16]);
  // head
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) { if ((x === 0 || x === 4) && (y === 0 || y === 4)) continue; b.set(17 + x, y0 - 3 + y, x === 4 ? sh(cfg.skin, -0.15) : cfg.skin); }
  b.rect(17, y0 - 3, 3, 2, cfg.hair); b.set(20, y0 - 1, [230, 50, 34]); b.set(21, y0 - 1, [230, 50, 34]); b.set(21, y0 + 1, [90, 14, 12]);
  // arms reaching
  const a = bob ? 1 : 0;
  for (let x = 0; x < 6; x++) { b.set(15 + x + a, y0 + 2, x > 3 ? cfg.skin : cfg.shirt); b.set(14 + x - a, y0 + 3, x > 3 ? sh(cfg.skin, -0.15) : sh(cfg.shirt, -0.2)); }
  return b;
}

const scaleCanvas = (c, s) => { const o = TZ.canvas(c.width * s, c.height * s); o.g.imageSmoothingEnabled = false; o.g.drawImage(c, 0, 0, o.width, o.height); return o; };

// builds a complete sprite set from a cfg
TZ.art.makeCharacter = (cfg) => {
  const B = BUILDS[cfg.build || 'normal'];
  const scale = cfg.scale2 ? 2 : 1;
  const out = { front: {}, back: {}, ax: (Math.floor(B.W / 2) - 1) * scale, ay: (B.H - 1) * scale };
  const fin = (buf) => { let c = buf.canvas(true, [14, 10, 10]); if (scale > 1) c = scaleCanvas(c, scale); return c; };
  if (cfg.crawl) {
    const fr = [0, 1, 2, 3].map(f => fin(makeCrawler(cfg, f)));
    out.ax = 13 * scale; out.ay = 14 * scale;
    for (const d of ['front', 'back']) { out[d].idle = [fr[0], fr[1]]; out[d].walk = fr; out[d].attack = [fr[1], fr[2]]; }
  } else {
    for (const d of ['front', 'back']) {
      out[d].idle = [0, 1].map(f => fin(drawHuman(cfg, d, 'idle', f)));
      out[d].walk = [0, 1, 2, 3].map(f => fin(drawHuman(cfg, d, 'walk', f)));
      out[d].attack = [0, 1].map(f => fin(drawHuman(cfg, d, 'attack', f)));
    }
  }
  // mirrored sets
  for (const d of ['front', 'back']) {
    out[d + 'L'] = {};
    for (const a in out[d]) out[d + 'L'][a] = out[d][a].map(c => TZ.flipH(c));
  }
  // corpse: rotate idle front 90deg
  const src = out.front.idle[0];
  const dead = TZ.canvas(src.height, src.width);
  dead.g.translate(dead.width / 2, dead.height / 2); dead.g.rotate(-Math.PI / 2); dead.g.drawImage(src, -src.width / 2, -src.height / 2);
  out.dead = dead; out.deadAx = dead.width / 2; out.deadAy = dead.height * 0.62;
  out.white = new Map();
  return out;
};
TZ.art.flash = (spr, c) => { let w = spr.white.get(c); if (!w) { w = TZ.tint(c, 'rgba(255,255,255,0.85)'); spr.white.set(c, w); } return w; };

// ---------- character catalog ----------
TZ.art.chars = {};
TZ.art.buildCharacters = () => {
  const C = TZ.art.chars, R = TZ.RNG(1337);
  C.player = TZ.art.makeCharacter({ seed: 3, skin: [220, 172, 136], hair: [70, 48, 32], hairStyle: 'short', shirt: [84, 98, 58], shirt2: [60, 70, 42], pants: [64, 66, 56], shoes: [60, 44, 32], backpack: [112, 94, 60], hat: 'cap', hatColor: [62, 74, 46], vest: null, hideArms: true, belt: [60, 44, 30] });
  const zSkins = [[132, 146, 112], [146, 150, 124], [118, 132, 104], [160, 150, 134], [124, 120, 108]];
  const zShirts = [[128, 64, 52], [74, 84, 116], [156, 146, 124], [94, 104, 74], [62, 62, 66], [180, 176, 160], [60, 90, 120], [200, 110, 40], [110, 60, 90]];
  const zPants = [[62, 72, 98], [84, 70, 52], [70, 70, 74], [50, 56, 70], [100, 92, 76]];
  const zHair = [[60, 44, 32], [30, 26, 24], [120, 100, 70], [140, 140, 136], [90, 50, 30]];
  C.walker = []; C.runner = []; C.brute = []; C.spitter = []; C.crawler = []; C.boss = [];
  for (let i = 0; i < 10; i++) C.walker.push(TZ.art.makeCharacter({ zombie: true, seed: 100 + i, skin: R.pick(zSkins), shirt: R.pick(zShirts), pants: R.pick(zPants), hair: R.pick(zHair), hairStyle: R.pick(['short', 'long', 'patchy', 'bald', 'short']), blood: 0.4 + R() * 0.6, torn: 0.6 + R() * 0.6, hat: R.chance(0.15) ? 'cap' : null, hatColor: R.pick(zShirts), vest: R.chance(0.12) ? [210, 120, 40] : null, shirt2: R.chance(0.3) ? R.pick(zShirts) : null }));
  for (let i = 0; i < 5; i++) C.runner.push(TZ.art.makeCharacter({ zombie: true, build: 'thin', seed: 200 + i, skin: R.pick(zSkins), shirt: R.pick(zShirts), pants: R.pick(zPants), hair: R.pick(zHair), hairStyle: R.pick(['long', 'patchy', 'short']), blood: 0.8, torn: 1, eyes: [255, 90, 40] }));
  for (let i = 0; i < 3; i++) C.brute.push(TZ.art.makeCharacter({ zombie: true, build: 'big', seed: 300 + i, skin: R.pick([[120, 130, 104], [140, 136, 120]]), shirt: R.pick([[70, 70, 74], [96, 84, 60], [120, 60, 40]]), pants: [52, 56, 64], hair: [40, 34, 30], hairStyle: 'bald', blood: 1, torn: 1.2, sleeves: false, vest: i === 1 ? [180, 160, 60] : null }));
  for (let i = 0; i < 3; i++) C.spitter.push(TZ.art.makeCharacter({ zombie: true, build: 'bloated', seed: 400 + i, skin: [130, 150, 96], shirt: R.pick([[160, 150, 120], [110, 120, 90], [180, 180, 170]]), pants: R.pick(zPants), hair: [70, 80, 50], hairStyle: 'patchy', blood: 0.3, torn: 1, bloated: true, eyes: [200, 240, 60] }));
  for (let i = 0; i < 3; i++) C.crawler.push(TZ.art.makeCharacter({ zombie: true, crawl: true, seed: 500 + i, skin: R.pick(zSkins), shirt: R.pick(zShirts), pants: R.pick(zPants), hair: R.pick(zHair) }));
  C.boss.push(TZ.art.makeCharacter({ zombie: true, build: 'big', scale2: true, seed: 666, skin: [110, 116, 96], shirt: [80, 30, 26], pants: [40, 40, 46], hair: [30, 30, 30], hairStyle: 'bald', blood: 1.6, torn: 1.6, sleeves: false, eyes: [255, 40, 20] }));

  // survivors
  C.surv = {};
  const S = {
    'Марина':        { skin: [232, 190, 160], hair: [120, 60, 34], hairStyle: 'ponytail', shirt: [210, 210, 204], pants: [70, 80, 110], cross: true, backpack: [150, 50, 44] },
    'Дед Степан':    { skin: [210, 166, 134], hair: [190, 190, 186], hairStyle: 'short', beard: [200, 200, 196], shirt: [96, 76, 56], pants: [70, 64, 52], hat: 'beanie', hatColor: [110, 50, 40] },
    'Лёха':          { skin: [214, 170, 130], hair: [40, 30, 26], hairStyle: 'short', shirt: [70, 84, 120], vest: [220, 120, 40], pants: [60, 66, 84], hat: 'cap', hatColor: [200, 110, 40] },
    'Ника':          { skin: [226, 186, 156], hair: [30, 26, 30], hairStyle: 'long', shirt: [50, 52, 56], pants: [60, 62, 52], hat: 'band', hatColor: [180, 40, 40], vest: [70, 76, 56] },
    'Борис':         { skin: [196, 150, 116], hair: [60, 40, 28], hairStyle: 'short', beard: [70, 50, 34], shirt: [120, 40, 36], shirt2: [90, 30, 26], pants: [64, 60, 56], build: 'normal' },
    'Ася':           { skin: [240, 200, 172], hair: [214, 180, 110], hairStyle: 'long', shirt: [100, 140, 120], pants: [60, 60, 70], cross: true },
    'Сержант Котов': { skin: [206, 160, 126], hair: [50, 40, 30], hairStyle: 'short', shirt: [90, 100, 64], vest: [70, 80, 50], pants: [76, 84, 56], hat: 'helmet', hatColor: [80, 90, 58] },
  };
  for (const n in S) C.surv[n] = TZ.art.makeCharacter(Object.assign({ seed: n.length * 7, hideArms: true, shoes: [50, 40, 32] }, S[n]));
};

// ---------- weapons (horizontal, pointing right). gx,gy = grip ----------
TZ.art.weapons = {};
const W = (w, h, rects, gx, gy, hx2, hy2) => { const b = new PB(w, h); for (const [x, y, rw, rh, c] of rects) b.rect(x, y, rw, rh, c); const c = b.canvas(true, [14, 12, 12]); return { c, gx, gy, hx: hx2 ?? gx + 4, hy: hy2 ?? gy, len: w }; };
TZ.art.buildWeapons = () => {
  const M = [64, 66, 72], Md = [42, 44, 48], Ml = [104, 106, 114], Wd = [130, 86, 48], Wdd = [96, 62, 36], Br = [196, 160, 80];
  const A = TZ.art.weapons;
  A.pistol = W(11, 7, [[1, 1, 9, 2, M], [1, 1, 9, 1, Ml], [2, 3, 3, 3, Md], [5, 3, 2, 1, Md], [9, 1, 1, 1, Md]], 3, 4, 3, 4);
  A.ak = W(23, 8, [[1, 2, 4, 2, Wd], [1, 3, 2, 2, Wdd], [5, 1, 7, 3, M], [5, 1, 7, 1, Ml], [12, 2, 4, 2, Wd], [16, 2, 6, 1, Md], [20, 1, 1, 1, Md], [9, 4, 2, 2, Md], [10, 5, 2, 2, Md], [6, 4, 2, 2, Wdd]], 7, 4, 13, 3);
  A.shotgun = W(23, 7, [[1, 2, 5, 2, Wd], [1, 3, 3, 2, Wdd], [6, 1, 5, 3, M], [6, 1, 5, 1, Ml], [11, 1, 11, 1, Md], [11, 2, 10, 1, M], [13, 3, 5, 1, Wd], [7, 4, 2, 1, Md]], 7, 4, 15, 3);
  A.rifle = W(26, 7, [[1, 2, 6, 2, Wd], [1, 3, 3, 2, Wdd], [7, 2, 7, 2, Wd], [7, 2, 7, 1, sh(Wd, 0.15)], [14, 2, 11, 1, Md], [8, 0, 6, 1, Md], [8, 1, 1, 1, Md], [13, 1, 1, 1, Md], [9, 4, 2, 1, Md]], 8, 4, 15, 3);
  A.knife = W(12, 5, [[1, 2, 4, 2, [50, 40, 34]], [5, 1, 1, 3, Md], [6, 2, 5, 1, [200, 204, 210]], [6, 1, 4, 1, [160, 164, 170]], [10, 2, 1, 1, [230, 230, 236]]], 2, 2, 2, 2);
  A.axe = W(18, 9, [[1, 4, 13, 1, Wd], [1, 5, 13, 1, Wdd], [13, 1, 3, 7, M], [15, 1, 1, 7, [200, 204, 212]], [13, 1, 3, 1, Ml]], 3, 4, 3, 4);
  A.pickaxe = W(18, 13, [[1, 6, 13, 1, Wd], [1, 7, 13, 1, Wdd], [12, 1, 3, 11, M], [13, 0, 1, 1, Ml], [13, 12, 1, 1, Ml], [12, 1, 1, 11, Ml]], 3, 6, 3, 6);
  A.bat = W(19, 6, [[1, 2, 4, 1, [40, 34, 30]], [5, 2, 6, 2, [168, 126, 80]], [11, 1, 7, 3, [176, 134, 86]], [12, 0, 1, 1, Ml], [15, 0, 1, 1, Ml], [13, 4, 1, 1, Ml], [16, 4, 1, 1, Ml], [5, 2, 13, 1, [196, 154, 100]]], 2, 2, 2, 2);
  A.fists = null;
  A.molotov = W(8, 11, [[2, 4, 4, 6, [70, 120, 60]], [3, 4, 1, 5, [120, 170, 100]], [3, 2, 2, 2, [70, 120, 60]], [3, 0, 2, 2, [220, 210, 180]], [2, 6, 4, 2, [190, 150, 60]]], 3, 7, 3, 7);
  A.flashlight = W(10, 5, [[1, 1, 6, 3, [50, 52, 58]], [7, 0, 2, 5, [80, 82, 90]], [8, 1, 1, 3, [250, 240, 190]], [2, 1, 5, 1, [90, 92, 100]]], 2, 2, 2, 2);
};

// ---------- item icons (24x24 canvases) ----------
TZ.art.icons = {};
TZ.art.buildIcons = () => {
  const I = TZ.art.icons;
  const icon = (fn) => { const b = new PB(24, 24); fn(b); return b.canvas(true, [16, 12, 10]); };
  const fromWeapon = (w) => { const W = 48, Hh = 30, s = Math.max(1, Math.floor(Math.min(W / w.c.width, Hh / w.c.height))); const c = TZ.canvas(W, Hh); c.g.drawImage(w.c, Math.floor((W - w.c.width * s) / 2), Math.floor((Hh - w.c.height * s) / 2), w.c.width * s, w.c.height * s); return c; };
  for (const k of ['pistol', 'ak', 'shotgun', 'rifle', 'knife', 'axe', 'pickaxe', 'bat', 'molotov', 'flashlight']) I[k] = fromWeapon(TZ.art.weapons[k]);
  const bullet = (b, x, y, len, tip, case_) => { b.rect(x, y + 3, 3, len, case_); b.rect(x, y + 3, 1, len, sh(case_, 0.25)); b.rect(x, y + 1, 3, 2, tip); b.set(x + 1, y, tip); b.rect(x, y + 3 + len - 1, 3, 1, sh(case_, -0.3)); };
  I.ammo9 = icon(b => { bullet(b, 5, 7, 6, [190, 110, 60], [210, 170, 70]); bullet(b, 10, 9, 6, [190, 110, 60], [210, 170, 70]); bullet(b, 15, 7, 6, [190, 110, 60], [210, 170, 70]); });
  I.ammo12 = icon(b => { for (const [x, y] of [[5, 6], [11, 8]]) { b.rect(x, y, 5, 9, [190, 44, 40]); b.rect(x, y, 1, 9, [230, 80, 70]); b.rect(x, y + 9, 5, 3, [210, 170, 70]); b.rect(x + 1, y, 3, 1, [120, 30, 26]); } bullet(b, 17, 9, 0, [210, 170, 70], [210, 170, 70]); });
  I.ammo762 = icon(b => { for (const x of [5, 10, 15]) bullet(b, x, 3, 13, [180, 110, 60], [200, 160, 70]); });
  I.canned = icon(b => { b.rect(6, 6, 12, 13, [170, 170, 176]); b.rect(6, 9, 12, 7, [200, 70, 40]); b.rect(6, 9, 12, 1, [230, 200, 80]); b.rect(9, 11, 6, 3, [240, 220, 180]); b.rect(6, 6, 12, 2, [210, 210, 216]); b.rect(6, 6, 2, 13, [220, 220, 226]); b.rect(16, 6, 2, 13, [120, 120, 126]); });
  I.water = icon(b => { b.rect(9, 2, 6, 2, [40, 110, 200]); b.rect(10, 4, 4, 2, [150, 200, 230]); b.rect(7, 6, 10, 15, [120, 180, 230]); b.rect(7, 6, 2, 15, [200, 230, 250]); b.rect(7, 11, 10, 5, [40, 100, 190]); b.rect(15, 6, 2, 15, [80, 140, 200]); });
  I.veggie = icon(b => { b.disc(9, 13, 6, (dx, dy) => sh([214, 50, 36], -dx * 0.06 - dy * 0.06)); b.rect(8, 6, 3, 2, [70, 140, 50]); b.set(7, 10, [250, 150, 140]); for (let i = 0; i < 9; i++) b.rect(13 + (i >> 1), 6 + i, 3, 1, [230, 130, 40]); b.rect(18, 4, 2, 3, [80, 150, 60]); });
  I.energy = icon(b => { b.rect(7, 4, 10, 17, [40, 40, 46]); b.rect(7, 4, 2, 17, [80, 80, 90]); b.rect(7, 4, 10, 1, [170, 170, 176]); const L = [[13, 7], [12, 8], [11, 9], [10, 10], [11, 11], [12, 11], [13, 11], [12, 12], [11, 13], [10, 14], [11, 14]]; for (const [x, y] of L) { b.set(x, y + 2, [120, 230, 60]); } });
  I.bandage = icon(b => { b.ellipse(10, 13, 6, 6, (dx, dy) => (dx * dx + dy * dy) < 0.15 ? [170, 160, 150] : sh([236, 232, 220], -dx * 0.1 - dy * 0.1)); b.rect(12, 14, 9, 4, [236, 232, 220]); b.rect(12, 17, 9, 1, [200, 196, 186]); });
  I.medkit = icon(b => { b.rect(3, 7, 18, 13, [200, 40, 36]); b.rect(3, 7, 18, 2, [230, 80, 70]); b.rect(9, 4, 6, 3, [90, 90, 96]); b.rect(10, 10, 4, 8, [245, 245, 240]); b.rect(8, 12, 8, 4, [245, 245, 240]); b.rect(18, 9, 3, 11, [160, 30, 28]); });
  I.antibio = icon(b => { b.rect(8, 3, 8, 4, [240, 240, 236]); b.rect(7, 7, 10, 14, [220, 120, 40]); b.rect(7, 7, 2, 14, [250, 170, 90]); b.rect(9, 11, 6, 5, [245, 240, 230]); b.rect(10, 13, 4, 1, [200, 40, 40]); });
  I.wood = icon(b => { for (const [y, l] of [[13, 0], [8, 2], [16, 4]]) { b.rect(3 + l, y, 15, 4, [146, 100, 58]); b.rect(3 + l, y, 15, 1, [180, 132, 80]); b.ellipse(19 + l, y + 2, 2, 2, [200, 160, 110]); b.set(19 + l, y + 2, [150, 110, 70]); } });
  I.stone = icon(b => { b.ellipse(9, 14, 6, 5, (dx, dy) => sh([140, 136, 128], -dx * 0.2 - dy * 0.3)); b.ellipse(16, 15, 5, 4, (dx, dy) => sh([118, 114, 108], -dx * 0.2 - dy * 0.3)); b.ellipse(12, 9, 4, 3, (dx, dy) => sh([156, 150, 140], -dx * 0.2 - dy * 0.3)); });
  I.metal = icon(b => { b.rect(3, 12, 16, 3, [120, 124, 132]); b.rect(3, 12, 16, 1, [170, 174, 182]); b.rect(6, 7, 13, 4, [140, 86, 50]); b.rect(6, 7, 13, 1, [180, 120, 70]); b.rect(9, 16, 12, 4, [100, 104, 112]); b.rect(9, 16, 12, 1, [150, 154, 162]); });
  I.cloth = icon(b => { b.rect(4, 8, 16, 11, [150, 110, 120]); b.rect(4, 8, 16, 2, [190, 150, 160]); b.rect(4, 13, 16, 1, [120, 84, 96]); b.rect(6, 5, 12, 3, [110, 140, 170]); b.rect(6, 5, 12, 1, [150, 180, 210]); });
  I.parts = icon(b => { b.disc(12, 12, 8, (dx, dy) => { const a = Math.atan2(dy, dx), r = Math.sqrt(dx * dx + dy * dy); const tooth = Math.cos(a * 8) > 0.3 ? 8 : 6.2; if (r > tooth) return null; if (r < 2.5) return null; return sh([150, 154, 160], -dx * 0.03 - dy * 0.03); }); b.disc(12, 12, 2.4, null); });
  I.fuel = icon(b => { b.rect(5, 6, 14, 15, [200, 40, 34]); b.rect(5, 6, 3, 15, [230, 90, 80]); b.rect(15, 3, 3, 4, [70, 70, 74]); b.rect(7, 3, 6, 2, [160, 30, 28]); b.line(8, 10, 15, 17, [160, 30, 28]); b.line(15, 10, 8, 17, [160, 30, 28]); });
  I.radiopart = icon(b => { b.rect(3, 6, 18, 12, [40, 110, 60]); b.rect(3, 6, 18, 1, [80, 160, 100]); b.rect(6, 9, 4, 4, [30, 30, 34]); b.rect(13, 9, 5, 2, [200, 170, 60]); b.rect(13, 13, 3, 3, [180, 60, 40]); for (let x = 4; x < 20; x += 3) b.set(x, 17, [210, 190, 90]); b.line(6, 15, 11, 15, [200, 170, 60]); });
  // HUD symbols (9x9 maps)
  const pm = (rows, pal) => TZ.pixmap(rows, pal);
  I.hud_heart = pm(['.rr...rr.', 'rRRr.rRRr', 'rRRRrRRRr', 'rRRRRRRRr', '.rRRRRRr.', '..rRRRr..', '...rRr...', '....r....'], { r: '#7a1010', R: '#e2302a' });
  I.hud_bolt = pm(['....yy', '...yy.', '..yy..', '.yyyy.', '...yy.', '..yy..', '.yy...', 'yy....'], { y: '#f0b030' });
  I.hud_drop = pm(['...b...', '..bBb..', '.bBBBb.', 'bBBWBBb', 'bBBWBBb', 'bBBBBBb', '.bBBBb.', '..bbb..'], { b: '#1c5aa8', B: '#3aa0f0', W: '#bfe6ff' });
  I.hud_food = pm(['g.g.g..gg', 'g.g.g.ggg', 'ggggg.ggg', '.ggg..ggg', '..g....g.', '..g....g.', '..g....g.', '..g....g.'], { g: '#58c068' });
};

// =====================================================================
//  2.0 weapons and item icons
// =====================================================================
TZ.art.buildWeapons2 = () => {
  const M = [64, 66, 72], Md = [42, 44, 48], Ml = [104, 106, 114], Wd = [130, 86, 48], Wdd = [96, 62, 36], St = [196, 200, 208], Sth = [230, 232, 238];
  const A = TZ.art.weapons;
  A.machete = W(18, 6, [[1, 2, 4, 2, [40, 34, 30]], [5, 1, 1, 4, Md], [6, 2, 11, 2, St], [6, 1, 10, 1, Sth], [16, 3, 1, 1, St]], 2, 3, 2, 3);
  A.crowbar = W(19, 6, [[1, 3, 16, 1, [170, 40, 34]], [1, 2, 15, 1, [200, 60, 50]], [16, 1, 2, 2, [170, 40, 34]], [17, 0, 1, 2, [170, 40, 34]], [0, 4, 2, 1, [170, 40, 34]]], 3, 3, 3, 3);
  A.sledge = W(22, 11, [[1, 5, 15, 1, Wd], [1, 6, 15, 1, Wdd], [15, 1, 6, 9, M], [15, 1, 6, 1, Ml], [20, 1, 1, 9, Md]], 3, 5, 3, 5);
  A.katana = W(26, 5, [[1, 2, 6, 2, [40, 30, 40]], [2, 2, 1, 1, [200, 170, 70]], [5, 2, 1, 1, [200, 170, 70]], [7, 1, 1, 4, [200, 170, 70]], [8, 2, 17, 1, St], [8, 1, 16, 1, Sth], [24, 1, 1, 1, Sth]], 2, 3, 2, 3);
  A.chainsaw = W(24, 10, [[1, 2, 9, 7, [220, 110, 30]], [1, 2, 9, 1, [250, 150, 60]], [3, 0, 5, 2, Md], [10, 4, 13, 3, [170, 172, 176]], [10, 3, 13, 1, Md], [10, 7, 13, 1, Md], [22, 4, 1, 3, Md]], 4, 6, 7, 3);
  A.wrench = W(14, 7, [[1, 3, 9, 1, Ml], [1, 2, 9, 1, M], [10, 1, 3, 5, M], [11, 2, 2, 3, null]], 2, 3, 2, 3);
  A.revolver = W(13, 7, [[1, 3, 3, 3, [90, 60, 40]], [3, 1, 4, 3, M], [4, 2, 2, 2, Md], [7, 1, 6, 1, M], [7, 2, 5, 1, Md], [2, 0, 1, 1, Md]], 3, 4, 3, 4);
  A.smg = W(17, 8, [[1, 2, 4, 2, Md], [5, 1, 8, 3, M], [5, 1, 8, 1, Ml], [13, 2, 3, 1, Md], [8, 4, 2, 4, Md], [6, 4, 1, 2, M]], 6, 4, 11, 3);
  A.sawnoff = W(16, 6, [[1, 2, 4, 3, Wd], [1, 4, 2, 1, Wdd], [5, 1, 4, 3, M], [9, 1, 7, 1, Md], [9, 2, 7, 1, M]], 6, 3, 10, 2);
  A.svd = W(30, 8, [[1, 2, 5, 2, Wd], [1, 3, 3, 3, Wdd], [6, 2, 10, 2, M], [16, 2, 13, 1, Md], [8, 0, 7, 2, [40, 40, 44]], [9, 0, 1, 1, [120, 200, 230]], [10, 4, 2, 3, Md]], 8, 4, 16, 3);
  A.crossbow = W(18, 13, [[1, 6, 13, 2, Wd], [1, 7, 13, 1, Wdd], [12, 0, 2, 13, [80, 60, 40]], [13, 1, 1, 11, [200, 190, 160]], [5, 5, 10, 1, [220, 220, 220]], [14, 6, 3, 1, Ml]], 4, 7, 9, 6);
  A.flamer = W(24, 10, [[1, 2, 8, 6, [180, 40, 34]], [1, 2, 8, 1, [220, 80, 60]], [9, 3, 12, 2, M], [9, 3, 12, 1, Ml], [20, 2, 3, 4, Md], [11, 5, 2, 4, Md]], 6, 5, 13, 4);
  A.grenade = W(8, 9, [[1, 3, 6, 6, [70, 90, 50]], [2, 2, 4, 1, [70, 90, 50]], [3, 0, 2, 2, Md], [5, 1, 2, 1, Ml], [2, 5, 4, 1, [50, 66, 36]]], 3, 6, 3, 6);
  A.pipebomb = W(12, 6, [[1, 1, 9, 4, [120, 120, 126]], [1, 1, 9, 1, [160, 160, 166]], [0, 1, 1, 4, Md], [10, 1, 1, 4, Md], [4, 0, 2, 1, [220, 40, 30]], [6, 0, 1, 1, [230, 200, 60]]], 3, 3, 3, 3);
  A.binoc = W(10, 6, [[1, 1, 3, 4, [40, 40, 44]], [6, 1, 3, 4, [40, 40, 44]], [4, 2, 2, 2, M], [1, 1, 1, 4, [120, 200, 230]]], 2, 3, 2, 3);
  // 3.0 tools
  A.hammer = W(14, 9, [[1, 4, 9, 1, Wd], [1, 5, 9, 1, Wdd], [9, 1, 3, 7, M], [9, 1, 3, 1, Ml], [12, 1, 1, 2, Md], [12, 6, 1, 2, Md]], 2, 5, 2, 5);
  A.rod = W(30, 7, [[1, 3, 6, 2, [160, 118, 72]], [1, 3, 6, 1, [190, 150, 100]], [5, 5, 3, 2, M], [6, 6, 1, 1, Ml], [7, 3, 12, 1, [70, 70, 76]], [19, 2, 10, 1, [90, 90, 96]], [29, 2, 1, 4, [220, 220, 220]]], 2, 4, 2, 4);
  A.flaregun = W(14, 9, [[1, 4, 3, 4, [190, 80, 26]], [1, 4, 1, 4, [220, 110, 50]], [3, 1, 8, 4, [235, 120, 30]], [3, 1, 8, 1, [255, 170, 80]], [10, 0, 3, 5, [70, 70, 74]], [11, 1, 2, 3, [30, 30, 32]], [5, 5, 2, 2, [150, 60, 20]]], 3, 5, 3, 5);
  // 4.0 weapons & tools
  const Red = [196, 44, 34], Redd = [146, 30, 24], Rope = [180, 150, 100];
  A.spear = W(32, 5, [[1, 2, 22, 1, Wd], [1, 3, 22, 1, Wdd], [21, 1, 3, 3, Rope], [24, 1, 6, 3, St], [24, 1, 5, 1, Sth], [30, 2, 1, 1, Sth]], 8, 2, 14, 2);
  A.fireaxe = W(20, 12, [[1, 6, 13, 1, Red], [1, 7, 13, 1, Redd], [12, 2, 4, 6, Red], [12, 2, 4, 1, [230, 90, 70]], [16, 1, 2, 8, St], [17, 1, 1, 8, Sth], [9, 3, 3, 2, M], [8, 4, 1, 1, Md]], 2, 7, 2, 7);
  A.torch_h = W(15, 8, [[1, 4, 9, 2, Wd], [1, 5, 9, 1, Wdd], [9, 3, 3, 4, [96, 74, 50]], [9, 3, 3, 1, [130, 104, 70]], [11, 2, 3, 5, [255, 150, 40]], [12, 1, 2, 4, [255, 214, 110]], [13, 0, 1, 2, [255, 246, 200]]], 2, 4, 2, 4);
  A.shovel = W(24, 9, [[0, 3, 2, 3, Wdd], [2, 4, 14, 1, Wd], [2, 5, 14, 1, Wdd], [15, 3, 2, 3, M], [17, 1, 6, 7, Ml], [17, 1, 6, 1, Sth], [22, 2, 1, 5, M]], 4, 4, 4, 4);
  A.detector = W(26, 10, [[1, 1, 5, 4, [40, 40, 44]], [1, 1, 5, 1, [210, 170, 60]], [2, 2, 1, 1, [90, 230, 110]], [6, 2, 14, 1, M], [6, 3, 14, 1, Md], [19, 3, 1, 4, M], [17, 7, 8, 2, [56, 56, 60]], [17, 7, 8, 1, [110, 110, 118]], [3, 5, 2, 3, [80, 80, 84]]], 4, 3, 4, 3);
  A.nailgun = W(17, 11, [[1, 1, 12, 4, [232, 176, 40]], [1, 1, 12, 1, [255, 214, 100]], [13, 2, 3, 2, M], [16, 2, 1, 2, Md], [3, 5, 3, 5, [50, 50, 54]], [8, 5, 4, 3, [70, 70, 76]], [8, 5, 4, 1, Ml], [1, 2, 1, 2, Md]], 4, 6, 7, 3);
  A.pkm = W(34, 11, [[1, 2, 5, 2, Wd], [1, 3, 3, 3, Wdd], [6, 1, 11, 3, M], [6, 1, 11, 1, Ml], [17, 2, 15, 1, Md], [17, 3, 14, 1, M], [31, 1, 1, 3, Md], [9, 4, 6, 5, [76, 86, 54]], [9, 4, 6, 1, [100, 110, 72]], [21, 4, 1, 5, Md], [24, 4, 1, 5, Md], [8, 0, 7, 1, Md], [15, 4, 2, 2, [196, 160, 80]]], 8, 4, 18, 3);
  A.glauncher = W(24, 11, [[1, 2, 4, 3, [76, 86, 54]], [1, 4, 2, 2, [56, 64, 40]], [5, 1, 8, 5, M], [5, 1, 8, 1, Ml], [13, 1, 10, 5, [66, 76, 50]], [13, 1, 10, 1, [96, 108, 74]], [22, 1, 1, 5, Md], [7, 6, 2, 4, Md], [16, 0, 3, 1, Md]], 6, 5, 10, 3);
  A.bow = (() => { const b = new PB(12, 23); for (let i = 0; i <= 40; i++) { const t = i / 20 - 1, x = 3 + (1 - t * t) * 7, y = 11 + t * 10; b.rect(Math.round(x), Math.round(y), 2, 1, Math.abs(t) < 0.2 ? [60, 40, 26] : Wd); b.set(Math.round(x) + 1, Math.round(y), Math.abs(t) < 0.2 ? [90, 60, 36] : Wdd); } b.line(3, 1, 3, 21, [230, 226, 210]); b.rect(9, 10, 3, 3, [70, 46, 30]); const c = b.canvas(true, [14, 12, 12]); return { c, gx: 10, gy: 11, hx: 4, hy: 11, len: 12 }; })();
  A.decoy = W(9, 9, [[1, 2, 7, 6, [60, 64, 72]], [1, 2, 7, 1, [104, 110, 120]], [3, 0, 1, 2, [160, 160, 166]], [5, 4, 2, 2, [255, 60, 40]], [2, 5, 2, 1, [40, 42, 48]]], 4, 5, 4, 5);
};
TZ.art.buildIcons2 = () => {
  const I = TZ.art.icons;
  const icon = (fn) => { const b = new PB(24, 24); fn(b); return b.canvas(true, [16, 12, 10]); };
  const fromWeapon = (w) => { const Wd = 48, Hh = 30, s = Math.max(1, Math.floor(Math.min(Wd / w.c.width, Hh / w.c.height))); const c = TZ.canvas(Wd, Hh); c.g.drawImage(w.c, Math.floor((Wd - w.c.width * s) / 2), Math.floor((Hh - w.c.height * s) / 2), w.c.width * s, w.c.height * s); return c; };
  for (const k of ['machete', 'crowbar', 'sledge', 'katana', 'chainsaw', 'wrench', 'revolver', 'smg', 'sawnoff', 'svd', 'crossbow', 'flamer', 'grenade', 'pipebomb', 'binoc', 'hammer', 'rod', 'flaregun', 'decoy', 'spear', 'fireaxe', 'torch_h', 'shovel', 'detector', 'nailgun', 'pkm', 'glauncher', 'bow']) I[k] = fromWeapon(TZ.art.weapons[k]);
  I.pipe = icon(b => { for (const [y, l] of [[6, 18], [11, 16], [16, 19]]) { b.rect(3, y, l, 4, [150, 152, 160]); b.rect(3, y, l, 1, [200, 202, 210]); b.rect(3, y + 3, l, 1, [96, 98, 104]); b.ellipse(3 + l, y + 2, 1.5, 2, [40, 40, 44]); } });
  I.brick = icon(b => { for (const [x, y] of [[3, 12], [12, 12], [7, 6]]) { b.rect(x, y, 9, 6, [170, 70, 50]); b.rect(x, y, 9, 1, [210, 110, 80]); b.rect(x, y + 5, 9, 1, [120, 44, 32]); b.rect(x + 1, y + 2, 2, 1, [140, 56, 40]); } });
  I.arrow = icon(b => { for (let k = 0; k < 3; k++) { const y = 6 + k * 5; b.rect(4, y, 15, 1, [150, 110, 66]); b.rect(18, y - 1, 3, 3, [170, 170, 176]); b.set(21, y, [200, 200, 206]); b.rect(2, y - 1, 3, 1, [230, 230, 220]); b.rect(2, y + 1, 3, 1, [200, 60, 50]); } });
  I.nails = icon(b => { for (let k = 0; k < 5; k++) { const x = 4 + k * 3.5 | 0, y = 4 + (k % 2) * 3; b.rect(x - 1, y, 3, 1, [150, 150, 158]); b.rect(x, y + 1, 1, 12, [180, 182, 190]); b.set(x, y + 13, [120, 120, 126]); } });
  I.gl_shell = icon(b => { for (const x of [4, 13]) { b.rect(x, 9, 7, 11, [190, 150, 70]); b.rect(x, 9, 2, 11, [226, 190, 110]); b.ellipse(x + 3.5, 8, 3.5, 4, [80, 96, 60]); b.rect(x, 18, 7, 2, [150, 116, 50]); } });
  I.walkie = icon(b => { b.rect(7, 7, 10, 15, [40, 44, 48]); b.rect(7, 7, 10, 1, [80, 86, 92]); b.rect(8, 9, 8, 5, [120, 200, 120]); b.rect(9, 10, 6, 1, [70, 140, 70]); for (let y = 16; y < 21; y += 2) b.rect(9, y, 6, 1, [20, 22, 24]); b.rect(14, 1, 2, 6, [30, 30, 34]); b.rect(9, 4, 2, 3, [200, 60, 40]); });
  const fishIc = (body, belly, fin) => (b) => { b.ellipse(11, 12, 8, 4.5, (dx, dy) => dy > 0.35 ? belly : sh(body, -dy * 0.25)); for (let i = 0; i < 5; i++) b.rect(18 + i, 12 - i, 1, 2 * i + 1, fin); b.set(6, 11, [20, 20, 22]); b.rect(9, 8, 5, 1, fin); };
  I.fish = icon(fishIc([110, 140, 160], [200, 210, 214], [80, 104, 120]));
  I.fish_cooked = icon(b => { fishIc([150, 96, 50], [200, 150, 90], [120, 70, 36])(b); b.line(8, 10, 14, 14, [90, 50, 24]); b.line(11, 9, 16, 13, [90, 50, 24]); });
  I.junk_boot = icon(b => { b.rect(8, 3, 7, 13, [80, 60, 40]); b.rect(8, 3, 2, 13, [110, 84, 56]); b.rect(5, 14, 15, 5, [70, 52, 36]); b.rect(5, 18, 15, 2, [40, 30, 22]); b.set(12, 8, [60, 140, 60]); b.set(13, 9, [60, 140, 60]); });
  I.flare = icon(b => { for (const [x, c] of [[6, [210, 40, 34]], [11, [230, 120, 30]], [16, [210, 40, 34]]]) { b.rect(x, 6, 4, 14, c); b.rect(x, 6, 1, 14, sh(c, 0.3)); b.rect(x, 4, 4, 2, [60, 60, 64]); } });
  I.nvg = icon(b => { b.rect(4, 8, 16, 7, [50, 56, 50]); b.rect(4, 8, 16, 2, [80, 88, 80]); b.disc(8, 16, 3, [40, 44, 40]); b.disc(16, 16, 3, [40, 44, 40]); b.disc(8, 16, 1.6, [90, 230, 110]); b.disc(16, 16, 1.6, [90, 230, 110]); b.rect(10, 4, 4, 4, [60, 66, 60]); });
  I.leash = icon(b => { for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; b.set(12 + Math.cos(t) * 7, 11 + Math.sin(t) * 5, [190, 40, 34]); b.set(12 + Math.cos(t) * 6, 11 + Math.sin(t) * 4, [150, 30, 26]); } b.rect(10, 15, 4, 4, [220, 190, 70]); b.rect(11, 16, 2, 2, [150, 120, 40]); });
  const can = (b, body, label, top = [200, 200, 206]) => { b.rect(6, 6, 12, 13, body); b.rect(6, 6, 2, 13, sh(body, 0.25)); b.rect(16, 6, 2, 13, sh(body, -0.25)); b.rect(6, 5, 12, 2, top); if (label) b.rect(8, 10, 8, 5, label); };
  const bottle = (b, c, cap, label) => { b.rect(10, 2, 4, 3, cap); b.rect(10, 5, 4, 2, sh(c, 0.2)); b.rect(7, 7, 10, 14, c); b.rect(7, 7, 2, 14, sh(c, 0.3)); b.rect(15, 7, 2, 14, sh(c, -0.2)); if (label) b.rect(7, 11, 10, 5, label); };
  const bullet = (b, x, y, len, tip, cs) => { b.rect(x, y + 3, 3, len, cs); b.rect(x, y + 3, 1, len, sh(cs, 0.25)); b.rect(x, y + 1, 3, 2, tip); b.set(x + 1, y, tip); };
  I.ammo357 = icon(b => { for (const x of [5, 10, 15]) bullet(b, x, 6, 9, [160, 160, 170], [190, 150, 70]); });
  I.bolt = icon(b => { for (let k = 0; k < 3; k++) { const y = 6 + k * 5; b.rect(3, y, 16, 1, [140, 100, 60]); b.rect(18, y - 1, 3, 3, [180, 184, 190]); b.rect(3, y - 1, 3, 3, [210, 60, 50]); } });
  I.beans = icon(b => can(b, [160, 160, 166], [190, 90, 50]));
  I.chips = icon(b => { b.rect(5, 4, 14, 17, [230, 190, 40]); b.rect(5, 4, 14, 2, [200, 160, 30]); b.rect(5, 19, 14, 2, [200, 160, 30]); b.rect(8, 9, 8, 6, [210, 60, 40]); b.rect(5, 4, 2, 17, [250, 220, 90]); });
  I.choco = icon(b => { b.rect(4, 6, 16, 12, [90, 50, 30]); for (let x = 4; x < 20; x += 4) b.rect(x, 6, 1, 12, [60, 32, 20]); b.rect(4, 12, 16, 1, [60, 32, 20]); b.rect(12, 6, 8, 12, [180, 40, 40]); b.rect(12, 9, 8, 2, [230, 200, 80]); });
  I.mre = icon(b => { b.rect(4, 4, 16, 16, [120, 110, 70]); b.rect(4, 4, 16, 2, [140, 130, 84]); b.rect(7, 9, 10, 5, [80, 70, 44]); b.rect(9, 10, 6, 1, [200, 190, 150]); b.rect(9, 12, 4, 1, [200, 190, 150]); });
  I.apple = icon(b => { b.disc(12, 14, 6.5, (dx, dy) => sh([200, 40, 34], -dx * 0.05 - dy * 0.05)); b.set(10, 11, [250, 140, 130]); b.rect(12, 5, 1, 4, [90, 60, 30]); b.rect(13, 6, 3, 2, [80, 150, 60]); });
  I.berries = icon(b => { for (const [x, y] of [[8, 12], [13, 10], [15, 15], [10, 16], [12, 14]]) b.disc(x, y, 2.6, (dx, dy) => dx + dy < -1 ? [230, 90, 120] : [170, 30, 60]); b.rect(12, 6, 4, 2, [70, 130, 50]); });
  I.raw_meat = icon(b => { b.ellipse(12, 13, 8, 6, (dx, dy) => (dx * dx + dy * dy) > 0.6 ? [230, 220, 210] : [200, 70, 70]); b.rect(9, 11, 6, 1, [240, 160, 160]); b.ellipse(19, 9, 2, 2, [236, 230, 220]); });
  I.steak = icon(b => { b.ellipse(12, 13, 8, 6, (dx, dy) => (dx * dx + dy * dy) > 0.6 ? [150, 90, 50] : [120, 60, 34]); b.line(7, 10, 16, 16, [70, 36, 20]); b.line(9, 9, 18, 15, [70, 36, 20]); });
  I.dirty_water = icon(b => bottle(b, [140, 150, 100], [80, 80, 70], [110, 120, 80]));
  I.soda = icon(b => can(b, [200, 40, 40], [240, 240, 240], [220, 220, 226]));
  I.coffee = icon(b => { b.rect(5, 8, 12, 12, [240, 240, 236]); b.rect(5, 8, 12, 2, [80, 50, 30]); b.rect(17, 11, 3, 6, [240, 240, 236]); b.rect(18, 12, 1, 4, null); b.line(8, 3, 9, 6, [200, 200, 200]); b.line(12, 2, 13, 6, [200, 200, 200]); });
  I.vodka = icon(b => bottle(b, [210, 230, 240], [200, 40, 40], [230, 230, 200]));
  I.painkill = icon(b => { b.rect(7, 4, 10, 4, [240, 240, 236]); b.rect(6, 8, 12, 13, [60, 120, 200]); b.rect(6, 8, 2, 13, [110, 170, 240]); b.rect(9, 12, 6, 4, [240, 240, 236]); });
  I.adrenaline = icon(b => { b.rect(3, 11, 14, 3, [220, 220, 230]); b.rect(5, 11, 8, 3, [230, 60, 40]); b.rect(17, 12, 5, 1, [180, 180, 190]); b.rect(1, 10, 2, 5, [100, 100, 110]); });
  I.rope = icon(b => { for (let r = 3; r < 9; r += 2) b.disc(12, 12, r, null); for (let a = 0; a < 60; a++) { const t = a / 60 * Math.PI * 6, r = 3 + a / 60 * 6; b.set(12 + Math.cos(t) * r, 12 + Math.sin(t) * r * 0.8, a % 3 ? [180, 150, 100] : [140, 110, 70]); } });
  I.electro = icon(b => { b.rect(3, 5, 18, 14, [40, 110, 60]); b.rect(3, 5, 18, 1, [80, 160, 100]); b.rect(6, 8, 4, 4, [30, 30, 34]); b.rect(13, 8, 5, 2, [200, 170, 60]); b.rect(13, 13, 3, 3, [180, 60, 40]); b.line(6, 15, 11, 15, [200, 170, 60]); for (let x = 4; x < 21; x += 3) b.set(x, 18, [210, 190, 90]); });
  I.gunpowder = icon(b => { b.rect(6, 6, 12, 14, [200, 190, 160]); b.rect(6, 6, 12, 2, [170, 160, 130]); b.rect(9, 3, 6, 3, [150, 140, 110]); b.ellipse(12, 15, 4, 3, [40, 40, 44]); b.rect(9, 10, 6, 2, [200, 40, 30]); });
  I.leather = icon(b => { b.ellipse(12, 12, 9, 7, (dx, dy) => (Math.abs(dx) > 0.8 && Math.abs(dy) < 0.4) ? null : [150, 100, 60]); b.ellipse(10, 10, 3, 2, [170, 120, 76]); });
  I.fur = icon(b => { b.ellipse(12, 12, 9, 7, (dx, dy, x, y) => H(x, y, 3) < 0.3 ? [180, 176, 170] : [130, 126, 120]); for (let i = 0; i < 8; i++) b.set(4 + i * 2, 5 + (i % 2), [150, 146, 140]); });
  I.concrete = icon(b => { b.rect(4, 6, 16, 14, [170, 166, 156]); b.rect(4, 6, 16, 2, [190, 186, 176]); b.rect(7, 10, 10, 5, [120, 116, 110]); b.rect(9, 12, 6, 1, [220, 220, 210]); });
  I.wheel = icon(b => { b.disc(12, 12, 9, (dx, dy) => { const r = Math.hypot(dx, dy); return r < 3.6 ? [160, 160, 166] : r < 5 ? [90, 90, 96] : [34, 34, 36]; }); b.disc(12, 12, 1.4, [60, 60, 64]); });
  I.battery = icon(b => { b.rect(4, 8, 16, 11, [40, 42, 46]); b.rect(4, 8, 16, 2, [70, 72, 76]); b.rect(6, 5, 3, 3, [200, 40, 40]); b.rect(15, 5, 3, 3, [60, 60, 66]); b.rect(7, 12, 10, 3, [220, 190, 60]); });
  I.engine = icon(b => { b.rect(4, 7, 16, 12, [90, 94, 100]); b.rect(4, 7, 16, 2, [130, 134, 140]); for (let x = 6; x < 18; x += 4) b.rect(x, 4, 3, 3, [70, 74, 80]); b.rect(7, 12, 10, 4, [60, 62, 66]); b.rect(20, 10, 2, 6, [200, 60, 40]); });
  I.repairkit = icon(b => { b.rect(3, 8, 18, 12, [210, 170, 40]); b.rect(3, 8, 18, 2, [240, 200, 70]); b.rect(9, 5, 6, 3, [60, 60, 64]); b.rect(7, 12, 10, 2, [80, 80, 84]); b.rect(11, 11, 2, 5, [80, 80, 84]); });
  // wearables
  I.cap = icon(b => { b.ellipse(12, 12, 7, 5, (dx, dy) => dy > 0.2 ? null : [70, 84, 50]); b.rect(5, 12, 14, 2, [70, 84, 50]); b.rect(15, 13, 6, 2, [56, 66, 40]); });
  I.beanie = icon(b => { b.ellipse(12, 13, 7, 7, (dx, dy) => dy > 0.3 ? null : [170, 40, 40]); b.rect(5, 14, 14, 3, [140, 30, 30]); b.disc(12, 5, 2, [230, 230, 220]); });
  I.ushanka = icon(b => { b.ellipse(12, 11, 8, 6, (dx, dy) => dy > 0.3 ? null : [90, 70, 50]); b.rect(3, 11, 18, 3, [190, 170, 140]); b.rect(3, 13, 4, 7, [190, 170, 140]); b.rect(17, 13, 4, 7, [190, 170, 140]); b.disc(12, 9, 1.5, [210, 170, 60]); });
  I.helmet = icon(b => { b.ellipse(12, 13, 9, 7, (dx, dy) => dy > 0.25 ? null : sh([90, 100, 64], -dy * 0.3)); b.rect(2, 14, 20, 2, [70, 80, 50]); });
  I.gasmask = icon(b => { b.ellipse(12, 11, 8, 8, [70, 74, 66]); b.disc(9, 9, 2.2, [150, 200, 210]); b.disc(15, 9, 2.2, [150, 200, 210]); b.rect(10, 15, 4, 6, [50, 52, 48]); b.rect(9, 19, 6, 3, [90, 94, 86]); });
  I.jacket = icon(b => { b.rect(6, 5, 12, 16, [70, 90, 120]); b.rect(2, 6, 4, 11, [70, 90, 120]); b.rect(18, 6, 4, 11, [70, 90, 120]); b.rect(11, 5, 2, 16, [50, 60, 80]); b.rect(9, 4, 6, 2, [50, 60, 80]); });
  I.parka = icon(b => { b.rect(6, 6, 12, 16, [60, 90, 70]); b.rect(2, 7, 4, 12, [60, 90, 70]); b.rect(18, 7, 4, 12, [60, 90, 70]); b.ellipse(12, 5, 7, 3, [210, 200, 180]); b.rect(11, 7, 2, 15, [40, 60, 46]); });
  I.vest = icon(b => { b.rect(5, 5, 14, 16, [60, 66, 52]); b.rect(9, 3, 6, 3, null); b.rect(7, 9, 10, 3, [80, 88, 70]); b.rect(7, 14, 10, 3, [80, 88, 70]); b.rect(5, 5, 2, 16, [80, 88, 70]); });
  I.bp_small = icon(b => { b.rect(6, 6, 12, 14, [110, 90, 60]); b.rect(6, 6, 12, 3, [130, 110, 76]); b.rect(8, 12, 8, 5, [90, 72, 48]); b.rect(10, 3, 4, 3, [80, 64, 40]); });
  I.bp_big = icon(b => { b.rect(5, 3, 14, 18, [60, 100, 140]); b.rect(5, 3, 14, 3, [90, 130, 170]); b.rect(7, 12, 10, 6, [40, 76, 110]); b.rect(4, 20, 16, 2, [180, 160, 120]); });
  I.bp_mil = icon(b => { b.rect(5, 4, 14, 17, [86, 96, 58]); b.rect(5, 4, 14, 3, [106, 116, 72]); b.rect(6, 10, 5, 6, [70, 80, 46]); b.rect(13, 10, 5, 6, [70, 80, 46]); b.rect(10, 1, 4, 3, [60, 66, 40]); });
};
})();
