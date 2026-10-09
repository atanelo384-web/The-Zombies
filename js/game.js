// =====================================================================
//  THE ZOMBIES 2.0 — game core
//  role: 'solo' | 'host' | 'client'.  Authority (solo/host) simulates the
//  world; clients mirror it from snapshots and send actions.
// =====================================================================
'use strict';
(() => {
const CH = TZ.CH;
const MIN_PER_SEC = 1440 / 480; // 8 real minutes per day
const UPGRADE = { wall_wood: { to: 'wall_stone', cost: { stone: 6 } }, wall_stone: { to: 'wall_metal', cost: { metal: 6 } }, gate_wood: { to: 'gate_metal', cost: { metal: 10, parts: 2 } } };
const DOG_FOOD = ['raw_meat', 'steak', 'fish', 'fish_cooked'];
const VIEW_CHUNKS = 3, UNLOAD_CHUNKS = 6;
const OBJ_NAMES = { crate: 'Ящик', mcrate: 'Военный ящик', drop: 'Груз с воздуха', cabinet: 'Шкаф', fridge: 'Холодильник', locker: 'Шкафчик', dumpster: 'Мусорный бак', pump: 'Колонка', bus: 'Автобус', scrap: 'Металлолом', corpse: 'Тело', shelf: 'Стеллаж', medcab: 'Аптечный шкаф', toolbox: 'Ящик с инструментами', desk: 'Стол с компьютером', tent: 'Палатка', helicrash: 'Обломки вертолёта', bush: 'Ягодный куст', apple: 'Яблоня', backpack: 'Рюкзак' };
TZ.OBJ_NAMES = OBJ_NAMES;

class Game {
  constructor(opts) {
    TZ.game = this;
    this.role = opts.role || 'solo'; this.auth = this.role !== 'client';
    this.net = opts.net || null; this.worldId = opts.worldId || null; this.meta = opts.meta || {};
    this.diffKey = this.meta.diff || 'normal'; this.diff = TZ.DIFFICULTY[this.diffKey];
    this.pvp = !!this.meta.pvp; this.story = this.meta.story !== false;
    this.fx = new TZ.FX(); this.combat = new TZ.Combat(this);
    this.camera = { x: 0, y: 0, sx: 0, sy: 0, amt: 0, zoom: 0, shake(n) { if (TZ.settings.shake) this.amt = Math.max(this.amt, n); } };
    this.zgrid = new TZ.Grid(1, 2); this._tmpA = []; this._tmpB = []; this._tmpC = [];
    this.mouseWorld = { x: 0, y: 0 }; this.mode = 'play'; this.paused = false; this.uiBlocking = false; this.canControl = true; this.typing = false;
    this.clans = []; this.players = new Map(); this.zombies = []; this.allies = []; this.animals = []; this.vehicles = []; this.pickups = []; this.structures = new Set();
    this.evq = []; this._nid = 1;
    this.flows = new Map(); this.flowT = 0; this.dirtyFlow = true; this.directorT = 2; this.questT = 0; this.saveT = 60;
    this.horde = null; this.evacDay = 0; this.heli = null; this.won = false; this.endless = false;
    this.buildSel = 'wall_wood'; this.buildCd = 0; this.search = null; this.interact = null; this.hintTimes = {};
    this.weather = { rain: 0, snow: 0, target: 0, nextChange: 200, fog: 0 };
    this.stats = { kills: 0, built: 0, nights: 0, startT: Date.now() };
    this.quest = { done: {}, radioparts: 0 };
    this.playerData = {}; this.minutes = 7 * 60; this.day = 1;
    this.enclosures = new Map(); this._encVer = -1; this._encT = 0;
    this.chests = new Map(); // client: last known chest contents
    const acc = TZ.Account.active();
    this.me = new TZ.Player(opts.pid || 'h', acc.id, acc.name);
    this.me.look = acc.look || TZ.Chars.defaultLook();
    this.players.set(this.me.pid, this.me);
    if (this.role === 'client') this.setupClient(opts.welcome);
    else if (opts.save) this.loadSave(opts.save);
    else this.newWorld(opts.seed);
    this.world.onChunk = (c, remod) => this.onChunkLoaded(c, remod);
    this.world.onUnload = (c) => { for (const o of [...this.structures]) if (Math.floor(o.x / CH) === c.cx && Math.floor(o.y / CH) === c.cy) this.structures.delete(o); };
    this.world.onChange = (x, y, o) => { if (this.auth && this.net) this.net.broadcast('obj', { x, y, o: o ? TZ.stripObj(this.netObj(o)) : 0 }); };
    for (const c of this.world.chunks.values()) this.onChunkLoaded(c);
    this.streamChunks(true);
    this.autoSelect();
  }
  nid() { return this._nid++; }
  // ---------------------------------------------------------------- setup
  newWorld(seed) {
    this.world = new TZ.World(seed ?? ((Math.random() * 1e9) | 0));
    this.meta.seed = this.world.seed;
    this.spawnPoint = { x: 70.5, y: 74.5 };
    this.me.x = this.spawnPoint.x; this.me.y = this.spawnPoint.y;
  }
  setupClient(w) {
    this.world = new TZ.World(w.seed, { biomeOffset: w.off });
    for (const id of w.spawned || []) this.world.spawned.add(id);
    this.minutes = w.minutes; this.day = w.day; this.diffKey = w.diff; this.diff = TZ.DIFFICULTY[w.diff]; this.pvp = !!w.pvp; this.meta.name = w.name;
    this.spawnPoint = w.spawn;
    if (w.player) this.me.load(w.player); else { this.me.x = w.spawn.x + (Math.random() - .5) * 2; this.me.y = w.spawn.y + (Math.random() - .5) * 2; }
    this.serverName = w.name;
  }
  // ---------------------------------------------------------------- time
  get hour() { return (this.minutes / 60) % 24; }
  isNight() { const h = this.hour; return h >= 20.5 || h < 5.5; }
  darkness() { const h = this.hour; if (h >= 7 && h < 18) return 0; if (h >= 18 && h < 21) return (h - 18) / 3; if (h >= 21 || h < 4.5) return 1; return 1 - (h - 4.5) / 2.5; }
  // ---------------------------------------------------------------- local inventory
  count(id) { return this.me.inv[id] || 0; }
  take(id, n) { const inv = this.me.inv; inv[id] = (inv[id] || 0) - n; if (inv[id] <= 0) { delete inv[id]; if (TZ.ITEMS[id] && TZ.ITEMS[id].type === 'wear') for (const s in this.me.eq) if (this.me.eq[s] === id) this.me.eq[s] = null; } this.ui && this.ui.dirty(); }
  add(id, n) { const inv = this.me.inv; inv[id] = (inv[id] || 0) + n; this.ui && this.ui.dirty(); }
  weight() { let w = 0; for (const k in this.me.inv) w += (TZ.ITEMS[k] ? TZ.ITEMS[k].w : 0) * this.me.inv[k]; return w; }
  receive(items, x, y, silent) { // local player gets items
    let i = 0;
    for (const id in items) {
      const n = items[id]; const it = TZ.ITEMS[id]; if (!it || !n) continue;
      if (it.type === 'weapon' && this.count(id) > 0) { this.add('parts', 2); if (!silent) this.fx.text(x ?? this.me.x, y ?? this.me.y, `+2 ${TZ.ITEMS.parts.name}`, '#c8d0d8'); continue; }
      this.add(id, n);
      if (!silent) setTimeout(() => this.fx.text(x ?? this.me.x, y ?? this.me.y, `+${n} ${it.name}`, it.type === 'weapon' ? '#ffd24a' : '#e8f0d8'), i * 120);
      i++;
      if ((it.type === 'weapon' || it.type === 'throw' || id === 'medkit' || id === 'bandage') && !this.me.hotbar.includes(id)) { const slot = this.me.hotbar.indexOf(null); if (slot >= 0) { this.me.hotbar[slot] = id; if (it.type === 'weapon') this.msg(`Новое оружие: ${it.name} — клавиша ${slot + 1}`, 'good'); } }
      if (TZ.WEAPONS[id] && TZ.WEAPONS[id].mag && this.me.mags[id] == null) this.me.mags[id] = 0;
      if (it.type === 'wear' && !this.me.eq[it.slot]) { this.me.eq[it.slot] = id; this.msg(`Надето: ${it.name}`, 'good'); }
      this.acc('items', n);
    }
    if (!silent && i) TZ.audio.play('pickup');
  }
  autoSelect() { const P = this.me; if (!P.hotbar[P.sel] || !this.count(P.hotbar[P.sel])) { const i = P.hotbar.findIndex(h => h && this.count(h) && TZ.WEAPONS[h]); if (i >= 0) P.sel = i; } }
  myChests(x = this.me.x, y = this.me.y) { const out = []; for (const o of this.structures) if (o.t === 'chest' && (!o.owner || o.owner === this.me.uid || TZ.gateAllows({ t: 'gate_code', owner: o.owner, allow: o.allow }, this.me.uid)) && dist2(x, y, o.x + .5, o.y + .5) < 256) out.push(o); return out; }
  avail(id) { let n = this.count(id); for (const c of this.myChests()) n += (c.items && c.items[id]) || 0; return n; }
  canAfford(cost) { for (const k in cost) if (this.avail(k) < cost[k]) return false; return true; }
  // pays from inventory first; returns the remainder that must come from chests
  payLocal(cost) { const rest = {}; for (const k in cost) { const a = Math.min(cost[k], this.count(k)); if (a) this.take(k, a); if (cost[k] - a > 0) rest[k] = cost[k] - a; } return rest; }
  useItem(id) {
    const P = this.me, it = TZ.ITEMS[id]; if (!it || !this.count(id)) return;
    if (it.type === 'weapon' || it.type === 'throw') { let slot = P.hotbar.indexOf(id); if (slot < 0) { slot = P.hotbar.indexOf(null); if (slot < 0) slot = P.sel; P.hotbar[slot] = id; } P.sel = slot; P.reload = 0; TZ.audio.play('equip'); this.ui.dirty(); return; }
    if (it.type === 'wear') { if (P.eq[it.slot] === id) { P.eq[it.slot] = null; this.msg(`Снято: ${it.name}`); } else { P.eq[it.slot] = id; this.msg(`Надето: ${it.name}`, 'good'); } TZ.audio.play('cloth'); this.ui.dirty(); return; }
    if (it.type === 'food') {
      if (it.food) P.hunger = clamp(P.hunger + it.food, 0, 100);
      if (it.water) P.thirst = clamp(P.thirst + it.water, 0, 100);
      if (it.stamina) P.stamina = Math.min(100, P.stamina + it.stamina);
      if (it.warm) P.warmth = Math.min(100, P.warmth + it.warm);
      if (it.sick && Math.random() < it.sick) { P.sick = Math.min(100, P.sick + 50); this.msg('Вы отравились! Нужны антибиотики.', 'bad'); }
      this.take(id, 1); TZ.audio.play(it.water && !it.food ? 'drink' : 'eat');
      this.fx.text(P.x, P.y, it.food ? `+${it.food} сытость` : `+${it.water} вода`, '#9fe08a');
      this.acc('eaten', 1);
      return;
    }
    if (it.type === 'med') {
      if (P.hp >= P.maxHp && !P.bleeding && !(it.cure && (P.infection > 0 || P.sick > 0)) && !it.buff) { this.hint('Вы здоровы'); return; }
      P.hp = Math.min(P.maxHp, P.hp + it.heal);
      if (it.stopBleed) P.bleeding = false;
      if (it.cure) { P.infection = 0; P.sick = 0; this.msg('Заражение и отравление вылечены.', 'good'); }
      if (it.buff === 'tough') P.buffs.tough = 30;
      if (it.buff === 'fast') P.buffs.fast = 20;
      this.take(id, 1); TZ.audio.play('bandage'); this.fx.text(P.x, P.y, `+${it.heal} HP`, '#7dff8a');
      return;
    }
    this.hint(it.desc);
  }
  dropItem(id, n) { if (!this.count(id)) return; n = Math.min(n, this.count(id)); this.take(id, n); this.me.hotbar = this.me.hotbar.map(h => (h === id && !this.count(id)) ? null : h); this.act('drop', { id, n, x: this.me.x + Math.cos(this.me.ang) * 0.8, y: this.me.y + Math.sin(this.me.ang) * 0.8 }); this.autoSelect(); }
  // ---------------------------------------------------------------- messages & routing
  msg(t, kind = 'info') { this.ui && this.ui.log(t, kind); }
  hint(t) { const now = performance.now(); if (this.hintTimes[t] && now - this.hintTimes[t] < 4000) return; this.hintTimes[t] = now; this.msg(t, 'hint'); }
  playerByUid(uid) { for (const p of this.players.values()) if (p.uid === uid) return p; return null; }
  toPlayer(pid, type, data) { // pid: session id; allies/turrets ignored
    if (!pid || typeof pid !== 'string' || pid[0] === 'a' || pid === 't' || pid === 'vis') return;
    if (pid === this.me.pid) this.onPersonal(type, data);
    else if (this.net && this.auth) this.net.send(pid, type, data);
  }
  msgTo(uid, t, kind) { if (!uid) return; const p = this.playerByUid(uid); if (p) this.toPlayer(p.pid, 'msg', { t, kind }); }
  hintTo(pid, t) { this.toPlayer(pid, 'hint', { t }); }
  giveTo(pid, items, x, y) { const clean = {}; for (const k in items) if (items[k] > 0) clean[k] = items[k]; if (Object.keys(clean).length) this.toPlayer(pid, 'give', { items: clean, x, y }); }
  hurtPlayer(p, n, o = {}) {
    if (!p || p.dead || p.vehicle) return;
    if (o.by && p.pid === o.by) return;
    if (o.by && this.clanBlocksDamage && this.clanBlocksDamage(o.by, p)) return; // clans: no friendly fire, peaceful clans
    this.toPlayer(p.pid, 'hurt', { n, bleed: o.bleed, inf: o.inf, chill: o.chill, dry: o.dry, push: o.push, acid: o.acid, silent: o.silent, by: o.by });
  }
  healEntity(t, n) { if (t.kind === 'player') this.toPlayer(t.pid, 'heal', { n }); else t.hp = Math.min(t.maxHp, t.hp + n); this.ev('text', t.x, t.y, '+' + n, '#7dff8a'); }
  // personal events (arrive locally or from host)
  // ---- voice chat transport (see voice.js)
  voiceSend(to, data) { if (!this.net) return; if (this.role === 'host') this.toPlayer(to, 'vsig', { from: this.me.pid, data }); else this.net.send('vsig', { to, data }); }
  voiceState(d) { if (!this.net) return; if (this.role === 'host') { for (const q of this.players.values()) if (q !== this.me) this.toPlayer(q.pid, 'vstate', Object.assign({ from: this.me.pid }, d)); } else this.net.send('vstate', d); }
  onPersonal(type, d) {
    const P = this.me;
    switch (type) {
      case 'vsig': TZ.Voice.onSignal(d.from, d.data); break;
      case 'clanInvite': TZ.ClanUI.invited(this, d); break;
      case 'clanChat': this.ui.chatMsg('[клан] ' + d.name, d.text, d.color); break;
      case 'radioChat': if (this.count('walkie') || d.name === P.name) { this.ui.chatMsg('[рация] ' + d.name, d.text, '#e8b030'); TZ.audio.play('radio_on', 0.5); } break;
      case 'vstate': TZ.Voice.onState(d.from, d); break;
      case 'give': this.receive(d.items, d.x, d.y); break;
      case 'hurt': {
        if (P.dead) return;
        if (TZ.isTouch && TZ.settings.vibrate && !d.silent && navigator.vibrate) try { navigator.vibrate(35); } catch (e) { }
        if (d.acid && P.eq.head === 'gasmask') d.n *= 0.5;
        P.damage(d.n, null, !!d.silent);
        if (d.bleed && !P.bleeding) { P.bleeding = true; this.msg('Кровотечение! Используйте бинт [Q].', 'bad'); }
        if (d.inf && P.infection <= 0) { P.infection = 1; this.msg('Вас укусили! Заражение — нужны антибиотики.', 'bad'); }
        if (d.chill) { P.chilled = d.chill; P.warmth = Math.max(0, P.warmth - 6); }
        if (d.dry) P.thirst = Math.max(0, P.thirst - 4);
        if (d.push != null) TZ.moveCircle(this.world, P, Math.cos(d.push) * 0.5, Math.sin(d.push) * 0.5, 'p', P.uid);
        if (P.dead && d.by && d.by !== P.pid) this.act('pvpDeath', { by: d.by });
        break;
      }
      case 'heal': P.hp = Math.min(P.maxHp, P.hp + d.n); if (P.bleeding && Math.random() < 0.3) P.bleeding = false; break;
      case 'msg': this.msg(d.t, d.kind); break;
      case 'hint': this.hint(d.t); break;
      case 'stat': this.acc(d.k, d.n); break;
      case 'kill': this.acc('kills', 1); this.acc('k_' + d.type, 1); if (d.kind === 'melee' || d.kind === 'saw') this.acc('meleeKills', 1); if (d.kind === 'fire') this.acc('fireKills', 1); if (d.type === 'boss') TZ.Account.rn(40 * this.diff.rn, 'Бегемот'); if (this.stats) this.stats.kills++; break;
      case 'akill': this.acc('animals', 1); if (d.ak === 'bear') this.acc('bears', 1); break;
      case 'boomKills': if (d.n >= 10) this.acc('bigBoom', 1); break;
      case 'built': if (d.ok && TZ.BUILD[d.id] && TZ.BUILD[d.id].kind === 'roof') this.acc('roofs', 1);
        if (!d.ok) { this.receive(d.refund || {}, null, null, true); this.hint(d.msg || 'Нельзя построить'); TZ.audio.play('error'); } else { this.acc('built', 1); if (TZ.isCode(d.id) && d.ask) this.ui.codePrompt(d.x, d.y, true); } break;
      case 'vehIn': P.vehicle = d.id; P.seat = d.seat; TZ.audio.play('door'); this.ui.closeVehicle(); const vv = this.vehicles.find(q => q.id === d.id), air = vv && vv.T.air; if (d.seat === 0 && vv && (air || vv.boat)) { this.msg(air === 'heli' ? (TZ.isTouch ? 'Вертолёт: «Вверх»/«Вниз» — высота, джойстик — полёт. Дайте винту раскрутиться.' : 'Вертолёт: Shift — вверх, Пробел — вниз, W/S — вперёд/назад, A/D — поворот. Дайте винту раскрутиться.') : air ? (TZ.isTouch ? 'Самолёт: разгонитесь джойстиком по ровному месту, «Вверх» — набор высоты, «Вниз» — снижение. Садитесь на малой скорости.' : 'Самолёт: W — газ, разгон по ровному месту (дорога, поле), Shift — набор высоты, Пробел — снижение, A/D — крен. Садитесь медленно!') : 'Лодка: W/S — вперёд/назад, A/D — поворот. Подплывите к берегу и нажмите E, чтобы выйти.', 'hint'); } else if (d.seat === 0) this.msg(TZ.isTouch ? 'Левый джойстик: вверх — газ, вниз — тормоз и задний ход, в стороны — руль.' : 'W/S — газ/тормоз, A/D — руль, Пробел — ручник, H — сигнал, E — выйти', 'hint'); break;
      case 'vehOut': if (P.vehicle) { const v = this.vehicles.find(v => v.id === P.vehicle); P.vehicle = 0; P.x = d.x; P.y = d.y; TZ.audio.play('door'); } break;
      case 'gateRes': this.ui.codeResult(d.ok, d.msg); if (d.ok) TZ.audio.play('unlock'); break;
      case 'chest': this.chests.set(d.vid ? 'v' + d.vid : d.x + ',' + d.y, d.items); this.ui.chestUpdate(d.x, d.y, d.items, d.vid); break;
      case 'morning': if (!P.dead) { const rn = Math.round((8 + d.day * 2) * this.diff.rn); TZ.Account.rn(rn, 'ночь пережита'); this.acc('nights', 1); TZ.Account.max('maxDay', d.day); if (this.diffKey === 'hard') this.acc('hardNights', 1); } break;
      case 'evac': TZ.Account.rn(120 * this.diff.rn, 'эвакуация'); this.acc('evac', 1); break;
      case 'quest': this.curQuest = d; break;
      case 'banner': this.ui.banner(d.title, d.sub); break;
      case 'teleport': P.x = d.x; P.y = d.y; break;
      case 'rnDelta': TZ.Account.rn(d.d, d.why); break;
      case 'drive_slow': { const v = this.vehicles.find(v => v.id === P.vehicle); if (v) v.v *= d.f; this.camera.shake(2); break; }
    }
  }
  acc(k, n) { TZ.Account.stat(k, n); }
  // ---------------------------------------------------------------- shared events (FX)
  ev(type, ...a) { this.applyEv([type, ...a]); if (this.net && this.auth) this.evq.push([type, ...a]); }
  applyEv(e) {
    const fx = this.fx, [t, a, b, c, d, f] = e;
    if (t === 'roof') { if (this.role === 'client') this.world.setRoof(a, b, c, d); return; }
    switch (t) {
      case 'blood': fx.blood(a, b, c, 1, d); break;
      case 'spark': fx.sparks(a, b, c); break;
      case 'chips': fx.chips(a, b, c, d, f); break;
      case 'smoke': fx.smoke(a, b, c); break;
      case 'text': if (TZ.settings.dmgNums !== false) fx.text(a, b, c, d); break;
      case 'acid': fx.decal(a, b, TZ.art.acid[(Math.random() * 3) | 0], 60); TZ.audio.play('acid_hit', this.audioVol(a, b)); break;
      case 'boom': fx.boom(a, b, c); TZ.audio.play('explosion', this.audioVol(a, b)); this.camera.shake(Math.max(2, 14 - dist(a, b, this.me.x, this.me.y))); break;
      case 'snd': TZ.audio.play(a, this.audioVol(b, c)); break;
      case 'groan': { const v = this.audioVol(b, c); if (v > 0.4) TZ.audio.groan(a, v); break; }
      case 'shake': { const o = this.world.get(a, b); if (o) o.shake = 0.25; break; }
      case 'molotov': fx.decal(a, b, TZ.art.scorch, 120); fx.sparks(a, b, 12, '#ffb040', 4); if (!this.auth) this.combat.fires.push({ x: a, y: b, r: 1.9, life: 7, max: 7 }); break;
      case 'shot': if (!this.auth && e[5] !== this.me.pid) this.combat.remoteShot(a, b, c, d); break;
      case 'zdie': TZ.audio.zdie(b, this.audioVol(c, d)); fx.blood(c, d, 12, 1.2); fx.decal(c, d, TZ.art.blood[(Math.random() * 6) | 0], 200); break;
      case 'chat': this.ui.chatMsg(a, b, c, d, f); break;
      case 'sys': this.msg(a, b); break;
      case 'banner': this.ui.banner(a, b); break;
      case 'heli': TZ.audio.play('heli'); break;
      case 'flare': (this.flares = this.flares || []).push({ x: a, y: b, t: 28 }); TZ.audio.play('flare', this.audioVol(a, b) * 0.8 + 0.2); fx.sparks(a, b, 20, '#ff6040', 10); break;
      case 'ping': { // shared map marker: [x, y, name, color, uid]
        this.pings = (this.pings || []).filter(p => p.uid !== e[5]);
        this.pings.push({ x: a, y: b, name: c, color: d, uid: e[5], t: 90 });
        TZ.audio.play('beep', 0.7); this.fx.text(a, b, 'МЕТКА', d);
        if (e[5] !== this.me.uid) this.msg(`${c} поставил метку (${Math.round(dist(a, b, this.me.x, this.me.y))} м)`, 'hint');
        break;
      }
    }
  }
  // storage behind a chest action: a chest on the map or a vehicle trunk
  container(d, p) {
    if (d.vid) { const v = this.vehicles.find(v => v.id === d.vid); if (!v || (p && dist(p.x, p.y, v.x, v.y) > 4)) return null; v.trunk = v.trunk || {}; return { o: { get items() { return v.trunk; }, set items(x) { v.trunk = x; } }, x: v.x, y: v.y, vid: v.id, max: v.T.trunk || 16, touch: () => { } }; }
    const o = this.world.get(d.x, d.y); if (!o || o.t !== 'chest') return null;
    return { o, x: o.x, y: o.y, vid: 0, max: 40, touch: () => this.world.touch(o) };
  }
  // map marker visible to the whole team (tap on the big map, phrases menu, or middle mouse)
  ping(x, y) { const now = performance.now(); if (now - (this._pingT || 0) < 1500) return; this._pingT = now; this.act('ping', { x: +x.toFixed(1), y: +y.toFixed(1) }); }
  // ---------------------------------------------------------------- action dispatch
  act(type, d) { if (this.auth) this.doAct(this.me.pid, type, d); else this.net.send('act', { t: type, d }); }
  doAct(pid, type, d) {
    const p = this.players.get(pid); if (!p) return;
    const W = this.world;
    switch (type) {
      case 'shoot': { const W2 = TZ.WEAPONS[d.w]; if (!W2 || !Array.isArray(d.a)) return; this.combat.fire({ x: d.x, y: d.y }, W2, d.w, d.a.slice(0, 12), pid, 1, pid); break; }
      case 'melee': { const W2 = TZ.WEAPONS[d.w]; if (!W2) return; this.combat.melee({ x: d.x, y: d.y }, W2, d.a, pid, d.w, d.mx, d.my); break; }
      case 'throw': this.combat.throwItem(d.w, d.x0, d.y0, d.x1, d.y1, pid); break;
      case 'loot': this.doLoot(pid, d.x, d.y); break;
      case 'butcher': { const a = this.animals.find(a => a.id === d.id); if (a && a.dead && !a.looted) { a.looted = true; const items = {}; for (const k in a.T.drops) { const [mn, mx] = a.T.drops[k]; items[k] = mn + ((Math.random() * (mx - mn + 1)) | 0); } this.giveTo(pid, items, a.x, a.y); a.deadT = 1e9; } break; }
      case 'build': this.doBuild(pid, d); break;
      case 'demolish': this.doDemolish(pid, d.x, d.y); break;
      case 'drop': this.dropPickup(d.x, d.y, d.id, d.n, 3); break;
      case 'chestOpen': { const c = this.container(d, p); if (c) this.toPlayer(pid, 'chest', { x: c.x, y: c.y, vid: c.vid, items: c.o.items || {} }); break; }
      case 'chestPut': { const c = this.container(d, p); if (!c) return this.giveTo(pid, { [d.id]: d.n }); const o = c.o; o.items = o.items || {}; const used = Object.keys(o.items).length; if (!o.items[d.id] && used >= c.max) { this.giveTo(pid, { [d.id]: d.n }); this.hintTo(pid, c.vid ? 'Багажник полон' : 'Ящик полон'); return; } o.items[d.id] = (o.items[d.id] || 0) + d.n; c.touch(); this.toPlayer(pid, 'chest', { x: c.x, y: c.y, vid: c.vid, items: o.items }); break; }
      case 'chestTake': { const c = this.container(d, p); if (!c) return; const o = c.o; if (!o.items || !o.items[d.id]) return; const n = Math.min(d.n, o.items[d.id]); o.items[d.id] -= n; if (o.items[d.id] <= 0) delete o.items[d.id]; c.touch(); this.giveTo(pid, { [d.id]: n }); this.toPlayer(pid, 'chest', { x: c.x, y: c.y, vid: c.vid, items: o.items }); break; }
      case 'harvest': { const o = W.get(d.x, d.y); if (!o) return; if (o.t === 'garden' && this.gardenProgress(o) >= 1) { this.giveTo(pid, { veggie: 3 + (Math.random() * 3 | 0) }, o.x + .5, o.y + .5); o.planted = this.absMin(); W.touch(o); } if (o.t === 'collector' && (o.water | 0) > 0) { this.giveTo(pid, { water: o.water | 0 }, o.x + .5, o.y + .5); o.water = 0; W.touch(o); } break; }
      case 'loadTurret': { const o = W.get(d.x, d.y); if (o && (o.t === 'turret' || o.t === 'turret_heavy')) { o.ammo = Math.min(120, (o.ammo | 0) + d.n); W.touch(o); } break; }
      case 'radio': { const o = W.get(d.x, d.y); if (o && o.t === 'radio' && !this.evacDay && !this.endless) { this.evacDay = this.day + 2; this.ev('banner', 'СВЯЗЬ УСТАНОВЛЕНА', `Вертолёт прибудет утром дня ${this.evacDay}. Продержитесь!`); this.ev('snd', 'radio', o.x, o.y); } break; }
      case 'bed': { const o = W.get(d.x, d.y); if (o && TZ.BUILD[o.t] && TZ.BUILD[o.t].kind === 'bed') { this.playerData[p.uid] = Object.assign(this.playerData[p.uid] || {}, { spawn: { x: o.x + .5, y: o.y + 1.5 } }); p.spawn = { x: o.x + .5, y: o.y + 1.5 }; this.toPlayer(pid, 'msg', { t: 'Точка возрождения установлена.', kind: 'good' }); if (this.auth && pid === this.me.pid) this.save(); } break; }
      case 'gateCode': { const o = W.get(d.x, d.y); if (!o || !TZ.isCode(o.t)) return; if (String(d.code) === String(o.code)) { o.allow = o.allow || []; if (!o.allow.includes(p.uid)) o.allow.push(p.uid); W.touch(o); this.dirtyFlow = true; this._encVer = -1; this.toPlayer(pid, 'gateRes', { ok: true }); } else this.toPlayer(pid, 'gateRes', { ok: false, msg: 'Неверный код' }); break; }
      case 'gateSet': { const o = W.get(d.x, d.y); if (!o || !TZ.isCode(o.t) || o.owner !== p.uid) return; o.code = String(d.code).slice(0, 8); if (d.reset) o.allow = []; W.touch(o); this.toPlayer(pid, 'gateRes', { ok: true, msg: 'Код установлен' }); break; }
      case 'recruit': { const a = this.allies.find(a => a.id === d.id); if (!a || a.owner || a.dead) return; if (this.zombies.some(z => !z.dead && dist2(z.x, z.y, a.x, a.y) < 81)) { this.hintTo(pid, 'Рядом зомби. Сначала зачистите территорию!'); return; } a.owner = p.uid; a.mode = 'follow'; this.toPlayer(pid, 'msg', { t: `${a.name} (${TZ.ROLES[a.role].name}) присоединил${a.female ? 'ась' : 'ся'} к команде!`, kind: 'good' }); this.toPlayer(pid, 'stat', { k: 'recruited', n: 1 }); this.ev('snd', 'quest', a.x, a.y); break; }
      case 'order': { for (const a of this.allies) if (a.owner === p.uid && !a.dead && (d.id == null || a.id === d.id)) { a.mode = d.mode; a.gx = a.x; a.gy = a.y; } break; }
      case 'vehEnter': this.vehEnter(p, d.id, d.seat); break;
      case 'vehExit': this.vehExit(p); break;
      case 'drive': { const v = this.vehicles.find(v => v.id === d.id); if (!v || v.seats[0] !== pid) return; const dx = d.x - v.x, dy = d.y - v.y; if (dx * dx + dy * dy < 100) { v.x = d.x; v.y = d.y; } v.a = d.a; v.v = d.v; v.steer = d.s; v.fuel = d.fu; v.hp -= d.dm || 0; v.km = d.km; v.honk = d.h; if (d.h && !v._honk) { this.ev('snd', 'carhorn', v.x, v.y); this.noise(v.x, v.y, 30); } v._honk = d.h; break; }
      case 'vehFix': this.vehFix(pid, d); break;
      case 'vehMod': {
        const v = this.vehicles.find(v => v.id === d.id), Md = TZ.VEHICLE_MODS[d.mod];
        const ok = v && Md && v.vk === 'buggy' && v.state !== 'wreck' && !(v.mods || {})[d.mod] && (!Md.req || v.mods[Md.req]) && this.nearStation('garage', v.x, v.y) && dist(p.x, p.y, v.x, v.y) < 5 && (!v.owner || v.owner === p.uid);
        if (!ok) { this.giveTo(pid, d.paid || {}); this.hintTo(pid, 'Нельзя установить улучшение'); return; }
        v.mods = Object.assign({}, v.mods, { [d.mod]: 1 }); v.owner = v.owner || p.uid; v.applyMods(); if (d.mod === 'armor') v.hp = v.T.hp;
        this.ev('spark', v.x, v.y, 16); this.ev('snd', 'repair', v.x, v.y); this.toPlayer(pid, 'msg', { t: `Установлено: ${Md.name}`, kind: 'good' }); this.toPlayer(pid, 'stat', { k: 'vehMods', n: 1 });
        break;
      }
      case 'craftVeh': { const r = TZ.VEHICLE_RECIPES.find(r => r.out === d.vk); if (!r) return;
        if (TZ.VEHICLES[d.vk].water) { const v = new TZ.Vehicle(this, d.vk, p.x, p.y, 0, 'new'); let ok = false; for (let rr = 1; rr < 11 && !ok; rr++) for (let k = 0; k < 24 && !ok; k++) { const a = k / 24 * 6.28, x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr; if (!v.blocked(W, x, y, a)) { v.x = x; v.y = y; v.a = a; ok = true; } } if (!ok) { this.giveTo(pid, r.cost); this.hintTo(pid, 'Лодку можно собрать только у воды (до 10 клеток)'); return; } v.owner = p.uid; this.vehicles.push(v); this.ev('banner', 'ЛОДКА ГОТОВА', r.name); break; }
        const pos = this.findFree(d.x, d.y, 4, 'veh'); if (!pos) { this.giveTo(pid, r.cost); this.hintTo(pid, 'Нет места для машины'); return; } const v = new TZ.Vehicle(this, d.vk, pos.x, pos.y, 0, 'new'); v.owner = p.uid; this.vehicles.push(v); this.ev('banner', 'МАШИНА СОБРАНА', r.name); break; }
      case 'clan': this.clanAct(pid, d); break;
      case 'chat': { const txt = String(d.text || '').slice(0, 160); if (!txt) return; const color = TZ.Account.rankOf((p.profile && p.profile.rn) || 1000).color; if (d.radio) { for (const q of this.players.values()) this.toPlayer(q.pid, 'radioChat', { name: p.name, text: txt }); break; } const cl = this.clanOf(p.uid); this.ev('chat', p.name, txt, color, cl ? cl.name : 0, cl ? cl.color : 0); break; }
      case 'pvpDeath': { const killer = this.players.get(d.by); if (killer) { this.toPlayer(d.by, 'stat', { k: 'pvpKills', n: 1 }); this.ev('sys', `${killer.name} убил ${p.name}`, 'bad'); if (this.net) this.net.elo(d.by, pid); } break; }
      case 'respawned': break;
      case 'fish': {
        if (dist(p.x, p.y, d.x + .5, d.y + .5) > 3.5) return;
        const r = Math.random(), luck = p.buffs && p.buffs.fast ? 0.05 : 0;
        if (r < 0.62 + luck) { this.giveTo(pid, { fish: 1 + (Math.random() < 0.15 ? 1 : 0) }, d.x + .5, d.y + .5); this.toPlayer(pid, 'stat', { k: 'fish', n: 1 }); this.ev('snd', 'splash', d.x + .5, d.y + .5); }
        else if (r < 0.72) this.giveTo(pid, { junk_boot: 1 }, d.x + .5, d.y + .5);
        else if (r < 0.76) this.giveTo(pid, { [['canned', 'water', 'bandage', 'ammo9', 'parts'][(Math.random() * 5) | 0]]: 1 }, d.x + .5, d.y + .5);
        else this.hintTo(pid, 'Сорвалась! Попробуйте ещё раз.');
        this.ev('chips', d.x + .5, d.y + .5, 6, '#9fd0ff', 3);
        break;
      }
      case 'upgrade': {
        const o = W.get(d.x, d.y), u = o && UPGRADE[o.t];
        if (!u || (o.owner && o.owner !== p.uid) || dist(p.x, p.y, o.x + .5, o.y + .5) > 3.5) { this.giveTo(pid, d.paid || {}); return; }
        const f = o.hp / TZ.BUILD[o.t].hp; o.t = u.to; o.hp = Math.max(1, Math.round(TZ.BUILD[u.to].hp * Math.min(1, f + 0.25))); o.owner = o.owner || p.uid;
        W.touch(o); this.dirtyFlow = true; this.ev('chips', o.x + .5, o.y + .5, 12, TZ.matColor(o.t), 10); this.ev('snd', 'build', o.x + .5, o.y + .5);
        this.toPlayer(pid, 'stat', { k: 'upgrades', n: 1 });
        break;
      }
      case 'repair': {
        const o = W.get(d.x, d.y), B = o && TZ.BUILD[o.t];
        if (!B || (o.owner && o.owner !== p.uid && !TZ.gateAllows({ t: 'gate_code', owner: o.owner, allow: o.allow }, p.uid))) { this.giveTo(pid, d.paid || {}); return; }
        o.hp = Math.min(B.hp, o.hp + B.hp * 0.25); W.touch(o); this.ev('chips', o.x + .5, o.y + .5, 6, TZ.matColor(o.t), 6); this.ev('snd', 'build', o.x + .5, o.y + .5); this.ev('text', o.x + .5, o.y + .5, `${Math.round(o.hp / B.hp * 100)}%`, '#9fe08a');
        this.toPlayer(pid, 'stat', { k: 'repairs', n: 1 });
        break;
      }
      case 'tame': { const a = this.animals.find(a => a.id === d.id); if (!a || a.dead || a.owner || !a.T.dog || dist(p.x, p.y, a.x, a.y) > 3) return; a.owner = p.uid; a.mode = 'follow'; a.hp = a.maxHp; this.ev('text', a.x, a.y, '♥', '#ff8aa0'); this.ev('snd', 'eat', a.x, a.y); this.toPlayer(pid, 'msg', { t: 'Собака теперь ваша! Она защищает вас от зомби. E рядом с ней — «сидеть» / «ко мне».', kind: 'good' }); this.toPlayer(pid, 'stat', { k: 'dogs', n: 1 }); break; }
      case 'dogMode': { const a = this.animals.find(a => a.id === d.id); if (a && a.owner === p.uid) { a.mode = d.mode === 'stay' ? 'stay' : 'follow'; this.toPlayer(pid, 'hint', { t: a.mode === 'stay' ? 'Собака ждёт здесь' : 'Собака идёт за вами' }); } break; }
      case 'ping': { if (!isFinite(d.x) || !isFinite(d.y)) return; const col = TZ.Account.rankOf((p.profile && p.profile.rn) || 1000).color; this.ev('ping', d.x, d.y, p.name, col, p.uid); break; }
      case 'deathBag': { const x = Math.floor(d.x), y = Math.floor(d.y); let pos = null; for (let r = 0; r < 4 && !pos; r++) for (let dy = -r; dy <= r && !pos; dy++) for (let dx = -r; dx <= r; dx++) if (!W.get(x + dx, y + dy) && !W.solidFor(x + dx, y + dy, 'z')) { pos = [x + dx, y + dy]; break; } if (pos) W.set(pos[0], pos[1], { t: 'backpack', items: d.items, owner: p.uid, name: p.name }); break; }
    }
  }
  // ---------------------------------------------------------------- loot
  // shovel: dig up a detector cache next to where the player struck
  digAt(pid, tx, ty) {
    const W = this.world;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy, c = W.cacheIn(Math.floor(x / CH), Math.floor(y / CH));
      if (!c || c.dug || c.x !== x || c.y !== y) continue;
      W.set(x, y, { t: 'hole', v: 0 });
      const items = {}; for (const [id, ch, a, b] of TZ.LOOT.cache) if (Math.random() < ch) items[id] = (items[id] || 0) + a + Math.floor(Math.random() * (b - a + 1));
      if (!Object.keys(items).length) items.parts = 3;
      this.giveTo(pid, items, x + .5, y + .5);
      this.ev('chips', x + .5, y + .5, 10, '#8a6a44', 6); this.ev('snd', 'quest', x + .5, y + .5);
      this.msgTo(pid, 'Тайник выкопан!', 'good'); this.toPlayer(pid, 'stat', { k: 'caches', n: 1 });
      return true;
    }
    this.ev('chips', tx + .5, ty + .5, 5, '#8a6a44', 4);
    return false;
  }
  doLoot(pid, x, y) {
    const W = this.world, o = W.main(W.get(x, y)); if (!o) return;
    const M = TZ.OBJ[o.t] || {};
    if (o.looted) { if (M.regrow && this.absMin() - (o.lootT || 0) > 1440) o.looted = false; else { this.hintTo(pid, 'Пусто'); return; } }
    const items = {};
    if (o.fixed) Object.assign(items, o.fixed);
    else if (o.items) Object.assign(items, o.items);
    else {
      const table = TZ.LOOT[o.loot || M.loot] || TZ.LOOT.crate;
      for (const [id, ch, a, b] of table) if (Math.random() < ch) items[id] = (items[id] || 0) + a + Math.floor(Math.random() * (b - a + 1));
    }
    if (o.quest === 'radiopart') { items.radiopart = 1; this.quest.radioparts++; this.ev('sys', `Найдена деталь рации! (${Math.min(3, this.quest.radioparts)}/3)`, 'good'); this.ev('snd', 'quest', o.x, o.y); }
    o.looted = true; o.lootT = this.absMin(); delete o.fixed; delete o.quest;
    if (o.t === 'backpack' || o.t === 'drop') { W.clearObj(o.x, o.y); if (o.t === 'drop') this.dropAt = null; }
    else W.touch(o);
    if (!Object.keys(items).length) { this.toPlayer(pid, 'hint', { t: 'Пусто' }); return; }
    this.giveTo(pid, items, o.x + .5, o.y + .5);
    this.toPlayer(pid, 'stat', { k: 'looted', n: 1 });
  }
  // ---------------------------------------------------------------- world streaming
  onChunkLoaded(c, remod) {
    if (remod) for (const o of [...this.structures]) if (Math.floor(o.x / CH) === c.cx && Math.floor(o.y / CH) === c.cy) this.structures.delete(o);
    for (const o of c.obj) if (o && TZ.BUILD[o.t]) this.structures.add(o);
    if (this.role === 'client' && !remod && this.net) this.net.send('reqChunk', { cx: c.cx, cy: c.cy });
    this.zgrid = this.zgrid; // noop
  }
  streamChunks(force) {
    const W = this.world, want = new Set();
    for (const p of this.players.values()) {
      const pcx = Math.floor(p.x / CH), pcy = Math.floor(p.y / CH);
      for (let dy = -VIEW_CHUNKS; dy <= VIEW_CHUNKS; dy++) for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++) want.add((pcx + dx) + ',' + (pcy + dy));
    }
    // generate missing chunks: nearest first, limited per frame
    const me = this.me, mcx = Math.floor(me.x / CH), mcy = Math.floor(me.y / CH);
    const missing = [];
    for (const k of want) if (!W.chunks.has(k)) { const [cx, cy] = k.split(',').map(Number); missing.push([cx, cy, Math.abs(cx - mcx) + Math.abs(cy - mcy)]); }
    missing.sort((a, b) => a[2] - b[2]);
    const budget = force ? 999 : 2;
    for (let i = 0; i < Math.min(budget, missing.length); i++) { const [cx, cy, d] = missing[i]; W.generate(cx, cy); if (!force && d > 1 && i >= 0) break; }
    // unload far chunks
    if (W.chunks.size > (VIEW_CHUNKS * 2 + 3) ** 2 * Math.max(1, this.players.size)) {
      for (const [k, c] of W.chunks) { let near = false; for (const p of this.players.values()) if (Math.abs(c.cx - Math.floor(p.x / CH)) <= UNLOAD_CHUNKS && Math.abs(c.cy - Math.floor(p.y / CH)) <= UNLOAD_CHUNKS) { near = true; break; } if (!near) { if (this.ui && this.ui.bigmap && W.explored.has(k)) this.ui.bigmap.thumb(this, k); W.unload(c.cx, c.cy); } }
    }
    // spawn markers
    if (W.pending.length) {
      const list = W.pending; W.pending = [];
      if (this.auth) for (const sp of list) this.spawnMarker(sp);
    }
  }
  spawnMarker(sp) {
    const W = this.world; if (W.spawned.has(sp.id)) return; W.spawned.add(sp.id);
    if (sp.kind === 'zombies') {
      for (let i = 0; i < sp.n; i++) {
        const f = this.findFree(sp.x + (Math.random() - .5) * 6, sp.y + (Math.random() - .5) * 6, 4); if (!f) continue;
        const r = Math.random(), b = W.biomeAt(f.x, f.y);
        let type = r < 0.08 ? 'crawler' : r < 0.15 ? 'runner' : 'walker';
        if (sp.mix === 'military') type = r < 0.55 ? 'soldier' : r < 0.65 ? 'brute' : type;
        if (sp.mix === 'police' && r < 0.3) type = 'soldier';
        if (sp.mix === 'snow' || b === 2) type = r < 0.35 ? 'frozen' : type;
        if (sp.mix === 'swamp' || b === 3) type = r < 0.3 ? 'spitter' : type;
        if (sp.mix === 'lab') type = r < 0.3 ? 'screamer' : r < 0.5 ? 'exploder' : r < 0.7 ? 'soldier' : type;
        if (b === 4 && r > 0.85) type = 'exploder';
        if ((sp.mix === 'desert' || b === 5) && r > 0.55) type = 'husk';
        if (this.day >= 3 && r > 0.95) type = 'screamer';
        this.spawnZombie(type, f.x, f.y);
      }
    } else if (sp.kind === 'survivor') {
      const def = TZ.Chars.survivorDef(sp.id);
      const f = W.solidFor(sp.x, sp.y, 'p') ? this.findFree(sp.x + .5, sp.y + .5, 2) : { x: sp.x + .5, y: sp.y + .5 };
      if (f) this.allies.push(new TZ.Ally(this, def, f.x, f.y, sp.id));
    } else if (sp.kind === 'vehicle') {
      // desert: any abandoned car has a 20% chance to be a buggy instead
      let vk = sp.vk; const VT = TZ.VEHICLES[vk] || {}; if (vk !== 'snowmobile' && !VT.air && !VT.water && W.biomeAt(sp.x, sp.y) === 5 && TZ.hash(sp.x, sp.y, W.seed + 77) < 0.2) vk = 'buggy';
      const v = new TZ.Vehicle(this, vk, sp.x + .5, sp.y + .5, sp.a, sp.st);
      if (VT.water) { // boats look for open water around the spot
        let ok = false;
        for (let r = 0; r < 22 && !ok; r += 1) for (let k = 0; k < 24 && !ok; k++) { const a = k / 24 * 6.28, x = sp.x + .5 + Math.cos(a) * r, y = sp.y + .5 + Math.sin(a) * r; if (!W.chunkIf(Math.floor(x / CH), Math.floor(y / CH))) continue; if (!v.blocked(W, x, y, v.a)) { v.x = x; v.y = y; ok = true; } }
        if (ok) this.vehicles.push(v);
        return;
      }
      if (!v.blocked(W, v.x, v.y, v.a)) this.vehicles.push(v);
      else { v.a = sp.a + Math.PI / 2; if (!v.blocked(W, v.x, v.y, v.a)) this.vehicles.push(v); }
    } else if (sp.kind === 'animals') {
      for (let i = 0; i < sp.n; i++) { const f = this.findFree(sp.x + (Math.random() - .5) * 6, sp.y + (Math.random() - .5) * 6, 3); if (f) this.animals.push(new TZ.Animal(this, sp.ak, f.x, f.y)); }
    }
  }
  findFree(x, y, rad = 3, kind) {
    const W = this.world;
    for (let t = 0; t < 40; t++) {
      const k = t / 40 + 0.15, px = x + (Math.random() - 0.5) * 2 * rad * k, py = y + (Math.random() - 0.5) * 2 * rad * k;
      if (!W.chunkIf(Math.floor(px / CH), Math.floor(py / CH))) continue;
      if (kind === 'veh') { const v = { T: TZ.VEHICLES.sedan, points: TZ.Vehicle.prototype.points, blocked: TZ.Vehicle.prototype.blocked }; if (!v.blocked(W, px, py, 0)) return { x: px, y: py }; continue; }
      if (!W.solidFor(px, py, 'z')) return { x: Math.floor(px) + 0.5, y: Math.floor(py) + 0.5 };
    }
    return null;
  }
  spawnZombie(type, x, y, horde = false) { const z = new TZ.Zombie(this, type, x, y, horde); this.zombies.push(z); return z; }
  // ---------------------------------------------------------------- queries
  nearFire(x, y) { for (const o of this.structures) if (o.t === 'campfire' && dist2(x, y, o.x + .5, o.y + .5) < 12) return true; const o = this.nearWildFire(x, y); return !!o; }
  nearWildFire(x, y) { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const o = this.world.get(x + dx, y + dy); if (o && o.t === 'campfire') return o; } return null; }
  nearStation(st, x = this.me.x, y = this.me.y) { if (!st) return true; if (st === 'fire') return !!this.nearWildFire(x, y) || [...this.structures].some(o => o.t === 'campfire' && dist2(x, y, o.x + .5, o.y + .5) < 12); const t = st === 'bench' ? 'workbench' : st === 'garage' ? 'garage' : st; for (const o of this.structures) if (o.t === t && dist2(x, y, o.x + .5, o.y + .5) < 16) return true; return false; }
  noise(x, y, r, small, lure) { for (const z of this.zgrid.query(x, y, r, this._tmpC)) if (!z.dead && dist2(x, y, z.x, z.y) < r * r) { z.hunt = Math.max(z.hunt, small ? 3 : 10); if (lure) { z.wx = x; z.wy = y; z.lure = { x, y, t: 3 }; } } }
  audioVol(x, y) { const d = dist(x, y, this.me.x, this.me.y); return clamp(1 - d / 28, 0, 1); }
  nearestTarget(x, y) {
    let best = null, bd = 1e9;
    for (const p of this.players.values()) { if (p.dead) continue; const pv = p.vehicle ? this.vehicles.find(v => v.id === p.vehicle) : null; if (pv && pv.alt > 0.2) continue; const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = pv || p; } }
    for (const a of this.allies) { if (a.dead || a.inCar) continue; const d = dist2(x, y, a.x, a.y); if (d < bd && (a.recruited || d < 30)) { bd = d; best = a; } }
    for (const a of this.animals) { if (!a.owner || a.dead) continue; const d = dist2(x, y, a.x, a.y); if (d < bd && d < 25) { bd = d; best = a; } }
    if (best && best.kind === 'vehicle') { const veh = best; best = { x: veh.x, y: veh.y, r: 1, kind: 'vehicleT', v: veh, damage: (G, n) => { veh.hp -= n * 0.3 * (veh.mods && veh.mods.armor ? 0.45 : 1); } }; }
    return best;
  }
  nearestPlayer(x, y) { let best = null, bd = 1e9; for (const p of this.players.values()) { if (p.dead || p.vehicle) continue; const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } } return best; }
  absMin() { return this.minutes + (this.day - 1) * 1440; }
  gardenProgress(o) { if (o.planted == null) o.planted = this.absMin(); return clamp((this.absMin() - o.planted) / 1800, 0, 1); }
  gateOpen(o) {
    const cx = o.x + .5, cy = o.y + .5;
    for (const p of this.players.values()) if (!p.dead && dist2(p.x, p.y, cx, cy) < 1.9 && (!TZ.isCode(o.t) || TZ.gateAllows(o, p.uid))) return true;
    for (const a of this.allies) if (!a.dead && dist2(a.x, a.y, cx, cy) < 1.9 && (!TZ.isCode(o.t) || TZ.gateAllows(o, a.owner))) return true;
    for (const v of this.vehicles) if (v.driver && dist2(v.x, v.y, cx, cy) < 6) { const p = this.players.get(v.driver); if (p && (!TZ.isCode(o.t) || TZ.gateAllows(o, p.uid))) return true; }
    return false;
  }
  baseCenter(uid) {
    let sx = 0, sy = 0, n = 0;
    for (const o of this.structures) if ((o.t === 'campfire' || o.t === 'bed' || o.t === 'chest' || o.t === 'workbench') && (!uid || o.owner === uid)) { sx += o.x; sy += o.y; n++; }
    return n ? { x: sx / n + .5, y: sy / n + .5 } : null;
  }
  // flow field per player (and window for allies)
  flowFor(tgt, x, y) {
    let owner = tgt.kind === 'player' ? tgt : tgt.kind === 'ally' && tgt.owner ? this.playerByUid(tgt.owner) : tgt.kind === 'vehicleT' ? this.players.get(tgt.v.driver) : null;
    if (!owner) return null;
    const f = this.flows.get(owner.pid);
    if (!f) return null;
    const i = Math.floor(x) - f.x0, j = Math.floor(y) - f.y0;
    return (i >= 0 && j >= 0 && i < f.n && j < f.n) ? f : null;
  }
  allyFlow(owner) { return this.flows.get('A' + owner.pid) || null; }
  updateFlows(dt) {
    this.flowT -= dt;
    if (this.flowT > 0 && !this.dirtyFlow) return;
    this.flowT = 0.45; this.dirtyFlow = false;
    const W = this.world;
    for (const p of this.players.values()) {
      if (p.dead) { this.flows.delete(p.pid); continue; }
      const srcs = [p, ...this.allies.filter(a => a.owner === p.uid && !a.dead && !a.inCar && dist2(a.x, a.y, p.x, p.y) < 900)];
      if (p.vehicle) { const v = this.vehicles.find(v => v.id === p.vehicle); if (v) srcs[0] = v; }
      this.flows.set(p.pid, W.flowWindow(p.x, p.y, 36, srcs, 'z'));
      if (this.allies.some(a => a.owner === p.uid && !a.dead)) this.flows.set('A' + p.pid, W.flowWindow(p.x, p.y, 20, [p], 'p'));
    }
  }
  // ---------------------------------------------------------------- deaths
  killZombie(z, kind, by) {
    z.dead = true; z.deadT = 0; this.stats.kills++;
    this.ev('zdie', z.id, z.type, z.x, z.y);
    if (by) this.toPlayer(by, 'kill', { type: z.type, kind });
    if (z.T.explode && kind !== 'boomchain') this.explode(z.x, z.y, z.T.explode.r, z.T.explode.dmg, by, 'boomchain');
    const r = Math.random(), drop = (id, n) => this.dropPickup(z.x + (Math.random() - .5) * .4, z.y + (Math.random() - .5) * .4, id, n);
    if (z.type === 'boss') { drop('medkit', 2); drop('ammo762', 30); drop('parts', 8); drop('ammo12', 12); drop('electro', 4); this.ev('banner', 'БЕГЕМОТ ПОВЕРЖЕН', 'Отличная работа, выжившие'); }
    else if (z.type === 'brute') { drop(Math.random() < .5 ? 'parts' : 'metal', 2 + (Math.random() * 3 | 0)); if (Math.random() < .35) drop('bandage', 1); }
    else if (z.type === 'soldier') { if (r < 0.4) drop('ammo762', 4 + (Math.random() * 8 | 0)); else if (r < 0.55) drop('mre', 1); else if (r < 0.6) drop('grenade', 1); }
    else if (r < 0.04) drop('ammo9', 3 + (Math.random() * 5 | 0));
    else if (r < 0.06) drop('cloth', 1);
    else if (r < 0.075) drop(Math.random() < .5 ? 'ammo12' : 'ammo762', 3 + (Math.random() * 4 | 0));
    else if (r < 0.085) drop('bandage', 1);
  }
  onAnimalDeath(a, by) { this.ev('blood', a.x, a.y, 10, null); if (a.owner) { this.msgTo(a.owner, 'Ваша собака погибла...', 'bad'); a.owner = 0; } else if (by) this.toPlayer(by, 'akill', { ak: a.ak }); }
  onAllyDeath(a) { this.ev('sys', `${a.name} погиб${a.female ? 'ла' : ''}...`, 'bad'); this.ev('blood', a.x, a.y, 14, null); }
  onPlayerDeath(p) {
    if (p !== this.me) return;
    this.mode = 'dead';
    TZ.audio.play('death'); TZ.audio.setMusic('death');
    TZ.Account.rn(-Math.round(20 * (this.diff.rn > 1 ? 1.4 : 1)), 'смерть'); this.acc('deaths', 1);
    // drop everything into a backpack at the death spot
    const items = Object.assign({}, p.inv);
    if (Object.keys(items).length) this.act('deathBag', { x: p.x, y: p.y, items });
    if (this.vehicles && p.vehicle) this.act('vehExit', {});
    setTimeout(() => this.ui.showDeath(), 1500);
  }
  respawn() {
    const P = this.me, sp = P.spawn || this.spawnPoint;
    const keepLook = P.look;
    const fresh = new TZ.Player(P.pid, P.uid, P.name);
    Object.assign(P, { hp: 100, stamina: 100, hunger: 70, thirst: 70, warmth: 90, infection: 0, sick: 0, bleeding: false, buffs: {}, inv: { knife: 1, water: 1, canned: 1, bandage: 1 }, mags: {}, hotbar: ['knife', 'bandage', null, null, null, null, null, null], sel: 0, eq: { head: null, body: null, back: null }, dead: false, deadT: 0, vehicle: 0 });
    P.look = keepLook; P.x = sp.x; P.y = sp.y; this.mode = 'play';
    TZ.audio.setMusic(this.isNight() ? 'night' : 'day');
    this.msg('Вы очнулись. Ваши вещи остались в рюкзаке на месте гибели.', 'warn');
    this.act('respawned', {});
  }
  // ---------------------------------------------------------------- explosions
  explode(x, y, r, dmg, owner, kind) {
    this.ev('boom', +x.toFixed(2), +y.toFixed(2), r);
    this.noise(x, y, 24);
    let kills = 0;
    for (const z of this.zgrid.query(x, y, r + 1, this._tmpC.slice())) { if (z.dead) continue; const d = dist(x, y, z.x, z.y); if (d > r) continue; const k = 1 - d / r * 0.6; const a = Math.atan2(z.y - y, z.x - x); z.kx += Math.cos(a) * 10 * k; z.ky += Math.sin(a) * 10 * k; z.burn = Math.max(z.burn, 1.5); z.burnBy = owner; const was = z.dead; z.damage(this, dmg * k, owner, kind === 'boomchain' ? 'boomchain' : 'boom'); if (!was && z.dead) kills++; }
    for (const a of this.animals) if (!a.dead && dist(x, y, a.x, a.y) < r) a.damage(this, dmg * 0.8, owner);
    for (const p of this.players.values()) { const d = dist(x, y, p.x, p.y); if (d < r && !p.vehicle) this.hurtPlayer(p, dmg * 0.55 * (1 - d / r * 0.6), { by: owner && owner !== p.pid ? owner : null, push: Math.atan2(p.y - y, p.x - x) }); }
    for (const a of this.allies) if (!a.dead && dist(x, y, a.x, a.y) < r) a.damage(this, dmg * 0.4);
    for (const v of this.vehicles) if (v.state !== 'wreck' && dist(x, y, v.x, v.y) < r + 1) v.hp -= dmg * 0.25;
    for (const o of [...this.structures]) { const d = dist(x, y, o.x + .5, o.y + .5); if (d < r && !o.wild) { o.hp -= dmg * 1.2 * (1 - d / r * 0.5); if (o.hp <= 0) this.destroyStructure(o); else this.world.touch(o); } }
    if (owner && kills) this.toPlayer(owner, 'boomKills', { n: kills });
    this.dirtyFlow = true;
  }
  // ---------------------------------------------------------------- vehicles
  vehEnter(p, id, seat) {
    const v = this.vehicles.find(v => v.id === id); if (!v || v.state === 'wreck' || p.vehicle) return;
    if (dist(p.x, p.y, v.x, v.y) > 3.5) return;
    let s = seat === 'd' ? 0 : v.seats.indexOf(null, 1);
    if (seat === 'd' && v.seats[0]) { if (typeof v.seats[0] === 'string' && v.seats[0][0] === 'a') { s = 0; } else { this.hintTo(p.pid, 'За рулём уже кто-то есть'); return; } }
    if (s < 0) { this.hintTo(p.pid, 'Нет свободных мест'); return; }
    if (s === 0 && v.seats[0]) { const k = v.seats.indexOf(null, 1); if (k > 0) v.seats[k] = v.seats[0]; }
    v.seats[s] = p.pid; p.vehicle = v.id;
    this.toPlayer(p.pid, 'vehIn', { id: v.id, seat: s });
  }
  vehExit(p) {
    const v = this.vehicles.find(v => v.id === p.vehicle);
    if (v && v.alt > 0.08 && v.state !== 'wreck') { this.hintTo(p.pid, 'Сначала приземлитесь'); return; }
    if (v && v.boat && v.state !== 'wreck') { // step out onto the nearest shore
      let best = null;
      for (let r = 1; r <= 3.5 && !best; r += 0.5) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, x = v.x + Math.cos(a) * r, y = v.y + Math.sin(a) * r, g = this.world.groundIf(x, y); if (g !== TZ.TILE.WATER && !this.world.solidFor(x, y, 'p', p.uid)) { best = { x, y }; break; } }
      if (!best) { this.hintTo(p.pid, 'Вокруг вода — подплывите к берегу'); return; }
      const s = v.seats.indexOf(p.pid); if (s >= 0) v.seats[s] = null; v.v = 0;
      p.vehicle = 0; this.toPlayer(p.pid, 'vehOut', best); return;
    }
    if (v) { const s = v.seats.indexOf(p.pid); if (s >= 0) v.seats[s] = null; if (s === 0) { v.throttle = 0; } }
    let pos = { x: p.x, y: p.y };
    if (v) { const side = v.a + Math.PI / 2; for (const k of [1, -1, 1.6, -1.6]) { const x = v.x + Math.cos(side) * k * 1.1, y = v.y + Math.sin(side) * k * 1.1; if (!this.world.solidFor(x, y, 'p', p.uid)) { pos = { x, y }; break; } } }
    p.vehicle = 0;
    this.toPlayer(p.pid, 'vehOut', pos);
  }
  vehFix(pid, d) {
    const v = this.vehicles.find(v => v.id === d.id), p = this.players.get(pid); if (!v || !p) return;
    if (dist(p.x, p.y, v.x, v.y) > 4) return;
    if (d.what === 'repair' && v.state !== 'wreck') { v.hp = Math.min(v.T.hp, v.hp + v.T.hp * (d.garage ? 0.5 : 0.35)); this.ev('spark', v.x, v.y, 8); this.ev('snd', 'repair', v.x, v.y); this.toPlayer(pid, 'stat', { k: 'repairs', n: 1 }); }
    if (d.what === 'fuel' && v.state !== 'wreck') { v.fuel = Math.min(v.T.fuel, v.fuel + 25); this.ev('snd', 'fuel', v.x, v.y); }
    if (d.what === 'wheel' && v.flat > 0) { v.flat--; this.ev('snd', 'repair', v.x, v.y); }
    if (d.what === 'battery' && !v.battery) { v.battery = true; this.ev('snd', 'repair', v.x, v.y); }
    if (d.what === 'dismantle') { if (v.trunk) for (const k in v.trunk) this.dropPickup(v.x, v.y, k, v.trunk[k], 60); this.vehicles.splice(this.vehicles.indexOf(v), 1); for (const s of v.seats) if (s && s[0] !== 'a') { const pp = this.players.get(s); if (pp) this.vehExit(pp); } const items = v.state === 'wreck' ? { metal: 8 + (Math.random() * 6 | 0), parts: 1 + (Math.random() * 3 | 0) } : { metal: 12 + (Math.random() * 6 | 0), parts: 4 + (Math.random() * 4 | 0), electro: 1 + (Math.random() * 2 | 0), wheel: 4 - v.flat > 0 && Math.random() < 0.5 ? 1 : 0, battery: v.battery && Math.random() < 0.5 ? 1 : 0 }; this.giveTo(pid, items, v.x, v.y); this.ev('boom_small', v.x, v.y); this.ev('snd', 'hit_metal', v.x, v.y); this.ev('spark', v.x, v.y, 14); }
  }
  dismantleHit(v, pid, power) { v.wreckHp = (v.wreckHp ?? 8) - power; this.ev('spark', v.x, v.y, 5); this.ev('snd', 'hit_metal', v.x, v.y); this.giveTo(pid, { metal: 1 }, v.x, v.y); if (v.wreckHp <= 0) this.vehFix(pid, { id: v.id, what: 'dismantle' }); }
  updateVehicles(dt) {
    const me = this.me, I = TZ.input;
    for (const v of this.vehicles) {
      if (v.T.air && !v.seats[0] && this.auth) { v.spool = Math.max(0, v.spool - dt * 0.3); v.rotor += dt * 30 * v.spool; if (v.alt > 0) { v.alt = Math.max(0, v.alt - dt * 0.4); v.v *= 1 - dt * 0.5; v.x += Math.cos(v.a) * v.v * dt; v.y += Math.sin(v.a) * v.v * dt; if (v.alt === 0) v.hp -= 60; } }
      const driverPid = v.seats[0];
      const localDriver = driverPid === me.pid;
      if (localDriver) {
        const inp = { t: 0, s: 0, brake: false, horn: false, uid: me.uid };
        if (this.canControl && !this.typing && !this.uiBlocking) { if (I.on('up')) inp.t += 1; if (I.on('down')) inp.t -= 1; if (I.on('left')) inp.s -= 1; if (I.on('right')) inp.s += 1; inp.brake = I.on('brake'); inp.horn = I.on('horn'); inp.up = I.on('sprint'); }
        const wasStart = v.canStart();
        if (inp.t && !wasStart && !v._warned) { v._warned = true; this.hint('Машина не заводится: ' + v.problems().join(', ')); TZ.audio.play('starter_fail'); }
        if (!inp.t) v._warned = false;
        const ox = v.x, oy = v.y; v.drive(dt, this, inp);
        { const dd = Math.hypot(v.x - ox, v.y - oy) * 1.7 / 1000; if (dd > 0 && dd < 0.05) { if (v.T.air && v.alt > 0.2) this.acc('airKm', dd); else if (v.boat) this.acc('boatKm', dd); } }
        if (this.auth) { v.hp -= v.dmgAcc; v.dmgAcc = 0; }
        me.x = v.x; me.y = v.y; me.ang = v.a;
        this.acc('km', 0); TZ.audio.engine(v.canStart() ? Math.abs(v.v) / v.T.speed : -1, v.vk);
      } else if (!this.auth) v.ghostUpdate(dt);
      if (me.vehicle === v.id && !localDriver) { me.x = v.x; me.y = v.y; TZ.audio.engine(v.driver && v.canStart() ? Math.abs(v.v) / v.T.speed : -1, v.vk); }
      // passengers' positions on authority
      if (this.auth) for (const s of v.seats) if (s && s[0] !== 'a') { const p = this.players.get(s); if (p && p !== me) { p.x = v.x; p.y = v.y; } }
      // effects
      const hpR = v.hp / v.T.hp;
      if (v.state !== 'wreck') {
        if (hpR < 0.5 && Math.random() < dt * (hpR < 0.25 ? 10 : 4)) this.fx.smoke(v.x + Math.cos(v.a) * v.T.len * 0.35, v.y + Math.sin(v.a) * v.T.len * 0.35, 1, 14, hpR < 0.25 ? 'rgba(30,28,26,' : 'rgba(180,180,180,');
        if (hpR < 0.15 && Math.random() < dt * 8) this.fx.fire(v.x + Math.cos(v.a) * v.T.len * 0.35, v.y + Math.sin(v.a) * v.T.len * 0.35, 1, 8);
        if (Math.abs(v.v) > 1 && v.canStart() && Math.random() < dt * 6) this.fx.smoke(v.x - Math.cos(v.a) * v.T.len * 0.5, v.y - Math.sin(v.a) * v.T.len * 0.5, 1, 3, 'rgba(120,120,120,');
      } else if (v.burnT > 0) { v.burnT -= dt; if (Math.random() < dt * 20) this.fx.fire(v.x + (Math.random() - .5) * 1.5, v.y + (Math.random() - .5) * 1.5, 1, 6); if (Math.random() < dt * 5) this.fx.smoke(v.x, v.y, 1, 16, 'rgba(30,28,26,'); }
      if (!this.auth) continue;
      // authority: run over zombies / animals, explosions
      if (Math.abs(v.v) > 1.5 && v.state !== 'wreck' && !(v.alt > 0.1) && !v.boat) {
        const pad = 0.25;
        for (const z of this.zgrid.query(v.x, v.y, v.T.len, this._tmpC)) {
          if (z.dead || !v.contains(z.x, z.y, z.r + pad)) continue;
          const sp = Math.abs(v.v), a = v.a + (v.v < 0 ? Math.PI : 0);
          z.kx += Math.cos(a) * sp * 1.6 / z.T.scale; z.ky += Math.sin(a) * sp * 1.6 / z.T.scale;
          const ram = v.mods && v.mods.ram, dmg = sp * 9 * v.T.mass * (ram ? 1.7 : 1);
          this.ev('blood', z.x, z.y, 8, a);
          z.damage(this, dmg, v.driver, 'car');
          v.hp -= (z.T.scale > 1.3 ? 4 : 0.6) * (sp / 6) * (ram ? 0.3 : 1); v.v *= z.T.scale > 1.3 ? (ram ? 0.75 : 0.5) : (ram ? 0.97 : 0.93);
          this.ev('snd', 'car_hit', z.x, z.y);
          if (v.driver === me.pid) this.camera.shake(2);
          else if (v.driver) this.toPlayer(v.driver, 'drive_slow', { f: z.T.scale > 1.3 ? 0.5 : 0.93 });
        }
        for (const a of this.animals) if (!a.dead && !a.owner && v.contains(a.x, a.y, a.r + pad)) { a.damage(this, Math.abs(v.v) * 8, v.driver); v.v *= 0.8; }
      }
      // spiked sides shred zombies that grab the car
      if (v.mods && v.mods.spikes && v.state !== 'wreck') for (const z of this.zgrid.query(v.x, v.y, v.T.len, this._tmpC)) if (!z.dead && v.contains(z.x, z.y, z.r + 0.55)) { z.damage(this, 26 * dt, v.driver, 'car'); z.slow = 0.4; if (Math.random() < dt * 6) this.ev('blood', z.x, z.y, 2, null); }
      if (v.state !== 'wreck' && v.hp <= 0) {
        v.state = 'wreck'; v.hp = 0; v.v = 0; v.burnT = 20;
        this.explode(v.x, v.y, 3.2, 90, v.driver, 'car');
        for (const s of v.seats) if (s) { if (s[0] === 'a') { const al = this.allies.find(a => 'a' + a.id === s); if (al) { al.inCar = 0; al.damage(this, 40); } } else { const p = this.players.get(s); if (p) { this.vehExit(p); this.hurtPlayer(p, 35, {}); } } }
        v.seats.fill(null);
        this.ev('sys', `${v.T.name} взорвалась!`, 'bad');
      }
    }
  }
  // ---------------------------------------------------------------- building
  canPlace(id, x, y, uid, pid) {
    const W = this.world, B = TZ.BUILD[id];
    const p = pid ? this.players.get(pid) : this.me;
    if (B.kind === 'roof') {
      if (!W.chunkIf(Math.floor(x / CH), Math.floor(y / CH))) return 'Нельзя строить здесь';
      if (W.roofAt(x, y)) return 'Здесь уже есть крыша';
      if (p && dist(p.x, p.y, x + .5, y + .5) > 8.5) return 'Слишком далеко';
      const wall = (a, b) => { const o = W.get(a, b); return o && (o.t === 'hwall' || (TZ.BUILD[o.t] && TZ.BUILD[o.t].kind === 'wall')); };
      let ok = false; for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) if (wall(x + dx, y + dy)) ok = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (W.roofAt(x + dx, y + dy)) ok = true;
      if (!ok) return 'Крыше нужна опора: стена рядом или соседняя крыша';
      const enc = this.enclosureAt(x, y); if (enc && !TZ.gateAllows(enc, uid || this.me.uid)) return 'Это чужая база';
      return null;
    }
    if (!W.chunkIf(Math.floor(x / CH), Math.floor(y / CH))) return 'Нельзя строить здесь';
    const g = W.groundIf(x, y);
    if (g === TZ.TILE.WATER) return 'Нельзя строить на воде';
    const cur = W.get(x, y);
    if (cur && !(B.kind === 'floor' && false)) return 'Место занято';
    if (p && dist(p.x, p.y, x + .5, y + .5) > 7.5) return 'Слишком далеко';
    if (B.solid) {
      for (const e of [...this.players.values(), ...this.allies.filter(a => !a.dead && !a.inCar)]) if (!e.vehicle && Math.abs(e.x - (x + .5)) < 0.5 + e.r && Math.abs(e.y - (y + .5)) < 0.5 + e.r) return 'Мешает персонаж';
      for (const z of this.zgrid.query(x + .5, y + .5, 1.5, this._tmpC)) if (!z.dead && Math.abs(z.x - (x + .5)) < 0.5 + z.r && Math.abs(z.y - (y + .5)) < 0.5 + z.r) return 'Мешает зомби';
      for (const v of this.vehicles) if (v.contains(x + .5, y + .5, 0.5)) return 'Мешает машина';
    }
    if (B.needs === 'workbench' && ![...this.structures].some(o => o.t === 'workbench' && dist2(o.x, o.y, x, y) < 100)) return 'Нужен верстак рядом';
    if (id === 'radio' && [...this.structures].some(o => o.t === 'radio')) return 'Рация уже построена';
    // can't build inside someone else's private base
    const enc = this.enclosureAt(x, y);
    if (enc && !TZ.gateAllows(enc, uid || this.me.uid)) return 'Это чужая база';
    return null;
  }
  tryBuild(x, y) {
    const id = this.buildSel, B = TZ.BUILD[id];
    const err = this.canPlace(id, x, y);
    if (err) return err;
    if (!this.canAfford(B.cost)) return 'Не хватает ресурсов';
    const rest = this.payLocal(B.cost);
    this.act('build', { id, x, y, rest, paid: diffCost(B.cost, rest) });
    if (this.role !== 'client') { /* immediate */ }
    return null;
  }
  doBuild(pid, d) {
    const p = this.players.get(pid), B = TZ.BUILD[d.id]; if (!B || !p) return;
    const refund = d.paid || {};
    const err = this.canPlace(d.id, d.x, d.y, p.uid, pid);
    // take remainder from owner's chests near the build site
    let chestOk = true;
    const rest = d.rest || {};
    if (!err && Object.keys(rest).length) {
      const chests = [...this.structures].filter(o => o.t === 'chest' && (!o.owner || o.owner === p.uid) && dist2(d.x, d.y, o.x, o.y) < 256);
      for (const k in rest) { let have = 0; for (const c of chests) have += (c.items && c.items[k]) || 0; if (have < rest[k]) chestOk = false; }
      if (chestOk) for (const k in rest) { let need = rest[k]; for (const c of chests) { if (!need) break; const t = Math.min(need, (c.items && c.items[k]) || 0); if (t) { c.items[k] -= t; if (!c.items[k]) delete c.items[k]; need -= t; this.world.touch(c); } } }
    }
    if (err || !chestOk) { this.toPlayer(pid, 'built', { ok: false, refund, msg: err || 'Не хватает ресурсов в ящиках' }); return; }
    if (B.kind === 'roof') { this.world.setRoof(d.x, d.y, B.roof, p.uid); this.ev('roof', d.x, d.y, B.roof, p.uid); this.ev('snd', 'build', d.x + .5, d.y + .5); this.stats.built++; this.toPlayer(pid, 'built', { ok: true, id: d.id, x: d.x, y: d.y }); return; }
    const o = { t: d.id, hp: B.hp, v: (d.x * 7 + d.y * 3) % 4, owner: p.uid };
    if (d.id === 'turret' || d.id === 'turret_heavy') { o.ammo = 20; o.ang = 0; }
    if (d.id === 'garden') o.planted = this.absMin();
    if (d.id === 'collector') { o.water = 0; o.lastT = this.absMin(); }
    if (d.id === 'chest') o.items = {};
    if (TZ.isCode(d.id)) { o.code = '0000'; o.allow = []; }
    this.world.set(d.x, d.y, o);
    this.structures.add(o);
    this.stats.built++;
    this.dirtyFlow = true; this._encVer = -1;
    this.ev('chips', d.x + .5, d.y + .5, 8, '#b08050', 6); this.ev('snd', 'build', d.x + .5, d.y + .5);
    if (d.id === 'radio') this.quest.done.radio = true;
    this.toPlayer(pid, 'built', { ok: true, id: d.id, x: d.x, y: d.y, ask: TZ.isCode(d.id) });
  }
  doDemolish(pid, x, y) {
    const p = this.players.get(pid), W = this.world;
    const ro = W.roofOwner(x, y);
    if (W.roofAt(x, y) && ro) { // player-built roofs come off first
      if (ro !== p.uid) { this.hintTo(pid, 'Это не ваша крыша'); return; }
      const code = W.roofAt(x, y), id = code === 6 ? 'roof_concrete' : 'roof_wood', items = {}; for (const k in TZ.BUILD[id].cost) { const n = Math.floor(TZ.BUILD[id].cost[k] * 0.5); if (n) items[k] = n; }
      W.setRoof(x, y, 0, null); this.ev('roof', x, y, 0, 0); this.giveTo(pid, items, x + .5, y + .5); this.ev('snd', 'break', x + .5, y + .5); return;
    }
    const o = this.world.get(x, y); if (!o || !TZ.BUILD[o.t] || o.wild) return;
    if (o.owner && o.owner !== p.uid) { this.hintTo(pid, 'Это не ваша постройка'); return; }
    const B = TZ.BUILD[o.t], items = {};
    for (const k in B.cost) { const n = Math.floor(B.cost[k] * 0.5 * (o.hp / B.hp)); if (n > 0 && k !== 'radiopart') items[k] = n; }
    if (o.items) for (const k in o.items) items[k] = (items[k] || 0) + o.items[k];
    this.world.clearObj(x, y); this.structures.delete(o); this.dirtyFlow = true; this._encVer = -1;
    this.giveTo(pid, items, x + .5, y + .5);
    this.ev('snd', 'break', x + .5, y + .5); this.ev('chips', x + .5, y + .5, 10, TZ.matColor(o.t), 8);
  }
  destroyStructure(o) {
    const W = this.world; if (W.get(o.x, o.y) !== o) { this.structures.delete(o); return; }
    W.clearObj(o.x, o.y); this.structures.delete(o);
    const B = TZ.BUILD[o.t];
    this.ev('chips', o.x + .5, o.y + .5, 14, TZ.matColor(o.t), 14); this.ev('smoke', o.x + .5, o.y + .5, 4);
    this.ev('snd', 'break', o.x + .5, o.y + .5);
    if (B && B.kind === 'wall') this.msgTo(o.owner, `${B.name}: разрушено!`, 'bad');
    if (o.items && Object.keys(o.items).length) for (const k in o.items) this.dropPickup(o.x + .5, o.y + .5, k, o.items[k], 60);
    this.dirtyFlow = true; this._encVer = -1;
  }
  dropPickup(x, y, id, n, ttl) { if (!this.auth || !n) return; this.pickups.push({ id: this.nid(), item: id, n, x, y, t: 0, ttl: ttl ? ttl * 60 : 120, protect: ttl === 3 ? 1.5 : 0 }); }
  // ---------------------------------------------------------------- private bases (fog)
  enclosureAt(x, y) { this.updateEnclosures(); return this.enclosures.get(Math.floor(x) + ',' + Math.floor(y)) || null; }
  updateEnclosures() {
    const W = this.world;
    if (this._encVer === W.version) return;
    const now = performance.now(); if (this._encVer !== -1 && now - this._encT < 700) return;
    this._encVer = W.version; this._encT = now;
    const map = new Map();
    for (const g of this.structures) {
      if (!TZ.isCode(g.t)) continue;
      const regions = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const sx = g.x + dx, sy = g.y + dy;
        if (W.solidFor(sx, sy, 'any') || W.get(sx, sy) && TZ.OBJ[W.get(sx, sy).t] && TZ.OBJ[W.get(sx, sy).t].gate) continue;
        const seen = new Set([sx + ',' + sy]), q = [[sx, sy]]; let ok = true;
        while (q.length) {
          const [x, y] = q.pop();
          if (seen.size > 1600) { ok = false; break; }
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + ax, ny = y + ay, k = nx + ',' + ny; if (seen.has(k)) continue;
            const o = W.get(nx, ny);
            if (!W.chunkIf(Math.floor(nx / CH), Math.floor(ny / CH))) { ok = false; break; }
            if (o && TZ.OBJ[o.t] && TZ.OBJ[o.t].solid) continue;
            if (W.groundIf(nx, ny) === TZ.TILE.WATER) continue;
            seen.add(k); q.push([nx, ny]);
          }
          if (!ok) break;
        }
        if (ok) { // absorb furniture / trees standing inside (solid but not part of the fence)
          const barrier = o => !o || (TZ.BUILD[o.t] && TZ.BUILD[o.t].kind === 'wall') || o.t === 'hwall' || (TZ.OBJ[o.t] && TZ.OBJ[o.t].gate);
          const q2 = [...seen].map(k => [...k.split(',').map(Number), 0]);
          while (q2.length) {
            const [x, y, dd] = q2.pop(); if (dd >= 2) continue;
            for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ax, ny = y + ay, k = nx + ',' + ny; if (seen.has(k)) continue; const o = W.get(nx, ny); if (!o || barrier(o) || !(TZ.OBJ[o.t] && TZ.OBJ[o.t].solid)) continue; seen.add(k); q2.push([nx, ny, dd + 1]); }
          }
          regions.push(seen);
        }
      }
      if (!regions.length) continue;
      regions.sort((a, b) => a.size - b.size);
      for (const k of regions[0]) if (!map.has(k)) map.set(k, g);
    }
    this.enclosures = map;
  }
  hiddenAt(x, y) {
    if (!this.enclosures.size) return false;
    const g = this.enclosures.get(Math.floor(x) + ',' + Math.floor(y));
    if (!g) return false;
    if (TZ.gateAllows(g, this.me.uid)) return false;
    const mine = this.enclosures.get(Math.floor(this.me.x) + ',' + Math.floor(this.me.y));
    return mine !== g;
  }
  // ---------------------------------------------------------------- quests (story)
  questList() {
    const Q = this.quest, walls = [...this.structures].filter(o => TZ.BUILD[o.t].kind === 'wall' && o.owner === this.me.uid).length;
    const rec = this.allies.filter(a => a.owner === this.me.uid && !a.dead).length;
    const wood = TZ.Account.data().stats.trees || 0;
    return [
      { id: 'loot', text: 'Обыщите ящики в лагере', hint: 'Подойдите к ящику и нажмите [E]', ok: () => Q.done.loot || (TZ.Account.data().stats.looted || 0) > 0 },
      { id: 'car', text: 'Осмотрите старую машину', hint: 'Подойдите к машине и нажмите [E]', ok: () => Q.done.car },
      { id: 'wood', text: 'Нарубите дерево', hint: 'Возьмите топор и бейте по дереву [ЛКМ]', ok: () => this.count('wood') >= 10 || wood >= 4 },
      { id: 'fire', text: 'Разведите костёр', hint: 'Откройте строительство [B] → Свет → Костёр', ok: () => [...this.structures].some(o => o.t === 'campfire' && o.owner === this.me.uid) },
      { id: 'walls', text: `Укрепите лагерь стенами (${Math.min(8, walls)}/8)`, hint: '[B] → Частокол. Зажмите ЛКМ, чтобы ставить подряд', ok: () => walls >= 8 },
      { id: 'night', text: 'Переживите первую ночь', hint: 'Ночью приходит орда. Держитесь у света', ok: () => this.day >= 2 },
      { id: 'team', text: 'Найдите выживших', hint: 'Выжившие прячутся в городах, на заправках и фермах', ok: () => rec >= 1 },
      { id: 'parts', text: `Найдите детали рации (${Math.min(3, Q.radioparts)}/3)`, hint: 'Военные блокпосты, полиция, лаборатории, обломки вертолётов', ok: () => Q.radioparts >= 3 },
      { id: 'radio', text: 'Соберите радиостанцию', hint: 'Нужен верстак рядом. [B] → База → Радиостанция', ok: () => Q.done.radio || [...this.structures].some(o => o.t === 'radio') },
      { id: 'call', text: 'Вызовите эвакуацию по рации', hint: 'Подойдите к рации и нажмите [E]', ok: () => this.evacDay > 0 || this.endless },
      { id: 'evac', text: `Продержитесь до вертолёта (утро дня ${this.evacDay || '?'})`, hint: 'Последняя ночь будет самой тяжёлой', ok: () => this.won || this.endless },
    ];
  }
  checkQuests() {
    if (!this.story) { this.curQuest = { text: `Выживайте! День ${this.day}`, hint: 'Свободный режим' }; return; }
    const L = this.questList();
    for (const q of L) { if (this.quest.done[q.id]) continue; if (q.ok()) { this.quest.done[q.id] = true; if (this.ui) { this.msg('Задание выполнено: ' + q.text.replace(/\s*\(.*\)$/, ''), 'good'); TZ.audio.play('quest'); } } }
    const cur = L.find(q => !this.quest.done[q.id]);
    this.curQuest = cur || { text: `Выживайте! День ${this.day}`, hint: 'Бесконечный режим' };
  }
  questMarkers() {
    const out = [], cur = this.curQuest;
    for (const p of this.pings || []) out.push({ x: p.x, y: p.y, c: p.color, ping: true, name: p.name });
    if (!cur) return out;
    if (cur.id === 'team') for (const a of this.allies) if (!a.owner && !a.dead && dist2(a.x, a.y, this.me.x, this.me.y) < 3600) out.push({ x: a.x, y: a.y, c: '#5fd0ff' });
    if (cur.id === 'loot') for (const o of this.world.chunkIf(2, 2) ? this.world.chunkIf(2, 2).obj : []) if (o && o.starter && !o.looted) out.push({ x: o.x + .5, y: o.y + .5, c: '#ffd24a' });
    if (cur.id === 'car') { const v = this.vehicles.filter(v => v.state !== 'wreck').sort((a, b) => dist2(a.x, a.y, this.me.x, this.me.y) - dist2(b.x, b.y, this.me.x, this.me.y))[0]; if (v) out.push({ x: v.x, y: v.y, c: '#ffd24a' }); }
    if (cur.id === 'parts') for (const c of this.world.chunks.values()) for (const o of c.obj) if (o && o.quest === 'radiopart' && !o.looted && dist2(o.x, o.y, this.me.x, this.me.y) < 4900) out.push({ x: o.x + .5, y: o.y + .5, c: '#ffd24a' });
    for (const m of this.pingMarks || []) out.push(m);
    return out;
  }
  // ---------------------------------------------------------------- director
  director(dt) {
    this.directorT -= dt; if (this.directorT > 0) return; this.directorT = 2.5;
    const W = this.world, alive = [...this.players.values()].filter(p => !p.dead);
    // despawn far zombies & animals
    for (let i = this.zombies.length - 1; i >= 0; i--) { const z = this.zombies[i]; if (z.dead && z.deadT > 25) { this.zombies.splice(i, 1); continue; } if (z.horde && !z.dead) continue; let near = false; for (const p of this.players.values()) if (dist2(z.x, z.y, p.x, p.y) < 3600) { near = true; break; } if (!near) this.zombies.splice(i, 1); }
    for (let i = this.animals.length - 1; i >= 0; i--) { const a = this.animals[i]; if (a.dead && a.deadT > 90) { this.animals.splice(i, 1); continue; } if (a.owner && !a.dead) continue; let near = false; for (const p of this.players.values()) if (dist2(a.x, a.y, p.x, p.y) < 4900) near = true; if (!near) this.animals.splice(i, 1); }
    for (let i = this.pickups.length - 1; i >= 0; i--) { let near = false; for (const p of this.players.values()) if (dist2(this.pickups[i].x, this.pickups[i].y, p.x, p.y) < 6400) near = true; if (!near) this.pickups.splice(i, 1); }
    // stray dogs to befriend
    if (alive.length && Math.random() < 0.012 && this.animals.filter(a => a.ak === 'dog' && !a.owner && !a.dead).length < 2) {
      const p = alive[(Math.random() * alive.length) | 0], a = Math.random() * 6.28, r = 16 + Math.random() * 10;
      const f = this.findFree(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 3);
      if (f && W.biomeAt(f.x, f.y) !== 3 && !this.animals.some(q => q.ak === 'dog' && dist2(q.x, q.y, p.x, p.y) < 1600)) this.animals.push(new TZ.Animal(this, 'dog', f.x, f.y));
    }
    for (const p of alive) {
      const local = this.zombies.filter(z => !z.dead && !z.horde && dist2(z.x, z.y, p.x, p.y) < 1600).length;
      const target = Math.min(42, 14 + this.day * 2);
      for (let k = 0; k < 2 && local + k < target; k++) {
        const a = Math.random() * 6.28, r = 24 + Math.random() * 12;
        const x = Math.floor(p.x + Math.cos(a) * r) + 0.5, y = Math.floor(p.y + Math.sin(a) * r) + 0.5;
        if (!W.chunkIf(Math.floor(x / CH), Math.floor(y / CH)) || W.solidFor(x, y, 'z')) continue;
        const bc = this.baseCenter(p.uid); if (bc && dist2(x, y, bc.x, bc.y) < 256) continue;
        if (this.enclosureAt(x, y)) continue;
        const b = W.biomeAt(x, y), rr = Math.random(), d = this.day;
        let type = rr < 0.08 ? 'crawler' : (d >= 2 && rr < 0.2) ? 'runner' : (d >= 3 && rr < 0.26) ? 'spitter' : (d >= 4 && rr < 0.29) ? 'brute' : (d >= 3 && rr < 0.32) ? 'exploder' : 'walker';
        if (b === 2 && Math.random() < 0.3) type = 'frozen';
        if (b === 3 && Math.random() < 0.2) type = 'spitter';
        if (b === 4 && Math.random() < 0.15) type = 'exploder';
        if (b === 5 && Math.random() < 0.4) type = 'husk';
        this.spawnZombie(type, x, y);
      }
      // wildlife
      if (!this.isNight()) {
        const an = this.animals.filter(a => !a.dead && dist2(a.x, a.y, p.x, p.y) < 2500).length;
        if (an < 3 && Math.random() < 0.3) {
          const a = Math.random() * 6.28, r = 26 + Math.random() * 10, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          if (W.chunkIf(Math.floor(x / CH), Math.floor(y / CH)) && !W.solidFor(x, y, 'z')) {
            const b = W.biomeAt(x, y);
            const kind = b === 2 ? (Math.random() < 0.15 ? 'bear' : Math.random() < 0.6 ? 'wolf' : 'deer') : b === 0 ? (Math.random() < 0.25 ? 'wolf' : 'deer') : b === 1 ? 'deer' : null;
            if (kind) { const n = kind === 'wolf' ? 3 : kind === 'bear' ? 1 : 2; for (let i = 0; i < n; i++) this.animals.push(new TZ.Animal(this, kind, x + Math.random(), y + Math.random())); }
          }
        }
      }
    }
  }
  clusters() {
    const ps = [...this.players.values()].filter(p => !p.dead), out = [];
    for (const p of ps) { let c = out.find(c => c.some(q => dist2(q.x, q.y, p.x, p.y) < 2500)); if (c) c.push(p); else out.push([p]); }
    return out;
  }
  startHorde() {
    const d = this.day, D = this.diff, final = this.evacDay && d === this.evacDay - 1;
    const groups = this.clusters().map(c => {
      let base = null; for (const p of c) { const b = this.baseCenter(p.uid); if (b && dist2(b.x, b.y, p.x, p.y) < 1600) { base = b; break; } }
      const ctr = base || { x: c.reduce((s, p) => s + p.x, 0) / c.length, y: c.reduce((s, p) => s + p.y, 0) / c.length };
      const total = Math.round((9 + (d - 1) * 6) * D.horde * (final ? 1.8 : 1) * (1 + (c.length - 1) * 0.5));
      const nd = d <= 2 ? 1 : d <= 5 ? 2 : 3, base0 = Math.random() * Math.PI * 2;
      return { ctr, total, spawned: 0, t: 2, dirs: Array.from({ length: nd }, (_, i) => base0 + i * (Math.PI * 2 / nd) + (Math.random() - .5) * .6), boss: (d % 7 === 0) || final, brutes: Math.floor(d / 3) + (final ? 3 : 0) };
    });
    this.horde = { groups };
    this.ev('banner', `НОЧЬ ${d}`, final ? 'Последняя ночь. Вертолёт уже близко...' : 'Они идут...');
    this.ev('snd', 'horn', this.me.x, this.me.y);
    this.ev('sys', `Орда приближается! (${groups.reduce((s, g) => s + g.total, 0)} мертвецов)`, 'bad');
    TZ.audio.setMusic('night'); if (this.net) this.net.broadcast('music', { m: 'night' });
  }
  updateHorde(dt) {
    const H = this.horde; if (!H) return;
    for (const g of H.groups) {
      g.t -= dt; if (g.t > 0 || g.spawned >= g.total) continue;
      g.t = 1.2 + Math.random() * 1.4;
      const a = g.dirs[(Math.random() * g.dirs.length) | 0] + (Math.random() - .5) * 0.5, R = 30 + Math.random() * 5;
      const gx = g.ctr.x + Math.cos(a) * R, gy = g.ctr.y + Math.sin(a) * R;
      const n = Math.min(g.total - g.spawned, 3 + (Math.random() * 4 | 0));
      for (let i = 0; i < n; i++) {
        const f = this.findFree(gx, gy, 3); if (!f) continue;
        const r = Math.random(), d = this.day, b = this.world.biomeAt(f.x, f.y);
        let type = r < 0.1 ? 'crawler' : (d >= 2 && r < 0.3) ? 'runner' : (d >= 3 && r < 0.38) ? 'spitter' : (d >= 4 && r < 0.43) ? 'exploder' : (d >= 5 && r < 0.46) ? 'screamer' : (d >= 4 && r < 0.52) ? 'soldier' : 'walker';
        if (b === 2 && Math.random() < 0.3) type = 'frozen';
        if (b === 5 && Math.random() < 0.35) type = 'husk';
        if (g.brutes > 0 && Math.random() < 0.25) { type = 'brute'; g.brutes--; }
        this.spawnZombie(type, f.x, f.y, true); g.spawned++;
      }
      if (g.boss && g.spawned > g.total * 0.6) { g.boss = false; const f = this.findFree(gx, gy, 3); if (f) { this.spawnZombie('boss', f.x, f.y, true); this.ev('banner', 'БЕГЕМОТ', 'Гигант идёт к вашей базе!'); this.ev('snd', 'boss_roar', this.me.x, this.me.y); } }
    }
  }
  morning() {
    this.day++; this.stats.nights++; this.horde = null;
    for (const z of this.zombies) if (z.horde) { z.horde = false; z.hunt = 6; }
    this.ev('banner', `ДЕНЬ ${this.day}`, 'Ночь пережита');
    this.ev('snd', 'dawn', this.me.x, this.me.y);
    TZ.audio.setMusic('day'); if (this.net) this.net.broadcast('music', { m: 'day' });
    for (const p of this.players.values()) this.toPlayer(p.pid, 'morning', { day: this.day });
    // survivors' upkeep and daily work
    for (const a of this.allies) {
      if (!a.owner || a.dead) continue;
      const owner = this.playerByUid(a.owner);
      const chests = [...this.structures].filter(o => o.t === 'chest' && o.owner === a.owner);
      const foodChest = chests.find(c => c.items && ['canned', 'veggie', 'steak', 'beans', 'mre'].some(f => c.items[f]));
      if ((a.food ?? 80) < 30 && foodChest) { const f = ['canned', 'veggie', 'steak', 'beans', 'mre'].find(f => foodChest.items[f]); foodChest.items[f]--; if (!foodChest.items[f]) delete foodChest.items[f]; this.world.touch(foodChest); a.food = 80; }
      if ((a.food ?? 80) > 10 && (a.water ?? 80) > 5) a.hungry = 0;
      else { a.hungry++; a.hp = Math.max(1, a.hp - 30); this.msgTo(a.owner, `${a.name} голодает и не может сам найти еду и воду! Дайте припасов или положите их в ящик базы.`, 'warn'); }
      if (a.hungry >= 3) { this.msgTo(a.owner, `${a.name} ушёл${a.female ? 'а' : ''} из команды из-за голода.`, 'bad'); a.owner = null; a.x = a.home.x; a.y = a.home.y; continue; }
      if (a.role === 'gatherer' || a.role === 'cook') {
        const got = a.role === 'gatherer' ? { wood: 3 + (Math.random() * 5 | 0), stone: 1 + (Math.random() * 3 | 0), metal: 1 + (Math.random() * 3 | 0), cloth: Math.random() * 3 | 0, parts: Math.random() < .4 ? 1 : 0 } : { steak: 1 + (Math.random() * 2 | 0), water: 1 + (Math.random() * 2 | 0), canned: Math.random() < .4 ? 1 : 0 };
        const chest = chests[0];
        if (chest) { chest.items = chest.items || {}; for (const k in got) if (got[k]) chest.items[k] = (chest.items[k] || 0) + got[k]; this.world.touch(chest); }
        else if (owner) this.giveTo(owner.pid, got);
        this.msgTo(a.owner, `${a.name} принёс${a.female ? 'ла' : ''}: ` + Object.entries(got).filter(e => e[1]).map(([k, v]) => `${TZ.ITEMS[k].name} ×${v}`).join(', '), 'good');
      }
    }
    if (this.evacDay && this.day >= this.evacDay) this.startEvac();
    if (this.day % 3 === 0) this._dropDay = this.day;
    if (this.role !== 'client') this.save(true);
  }
  // signal flare (authority): light, fire, and once a day a supply drop next to it
  flareAt(x, y, owner) {
    this.ev('flare', +x.toFixed(2), +y.toFixed(2));
    for (const z of this.zgrid.query(x, y, 2, this._tmpC)) if (!z.dead && dist2(z.x, z.y, x, y) < 2.2) { z.burn = Math.max(z.burn, 3); z.burnBy = owner; }
    if (this.flareDropDay !== this.day) { this.flareDropDay = this.day; setTimeout(() => this.airdrop({ x, y }), 4000); this.ev('sys', 'Ракету заметили с самолёта! Груз сбросят рядом.', 'good'); }
    else if (owner) this.hintTo(owner, 'Сегодня самолёт уже прилетал. Ракета просто светит.');
  }
  airdrop(at) {
    const p = [...this.players.values()].filter(p => !p.dead)[(Math.random() * this.players.size) | 0] || this.me;
    const c = at || this.baseCenter(p.uid) || p;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * Math.PI * 2, r = at ? 2 + Math.random() * 5 + t * 0.3 : 14 + Math.random() * 16, x = Math.round(c.x + Math.cos(a) * r), y = Math.round(c.y + Math.sin(a) * r);
      if (!this.world.chunkIf(Math.floor(x / CH), Math.floor(y / CH)) || this.world.get(x, y) || this.world.solidFor(x, y, 'z')) continue;
      this.world.set(x, y, { t: 'drop', dropT: 0 });
      this.dropAt = { x: x + .5, y: y + .5, t: 0 };
      this.ev('banner', 'ГРУЗ С ВОЗДУХА', 'Ищите красный дым');
      this.ev('snd', 'plane', p.x, p.y);
      return;
    }
  }
  startEvac() {
    if (this.heli) return;
    const r = [...this.structures].find(o => o.t === 'radio') || this.me;
    this.heli = { x: (r.x || 0) + 2, y: (r.y || 0) + 2, t: 0, phase: 'in' };
    this.ev('banner', 'ВЕРТОЛЁТ!', 'Эвакуация прибыла. Бегите к радиостанции!');
    this.ev('heli');
  }
  updateHeli(dt) {
    const H = this.heli; if (!H) return;
    H.t += dt;
    if (H.phase === 'in' && H.t > 6) H.phase = 'land';
    if (H.phase === 'land') for (const p of this.players.values()) if (!p.dead && dist(p.x, p.y, H.x, H.y) < 3) {
      H.phase = 'out'; H.t2 = 0; this.won = true;
      for (const q of this.players.values()) if (dist(q.x, q.y, H.x, H.y) < 8) this.toPlayer(q.pid, 'evac', {});
      if (this.net) this.net.broadcast('victory', {});
      this.checkQuests();
      setTimeout(() => this.ui.showVictory(), 3500);
      break;
    }
    if (H.phase === 'out') { H.t2 += dt; if (H.t2 > 20) this.heli = null; }
  }
  // ---------------------------------------------------------------- interaction (local player)
  findInteract() {
    const P = this.me, W = this.world; if (P.vehicle) return { kind: 'vexit' };
    let best = null, bd = 1.8;
    const m = this.mouseWorld;
    const consider = (o, x, y, kind) => { if (this.hiddenAt(x, y)) return; const d = dist(P.x, P.y, x, y) - (dist(m.x, m.y, x, y) < 0.9 ? 0.6 : 0); if (d < bd) { bd = d; best = { o, x, y, kind }; } };
    for (let y = Math.floor(P.y) - 2; y <= Math.floor(P.y) + 2; y++) for (let x = Math.floor(P.x) - 2; x <= Math.floor(P.x) + 2; x++) {
      const o = W.main(W.get(x, y)); if (!o) continue;
      const M = TZ.OBJ[o.t] || {};
      const regrown = M.regrow && o.looted && this.absMin() - (o.lootT || 0) > 1440;
      const lootable = (M.loot || o.loot || o.fixed || o.t === 'backpack') && (!o.looted || regrown);
      const usable = ['workbench', 'garage', 'bed', 'sleepbag', 'chest', 'garden', 'collector', 'turret', 'turret_heavy', 'radio', 'campfire', 'gate_code', 'door_code'].includes(o.t);
      if (lootable || usable) consider(o, clamp(P.x, o.x, o.x + 1), clamp(P.y, o.y, o.y + 1), lootable ? 'loot' : o.t);
    }
    for (const v of this.vehicles) { const d = dist(P.x, P.y, v.x, v.y); if (d < 2.6) { const dd = d - 0.6; if (dd < bd) { bd = dd; best = { o: v, x: v.x, y: v.y, kind: 'vehicle' }; } } }
    for (const a of this.allies) if (!a.dead && !a.inCar) consider(a, a.x, a.y, 'ally');
    for (const a of this.animals) if (a.dead && !a.looted) consider(a, a.x, a.y, 'animal');
    for (const a of this.animals) if (!a.dead && a.ak === 'dog') consider(a, a.x, a.y, 'dog');
    // tools: hammer upgrades own walls, rod fishes in water
    if (P.weapon === 'hammer') for (let y = Math.floor(P.y) - 2; y <= Math.floor(P.y) + 2; y++) for (let x = Math.floor(P.x) - 2; x <= Math.floor(P.x) + 2; x++) {
      const o = W.get(x, y); if (!o || !UPGRADE[o.t] || (o.owner && o.owner !== P.uid)) continue;
      const d = dist(P.x, P.y, x + .5, y + .5) - 0.3 - (dist(m.x, m.y, x + .5, y + .5) < 0.8 ? 0.6 : 0); if (d < bd) { bd = d; best = { o, x: x + .5, y: y + .5, kind: 'upgrade' }; }
    }
    if (P.weapon === 'rod' && !best) {
      let wd = 2.6;
      for (let y = Math.floor(P.y) - 2; y <= Math.floor(P.y) + 2; y++) for (let x = Math.floor(P.x) - 2; x <= Math.floor(P.x) + 2; x++) {
        const g = W.groundIf(x, y); if (g !== TZ.TILE.WATER && g !== TZ.TILE.SHALLOW && g !== TZ.TILE.ICE) continue;
        const d = dist(P.x, P.y, x + .5, y + .5); if (d < wd) { wd = d; best = { o: null, x: x + .5, y: y + .5, kind: 'fish', ice: g === TZ.TILE.ICE }; }
      }
    }
    return best;
  }
  interactLabel(it) {
    if (!it) return null;
    const o = it.o;
    if (it.kind === 'vexit') return 'Выйти из машины';
    if (it.kind === 'loot') return `Обыскать: ${OBJ_NAMES[o.t] || 'Тайник'}`;
    if (it.kind === 'animal') return `Разделать: ${o.T.name}`;
    if (it.kind === 'vehicle') return `${o.T.name}${o.state === 'wreck' ? ' (сгорела)' : ` · ${Math.round(o.hp / o.T.hp * 100)}% · топливо ${Math.round(o.fuel)}`}`;
    if (it.kind === 'ally') return o.owner === this.me.uid ? `${o.name}: ${o.mode === 'follow' ? 'охранять здесь' : 'за мной'}` : o.owner ? `${o.name} (чужая команда)` : `Поговорить: ${o.name}`;
    if (it.kind === 'workbench') return 'Верстак — крафт';
    if (it.kind === 'garage') return 'Гаражный пост — сборка машин';
    if (it.kind === 'bed') return 'Кровать — возрождение и сохранение';
    if (it.kind === 'sleepbag') return 'Спальник — точка возрождения';
    if (it.kind === 'fish') return it.ice ? 'Рыбачить в лунке' : 'Рыбачить';
    if (it.kind === 'upgrade') { const u = UPGRADE[o.t], B2 = TZ.BUILD[u.to]; return `Улучшить до «${B2.name}» (${Object.entries(u.cost).map(([k, n]) => `${TZ.ITEMS[k].name.toLowerCase()} ${this.count(k)}/${n}`).join(', ')})`; }
    if (it.kind === 'dog') { if (!o.owner) return this.count('leash') && DOG_FOOD.some(k => this.count(k)) ? 'Приручить собаку (ошейник + мясо)' : 'Бездомная собака — нужны ошейник и мясо'; if (o.owner !== this.me.uid) return 'Собака другого игрока'; return o.mode === 'stay' ? 'Собака: ко мне!' : 'Собака: сидеть'; }
    if (it.kind === 'chest') return 'Открыть ящик';
    if (it.kind === 'garden') { const p = this.gardenProgress(o); return p >= 1 ? 'Собрать урожай' : `Грядка: ${Math.floor(p * 100)}%`; }
    if (it.kind === 'collector') return `Набрать воду (${o.water | 0})`;
    if (it.kind === 'turret' || it.kind === 'turret_heavy') return `Зарядить турель (${o.ammo | 0}/120)`;
    if (it.kind === 'radio') return this.evacDay ? `Эвакуация: утро дня ${this.evacDay}` : 'Вызвать эвакуацию';
    if (it.kind === 'campfire') return 'Костёр — готовить еду';
    if (TZ.isCode(it.kind)) { const nm = it.kind === 'door_code' ? 'Дверь с кодом' : 'Кодовые ворота'; return o.owner === this.me.uid ? nm + ' — сменить код' : TZ.gateAllows(o, this.me.uid) ? nm + ' (доступ есть)' : 'Ввести код'; }
    return null;
  }
  doInteract(it) {
    const o = it.o, P = this.me;
    if (it.kind === 'vexit') { this.act('vehExit', {}); return; }
    if (it.kind === 'loot') { this.search = { o, x: o.x, y: o.y, t: 0, dur: (TZ.OBJ[o.t] && TZ.OBJ[o.t].search) || 1.2 }; TZ.audio.play('search'); if (o.starter) this.quest.done.loot = this.quest.done.loot; return; }
    if (it.kind === 'animal') { this.search = { animal: o, t: 0, dur: 1.6 }; TZ.audio.play('slash'); return; }
    if (it.kind === 'vehicle') { this.quest.done.car = true; this.ui.openVehicle(o); return; }
    if (it.kind === 'ally') {
      if (!o.owner) { this.ui.talk(o); return; }
      if (o.owner !== this.me.uid) return;
      this.act('order', { id: o.id, mode: o.mode === 'follow' ? 'guard' : 'follow' }); this.msg(o.mode === 'follow' ? `${o.name} охраняет эту позицию.` : `${o.name} следует за вами.`); TZ.audio.play('ui'); return;
    }
    if (it.kind === 'fish') { this.search = { fish: true, x: it.x - .5, y: it.y - .5, t: 0, dur: 2.5 + Math.random() * 4, label: 'Клюёт...' }; TZ.audio.play('swing'); this.fx.sparks(it.x, it.y, 4, '#bfe6ff', 2); return; }
    if (it.kind === 'upgrade') {
      const u = UPGRADE[o.t]; if (!Object.entries(u.cost).every(([k, n]) => this.count(k) >= n)) { this.hint('Не хватает материалов для улучшения'); TZ.audio.play('error'); return; }
      for (const k in u.cost) this.take(k, u.cost[k]); this.act('upgrade', { x: o.x, y: o.y, paid: u.cost }); return;
    }
    if (it.kind === 'dog') {
      if (!o.owner) { const food = DOG_FOOD.find(k => this.count(k)); if (!this.count('leash') || !food) { this.hint('Нужны ошейник (крафт: кожа + верёвка) и мясо или рыба'); return; } this.take('leash', 1); this.take(food, 1); this.act('tame', { id: o.id }); return; }
      if (o.owner === this.me.uid) { this.act('dogMode', { id: o.id, mode: o.mode === 'stay' ? 'follow' : 'stay' }); TZ.audio.play('ui'); }
      return;
    }
    if (it.kind === 'workbench') { this.ui.openCraft('bench'); return; }
    if (it.kind === 'campfire') { this.ui.openCraft('fire'); return; }
    if (it.kind === 'garage') { this.ui.openCraft('garage'); return; }
    if (it.kind === 'bed' || it.kind === 'sleepbag') { if (this.zombies.some(z => !z.dead && z.state === 'hunt' && dist2(z.x, z.y, P.x, P.y) < 196)) { this.hint('Нельзя отдыхать — рядом враги!'); return; } P.stamina = 100; this.act('bed', { x: o.x, y: o.y }); if (this.role === 'client') this.msg('Точка возрождения установлена', 'good'); else this.msg('Игра сохранена.', 'good'); TZ.audio.play('save'); return; }
    if (it.kind === 'chest') { this.ui.openChest(o); return; }
    if (it.kind === 'garden' || it.kind === 'collector') { this.act('harvest', { x: o.x, y: o.y }); return; }
    if (it.kind === 'turret' || it.kind === 'turret_heavy') { const am = TZ.BUILD[o.t].ammo; const n = Math.min(120 - (o.ammo | 0), this.count(am)); if (n > 0) { this.take(am, n); this.act('loadTurret', { x: o.x, y: o.y, n }); TZ.audio.reload('pistol'); this.fx.text(o.x + .5, o.y + .5, `+${n}`, '#ffd24a'); } else this.hint(this.count(am) ? 'Турель заряжена' : 'Нет патронов: ' + TZ.ITEMS[am].name); return; }
    if (it.kind === 'radio') { this.act('radio', { x: o.x, y: o.y }); return; }
    if (TZ.isCode(it.kind)) { this.ui.codePrompt(o.x, o.y, o.owner === this.me.uid); return; }
  }
  finishSearch(s) {
    if (s.fish) { this.act('fish', { x: s.x, y: s.y }); return; }
    if (s.veh) { this.act('vehFix', { id: s.veh.id, what: 'dismantle' }); return; }
    if (s.animal) this.act('butcher', { id: s.animal.id });
    else this.act('loot', { x: s.x, y: s.y });
  }
  // ---------------------------------------------------------------- structures tick (authority)
  updateStructures(dt) {
    const now = this.absMin();
    for (const o of this.structures) {
      o.hitT = Math.max(0, (o.hitT || 0) - dt);
      if (o.t === 'turret' || o.t === 'turret_heavy') {
        o.cd = (o.cd || 0) - dt; o.flash = Math.max(0, (o.flash || 0) - dt);
        if ((o.ammo | 0) <= 0) continue;
        const heavy = o.t === 'turret_heavy', range = heavy ? 11 : 9;
        let best = null, bd = range;
        for (const z of this.zgrid.query(o.x + .5, o.y + .5, range, this._tmpB)) { if (z.dead) continue; const d = dist(o.x + .5, o.y + .5, z.x, z.y); if (d < bd && !this.world.raycast(o.x + .5, o.y + .5, z.x, z.y)) { bd = d; best = z; } }
        if (best) {
          const a = Math.atan2(best.y - (o.y + .5), best.x - (o.x + .5));
          o.ang = (o.ang || 0) + clamp(TZ.angDiff(o.ang || 0, a), -dt * 8, dt * 8);
          if (o.cd <= 0 && Math.abs(TZ.angDiff(o.ang, a)) < 0.2) {
            o.cd = heavy ? 0.12 : 0.24; o.ammo--; o.flash = 0.06;
            this.combat.fire({ x: o.x + .5, y: o.y + .5 }, heavy ? { dmg: 30, pellets: 1, spread: 0.06, speed: 34, range: 12, knock: 0.3, sound: 'rifle', noise: 12 } : { dmg: 22, pellets: 1, spread: 0.05, speed: 30, range: 10, knock: 0.25, sound: 'turret', noise: 10 }, heavy ? 'ak' : 'pistol', [o.ang + (Math.random() - .5) * 0.05], 't', 1, 't');
            if (o.ammo === 0) this.msgTo(o.owner, 'Турель без патронов!', 'warn');
            if (o.ammo % 10 === 0) this.world.touch(o);
          }
        }
      }
      if (o.t === 'collector') { o.lastT = o.lastT ?? now; if (now - o.lastT >= 300) { o.lastT = now; if ((o.water | 0) < 5) { o.water = (o.water | 0) + 1; this.world.touch(o); } } }
    }
  }
  // ---------------------------------------------------------------- input (local)
  handleInput(dt) {
    const I = TZ.input, P = this.me;
    if (this.typing) return;
    if (this.ui.modalOpen() && !this.ui.invOpen) return;
    for (let i = 0; i < 8; i++) if (I.hit('Digit' + (i + 1))) {
      if (this.ui.hoverItem) { P.hotbar = P.hotbar.map(h => h === this.ui.hoverItem ? null : h); P.hotbar[i] = this.ui.hoverItem; this.ui.dirty(); TZ.audio.play('ui'); continue; }
      const id = P.hotbar[i]; if (!id) continue;
      const it = TZ.ITEMS[id];
      if (it && (it.type === 'food' || it.type === 'med')) this.useItem(id);
      else if (this.count(id)) { P.sel = i; P.reload = 0; TZ.audio.play('equip'); }
    }
    if (I.mouse.wheel && this.mode === 'play' && !P.vehicle && !this.ui.overUI) {
      const dir = I.mouse.wheel > 0 ? 1 : -1;
      for (let k = 1; k <= 8; k++) { const s = (P.sel + dir * k + 8) % 8, id = P.hotbar[s]; if (id && this.count(id) && TZ.WEAPONS[id]) { P.sel = s; P.reload = 0; TZ.audio.play('equip'); break; } }
    }
    if (I.act('light')) { if (!this.count('flashlight')) { P.light = false; this.hint('У вас нет фонарика'); } else { P.light = !P.light; TZ.audio.play('switch'); } }
    if (I.act('team')) {
      const team = this.allies.filter(a => a.owner === P.uid && !a.dead);
      if (team.length) { const toGuard = team.some(a => a.mode === 'follow'); this.act('order', { mode: toGuard ? 'guard' : 'follow' }); this.msg(toGuard ? 'Команда: охранять позиции!' : 'Команда: за мной!'); TZ.audio.play('ui'); }
      else this.hint('У вас пока нет команды');
    }
    if (I.act('interact') && this.interact && !this.search) this.doInteract(this.interact);
    if (I.act('ping')) this.ping(this.mouseWorld.x, this.mouseWorld.y);
    if (I.act('heal')) { const id = ['bandage', 'medkit'].find(k => this.count(k)); if (id) this.useItem(id); else this.hint('Нет бинтов и аптечек'); }
    if (this.mode === 'build') {
      this.buildCd -= dt;
      if (I.mouse.wheel && !this.ui.overUI) { const ids = TZ.BUILD_ORDER2(); const i = ids.indexOf(this.buildSel); this.buildSel = ids[(i + (I.mouse.wheel > 0 ? 1 : -1) + ids.length) % ids.length]; this.ui.dirty(); }
      const m = this.mouseWorld, tx = Math.floor(m.x), ty = Math.floor(m.y);
      const B = TZ.BUILD[this.buildSel];
      const repeat = B && (B.kind === 'wall' && !B.gate || B.kind === 'trap' || B.kind === 'light' || B.kind === 'floor' || B.kind === 'roof');
      if (B && !this.uiBlocking && (I.mouse.clicked || (repeat && I.mouse.down && this.buildCd <= 0))) {
        const err = this.tryBuild(tx, ty);
        if (!err) this.buildCd = 0.12;
        else if (I.mouse.clicked) { this.hint(err); TZ.audio.play('error'); }
      }
      if (I.act('demolish')) this.act('demolish', { x: tx, y: ty });
      if (I.mouse.rclicked) this.exitBuild();
    }
  }
  enterBuild(id) { if (this.me.vehicle) return; this.mode = 'build'; if (id) this.buildSel = id; this.ui.dirty(); }
  exitBuild() { this.mode = 'play'; this.ui.dirty(); }
  // ---------------------------------------------------------------- main update
  update(dt) {
    if (this.paused && !this.net) return;
    const P = this.me, W = this.world;
    if (this.auth) {
      const prevH = this.hour;
      this.minutes += dt * MIN_PER_SEC;
      if (this.minutes >= 1440) this.minutes -= 1440;
      const h = this.hour;
      if (prevH < 6 && h >= 6) this.morning();
      if (prevH < 20.5 && h >= 20.5 && !this.horde) this.startHorde();
      if (prevH < 18 && h >= 18) { this.ev('sys', 'Темнеет. Скоро придёт орда — готовьте оборону!', 'warn'); TZ.audio.setMusic('dusk'); if (this.net) this.net.broadcast('music', { m: 'dusk' }); }
      if (prevH < 12 && h >= 12 && this.day % 3 === 0) this.airdrop();
      this.weather.nextChange -= dt;
      if (this.weather.nextChange <= 0) { this.weather.nextChange = 120 + Math.random() * 200; this.weather.target = Math.random() < 0.3 ? 0.5 + Math.random() * 0.5 : 0; }
      this.weather.rain += clamp(this.weather.target - this.weather.rain, -dt * 0.05, dt * 0.05);
    }
    // local precipitation type follows biome under the camera
    const biome = W.biomeAt(P.x, P.y);
    this.weather.snow += clamp((biome === 2 ? Math.max(0.25, this.weather.rain) : 0) - this.weather.snow, -dt * 0.1, dt * 0.1);
    this.weather.fog += clamp((biome === 3 ? 0.6 : 0) - this.weather.fog, -dt * 0.1, dt * 0.1);
    // desert: the rain front turns into a sandstorm
    this.weather.dust = (this.weather.dust || 0) + clamp((biome === 5 ? this.weather.rain : 0) - (this.weather.dust || 0), -dt * 0.08, dt * 0.08);
    if (this.weather.dust > 0.35 && !this._storm) { this._storm = 1; this.msg('Песчаная буря! Видимость падает, жажда растёт.', 'warn'); } else if (this.weather.dust < 0.1) this._storm = 0;
    TZ.audio.setRain(biome === 2 || biome >= 4 ? 0 : this.weather.rain);
    TZ.audio.setWind(biome === 2 ? 0.5 : biome === 5 ? 0.3 + this.weather.dust * 0.6 : biome === 4 ? 0.35 : 0.15);
    if (this.canControl && this.mode !== 'dead' && !this.paused) this.handleInput(dt);
    if (!this.paused) P.update(dt, this);
    try { TZ.Voice.update(this, dt); } catch (e) { console.warn('voice', e); }
    // metal detector in hand: beeps faster as you approach a buried cache
    if (P.weapon === 'detector' && !P.dead && !P.vehicle) {
      this._detT = (this._detT || 0) - dt;
      if (!this._detScan || this._detScan < performance.now()) { this._detScan = performance.now() + 250; const c = W.nearestCache(P.x, P.y, 16); this.detSignal = c ? clamp(1 - c.d / 16, 0, 1) : 0; this.detCache = c; }
      if (this.detSignal > 0 && this._detT <= 0) { this._detT = 1.3 - this.detSignal * 1.18; TZ.audio.play('detect', 0.4 + this.detSignal * 0.6); }
      if (this.detCache && this.detCache.d < 1.3) this.hint('Сигнал максимальный! Тайник под ногами — копайте лопатой');
    } else this.detSignal = 0;
    if (this.mode === 'dead' && P.vehicle) P.vehicle = 0;
    this.streamChunks(false);
    // grid
    this.zgrid.clear();
    for (const z of this.zombies) if (!z.dead) this.zgrid.add(z);
    if (this.auth) {
      this.updateFlows(dt);
      for (const z of this.zombies) z.update(dt, this);
      for (const a of this.allies) a.update(dt, this);
      for (const a of this.animals) a.update(dt, this);
      for (const p of this.players.values()) if (p !== P) p.remoteUpdate(dt);
      this.updateStructures(dt);
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i]; pk.t += dt;
        if (pk.t < pk.protect) continue;
        let taken = false;
        for (const p of this.players.values()) if (!p.dead && !p.vehicle && dist2(pk.x, pk.y, p.x, p.y) < 0.8) { this.giveTo(p.pid, { [pk.item]: pk.n }, pk.x, pk.y); taken = true; break; }
        if (taken || pk.t > pk.ttl) this.pickups.splice(i, 1);
      }
      this.director(dt);
      this.updateHorde(dt);
      this.updateHeli(dt);
      if (this.dropAt) { this.dropAt.t += dt; if (Math.random() < dt * 10) this.fx.smoke(this.dropAt.x, this.dropAt.y, 1, 12, 'rgba(220,60,40,'); }
    } else {
      for (const z of this.zombies) z.update(dt);
      for (const a of this.allies) a.update(dt);
      for (const a of this.animals) a.update(dt);
      for (const p of this.players.values()) if (p !== P) p.remoteUpdate(dt);
      for (const pk of this.pickups) pk.t = (pk.t || 0) + dt;
      if (this.heli) this.heli.t += dt, this.heli.t2 = (this.heli.t2 || 0) + (this.heli.phase === 'out' ? dt : 0);
    }
    this.updateVehicles(dt);
    if (!P.vehicle) TZ.audio.engine(-1);
    this.combat.update(dt);
    this.fx.update(dt);
    if (this.pings && this.pings.length) { for (const p of this.pings) p.t -= dt; this.pings = this.pings.filter(p => p.t > 0); }
    if (this.flares && this.flares.length) { for (const f of this.flares) { f.t -= dt; if (Math.random() < dt * 14) this.fx.sparks(f.x, f.y, 1, '#ff7050', 3); if (Math.random() < dt * 3) this.fx.smoke(f.x, f.y, 1, 10, 'rgba(255,120,100,'); } this.flares = this.flares.filter(f => f.t > 0); }
    // search progress
    if (this.search) {
      const s = this.search; s.t += dt;
      const sx = s.animal ? s.animal.x : s.x + .5, sy = s.animal ? s.animal.y : s.y + .5;
      if (dist(P.x, P.y, sx, sy) > 2.6 || P.vehicle) this.search = null;
      else if (s.t >= s.dur) { this.finishSearch(s); this.search = null; }
    }
    this.interact = this.mode === 'play' && !P.dead ? this.findInteract() : null;
    this.questT -= dt; if (this.questT <= 0) { this.questT = 0.5; if (this.auth) this.checkQuests(); else if (!this.curQuest) this.curQuest = { text: 'Выживайте вместе', hint: 'Сервер: ' + (this.serverName || '') }; this.updateEnclosures(); }
    if (this.auth && this.role !== 'client') { this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 90; this.save(true, true); } }
    // camera
    const lead = P.vehicle ? 0.05 : 0.12;
    const tx = TZ.isoX(P.x, P.y) + (TZ.isoX(this.mouseWorld.x, this.mouseWorld.y) - TZ.isoX(P.x, P.y)) * lead;
    const pveh = P.vehicle ? this.vehicles.find(v => v.id === P.vehicle) : null;
    const ty = TZ.isoY(P.x, P.y) - 10 - (pveh && pveh.alt ? pveh.alt * 90 : 0) + (TZ.isoY(this.mouseWorld.x, this.mouseWorld.y) - TZ.isoY(P.x, P.y)) * lead;
    const C = this.camera;
    C.x += (tx - C.x) * Math.min(1, dt * 8); C.y += (ty - C.y) * Math.min(1, dt * 8);
    C.amt = Math.max(0, C.amt - dt * 25); C.sx = (Math.random() - .5) * C.amt; C.sy = (Math.random() - .5) * C.amt;
    const wantZoom = P.vehicle ? -1 : (this.count('binoc') ? -0.5 : 0);
    C.zoom += (wantZoom - C.zoom) * Math.min(1, dt * 2);
    let fireD = 99; for (const o of this.structures) if (o.t === 'campfire') fireD = Math.min(fireD, dist(o.x, o.y, P.x, P.y));
    TZ.audio.setFire(clamp(1 - fireD / 9, 0, 1));
    TZ.audio.setTension(clamp(this.zombies.filter(z => !z.dead && (z.state === 'hunt' || z.moving) && dist2(z.x, z.y, P.x, P.y) < 144).length / 12, 0, 1));
    if (this.net) this.net.tick(dt);
  }
  // ---------------------------------------------------------------- network objects
  netObj(o) { const c = Object.assign({}, o); if (c.code != null) c.code = undefined; return c; }
  // ---------------------------------------------------------------- save / load (authority)
  serialize() {
    if (this.me) this.playerData[this.me.uid] = this.me.serialize();
    return {
      v: 2, meta: Object.assign({}, this.meta, { day: this.day, played: Date.now() }), minutes: this.minutes, day: this.day,
      world: this.world.serialize(), playerData: this.playerData, spawn: this.spawnPoint,
      allies: this.allies.filter(a => !a.dead).map(a => a.serialize()),
      vehicles: this.vehicles.map(v => v.serialize()),
      dogs: this.animals.filter(a => a.owner && !a.dead).map(a => ({ x: +a.x.toFixed(2), y: +a.y.toFixed(2), owner: a.owner, mode: a.mode, hp: Math.round(a.hp) })),
      clans: this.clans || [], quest: this.quest, stats: this.stats, evacDay: this.evacDay, endless: this.endless, nid: this._nid,
    };
  }
  save(auto, quiet) {
    if (!this.worldId || this.role === 'client') return false;
    const ok = TZ.Saves.save(this.worldId, this.serialize());
    if (!ok) this.msg('Не удалось сохранить мир!', 'bad');
    else if (auto && !quiet) this.msg('Автосохранение', 'hint');
    return ok;
  }
  loadSave(d) {
    this.world = TZ.World.load(d.world);
    this.meta = Object.assign(this.meta, d.meta || {}); this.diffKey = this.meta.diff || 'normal'; this.diff = TZ.DIFFICULTY[this.diffKey]; this.pvp = !!this.meta.pvp; this.story = this.meta.story !== false;
    this.minutes = d.minutes; this.day = d.day; this.quest = d.quest || this.quest; this.stats = Object.assign(this.stats, d.stats || {}); this.evacDay = d.evacDay || 0; this.endless = !!d.endless; this._nid = d.nid || 1;
    this.spawnPoint = d.spawn || { x: 70.5, y: 74.5 };
    this.playerData = d.playerData || {};
    this.clans = (d.clans || []).filter(c => c && c.members && c.members.length);
    const pd = this.playerData[this.me.uid];
    if (pd) { this.me.load(pd); this.me.look = TZ.Account.active().look || this.me.look; } else { this.me.x = this.spawnPoint.x; this.me.y = this.spawnPoint.y; }
    // pre-generate around the player so saved entities have ground
    for (let dy = -VIEW_CHUNKS; dy <= VIEW_CHUNKS; dy++) for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++) this.world.chunk(Math.floor(this.me.x / CH) + dx, Math.floor(this.me.y / CH) + dy);
    this.world.pending.length = 0;
    for (const a of d.allies || []) { const def = TZ.Chars.survivorDef(a.sid); const al = new TZ.Ally(this, def, a.x, a.y, a.sid); Object.assign(al, a); this.allies.push(al); }
    for (const v of d.vehicles || []) this.vehicles.push(TZ.Vehicle.load(this, v));
    for (const g of d.dogs || []) { const a = new TZ.Animal(this, 'dog', g.x, g.y); Object.assign(a, { owner: g.owner, mode: g.mode || 'follow', hp: g.hp || a.maxHp }); this.animals.push(a); }
  }
}
const diffCost = (cost, rest) => { const o = {}; for (const k in cost) { const n = cost[k] - (rest[k] || 0); if (n > 0) o[k] = n; } return o; };
TZ.BUILD_ORDER2 = () => Object.keys(TZ.BUILD);
TZ.Game = Game;
})();
