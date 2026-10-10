// =====================================================================
//  THE ZOMBIES 2.0 — entities: player, zombie, ally, animal, ghosts
// =====================================================================
'use strict';
(() => {
const V = TZ.Vox;

TZ.moveCircle = (W, e, dx, dy, who, uid) => {
  const r = e.r;
  const blocked = (x, y) => {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!W.solidFor(tx, ty, who, uid)) continue;
      const ins = 0.06, cx = clamp(x, tx + ins, tx + 1 - ins), cy = clamp(y, ty + ins, ty + 1 - ins);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  };
  let hit = false;
  if (dx) { const nx = e.x + dx; if (!blocked(nx, e.y)) e.x = nx; else hit = true; }
  if (dy) { const ny = e.y + dy; if (!blocked(e.x, ny)) e.y = ny; else hit = true; }
  return hit;
};
// weapon -> voxel arm pose
TZ.holdOf = (wid, swing) => { const W = TZ.WEAPONS[wid]; if (!W) return 'free'; if (W.melee && swing > 0 && wid !== 'chainsaw') return 'swing'; return W.hold || 'free'; };

// =============================================================== PLAYER
class Player {
  constructor(pid, uid, name) {
    this.kind = 'player'; this.pid = pid; this.uid = uid; this.name = name || 'Игрок';
    this.x = 0; this.y = 0; this.r = 0.28;
    this.hp = 100; this.maxHp = 100; this.stamina = 100; this.hunger = 85; this.thirst = 85; this.warmth = 90;
    this.infection = 0; this.sick = 0; this.bleeding = false; this.buffs = {};
    this.inv = { knife: 1, pistol: 1, ammo9: 12, water: 1, canned: 1, flashlight: 1, cap: 1 };
    this.mags = { pistol: 12 }; this.hotbar = ['pistol', 'knife', null, null, null, null, null, null]; this.sel = 0;
    this.eq = { head: 'cap', body: null, back: null };
    this.look = TZ.Chars.defaultLook();
    this.cd = 0; this.reload = 0; this.reloadTotal = 0; this.ang = 0.8; this.dir = 1;
    this.anim = 0; this.moving = false; this.running = false; this.swing = 0; this.swingDir = 1; this.recoil = 0; this.flash = 0;
    this.light = false; this.hurtT = 0; this.invuln = 0; this.stepT = 0; this.dead = false; this.deadT = 0;
    this.vehicle = 0; this.spawn = null; this.chilled = 0;
    // remote interpolation
    this.nx = 0; this.ny = 0; this.remote = false; this.profile = null;
  }
  get weapon() { const id = this.hotbar[this.sel]; if (id && TZ.WEAPONS[id] && (this.inv[id] || 0) > 0) return id; return 'fists'; }
  get sprite() { return TZ.Chars.playerSet(this.look, this.eq); }
  armor() { let a = 0; for (const s of ['head', 'body', 'back']) { const it = TZ.ITEMS[this.eq[s]]; if (it && it.armor) a += it.armor; } return Math.min(70, a) / 100; }
  warmGear() { let a = 0; for (const s of ['head', 'body']) { const it = TZ.ITEMS[this.eq[s]]; if (it && it.warm) a += it.warm; } return a; }
  carry() { const it = TZ.ITEMS[this.eq.back]; return 40 + (it && it.carry ? it.carry : 0) + (this === (TZ.game && TZ.game.me) ? TZ.myPerk('carry', 0) : 0); }
  serialize() { const o = {}; for (const k of ['x', 'y', 'hp', 'stamina', 'hunger', 'thirst', 'warmth', 'infection', 'sick', 'bleeding', 'inv', 'mags', 'hotbar', 'sel', 'eq', 'look', 'light', 'spawn']) o[k] = this[k]; return JSON.parse(JSON.stringify(o)); }
  load(d) { for (const k in d) if (d[k] !== undefined) this[k] = JSON.parse(JSON.stringify(d[k])); this.dead = false; }
  netState() { return { x: +this.x.toFixed(2), y: +this.y.toFixed(2), a: +this.ang.toFixed(2), m: this.moving ? (this.running ? 2 : 1) : 0, w: this.weapon, sw: this.swing > 0 ? 1 : 0, fl: this.flash > 0 ? 1 : 0, lt: this.light ? 1 : 0, d: this.dead ? 1 : 0, v: this.vehicle || 0, hp: Math.round(this.hp), eq: this.eq, look: this.look, rc: this.recoil > 0 ? 1 : 0 }; }
  applyNet(s) {
    this.nx = s.x; this.ny = s.y; this.ang = s.a; this.moving = s.m > 0; this.running = s.m === 2; this.netW = s.w;
    if (s.sw && this.swing <= 0) this.swing = 0.22;
    if (s.fl) { this.flash = 0.06; this.recoil = 2; }
    this.light = !!s.lt; this.dead = !!s.d; this.vehicle = s.v; this.hp = s.hp;
    if (JSON.stringify(s.eq) !== JSON.stringify(this.eq)) this.eq = s.eq;
    if (s.look && JSON.stringify(s.look) !== JSON.stringify(this.look)) this.look = s.look;
    if (!this._init) { this._init = true; this.x = s.x; this.y = s.y; }
  }
  remoteUpdate(dt) {
    const k = Math.min(1, dt * 12);
    if (Math.abs(this.nx - this.x) > 6 || Math.abs(this.ny - this.y) > 6) { this.x = this.nx; this.y = this.ny; }
    this.x += (this.nx - this.x) * k; this.y += (this.ny - this.y) * k;
    this.dir = V.dirIndex(this.ang, 8);
    this.anim += dt * (this.moving ? (this.running ? 12 : 8.5) : 2);
    this.swing = Math.max(0, this.swing - dt); this.flash = Math.max(0, this.flash - dt); this.recoil = Math.max(0, this.recoil - dt * 30); this.hurtT = Math.max(0, this.hurtT - dt);
  }
  // ---- local control ----
  update(dt, G) {
    const I = TZ.input, W = G.world;
    if (this.dead) { this.deadT += dt; return; }
    for (const b in this.buffs) { this.buffs[b] -= dt; if (this.buffs[b] <= 0) delete this.buffs[b]; }
    this.hurtT = Math.max(0, this.hurtT - dt); this.invuln = Math.max(0, this.invuln - dt); this.chilled = Math.max(0, this.chilled - dt);
    this.cd = Math.max(0, this.cd - dt); this.recoil = Math.max(0, this.recoil - dt * 30); this.flash = Math.max(0, this.flash - dt);
    this.swing = Math.max(0, this.swing - dt);
    if (this.vehicle) { this.survival(dt, G, false); return; }
    const m = G.mouseWorld;
    this.ang = Math.atan2(m.y - this.y, m.x - this.x);
    this.dir = V.dirIndex(this.ang, 8);
    let mx = 0, my = 0;
    if (G.canControl && !G.typing) {
      if (I.on('up')) { mx -= 1; my -= 1; }
      if (I.on('down')) { mx += 1; my += 1; }
      if (I.on('left')) { mx -= 1; my += 1; }
      if (I.on('right')) { mx += 1; my -= 1; }
      if (I.stick) { const k = Math.min(1, I.stick.mag * 1.25); mx += (I.stick.x + I.stick.y) * k; my += (I.stick.y - I.stick.x) * k; }
    }
    const len = Math.hypot(mx, my);
    this.moving = len > 0;
    const over = G.weight() > this.carry();
    let speed = 3.1 * TZ.myPerk('spd', 1) * ((TZ.WEAPONS[this.weapon] || {}).heavy || 1) * (over ? 0.7 : 1) * W.slowAt(this.x, this.y) * (this.chilled > 0 ? 0.7 : 1);
    const fast = !!this.buffs.fast;
    const sprint = this.moving && (I.on('sprint') || (I.stick && I.stick.run)) && (this.stamina > 2 || fast) && !over && !G.typing;
    this.running = sprint;
    if (sprint) { speed *= fast ? 1.85 : 1.6; if (!fast) this.stamina -= 16 * dt * TZ.myPerk('stam', 1); }
    else this.stamina = Math.min(100, this.stamina + (G.nearFire(this.x, this.y) ? 22 : 13) * dt * (this.hunger > 15 ? 1 : 0.4) * (this.warmth > 25 ? 1 : 0.5));
    if (this.moving) {
      const slow = I.stick && !sprint ? Math.max(0.45, Math.min(1, I.stick.mag * 1.3)) : 1; // analog stick: walk slower with a small push
      mx = mx / len * slow; my = my / len * slow;
      TZ.moveCircle(W, this, mx * speed * dt, my * speed * dt, 'p', this.uid);
      this.anim += dt * (sprint ? 12 : 8.5);
      this.stepT -= dt * (sprint ? 1.6 : 1);
      if (this.stepT <= 0) { this.stepT = 0.36; TZ.audio.step(W.groundIf(this.x, this.y)); if (sprint) G.noise(this.x, this.y, 4, true); }
    } else this.anim += dt * 2;
    this.survival(dt, G, sprint);
    if (this.reload > 0) { this.reload -= dt; if (this.reload <= 0) this.finishReload(G); }
    if (G.canControl && !G.typing && I.act('reload')) this.startReload(G);
    if (G.canControl && !G.typing && !G.uiBlocking && G.mode === 'play') {
      const wid = this.weapon, W2 = TZ.WEAPONS[wid];
      const wantFire = W2.auto ? I.mouse.down : I.mouse.clicked || (I.mouse.down && W2.melee);
      if (wantFire && this.cd <= 0 && this.reload <= 0) this.attack(G, wid, W2);
    }
  }
  survival(dt, G, sprint) {
    const D = G.diff.drain, W = G.world;
    const biome = W.biomeAt(this.x, this.y);
    this.hunger = Math.max(0, this.hunger - dt * 0.085 * D * TZ.myPerk('hunger', 1) * (this.warmth < 30 ? 1.4 : 1) * (sprint ? 1.6 : 1));
    this.thirst = Math.max(0, this.thirst - dt * 0.12 * D * TZ.myPerk('thirst', 1) * (sprint ? 1.6 : 1) * (biome === 4 ? 1.5 : biome === 5 ? (G.isNight() || this.vehicle ? 1.3 : 2.1) : 1));
    // warmth
    const night = G.isNight(), fire = G.nearFire(this.x, this.y);
    let cold = biome === 2 ? (night ? 1.6 : 0.9) : biome === 5 ? (night ? 0.7 : 0) : night ? 0.25 : 0; // desert nights are cold
    const roofed = W.roofAt(this.x, this.y) > 0; this.roofed = roofed;
    if (G.weather.rain > 0.3 && biome < 4 && !roofed) cold += 0.2;
    if (roofed && cold > 0) cold *= 0.6; // a roof over your head keeps some warmth
    if (G.weather.snow > 0.3) cold += 0.4;
    const gear = this.warmGear();
    cold *= Math.max(0.05, 1 - gear / 75);
    if (this.vehicle) cold *= 0.4;
    cold *= TZ.myPerk('cold', 1);
    if (fire) this.warmth = Math.min(100, this.warmth + dt * 6);
    else if (cold > 0) this.warmth = Math.max(0, this.warmth - dt * cold * 0.9);
    else this.warmth = Math.min(100, this.warmth + dt * 1.2);
    if (this.warmth <= 0) this.damage(dt * 1.5, null, true);
    // swamp gas
    if (biome === 3 && night && this.eq.head !== 'gasmask') this.sick = Math.min(100, this.sick + dt * 0.35);
    if (this.sick > 0) { this.sick = Math.max(0, this.sick - dt * 0.15); if (this.sick > 40) { this.damage(dt * 0.6, null, true); this.hunger = Math.max(0, this.hunger - dt * 0.1); } }
    if (this.hunger <= 0 || this.thirst <= 0) this.damage(dt * 1.2, null, true);
    else if (this.hunger > 50 && this.thirst > 50 && !this.bleeding && this.infection < 1 && this.sick < 20) this.hp = Math.min(this.maxHp, this.hp + dt * 0.35 * TZ.myPerk('regen', 1));
    if (this.bleeding) { this.damage(dt * 0.9, null, true); if (Math.random() < dt * 2) G.fx.blood(this.x, this.y, 1, 0.4); }
    if (this.infection > 0) { this.infection = Math.min(100, this.infection + dt * 0.25); if (this.infection > 30) this.damage(dt * (this.infection / 100) * 1.5, null, true); }
  }
  startReload(G) {
    const wid = this.weapon, W2 = TZ.WEAPONS[wid];
    if (!W2.ammo || this.reload > 0) return;
    const cur = this.mags[wid] || 0, have = this.inv[W2.ammo] || 0;
    if (cur >= W2.mag || have <= 0) { if (have <= 0 && cur <= 0) {
      G.hint('Нет патронов: ' + TZ.ITEMS[W2.ammo].name);
      // switch to a melee weapon from the hotbar so phone players keep fighting
      const mi = this.hotbar.findIndex(h => h && TZ.WEAPONS[h] && TZ.WEAPONS[h].melee && G.count(h));
      if (mi >= 0 && TZ.isTouch) { this.sel = mi; G.ui && G.ui.dirty(); }
    } return; }
    this.reload = this.reloadTotal = W2.reload; this.reloadWid = wid;
    TZ.audio.reload(wid);
  }
  finishReload(G) {
    const wid = this.reloadWid, W2 = TZ.WEAPONS[wid]; if (!W2) return;
    const cur = this.mags[wid] || 0;
    if (W2.pack) { if ((this.inv[W2.ammo] || 0) > 0) { G.take(W2.ammo, 1); this.mags[wid] = W2.mag; } }
    else { const take = Math.min(W2.mag - cur, this.inv[W2.ammo] || 0); this.mags[wid] = cur + take; G.take(W2.ammo, take); }
    TZ.audio.play('reload_end');
  }
  // hammer: hitting your own damaged structure repairs it for 1 piece of its main material
  hammerRepair(G) {
    const W = G.world;
    for (const r of [0.8, 1.3]) {
      const tx = Math.floor(this.x + Math.cos(this.ang) * r), ty = Math.floor(this.y + Math.sin(this.ang) * r), o = W.get(tx, ty), B = o && TZ.BUILD[o.t];
      if (!B || o.hp >= B.hp || (o.owner && o.owner !== this.uid)) continue;
      const mat = Object.keys(B.cost).find(k => TZ.ITEMS[k] && TZ.ITEMS[k].type === 'mat') || 'wood';
      if (!G.count(mat)) { G.hint(`Для ремонта нужен материал: ${TZ.ITEMS[mat].name}`); return true; }
      G.take(mat, 1); TZ.audio.play('hit_wood'); G.act('repair', { x: tx, y: ty, paid: { [mat]: 1 } }); return true;
    }
    return false;
  }
  attack(G, wid, W2) {
    if (W2.melee) {
      if (wid === 'chainsaw') {
        if ((this.mags.chainsaw || 0) <= 0) { if (G.count('fuel')) { G.take('fuel', 1); this.mags.chainsaw = 1; G.msg('Бензопила заправлена', 'hint'); } else { G.hint('Бензопиле нужно топливо'); this.cd = 0.5; return; } }
        this.mags.chainsaw = Math.max(0, this.mags.chainsaw - W2.fuelUse);
      } else { if (this.stamina < W2.stam * 0.5) return; this.stamina -= W2.stam; }
      this.cd = W2.cd; this.swing = 0.22; this.swingDir *= -1;
      if (W2.repair && this.hammerRepair(G)) return;
      if (wid !== 'chainsaw' || !this._sawT || performance.now() - this._sawT > 300) { TZ.audio.play(W2.sound); this._sawT = performance.now(); }
      G.act('melee', { a: +this.ang.toFixed(3), w: wid, x: this.x, y: this.y, mx: G.mouseWorld.x, my: G.mouseWorld.y });
      return;
    }
    if (W2.throw) {
      if (!G.count(wid)) return;
      G.take(wid, 1); this.cd = W2.cd;
      const m = G.mouseWorld, d = Math.min(W2.range, dist(this.x, this.y, m.x, m.y));
      G.act('throw', { w: wid, x0: this.x, y0: this.y, x1: this.x + Math.cos(this.ang) * d, y1: this.y + Math.sin(this.ang) * d });
      TZ.audio.play('swing');
      if (!G.count(wid)) G.autoSelect();
      return;
    }
    const cur = this.mags[wid] || 0;
    if (cur <= 0) { TZ.audio.play('dry'); this.cd = 0.25; this.startReload(G); return; }
    this.mags[wid] = W2.pack ? Math.max(0, cur - 1) : cur - 1; this.cd = W2.cd;
    const angs = [];
    for (let i = 0; i < W2.pellets; i++) angs.push(+(this.ang + (Math.random() - 0.5) * 2 * W2.spread * (this.moving ? 1.3 : 1)).toFixed(3));
    G.act('shoot', { x: +this.x.toFixed(2), y: +this.y.toFixed(2), a: angs, w: wid });
    G.combat.localShotFx(this, W2, wid, angs);
    this.recoil = W2.recoil; this.flash = 0.06;
    G.camera.shake(W2.recoil * 0.6);
    G.acc('shots', 1);
    if (this.mags[wid] <= 0 && (this.inv[W2.ammo] || 0) > 0) this.startReload(G);
  }
  damage(n, src, silent) {
    if (this.dead) return;
    if (!silent && this.invuln > 0) return;
    if (!silent) { n *= 1 - this.armor(); if (this.buffs.tough) n *= 0.6; }
    this.hp -= n;
    if (!silent) { this.hurtT = 0.25; this.invuln = 0.15; TZ.audio.play('hurt'); TZ.game.camera.shake(4); }
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deadT = 0; TZ.game.onPlayerDeath(this); }
  }
}
TZ.Player = Player;

