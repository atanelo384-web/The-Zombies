// =====================================================================
//  THE ZOMBIES 2.0 — multiplayer networking
//  Host-authoritative. Transports share one interface:
//   host:   onJoin(cid, hello) onMsg(cid, data) onLeave(cid) send(cid, data) close()
//   client: onMsg(data) onClose(reason) send(data) close()
// =====================================================================
'use strict';
(() => {
const N = TZ.Net = {};
const PORT = 27015;
N.PORT = PORT;
const ZT = Object.keys(TZ.ZOMBIES);

// ---------------------------------------------------------------- BroadcastChannel transport (browser tabs)
class BCHost {
  constructor(info) {
    this.sid = 's' + Math.random().toString(36).slice(2, 8); this.info = info; this.ch = new BroadcastChannel('tz2-lan'); this.clients = new Set();
    this.ch.onmessage = (e) => { const m = e.data; if (!m || m.sid !== this.sid && m.k !== 'scan') return;
      if (m.k === 'scan') this.beacon();
      else if (m.k === 'hello') { this.clients.add(m.cid); this.onJoin && this.onJoin(m.cid, m.d); }
      else if (m.k === 'toHost' && this.clients.has(m.cid)) this.onMsg && this.onMsg(m.cid, m.d);
      else if (m.k === 'bye' && this.clients.has(m.cid)) { this.clients.delete(m.cid); this.onLeave && this.onLeave(m.cid); } };
    this.bt = setInterval(() => this.beacon(), 1500); this.beacon();
    window.addEventListener('beforeunload', () => this.close());
  }
  beacon() { this.ch.postMessage({ k: 'beacon', sid: this.sid, info: this.info }); }
  send(cid, d) { this.ch.postMessage({ k: 'toClient', sid: this.sid, cid, d }); }
  kick(cid) { this.ch.postMessage({ k: 'kick', sid: this.sid, cid }); this.clients.delete(cid); }
  close() { clearInterval(this.bt); try { this.ch.postMessage({ k: 'down', sid: this.sid }); this.ch.close(); } catch (e) { } }
  get address() { return 'вкладки этого браузера'; }
}
class BCClient {
  constructor(sid, hello) {
    this.sid = sid; this.cid = 'b' + Math.random().toString(36).slice(2, 8); this.ch = new BroadcastChannel('tz2-lan');
    this.ch.onmessage = (e) => { const m = e.data; if (!m || m.sid !== this.sid) return;
      if (m.k === 'toClient' && m.cid === this.cid) this.onMsg && this.onMsg(m.d);
      else if (m.k === 'down' || (m.k === 'kick' && m.cid === this.cid)) { this.onClose && this.onClose(m.k === 'kick' ? 'Вас отключили от сервера' : 'Сервер закрыт'); this.close(); } };
    setTimeout(() => this.ch.postMessage({ k: 'hello', sid, cid: this.cid, d: hello }), 50);
    window.addEventListener('beforeunload', () => this.close());
  }
  send(d) { if (this.ch) this.ch.postMessage({ k: 'toHost', sid: this.sid, cid: this.cid, d }); }
  close() { if (!this.ch) return; try { this.ch.postMessage({ k: 'bye', sid: this.sid, cid: this.cid }); this.ch.close(); } catch (e) { } this.ch = null; }
}
N.scanTabs = (ms = 900) => new Promise(res => {
  const found = new Map(); let ch; try { ch = new BroadcastChannel('tz2-lan'); } catch (e) { return res([]); }
  ch.onmessage = (e) => { const m = e.data; if (m && m.k === 'beacon') found.set(m.sid, Object.assign({ sid: m.sid, via: 'tab' }, m.info)); };
  ch.postMessage({ k: 'scan' });
  setTimeout(() => { ch.close(); res([...found.values()]); }, ms);
});

// ---------------------------------------------------------------- WebSocket transport (Electron relay server)
class WSHost {
  constructor(url, key) {
    this.ws = new WebSocket(url + '/?role=host' + (key ? '&key=' + encodeURIComponent(key) : ''));
    this.ready = new Promise((res, rej) => {
      this._res = res; this._rej = rej;
      this.ws.onerror = () => rej(new Error('Не удалось подключиться к серверу'));
      setTimeout(() => rej(new Error('Сервер не отвечает')), 6000);
    });
    this.ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.sys === 'ok') { this._res(); return; }
      if (m.sys === 'denied') { this._rej(new Error(m.why || 'Нет доступа')); return; }
      if (m.sys === 'join') this.onJoin && this.onJoin(m.id, m.d);
      else if (m.sys === 'leave') this.onLeave && this.onLeave(m.id);
      else if (m.from) this.onMsg && this.onMsg(m.from, m.d); };
    this.ws.onclose = () => { this._rej(new Error('Соединение закрыто')); this.onDown && this.onDown(); };
  }
  send(cid, d) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ to: cid, d })); }
  info(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ info: o })); }
  kick(cid) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ kick: cid })); }
  close() { this.onDown = null; try { this.ws.close(); } catch (e) { } }
}
class WSClient {
  constructor(url, hello) {
    this.ws = new WebSocket(url + '/?role=client');
    this.ws.onopen = () => this.send({ t: 'hello', d: hello });
    this.ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (m.sys === 'hostgone') { this.onClose && this.onClose('Сервер закрыт'); return; } this.onMsg && this.onMsg(m); };
    this.ws.onclose = () => { this.onClose && this.onClose('Соединение потеряно'); this.onClose = null; };
    this.ws.onerror = () => { this.onClose && this.onClose('Не удалось подключиться к серверу'); this.onClose = null; };
  }
  send(d) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(d)); }
  close() { this.onClose = null; try { this.ws.close(); } catch (e) { } }
}

