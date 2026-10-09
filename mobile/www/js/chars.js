// =====================================================================
//  THE ZOMBIES 2.0 — character catalog (voxel sprite sets, cached)
// =====================================================================
'use strict';
(() => {
const M = TZ.Models, C = TZ.Chars = {};
const cache = new Map();
const get = (key, fn) => { let s = cache.get(key); if (!s) { s = fn(); cache.set(key, s); } return s; };

C.SKINS = [[234, 190, 156], [222, 174, 138], [196, 150, 112], [160, 112, 78], [112, 76, 52]];
C.HAIRS = [[40, 30, 26], [70, 48, 32], [120, 76, 40], [200, 160, 90], [150, 150, 146], [160, 50, 30], [30, 30, 40]];
C.HAIRSTYLES = ['short', 'long', 'ponytail', 'bald', 'mohawk', 'patchy'];
C.OUTFITS = [
  { name: 'Охотник', shirt: [84, 98, 58], shirt2: [60, 70, 42], pants: [64, 66, 56] },
  { name: 'Городской', shirt: [70, 90, 130], shirt2: [50, 64, 96], pants: [50, 54, 66] },
  { name: 'Рабочий', shirt: [190, 110, 40], shirt2: null, pants: [60, 70, 96] },
  { name: 'Байкер', shirt: [40, 40, 44], shirt2: [70, 70, 76], pants: [44, 46, 54] },
  { name: 'Медик', shirt: [210, 210, 204], shirt2: null, pants: [70, 80, 110], cross: true },
  { name: 'Турист', shirt: [170, 50, 46], shirt2: [120, 30, 30], pants: [70, 64, 56] },
];
C.defaultLook = () => ({ skin: 1, hair: 1, style: 0, outfit: 0 });

// ---------------- player ----------------
C.playerCfg = (look, eq = {}) => {
  look = look || C.defaultLook();
  const o = C.OUTFITS[look.outfit % C.OUTFITS.length];
  const cfg = { seed: 3, skin: C.SKINS[look.skin % C.SKINS.length], hair: C.HAIRS[look.hair % C.HAIRS.length], hairStyle: C.HAIRSTYLES[look.style % C.HAIRSTYLES.length],
    shirt: o.shirt, shirt2: o.shirt2, pants: o.pants, cross: o.cross, belt: [60, 44, 30], shoes: [56, 42, 34] };
  if (eq.head === 'cap') { cfg.hat = 'cap'; cfg.hatColor = [62, 74, 46]; }
  if (eq.head === 'beanie') { cfg.hat = 'beanie'; cfg.hatColor = [170, 40, 40]; }
  if (eq.head === 'ushanka') { cfg.hat = 'ushanka'; cfg.hatColor = [90, 70, 50]; }
  if (eq.head === 'helmet') { cfg.hat = 'helmet'; cfg.hatColor = [86, 96, 60]; }
  if (eq.head === 'gasmask') { cfg.gasmask = true; }
  if (eq.head === 'crown') { cfg.hat = 'crown'; }
  if (eq.body === 'jacket') { cfg.shirt = [70, 90, 120]; cfg.shirt2 = [50, 60, 80]; }
  if (eq.body === 'parka') { cfg.shirt = [60, 90, 70]; cfg.shirt2 = [40, 60, 46]; cfg.coat = true; cfg.scarf = [210, 200, 180]; }
  if (eq.body === 'vest') { cfg.armorPlates = [60, 66, 52]; }
  if (eq.back === 'bp_small') cfg.backpack = [110, 90, 60];
  if (eq.back === 'bp_big') cfg.backpack = [60, 100, 140];
  if (eq.back === 'bp_mil') cfg.backpack = [86, 96, 58];
  return cfg;
};
C.playerSet = (look, eq) => { const cfg = C.playerCfg(look, eq); return get('P' + JSON.stringify(cfg), () => M.humanSet(cfg)); };

// ---------------- zombies ----------------
const ZS = [[132, 146, 112], [146, 150, 124], [118, 132, 104], [160, 150, 134], [124, 120, 108], [140, 128, 120]];
const ZSH = [[128, 64, 52], [74, 84, 116], [156, 146, 124], [94, 104, 74], [62, 62, 66], [180, 176, 160], [60, 90, 120], [200, 110, 40], [110, 60, 90], [170, 160, 60]];
const ZP = [[62, 72, 98], [84, 70, 52], [70, 70, 74], [50, 56, 70], [100, 92, 76]];
const ZH = [[60, 44, 32], [30, 26, 24], [120, 100, 70], [140, 140, 136], [90, 50, 30]];
C.ZVARIANTS = { walker: 12, runner: 6, crawler: 3, spitter: 3, exploder: 2, screamer: 3, soldier: 4, frozen: 3, husk: 3, brute: 3, boss: 1 };
C.zombieCfg = (type, v, biome) => {
  const R = TZ.RNG(v * 977 + type.length * 31 + (biome === 2 ? 5000 : 0));
  const base = { zombie: true, seed: 100 + v * 13 + type.length, skin: R.pick(ZS), shirt: R.pick(ZSH), pants: R.pick(ZP), hair: R.pick(ZH), hairStyle: R.pick(['short', 'long', 'patchy', 'bald', 'short']), blood: 0.5 + R() * 0.7, torn: 0.6 + R() * 0.6 };
  if (type === 'walker') { if (R() < 0.2) { base.hat = R.pick(['cap', 'beanie']); base.hatColor = R.pick(ZSH); } if (R() < 0.25) base.shirt2 = R.pick(ZSH); if (R() < 0.12) base.vest = [210, 120, 40]; if (R() < 0.2) base.limp = true; if (R() < 0.15) base.oneArmDown = true; if (biome === 2) { base.coat = true; base.shirt = R.pick([[60, 70, 90], [90, 60, 50], [70, 80, 60]]); base.hat = R() < .6 ? 'ushanka' : 'beanie'; base.hatColor = [90, 70, 50]; } }
  if (type === 'runner') { base.build = 'thin'; base.blood = 1; base.torn = 1.2; base.eyes = [255, 110, 40]; base.hairStyle = R.pick(['long', 'patchy']); }
  if (type === 'spitter') { base.build = 'bloated'; base.bloated = true; base.skin = [130, 150, 96]; base.eyes = [200, 240, 60]; base.hairStyle = 'patchy'; base.blood = 0.3; }
  if (type === 'exploder') { base.build = 'bloated'; base.bloated = true; base.skin = [170, 120, 90]; base.shirt = [200, 140, 60]; base.eyes = [255, 200, 40]; base.hairStyle = 'bald'; base.blood = 0.6; base.tank = true; }
  if (type === 'screamer') { base.build = 'thin'; base.skin = [176, 170, 160]; base.hairStyle = 'long'; base.hair = [30, 30, 34]; base.shirt = [200, 196, 186]; base.eyes = [255, 255, 255]; base.armsDown = true; }
  if (type === 'soldier') { base.shirt = [86, 98, 58]; base.pants = [76, 86, 54]; base.armorPlates = [60, 66, 52]; base.hat = 'helmet'; base.hatColor = [80, 90, 56]; base.backpack = R() < 0.5 ? [70, 80, 46] : null; base.blood = 0.8; }
  if (type === 'frozen') { base.skin = [150, 186, 210]; base.shirt = [90, 110, 130]; base.coat = true; base.pants = [60, 70, 90]; base.eyes = [120, 220, 255]; base.hat = 'ushanka'; base.hatColor = [180, 200, 220]; base.blood = 0.2; base.scarf = [220, 236, 250]; }
  if (type === 'husk') { base.build = 'thin'; base.skin = R.pick([[170, 140, 100], [150, 120, 86], [186, 160, 120]]); base.shirt = R.pick([[196, 176, 140], [170, 150, 120]]); base.pants = [120, 100, 76]; base.eyes = [255, 170, 60]; base.hairStyle = 'patchy'; base.hair = [200, 190, 170]; base.blood = 0.25; base.torn = 1.4; if (R() < 0.6) { base.hat = 'beanie'; base.hatColor = [210, 196, 160]; base.scarf = [200, 180, 140]; } }
  if (type === 'brute') { base.build = 'big'; base.hairStyle = 'bald'; base.sleeves = false; base.blood = 1.3; base.torn = 1.2; base.shirt = R.pick([[70, 70, 74], [96, 84, 60], [120, 60, 40]]); base.skin = R.pick([[120, 130, 104], [140, 136, 120]]); }
  if (type === 'boss') { base.build = 'huge'; base.hairStyle = 'bald'; base.sleeves = false; base.blood = 1.6; base.torn = 1.6; base.shirt = [80, 30, 26]; base.pants = [40, 40, 46]; base.skin = [110, 116, 96]; base.eyes = [255, 40, 20]; }
  return base;
};
C.zombieSet = (type, v, biome) => {
  const n = C.ZVARIANTS[type] || 1; v = v % n;
  const snowy = biome === 2 && type === 'walker' ? 2 : 0;
  return get(`Z${type}_${v}_${snowy}`, () => {
    if (type === 'crawler') { const cfg = C.zombieCfg('walker', v + 40, 0); return M.crawlerSet(cfg); }
    return M.humanSet(C.zombieCfg(type, v, snowy));
  });
};

// ---------------- survivors ----------------
C.survivorDef = (id) => {
  const h = TZ.hash(id.length, [...id].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7), 11);
  const R = TZ.RNG((h * 1e9) | 0);
  const female = R() < 0.42;
  const name = female ? R.pick(TZ.SURV_NAMES_F) : R.pick(TZ.SURV_NAMES_M);
  const role = R.pick(['medic', 'gatherer', 'mechanic', 'shooter', 'cook', 'shooter']);
  const weapon = role === 'shooter' ? R.pick(['ak', 'rifle', 'smg']) : role === 'medic' ? 'pistol' : R.pick(['shotgun', 'pistol', 'sawnoff', 'revolver']);
  const cfg = { seed: (h * 999) | 0, skin: R.pick(C.SKINS), hair: R.pick(C.HAIRS), hairStyle: female ? R.pick(['long', 'ponytail']) : R.pick(['short', 'short', 'bald', 'mohawk']), shirt: R.pick(ZSH), pants: R.pick(ZP), shoes: [50, 40, 32] };
  if (!female && R() < 0.35) cfg.beard = R.pick(C.HAIRS);
  if (role === 'medic') { cfg.shirt = [210, 210, 204]; cfg.cross = true; }
  if (role === 'mechanic') { cfg.vest = [220, 120, 40]; cfg.hat = 'cap'; cfg.hatColor = [200, 110, 40]; }
  if (role === 'shooter') { cfg.shirt = [86, 98, 58]; cfg.pants = [76, 86, 54]; cfg.vest = [70, 76, 56]; if (R() < .5) { cfg.hat = 'helmet'; cfg.hatColor = [80, 90, 58]; } }
  if (role === 'gatherer') { cfg.backpack = [112, 94, 60]; if (R() < .5) { cfg.hat = 'beanie'; cfg.hatColor = [110, 50, 40]; } }
  if (role === 'cook') { cfg.shirt = [230, 226, 216]; cfg.hat = 'band'; cfg.hatColor = [230, 230, 230]; }
  return { name, female, role, weapon, cfg };
};
C.survivorSet = (def) => get('S' + JSON.stringify(def.cfg), () => M.humanSet(def.cfg));
C.animalSet = (kind) => get('A' + kind, () => M.animalSet(kind, 3));
C.vehicleSet = (kind, paint, mods) => get('V' + kind + (paint || []).join() + (mods ? JSON.stringify(mods) : ''), () => M.vehicleSet(kind, paint, 7, mods));

// portrait (head & shoulders) for avatars, rendered from the front-facing frame
C.portrait = (set, size = 64, bg) => {
  const s = set.get('idle', 0, 2);
  const c = TZ.canvas(size, size);
  if (bg) { c.g.fillStyle = bg; c.g.fillRect(0, 0, size, size); }
  const m = set.model; const headTop = m.AY - (m.headTop || 28) * 0.9 - 4;
  const crop = Math.round((m.AY - headTop) * 0.62);
  const sx = m.AX - crop / 2, sy = headTop;
  c.g.imageSmoothingEnabled = false;
  c.g.drawImage(s.c, sx, sy, crop, crop, 0, 0, size, size);
  return c;
};
})();
