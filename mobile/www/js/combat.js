// =====================================================================
//  THE ZOMBIES 2.0 — combat & effects
// =====================================================================
'use strict';
(() => {
// ---------------------------------------------------------------- FX (local visuals)
class FX {
  constructor() { this.parts = []; this.decals = []; this.texts = []; this.lights = []; }
  add(p) { const q = (TZ.settings && TZ.settings.particles) || 1; if (this.parts.length < 1800 * q && (q >= 1 || p.type === 'fire' || Math.random() < q)) this.parts.push(p); }
  blood(x, y, n = 6, spread = 1, dirA = null, green) {
    for (let i = 0; i < n; i++) {
      const a = dirA == null ? Math.random() * 6.28 : dirA + (Math.random() - 0.5) * 1.2, s = (0.5 + Math.random() * 2.5) * spread;
      this.add({ x, y, z: 8 + Math.random() * 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 10 + Math.random() * 25, g: 90, life: 0.6 + Math.random() * 0.4, max: 1, c: green ? (Math.random() < .5 ? '#6a9a20' : '#8fc030') : (Math.random() < .5 ? '#8e1410' : '#b21c16'), s: Math.random() < .3 ? 2 : 1, type: 'blood' });
    }
    if (Math.random() < 0.6 * spread) this.decal(x + (Math.random() - .5) * 0.6, y + (Math.random() - .5) * 0.6, green ? TZ.art.acid[(Math.random() * 3) | 0] : TZ.art.blood[(Math.random() * TZ.art.blood.length) | 0]);
  }
  decal(x, y, img, life = 240) { this.decals.push({ x, y, img, life, max: life }); if (this.decals.length > 320) this.decals.shift(); }
  sparks(x, y, n = 5, c = '#ffe08a', z = 10) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 3; this.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 10 + Math.random() * 30, g: 100, life: 0.25 + Math.random() * 0.25, max: 0.5, c, s: 1, type: 'spark' }); } }
  chips(x, y, n = 5, c = '#9a6a3c', z = 10) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 2.5; this.add({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 15 + Math.random() * 30, g: 110, life: 0.5 + Math.random() * 0.4, max: 0.9, c, s: Math.random() < .5 ? 2 : 1, type: 'chip' }); } }
  smoke(x, y, n = 3, z = 10, c = 'rgba(80,80,80,', big) { for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - .5) * .3, y: y + (Math.random() - .5) * .3, z, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, vz: 8 + Math.random() * 10, g: -2, life: 1.2 + Math.random(), max: 2.2, c, s: big ? 3 : 2, type: 'smoke' }); }
  fire(x, y, n = 2, z = 2) { for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - .5) * .4, y: y + (Math.random() - .5) * .4, z: z + Math.random() * 4, vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2, vz: 14 + Math.random() * 14, g: -6, life: 0.4 + Math.random() * 0.4, max: 0.8, c: '#ffb030', s: 1 + (Math.random() < .4), type: 'fire' }); }
  flame(x, y, vx, vy) { this.add({ x, y, z: 11, vx, vy, vz: 2, g: -4, life: 0.45 + Math.random() * 0.2, max: 0.6, c: '#ffb030', s: 2, type: 'fire' }); }
  shell(x, y, ang) { const a = ang + Math.PI / 2 + (Math.random() - .5) * .6; this.add({ x, y, z: 11, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8, vz: 25, g: 120, life: 0.9, max: 0.9, c: '#d8b050', s: 1, type: 'shell', bounce: 1 }); }
  boom(x, y, r) {
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * r * 2.2; this.add({ x, y, z: 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 10 + Math.random() * 50, g: 60, life: 0.4 + Math.random() * 0.5, max: 0.9, c: '#ffb030', s: 2, type: 'fire' }); }
    this.smoke(x, y, 14, 8, 'rgba(50,46,44,', true); this.sparks(x, y, 18, '#ffd070', 6);
    this.decal(x, y, TZ.art.scorch, 200);
    this.light(x, y, r * 3, 'rgba(255,200,120,', 0.4);
  }
  text(x, y, t, c = '#fff', big = false) { let z = 26; for (const o of this.texts) if (o.life > 0.95 && Math.abs(o.x - x) + Math.abs(o.y - y) < 1.2) z = Math.max(z, o.z + 9); this.texts.push({ x, y, t, c, life: 1.2, z, big }); }
  light(x, y, r, c, life) { this.lights.push({ x, y, r, c, life, max: life }); }
  update(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life -= dt;
      if (p.life <= 0) { if (p.type === 'blood' && Math.random() < 0.08) this.decal(p.x, p.y, TZ.art.blood[(Math.random() * 6) | 0], 120); P[i] = P[P.length - 1]; P.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt;
      if (p.z < 0) { p.z = 0; if (p.bounce) { p.vz = -p.vz * 0.35; p.vx *= .5; p.vy *= .5; } else { p.vx *= 0.2; p.vy *= 0.2; p.vz = 0; } }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) { const d = this.decals[i]; d.life -= dt; if (d.life <= 0) this.decals.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.z += dt * 18; if (t.life <= 0) this.texts.splice(i, 1); }
    for (let i = this.lights.length - 1; i >= 0; i--) { const l = this.lights[i]; l.life -= dt; if (l.life <= 0) this.lights.splice(i, 1); }
  }
}
TZ.FX = FX;