// ---------------------------------------------------------------- online relay (our server): play with anyone, anywhere
// One WebSocket per player. The server tells whether you host the world or join it.
class RelayHost {
  constructor(ws, first) {
    this.ws = ws; this.room = first.room; this.code = first.code; this.access = first.access; this.isPublic = String(first.room).startsWith('s'); this.cfg = first.cfg || null;
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.sys === 'join') this.onJoin && this.onJoin(m.id, m.d);
      else if (m.sys === 'leave') { if (m.cheat && TZ.game) TZ.game.ev('sys', TZ.t('Античит выгнал игрока') + ': ' + m.cheat, 'bad'); this.onLeave && this.onLeave(m.id); }
      else if (m.sys === 'cfg') { this.cfg = m.cfg; this.onCfg && this.onCfg(m.cfg); }
      else if (m.sys === 'clans') this.onClans && this.onClans(m.players);
      else if (m.sys === 'closed') { this.closedWhy = m.why; }
      else if (m.from) this.onMsg && this.onMsg(m.from, m.d); };
    ws.onclose = () => { this.onDown && this.onDown(this.closedWhy || TZ.t('Соединение с сервером потеряно')); };
  }
  sendRaw(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  send(cid, d) { this.sendRaw({ to: cid, d }); }
  info(o) { this.sendRaw({ info: o }); }
  kick(cid, why) { this.sendRaw({ kick: cid, why }); }
  pvp(w, l) { this.sendRaw({ pvp: { w, l } }); }
  report(cid, why) { this.sendRaw({ report: { id: cid, why } }); }
  saveWorld(str) { this.sendRaw({ save: str }); }
  close() { this.onDown = null; try { this.ws.close(); } catch (e) { } }
}
class RelayClient {
  constructor(ws, hello) {
    this.ws = ws;
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.sys === 'hostgone') { this.migrate = !!m.migrate; this.fire(m.migrate ? TZ.t('Хост вышел. Переподключаемся…') : TZ.t('Хост закрыл мир')); return; }
      if (m.sys === 'kicked') { this.fire(m.why || TZ.t('Вас выгнали')); return; }
      if (m.sys) return;
      this.onMsg && this.onMsg(m); };
    ws.onclose = () => this.fire(TZ.t('Соединение потеряно'));
    this.send({ t: 'hello', d: hello });
  }
  fire(why) { const f = this.onClose; this.onClose = null; if (f) f(why, this.migrate); }
  send(d) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(d)); }
  close() { this.onClose = null; try { this.ws.close(); } catch (e) { } }
}
// open a relay socket. role 'host' (new private room) or a room id ('s12' public server, or a friend's room)
N.relayOpen = (params) => new Promise((resolve, reject) => {
  if (!TZ.Online.token) return reject(new Error(TZ.t('Войдите в аккаунт')));
  const qs = new URLSearchParams(params).toString();
  let ws; try { ws = new WebSocket(TZ.Online.wsBase() + '/relay?' + qs, ['tz', TZ.Online.token]); } catch (e) { return reject(e); }
  let done = false;
  const to = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (e) { } reject(new Error(TZ.t('Сервер не отвечает'))); } }, 10000);
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (done) return;
    if (m.sys === 'ok') { done = true; clearTimeout(to); resolve({ ws, first: m }); }
    else if (m.sys === 'denied') { done = true; clearTimeout(to); try { ws.close(); } catch (er) { } reject(new Error(m.why)); } };
  ws.onerror = () => { if (!done) { done = true; clearTimeout(to); reject(new Error(TZ.t('Не удалось подключиться к серверу'))); } };
  ws.onclose = (e) => { if (!done) { done = true; clearTimeout(to); reject(new Error(e.code === 1006 ? TZ.t('Нет доступа. Подтвердите почту или проверьте интернет.') : TZ.t('Соединение закрыто'))); } };
});
N.relayHost = async (G, opts) => {
  const { ws, first } = await N.relayOpen({ role: 'host', access: opts.access || 'friends', max: opts.max || 8, pvp: opts.pvp ? 1 : 0, name: opts.name || '' });
  const tr = new RelayHost(ws, first);
  return new HostNet(G, tr, { name: opts.name, max: opts.max || 8, pvp: !!opts.pvp });
};
// join a room as a client, or become the host of a public server nobody hosts yet
N.relayJoin = async (room, code) => {
  const { ws, first } = await N.relayOpen(Object.assign({ room }, code ? { code } : {}));
  if (first.host) return { host: true, tr: new RelayHost(ws, first), first };
  const hello = { ver: TZ.VERSION, profile: TZ.Account.profile() };
  const tr = new RelayClient(ws, hello);
  return new Promise((resolve, reject) => {
    const cn = new ClientNet(tr); let ok = false;
    const to = setTimeout(() => { if (!ok) { ok = true; tr.close(); reject(new Error(TZ.t('Хост не отвечает'))); } }, 12000);
    tr.onMsg = (m) => {
      if (!ok) {
        if (m.t === 'welcome') { ok = true; clearTimeout(to); resolve({ host: false, net: cn, welcome: m.d, first }); return; }
        if (m.t === 'deny') { ok = true; clearTimeout(to); tr.close(); reject(new Error(TZ.t(m.d.why))); return; }
        return;
      }
      cn.handle(m);
    };
    tr.onClose = (why, migrate) => { if (!ok) { ok = true; clearTimeout(to); reject(new Error(why)); } else if (cn.G) { if (migrate && TZ.app.migrate) TZ.app.migrate(room); else cn.G.ui.disconnected(why); } };
  });
};

