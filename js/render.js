// =====================================================================
//  THE ZOMBIES 2.0 — renderer
// =====================================================================
'use strict';
(() => {
const A = TZ.art, CH = TZ.CH, isoX = TZ.isoX, isoY = TZ.isoY;
const TL = TZ.TILE;
const sy0Shift = (v) => Math.round((v.alt || 0) * 90);
const centered = (c, bx, by) => ({ c, ax: bx, ay: by - 8 });
const WALLS = { wall_wood: 1, gate_wood: 1, gate_metal: 1, gate_code: 1, wall_brick: 1, wall_brick_win: 1, door_wood: 1, door_code: 1, wall_stone: 1, wall_metal: 1, wall_concrete: 1, sandbags: 1, hwall: 1 };
const snowCache = new Map();
const snowy = (spr, key) => { let s = snowCache.get(key); if (!s) { s = { c: A.snowify(spr.c, 1.2, 4), ax: spr.ax, ay: spr.ay }; snowCache.set(key, s); } return s; };
function nmask(W, o, set) { const w = (x, y) => { const q = W.get(x, y); return q && set[q.t] ? 1 : 0; }; return w(o.x + 1, o.y) | w(o.x - 1, o.y) << 1 | w(o.x, o.y + 1) << 2 | w(o.x, o.y - 1) << 3; }
const gateCache = new Map();
TZ.gateSprite = (type, axis, open) => { const k = type + axis + open; let s = gateCache.get(k); if (!s) { s = TZ.Models.gate(type, axis, open); gateCache.set(k, s); } return s; };

// ---- roofs: hipped tile / shingle / tin roofs and flat concrete ones (code -> look)
const ROOF = {
  1: { c: [172, 74, 54], s: 6, rows: 1 }, 2: { c: [120, 86, 64], s: 6, rows: 1 }, 3: { c: [132, 138, 142], s: 4, tin: 1 },
  4: { c: [148, 146, 138], s: 0 }, 5: { c: [142, 102, 62], s: 5, rows: 1 }, 6: { c: [164, 162, 154], s: 0 },
  7: { c: [230, 236, 244], s: 6, rows: 1, snow: 1 }, 8: { c: [86, 110, 74], s: 4, tin: 1 }, 9: { c: [194, 158, 112], s: 0 },
};
TZ.ROOF = ROOF;
const roofIconCache = {};
function roofIcon(rc) {
  if (roofIconCache[rc]) return roofIconCache[rc];
  const R = ROOF[rc] || ROOF[5], c = TZ.canvas(40, 40), g = c.g, col = (k) => TZ.rgb(TZ.shade(R.c, k));
  const P = (x, y, h) => [20 + (x - y) * 16, 22 + (x + y) * 8 - h];
  const quad = (a, b, d, e, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...d); g.lineTo(...e); g.closePath(); g.fill(); };
  const hh = R.s ? 10 : 2, top = P(0.5, 0.5, hh + 4);
  if (R.s) { quad(P(0, 0, 4), P(1, 0, 4), top, top, col(0.12)); quad(P(1, 0, 4), P(1, 1, 4), top, top, col(-0.2)); quad(P(1, 1, 4), P(0, 1, 4), top, top, col(-0.05)); quad(P(0, 1, 4), P(0, 0, 4), top, top, col(0.05)); }
  else { quad(P(0, 0, 6), P(1, 0, 6), P(1, 1, 6), P(0, 1, 6), col(0)); g.strokeStyle = col(0.2); g.lineWidth = 1; g.stroke(); }
  const s = { c, ax: 20, ay: 30 }; roofIconCache[rc] = s; return s;
}
function objSprite(o, G) {
  const W = G && G.world;
  switch (o.t) {
    case 'hwall': { const m = W ? (o._mv === W.version ? o._mask : (o._mv = W.version, o._mask = nmask(W, o, { hwall: 1 }))) : 15; const s = A.houseWall(o.m, o.v, o.win, o.ruin, m); return o.snow ? snowy(s, `hw${o.m}${o.v}${o.win}${o.ruin}${m}`) : s; }
    case 'pine': return centered(A.trees.pine[o.v % 3], 20, 56);
    case 'spine': return centered(A.trees.spine[o.v % 3], 20, 56);
    case 'oak': return centered(A.trees.oak[o.v % 8], 23, 55);
    case 'apple': return centered(o.looted ? A.trees.appleBare : A.trees.apple, 23, 55);
    case 'willow': return centered(A.trees.willow[o.v % 2], 24, 55);
    case 'dead': return centered(A.trees.dead[o.v % 2], 18, 52);
    case 'sdead': return centered(A.trees.sdead[o.v % 2], 18, 52);
    case 'bush': return Object.assign(centered((o.looted ? A.trees.bush : A.trees.berry)[o.v % 4], 10, 12), {});
    case 'dbush': return Object.assign(centered(A.trees.dbush[o.v % 2], 10, 13), { flat: 1 });
    case 'reeds': return centered(A.trees.reeds[o.v % 3], 8, 19);
    case 'rock': return centered(A.trees.rock[o.v % 3], 13, 16);
    case 'srock': return centered(A.trees.srock[o.v % 3], 13, 16);
    case 'ore': return centered(A.trees.ore[o.v % 3], 13, 16);
    case 'cactus': return centered(A.trees.cactus[o.v % 3], 13, 38);
    case 'palm': return centered(A.trees.palm[o.v % 2], 25, 60);
    case 'sandrock': return centered(A.trees.sandrock[o.v % 3], 13, 16);
    case 'hole': return Object.assign(centered(A.trees.hole, 10, 6), { flat: 1 });
    case 'bones': return Object.assign(centered(A.trees.bones, 8, 6), { flat: 1 });
    case 'scrap': return Object.assign(centered(A.trees.scrap[o.v % 2], 12, 12), { flat: 1 });
    case 'stump': return Object.assign(centered(A.trees.stump, 6, 8), { flat: 1 });
    case 'bus': { const s = A.bus(o.dir); return { c: s.c, ax: s.ax, ay: s.ay, wx: o.x - (o.dir ? 0 : 3), wy: o.y - (o.dir ? 3 : 0) }; }
    case 'crate': return A.crate(0); case 'mcrate': return A.crate(1); case 'drop': return A.crate(2);
    case 'barrel': return A.barrel(o.c ? [200, 60, 40] : [70, 100, 130], o.c ? 1 : 0);
    case 'cabinet': return A.cabinet(0); case 'fridge': return A.cabinet(1); case 'locker': return A.cabinet(2); case 'dumpster': return A.cabinet(3); case 'pump': return A.cabinet(4);
    case 'shelf': return A.shelf(); case 'medcab': return A.medcab(); case 'toolbox': return A.toolbox(); case 'desk': return A.desk(); case 'table': return A.table(); case 'hay': return A.hay(); case 'tent': return A.tent(o.v || 0); case 'tires': return A.tires(); case 'helicrash': return A.helicrash();
    case 'hbed': return A.bed();
    case 'barrier': return A.barrier(o.v || 0);
    case 'fence': return A.fence(o.v || 0);
    case 'lamppost': return A.lamppost(); case 'pole': return A.pole(); case 'sign': return A.sign();
    case 'corpse': return Object.assign({}, A.corpse(), { flat: 1 });
    case 'backpack': return Object.assign(centered(TZ.art.icons.bp_big, 12, 18), {});
    case 'wall_wood': return A.palisade(W ? nmask(W, o, WALLS) : 5, o.hp < TZ.BUILD.wall_wood.hp * 0.45 ? 1 : 0);
    case 'wall_brick': case 'wall_brick_win': { const m = W ? nmask(W, o, WALLS) : 5; const ruin = o.hp < TZ.BUILD[o.t].hp * 0.35 ? 1 : 0; return A.houseWall(0, o.v % 3, o.t === 'wall_brick_win' ? ((m & 3) ? 1 : 2) : 0, ruin, m); }
    case 'roof_wood': case 'roof_concrete': return roofIcon(TZ.BUILD[o.t].roof);
    case 'gate_wood': case 'gate_metal': case 'gate_code': case 'door_wood': case 'door_code': {
      const axis = W ? ((nmask(W, o, WALLS) & 3) ? 0 : (nmask(W, o, WALLS) & 12) ? 1 : 0) : 0;
      const want = G && G.gateOpen ? (G.gateOpen(o) ? 4 : 0) : 0;
      o._open = o._open == null ? want : o._open + clamp(want - o._open, -0.5, 0.5);
      return TZ.gateSprite(TZ.BUILD[o.t].gate, axis, Math.round(o._open));
    }
    case 'wall_stone': return A.stoneWall(o.v % 2); case 'wall_metal': return A.metalWall(o.v % 2); case 'wall_concrete': return A.wallConcrete(o.v % 2);
    case 'sandbags': return A.sandbags(o.v % 2);
    case 'spikes': return Object.assign({}, A.spikes(), { flat: 1 });
    case 'beartrap': return Object.assign({}, A.beartrap(o.shut && o.shut > Date.now()), { flat: 1 });
    case 'sleepbag': return Object.assign({}, A.sleepbag(), { flat: 1 });
    case 'barbed': return Object.assign({}, A.barbed(), {});
    case 'mine': return Object.assign({}, A.mine(), { flat: 1 });
    case 'barrel_bomb': return A.barrelBomb();
    case 'torch': return A.torchBase();
    case 'campfire': return Object.assign({}, A.campfireBase(), { flat: 1 });
    case 'workbench': return A.workbench(); case 'garage': return A.garage();
    case 'bed': return A.bed(); case 'chest': return A.chest();
    case 'garden': { const p = G ? G.gardenProgress(o) : 0; return A.garden(p >= 1 ? 3 : p > 0.5 ? 2 : p > 0.1 ? 1 : 0); }
    case 'collector': return A.collector();
    case 'turret': return A.turretBase(); case 'turret_heavy': return A.turretHeavy();
    case 'floodlight': return A.floodlight(); case 'radio': return A.radio();
    case 'floor_wood': return Object.assign({}, A.floorTile('wood'), { flat: 1, floor: 1 });
    case 'floor_stone': return Object.assign({}, A.floorTile('stone'), { flat: 1, floor: 1 });
    case 'part': return null;
  }
  return null;
}
TZ.objSprite = objSprite;
const DECOR = (d, h) => { const D = A.decor; return d === 1 ? D.tuft[(h * 3) | 0] : d === 2 ? D.leaves[(h * 3) | 0] : d === 3 ? D.stones[(h * 2) | 0] : d === 4 ? D.flower[(h * 3) | 0] : d === 5 ? D.crack[(h * 2) | 0] : d === 6 ? D.trash[(h * 2) | 0] : d === 8 ? D.snowtuft[(h * 2) | 0] : d === 9 ? D.minireed[(h * 2) | 0] : D.puddle[0]; };

class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.v = TZ.canvas(10, 10); this.lc = TZ.canvas(10, 10);
    this.items = []; this.rain = []; this.time = 0; this.scale = 3; this.zoomF = 1;
    this.shadow = (() => { const b = new TZ.PixelBuf(16, 8); b.ellipse(8, 4, 7.5, 3.5, [0, 0, 0]); return b.canvas(); })();
    this.shadowBig = (() => { const b = new TZ.PixelBuf(30, 14); b.ellipse(15, 7, 14.5, 6.5, [0, 0, 0]); return b.canvas(); })();
    this.black = (() => { const b = new TZ.PixelBuf(32, 16); for (let y = 0; y < 16; y++) { const hw = y < 8 ? (y * 2 + 2) : ((15 - y) * 2 + 2); for (let x = 16 - hw; x < 16 + hw; x++) b.set(x, y, [6, 6, 8]); } return b.canvas(); })();
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  resize(extraZoom = 0) {
    const W = window.innerWidth, H = window.innerHeight;
    this.cv.width = W; this.cv.height = H;
    let s = Math.max(2, Math.round(Math.min(W / 560, H / 330)));
    s = Math.max(1, s + (TZ.settings ? TZ.settings.zoom || 0 : 0));
    this.baseScale = s; this.scale = s;
    this.VW = Math.ceil(W / s) + 2; this.VH = Math.ceil(H / s) + 2;
    this.v.width = this.VW; this.v.height = this.VH; this.v.g.imageSmoothingEnabled = false;
    this.lc.width = this.VW; this.lc.height = this.VH;
    this.vig = TZ.canvas(this.VW, this.VH);
    const gr = this.vig.g.createRadialGradient(this.VW / 2, this.VH / 2, this.VH * 0.35, this.VW / 2, this.VH / 2, this.VW * 0.7);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    this.vig.g.fillStyle = gr; this.vig.g.fillRect(0, 0, this.VW, this.VH);
  }
  // fractional zoom: render a bigger virtual view and scale down
  applyZoom(z) {
    const want = z < -0.25 ? Math.max(1, this.baseScale - 1) : this.baseScale;
    if (want !== this.scale) { this.scale = want; const W = window.innerWidth, H = window.innerHeight; this.VW = Math.ceil(W / want) + 2; this.VH = Math.ceil(H / want) + 2; this.v.width = this.VW; this.v.height = this.VH; this.v.g.imageSmoothingEnabled = false; this.lc.width = this.VW; this.lc.height = this.VH; this.vig = TZ.canvas(this.VW, this.VH); const gr = this.vig.g.createRadialGradient(this.VW / 2, this.VH / 2, this.VH * 0.35, this.VW / 2, this.VH / 2, this.VW * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); this.vig.g.fillStyle = gr; this.vig.g.fillRect(0, 0, this.VW, this.VH); }
  }
  screenToWorld(px, py) { return TZ.unIso(px / this.scale + this.camX, py / this.scale + this.camY); }
  worldToScreen(x, y, z = 0) { return { x: (isoX(x, y) - this.camX) * this.scale, y: (isoY(x, y) - this.camY - z) * this.scale }; }

  draw(G, dt) {
    this.time += dt;
    this.applyZoom(G.camera.zoom || 0);
    const g = this.v.g, VW = this.VW, VH = this.VH, W = G.world, P = G.me, C = G.camera;
    this.camX = Math.round(C.x + C.sx - VW / 2); this.camY = Math.round(C.y + C.sy - VH / 2);
    const cx = this.camX, cy = this.camY;
    G.mouseWorld = this.screenToWorld(TZ.input.mouse.x, TZ.input.mouse.y);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#0c0e0a'; g.fillRect(0, 0, VW, VH);
    const c0 = TZ.unIso(cx - 32, cy - 64), c1 = TZ.unIso(cx + VW + 32, cy - 64), c2 = TZ.unIso(cx - 32, cy + VH + 90), c3 = TZ.unIso(cx + VW + 32, cy + VH + 90);
    const minX = Math.floor(Math.min(c0.x, c1.x, c2.x, c3.x)) - 1, maxX = Math.ceil(Math.max(c0.x, c1.x, c2.x, c3.x)) + 1;
    const minY = Math.floor(Math.min(c0.y, c1.y, c2.y, c3.y)) - 1, maxY = Math.ceil(Math.max(c0.y, c1.y, c2.y, c3.y)) + 1;
    const items = this.items; items.length = 0;
    const tiles = A.tiles, wf = ((this.time * 2.2) | 0) % 4, blend = A.blend, pri = A.blendPri;
    this.updateRoofHide(G);
    const hidden = G.enclosures && G.enclosures.size ? (x, y) => G.hiddenAt(x, y) : null;
    this._hidden = hidden;
    // ---------------- ground pass ----------------
    for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) {
      const sx = isoX(tx, ty) - cx, sy = isoY(tx, ty) - cy;
      if (sx < -40 || sx > VW + 40 || sy < -90 || sy > VH + 16) continue;
      const c = W.chunkIf(Math.floor(tx / CH), Math.floor(ty / CH)); if (!c) continue;
      const i = (ty - c.y0) * CH + (tx - c.x0);
      if (hidden && hidden(tx, ty)) { if (sy > -16) g.drawImage(this.black, sx - 16, sy); if (c.roof[i]) items.push({ d: tx + ty + 1.05, k: 8, x: tx, y: ty, rc: c.roof[i] }); continue; }
      if (sy > -16) {
        const gt = c.ground[i], vr = (tx * 7 + ty * 13) & 3;
        g.drawImage(gt === TL.WATER ? A.water[wf][vr] : gt === TL.SHALLOW ? A.shallow[(wf + 1) % 4][vr] : tiles[gt][vr], sx - 16, sy);
        // edge blending with higher-priority neighbours
        const myP = pri[gt] ?? -1;
        if (myP >= 0 || gt === TL.WATER || gt === TL.SHALLOW) {
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (let e = 0; e < 4; e++) { const ng = W.groundIf(tx + nb[e][0], ty + nb[e][1]); const np = pri[ng]; if (np != null && np > myP && blend[ng]) g.drawImage(blend[ng][e], sx - 16, sy); }
        }
        const d = c.decor[i];
        if (d && gt !== TL.WATER) { const h = TZ.hash(tx, ty, 5); g.drawImage(DECOR(d, h), sx - 6 + h * 8 | 0, sy + 3 + (TZ.hash(tx, ty, 6) * 6 | 0)); }
      }
      const rc = c.roof[i];
      if (rc && !(this.roofHide && this.roofHide.has(tx * 131071 + ty))) items.push({ d: tx + ty + 1.05, k: 8, x: tx, y: ty, rc });
      const o = c.obj[i];
      if (o && !o.ref) {
        const spr = objSprite(o, G); if (!spr) continue;
        const M = TZ.OBJ[o.t] || {};
        if (spr.flat) { this.drawObj(g, o, spr, 1, G); continue; }
        if (M.tree) { g.globalAlpha = 0.22; g.drawImage(this.shadowBig, isoX(tx + .5, ty + .5) - cx - 15, isoY(tx + .5, ty + .5) - cy - 5); g.globalAlpha = 1; }
        items.push({ d: o.x + o.y + 1.0, o, spr, k: 0 });
      }
    }
    // decals
    for (const d of G.fx.decals) {
      const sx = isoX(d.x, d.y) - cx, sy = isoY(d.x, d.y) - cy;
      if (sx < -30 || sx > VW + 30 || sy < -20 || sy > VH + 20) continue;
      if (hidden && hidden(d.x, d.y)) continue;
      g.globalAlpha = Math.min(1, d.life / d.max * 3) * 0.85;
      g.drawImage(d.img, Math.round(sx - d.img.width / 2), Math.round(sy - d.img.height / 2));
    }
    g.globalAlpha = 1;
    const inView = (x, y) => { const sx = isoX(x, y) - cx, sy = isoY(x, y) - cy; return sx > -60 && sx < VW + 60 && sy > -10 && sy < VH + 80 && !(hidden && hidden(x, y)); };
    const shadowAt = (e, big) => { const s = big ? this.shadowBig : this.shadow; const sx = isoX(e.x, e.y) - cx, sy = isoY(e.x, e.y) - cy; g.globalAlpha = 0.3; g.drawImage(s, Math.round(sx - s.width / 2), Math.round(sy - s.height / 2)); g.globalAlpha = 1; };
    for (const z of G.zombies) { if (!inView(z.x, z.y)) continue; if (z.dead) { this.drawCorpse(g, z); continue; } shadowAt(z, z.T.scale > 1.3); items.push({ d: z.x + z.y, e: z, k: 1 }); }
    for (const a of G.animals) { if (!inView(a.x, a.y)) continue; if (a.dead) { this.drawAnimal(g, a); continue; } shadowAt(a, a.ak === 'bear'); items.push({ d: a.x + a.y, e: a, k: 6 }); }
    for (const a of G.allies) { if (a.dead || a.inCar || !inView(a.x, a.y)) continue; shadowAt(a); items.push({ d: a.x + a.y, e: a, k: 2 }); }
    for (const p of G.players.values()) { if (p.vehicle || G.demo && p === P) continue; if (!inView(p.x, p.y) && p !== P) continue; if (p.dead) { this.drawPlayerCorpse(g, p); continue; } if (G.heli && G.heli.phase === 'out' && dist2(p.x, p.y, G.heli.x, G.heli.y) < 64) continue; shadowAt(p); items.push({ d: p.x + p.y, e: p, k: 3 }); }
    for (const v of G.vehicles) { if (!inView(v.x, v.y) && !(v.alt > 0.2)) continue; items.push({ d: v.x + v.y + (v.alt > 0.05 ? 30 + v.alt * 10 : 0), e: v, k: 7 }); }
    for (const p of G.pickups) if (inView(p.x, p.y)) items.push({ d: p.x + p.y, p, k: 4 });
    for (const p of G.combat.proj) items.push({ d: p.x + p.y, pr: p, k: 5 });
    items.sort((a, b) => a.d - b.d);
    const psx = isoX(P.x, P.y) - cx, psy = isoY(P.x, P.y) - cy - 10, pd = P.x + P.y;
    for (const it of items) {
      if (it.k === 0) {
        const o = it.o, M = TZ.OBJ[o.t] || {};
        if (hidden && hidden(o.x, o.y)) continue;
        let alpha = 1;
        if ((M.tall || o.t === 'hwall') && it.d > pd + 0.3 && !G.demo) {
          const s = it.spr, wx = s.wx ?? o.x, wy = s.wy ?? o.y;
          const sx = isoX(wx, wy) - cx - s.ax, sy = isoY(wx, wy) - cy - s.ay;
          if (psx > sx + 2 && psx < sx + s.c.width - 2 && psy > sy && psy < sy + s.c.height - 4) alpha = 0.38;
        }
        this.drawObj(g, o, it.spr, alpha, G);
      } else if (it.k === 1) this.drawZombie(g, it.e);
      else if (it.k === 2) this.drawHuman(g, it.e, it.e.spr, it.e.weapon, G);
      else if (it.k === 3) this.drawHuman(g, it.e, it.e.sprite, it.e === P ? P.weapon : (it.e.netW || 'fists'), G);
      else if (it.k === 4) this.drawPickup(g, it.p);
      else if (it.k === 5) this.drawProj(g, it.pr);
      else if (it.k === 6) this.drawAnimal(g, it.e);
      else if (it.k === 7) this.drawVehicle(g, it.e, G, pd, psx, psy);
      else if (it.k === 8) { const near = !G.demo && !P.vehicle && it.d > pd + 0.3 && Math.abs((it.x - it.y) - (P.x - P.y)) < 2.6 && it.d - pd < 7; this.drawRoof(g, G.world, it.x, it.y, it.rc, near ? 0.42 : 1); }
    }
    if (G.mode === 'build' && G.buildSel) this.drawGhost(g, G);
    // bullets
    g.lineWidth = 1;
    for (const b of G.combat.bullets) {
      if (b.flame) continue;
      const x0 = isoX(b.px, b.py) - cx, y0 = isoY(b.px, b.py) - cy - 11, x1 = isoX(b.x, b.y) - cx, y1 = isoY(b.x, b.y) - cy - 11;
      g.strokeStyle = b.bolt ? 'rgba(200,170,120,0.9)' : 'rgba(255,230,150,0.55)'; g.beginPath(); g.moveTo(x0 + .5, y0 + .5); g.lineTo(x1 + .5, y1 + .5); g.stroke();
      g.fillStyle = '#fff8d8'; g.fillRect(Math.round(x1), Math.round(y1), 1, 1);
    }
    for (const p of G.fx.parts) {
      const sx = Math.round(isoX(p.x, p.y) - cx), sy = Math.round(isoY(p.x, p.y) - cy - p.z);
      if (sx < -4 || sx > VW + 4 || sy < -4 || sy > VH + 4) continue;
      const lf = p.life / p.max;
      if (p.type === 'smoke') { g.fillStyle = p.c + (lf * 0.35).toFixed(3) + ')'; const s = Math.round((p.s || 2) + (1 - lf) * (p.s > 2 ? 8 : 4)); g.fillRect(sx - (s >> 1), sy - (s >> 1), s, s); continue; }
      g.fillStyle = p.type === 'fire' ? (lf > 0.7 ? '#fff4b0' : lf > 0.4 ? '#ffb030' : lf > 0.2 ? '#e05818' : '#6a2010') : p.c;
      g.fillRect(sx, sy, p.s, p.s);
    }
    if (G.heli) this.drawHeli(g, G);
    this.drawLighting(G);
    this.drawWeather(g, G, dt);
    if (TZ.settings.vignette !== false) g.drawImage(this.vig, 0, 0);
    if (P.hurtT > 0) { g.fillStyle = `rgba(160,0,0,${P.hurtT * 0.8})`; g.fillRect(0, 0, VW, VH); }
    if (P.hp < 30 && !P.dead && !G.demo) { g.fillStyle = `rgba(120,0,0,${(0.15 + Math.sin(this.time * 5) * 0.08) * (1 - P.hp / 30)})`; g.fillRect(0, 0, VW, VH); }
    if (P.warmth < 25 && !G.demo) { g.fillStyle = `rgba(160,200,255,${(1 - P.warmth / 25) * 0.22})`; g.fillRect(0, 0, VW, VH); }
    const sg = this.g; sg.imageSmoothingEnabled = false;
    sg.drawImage(this.v, 0, 0, this.VW * this.scale, this.VH * this.scale);
    this.drawOverlay(sg, G);
    // ambient leaves from autumn trees
    if (Math.random() < dt * 3 && !G.weather.rain) {
      const wx = P.x + (Math.random() - .5) * 30, wy = P.y + (Math.random() - .5) * 30, o = W.get(wx, wy);
      if (o && o.t === 'oak') G.fx.add({ x: o.x + .5, y: o.y + .5, z: 30 + Math.random() * 14, vx: 0.4, vy: -0.2, vz: -4, g: 0, life: 6, max: 6, c: TZ.pick3((Math.random() * 3) | 0, ['#d88a34', '#b8402a', '#e0b048']), s: 1, type: 'leaf' });
    }
    for (const p of G.fx.parts) if (p.type === 'leaf') p.vx = 0.5 + Math.sin(this.time * 2 + p.x) * 0.6;
  }
  drawObj(g, o, spr, alpha, G) {
    const cx = this.camX, cy = this.camY;
    const wx = spr.wx ?? o.x, wy = spr.wy ?? o.y;
    let sx = Math.round(isoX(wx, wy) - cx - spr.ax), sy = Math.round(isoY(wx, wy) - cy - spr.ay);
    if (o.shake > 0) { sx += Math.round(Math.sin(this.time * 70) * 1.5); o.shake -= 1 / 60; }
    if (o.t === 'drop' && o.dropT != null && o.dropT < 3) { o.dropT += 1 / 60; sy -= Math.round((3 - o.dropT) * 60); this.drawParachute(g, sx + spr.c.width / 2, sy - 4); }
    g.globalAlpha = alpha;
    g.drawImage(spr.c, sx, sy);
    if (o.hitT > 0) { g.globalAlpha = 0.28; g.drawImage(spr.white || (spr.white = TZ.tint(spr.c, '#fff')), sx, sy); }
    g.globalAlpha = 1;
    const tcx = Math.round(isoX(o.x + .5, o.y + .5) - cx), tcy = Math.round(isoY(o.x + .5, o.y + .5) - cy);
    if (o.t === 'campfire') this.drawFlame(g, tcx, tcy - 2, 1.0);
    if (o.t === 'torch') this.drawFlame(g, tcx + 1, tcy - 18, 0.55);
    if (o.t === 'turret' || o.t === 'turret_heavy') {
      const a = o.ang || 0, sa = Math.atan2((Math.cos(a) + Math.sin(a)) * 8, (Math.cos(a) - Math.sin(a)) * 16), heavy = o.t === 'turret_heavy';
      g.save(); g.translate(tcx, tcy - (heavy ? 14 : 12)); g.rotate(sa); if (Math.abs(sa) > Math.PI / 2) g.scale(1, -1);
      g.fillStyle = '#3a3e3a'; g.fillRect(-3, -2, 7, heavy ? 5 : 4); g.fillStyle = '#5a5e58'; g.fillRect(-3, -2, 7, 1); g.fillStyle = '#262826'; g.fillRect(4, -1, heavy ? 9 : 6, 2); if (heavy) g.fillRect(4, 1, 8, 1);
      if (o.flash > 0) { g.fillStyle = '#fff6c0'; g.fillRect(heavy ? 13 : 10, -2, 3, 4); g.fillStyle = '#ffb040'; g.fillRect(heavy ? 16 : 13, -1, 2, 2); }
      g.restore();
      if ((o.ammo | 0) <= 0) { g.fillStyle = (this.time * 2 | 0) % 2 ? '#ff4030' : '#601010'; g.fillRect(tcx - 1, tcy - 22, 2, 2); }
    }
    if (o.t === 'radio' && G && G.evacDay) { g.fillStyle = (this.time * 3 | 0) % 2 ? '#ff4030' : '#601010'; g.fillRect(tcx + 3, tcy - 31, 1, 1); }
    if (TZ.isCode(o.t) && G) { const ok = TZ.gateAllows(o, G.me.uid); g.fillStyle = ok ? '#50f080' : ((this.time * 2 | 0) % 2 ? '#ff3020' : '#701010'); g.fillRect(tcx + 6, tcy - 18, 2, 2); }
    const B = TZ.BUILD[o.t];
    if (B && !o.wild && o.hp < B.hp && G && (G.mode === 'build' || o.hitT > 0 || o.hp < B.hp * 0.5)) {
      const w = 14, f = clamp(o.hp / B.hp, 0, 1), by = tcy - 28;
      g.fillStyle = '#000'; g.fillRect(tcx - w / 2 - 1, by - 1, w + 2, 3);
      g.fillStyle = f > 0.5 ? '#6fd04a' : f > 0.25 ? '#e8b030' : '#e03a2a'; g.fillRect(tcx - w / 2, by, Math.ceil(w * f), 1);
    }
  }
  drawFlame(g, x, y, s) {
    const t = this.time, n = Math.round(6 * s);
    for (let i = 0; i < n; i++) {
      const ph = t * 9 + i * 1.7, h = (3 + Math.sin(ph) * 2 + (i % 3)) * s * 1.6, ox = Math.round((i - n / 2) * 1.1 * s + Math.sin(ph * 1.3) * 0.6);
      g.fillStyle = '#c03810'; g.fillRect(x + ox, y - Math.round(h), 2, Math.round(h));
      g.fillStyle = '#ff9a20'; g.fillRect(x + ox, y - Math.round(h * 0.75), 1 + (s > 0.8 ? 1 : 0), Math.round(h * 0.75));
      g.fillStyle = '#fff0a0'; g.fillRect(x + ox, y - Math.round(h * 0.35), 1, Math.max(1, Math.round(h * 0.35)));
    }
  }
  drawParachute(g, x, y) { g.fillStyle = '#d8d8d0'; g.beginPath(); g.ellipse(x, y - 14, 10, 5, 0, Math.PI, 0); g.fill(); g.fillStyle = '#c04030'; g.fillRect(x - 3, y - 19, 6, 5); g.strokeStyle = '#b0b0a8'; g.beginPath(); g.moveTo(x - 10, y - 14); g.lineTo(x, y); g.lineTo(x + 10, y - 14); g.stroke(); }
  frameOf(set, anim, e, extra) {
    const n = set.frames[anim] || 1;
    const f = anim === 'attack' ? (e.atkT > 0.18 ? 0 : 1) : anim === 'swing' ? (e.swing > 0.11 ? 0 : 1) : (e.anim | 0) % n;
    return set.get(anim, f, e.dir || 0, extra);
  }
  drawZombie(g, z) {
    const sx = Math.round(isoX(z.x, z.y) - this.camX), sy = Math.round(isoY(z.x, z.y) - this.camY);
    const set = z.spr;
    const walking = z.moving || z.walking;
    const anim = z.atkT > 0 ? 'attack' : walking ? (z.type === 'runner' && z.state === 'hunt' ? 'run' : 'walk') : 'idle';
    let s = this.frameOf(set, anim, z);
    const img = z.hitT > 0 ? set.flash(s) : s.c;
    g.drawImage(img, sx - s.ax, sy - s.ay);
    if (z.burn > 0) { g.globalAlpha = 0.35; g.drawImage(TZ.tint(s.c, '#ff6020'), sx - s.ax, sy - s.ay); g.globalAlpha = 1; }
    if (z.type === 'exploder' && (this.time * 4 | 0) % 2) { g.fillStyle = 'rgba(255,170,40,0.85)'; g.fillRect(sx - 1, sy - 16, 2, 2); }
    if (z.hp < z.maxHp || z.T.boss) {
      const w = z.T.boss ? 34 : z.T.scale > 1.3 ? 18 : 10, f = clamp(z.hp / z.maxHp, 0, 1), top = sy - (z.T.boss ? 74 : z.T.scale > 1.3 ? 44 : 32);
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(sx - w / 2 - 1, top - 1, w + 2, 3);
      g.fillStyle = z.T.boss ? '#d02020' : '#c83a2a'; g.fillRect(sx - w / 2, top, Math.ceil(w * f), 1);
    }
  }
  drawCorpse(g, z) {
    const a = clamp((25 - z.deadT) / 4, 0, 1); if (a <= 0) return;
    const sx = Math.round(isoX(z.x, z.y) - this.camX), sy = Math.round(isoY(z.x, z.y) - this.camY);
    const s = z.spr.get('dead', 0, z.dir || 0);
    g.globalAlpha = a; g.drawImage(s.c, sx - s.ax, sy - s.ay); g.globalAlpha = 1;
  }
  drawAnimal(g, a) {
    const sx = Math.round(isoX(a.x, a.y) - this.camX), sy = Math.round(isoY(a.x, a.y) - this.camY);
    const set = a.spr;
    if (a.dead) { if (a.looted && a.deadT > 2) return; const s = set.get('dead', 0, a.dir || 0); g.drawImage(s.c, sx - s.ax, sy - s.ay); return; }
    const anim = a.atkT > 0 ? 'attack' : a.moving ? (a.running ? 'run' : 'walk') : 'idle';
    const s = this.frameOf(set, anim, a);
    g.drawImage(a.hitT > 0 ? set.flash(s) : s.c, sx - s.ax, sy - s.ay);
  }
  drawPlayerCorpse(g, p) { const sx = Math.round(isoX(p.x, p.y) - this.camX), sy = Math.round(isoY(p.x, p.y) - this.camY); const s = p.sprite.get('dead', 0, p.dir || 0); g.drawImage(s.c, sx - s.ax, sy - s.ay); }
  drawHuman(g, e, set, wid, G) {
    const sx = Math.round(isoX(e.x, e.y) - this.camX), sy = Math.round(isoY(e.x, e.y) - this.camY);
    const hold = TZ.holdOf(wid, e.swing);
    const anim = hold === 'swing' ? 'swing' : e.moving ? (e.running ? 'run' : 'walk') : 'idle';
    const s = this.frameOf(set, anim, e, hold);
    const sang = Math.atan2((Math.cos(e.ang) + Math.sin(e.ang)) * 8, (Math.cos(e.ang) - Math.sin(e.ang)) * 16);
    const mk = s.marks, hand = mk && mk.handR;
    let hx, hy, back;
    if (hand) { hx = sx + Math.round(hand.x); hy = sy + Math.round(hand.y); back = hand.d < mk.chest.d - 0.6; }
    else { hx = sx + Math.round(Math.cos(sang) * 3); hy = sy - 13; back = Math.sin(sang) < -0.25; }
    if (back) this.drawWeapon(g, e, wid, hx, hy, sang, hold);
    g.drawImage(e.hurtT > 0 && (this.time * 20 | 0) % 2 ? set.flash(s) : s.c, sx - s.ax, sy - s.ay);
    if (!back) this.drawWeapon(g, e, wid, hx, hy, sang, hold);
    if (e.kind === 'ally' && !e.owner) { const bob = Math.round(Math.sin(this.time * 4) * 1.5); g.fillStyle = '#ffd24a'; g.fillRect(sx - 1, sy - 38 + bob, 2, 4); g.fillRect(sx - 1, sy - 32 + bob, 2, 2); }
    if (e.kind === 'ally' && e.owner && e.hp < e.maxHp) { const w = 10, f = e.hp / e.maxHp; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(sx - 6, sy - 34, w + 2, 3); g.fillStyle = '#4ac0e0'; g.fillRect(sx - 5, sy - 33, Math.ceil(w * f), 1); }
  }
  // weapon angle in screen space: guns follow the aim, melee weapons rest raised and sweep through the aim when swinging
  weaponAngle(e, wid, sang, hold) {
    const Wd = TZ.WEAPONS[wid] || {};
    const lerpA = (a, b, t) => a + TZ.angDiff(a, b) * t;
    if (hold === 'swing') {
      const p = clamp(1 - e.swing / 0.22, 0, 1), ease = p * p * (3 - 2 * p), sd = e.swingDir || 1;
      return sang + (-1.5 + 2.6 * ease) * sd;
    }
    if (hold === 'melee') { const up = Math.cos(sang) >= -0.05 ? -1.0 : -Math.PI + 1.0; return lerpA(up, sang, 0.15); }
    if (hold === 'free' && !Wd.melee) return lerpA(sang, Math.PI / 2, 0.5);
    let a = sang;
    if (e.reload > 0 && e.reloadTotal) { const r = e.reload / e.reloadTotal; a = lerpA(sang, Math.PI / 2, Math.sin(r * Math.PI) * 0.55); }
    return a;
  }
  drawWeapon(g, e, wid, hx, hy, sang, hold) {
    const W = A.weapons[wid]; if (!W) return;
    const ang = this.weaponAngle(e, wid, sang, hold || TZ.holdOf(wid, e.swing));
    g.save(); g.translate(hx, hy); g.rotate(ang);
    if (Math.cos(ang) < 0) g.scale(1, -1);
    const rc = Math.round(e.recoil || 0) * 0.5;
    if (wid === 'chainsaw' && e.swing > 0) g.translate(Math.sin(this.time * 80), 0);
    g.drawImage(W.c, -W.gx - rc, -W.gy);
    if (e.flash > 0 && TZ.WEAPONS[wid] && !TZ.WEAPONS[wid].melee) {
      const tx = W.len - W.gx - rc, ty = 2 - W.gy;
      if (TZ.WEAPONS[wid].flame) { g.fillStyle = '#ffb030'; g.fillRect(tx, ty - 2, 5, 4); }
      else { g.fillStyle = '#fff8d0'; g.fillRect(tx, ty - 1, 3, 3); g.fillStyle = '#ffc040'; g.fillRect(tx + 3, ty, 3, 1); g.fillRect(tx + 1, ty - 2, 1, 1); g.fillRect(tx + 1, ty + 2, 1, 1); }
    }
    g.restore();
  }
  // the roof over the player's building disappears so you can see inside
  updateRoofHide(G) {
    const W = G.world, P = G.me, x = Math.floor(P.x), y = Math.floor(P.y);
    if (W.roofVer !== this._roofVer) { this._roofVer = W.roofVer; this.roofH = new Map(); this._rhKey = null; }
    if (G.demo || P.dead || P.vehicle || !W.roofAt(x, y)) { this.roofHide = null; this._rhKey = null; return; }
    const key = x + ',' + y; if (key === this._rhKey) return;
    this._rhKey = key; const set = new Set(), q = [[x, y]]; set.add(x * 131071 + y);
    while (q.length && set.size < 1200) { const [cx, cy] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy, k = nx * 131071 + ny; if (!set.has(k) && W.roofAt(nx, ny)) { set.add(k); q.push([nx, ny]); } } }
    this.roofHide = set;
  }
  roofCorner(W, x, y) {
    const k = x * 131071 + y; let d = this.roofH.get(k); if (d != null) return d;
    const on = (a, b) => W.roofAt(a, b) > 0, bnd = (a, b) => !(on(a - 1, b - 1) && on(a, b - 1) && on(a - 1, b) && on(a, b));
    d = 0; if (!bnd(x, y)) { d = 3; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let s = 1; s < d; s++) if (bnd(x + dx * s, y + dy * s)) { d = s; break; } }
    if (this.roofH.size > 40000) this.roofH.clear();
    this.roofH.set(k, d); return d;
  }
  drawRoof(g, W, x, y, rc, alpha) {
    const R = ROOF[rc]; if (!R) return;
    const cx = this.camX, cy = this.camY, base = 28;
    const hgt = (a, b) => R.s ? base + this.roofCorner(W, a, b) * R.s : base + 2;
    const h00 = hgt(x, y), h10 = hgt(x + 1, y), h11 = hgt(x + 1, y + 1), h01 = hgt(x, y + 1);
    const p = (a, b, h) => [isoX(a, b) - cx, isoY(a, b) - cy - h];
    const P00 = p(x, y, h00), P10 = p(x + 1, y, h10), P11 = p(x + 1, y + 1, h11), P01 = p(x, y + 1, h01);
    if (P11[1] < -10 || P00[1] > this.VH + 10 || P10[0] < -20 || P01[0] > this.VW + 20) return;
    const dhx = (h10 + h11 - h00 - h01) / 2, dhy = (h01 + h11 - h00 - h10) / 2;
    const k = R.s ? dhx * 0.03 + dhy * 0.012 + (TZ.hash(x, y, rc) - 0.5) * 0.04 : (TZ.hash(x, y, rc) - 0.5) * 0.05;
    const col = TZ.shade(R.c, k);
    g.globalAlpha = alpha;
    g.fillStyle = TZ.rgb(col); g.beginPath(); g.moveTo(P00[0], P00[1]); g.lineTo(P10[0], P10[1]); g.lineTo(P11[0], P11[1]); g.lineTo(P01[0], P01[1]); g.closePath(); g.fill();
    const L = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    g.strokeStyle = TZ.rgb(TZ.shade(col, R.snow ? -0.08 : -0.2)); g.lineWidth = 1; g.beginPath();
    if (R.rows) for (const t of [0.34, 0.67]) { const a = L(P00, P01, t), b = L(P10, P11, t); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    else if (R.tin) for (const t of [0.25, 0.5, 0.75]) { const a = L(P00, P10, t), b = L(P01, P11, t); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke();
    // eaves: dark rim on open edges, a fascia board on the front ones
    const on = (a, b) => W.roofAt(a, b) > 0, edge = TZ.rgb(TZ.shade(R.c, -0.45)), fas = TZ.rgb(TZ.shade(R.c, -0.32));
    const fascia = (A, B) => { g.fillStyle = fas; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(B[0], B[1] + 3); g.lineTo(A[0], A[1] + 3); g.closePath(); g.fill(); };
    if (!on(x + 1, y)) fascia(P10, P11);
    if (!on(x, y + 1)) fascia(P01, P11);
    g.strokeStyle = edge; g.beginPath();
    if (!on(x, y - 1)) { g.moveTo(P00[0], P00[1]); g.lineTo(P10[0], P10[1]); }
    if (!on(x - 1, y)) { g.moveTo(P00[0], P00[1]); g.lineTo(P01[0], P01[1]); }
    if (!on(x + 1, y)) { g.moveTo(P10[0], P10[1] + 3); g.lineTo(P11[0], P11[1] + 3); }
    if (!on(x, y + 1)) { g.moveTo(P01[0], P01[1] + 3); g.lineTo(P11[0], P11[1] + 3); }
    g.stroke();
    if (!R.s) { g.strokeStyle = TZ.rgb(TZ.shade(R.c, 0.18)); g.beginPath(); if (!on(x, y - 1)) { g.moveTo(P00[0], P00[1] + 1); g.lineTo(P10[0], P10[1] + 1); } if (!on(x - 1, y)) { g.moveTo(P00[0] + 1, P00[1]); g.lineTo(P01[0] + 1, P01[1]); } g.stroke(); }
    g.globalAlpha = 1;
  }
  drawVehicle(g, v, G, pd, psx, psy) {
    const set = v.spr, d16 = TZ.Vox.dirIndex(v.a, 16), st = Math.round(clamp(v.steer || 0, -1, 1));
    const s = set.get(v.frameState, st, d16);
    const sx = Math.round(isoX(v.x, v.y) - this.camX), sy0 = Math.round(isoY(v.x, v.y) - this.camY);
    const air = v.T.air, lift = air ? Math.round((v.alt || 0) * 90) : 0, bob = v.boat ? Math.round(Math.sin(this.time * 2.2 + v.id) * 1.2) : 0, sy = sy0 - lift + bob;
    const big = air === 'plane' ? 2.2 : air ? 1.6 : 1, sw = 60 * big * (1 - (v.alt || 0) * 0.35);
    g.globalAlpha = 0.3 * (1 - (v.alt || 0) * 0.55); g.drawImage(this.shadowBig, sx - sw / 2, sy0 - 9 * big, sw, 20 * big); g.globalAlpha = 1;
    let alpha = 1;
    if (!lift && v.x + v.y > pd + 0.6 && !G.me.vehicle && psx > sx - s.ax + 8 && psx < sx - s.ax + s.c.width - 8 && psy > sy - s.ay + 6 && psy < sy) alpha = 0.5;
    g.globalAlpha = alpha; g.drawImage(s.c, sx - s.ax, sy - s.ay); g.globalAlpha = 1;
    if (air && v.state !== 'wreck') this.drawRotor(g, v, sx, sy);
    if (v.boat && Math.abs(v.v) > 0.6) { g.globalAlpha = 0.5; g.fillStyle = '#e8f2f6'; const ca = Math.cos(v.a), sa = Math.sin(v.a); for (const k of [-1, 1]) { const bx = v.x + ca * v.T.len * 0.45 - sa * k * v.T.wid * 0.45, by = v.y + sa * v.T.len * 0.45 + ca * k * v.T.wid * 0.45; g.fillRect(Math.round(isoX(bx, by) - this.camX) - 1, Math.round(isoY(bx, by) - this.camY) - 1, 3, 2); } g.globalAlpha = 1; }
    // occupants' heads
    if (v.state !== 'wreck' && !air) { let k = 0; for (const seat of v.seats) { if (seat) { g.fillStyle = '#d8b090'; g.fillRect(sx - 2 + (k % 2) * 4 - 2, sy - 16 - (k >> 1) * 2, 3, 3); } k++; } }
  }
  // spinning main rotor (helicopters) or propeller (planes); speed follows engine spool
  drawRotor(g, v, sx, sy) {
    const sp = v.spool || 0, rot = v.rotor || 0;
    if (v.T.air === 'heli') {
      const R = v.vk === 'gyro' ? 1.45 : 2.0, hz = v.vk === 'gyro' ? 38 : 42, cy = sy - hz;
      if (sp > 0.35) { g.globalAlpha = 0.18 * sp; g.fillStyle = '#c8ccd0'; g.beginPath(); g.ellipse(sx, cy, R * 16 * 1.41, R * 8 * 1.41, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = sp > 0.6 ? 0.45 : 0.95; g.strokeStyle = '#2a2c2e'; g.lineWidth = 2;
      const nb = v.vk === 'gyro' ? 2 : 3;
      for (let i = 0; i < nb; i++) { const a = rot + i * Math.PI * 2 / nb, dx = Math.cos(a) * R, dy = Math.sin(a) * R; g.beginPath(); g.moveTo(sx, cy); g.lineTo(sx + (dx - dy) * 16, cy + (dx + dy) * 8); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = '#3a3c40'; g.fillRect(sx - 1, cy - 1, 3, 3);
    } else {
      const ca = Math.cos(v.a), sa = Math.sin(v.a), L = v.vk === 'plane' ? 2.25 : -0.6, px = v.x + ca * L, py = v.y + sa * L;
      const ox = Math.round(isoX(px, py) - this.camX), oy = Math.round(isoY(px, py) - this.camY) - (sy0Shift(v)) - (v.vk === 'plane' ? 16 : 10);
      const r = v.vk === 'plane' ? 11 : 8, px2 = -sa, py2 = ca; // blade direction is across the heading
      if (sp > 0.3) { g.globalAlpha = 0.22 * sp; g.fillStyle = '#d0d4d8'; g.beginPath(); g.ellipse(ox, oy, Math.max(2, Math.abs((px2 - py2) * r)), r * 0.9, 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = sp > 0.6 ? 0.5 : 0.95; g.strokeStyle = '#26282a'; g.lineWidth = 2;
      const c = Math.cos(rot * 1.6), s2 = Math.sin(rot * 1.6);
      g.beginPath(); g.moveTo(ox - (px2 - py2) * r * c * 0.9, oy - r * s2 * 0.9); g.lineTo(ox + (px2 - py2) * r * c * 0.9, oy + r * s2 * 0.9); g.stroke();
      g.globalAlpha = 1;
    }
  }
  drawPickup(g, p) {
    const ic = A.icons[p.item]; if (!ic) return;
    const sx = Math.round(isoX(p.x, p.y) - this.camX), sy = Math.round(isoY(p.x, p.y) - this.camY - 4 - Math.abs(Math.sin(this.time * 3 + p.x)) * 3);
    g.globalAlpha = 0.25; g.drawImage(this.shadow, sx - 5, sy + 2, 10, 4); g.globalAlpha = 1;
    const h = 14, w = Math.round(ic.width * h / ic.height); g.drawImage(ic, sx - (w >> 1), sy - 12, w, h);
  }
  drawProj(g, p) {
    const sx = Math.round(isoX(p.x, p.y) - this.camX), sy = Math.round(isoY(p.x, p.y) - this.camY - (p.z || 0));
    if (p.kind === 'acid') { g.fillStyle = '#9ee040'; g.fillRect(sx - 1, sy - 1, 3, 3); g.fillStyle = '#e0ff90'; g.fillRect(sx, sy - 1, 1, 1); return; }
    const W = A.weapons[p.kind]; if (!W) return;
    g.save(); g.translate(sx, sy); if (!p.landed) g.rotate(p.rot || 0); g.drawImage(W.c, -W.c.width / 2, -W.c.height / 2); g.restore();
    if ((p.kind === 'pipebomb' || p.kind === 'decoy') && p.landed && (this.time * (p.kind === 'decoy' ? 4 : 6) | 0) % 2) { g.fillStyle = '#ff3020'; g.fillRect(sx, sy - 4, 2, 2); }
  }
  drawHeli(g, G) {
    const H = G.heli, t = H.t;
    const hz = H.phase === 'in' ? Math.max(0, 120 - t * 20) : H.phase === 'land' ? 0 : (H.t2 || 0) * 30;
    const off = H.phase === 'in' ? Math.max(0, (6 - t) * 6) : H.phase === 'out' ? -(H.t2 || 0) * 3 : 0;
    const x = H.x + off, y = H.y - off * 0.3;
    const sx = Math.round(isoX(x, y) - this.camX), sy = Math.round(isoY(x, y) - this.camY);
    g.globalAlpha = 0.35; g.drawImage(this.shadowBig, sx - 28, sy - 8, 56, 18); g.globalAlpha = 1;
    const by = sy - 22 - hz;
    g.drawImage(A.heli(), sx - 30, by - 4);
    const r = this.time * 26;
    g.fillStyle = 'rgba(20,22,18,0.25)'; g.beginPath(); g.ellipse(sx - 2, by - 3, 40, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(25,25,22,0.9)'; g.lineWidth = 1;
    for (let k = 0; k < 2; k++) { const a2 = r + k * Math.PI / 2; g.beginPath(); g.moveTo(sx - 2 - Math.cos(a2) * 40, by - 3 - Math.sin(a2) * 6); g.lineTo(sx - 2 + Math.cos(a2) * 40, by - 3 + Math.sin(a2) * 6); g.stroke(); }
  }
  drawGhost(g, G) {
    const m = G.mouseWorld, tx = Math.floor(m.x), ty = Math.floor(m.y);
    const o = { t: G.buildSel, x: tx, y: ty, v: (tx * 7 + ty * 3) % 4, hp: TZ.BUILD[G.buildSel].hp, planted: -1e9 };
    const spr = objSprite(o, { world: G.world, gardenProgress: () => 0, me: G.me, gateOpen: () => false }); if (!spr) return;
    const err = G.canPlace(G.buildSel, tx, ty) || (!G.canAfford(TZ.BUILD[G.buildSel].cost) ? 'Не хватает ресурсов' : null);
    const sx = Math.round(isoX(tx, ty) - this.camX), sy = Math.round(isoY(tx, ty) - this.camY);
    g.globalAlpha = 0.5; g.fillStyle = err ? '#e03020' : '#40e070';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 16, sy + 8); g.lineTo(sx, sy + 16); g.lineTo(sx - 16, sy + 8); g.closePath(); g.fill();
    g.globalAlpha = 0.65; g.drawImage(TZ.tint(spr.c, err ? 'rgba(255,60,40,0.45)' : 'rgba(80,255,120,0.3)'), sx - spr.ax, sy - spr.ay); g.globalAlpha = 1;
    this.ghostErr = err; this.ghostPos = { x: tx, y: ty };
  }
  drawLighting(G) {
    const g = this.v.g, L = this.lc.g, VW = this.VW, VH = this.VH, cx = this.camX, cy = this.camY, P = G.me;
    const dark = G.demo ? 0.74 : G.darkness();
    const biome = G.world.biomeAt(P.x, P.y);
    const day = biome === 2 ? [236, 242, 255] : biome === 5 ? [255, 238, 206] : biome === 4 ? [255, 240, 214] : biome === 3 ? [214, 230, 210] : [255, 250, 238], dusk = [250, 160, 112], night = biome === 2 ? [64, 78, 126] : [54, 64, 112];
    let amb = dark < 0.5 ? TZ.mix(day, dusk, dark * 2) : TZ.mix(dusk, night, (dark - 0.5) * 2);
    const rain = G.weather.rain; if (rain > 0 && biome < 4) amb = amb.map(v => v * (1 - rain * 0.22));
    const dust = G.weather.dust || 0; if (dust > 0.05) amb = TZ.mix(amb, [200, 150, 96], dust * 0.4);
    if (G.weather.fog > 0.05) amb = amb.map(v => v * (1 - G.weather.fog * 0.15));
    if (!G.demo && P.eq && P.eq.head === 'nvg' && !P.dead && dark > 0.12) amb = TZ.mix(amb, [118, 226, 128], Math.min(0.82, dark * 0.9)); // night vision
    if (dark < 0.02 && rain < 0.02 && G.weather.fog < 0.05 && dust < 0.05 && biome !== 2 && biome !== 4 && biome !== 3 && biome !== 5) return;
    L.globalCompositeOperation = 'source-over';
    L.fillStyle = TZ.rgb(amb); L.fillRect(0, 0, VW, VH);
    L.globalCompositeOperation = 'lighter';
    const fl = (Math.sin(this.time * 13) + Math.sin(this.time * 7.3)) * 0.04;
    const hidden = this._hidden;
    const light = (x, y, r, col, inten = 1, zo = 0) => {
      if (inten <= 0.01) return;
      if (hidden && hidden(x, y)) return;
      const sx = isoX(x, y) - cx, sy = isoY(x, y) - cy - zo, rp = r * 16;
      if (sx < -rp || sx > VW + rp || sy < -rp || sy > VH + rp) return;
      L.save(); L.translate(sx, sy); L.scale(1, 0.62);
      const gr = L.createRadialGradient(0, 0, 0, 0, 0, rp);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.95 * inten})`); gr.addColorStop(0.45, `rgba(${col[0]},${col[1]},${col[2]},${0.45 * inten})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = gr; L.fillRect(-rp, -rp, rp * 2, rp * 2); L.restore();
    };
    const ls = clamp(dark * 1.3, 0, 1);
    for (const o of G.structures) {
      const B = TZ.BUILD[o.t]; if (!B || !B.light) continue;
      if (o.t === 'campfire') light(o.x + .5, o.y + .5, B.light * (1 + fl), [255, 150, 70], ls);
      else if (o.t === 'torch') light(o.x + .5, o.y + .5, B.light * (1 + fl * 1.5), [255, 160, 80], ls, 6);
      else light(o.x + .5, o.y + .5, B.light, [230, 235, 255], ls);
    }
    // wild lights: campfires in camps, military floodlights, lampposts in towns (dim)
    if (this._wildV !== G.world.version) { this._wildV = G.world.version; this._wild = []; for (const c of G.world.chunks.values()) for (const o of c.obj) if (o && o.wild && (o.t === 'floodlight' || o.t === 'campfire')) this._wild.push(o); }
    for (const o of this._wild) light(o.x + .5, o.y + .5, o.t === 'campfire' ? 7 * (1 + fl) : 9, o.t === 'campfire' ? [255, 150, 70] : [220, 230, 255], ls * 0.85);
    for (const f of G.combat.fires) light(f.x, f.y, 4.5 * (1 + fl), [255, 130, 50], Math.min(1, f.life) * Math.max(ls, 0.4));
    for (const l of G.fx.lights) light(l.x, l.y, l.r, [255, 210, 140], (l.life / l.max) * 1.2);
    for (const z of G.zombies) if (z.burn > 0 && !z.dead) light(z.x, z.y, 2.5, [255, 140, 60], ls);
    for (const t of G.structures) if ((t.t === 'turret' || t.t === 'turret_heavy') && t.flash > 0) light(t.x + .5, t.y + .5, 3, [255, 210, 140], 1);
    if (G.dropAt) light(G.dropAt.x, G.dropAt.y, 3, [255, 70, 50], ls * (0.7 + Math.sin(this.time * 6) * 0.3));
    for (const f of G.flares || []) light(f.x, f.y, 10 * (1 + fl * 2), [255, 90, 70], Math.min(1, f.t / 3) * Math.max(ls, 0.35), 10);
    for (const p of G.combat.proj) if (p.kind === 'decoy' && p.landed) light(p.x, p.y, 2.2, [255, 60, 40], (this.time * 4 | 0) % 2 ? ls : 0);
    for (const v of G.vehicles) {
      if (v.state === 'wreck') { if (v.burnT > 0) light(v.x, v.y, 4, [255, 120, 40], Math.max(ls, 0.5)); continue; }
      const on = (v.driver || v.seats && v.seats[0]) && v.canStart() && !(v.alt > 0.08);
      if (on) {
        const ca = Math.cos(v.a), sa = Math.sin(v.a), fx = v.x + ca * v.T.len * 0.47, fy = v.y + sa * v.T.len * 0.47, ox = -sa * v.T.wid * 0.33, oy = ca * v.T.wid * 0.33;
        for (const k of [-1, 1]) { const lx = fx + ox * k, ly = fy + oy * k; this.cone(L, lx, ly, v.a + k * 0.04, v.vk === 'buggy' && v.mods && v.mods.light ? 15 : 12, 0.3, ls * 0.9, [255, 244, 210], 0.15); light(lx, ly, 1.1, [255, 240, 200], ls); }
        const bx = v.x - ca * v.T.len * 0.48, by = v.y - sa * v.T.len * 0.48, braking = v.braking || v.v < -0.3;
        for (const k of [-1, 1]) light(bx + ox * k, by + oy * k, braking ? 1.6 : 0.9, [255, 40, 30], Math.max(ls, braking ? 0.6 : 0) * (braking ? 1 : 0.6));
        if (v.vk === 'police') { const ph = (this.time * 4 | 0) % 2; light(v.x - ca * 0.2 + ox * 0.5, v.y - sa * 0.2 + oy * 0.5, 4, ph ? [255, 40, 40] : [40, 80, 255], 0.9, 18); }
      }
    }
    for (const p of G.players.values()) {
      if (p.dead || (G.demo)) continue;
      if (p === P && !p.vehicle) light(p.x, p.y, 2.6, [150, 150, 170], ls * 0.55);
      if (p.flash > 0) light(p.x, p.y, 5, [255, 210, 140], 1);
      if (p.light && !p.vehicle) this.cone(L, p.x, p.y, p.ang, 10, 0.55, ls, [255, 250, 220]);
      const hw = p === P ? P.weapon : p.netW; if (hw === 'torch_h' && !p.vehicle) light(p.x + Math.cos(p.ang) * 0.3, p.y + Math.sin(p.ang) * 0.3, 6 * (1 + fl * 2), [255, 150, 70], Math.max(ls, 0.25), 14);
    }
    for (const a of G.allies) if (!a.dead && !a.inCar) { light(a.x, a.y, 1.8, [140, 150, 170], ls * 0.4); if (a.flash > 0) light(a.x, a.y, 4, [255, 210, 140], 1); }
    if (G.heli) light(G.heli.x, G.heli.y, 7, [230, 240, 255], ls);
    if (G.demo) for (const p of (G.demoLights || [])) light(p.x, p.y, p.r * (1 + fl), p.c, 1, p.z || 0);
    g.globalCompositeOperation = 'multiply'; g.drawImage(this.lc, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (const o of G.structures) if (o.t === 'campfire' || o.t === 'torch') {
      const sx = isoX(o.x + .5, o.y + .5) - cx, sy = isoY(o.x + .5, o.y + .5) - cy - (o.t === 'torch' ? 20 : 5);
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, o.t === 'torch' ? 9 : 16);
      gr.addColorStop(0, `rgba(255,140,50,${0.35 * ls + 0.05})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(sx - 16, sy - 16, 32, 32);
    }
    g.globalCompositeOperation = 'source-over';
  }
  // light cone drawn in world space through the isometric matrix, so beams keep their shape in every direction
  cone(L, x, y, a, len, spread, inten, col, start = 0) {
    if (inten <= 0.01) return;
    L.save(); L.transform(16, 8, -16, 8, -this.camX, -this.camY); L.translate(x, y); L.rotate(a);
    L.beginPath(); L.moveTo(start, -0.12); L.arc(0, 0, len, -spread, spread); L.lineTo(start, 0.12); L.closePath();
    const gr = L.createRadialGradient(0, 0, start, 0, 0, len);
    gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.95 * inten})`); gr.addColorStop(0.3, `rgba(${col[0]},${col[1]},${col[2]},${0.62 * inten})`); gr.addColorStop(0.7, `rgba(${col[0]},${col[1]},${col[2]},${0.22 * inten})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = gr; L.fill(); L.restore();
  }
  drawWeather(g, G, dt) {
    if (TZ.settings.weatherFx === false) return;
    const snow = G.weather.snow, rain = snow > 0.1 ? 0 : (G.world.biomeAt(G.me.x, G.me.y) >= 4 ? 0 : G.weather.rain);
    const want = Math.floor(rain * 220 + snow * 160);
    while (this.rain.length < want) this.rain.push({ x: Math.random() * this.VW, y: Math.random() * this.VH, l: 4 + Math.random() * 4, s: 260 + Math.random() * 100, ph: Math.random() * 6 });
    this.rain.length = Math.min(this.rain.length, want);
    if (snow > 0.1) {
      g.fillStyle = 'rgba(245,248,255,0.85)';
      for (const d of this.rain) { d.y += d.s * dt * 0.12; d.x += Math.sin(this.time * 1.3 + d.ph) * dt * 12 - dt * 8; if (d.y > this.VH) { d.y = -4; d.x = Math.random() * this.VW; } if (d.x < -4) d.x += this.VW + 8; g.fillRect(Math.round(d.x), Math.round(d.y), d.l > 6 ? 2 : 1, d.l > 6 ? 2 : 1); }
    } else if (rain > 0.02) {
      g.strokeStyle = 'rgba(170,190,220,0.45)'; g.lineWidth = 1; g.beginPath();
      for (const d of this.rain) { d.y += d.s * dt; d.x -= d.s * dt * 0.25; if (d.y > this.VH) { d.y = -8; d.x = Math.random() * (this.VW + 60); } if (d.x < -10) d.x += this.VW + 20; g.moveTo(Math.round(d.x), Math.round(d.y)); g.lineTo(Math.round(d.x + d.l * 0.25), Math.round(d.y - d.l)); }
      g.stroke(); g.fillStyle = `rgba(30,40,60,${rain * 0.12})`; g.fillRect(0, 0, this.VW, this.VH);
    }
    const dust = G.weather.dust || 0;
    if (dust > 0.04) { // sandstorm: streaks of sand blowing sideways + haze
      if (!this.sand) this.sand = [];
      const n = Math.floor(dust * 260); while (this.sand.length < n) this.sand.push({ x: Math.random() * this.VW, y: Math.random() * this.VH, s: 180 + Math.random() * 220, l: 3 + Math.random() * 9 }); this.sand.length = Math.min(this.sand.length, n);
      for (const d of this.sand) { d.x += d.s * dt; d.y += Math.sin(this.time * 2 + d.l) * dt * 14; if (d.x > this.VW + 10) { d.x = -10; d.y = Math.random() * this.VH; } g.fillStyle = d.l > 8 ? 'rgba(150,100,56,0.6)' : 'rgba(255,240,206,0.8)'; g.fillRect(Math.round(d.x), Math.round(d.y), Math.round(d.l), 1); }
      for (let i = 0; i < 5; i++) { const x = ((this.time * 90 + i * 211) % (this.VW + 300)) - 150, y = (i * 71 + Math.sin(this.time * 0.4 + i) * 30) % this.VH; const gr = g.createRadialGradient(x, y, 0, x, y, 160); gr.addColorStop(0, `rgba(214,160,96,${0.35 * dust})`); gr.addColorStop(1, 'rgba(200,150,90,0)'); g.fillStyle = gr; g.fillRect(x - 160, y - 160, 320, 320); }
      g.fillStyle = `rgba(196,140,76,${0.34 * dust})`; g.fillRect(0, 0, this.VW, this.VH);
      const vg = g.createRadialGradient(this.VW / 2, this.VH / 2, this.VH * 0.25, this.VW / 2, this.VH / 2, this.VW * 0.6); vg.addColorStop(0, 'rgba(170,110,60,0)'); vg.addColorStop(1, `rgba(150,96,50,${0.6 * dust})`); g.fillStyle = vg; g.fillRect(0, 0, this.VW, this.VH);
    }
    if (G.weather.fog > 0.05) {
      const f = G.weather.fog;
      for (let i = 0; i < 6; i++) { const x = ((this.time * 6 + i * 97) % (this.VW + 200)) - 100, y = (i * 53 + Math.sin(this.time * 0.3 + i) * 20) % this.VH; const gr = g.createRadialGradient(x, y, 0, x, y, 120); gr.addColorStop(0, `rgba(170,190,170,${0.18 * f})`); gr.addColorStop(1, 'rgba(170,190,170,0)'); g.fillStyle = gr; g.fillRect(x - 120, y - 120, 240, 240); }
      g.fillStyle = `rgba(140,160,140,${0.1 * f})`; g.fillRect(0, 0, this.VW, this.VH);
    }
  }
  drawOverlay(g, G) {
    const S = this.scale, cx = this.camX, cy = this.camY, P = G.me;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of G.fx.texts) {
      const sx = (isoX(t.x, t.y) - cx) * S, sy = (isoY(t.x, t.y) - cy - t.z) * S;
      g.globalAlpha = clamp(t.life * 2, 0, 1); g.font = `${t.big ? 26 : 18}px "Tiny5", monospace`;
      g.fillStyle = '#000'; g.fillText(t.t, sx + 2, sy + 2); g.fillStyle = t.c; g.fillText(t.t, sx, sy);
    }
    g.globalAlpha = 1;
    if (G.demo) return;
    g.font = '17px "Tiny5", monospace';
    const tag = (x, y, z, label, col) => { const sx = (isoX(x, y) - cx) * S, sy = (isoY(x, y) - cy - z) * S; const w = g.measureText(label).width + 12; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(sx - w / 2, sy - 10, w, 20); g.fillStyle = col; g.fillText(label, sx, sy); };
    const underRoof = (e) => G.world.roofAt(e.x, e.y) && !(this.roofHide && this.roofHide.has(Math.floor(e.x) * 131071 + Math.floor(e.y)));
    if (TZ.settings.showNames !== false) for (const a of G.allies) { if (a.dead || a.inCar || (this._hidden && this._hidden(a.x, a.y)) || underRoof(a)) continue; const d = dist(a.x, a.y, P.x, P.y); if (d > (a.owner ? 7 : 12)) continue; tag(a.x, a.y, 42, a.name + (a.owner && a.owner !== P.uid ? ' · чужой' : a.mode === 'guard' ? ' · охрана' : ''), a.owner === P.uid ? '#8fe0ff' : a.owner ? '#c0c0c0' : '#ffd24a'); }
    if (TZ.settings.showNames !== false) for (const p of G.players.values()) { if (p === P || p.dead || (this._hidden && this._hidden(p.x, p.y)) || underRoof(p)) continue; const r = TZ.Account.rankOf((p.profile && p.profile.rn) || 1000); const z0 = p.vehicle ? 30 : 44; tag(p.x, p.y, z0, `${p.name} · ${TZ.Account.levelOf((p.profile && p.profile.rn) || 1000)}`, r.color); const ct = G.clanOf && G.clanOf(p.uid); if (ct) { const mate = G.clanOf(P.uid) === ct; tag(p.x, p.y, z0 + 9, (mate ? '★ ' : '') + ct.name, ct.color); } }
    if (G.detSignal != null && P.weapon === 'detector' && !P.dead) {
      const sx = (isoX(P.x, P.y) - cx) * S, sy = (isoY(P.x, P.y) - cy - 52) * S, n = 10, on = Math.round(G.detSignal * n);
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(sx - 44, sy - 9, 88, 18);
      for (let i = 0; i < n; i++) { g.fillStyle = i < on ? (i < 4 ? '#58c068' : i < 7 ? '#e8c030' : '#f05030') : '#333'; g.fillRect(sx - 40 + i * 8, sy - 5 + (n - i) * 0.4, 6, 10 - (n - i) * 0.4); }
    }
    if (G.search) {
      const s = G.search, x = s.animal ? s.animal.x : s.x + .5, y = s.animal ? s.animal.y : s.y + .5;
      const sx = (isoX(x, y) - cx) * S, sy = (isoY(x, y) - cy - 26) * S, w = 80, f = s.t / s.dur;
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(sx - w / 2 - 3, sy - 8, w + 6, 16); g.fillStyle = '#e8b030'; g.fillRect(sx - w / 2, sy - 5, w * f, 10);
      g.fillStyle = '#fff'; g.font = '15px "Tiny5", monospace'; g.fillText(s.animal ? 'Разделка...' : 'Обыск...', sx, sy - 18);
    }
    const marks = G.questMarkers(); let nearest = null, nd = 1e9;
    for (const m of marks) {
      const sx = (isoX(m.x, m.y) - cx) * S, sy = (isoY(m.x, m.y) - cy - 34) * S, on = sx > 20 && sy > 20 && sx < this.cv.width - 20 && sy < this.cv.height - 20;
      if (on) { const b = Math.sin(this.time * 5) * 5; g.fillStyle = m.c; g.beginPath(); g.moveTo(sx - 8, sy - 12 + b); g.lineTo(sx + 8, sy - 12 + b); g.lineTo(sx, sy + b); g.fill(); }
      const d = dist(m.x, m.y, P.x, P.y); if (d < nd) { nd = d; nearest = { m, sx, sy, on }; }
    }
    if (nearest && !nearest.on) {
      const W2 = this.cv.width / 2, H2 = this.cv.height / 2, a = Math.atan2(nearest.sy - H2, nearest.sx - W2), r = Math.min(W2, H2) - 70;
      const ax = W2 + Math.cos(a) * r, ay = H2 + Math.sin(a) * r;
      g.save(); g.translate(ax, ay); g.rotate(a); g.fillStyle = nearest.m.c; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -11); g.lineTo(-3, 0); g.lineTo(-8, 11); g.closePath(); g.fill(); g.restore();
      g.globalAlpha = 1; g.font = '16px "Tiny5", monospace'; g.fillStyle = '#fff'; g.fillText(Math.round(nd) + ' м', ax - Math.cos(a) * 26, ay - Math.sin(a) * 26);
    }
    if (G.mode === 'build' && this.ghostPos) { const B = TZ.BUILD[G.buildSel], m = TZ.input.mouse; g.font = '17px "Tiny5", monospace'; g.textAlign = 'left'; const txt = this.ghostErr || B.name; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(m.x + 18, m.y + 14, g.measureText(txt).width + 12, 22); g.fillStyle = this.ghostErr ? '#ff8070' : '#a0f0a0'; g.fillText(txt, m.x + 24, m.y + 26); g.textAlign = 'center'; }
    // vehicle HUD
    if (P.vehicle) {
      const v = G.vehicles.find(v => v.id === P.vehicle);
      if (v) {
        const k = TZ.uiz || 1; g.save(); g.scale(k, k);
        const x = this.cv.width / k / 2, y = this.cv.height / k - 58, w = 460, h = 64, x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
        g.fillStyle = '#060705'; g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4); g.fillStyle = '#1a1d16'; g.fillRect(x0, y0, w, h);
        g.fillStyle = '#686e54'; g.fillRect(x0, y0, w, 2); g.fillRect(x0, y0, 2, h); g.fillStyle = '#22241c'; g.fillRect(x0, y0 + h - 2, w, 2); g.fillRect(x0 + w - 2, y0, 2, h);
        const kmh = Math.round(Math.abs(v.v) * 6);
        g.textAlign = 'right'; g.font = '34px "Tiny5", monospace'; g.fillStyle = '#000'; g.fillText(kmh, x0 + 92, y0 + 42); g.fillStyle = '#ffd24a'; g.fillText(kmh, x0 + 90, y0 + 40);
        g.textAlign = 'left'; g.font = '14px "Tiny5", monospace'; g.fillStyle = '#a8a690'; g.fillText('км/ч', x0 + 96, y0 + 40);
        g.font = '16px "Tiny5", monospace'; g.fillStyle = '#e6e2d4'; g.fillText(v.T.name + (v.v < -0.2 ? '  [R]' : ''), x0 + 14, y0 + 58 - 2);
        const bar = (bx, label, f, col) => { g.fillStyle = '#a8a690'; g.font = '14px "Tiny5", monospace'; g.fillText(label, bx, y0 + 20); g.fillStyle = '#060705'; g.fillRect(bx - 1, y0 + 26, 122, 14); g.fillStyle = '#2a2c22'; g.fillRect(bx, y0 + 27, 120, 12); const n = Math.round(12 * clamp(f, 0, 1)); g.fillStyle = col; for (let k = 0; k < n; k++) g.fillRect(bx + 1 + k * 10, y0 + 28, 8, 10); };
        const hr = v.hp / v.T.hp;
        bar(x0 + 166, 'Корпус ' + Math.round(hr * 100) + '%', hr, hr > 0.5 ? '#6fd04a' : hr > 0.25 ? '#e8b030' : '#e03a2a');
        bar(x0 + 300, 'Топливо', v.fuel / v.T.fuel, '#e8a92a');
        const probs = v.problems ? v.problems() : [];
        g.font = '13px "Tiny5", monospace'; g.fillStyle = probs.length ? '#ff8070' : '#7dff8a'; g.fillText(probs.length ? '! ' + probs.join(', ') : 'Двигатель в норме', x0 + 166, y0 + 56);
        if (hr < 0.25 && (performance.now() / 300 | 0) % 2) { g.fillStyle = 'rgba(224,58,42,.25)'; g.fillRect(x0, y0, w, h); }
        g.textAlign = 'center'; g.restore();
      }
    }
    if (!G.paused && G.mode !== 'dead' && !G.uiBlocking && !P.vehicle) {
      const m = TZ.input.mouse, W2 = TZ.WEAPONS[P.weapon], sp = W2.spread ? 6 + W2.spread * 120 : 6;
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4; this.cross(g, m.x, m.y, sp);
      g.strokeStyle = G.mode === 'build' ? '#9ff0a0' : '#ff5040'; g.lineWidth = 2; this.cross(g, m.x, m.y, sp);
      if (P.reload > 0) { g.strokeStyle = '#ffd24a'; g.lineWidth = 3; g.beginPath(); g.arc(m.x, m.y, sp + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - P.reload / P.reloadTotal)); g.stroke(); }
    }
  }
  cross(g, x, y, s) { g.beginPath(); g.moveTo(x - s - 7, y); g.lineTo(x - s, y); g.moveTo(x + s, y); g.lineTo(x + s + 7, y); g.moveTo(x, y - s - 7); g.lineTo(x, y - s); g.moveTo(x, y + s); g.lineTo(x, y + s + 7); g.stroke(); g.fillStyle = g.strokeStyle; g.fillRect(x - 1, y - 1, 2, 2); }
}
TZ.Renderer = Renderer;

// ---------------------------------------------------------------- tile colours for maps
const GC = { 0: [74, 92, 46], 1: [96, 98, 52], 2: [104, 82, 58], 3: [60, 60, 64], 4: [60, 60, 64], 5: [112, 110, 104], 6: [120, 86, 56], 7: [110, 102, 86], 8: [56, 64, 36], 9: [130, 126, 116], 10: [60, 60, 64], 11: [80, 64, 46], 12: [220, 226, 236], 13: [190, 196, 206], 14: [160, 200, 222], 15: [44, 74, 100], 16: [70, 96, 80], 17: [184, 158, 114], 18: [156, 124, 88], 19: [72, 86, 52], 20: [130, 134, 144], 21: [100, 78, 52], 22: [116, 122, 58], 23: [60, 56, 50], 24: [120, 44, 40], 25: [214, 180, 120], 26: [194, 156, 100], 27: [180, 130, 88] };
TZ.tileColor = (W, x, y, chunk) => {
  const c = chunk || W.chunkIf(Math.floor(x / CH), Math.floor(y / CH)); if (!c) return null;
  const i = (y - c.y0) * CH + (x - c.x0); let col = GC[c.ground[i]] || [60, 60, 60];
  const o = c.obj[i];
  if (o) { const t = o.t, M = TZ.OBJ[t]; if (t === 'hwall') col = [176, 150, 128]; else if (M && M.tree) col = t === 'pine' ? [30, 56, 34] : t === 'spine' ? [150, 170, 170] : t === 'willow' ? [70, 90, 56] : [150, 84, 34]; else if (M && M.built && !o.wild) col = [236, 220, 170]; else if (M && M.solid) col = [96, 90, 84]; }
  return col;
};
// ---------------------------------------------------------------- minimap
class Minimap {
  constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.R = 64; this.base = TZ.canvas(this.R * 2, this.R * 2); this.t = 0; this.cx = 1e9; this.cy = 1e9; }
  rebuild(G) {
    const W = G.world, R = this.R, P = G.me, x0 = Math.floor(P.x) - R, y0 = Math.floor(P.y) - R;
    const id = this.base.g.createImageData(R * 2, R * 2), d = id.data;
    for (let j = 0; j < R * 2; j++) for (let i = 0; i < R * 2; i++) {
      const x = x0 + i, y = y0 + j, k = (j * R * 2 + i) * 4;
      if (G.hiddenAt && G.enclosures.size && G.hiddenAt(x, y)) { d[k] = 8; d[k + 1] = 8; d[k + 2] = 10; d[k + 3] = 255; continue; }
      const c = TZ.tileColor(W, x, y);
      if (!c) { d[k + 3] = 0; continue; }
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    this.base.g.putImageData(id, 0, 0); this.cx = x0; this.cy = y0;
  }
  draw(G, dt) {
    const P = G.me; this.t += dt;
    if (this.t > 0.5 || Math.abs(P.x - (this.cx + this.R)) > 12 || Math.abs(P.y - (this.cy + this.R)) > 12) { this.rebuild(G); this.t = 0; }
    const g = this.g, s = this.cv.width, c = s / 2, k = s / 64;
    g.clearRect(0, 0, s, s); g.save(); g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#10140e'; g.fillRect(0, 0, s, s);
    g.translate(c, c); g.rotate(Math.PI / 4); g.scale(k, k); g.imageSmoothingEnabled = false;
    g.drawImage(this.base, this.cx - P.x, this.cy - P.y);
    const dot = (x, y, col, r = 1.1) => { g.fillStyle = col; g.fillRect(x - P.x - r / 2, y - P.y - r / 2, r, r); };
    for (const z of G.zombies) if (!z.dead && dist2(z.x, z.y, P.x, P.y) < 2500 && !(G.hiddenAt && G.enclosures.size && G.hiddenAt(z.x, z.y))) dot(z.x, z.y, z.T.boss ? '#ff2020' : '#c03828', z.T.scale > 1.3 ? 2 : 1.2);
    for (const a of G.allies) if (!a.dead) dot(a.x, a.y, a.owner === P.uid ? '#5fd0ff' : a.owner ? '#a0a0a0' : '#ffd24a', 2);
    for (const v of G.vehicles) if (v.state !== 'wreck') dot(v.x, v.y, '#e8e0c0', 2.2);
    const myC = G.clanOf ? G.clanOf(P.uid) : null;
    for (const p of G.players.values()) {
      if (p === P || p.dead) continue;
      const mate = myC && myC.markers && myC.members.includes(p.uid);
      if (mate) { let dx = p.x - P.x, dy = p.y - P.y; const d = Math.hypot(dx, dy); if (d > 29) { dx *= 29 / d; dy *= 29 / d; } dot(P.x + dx, P.y + dy, '#000', 4.2); dot(P.x + dx, P.y + dy, myC.color, 3.2); }
      else if (dist2(p.x, p.y, P.x, P.y) < 26 * 26) dot(p.x, p.y, '#ffffff', 2.6);
    }
    for (const m of G.questMarkers()) dot(m.x, m.y, m.c, 2.4 + Math.sin(this.t * 6) * 0.6);
    if (G.dropAt) dot(G.dropAt.x, G.dropAt.y, (performance.now() / 250 | 0) % 2 ? '#ff4030' : '#ffffff', 3);
    g.restore();
    g.save(); g.translate(c, c); const sa = Math.atan2((Math.cos(P.ang) + Math.sin(P.ang)) * 8, (Math.cos(P.ang) - Math.sin(P.ang)) * 16); g.rotate(sa);
    g.fillStyle = '#7dff6a'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.stroke(); g.fill(); g.restore();
  }
}
TZ.Minimap = Minimap;
// ---------------------------------------------------------------- big map (explored chunks)
TZ.BigMap = class {
  constructor() { this.thumbs = new Map(); }
  thumb(G, k) {
    let t = this.thumbs.get(k); const c = G.world.chunks.get(k);
    if (t && (!c || t.ver === c.ver)) return t.c;
    const [cx, cy] = k.split(',').map(Number);
    const cv = t ? t.c : TZ.canvas(CH, CH), id = cv.g.createImageData(CH, CH), d = id.data;
    const W = G.world;
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
      const x = cx * CH + i, y = cy * CH + j, o = (j * CH + i) * 4;
      let col = c ? TZ.tileColor(W, x, y, c) : null;
      if (!col) col = GC[W.baseTile(x, y)] || [60, 60, 60];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    cv.g.putImageData(id, 0, 0);
    this.thumbs.set(k, { c: cv, ver: c ? c.ver : -1 });
    return cv;
  }
  draw(canvas, G, view) {
    const g = canvas.getContext('2d'), Wd = canvas.width, Hh = canvas.height;
    g.fillStyle = '#0a0c08'; g.fillRect(0, 0, Wd, Hh);
    const z = view.zoom, P = G.me;
    g.save(); g.translate(Wd / 2, Hh / 2); g.scale(z, z); g.translate(-view.x, -view.y); g.imageSmoothingEnabled = false;
    let n = 0;
    for (const k of G.world.explored) {
      const [cx, cy] = k.split(',').map(Number);
      const x = cx * CH, y = cy * CH;
      if ((x + CH - view.x) * z < -Wd / 2 || (x - view.x) * z > Wd / 2 || (y + CH - view.y) * z < -Hh / 2 || (y - view.y) * z > Hh / 2) continue;
      if (n++ > 900) break;
      g.drawImage(this.thumb(G, k), x, y);
    }
    // pois labels
    g.restore();
    const toS = (x, y) => [Wd / 2 + (x - view.x) * z, Hh / 2 + (y - view.y) * z];
    g.font = '15px "Tiny5", monospace'; g.textAlign = 'center';
    const seenP = new Set();
    for (const k of G.world.explored) { const [cx, cy] = k.split(',').map(Number); for (const p of G.world.poisNear(cx * CH, cy * CH, cx * CH + CH - 1, cy * CH + CH - 1)) { if (seenP.has(p.id) || p.type === 'roadjunk') continue; seenP.add(p.id); const [sx, sy] = toS(p.x + p.w / 2, p.y + p.h / 2); if (sx < 0 || sy < 0 || sx > Wd || sy > Hh) continue; const name = POI_NAMES[p.type] || ''; if (!name) continue; g.fillStyle = 'rgba(0,0,0,.6)'; const w = g.measureText(name).width + 8; g.fillRect(sx - w / 2, sy - 9, w, 18); g.fillStyle = '#ffe8a0'; g.fillText(name, sx, sy + 1); } }
    for (const o of G.structures) if ((o.t === 'bed' || o.t === 'sleepbag') && o.owner === P.uid) { const [sx, sy] = toS(o.x, o.y); g.fillStyle = '#7dff6a'; g.fillRect(sx - 4, sy - 4, 8, 8); }
    const myC = G.clanOf ? G.clanOf(P.uid) : null;
    for (const p of G.players.values()) {
      const mate = p !== P && myC && myC.markers && myC.members.includes(p.uid);
      if (p !== P && !mate) continue; // only clan members are shown on the world map
      const [sx, sy] = toS(p.x, p.y); g.fillStyle = p === P ? '#7dff6a' : myC.color; g.beginPath(); g.arc(sx, sy, p === P ? 6 : 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
      if (p !== P) { const t = p.name + (p.dead ? ' (погиб)' : ''); const w = g.measureText(t).width + 8; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(sx - w / 2, sy - 22, w, 16); g.fillStyle = myC.color; g.fillText(t, sx, sy - 13); }
    }
    for (const v of G.vehicles) if (v.state !== 'wreck' && v.owner === P.uid) { const [sx, sy] = toS(v.x, v.y); g.fillStyle = '#e8e0c0'; g.fillRect(sx - 3, sy - 2, 6, 4); }
    for (const p of G.pings || []) { const [sx, sy] = toS(p.x, p.y); const b = Math.sin(performance.now() / 160) * 3; g.fillStyle = p.color; g.beginPath(); g.moveTo(sx - 9, sy - 18 + b); g.lineTo(sx + 9, sy - 18 + b); g.lineTo(sx, sy + b); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.fillText(p.name, sx, sy - 24 + b); }
  }
};
const POI_NAMES = { town: 'Город', snowtown: 'Посёлок', gas: 'Заправка', checkpoint: 'Блокпост', milbase: 'Военная база', cabin: 'Хижина', camp: 'Лагерь', farm: 'Ферма', garage: 'Автосервис', junkyard: 'Свалка', stilts: 'Деревня на сваях', helicrash: 'Крушение', lake: 'Домик у озера', lab: 'Лаборатория', start: 'Старт' };
TZ.POI_NAMES = POI_NAMES;
})();