// =============================================================== ZOMBIE (authoritative)
class Zombie {
  constructor(G, type, x, y, horde = false) {
    const T = TZ.ZOMBIES[type];
    this.kind = 'zombie'; this.id = G.nid(); this.type = type; this.T = T;
    this.x = x; this.y = y; this.r = T.r;
    const D = G.diff, dayScale = 1 + Math.min(1.5, (G.day - 1) * 0.05);
    this.maxHp = this.hp = T.hp * D.zhp * (T.boss ? 1 + G.players.size * 0.4 : dayScale);
    this.speed = T.speed * (0.85 + Math.random() * 0.3);
    this.v = (Math.random() * 99) | 0;
    this.biome = G.world.biomeAt(x, y);
    this.state = 'wander'; this.hunt = 0; this.cd = Math.random(); this.rangedCd = 2 + Math.random() * 2; this.screamCd = 0;
    this.anim = Math.random() * 8; this.ang = Math.random() * 6.28; this.dir = 0;
    this.wx = x; this.wy = y; this.wt = 0; this.kx = 0; this.ky = 0; this.hitT = 0; this.atkT = 0;
    this.burn = 0; this.slow = 0; this.dead = false; this.deadT = 0; this.horde = horde;
    this.groanT = 2 + Math.random() * 8; this.tgt = null; this.lastHitBy = null;
  }
  get spr() { return TZ.Chars.zombieSet(this.type, this.v, this.biome); }
  update(dt, G) {
    const W = G.world;
    if (this.dead) { this.deadT += dt; return; }
    this.cd -= dt; this.hitT = Math.max(0, this.hitT - dt); this.atkT = Math.max(0, this.atkT - dt);
    this.hunt = Math.max(0, this.hunt - dt); this.slow = Math.max(0, this.slow - dt); this.screamCd -= dt;
    if (this.burn > 0) { this.burn -= dt; this.damage(G, 14 * dt, this.burnBy, 'fire'); if (Math.random() < dt * 8) G.fx.fire(this.x, this.y, 1); if (this.dead) return; }
    if (this.kx || this.ky) { TZ.moveCircle(W, this, this.kx * dt, this.ky * dt, 'z'); this.kx *= Math.pow(0.002, dt); this.ky *= Math.pow(0.002, dt); if (Math.abs(this.kx) + Math.abs(this.ky) < 0.05) this.kx = this.ky = 0; }
    const tgt = G.nearestTarget(this.x, this.y);
    const dT = tgt ? dist(this.x, this.y, tgt.x, tgt.y) : 999;
    const sight = (G.isNight() ? 13 : 8.5) * (tgt && tgt.kind === 'player' ? TZ.perkOf(G, tgt, 'stealth', 1) : 1);
    if (tgt && dT < sight) this.hunt = Math.max(this.hunt, 4);
    const hunting = this.horde || this.hunt > 0 || (G.isNight() && dT < 34);
    const under = W.get(this.x, this.y);
    if (under && (under.t === 'spikes' || under.t === 'barbed')) { this.damage(G, (under.t === 'barbed' ? 12 : 18) * dt, null, 'trap'); this.slow = 0.3; under.hp -= dt * 3; if (under.hp <= 0) G.destroyStructure(under); if (this.dead) return; }
    if (under && under.t === 'beartrap' && !(under.shut > Date.now()) && !this.T.boss) { under.shut = Date.now() + 9000; this.held = this.T.scale > 1.3 ? 1.8 : 4; under.hp -= 8; G.ev('snd', 'trap', this.x, this.y); G.ev('blood', this.x, this.y, 6, null); this.damage(G, 45, under.owner, 'trap'); if (under.hp <= 0) G.destroyStructure(under); else G.world.touch(under); if (this.dead) return; }
    if (under && under.t === 'mine') { G.explode(under.x + .5, under.y + .5, 2.8, 120, under.owner, 'mine'); G.world.clearObj(under.x, under.y); G.structures.delete(under); return; }
    // screamer
    if (this.T.scream && hunting && tgt && dT < 12 && this.screamCd <= 0) {
      this.screamCd = 14; this.atkT = 0.6;
      G.ev('snd', 'scream', this.x, this.y); G.noise(this.x, this.y, 26);
      for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) { const f = G.findFree(this.x + (Math.random() - .5) * 18, this.y + (Math.random() - .5) * 18, 3); if (f && dist(f.x, f.y, tgt.x, tgt.y) > 9) G.spawnZombie('runner', f.x, f.y, true); }
    }
    let spd = this.speed * (this.slow > 0 ? 0.45 : 1) * (G.isNight() ? 1.12 : 1) * W.slowAt(this.x, this.y);
    if (this.held > 0) { this.held -= dt; spd = 0; }
    let mvx = 0, mvy = 0;
    if (this.T.ranged && hunting && tgt && dT < this.T.ranged.range && dT > 2.2) {
      this.rangedCd -= dt;
      if (this.rangedCd <= 0 && !W.raycast(this.x, this.y, tgt.x, tgt.y)) { this.rangedCd = this.T.ranged.cd; this.atkT = 0.4; G.combat.spit(this, tgt); }
      this.ang = Math.atan2(tgt.y - this.y, tgt.x - this.x);
      if (dT > this.T.ranged.range * 0.6) { mvx = Math.cos(this.ang); mvy = Math.sin(this.ang); spd *= 0.5; }
    } else if (hunting && tgt) {
      this.state = 'hunt';
      const reach = this.r + (tgt.r || 0.3) + 0.38;
      if (dT < reach) {
        this.ang = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        if (this.T.explode) { this.damage(G, 9999, null, 'self'); return; }
        if (this.cd <= 0) { this.cd = this.T.cd; this.atkT = 0.35; G.combat.zombieHit(this, tgt); }
      } else {
        let dirX = 0, dirY = 0, wallObj = null;
        const fw = G.flowFor(tgt, this.x, this.y);
        if (dT < 2.2 && !W.raycast(this.x, this.y, tgt.x, tgt.y)) { dirX = tgt.x - this.x; dirY = tgt.y - this.y; }
        else if (fw) {
          const nd = flowDir(fw, this.x, this.y, W);
          if (nd) { const o = W.get(nd.x, nd.y); if (o && W.solidFor(nd.x, nd.y, 'z')) wallObj = W.main(o); dirX = nd.x + 0.5 - this.x; dirY = nd.y + 0.5 - this.y; }
          else { dirX = tgt.x - this.x; dirY = tgt.y - this.y; }
        } else { dirX = tgt.x - this.x; dirY = tgt.y - this.y; }
        const l = Math.hypot(dirX, dirY) || 1; mvx = dirX / l; mvy = dirY / l;
        this.ang = Math.atan2(mvy, mvx);
        if (wallObj && TZ.OBJ[wallObj.t] && TZ.OBJ[wallObj.t].built && dist(this.x, this.y, wallObj.x + 0.5, wallObj.y + 0.5) < 0.62 + this.r + 0.35) {
          mvx *= 0.1; mvy *= 0.1;
          if (this.cd <= 0) { this.cd = this.T.cd; this.atkT = 0.35; if (this.T.explode) { this.damage(G, 9999, null, 'self'); return; } G.combat.zombieHitWall(this, wallObj); }
        }
      }
    } else {
      this.state = 'wander'; this.wt -= dt;
      if (this.wt <= 0) { this.wt = 3 + Math.random() * 5; const a = Math.random() * 6.28, d = 1 + Math.random() * 5; this.wx = this.x + Math.cos(a) * d; this.wy = this.y + Math.sin(a) * d; if (Math.random() < 0.35) { this.wx = this.x; this.wy = this.y; } }
      const dx = this.wx - this.x, dy = this.wy - this.y, l = Math.hypot(dx, dy);
      if (l > 0.3) { mvx = dx / l; mvy = dy / l; spd *= 0.42; this.ang = Math.atan2(mvy, mvx); }
    }
    const near = G.zgrid.query(this.x, this.y, 1.2, G._tmpA);
    for (const o of near) {
      if (o === this || o.dead) continue;
      const dx = this.x - o.x, dy = this.y - o.y, d2 = dx * dx + dy * dy, rr = this.r + o.r;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) / rr; mvx += dx / d * push * 1.4; mvy += dy / d * push * 1.4; }
    }
    this.moving = !!(mvx || mvy);
    if (this.moving) { const hit = TZ.moveCircle(W, this, mvx * spd * dt, mvy * spd * dt, 'z'); this.anim += dt * spd * 4.2; if (hit && this.state === 'wander') this.wt = 0; }
    this.dir = V.dirIndex(this.ang, 8);
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 4 + Math.random() * 10; G.ev('groan', this.type, this.x, this.y); }
  }
  damage(G, n, by, kind) {
    if (this.dead) return;
    if (by) n *= TZ.perkDmg(G, by, kind, false);
    if (this.T.armor && kind === 'bullet') n *= 1 - this.T.armor;
    this.hp -= n; this.hitT = 0.09; this.hunt = Math.max(this.hunt, 8);
    if (by) this.lastHitBy = by;
    if (this.hp <= 0) G.killZombie(this, kind, by || this.lastHitBy);
  }
}
const flowDir = (fw, x, y, W) => {
  const cx = Math.floor(x), cy = Math.floor(y), i0 = cx - fw.x0, j0 = cy - fw.y0, n = fw.n;
  if (i0 < 0 || j0 < 0 || i0 >= n || j0 >= n) return null;
  let best = fw.f[j0 * n + i0], bx = 0, by = 0, found = false;
  for (let k = 0; k < 8; k++) {
    const dx = DX[k], dy = DY[k], i = i0 + dx, j = j0 + dy; if (i < 0 || j < 0 || i >= n || j >= n) continue;
    if (dx && dy && (fw.cost[j0 * n + i] !== 1 || fw.cost[j * n + i0] !== 1)) continue;
    const v = fw.f[j * n + i]; if (v < best) { best = v; bx = cx + dx; by = cy + dy; found = true; }
  }
  return found ? { x: bx, y: by } : null;
};
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
TZ.flowDir = flowDir;
TZ.Zombie = Zombie;

