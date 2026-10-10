// =====================================================================
//  THE ZOMBIES 5.0 — classes (perks) and custom skins (64×64 PNG).
// =====================================================================
'use strict';
(() => {
const R = TZ.RULES, Cos = TZ.Cosmetics;

// ---------------------------------------------------------------- perks
const clsOf = (G, p) => { if (!p) return null; if (G && p === G.me) return TZ.Account.cls(); return (p.profile && p.profile.cls) || 'survivor'; };
TZ.myPerk = (key, def) => R.perk(TZ.Account.cls(), key, def);
TZ.perkOf = (G, who, key, def) => {
  let p = who;
  if (typeof who === 'string' || typeof who === 'number') p = G && G.players ? G.players.get(who) || null : null;
  if (!p || p.kind !== 'player') return def;
  return R.perk(clsOf(G, p), key, def);
};
const AXES = new Set(['axe', 'fireaxe', 'chainsaw']);
TZ.perkDmg = (G, by, kind, animal) => {
  if (!G || !G.players) return 1;
  let p = G.players.get(by);
  if (!p && typeof by === 'string' && by[0] === 'a') { // an ally or a dog of some player
    const al = G.allies.find(a => 'a' + a.id === by); const owner = al && al.owner && G.playerByUid ? G.playerByUid(al.owner) : null;
    return owner ? R.perk(clsOf(G, owner), 'allyDmg', 1) : 1;
  }
  if (!p) return 1;
  const c = clsOf(G, p); let mul = 1;
  if (kind === 'fire') mul *= R.perk(c, 'fire', 1);
  else if (kind === 'melee' || kind === 'saw') { mul *= R.perk(c, 'melee', 1); const w = p === G.me ? p.weapon : p.netW; if (AXES.has(w)) mul *= R.perk(c, 'axe', 1); }
  else if (kind === 'bullet' || kind === 'head') mul *= R.perk(c, 'ranged', 1);
  if (animal) mul *= R.perk(c, 'animal', 1);
  if (p.hp < (p.maxHp || 100) * 0.35) mul *= R.perk(c, 'rage', 1);
  return mul;
};
TZ.Game.prototype.buildCost = function (B) {
  const k = TZ.myPerk('build', 1); if (k === 1) return B.cost;
  const o = {}; for (const i in B.cost) o[i] = i === 'radiopart' ? B.cost[i] : Math.max(1, Math.ceil(B.cost[i] * k)); return o;
};
// max health follows the class (called when a game starts and when the class changes)
TZ.applyClass = (G) => {
  G = G || TZ.game; if (!G || !G.me || G.demo) return;
  const P = G.me, mx = 100 + TZ.myPerk('hp', 0);
  if (P.maxHp !== mx) { const k = P.hp / (P.maxHp || 100); P.maxHp = mx; P.hp = Math.min(mx, Math.max(1, Math.round(k * mx))); }
};

// ---------------------------------------------------------------- icons
const Classes = TZ.Classes = {};
Classes.icon = (id, size = 48) => { const c = R.CLASS[id] || R.CLASS.survivor; return Cos.badge([id === 'survivor' ? 'circle' : c.price >= 1000 ? 'star' : 'shield', c.color, c.icon], size); };
Classes.shopIcon = (icon) => {
  const map = { coin: ['circle', '#f0c040', 'coin'], globe: ['star', '#5fd0ff', 'globe'], star: ['star', '#c080ff', 'star'], pot: ['circle', '#e8a030', 'pot'], cross: ['circle', '#ff6a6a', 'cross'], blade: ['shield', '#c8d0d8', 'blade'], brick: ['shield', '#c07a3a', 'brick'], wrench: ['circle', '#e8a030', 'wrench'], paw: ['circle', '#a07040', 'paw'] };
  return `<img src="${Cos.url(Cos.badge(map[icon] || map.star, 64))}">`;
};

// ---------------------------------------------------------------- custom skins
// 64×64 PNG. Each body part is unfolded as a "cross": [left side][front][right side][back] with the top above the front.
// head 6×6×6 at (0,6) · torso 4 deep, 8 wide, 10 tall at (0,18) · right arm (28,18) · left arm (40,18) · legs 3×3×9 at (0,34) and (16,34)
const LAY = { head: [0, 6], torso: [0, 18], armR: [28, 18], armL: [40, 18], legR: [0, 34], legL: [16, 34] };
const Sk = TZ.Skins = { tex: new Map(), LAY };
Sk.get = (id) => { // returns {d: Uint8ClampedArray} when loaded; starts loading otherwise
  if (!id) return null;
  const t = Sk.tex.get(id); if (t) return t === 'loading' ? null : t;
  Sk.tex.set(id, 'loading');
  TZ.Online.loadSkin(id).then((img) => { if (img) Sk.tex.set(id, { d: img.data }); else Sk.tex.set(id, { d: null }); });
  return null;
};
Sk.setLocal = (id, imageData) => Sk.tex.set(id, { d: imageData.data });
// wrap the colour functions of a human model so they read the texture
Sk.apply = (parts, tex) => {
  const px = (u, v) => { if (!tex || !tex.d || u < 0 || v < 0 || u >= 64 || v >= 64) return null; const i = (v * 64 + u) * 4; return tex.d[i + 3] > 127 ? [tex.d[i], tex.d[i + 1], tex.d[i + 2]] : null; };
  for (const p of parts) {
    const L = LAY[p.n]; if (!L || !p.boxes.length) continue;
    const bx = p.boxes[0]; const [x0, y0, z0, x1, y1, z1, orig] = bx; const D = x1 - x0, Wd = y1 - y0, [ox, oy] = L;
    const base = typeof orig === 'function' ? orig : () => orig;
    bx[6] = (x, y, z, f, sx, sy, sz) => {
      let u = -1, v = oy + (z1 - 1 - z);
      if (f === '+x') u = ox + D + (y1 - 1 - y);
      else if (f === '-x') u = ox + 2 * D + Wd + (y - y0);
      else if (f === '-y') u = ox + (x - x0);
      else if (f === '+y') u = ox + D + Wd + (x1 - 1 - x);
      else if (f === '+z') { u = ox + D + (y1 - 1 - y); v = oy - D + (x - x0); }
      const c = u >= 0 ? px(Math.floor(u), Math.floor(v)) : null;
      return c || base(x, y, z, f, sx, sy, sz);
    };
  }
};
// export the current look as a ready template (so players paint over their own character)
Sk.template = (look) => {
  const cfg = TZ.Chars.playerCfg(Object.assign({}, look, { sk: null }), {});
  const m = TZ.Models.human(cfg);
  const cv = TZ.canvas(64, 64), g = cv.g, id = g.createImageData(64, 64);
  const put = (u, v, c) => { if (!c || u < 0 || v < 0 || u >= 64 || v >= 64) return; const i = (v * 64 + u) * 4; id.data[i] = c[0]; id.data[i + 1] = c[1]; id.data[i + 2] = c[2]; id.data[i + 3] = 255; };
  for (const p of m.parts) {
    const L = LAY[p.n]; if (!L) continue;
    const [x0, y0, z0, x1, y1, z1, fn0] = p.boxes[0]; const fn = typeof fn0 === 'function' ? fn0 : () => fn0;
    const D = x1 - x0, Wd = y1 - y0, H = z1 - z0, [ox, oy] = L;
    for (let r = 0; r < H; r++) {
      const z = z1 - 1 - r;
      for (let i = 0; i < D; i++) { put(ox + i, oy + r, fn(x0 + i, y0, z, '-y')); put(ox + D + Wd + i, oy + r, fn(x1 - 1 - i, y1 - 1, z, '+y')); }
      for (let i = 0; i < Wd; i++) { put(ox + D + i, oy + r, fn(x1 - 1, y1 - 1 - i, z, '+x')); put(ox + 2 * D + Wd + i, oy + r, fn(x0, y0 + i, z, '-x')); }
    }
    for (let i = 0; i < D; i++) for (let j = 0; j < Wd; j++) put(ox + D + j, oy - D + i, fn(x0 + i, y1 - 1 - j, z1 - 1, '+z'));
  }
  g.putImageData(id, 0, 0);
  return cv;
};
// guide: coloured areas with signatures, drawn 8× larger, for the help picture
Sk.guide = () => {
  const k = 8, cv = TZ.canvas(64 * k, 64 * k), g = cv.g; g.fillStyle = '#1a1612'; g.fillRect(0, 0, cv.width, cv.height);
  const dims = { head: [6, 6, 6], torso: [4, 8, 10], armR: [2, 2, 10], armL: [2, 2, 10], legR: [3, 3, 9], legL: [3, 3, 9] };
  const names = { head: 'голова', torso: 'тело', armR: 'пр. рука', armL: 'лев. рука', legR: 'пр. нога', legL: 'лев. нога' };
  for (const n in LAY) {
    const [ox, oy] = LAY[n], [D, Wd, H] = dims[n];
    const rect = (u, v, w, h, c, label) => { g.fillStyle = c; g.fillRect(u * k, v * k, w * k, h * k); g.strokeStyle = '#000'; g.strokeRect(u * k + 0.5, v * k + 0.5, w * k - 1, h * k - 1); if (label && w * k > 18) { g.fillStyle = '#000'; g.font = '9px monospace'; g.fillText(TZ.t(label), u * k + 2, v * k + 10); } };
    rect(ox, oy, D, H, '#7a9a5a', 'бок'); rect(ox + D, oy, Wd, H, '#d8b060', 'перед'); rect(ox + D + Wd, oy, D, H, '#7a9a5a', 'бок'); rect(ox + 2 * D + Wd, oy, Wd, H, '#a07858', 'спина'); rect(ox + D, oy - D, Wd, D, '#8ab0d0', 'верх');
    g.fillStyle = '#fff'; g.font = 'bold 10px monospace'; g.fillText(TZ.t(names[n]), ox * k + 2, (oy + H) * k + 11);
  }
  return cv;
};
// validate a picked file and return ImageData 64×64
Sk.readFile = (file) => new Promise((res, rej) => {
  if (!file || !/png$/i.test(file.type || file.name)) return rej(new Error(TZ.t('Нужен PNG-файл')));
  if (file.size > 48 * 1024) return rej(new Error(TZ.t('Файл больше 48 КБ')));
  const fr = new FileReader();
  fr.onload = () => { const img = new Image(); img.onload = () => { if (img.width !== 64 || img.height !== 64) return rej(new Error(TZ.t('Скин должен быть 64×64 пикселя'))); const cv = TZ.canvas(64, 64); cv.g.drawImage(img, 0, 0); res({ dataUrl: fr.result, data: cv.g.getImageData(0, 0, 64, 64) }); }; img.onerror = () => rej(new Error(TZ.t('Не удалось прочитать картинку'))); img.src = fr.result; };
  fr.readAsDataURL(file);
});

// hook the character builder: look.sk = skin id
const origCfg = TZ.Chars.playerCfg;
TZ.Chars.playerCfg = (look, eq) => {
  const cfg = origCfg(look, eq);
  if (look && look.sk) { const tex = Sk.get(look.sk); cfg.texId = look.sk + (tex ? '' : '~'); if (tex) Object.defineProperty(cfg, 'tex', { value: tex, enumerable: false }); }
  return cfg;
};
const origHuman = TZ.Models.human;
TZ.Models.human = (cfg) => { const m = origHuman(cfg); if (cfg && cfg.tex) Sk.apply(m.parts, cfg.tex); return m; };
TZ.Account.lookWithSkin = () => { const a = TZ.Account.active(); const l = Object.assign({}, a.look || TZ.Chars.defaultLook()); if (a.skin) l.sk = a.skin; else delete l.sk; return l; };
})();
