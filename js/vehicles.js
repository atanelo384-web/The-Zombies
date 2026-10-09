// =====================================================================
//  THE ZOMBIES 2.0 — drivable vehicles
// =====================================================================
'use strict';
(() => {
const V = TZ.Vox;
const PAINTS = [[150, 60, 40], [70, 110, 150], [180, 170, 150], [70, 110, 80], [130, 120, 60], [90, 90, 96], [160, 140, 50], [120, 40, 60], [200, 200, 196], [40, 44, 50]];
TZ.PAINTS = PAINTS;

class Vehicle {
  constructor(G, vk, x, y, a, st = 'broken', id) {
    this.kind = 'vehicle'; this.id = id || G.nid(); this.vk = vk; this.mods = {}; this.T = Object.assign({}, TZ.VEHICLES[vk]);
    this.x = x; this.y = y; this.a = a || 0; this.v = 0; this.steer = 0; this.throttle = 0;
    const R = Math.random;
    this.paint = vk === 'police' || vk === 'uaz' || vk === 'buggy' || vk === 'snowmobile' || this.T.air || this.T.water ? -1 : (R() * PAINTS.length) | 0;
    this.seats = new Array(this.T.seats).fill(null);
    this.state = 'ok'; this.hp = this.T.hp; this.fuel = this.T.fuel * 0.6; this.flat = 0; this.battery = true;
    if (st === 'broken') { this.hp = this.T.hp * (0.2 + R() * 0.45); this.fuel = R() < 0.4 ? 0 : this.T.fuel * R() * 0.25; this.flat = R() < 0.35 ? 1 + (R() < 0.3 ? 1 : 0) : 0; this.battery = R() > 0.4; }
    if (st === 'broken_start') { this.hp = this.T.hp * 0.3; this.fuel = 0; this.flat = 1; this.battery = true; }
    if (st === 'wreck') { this.state = 'wreck'; this.hp = 0; this.fuel = 0; }
    if (st === 'new') { this.hp = this.T.hp; this.fuel = this.T.fuel * 0.5; }
    this.burnT = 0; this.smokeT = 0; this.hornT = 0; this.honk = 0; this.dmgAcc = 0; this.km = 0;
    this.nx = x; this.ny = y; this.na = this.a; this.alt = 0; this.spool = 0; this.rotor = 0; this.nalt = 0;
  }
  get air() { return this.T.air; } get boat() { return !!this.T.water; }
  // upgrades change the vehicle's own copy of its stats
  applyMods() {
    const B = TZ.VEHICLES[this.vk], m = this.mods || {}, T = this.T = Object.assign({}, B), hpR = this.hp / (this._maxHp || B.hp), fR = this.fuel / (this._maxFuel || B.fuel);
    const e = m.engine2 ? 2 : m.engine1 ? 1 : 0;
    T.speed = B.speed * (1 + e * 0.16); T.accel = B.accel * (1 + e * 0.25);
    if (m.armor) { T.hp = Math.round(B.hp * 1.7); T.mass = B.mass * 1.35; T.speed *= 0.95; }
    if (m.ram) T.mass *= 1.2;
    if (m.tank) T.fuel = Math.round(B.fuel * 2);
    if (m.tires) { T.off = Math.max(B.off, 1.08); T.snow = Math.max(B.snow, 0.95); T.sand = 1; }
    this._maxHp = T.hp; this._maxFuel = T.fuel;
    if (isFinite(hpR) && this.state !== 'wreck') this.hp = Math.min(T.hp, T.hp * hpR);
    if (isFinite(fR)) this.fuel = Math.min(T.fuel, T.fuel * fR);
  }
  get modView() { const m = this.mods || {}; const e = m.engine2 ? 2 : m.engine1 ? 1 : 0; const o = {}; if (m.ram) o.ram = 1; if (m.spikes) o.spikes = 1; if (m.armor) o.armor = 1; if (e) o.engine = e; if (m.tank) o.tank = 1; if (m.light) o.light = 1; if (m.tires) o.tires = 1; return Object.keys(o).length ? o : null; }
  get spr() { return TZ.Chars.vehicleSet(this.vk, this.paint >= 0 ? PAINTS[this.paint] : null, this.modView); }
  get frameState() { return this.state === 'wreck' ? 2 : this.hp / this.T.hp > 0.5 ? 0 : 1; }
  get driver() { return this.seats[0]; }
  problems() {
    const p = [];
    if (this.state === 'wreck') return ['Сгорела — только разобрать'];
    if (this.flat) p.push(`Спущено колёс: ${this.flat}`);
    if (!this.battery) p.push('Разряжен аккумулятор');
    if (this.fuel <= 0.5 && !this.T.nofuel) p.push('Нет топлива');
    if (this.hp / this.T.hp < 0.15) p.push('Двигатель почти разбит');
    return p;
  }
  canStart() { if (this.T.nofuel) return this.state !== 'wreck' && this.hp > 0; return this.state !== 'wreck' && this.battery && !this.flat && this.fuel > 0.5; }
  serialize() { return { id: this.id, vk: this.vk, x: +this.x.toFixed(2), y: +this.y.toFixed(2), a: +this.a.toFixed(3), hp: Math.round(this.hp), fuel: +this.fuel.toFixed(1), flat: this.flat, battery: this.battery, state: this.state, paint: this.paint, km: Math.round(this.km), trunk: this.trunk && Object.keys(this.trunk).length ? this.trunk : undefined, mods: Object.keys(this.mods || {}).length ? this.mods : undefined, owner: this.owner || undefined }; }
  static load(G, d) { const v = new Vehicle(G, d.vk, d.x, d.y, d.a, 'new', d.id); v.mods = d.mods || {}; v.applyMods(); Object.assign(v, { hp: d.hp, fuel: d.fuel, flat: d.flat, battery: d.battery, state: d.state, paint: d.paint, km: d.km || 0, trunk: d.trunk || {}, owner: d.owner || 0 }); return v; }
  net() { return [this.id, this.vk, +this.x.toFixed(2), +this.y.toFixed(2), +this.a.toFixed(3), +this.v.toFixed(1), Math.round(this.hp), this.state === 'wreck' ? 1 : 0, this.flat, this.battery ? 1 : 0, Math.round(this.fuel), this.seats, this.paint, +this.steer.toFixed(1), this.honk ? 1 : 0, this.mods, this.braking ? 1 : 0, +this.alt.toFixed(2), +this.spool.toFixed(2)]; }
  applyNet(a, mine) {
    if (!mine) { this.nx = a[2]; this.ny = a[3]; this.na = a[4]; this.v = a[5]; this.steer = a[13]; if (!this._init) { this._init = 1; this.x = this.nx; this.y = this.ny; this.a = this.na; } }
    this.hp = a[6]; this.state = a[7] ? 'wreck' : 'ok'; this.flat = a[8]; this.battery = !!a[9]; this.fuel = a[10]; this.seats = a[11]; this.paint = a[12]; this.honk = a[14]; this.braking = !!a[16]; if (!mine) { this.nalt = a[17] || 0; this.spool = a[18] || 0; }
    const mk = JSON.stringify(a[15] || {}); if (mk !== this._mk) { this._mk = mk; this.mods = a[15] || {}; this.applyMods(); this.hp = a[6]; this.fuel = a[10]; }
  }
  ghostUpdate(dt) {
    const k = Math.min(1, dt * 10);
    if (Math.abs(this.nx - this.x) > 6 || Math.abs(this.ny - this.y) > 6) { this.x = this.nx; this.y = this.ny; this.a = this.na; }
    this.x += (this.nx - this.x) * k; this.y += (this.ny - this.y) * k; this.a += TZ.angDiff(this.a, this.na) * k; this.alt += ((this.nalt || 0) - this.alt) * k;
    if (this.air) this.rotor = (this.rotor || 0) + dt * 30 * this.spool;
  }
  // oriented-rectangle sample points
  points(x, y, a) {
    const L = this.T.len / 2, Wd = this.T.wid / 2, c = Math.cos(a), s = Math.sin(a), out = [];
    for (const [lx, ly] of [[L, Wd], [L, -Wd], [-L, Wd], [-L, -Wd], [L, 0], [-L, 0], [0, Wd], [0, -Wd], [L * 0.5, Wd], [L * 0.5, -Wd], [-L * 0.5, Wd], [-L * 0.5, -Wd]]) out.push([x + lx * c - ly * s, y + lx * s + ly * c]);
    return out;
  }
  blocked(W, x, y, a, uid) {
    if (this.T && this.T.air && this.alt > 0.25) return !W.chunkIf(Math.floor(x / TZ.CH), Math.floor(y / TZ.CH));
    if (this.T && this.T.water) { // boats: every hull point must be on water
      for (const [px, py] of this.points(x, y, a)) { const g = W.groundIf(px, py); if (g !== TZ.TILE.WATER && g !== TZ.TILE.SHALLOW) return true; const o = W.get(px, py); if (o && TZ.OBJ[o.t] && TZ.OBJ[o.t].solid) return true; }
      return false;
    }
    for (const [px, py] of this.points(x, y, a)) { if (W.solidFor(px, py, 'p', uid)) { const o = W.get(px, py); if (o && TZ.OBJ[o.t] && !TZ.OBJ[o.t].solid) continue; return true; } }
    return false;
  }
  contains(px, py, pad = 0) {
    const c = Math.cos(-this.a), s = Math.sin(-this.a), dx = px - this.x, dy = py - this.y;
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) < this.T.len / 2 + pad && Math.abs(ly) < this.T.wid / 2 + pad;
  }
  // local physics (run by the driver's machine)
  drive(dt, G, inp) {
    if (this.T.air) return this.driveAir(dt, G, inp);
    const T = this.T, W = G.world;
    const running = this.canStart();
    let thr = running ? inp.t : 0;
    const g = W.groundIf(this.x, this.y);
    const road = TZ.isRoad(g) || g === TZ.TILE.CONCRETE || g === TZ.TILE.GRAVEL;
    const snow = TZ.SOFT_GROUND.has(g) || g === TZ.TILE.ICE;
    const sand = g === TZ.TILE.SAND || g === TZ.TILE.DUNE;
    let maxV = T.speed * (road ? 1 : snow ? T.snow : sand ? (T.sand || (this.vk === 'buggy' ? 0.95 : 0.55)) : T.off) * (0.55 + 0.45 * Math.min(1, this.hp / T.hp * 2));
    if (g === TZ.TILE.SHALLOW) maxV *= 0.5;
    const accel = T.accel * (snow && this.vk !== 'snowmobile' ? 0.6 : 1);
    if (thr > 0) { if (this.v < 0) this.v += accel * 2.4 * dt; else this.v += accel * thr * dt * (1 - this.v / maxV * 0.6); }
    else if (thr < 0) { if (this.v > 0.2) this.v -= accel * 2.4 * dt; else this.v = Math.max(-maxV * 0.4, this.v - accel * 0.7 * dt); }
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), (g === TZ.TILE.ICE ? 0.6 : 2.4) * dt);
    if (inp.brake) this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 14 * dt);
    this.braking = !!inp.brake || (thr < 0 && this.v > 0.2);
    if (this.v > maxV) this.v -= (this.v - maxV) * Math.min(1, dt * 2);
    this.steer += (inp.s - this.steer) * Math.min(1, dt * 8);
    const turn = T.turn * this.steer * dt * clamp(this.v / 3.5, -1, 1) * (inp.brake ? 1.5 : 1);
    const na = this.a + turn;
    const nx = this.x + Math.cos(na) * this.v * dt, ny = this.y + Math.sin(na) * this.v * dt;
    if (!this.blocked(W, nx, ny, na, inp.uid)) { this.km += Math.hypot(nx - this.x, ny - this.y) * 1.7 / 1000; this.x = nx; this.y = ny; this.a = na; }
    else if (!this.blocked(W, this.x, this.y, na, inp.uid)) { this.a = na; this.crash(G, Math.abs(this.v)); }
    else this.crash(G, Math.abs(this.v));
    if (running && !T.nofuel) this.fuel = Math.max(0, this.fuel - (Math.abs(thr) * 0.22 + 0.01) * dt);
    if (T.water && Math.abs(this.v) > 1.5 && Math.random() < dt * 14) G.fx.add({ x: this.x - Math.cos(this.a) * T.len * 0.5 + (Math.random() - .5) * 0.6, y: this.y - Math.sin(this.a) * T.len * 0.5 + (Math.random() - .5) * 0.6, z: 1, vx: 0, vy: 0, vz: 2, g: 0, life: 0.9, max: 0.9, c: 'rgba(230,240,245,', s: 2, type: 'smoke' });
    if (inp.horn) { this.honk = 1; if (this.hornT <= 0) { this.hornT = 0.5; G.ev('snd', 'carhorn', this.x, this.y); G.noise(this.x, this.y, 30); } } else this.honk = 0;
    this.hornT -= dt;
  }
  // helicopters hover (Shift up, Space down); planes need a run-up and speed to stay in the air
  driveAir(dt, G, inp) {
    const T = this.T, W = G.world, running = this.canStart();
    const heli = T.air === 'heli';
    this.spool = clamp(this.spool + (running && (inp.t || inp.up || inp.s || this.alt > 0.02) ? dt * (heli ? 0.45 : 1.2) : -dt * 0.35), 0, 1);
    this.rotor += dt * 30 * this.spool;
    const wasAlt = this.alt;
    let thr = running ? inp.t : 0;
    if (heli) {
      let climb = inp.up ? 1 : inp.brake ? -1 : 0;
      if (!running) climb = -0.8; // autorotation
      if (this.spool < 0.75 && climb > 0) { climb = 0; if (inp.up && !this._spoolHint) { this._spoolHint = 1; G.hint('Винт раскручивается…'); } }
      this.alt = clamp(this.alt + climb * dt * 0.42, 0, 1);
      if (this.alt > 0.12) { const tv = thr * T.speed * (thr < 0 ? 0.4 : 1); this.v += (tv - this.v) * Math.min(1, dt * 0.9); this.a += inp.s * T.turn * dt; }
      else { this.v *= Math.max(0, 1 - dt * 4); this.a += inp.s * T.turn * dt * 0.4 * this.spool; }
    } else {
      if (thr > 0) this.v += T.accel * dt * (this.alt > 0.1 ? 0.6 : 1); else if (thr < 0) this.v -= T.accel * 1.3 * dt;
      if (inp.brake && this.alt < 0.05) this.v -= 8 * dt;
      this.v -= this.v * (this.alt > 0.05 ? 0.03 : 0.12) * dt + (thr <= 0 && this.alt < 0.05 ? 1.2 * dt : 0);
      this.v = clamp(this.v, 0, T.speed);
      const g = W.groundIf(this.x, this.y), flat = TZ.isRoad(g) || g === TZ.TILE.CONCRETE || g === TZ.TILE.FIELD || g === TZ.TILE.PLAINS || g === TZ.TILE.GRASS || g === TZ.TILE.GRASS2 || g === TZ.TILE.DUNE || g === TZ.TILE.SAND || g === TZ.TILE.SNOW || g === TZ.TILE.ICE || g === TZ.TILE.CRACKED;
      if (this.alt < 0.05 && !flat) this.v = Math.min(this.v, 4);
      const lift = (this.v - T.takeoff) / T.takeoff;
      if (lift > 0 && (thr > 0 || this.alt > 0.05) && running) this.alt = clamp(this.alt + lift * dt * 0.55 + (inp.up ? dt * 0.2 : 0) - (inp.brake ? dt * 0.35 : 0), 0, 1);
      else if (this.alt > 0) this.alt = Math.max(0, this.alt - dt * (lift > -0.2 && running ? 0.12 : 0.3));
      const k = this.alt > 0.05 ? 1 : clamp(this.v / 5, 0, 1) * 0.7;
      this.a += inp.s * T.turn * dt * k;
    }
    // landing / ground contact
    if (wasAlt > 0.04 && this.alt <= 0.04) {
      const hard = heli ? (wasAlt - this.alt) / dt > 0.5 || !running : this.v > T.takeoff * 1.35;
      if (hard) { this.dmgAcc += heli ? 25 : (this.v - T.takeoff) * 9; G.camera.shake(8); TZ.audio.play('crash', 1); }
      this.alt = 0;
    }
    if (this.alt < 0.26 && this.alt > 0 && this.blocked(W, this.x, this.y, this.a, inp.uid)) {
      if (heli && running) { this.alt = 0.26; if (!this._noLand) { this._noLand = 1; G.hint('Здесь не сесть — найдите ровное место'); } }
      else { this.dmgAcc += 30; this.alt = 0.26; this.v *= 0.3; G.camera.shake(9); TZ.audio.play('crash', 1); }
    } else this._noLand = 0;
    const nx = this.x + Math.cos(this.a) * this.v * dt, ny = this.y + Math.sin(this.a) * this.v * dt;
    if (!this.blocked(W, nx, ny, this.a, inp.uid)) { this.km += Math.hypot(nx - this.x, ny - this.y) * 1.7 / 1000; this.x = nx; this.y = ny; }
    else this.crash(G, Math.abs(this.v));
    if (running) this.fuel = Math.max(0, this.fuel - (Math.abs(thr) * 0.3 + 0.06 + this.alt * 0.12) * dt);
    this.braking = false; this.steer += (inp.s - this.steer) * Math.min(1, dt * 6);
    if (inp.horn) { this.honk = 1; if (this.hornT <= 0) { this.hornT = 0.5; G.ev('snd', 'carhorn', this.x, this.y); } } else this.honk = 0;
    this.hornT -= dt;
  }
  crash(G, impact) {
    if (impact > 3.5) { const d = (impact - 3.5) * 4.5 / this.T.mass * (this.mods && this.mods.ram ? 0.4 : 1); this.dmgAcc += d; G.camera.shake(Math.min(10, impact)); TZ.audio.play('crash', 1); G.fx.sparks(this.x + Math.cos(this.a) * this.T.len / 2, this.y + Math.sin(this.a) * this.T.len / 2, 6); }
    this.v = -this.v * 0.25;
  }
}
TZ.Vehicle = Vehicle;
})();