// =============================================================== ALLY (survivor)
const ALLY_FOOD = ['canned', 'beans', 'mre', 'steak', 'fish_cooked', 'veggie', 'apple', 'berries', 'choco', 'chips'];
const ALLY_DRINK = ['water', 'soda', 'energy', 'coffee'];
const ALLY_MED = ['bandage', 'medkit', 'painkill'];
class Ally {
  constructor(G, def, x, y, sid) {
    this.kind = 'ally'; this.id = G.nid(); this.sid = sid;
    Object.assign(this, { name: def.name, role: def.role, weapon: def.weapon, female: def.female });
    this.def = def;
    this.x = x; this.y = y; this.r = 0.28; this.hp = this.maxHp = 100;
    this.owner = null; this.mode = 'follow'; this.gx = x; this.gy = y; this.home = { x, y };
    this.cd = 0; this.ang = 0.8; this.dir = 1; this.anim = 0; this.moving = false;
    this.recoil = 0; this.flash = 0; this.hurtT = 0; this.abilityT = 3; this.dead = false; this.hungry = 0; this.inCar = 0;
  }
  get recruited() { return !!this.owner; }
  get spr() { return TZ.Chars.survivorSet(this.def); }
  serialize() { const o = {}; for (const k of ['sid', 'x', 'y', 'hp', 'owner', 'mode', 'gx', 'gy', 'hungry', 'home', 'food', 'water', 'bag']) o[k] = this[k]; return o; }
  update(dt, G) {
    if (this.dead) return;
    const W = G.world;
    this.cd = Math.max(0, this.cd - dt); this.recoil = Math.max(0, this.recoil - dt * 30); this.flash = Math.max(0, this.flash - dt); this.hurtT = Math.max(0, this.hurtT - dt);
    const owner = this.owner ? G.playerByUid(this.owner) : null;
    if (this.inCar) { const v = G.vehicles.find(v => v.id === this.inCar); if (!v || v.state === 'wreck' || !owner || owner.vehicle !== v.id) { this.inCar = 0; if (v) { const sIdx = v.seats.indexOf('a' + this.id); if (sIdx >= 0) v.seats[sIdx] = null; this.x = v.x + 1; this.y = v.y + 1; } } else { this.x = v.x; this.y = v.y; return; } }
    // auto-board owner's vehicle
    if (owner && owner.vehicle && this.mode === 'follow') { const v = G.vehicles.find(v => v.id === owner.vehicle); if (v && dist(this.x, this.y, v.x, v.y) < 6) { const s = v.seats.indexOf(null); if (s > 0) { v.seats[s] = 'a' + this.id; this.inCar = v.id; return; } } }
    const W2 = TZ.WEAPONS[this.weapon], range = Math.min(W2.range, 10);
    let best = null, bd = range;
    for (const z of G.zgrid.query(this.x, this.y, range, G._tmpB)) { if (z.dead) continue; const d = dist(this.x, this.y, z.x, z.y); if (d < bd && !W.raycast(this.x, this.y, z.x, z.y)) { bd = d; best = z; } }
    let mvx = 0, mvy = 0, spd = 3.2;
    this.needs(dt, G, owner);
    const care = !best && this.recruited ? this.selfCare(dt, G, owner) : (this.task = null);
    if (best && this.recruited) {
      this.ang = Math.atan2(best.y - this.y, best.x - this.x);
      if (this.cd <= 0) {
        const acc = this.role === 'shooter' ? 0.6 : 1.1;
        this.cd = W2.cd * (W2.auto ? 1.6 : 1.3);
        const angs = []; for (let i = 0; i < W2.pellets; i++) angs.push(this.ang + (Math.random() - .5) * 2 * W2.spread * acc);
        G.combat.fire(this, W2, this.weapon, angs, 'a' + this.id, this.role === 'shooter' ? 1.25 : 0.85);
        this.recoil = W2.recoil; this.flash = 0.06;
      }
    } else if (best && !this.recruited && bd < 4) { this.ang = Math.atan2(best.y - this.y, best.x - this.x); if (this.cd <= 0) { this.cd = W2.cd * 2; G.combat.fire(this, W2, this.weapon, [this.ang], 'a' + this.id, 0.6); this.flash = 0.06; } }
    if (care) { const d = Math.hypot(care.x - this.x, care.y - this.y); if (d > 0.2) { mvx = (care.x - this.x) / d; mvy = (care.y - this.y) / d; spd = 3.4; } }
    else if (owner && !owner.dead) {
      if (this.mode === 'follow') {
        const d = dist(this.x, this.y, owner.x, owner.y);
        if (d > 2.6) {
          let tx = owner.x, ty = owner.y;
          const fw = G.allyFlow(owner);
          if (fw && d > 3.5) { const nd = flowDir(fw, this.x, this.y, W); if (nd) { tx = nd.x + 0.5; ty = nd.y + 0.5; } }
          const l = Math.hypot(tx - this.x, ty - this.y) || 1; mvx = (tx - this.x) / l; mvy = (ty - this.y) / l;
          spd = d > 7 ? 5 : 3.4;
          if (d > 30) { this.x = owner.x + (Math.random() - .5); this.y = owner.y + (Math.random() - .5); }
        }
      } else { const d = dist(this.x, this.y, this.gx, this.gy); if (d > 0.6) { mvx = (this.gx - this.x) / d; mvy = (this.gy - this.y) / d; spd = 2.6; } }
      this.abilityT -= dt;
      if (this.abilityT <= 0) {
        this.abilityT = 3;
        if (this.role === 'medic') {
          const pool = [...G.players.values(), ...G.allies.filter(a => a.owner === this.owner && !a.dead)];
          for (const t of pool) if (!t.dead && t.hp < t.maxHp && dist(this.x, this.y, t.x, t.y) < 4.5) { G.healEntity(t, 5); break; }
        }
        if (this.role === 'mechanic') {
          let worst = null, wr = 1;
          for (const o of G.structures) { if (dist(this.x, this.y, o.x + .5, o.y + .5) > 7) continue; if ((o.t === 'turret' || o.t === 'turret_heavy') && (o.ammo || 0) < 20) { o.ammo = (o.ammo || 0) + 4; } const B = TZ.BUILD[o.t]; const r = o.hp / B.hp; if (r < wr) { wr = r; worst = o; } }
          if (worst && wr < 1) { worst.hp = Math.min(TZ.BUILD[worst.t].hp, worst.hp + 18); G.world.touch(worst); G.ev('spark', worst.x + .5, worst.y + .5, 4); }
          for (const v of G.vehicles) if (v.state !== 'wreck' && v.hp < 100 && dist(this.x, this.y, v.x, v.y) < 4) { v.hp = Math.min(100, v.hp + 2); }
        }
      }
    }
    for (const o of [...G.players.values(), ...G.allies]) { if (o === this || o.dead || o.inCar) continue; const dx = this.x - o.x, dy = this.y - o.y, d2 = dx * dx + dy * dy; if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2); mvx += dx / d * 0.8; mvy += dy / d * 0.8; } }
    this.moving = Math.abs(mvx) + Math.abs(mvy) > 0.2;
    if (this.moving) { TZ.moveCircle(W, this, mvx * spd * dt, mvy * spd * dt, 'p', this.owner); this.anim += dt * 8; if (!best) this.ang = Math.atan2(mvy, mvx); }
    else this.anim += dt * 2;
    this.dir = V.dirIndex(this.ang, 8);
    if (!best && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 1.2);
  }
  // ---- 4.1: survivors look after themselves: eat, drink, patch up, scavenge nearby ----
  needs(dt, G, owner) {
    if (this.food == null) { this.food = 80; this.water = 80; } this.bag = this.bag || {};
    if (!this.recruited) return;
    const hot = G.world.biomeAt(this.x, this.y) === 5 && !G.isNight();
    this.food = Math.max(0, this.food - dt * 0.028); this.water = Math.max(0, this.water - dt * 0.04 * (hot ? 1.8 : 1));
    this.careT = (this.careT || 0) - dt;
    if (this.careT <= 0) {
      this.careT = 1.2;
      if (this.food < 55) { const f = ALLY_FOOD.find(k => this.bag[k]); if (f) this.use(f, G); }
      if (this.water < 55) { const w = ALLY_DRINK.find(k => this.bag[k]); if (w) this.use(w, G); }
      if (this.hp < 55) { const m = ['bandage', 'medkit', 'painkill'].find(k => this.bag[k]); if (m) this.use(m, G); }
    }
    if (this.food <= 0 || this.water <= 0) {
      this.hp = Math.max(5, this.hp - dt * 0.12);
      if (!this._starve && owner) { this._starve = 1; G.msgTo(this.owner, `${this.name}: ${this.food <= 0 ? 'я умираю с голоду' : 'мне нечего пить'}! Дайте еды или пустите к ящику.`, 'warn'); }
    } else this._starve = 0;
  }
  use(id, G) {
    const it = TZ.ITEMS[id]; if (!it || !this.bag[id]) return;
    if (--this.bag[id] <= 0) delete this.bag[id];
    if (it.food) this.food = Math.min(100, this.food + it.food * 1.3);
    if (it.water) this.water = Math.min(100, this.water + it.water * 1.3);
    if (it.heal) { this.hp = Math.min(this.maxHp, this.hp + it.heal); G.ev('text', this.x, this.y, '+' + it.heal, '#7dff8a'); }
    G.ev('snd', it.water && !it.food ? 'drink' : it.heal ? 'bandage' : 'eat', this.x, this.y);
  }
  bagCount() { let n = 0; for (const k in this.bag) n += this.bag[k]; return n; }
  wants() {
    const has = (L) => L.some(k => this.bag[k]);
    return { food: this.food < 50 && !has(ALLY_FOOD), water: this.water < 50 && !has(ALLY_DRINK), med: this.hp < 60 && !has(ALLY_MED), stock: this.bagCount() < 3 };
  }
  // returns a point to walk to while doing a chore, or null
  selfCare(dt, G, owner) {
    const W = G.world, wnt = this.wants();
    const urgent = wnt.food || wnt.water || wnt.med;
    const ax = this.mode === 'follow' && owner ? owner.x : this.gx, ay = this.mode === 'follow' && owner ? owner.y : this.gy;
    if (this.task) {
      const t = this.task; t.time += dt;
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (t.time > 18 || dist(ax, ay, t.x, t.y) > 18 || (t.o && t.o.looted && t.type === 'search')) { (this.bad = this.bad || new Set()).add(t.key); this.task = null; return null; }
      if (d < (t.type === 'drink' ? 1.25 : 1.35)) {
        t.work = (t.work || 0) + dt; this.moving = false;
        if (t.work < (t.type === 'search' ? 1.6 : 0.5)) return { x: this.x, y: this.y };
        this.finishTask(t, G, owner); this.task = null; return null;
      }
      return t;
    }
    if (!urgent && !(wnt.stock && Math.random() < dt * 0.15)) return null;
    this.scanT = (this.scanT || 0) - dt; if (this.scanT > 0) return null; this.scanT = 2;
    const bad = this.bad || new Set(), R = 14;
    const need = (id) => { const it = TZ.ITEMS[id]; if (!it) return false; return (wnt.food || wnt.stock) && ALLY_FOOD.includes(id) || (wnt.water || wnt.stock) && ALLY_DRINK.includes(id) || (wnt.med || wnt.stock) && ALLY_MED.includes(id); };
    let best = null, bd = 1e9;
    const offer = (t, d) => { if (d < bd && !bad.has(t.key)) { bd = d; best = t; } };
    for (const p of G.pickups) if (need(p.item)) { const d = dist(this.x, this.y, p.x, p.y); if (d < R && dist(ax, ay, p.x, p.y) < 16) offer({ type: 'pickup', x: p.x, y: p.y, pk: p, key: 'p' + p.id }, d * 0.7); }
    for (const o of G.structures) {
      const d = dist(this.x, this.y, o.x + .5, o.y + .5); if (d > 30) continue;
      if (o.t === 'chest' && o.owner === this.owner && o.items && Object.keys(o.items).some(need)) offer({ type: 'chest', x: o.x + .5, y: o.y + .5, o, key: 'c' + o.x + ',' + o.y }, d * 0.6);
      if (o.t === 'collector' && (o.water | 0) > 0 && (wnt.water || this.water < 70)) offer({ type: 'collector', x: o.x + .5, y: o.y + .5, o, key: 'w' + o.x + ',' + o.y }, d * 0.6);
    }
    const fx = Math.floor(this.x), fy = Math.floor(this.y);
    for (let y = fy - R; y <= fy + R; y++) for (let x = fx - R; x <= fx + R; x++) {
      if (dist(ax, ay, x + .5, y + .5) > 16) continue;
      if (wnt.water) { const g = W.groundIf(x, y); if (g === TZ.TILE.WATER || g === TZ.TILE.SHALLOW) { offer({ type: 'drink', x: x + .5, y: y + .5, key: 'd' + x + ',' + y }, dist(this.x, this.y, x + .5, y + .5) + 2); continue; } }
      const o = W.get(x, y); if (!o || o.looted || o.owner) continue;
      const M = TZ.OBJ[o.t]; if (!M) continue;
      const table = TZ.LOOT[o.loot || M.loot]; if (!table) continue;
      if (!table.some(([id]) => need(id))) continue;
      offer({ type: 'search', x: x + .5, y: y + .5, o, key: 's' + x + ',' + y }, dist(this.x, this.y, x + .5, y + .5) + 3);
    }
    if (best) { best.time = 0; this.task = best; const lbl = { pickup: 'подбирает', chest: 'берёт из ящика', collector: 'пьёт', drink: 'пьёт', search: 'обыскивает' }[best.type]; this.taskLbl = lbl; }
    return best;
  }
  finishTask(t, G, owner) {
    const W = G.world, keep = (id) => ALLY_FOOD.includes(id) || ALLY_DRINK.includes(id) || ALLY_MED.includes(id);
    if (t.type === 'drink') { this.water = Math.min(100, this.water + 45); G.ev('snd', 'drink', this.x, this.y); return; }
    if (t.type === 'collector') { const o = t.o; if ((o.water | 0) > 0) { o.water--; W.touch(o); this.water = Math.min(100, this.water + 50); G.ev('snd', 'drink', this.x, this.y); } return; }
    if (t.type === 'pickup') { const i = G.pickups.indexOf(t.pk); if (i >= 0) { G.pickups.splice(i, 1); this.bag[t.pk.item] = (this.bag[t.pk.item] || 0) + t.pk.n; G.ev('snd', 'pickup', this.x, this.y); } return; }
    if (t.type === 'chest') { const o = t.o; for (const id of [...ALLY_FOOD, ...ALLY_DRINK, ...ALLY_MED]) { if (this.bagCount() >= 6) break; if (o.items && o.items[id]) { const n = Math.min(2, o.items[id]); o.items[id] -= n; if (!o.items[id]) delete o.items[id]; this.bag[id] = (this.bag[id] || 0) + n; } } W.touch(o); G.ev('snd', 'search', this.x, this.y); return; }
    if (t.type === 'search') {
      const o = t.o, M = TZ.OBJ[o.t] || {}, table = TZ.LOOT[o.loot || M.loot] || [];
      const got = {}; for (const [id, ch, a, b] of table) if (Math.random() < ch) got[id] = (got[id] || 0) + a + Math.floor(Math.random() * (b - a + 1));
      o.looted = true; o.lootT = G.absMin(); W.touch(o);
      const give = {};
      for (const id in got) { if (keep(id) && this.bagCount() < 10) this.bag[id] = (this.bag[id] || 0) + got[id]; else give[id] = got[id]; }
      G.ev('snd', 'search', this.x, this.y);
      if (Object.keys(give).length && owner && !owner.dead) { G.giveTo(owner.pid, give, this.x, this.y); G.msgTo(this.owner, `${this.name} нашёл${this.female ? 'ла' : ''} и отдал${this.female ? 'а' : ''} вам: ` + Object.entries(give).map(([k, v]) => `${TZ.ITEMS[k] ? TZ.ITEMS[k].name : k} ×${v}`).join(', '), 'good'); }
    }
  }
  damage(G, n) {
    if (this.dead || this.inCar) return;
    if (!this.recruited) { this.hp = Math.max(25, this.hp - n * 0.3); this.hurtT = 0.2; return; }
    this.hp -= n; this.hurtT = 0.2;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; G.onAllyDeath(this); }
  }
}
TZ.Ally = Ally;