// ---------------------------------------------------------------- host logic
TZ.HostNet = null;
class HostNet {
  constructor(G, transport, info) {
    this.G = G; this.tr = transport; this.info = info; this.clients = new Map(); // cid -> {pid, player, profile, ping}
    this.snapT = 0; this.plistT = 0; this.maxPlayers = info.max || 8;
    transport.onJoin = (cid, hello) => this.join(cid, hello);
    transport.onMsg = (cid, d) => this.msg(cid, d);
    transport.onLeave = (cid) => this.leave(cid);
    G.me.profile = TZ.Account.profile();
    transport.onClans = (list) => { for (const e of list) { for (const p of G.players.values()) if (p.uid === e.id) { if (p === G.me) { if (TZ.Online.me) TZ.Online.me.clan = e.clan; p.profile = TZ.Account.profile(); } else if (p.profile) p.profile.clan = e.clan; } for (const c of this.clients.values()) if (c.profile.uid === e.id) c.profile.clan = e.clan; } this.sendPlist(); G.syncClans && G.syncClans(); };
  }
  kickPid(pid) { for (const [cid, c] of this.clients) if (c.pid === pid) { this.tr.kick(cid, TZ.t('Хост выгнал вас')); this.leave(cid); } }
  get address() { return this.tr.address || ''; }
  join(cid, hello) {
    const G = this.G;
    if (hello && hello.t === 'hello') hello = hello.d;
    if (!hello || !hello.profile) return;
    if (this.clients.has(cid)) return;
    if (this.clients.size + 1 >= this.maxPlayers) { this.tr.send(cid, { t: 'deny', d: { why: 'Сервер заполнен' } }); return; }
    if (hello.ver !== TZ.VERSION) { this.tr.send(cid, { t: 'deny', d: { why: `Другая версия игры (сервер ${TZ.VERSION}, у вас ${hello.ver})` } }); return; }
    const prof = hello.profile;
    if ([...G.players.values()].some(p => p.uid === prof.uid)) { this.tr.send(cid, { t: 'deny', d: { why: 'Этот аккаунт уже на сервере. Создайте другой аккаунт в меню профиля.' } }); return; }
    const pid = 'c' + cid;
    const p = new TZ.Player(pid, prof.uid, prof.name); p.remote = true; p.profile = prof; p.look = prof.look;
    const pd = G.playerData[prof.uid];
    const sp = (pd && pd.spawn) || G.spawnPoint;
    if (pd) { p.x = pd.x; p.y = pd.y; } else { p.x = sp.x + (Math.random() - .5) * 2; p.y = sp.y + (Math.random() - .5) * 2; }
    p.nx = p.x; p.ny = p.y; p.spawn = pd && pd.spawn;
    G.players.set(pid, p);
    this.clients.set(cid, { pid, player: p, profile: prof, ping: 0 });
    this.tr.send(cid, { t: 'welcome', d: { pid, seed: G.world.seed, off: G.world.biomeOffset, minutes: G.minutes, day: G.day, diff: G.diffKey, pvp: G.pvp, name: this.info.name, spawn: G.spawnPoint, player: pd || null } });
    G.ev('sys', `${prof.name} подключился к серверу${prof.dev === 'phone' ? ' (с телефона)' : ''}`, 'good');
    // cross-play: PC and phone players on one server
    const devs = new Set([G.me.profile && G.me.profile.dev || (TZ.isTouch ? 'phone' : 'pc'), ...[...this.clients.values()].map(c => c.profile.dev || 'pc')]);
    if (devs.size > 1) for (const p2 of G.players.values()) G.toPlayer(p2.pid, 'stat', { k: 'crossplay', n: 1 });
    this.sendPlist();
    TZ.Account.stat('mpGames', this._mpCounted ? 0 : 1); this._mpCounted = true;
    if (window.tzNative && window.tzNative.server) window.tzNative.server.update({ players: this.clients.size + 1 });
    this.info.players = this.clients.size + 1;
  }
  leave(cid) {
    const c = this.clients.get(cid); if (!c) return;
    const G = this.G; this.clients.delete(cid);
    const p = c.player;
    if (p.vehicle) G.vehExit(p);
    G.playerData[p.uid] = Object.assign(G.playerData[p.uid] || {}, { x: p.x, y: p.y });
    G.players.delete(c.pid); G.flows.delete(c.pid);
    G.ev('sys', `${c.profile.name} вышел с сервера`, 'warn');
    this.sendPlist();
    this.info.players = this.clients.size + 1;
    if (window.tzNative && window.tzNative.server) window.tzNative.server.update({ players: this.clients.size + 1 });
  }
  kick(pid) { for (const [cid, c] of this.clients) if (c.pid === pid) { this.tr.kick(cid); this.leave(cid); } }
  msg(cid, d) {
    const c = this.clients.get(cid); if (!c || !d) return;
    const G = this.G, p = c.player;
    switch (d.t) {
      case 'st': p.applyNet(d.d); if (d.d.ping != null) c.ping = d.d.ping; break;
      case 'act': try { G.doAct(c.pid, d.d.t, d.d.d || {}); } catch (e) { console.error('act', d.d.t, e); } break;
      case 'reqChunk': { const W = G.world; W.chunk(d.d.cx, d.d.cy); this.tr.send(cid, { t: 'chunk', d: { cx: d.d.cx, cy: d.d.cy, mods: W.chunkMods(d.d.cx, d.d.cy).map(([i, o]) => [i, o ? G.netObj(o) : 0]), roofs: W.roofChunkMods(d.d.cx, d.d.cy) } }); break; }
      case 'save': G.playerData[p.uid] = d.d; if (d.d.spawn) p.spawn = d.d.spawn; break;
      case 'profile': c.profile = d.d; p.profile = d.d; p.name = d.d.name; p.look = d.d.look; this.sendPlist(); break;
      case 'ping': this.tr.send(cid, { t: 'pong', d: d.d }); break;
      // voice chat signalling: deliver to the host itself or forward to the addressed player
      case 'vsig': if (!d.d) break; if (d.d.to === G.me.pid) TZ.Voice.onSignal(c.pid, d.d.data); else G.toPlayer(d.d.to, 'vsig', { from: c.pid, data: d.d.data }); break;
      case 'vstate': if (!d.d) break; for (const q of G.players.values()) if (q !== p) G.toPlayer(q.pid, 'vstate', { from: c.pid, talk: d.d.talk, radio: d.d.radio }); break;
    }
  }
  send(pid, type, data) { for (const [cid, c] of this.clients) if (c.pid === pid) { this.tr.send(cid, { t: 'p', d: { t: type, d: data } }); return; } }
  broadcast(type, data) { for (const cid of this.clients.keys()) this.tr.send(cid, { t: type, d: data }); }
  sendPlist() {
    const G = this.G, list = [{ pid: G.me.pid, host: true, profile: TZ.Account.profile(), ping: 0 }];
    for (const c of this.clients.values()) list.push({ pid: c.pid, profile: c.profile, ping: c.ping });
    G.plist = list;
    this.broadcast('plist', list);
    if (G.clanTouchNames) G.clanTouchNames(); this.broadcast('clans', G.clans || []);
  }
  elo(winPid, losePid) { // rating for PvP is counted by the online server (only for players really in this world)
    const cid = (pid) => pid === this.G.me.pid ? 'h' : ([...this.clients].find(([k, c]) => c.pid === pid) || [])[0];
    const w = cid(winPid), l = cid(losePid); if (w && l && this.tr.pvp) this.tr.pvp(w, l);
  }
  tick(dt) {
    const G = this.G;
    this.snapT -= dt; this.plistT -= dt;
    if (this.plistT <= 0) { this.plistT = 5; this.sendPlist(); }
    if (this.snapT > 0) { if (G.evq.length > 400) G.evq.length = 0; return; }
    this.snapT = 1 / 12;
    const ev = G.evq; G.evq = [];
    if (!this.clients.size) return;
    const R2 = 48 * 48;
    for (const [cid, c] of this.clients) {
      const p = c.player, x = p.x, y = p.y;
      const near = e => dist2(e.x, e.y, x, y) < R2;
      const z = [], a = [], an = [], v = [], pl = [], pk = [], pr = [];
      for (const q of G.zombies) if (near(q)) z.push([q.id, ZT.indexOf(q.type), q.v * 8 + q.biome, +q.x.toFixed(2), +q.y.toFixed(2), +q.ang.toFixed(2), (q.dead ? 1 : 0) | (q.atkT > 0 ? 2 : 0) | (q.hitT > 0 ? 4 : 0) | (q.burn > 0 ? 8 : 0) | (q.moving ? 16 : 0), Math.round(q.hp / q.maxHp * 100)]);
      for (const q of G.allies) if (!q.dead && near(q)) a.push([q.id, q.sid, +q.x.toFixed(2), +q.y.toFixed(2), +q.ang.toFixed(2), (q.moving ? 1 : 0) | (q.flash > 0 ? 2 : 0) | (q.inCar ? 4 : 0) | (q.hurtT > 0 ? 8 : 0), Math.round(q.hp), q.owner || 0, q.mode[0], Math.round(q.food ?? 80), Math.round(q.water ?? 80), q.task ? q.taskLbl : 0]);
      for (const q of G.animals) if (near(q)) an.push([q.id, q.ak, +q.x.toFixed(2), +q.y.toFixed(2), +q.ang.toFixed(2), (q.dead ? 1 : 0) | (q.moving ? 2 : 0) | (q.running ? 4 : 0) | (q.atkT > 0 ? 8 : 0) | (q.hitT > 0 ? 16 : 0) | (q.looted ? 32 : 0), Math.round(q.hp / q.maxHp * 100), q.owner || 0, q.mode === 'stay' ? 1 : 0]);
      for (const q of G.vehicles) if (dist2(q.x, q.y, x, y) < 80 * 80) v.push(q.net());
      for (const q of G.players.values()) if (q !== p) pl.push([q.pid, q.name, q.netState ? q.netState() : null]);
      for (const q of G.pickups) if (near(q)) pk.push([q.id, q.item, q.n, +q.x.toFixed(2), +q.y.toFixed(2)]);
      for (const q of G.combat.proj) pr.push([q.id, q.kind, +q.x.toFixed(2), +q.y.toFixed(2), +(q.z || 0).toFixed(1), q.landed ? 1 : 0]);
      const fires = G.combat.fires.map(f => [+f.x.toFixed(2), +f.y.toFixed(2), +f.life.toFixed(1)]);
      const snap = { tm: +G.minutes.toFixed(1), dy: G.day, wr: +G.weather.rain.toFixed(2), z, a, an, v, p: pl, pk, pr, f: fires, ev, hl: G.heli ? [G.heli.x, G.heli.y, G.heli.phase, +G.heli.t.toFixed(1)] : 0, dr: G.dropAt ? [G.dropAt.x, G.dropAt.y] : 0, q: G.curQuest ? { text: G.curQuest.text, hint: G.curQuest.hint } : null, hd: G.horde ? 1 : 0, ed: G.evacDay };
      this.tr.send(cid, { t: 'snap', d: snap });
    }
  }
  close() { this.broadcast('down', {}); try { this.tr.close(); } catch (e) { } if (window.tzNative && window.tzNative.server) window.tzNative.server.stop(); }
}