const matColor = t => t && (t.includes('metal') || t === 'turret' || t === 'turret_heavy' || t === 'gate_code' || t === 'door_code') ? '#9aa0a8' : t && (t.includes('stone') || t === 'sandbags' || t.includes('concrete')) ? '#a09c94' : '#9a6a3c';

// ---------------------------------------------------------------- COMBAT
class Combat {
  constructor(G) { this.G = G; this.bullets = []; this.proj = []; this.fires = []; }
  muzzle(e, ang) { return { x: e.x + Math.cos(ang) * 0.55, y: e.y + Math.sin(ang) * 0.55 }; }
  // local feedback for the shooter (client: visual-only tracers)
  localShotFx(e, W2, wid, angs) {
    const G = this.G, m = this.muzzle(e, angs[0]);
    G.fx.light(m.x, m.y, 4, 'rgba(255,200,120,', 0.07);
    if (W2.ammo !== 'ammo12' && !W2.flame && !W2.bolt) G.fx.shell(e.x, e.y, angs[0]);
    TZ.audio.shot(W2.sound, 1);
    if (G.role === 'client') this.spawnBullets(e, W2, wid, angs, 'vis', 1, true);
  }
  spawnBullets(e, W2, wid, angs, owner, dmgMul, vis) {
    const m = this.muzzle(e, angs[0]);
    for (const a of angs) {
      const sp = W2.speed * (0.9 + Math.random() * 0.2);
      this.bullets.push({ x: m.x, y: m.y, px: m.x, py: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: W2.dmg * dmgMul, range: W2.range * (0.85 + Math.random() * 0.3), pierce: W2.pierce || 1, owner, knock: W2.knock, hit: null, vis: !!vis, flame: !!W2.flame, bolt: W2.bolt ? W2.ammo : 0, flare: !!W2.flare, gl: W2.gl || null, life: 0 });
    }
  }
  // authoritative shot (damage); tells other machines to draw it
  fire(e, W2, wid, angs, owner, dmgMul = 1, fromPid) {
    const G = this.G;
    this.spawnBullets(e, W2, wid, angs, owner, dmgMul, false);
    if (!fromPid || fromPid !== G.me.pid) { const m = this.muzzle(e, angs[0]); G.fx.light(m.x, m.y, 4, 'rgba(255,200,120,', 0.07); TZ.audio.shot(W2.sound, G.audioVol(e.x, e.y)); }
    G.evq.push(['shot', +e.x.toFixed(2), +e.y.toFixed(2), angs.map(a => +a.toFixed(3)), wid, fromPid || owner]);
    G.noise(e.x, e.y, W2.noise);
  }
  remoteShot(x, y, angs, wid) { // client: draw other players'/allies' shots
    const W2 = TZ.WEAPONS[wid] || TZ.WEAPONS.pistol, e = { x, y };
    this.spawnBullets(e, W2, wid, angs, 'vis', 1, true);
    const m = this.muzzle(e, angs[0]); this.G.fx.light(m.x, m.y, 4, 'rgba(255,200,120,', 0.07);
    TZ.audio.shot(W2.sound, this.G.audioVol(x, y));
  }
  melee(e, W2, ang, ownerPid, wid, mx, my) {
    const G = this.G, W = G.world;
    let hitAny = false;
    const targets = [...G.zgrid.query(e.x, e.y, W2.range + 0.8, G._tmpC), ...G.animals.filter(a => !a.dead && dist2(a.x, a.y, e.x, e.y) < 9)];
    if (G.pvp) for (const p of G.players.values()) if (p.pid !== ownerPid && !p.dead && !p.vehicle) targets.push(p);
    for (const z of targets) {
      if (z.dead) continue;
      const d = dist(e.x, e.y, z.x, z.y); if (d > W2.range + z.r) continue;
      const a = Math.atan2(z.y - e.y, z.x - e.x);
      if (Math.abs(TZ.angDiff(ang, a)) > W2.arc / 2) continue;
      hitAny = true;
      const crit = Math.random() < 0.12, dmg = W2.dmg * (crit ? 2 : 1);
      if (z.kind === 'player') { G.hurtPlayer(z, dmg * 0.5, { by: ownerPid }); continue; }
      const sc = z.T && z.T.scale ? z.T.scale * z.T.scale : 1;
      z.kx = (z.kx || 0) + Math.cos(a) * W2.knock * 8 / sc; z.ky = (z.ky || 0) + Math.sin(a) * W2.knock * 8 / sc;
      G.ev('blood', z.x, z.y, 7, a);
      if (W2.ignite && z.kind !== 'player') { z.burn = Math.max(z.burn || 0, 3); z.burnBy = ownerPid; }
      z.damage(G, dmg, ownerPid, wid === 'chainsaw' ? 'saw' : 'melee');
      if (crit && wid !== 'chainsaw') G.ev('text', z.x, z.y, 'КРИТ!', '#ffd24a');
    }
    if (hitAny) G.ev('snd', wid === 'knife' || wid === 'machete' || wid === 'katana' ? 'slash' : 'hit_flesh', e.x, e.y);
    // gather / objects
    let tx = Math.floor(e.x + Math.cos(ang) * 0.9), ty = Math.floor(e.y + Math.sin(ang) * 0.9);
    let o = W.main(W.get(tx, ty));
    if (!o && mx != null) { const ax = Math.floor(mx), ay = Math.floor(my); if (Math.abs(ax - Math.floor(e.x)) <= 1 && Math.abs(ay - Math.floor(e.y)) <= 1) o = W.main(W.get(ax, ay)); }
    if (o) this.hitObject(o, W2, wid, hitAny, ownerPid, e);
    else if (W2.dig && !hitAny) G.digAt(ownerPid, tx, ty, mx, my);
    // vehicles & wrecks
    if (!hitAny && (W2.wreck || W2.mine || W2.chop)) for (const v of G.vehicles) if (v.contains(e.x + Math.cos(ang) * 1, e.y + Math.sin(ang) * 1, 0.3)) { if (v.state === 'wreck' && (W2.wreck || W2.mine)) G.dismantleHit(v, ownerPid, W2.wreck ? 2 : 1); break; }
  }
  hitObject(o, W2, wid, quiet, pid, e) {
    const G = this.G, W = G.world, M = TZ.OBJ[o.t];
    if (!M) return;
    if (M.tree) {
      if (!W2.chop) { if (!quiet) G.hintTo(pid, 'Нужен топор или бензопила, чтобы рубить деревья'); return; }
      o.hp = (o.hp ?? M.hp) - W2.chop;
      const n = W2.chop > 1 ? 2 : 1 + (Math.random() < 0.35 ? 1 : 0);
      G.giveTo(pid, { wood: n }, o.x + .5, o.y + .5);
      G.ev('chips', o.x + .5, o.y + .5, 6, '#a77446', 14);
      if (o.t === 'pine' || o.t === 'spine') G.ev('chips', o.x + .5, o.y + .5, 3, o.t === 'spine' ? '#e8f0ff' : '#3c6a40', 30);
      G.ev('snd', 'chop', o.x + .5, o.y + .5); G.ev('shake', o.x, o.y);
      if (o.hp <= 0) { W.set(o.x, o.y, { t: 'stump' }); G.giveTo(pid, { wood: 2 }, o.x + .5, o.y + .5); G.ev('snd', 'tree_fall', o.x + .5, o.y + .5); G.dirtyFlow = true; G.toPlayer(pid, 'stat', { k: 'trees', n: 1 }); }
      else W.touch(o);
    } else if (M.rock) {
      if (!W2.mine) { if (!quiet) G.hintTo(pid, 'Нужна кирка или кувалда, чтобы добывать камень'); return; }
      o.hp = (o.hp ?? M.hp) - 1;
      const loot = { stone: 1 + (Math.random() < .3 ? 1 : 0) };
      if (Math.random() < (M.ore ? 0.7 : 0.2)) loot.metal = 1 + (M.ore && Math.random() < .4 ? 1 : 0);
      G.giveTo(pid, loot, o.x + .5, o.y + .5);
      G.ev('chips', o.x + .5, o.y + .5, 6, '#8a8680', 8); G.ev('spark', o.x + .5, o.y + .5, 3);
      G.ev('snd', 'mine', o.x + .5, o.y + .5); G.ev('shake', o.x, o.y);
      if (o.hp <= 0) { W.clearObj(o.x, o.y); G.dirtyFlow = true; } else W.touch(o);
    } else if (M.cactus) {
      o.hp = (o.hp ?? M.hp) - 1;
      G.ev('chips', o.x + .5, o.y + .5, 6, '#5a9a4a', 16); G.ev('snd', 'slash', o.x + .5, o.y + .5);
      if (wid === 'fists') { const pl = G.players.get(pid); if (pl) G.hurtPlayer(pl, 4, { silent: 1 }); G.hintTo(pid, 'Колючки! Лучше рубить кактус ножом или топором'); }
      if (o.hp <= 0) { W.clearObj(o.x, o.y); G.giveTo(pid, { dirty_water: 1 + (Math.random() < 0.4 ? 1 : 0), cloth: Math.random() < 0.5 ? 1 : 0 }, o.x + .5, o.y + .5); G.dirtyFlow = true; } else W.touch(o);
    } else if (o.t === 'bus' || o.t === 'wreck') {
      if (!W2.wreck && !W2.mine) { if (!quiet) G.hintTo(pid, 'Разбирать обломки можно кувалдой, ключом или киркой'); return; }
      o.hp = (o.hp ?? 10) - (W2.wreck ? 2 : 1);
      G.giveTo(pid, { metal: 1 + (Math.random() < 0.5 ? 1 : 0), parts: Math.random() < 0.3 ? 1 : 0 }, o.x + .5, o.y + .5);
      G.ev('spark', o.x + .5, o.y + .5, 5); G.ev('snd', 'hit_metal', o.x + .5, o.y + .5);
      if (o.hp <= 0) { W.clearObj(o.x, o.y); G.dirtyFlow = true; } else W.touch(o);
    } else if (o.t === 'barrel_bomb') { G.explode(o.x + .5, o.y + .5, 3, 110, pid, 'barrel'); W.clearObj(o.x, o.y); G.structures.delete(o); }
  }
  throwItem(wid, x0, y0, x1, y1, owner) {
    const d = dist(x0, y0, x1, y1);
    this.proj.push({ id: this.G.nid(), kind: wid, x0, y0, x1, y1, t: 0, dur: 0.25 + d * 0.06, x: x0, y: y0, z: 12, rot: 0, owner, fuse: wid === 'grenade' ? 2.0 : wid === 'pipebomb' ? 4.5 : wid === 'decoy' ? 15 : 0, landed: false });
  }
  spit(z, tgt) {
    const a = Math.atan2(tgt.y - z.y, tgt.x - z.x) + (Math.random() - .5) * 0.15, sp = 7;
    this.proj.push({ id: this.G.nid(), kind: 'acid', x: z.x, y: z.y, z: 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: z.T.ranged.range / sp + 0.2, dmg: z.T.ranged.dmg * this.G.diff.zdmg });
    this.G.ev('snd', 'spit', z.x, z.y);
  }
  zombieHit(z, tgt) {
    const G = this.G;
    const dmg = z.T.dmg * G.diff.zdmg * (0.85 + Math.random() * 0.3);
    G.ev('blood', tgt.x, tgt.y, 5, null);
    G.ev('snd', 'zombie_hit', z.x, z.y);
    if (tgt.kind === 'player') {
      const big = z.T.scale > 1.3;
      G.hurtPlayer(tgt, dmg, { bleed: Math.random() < (big ? 0.35 : 0.14), inf: (z.type === 'walker' || z.type === 'runner' || z.type === 'crawler') && Math.random() < 0.05 * G.diff.zdmg, chill: z.T.chill ? 2.5 : 0, dry: z.T.dry ? 1 : 0, push: big ? Math.atan2(tgt.y - z.y, tgt.x - z.x) : null });
    } else if (tgt.damage) tgt.damage(G, dmg);
  }
  animalHit(an, tgt) {
    const G = this.G; G.ev('blood', tgt.x, tgt.y, 4, null); G.ev('snd', an.ak === 'wolf' ? 'wolf_bite' : 'bear_hit', an.x, an.y);
    if (tgt.kind === 'player') G.hurtPlayer(tgt, an.T.dmg * (0.8 + Math.random() * 0.4), { bleed: Math.random() < 0.25 });
  }
  zombieHitWall(z, o) {
    const G = this.G;
    o.hp -= z.T.wall * (G.diff.zdmg * 0.5 + 0.5); o.hitT = 0.15;
    const B = TZ.BUILD[o.t];
    G.ev('chips', o.x + .5, o.y + .5, 4, matColor(o.t), 12);
    G.ev('snd', matColor(o.t) === '#9aa0a8' ? 'hit_metal' : matColor(o.t) === '#a09c94' ? 'hit_stone' : 'hit_wood', o.x + .5, o.y + .5);
    if (o.hp <= 0) G.destroyStructure(o);
    else { G.world.touch(o); if (B && o.hp < B.hp * 0.3 && !o.warned) { o.warned = true; G.msgTo(o.owner, `${B.name} почти разрушен!`, 'warn'); } }
  }
  update(dt) {
    const G = this.G, W = G.world, auth = G.auth;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x; b.py = b.y; b.life += dt;
      let dead = false;
      if (b.flame && Math.random() < 0.9) G.fx.flame(b.x, b.y, b.vx * 0.15, b.vy * 0.15);
      if (b.gl && Math.random() < 0.7) G.fx.smoke(b.x, b.y, 1, 10, 'rgba(150,150,150,');
      if (b.flare) { G.fx.sparks(b.x, b.y, 1, '#ff6040', 2); if (Math.random() < 0.5) G.fx.smoke(b.x, b.y, 1, 6, 'rgba(255,140,120,'); }
      for (let s = 0; s < 4 && !dead; s++) {
        const sx = b.vx * dt / 4, sy = b.vy * dt / 4;
        b.x += sx; b.y += sy; b.range -= Math.hypot(sx, sy);
        if (b.range <= 0) { dead = true; if (b.bolt && auth && !b.vis) G.dropPickup(b.x, b.y, b.bolt, 1); break; }
        const o = W.main(W.get(b.x, b.y));
        if (o) {
          const M = TZ.OBJ[o.t];
          if (M && M.tall && !M.built) { if (!M.tree || Math.random() < 0.5) { G.fx.sparks(b.x, b.y, 3, M.tree ? '#c08850' : '#ffe0a0', 12); dead = true; if (b.bolt && auth && !b.vis) G.dropPickup(b.x - b.vx * 0.02, b.y - b.vy * 0.02, b.bolt, 1); break; } }
          if (auth && !b.vis && o.t === 'barrel_bomb') { G.explode(o.x + .5, o.y + .5, 3, 110, b.owner, 'barrel'); W.clearObj(o.x, o.y); G.structures.delete(o); dead = true; break; }
        }
        // vehicles stop bullets
        for (const v of G.vehicles) if (v.contains(b.x, b.y) && !(b.ownerVeh && b.ownerVeh === v.id)) { const shooterIn = b.owner && G.players.get(b.owner) && G.players.get(b.owner).vehicle === v.id; if (shooterIn) continue; dead = true; G.fx.sparks(b.x, b.y, 3); if (auth && !b.vis) { v.hp -= b.dmg * 0.08; } break; }
        if (dead) break;
        const near = G.zgrid.query(b.x, b.y, 1.0, G._tmpC);
        const extra = G.animals.length || G.pvp ? [...G.animals.filter(a => !a.dead && dist2(a.x, a.y, b.x, b.y) < 1.2), ...(G.pvp && auth && !b.vis ? [...G.players.values()].filter(p => p.pid !== b.owner && !p.dead && !p.vehicle && dist2(p.x, p.y, b.x, b.y) < 0.5) : [])] : [];
        for (const z of near.concat(extra)) {
          if (z.dead || (b.hit && b.hit.has(z.id || z.pid))) continue;
          const zr = (z.r || 0.3) + 0.08, dx = z.x - b.x, dy = z.y - b.y;
          if (dx * dx + dy * dy < zr * zr) {
            if (!b.hit) b.hit = new Set(); b.hit.add(z.id || z.pid);
            if (b.vis) { G.fx.blood(z.x, z.y, 3, 0.8, Math.atan2(b.vy, b.vx)); dead = !b.flame; break; }
            if (b.flame) { z.burn = Math.max(z.burn || 0, 3); z.burnBy = b.owner; if (z.damage && z.kind !== 'player') z.damage(G, b.dmg, b.owner, 'fire'); continue; }
            if (z.kind === 'player') { G.hurtPlayer(z, b.dmg * 0.6, { by: b.owner }); b.pierce = 0; dead = true; break; }
            const crit = typeof b.owner === 'string' && b.owner[0] !== 'a' && b.owner !== 't' && Math.random() < 0.1, dmg = b.dmg * (crit ? 2 : 1);
            const a = Math.atan2(b.vy, b.vx), sc = z.T && z.T.scale ? z.T.scale * z.T.scale : 1;
            z.kx = (z.kx || 0) + Math.cos(a) * b.knock * 6 / sc; z.ky = (z.ky || 0) + Math.sin(a) * b.knock * 6 / sc;
            G.ev('blood', z.x, z.y, crit ? 10 : 5, a);
            if (z.kind === 'zombie' && z.T.armor && !crit) G.ev('spark', z.x, z.y, 2);
            z.damage(G, dmg, b.owner, crit ? 'head' : 'bullet');
            if (crit) { G.ev('text', z.x, z.y, 'В ГОЛОВУ!', '#ffd24a'); G.toPlayer(b.owner, 'stat', { k: 'heads', n: 1 }); }
            b.pierce--; if (b.pierce <= 0) { dead = true; break; }
            b.dmg *= 0.75;
          }
        }
      }
      if ((dead || b.life > 3) && b.gl && auth && !b.vis) G.explode(b.x - b.vx * 0.01, b.y - b.vy * 0.01, b.gl.r, b.gl.dmg, b.owner, 'boom');
      if ((dead || b.life > 3) && b.flare && auth && !b.vis) G.flareAt(b.x - b.vx * 0.01, b.y - b.vy * 0.01, b.owner);
      if (dead || b.life > 3) { this.bullets[i] = this.bullets[this.bullets.length - 1]; this.bullets.pop(); }
    }
    if (!auth) { this.updateFiresVisual(dt); return; }
    // projectiles
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const p = this.proj[i]; let done = false;
      if (p.kind === 'acid') {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.random() < .6) G.fx.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: -5, g: 20, life: 0.3, max: 0.3, c: '#8fd13a', s: 1, type: 'acid' });
        for (const t of [...G.players.values(), ...G.allies]) { if (t.dead || t.inCar || t.vehicle) continue; if (dist2(t.x, t.y, p.x, p.y) < 0.25) { if (t.kind === 'player') G.hurtPlayer(t, p.dmg, { acid: true }); else t.damage(G, p.dmg); done = true; G.ev('acid', t.x, t.y); break; } }
        const o = W.main(W.get(p.x, p.y));
        if (!done && o && TZ.OBJ[o.t] && TZ.OBJ[o.t].solid) { if (TZ.OBJ[o.t].built && !o.wild) { o.hp -= 15; if (o.hp <= 0) G.destroyStructure(o); else W.touch(o); } done = true; }
        if (p.life <= 0) { done = true; G.ev('acid', p.x, p.y); }
      } else {
        if (!p.landed) {
          p.t += dt; const t = Math.min(1, p.t / p.dur);
          p.x = lerp(p.x0, p.x1, t); p.y = lerp(p.y0, p.y1, t); p.z = 12 + Math.sin(t * Math.PI) * 26 - t * 10; p.rot += dt * 18;
          if (p.kind === 'molotov' && Math.random() < .5) G.fx.fire(p.x, p.y, 1, p.z);
          if (t >= 1) {
            p.landed = true; p.z = 1;
            if (p.kind === 'molotov') {
              done = true;
              this.fires.push({ x: p.x, y: p.y, r: 1.9, life: 7, max: 7, owner: p.owner });
              G.ev('snd', 'glass', p.x, p.y); G.ev('snd', 'fire_whoosh', p.x, p.y); G.ev('molotov', p.x, p.y);
              G.noise(p.x, p.y, 10);
            } else G.ev('snd', 'clank', p.x, p.y);
          }
        } else {
          p.fuse -= dt;
          if (p.kind === 'pipebomb') { G.noise(p.x, p.y, 22, false, true); if (((p.fuse * 4) | 0) !== p._b) { p._b = (p.fuse * 4) | 0; G.ev('snd', 'beep', p.x, p.y); } }
          if (p.kind === 'decoy') { G.noise(p.x, p.y, 24, false, true); if (((p.fuse * 2) | 0) !== p._b) { p._b = (p.fuse * 2) | 0; G.ev('snd', 'decoy', p.x, p.y); } if (p.fuse <= 0) done = true; }
          else if (p.fuse <= 0) { done = true; G.explode(p.x, p.y, p.kind === 'pipebomb' ? 3.4 : 3.0, p.kind === 'pipebomb' ? 140 : 120, p.owner, 'boom'); }
        }
      }
      if (done) this.proj.splice(i, 1);
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.life -= dt;
      if (Math.random() < dt * 30) G.fx.fire(f.x + (Math.random() - .5) * f.r * 1.4, f.y + (Math.random() - .5) * f.r * 1.4, 1);
      if (Math.random() < dt * 4) G.fx.smoke(f.x, f.y, 1, 14, 'rgba(50,46,44,');
      for (const z of G.zgrid.query(f.x, f.y, f.r + 0.5, G._tmpC)) if (!z.dead && dist2(z.x, z.y, f.x, f.y) < f.r * f.r) { z.burn = Math.max(z.burn, 2.5); z.burnBy = f.owner; z.slow = 0.2; }
      for (const p of G.players.values()) if (!p.dead && !p.vehicle && dist2(p.x, p.y, f.x, f.y) < f.r * f.r) G.hurtPlayer(p, 10 * dt, { silent: true });
      if (f.life <= 0) this.fires.splice(i, 1);
    }
  }
  updateFiresVisual(dt) {
    for (let i = this.fires.length - 1; i >= 0; i--) { const f = this.fires[i]; f.life -= dt; if (Math.random() < dt * 30) this.G.fx.fire(f.x + (Math.random() - .5) * f.r * 1.4, f.y + (Math.random() - .5) * f.r * 1.4, 1); if (f.life <= 0) this.fires.splice(i, 1); }
  }
}
TZ.Combat = Combat;
TZ.matColor = matColor;
})();