// =============================================================== ANIMAL
class Animal {
  constructor(G, kind, x, y) {
    this.kind = 'animal'; this.id = G.nid(); this.ak = kind; this.T = TZ.ANIMALS[kind];
    this.x = x; this.y = y; this.r = this.T.r; this.hp = this.maxHp = this.T.hp;
    this.ang = Math.random() * 6.28; this.dir = 0; this.anim = 0; this.moving = false; this.running = false;
    this.state = 'graze'; this.t = 0; this.wx = x; this.wy = y; this.cd = 0; this.atkT = 0; this.hitT = 0; this.dead = false; this.deadT = 0; this.angry = 0; this.looted = false;
  }
  get spr() { return TZ.Chars.animalSet(this.ak); }
  update(dt, G) {
    if (this.dead) { this.deadT += dt; return; }
    const W = G.world; this.cd -= dt; this.atkT = Math.max(0, this.atkT - dt); this.hitT = Math.max(0, this.hitT - dt); this.angry = Math.max(0, this.angry - dt);
    if (this.T.dog) { this.dogAI(dt, G); return; }
    const tgt = G.nearestPlayer(this.x, this.y); const d = tgt ? dist(this.x, this.y, tgt.x, tgt.y) : 999;
    let mvx = 0, mvy = 0, spd = 0;
    if (this.T.flee) {
      if (d < 9 || this.angry > 0) { mvx = this.x - tgt.x; mvy = this.y - tgt.y; spd = this.T.speed; this.running = true; }
    } else {
      const aggro = this.ak === 'wolf' ? (d < 12 || this.angry > 0) : (d < 6 || this.angry > 0);
      if (aggro && tgt && !tgt.dead) {
        this.running = true;
        if (d < this.r + 0.7) { this.ang = Math.atan2(tgt.y - this.y, tgt.x - this.x); if (this.cd <= 0) { this.cd = this.T.cd; this.atkT = 0.35; G.combat.animalHit(this, tgt); } }
        else { mvx = tgt.x - this.x; mvy = tgt.y - this.y; spd = this.T.speed; }
      } else this.running = false;
    }
    if (!spd) {
      this.t -= dt;
      if (this.t <= 0) { this.t = 3 + Math.random() * 6; const a = Math.random() * 6.28, r = Math.random() * 5; this.wx = this.x + Math.cos(a) * r; this.wy = this.y + Math.sin(a) * r; if (Math.random() < 0.4) { this.wx = this.x; this.wy = this.y; } }
      const dx = this.wx - this.x, dy = this.wy - this.y, l = Math.hypot(dx, dy);
      if (l > 0.3) { mvx = dx; mvy = dy; spd = 1.0; } this.running = false;
    }
    const l = Math.hypot(mvx, mvy);
    this.moving = l > 0 && spd > 0;
    if (this.moving) { mvx /= l; mvy /= l; this.ang = Math.atan2(mvy, mvx); const hit = TZ.moveCircle(W, this, mvx * spd * dt * W.slowAt(this.x, this.y), mvy * spd * dt, 'z'); if (hit) this.t = 0; this.anim += dt * spd * 3; }
    this.dir = V.dirIndex(this.ang, 8);
  }
  // companion dog: follows its owner, bites zombies; strays wander and wait to be tamed
  dogAI(dt, G) {
    const W = G.world; let mvx = 0, mvy = 0, spd = 0;
    const owner = this.owner ? G.playerByUid(this.owner) : null;
    if (owner && !owner.dead) {
      const od = dist(this.x, this.y, owner.x, owner.y);
      if (od > 30) { const f = G.findFree(owner.x, owner.y, 2); if (f) { this.x = f.x; this.y = f.y; } }
      // target: closest zombie near the dog or the owner
      let tz = null, td = 49;
      for (const z of G.zgrid.query(this.x, this.y, 8, G._tmpC.slice())) { if (z.dead) continue; const d = dist2(this.x, this.y, z.x, z.y); if (d < td && dist2(owner.x, owner.y, z.x, z.y) < 144) { td = d; tz = z; } }
      if (tz) {
        const d = Math.sqrt(td); this.running = true;
        if (d < this.r + tz.r + 0.35) { this.ang = Math.atan2(tz.y - this.y, tz.x - this.x); if (this.cd <= 0) { this.cd = this.T.cd; this.atkT = 0.3; G.ev('snd', 'wolf_bite', this.x, this.y); G.ev('blood', tz.x, tz.y, 4, null); tz.damage(G, this.T.dmg, owner.pid, 'dog'); tz.kx += Math.cos(this.ang) * 1.5; tz.ky += Math.sin(this.ang) * 1.5; } }
        else { mvx = tz.x - this.x; mvy = tz.y - this.y; spd = this.T.speed * 1.1; }
      } else if (this.mode === 'stay') { this.running = false; }
      else if (od > 2.4) { mvx = owner.x - this.x; mvy = owner.y - this.y; spd = od > 6 ? this.T.speed * 1.15 : 2.6; this.running = od > 6; }
      else this.running = false;
      if (!tz) this.hp = Math.min(this.maxHp, this.hp + dt * 2.5);
      if (owner.vehicle && od > 3) { const v = G.vehicles.find(v => v.id === owner.vehicle); if (v && Math.abs(v.v) > 3) { this.x = owner.x; this.y = owner.y; mvx = mvy = 0; spd = 0; } }
    } else {
      // stray: wander, keep a little distance from strangers
      const p = G.nearestPlayer(this.x, this.y), d = p ? dist(this.x, this.y, p.x, p.y) : 99;
      if (d < 2) { mvx = this.x - p.x; mvy = this.y - p.y; spd = 1.6; }
      else if (d < 7) { this.ang = Math.atan2(p.y - this.y, p.x - this.x); }
      else {
        this.t -= dt;
        if (this.t <= 0) { this.t = 2 + Math.random() * 5; const a = Math.random() * 6.28, r = Math.random() * 6; this.wx = this.x + Math.cos(a) * r; this.wy = this.y + Math.sin(a) * r; }
        const dx = this.wx - this.x, dy = this.wy - this.y; if (Math.hypot(dx, dy) > 0.3) { mvx = dx; mvy = dy; spd = 1.3; }
      }
      this.running = false;
    }
    const l = Math.hypot(mvx, mvy);
    this.moving = l > 0 && spd > 0;
    if (this.moving) { mvx /= l; mvy /= l; this.ang = Math.atan2(mvy, mvx); const hit = TZ.moveCircle(W, this, mvx * spd * dt * W.slowAt(this.x, this.y), mvy * spd * dt, 'p'); if (hit) this.t = 0; this.anim += dt * spd * 3; }
    this.dir = V.dirIndex(this.ang, 8);
  }
  damage(G, n, by, kind) {
    if (this.dead) return;
    if (by) n *= TZ.perkDmg(G, by, kind, true);
    if (this.owner && by && G.players.get(by) && G.playerByUid(this.owner) === G.players.get(by)) return; // owners can't hurt their dog
    this.hp -= n; this.hitT = 0.1; this.angry = 12;
    if (this.hp <= 0) { this.dead = true; this.deadT = 0; G.onAnimalDeath(this, by); }
  }
}
TZ.Animal = Animal;