// ---------------------------------------------------------------- client logic
class ClientNet {
  constructor(transport) {
    this.tr = transport; this.G = null; this.stT = 0; this.saveT = 8; this.pingT = 0; this.ping = 0;
    this.ghostZ = new Map(); this.ghostA = new Map(); this.ghostAn = new Map(); this.vmap = new Map(); this.pending = [];
  }
  attach(G) { this.G = G; for (const m of this.pending) this.handle(m); this.pending = []; this.send('profile', TZ.Account.profile()); }
  send(type, d) { this.tr.send({ t: type, d }); }
  broadcast() { }
  elo() { }
  handle(m) {
    const G = this.G; if (!G) { this.pending.push(m); return; }
    const d = m.d;
    switch (m.t) {
      case 'snap': this.applySnap(d); break;
      case 'obj': { const W = G.world; const c = W.chunkIf(Math.floor(d.x / TZ.CH), Math.floor(d.y / TZ.CH)); if (c) { const old = W.get(d.x, d.y); if (old) G.structures.delete(old); const o = d.o ? Object.assign({}, d.o) : null; c.obj[(d.y - c.y0) * TZ.CH + (d.x - c.x0)] = o; c.ver++; W.version++; if (o && TZ.BUILD[o.t]) G.structures.add(o); W.recordMod(d.x, d.y, o); } break; }
      case 'chunk': G.world.applyChunkMods(d.cx, d.cy, d.mods); G.world.applyRoofMods(d.cx, d.cy, d.roofs); break;
      case 'p': G.onPersonal(d.t, d.d); break;
      case 'clans': G.clans = d || []; G.syncClans(); break;
      case 'plist': G.plist = d; for (const e of d) { const p = G.players.get(e.pid); if (p) { p.profile = e.profile; p.name = e.profile.name; } } break;
      case 'music': TZ.audio.setMusic(d.m); break;
      case 'victory': setTimeout(() => G.ui.showVictory(), 3500); G.won = true; break;
      case 'pong': this.ping = Math.round(performance.now() - d.t); break;
      case 'down': G.ui.disconnected('Сервер закрыт'); break;
    }
  }
  applySnap(s) {
    const G = this.G;
    G.minutes = s.tm; G.day = s.dy; G.weather.rain = s.wr; G.evacDay = s.ed;
    if (s.q) G.curQuest = s.q;
    G.horde = s.hd ? (G.horde || {}) : null;
    G.dropAt = s.dr ? { x: s.dr[0], y: s.dr[1] } : null;
    if (s.hl) { if (!G.heli) G.heli = { t: 0 }; Object.assign(G.heli, { x: s.hl[0], y: s.hl[1], phase: s.hl[2], t: s.hl[3] }); } else G.heli = null;
    // zombies
    const seenZ = new Set();
    for (const q of s.z) {
      let g = this.ghostZ.get(q[0]);
      if (!g) { g = new TZ.Ghost('zombie', q[0]); g.type = ZT[q[1]]; g.T = TZ.ZOMBIES[g.type]; g.v = q[2] >> 3; g.biome = q[2] & 7; g.x = q[3]; g.y = q[4]; g.r = g.T.r; Object.defineProperty(g, 'spr', { get() { return TZ.Chars.zombieSet(this.type, this.v, this.biome); } }); this.ghostZ.set(q[0], g); }
      g.nx = q[3]; g.ny = q[4]; g.ang = q[5]; const f = q[6];
      if ((f & 1) && !g.dead) { g.dead = true; g.deadT = 0; }
      if (f & 2) g.atkT = 0.3; if (f & 4) g.hitT = 0.09; g.burn = f & 8 ? 1 : 0; g.state = f & 16 ? 'hunt' : 'wander'; g.walking = !!(f & 16);
      g.hp = q[7]; g.maxHp = 100;
      seenZ.add(q[0]);
    }
    for (const id of [...this.ghostZ.keys()]) if (!seenZ.has(id)) this.ghostZ.delete(id);
    G.zombies = [...this.ghostZ.values()];
    // allies
    const seenA = new Set();
    for (const q of s.a) {
      let g = this.ghostA.get(q[0]);
      if (!g) { g = new TZ.Ghost('ally', q[0]); g.sid = q[1]; g.def = TZ.Chars.survivorDef(q[1]); Object.assign(g, { name: g.def.name, role: g.def.role, weapon: g.def.weapon, female: g.def.female }); g.x = q[2]; g.y = q[3]; g.maxHp = 100; Object.defineProperty(g, 'spr', { get() { return TZ.Chars.survivorSet(this.def); } }); this.ghostA.set(q[0], g); }
      g.nx = q[2]; g.ny = q[3]; g.ang = q[4]; g.moving = !!(q[5] & 1); if (q[5] & 2) { g.flash = 0.06; g.recoil = 2; } g.inCar = q[5] & 4 ? 1 : 0; if (q[5] & 8) g.hurtT = 0.2;
      g.hp = q[6]; g.owner = q[7] || null; g.mode = q[8] === 'f' ? 'follow' : 'guard'; g.food = q[9]; g.water = q[10]; g.task = q[11] || null; g.taskLbl = q[11] || '';
      seenA.add(q[0]);
    }
    for (const id of [...this.ghostA.keys()]) if (!seenA.has(id)) this.ghostA.delete(id);
    G.allies = [...this.ghostA.values()];
    // animals
    const seenAn = new Set();
    for (const q of s.an) {
      let g = this.ghostAn.get(q[0]);
      if (!g) { g = new TZ.Ghost('animal', q[0]); g.ak = q[1]; g.T = TZ.ANIMALS[g.ak]; g.r = g.T.r; g.x = q[2]; g.y = q[3]; Object.defineProperty(g, 'spr', { get() { return TZ.Chars.animalSet(this.ak); } }); this.ghostAn.set(q[0], g); }
      g.nx = q[2]; g.ny = q[3]; g.ang = q[4]; const f = q[5];
      if ((f & 1) && !g.dead) { g.dead = true; g.deadT = 0; }
      g.running = !!(f & 4); if (f & 8) g.atkT = 0.3; if (f & 16) g.hitT = 0.1; g.looted = !!(f & 32); g.hp = q[6]; g.maxHp = 100; g.owner = q[7] || 0; g.mode = q[8] ? 'stay' : 'follow';
      seenAn.add(q[0]);
    }
    for (const id of [...this.ghostAn.keys()]) if (!seenAn.has(id)) this.ghostAn.delete(id);
    G.animals = [...this.ghostAn.values()];
    // vehicles
    const seenV = new Set();
    for (const q of s.v) {
      let v = this.vmap.get(q[0]);
      if (!v) { v = new TZ.Vehicle(G, q[1], q[2], q[3], q[4], 'new', q[0]); v._init = 1; this.vmap.set(q[0], v); }
      const mine = v.seats[0] === G.me.pid && q[11][0] === G.me.pid;
      v.applyNet(q, mine);
      seenV.add(q[0]);
    }
    for (const id of [...this.vmap.keys()]) if (!seenV.has(id) && id !== G.me.vehicle) this.vmap.delete(id);
    G.vehicles = [...this.vmap.values()];
    // players
    const seenP = new Set([G.me.pid]);
    for (const [pid, name, st] of s.p) {
      if (!st) continue;
      let p = G.players.get(pid);
      if (!p) { p = new TZ.Player(pid, null, name); p.remote = true; G.players.set(pid, p); }
      p.name = name; p.applyNet(st); seenP.add(pid);
      const e = (G.plist || []).find(e => e.pid === pid); if (e) { p.uid = e.profile.uid; p.profile = e.profile; }
    }
    for (const pid of [...G.players.keys()]) if (!seenP.has(pid)) G.players.delete(pid);
    // pickups / projectiles / fires
    G.pickups = s.pk.map(q => ({ id: q[0], item: q[1], n: q[2], x: q[3], y: q[4], t: 1 }));
    G.combat.proj = s.pr.map(q => ({ id: q[0], kind: q[1], x: q[2], y: q[3], z: q[4], landed: !!q[5], rot: performance.now() / 50 }));
    G.combat.fires = s.f.map(q => ({ x: q[0], y: q[1], life: q[2], r: 1.9, max: 7 }));
    for (const e of s.ev) G.applyEv(e);
  }
  tick(dt) {
    const G = this.G; if (!G) return;
    this.stT -= dt; this.saveT -= dt; this.pingT -= dt;
    if (this.stT <= 0) {
      this.stT = 1 / 15;
      const st = G.me.netState(); st.ping = this.ping;
      this.send('st', st);
      const v = G.me.vehicle && G.vehicles.find(v => v.id === G.me.vehicle);
      if (v && v.seats[0] === G.me.pid) { this.send('act', { t: 'drive', d: { id: v.id, x: +v.x.toFixed(2), y: +v.y.toFixed(2), a: +v.a.toFixed(3), v: +v.v.toFixed(2), s: +v.steer.toFixed(2), fu: +v.fuel.toFixed(2), dm: +v.dmgAcc.toFixed(2), km: v.km, h: v.honk } }); v.dmgAcc = 0; }
    }
    if (this.saveT <= 0) { this.saveT = 8; this.send('save', G.me.serialize()); }
    if (this.pingT <= 0) { this.pingT = 2; this.send('ping', { t: performance.now() }); }
  }
  close() { try { this.send('save', this.G.me.serialize()); } catch (e) { } this.tr.close(); }
}

// ---------------------------------------------------------------- public API
// start hosting. info: {name, max, pvp}. returns HostNet (attach game later via setGame)
N.host = async (G, info) => {
  let tr;
  if (window.tzNative && window.tzNative.server) {
    const res = await window.tzNative.server.start({ port: info.port || PORT, name: info.name, max: info.max, ver: TZ.VERSION });
    if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Не удалось запустить сервер');
    tr = new WSHost('ws://127.0.0.1:' + res.port, res.key);
    await tr.ready;
    tr.ips = res.ips || []; tr.port = res.port;
    tr.address = tr.ips.map(ip => ip + ':' + res.port).join(', ');
  } else if (N.served && N.served.open) {
    // this page was opened from a dedicated server that has no host yet: become the host
    tr = new WSHost(N.wsBase(), '');
    await tr.ready;
    tr.info({ name: info.name, max: info.max, ver: TZ.VERSION });
    tr.ips = (N.served.ips && N.served.ips.length ? N.served.ips : [location.hostname]); tr.port = +(location.port || 80);
    tr.address = location.host;
  } else tr = new BCHost(Object.assign({ ver: TZ.VERSION, players: 1 }, info));
  const h = new HostNet(G, tr, info);
  return h;
};
// links other devices can open to join (only for real network servers)
N.inviteLinks = (net) => { const tr = net && net.tr; if (!tr || !tr.port) return []; return (tr.ips || []).map(ip => `http://${ip}${tr.port === 80 ? '' : ':' + tr.port}`); };
N.wsBase = () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
// was this page served by a The Zombies server? (phone opened http://<pc>:27015)
N.served = null;
N.detect = async () => {
  if (!/^https?:$/.test(location.protocol) || !location.port && !/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname) && location.hostname !== 'localhost') return null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch('/tz-info', { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
    const j = await r.json(); if (j && j.tz === 2) { N.served = j; return j; }
  } catch (e) { }
  return null;
};
// probe a list of hosts over HTTP (works from phones / browsers where UDP is not available)
N.probe = async (hosts, port = PORT, ms = 900) => {
  const out = [];
  await Promise.all(hosts.map(async (h) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(`http://${h}:${port}/tz-info`, { cache: 'no-store', signal: ctl.signal, mode: 'cors' }); const j = await r.json(); if (j && j.tz === 2) out.push(Object.assign(j, { via: 'ws', addr: h + ':' + port })); } catch (e) { }
    clearTimeout(t);
  }));
  return out;
};
// slow sweep of the usual home-router subnets (Capacitor app / browsers without UDP)
N.sweep = async (onProgress) => {
  const nets = ['192.168.0', '192.168.1', '192.168.31', '192.168.88', '192.168.100', '192.168.43', '172.20.10', '10.0.0', '10.0.1', '192.168.2', '192.168.50', '192.168.8'];
  const found = [];
  for (let i = 0; i < nets.length; i++) {
    const hosts = []; for (let k = 1; k < 255; k++) hosts.push(nets[i] + '.' + k);
    for (let b = 0; b < hosts.length; b += 64) { const r = await N.probe(hosts.slice(b, b + 64), PORT, 700); found.push(...r); }
    onProgress && onProgress((i + 1) / nets.length, found);
  }
  return found;
};
// join: target = {via:'tab', sid} | {via:'ws', addr:'192.168.0.5:27015'}
N.join = (target) => new Promise((resolve, reject) => {
  const hello = { ver: TZ.VERSION, profile: TZ.Account.profile() };
  let tr;
  if (target.via === 'tab') tr = new BCClient(target.sid, hello);
  else { let a = target.addr.trim(); if (!a.includes(':')) a += ':' + PORT; tr = new WSClient('ws://' + a, hello); }
  const cn = new ClientNet(tr);
  let done = false;
  const to = setTimeout(() => { if (!done) { done = true; tr.close(); reject(new Error('Сервер не отвечает')); } }, 8000);
  tr.onMsg = (m) => {
    if (!done) {
      if (m.t === 'welcome') { done = true; clearTimeout(to); resolve({ net: cn, welcome: m.d }); return; }
      if (m.t === 'deny') { done = true; clearTimeout(to); tr.close(); reject(new Error(m.d.why)); return; }
      return;
    }
    cn.handle(m);
  };
  tr.onClose = (why) => { if (!done) { done = true; clearTimeout(to); reject(new Error(why)); } else if (cn.G) cn.G.ui.disconnected(why); };
});
N.scanLan = async () => {
  const out = [];
  if (N.served) { const s2 = await N.detect(); if (s2 && (s2.host || s2.open)) out.push(Object.assign({ via: 'ws', addr: location.host, here: true }, s2)); }
  if (window.tzNative && window.tzNative.lan) { try { const l = await window.tzNative.lan.scan(); for (const s of l) out.push(Object.assign({ via: 'ws' }, s)); } catch (e) { } }
  for (const s of await N.scanTabs()) out.push(s);
  return out;
};
TZ.HostNet = HostNet;
})();