// =============================================================== GHOST (client-side mirror)
class Ghost {
  constructor(kind, id) { this.kind = kind; this.id = id; this.x = 0; this.y = 0; this.nx = 0; this.ny = 0; this.ang = 0; this.dir = 0; this.anim = 0; this.hitT = 0; this.atkT = 0; this.dead = false; this.deadT = 0; this.moving = false; this.r = 0.3; this.seen = 0; }
  update(dt) {
    const k = Math.min(1, dt * 10);
    if (Math.abs(this.nx - this.x) > 5 || Math.abs(this.ny - this.y) > 5) { this.x = this.nx; this.y = this.ny; }
    const dx = this.nx - this.x, dy = this.ny - this.y;
    this.x += dx * k; this.y += dy * k;
    this.moving = Math.abs(dx) + Math.abs(dy) > 0.01;
    this.anim += dt * (this.moving ? (this.running ? 11 : 6) : 2);
    this.hitT = Math.max(0, this.hitT - dt); this.atkT = Math.max(0, this.atkT - dt); this.flash = Math.max(0, (this.flash || 0) - dt); this.recoil = Math.max(0, (this.recoil || 0) - dt * 30);
    if (this.dead) this.deadT += dt;
    this.dir = V.dirIndex(this.ang, 8);
  }
}
TZ.Ghost = Ghost;
})();
