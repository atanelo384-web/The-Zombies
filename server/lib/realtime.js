'use strict';
// Realtime: notification socket (/ws) and game relay rooms (/relay).
// The relay forwards messages between the player who hosts a world and the
// players who joined it, from anywhere in the world, no extra software.
// Anti-cheat on the relay: identity comes from the server session (not from the
// game), message rate/size limits, speed / teleport / health checks on every
// player state, PvP results are accepted only for players really in the room.
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const U = require('./util');
const R = require('../../js/rules.js');

module.exports = function (ctx) {
  const { db, A, cfg } = ctx;
  const RT = {};
  const online = new Map();     // userId -> Set(ws)
  const rooms = new Map();      // roomId -> room
  const userRoom = new Map();   // userId -> roomId (where they play now)

  // ---------------------------------------------------------------- presence + push
  ctx.isOnline = (uid) => online.has(uid);
  ctx.playingOf = (uid) => { const r = rooms.get(userRoom.get(uid)); return r ? { room: r.id, name: r.info.name, pub: r.kind === 'public', players: r.count() } : null; };
  ctx.push = (uid, msg) => { const set = online.get(uid); if (!set) return; const s = JSON.stringify(msg); for (const ws of set) if (ws.readyState === 1) ws.send(s); };
  function presence(uid, on) {
    for (const f of db.all("SELECT b FROM friends WHERE a = ? AND status = 'accepted'", uid)) ctx.push(f.b, { t: 'presence', id: A.load(uid).pubid, online: on, playing: ctx.playingOf(uid) });
  }

  const authProto = (req) => {
    const p = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
    return p[0] === 'tz' && p[1] ? A.fromToken(p[1]) : null;
  };
  const wssNotify = new WebSocketServer({ noServer: true, maxPayload: 4096, handleProtocols: (ps) => ps.has('tz') ? 'tz' : false });
  wssNotify.on('connection', (ws, req, u) => {
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    let set = online.get(u.id); const first = !set; if (!set) online.set(u.id, set = new Set()); set.add(ws);
    if (first) presence(u.id, true);
    ws.send(JSON.stringify({ t: 'hello', id: u.pubid }));
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m && m.op === 'ping') ws.send('{"t":"pong"}'); });
    ws.on('close', () => { set.delete(ws); if (!set.size) { online.delete(u.id); presence(u.id, false); } });
  });

  // ---------------------------------------------------------------- rooms
  class Room {
    constructor(id, kind, host, opts) {
      this.id = id; this.kind = kind; this.host = null; this.hostUser = null; this.clients = new Map(); this.nextId = 1;
      this.access = opts.access || 'friends'; this.code = opts.code || ''; this.invited = new Set(); this.serverId = opts.serverId || 0;
      this.info = { name: opts.name || 'Мир', max: opts.max || 8, pvp: !!opts.pvp };
      this.created = Date.now(); this.lastSave = 0; this.pvpSeen = new Map();
    }
    count() { return this.clients.size + (this.host ? 1 : 0); }
    users() { const a = []; if (this.hostUser) a.push(this.hostUser); for (const c of this.clients.values()) a.push(c.user); return a; }
  }
  const sendj = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const srvRow = (id) => db.get('SELECT * FROM servers WHERE id = ?', id);
  const srvCfg = (s) => ({ serverId: s.id, name: s.name, pvp: !!s.pvp, max: s.max, diff: s.diff, seed: s.seed, tags: s.tags, descr: s.descr });
  // public server worlds live in the database (so the whole state is one backup)
  function loadWorld(sid) { try { const r = db.get('SELECT data FROM worlds WHERE sid = ?', sid); return r ? zlib.gunzipSync(Buffer.from(r.data)).toString('utf8') : null; } catch (e) { return null; } }
  function saveWorld(sid, str) { db.run('INSERT OR REPLACE INTO worlds (sid, data, updated) VALUES (?,?,?)', sid, zlib.gzipSync(str), Date.now()); ctx.dirty && ctx.dirty(); }
  RT.deleteWorld = (sid) => { db.run('DELETE FROM worlds WHERE sid = ?', sid); };

  function canJoin(room, u) {
    if (room.kind === 'public') {
      const s = srvRow(room.serverId); if (!s || s.paid_until < Date.now()) return 'Сервер выключен (не оплачен)';
      if (JSON.parse(s.bans || '[]').includes(u.pubid)) return 'Вы забанены на этом сервере';
      if (room.count() >= s.max) return 'Сервер заполнен';
      return null;
    }
    if (room.count() >= room.info.max) return 'Мир заполнен';
    if (room.invited.has(u.id)) return null;
    if (room.access === 'code' && room.code) return null; // code already checked by caller
    if (room.access === 'friends' && room.hostUser && ctx.S.isFriend(room.hostUser.uid, u.id)) return null;
    return 'Хост должен пригласить вас или добавить в друзья';
  }

  // ---------------------------------------------------------------- anti-cheat on player state
  const FOOT = 9.5, VEH = 48; // tiles per second, generous
  function checkState(room, c, d) {
    if (!d || typeof d !== 'object') return;
    const now = Date.now(), ac = c.ac;
    if (typeof d.x !== 'number' || typeof d.y !== 'number' || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return strike(room, c, 'bad state');
    if (d.d || ac.dead) { ac.grace = now + 6000; }
    ac.dead = !!d.d;
    if (typeof d.hp === 'number' && d.hp > 100 + 40 + 1) strike(room, c, 'здоровье ' + d.hp);
    if (ac.x == null || now < ac.grace) { ac.x = d.x; ac.y = d.y; ac.t = now; ac.wx = d.x; ac.wy = d.y; ac.wt = now; return; }
    const lim = d.v ? VEH : FOOT;
    // per-second window
    if (now - ac.wt >= 1000) {
      const dist = Math.hypot(d.x - ac.wx, d.y - ac.wy), sec = (now - ac.wt) / 1000;
      if (dist > lim * sec + 3) strike(room, c, (d.v ? 'скорость транспорта ' : 'скорость ') + (dist / sec).toFixed(1));
      ac.wx = d.x; ac.wy = d.y; ac.wt = now;
    }
    const jump = Math.hypot(d.x - ac.x, d.y - ac.y);
    if (jump > (d.v ? 30 : 14)) strike(room, c, 'телепорт ' + jump.toFixed(1));
    ac.x = d.x; ac.y = d.y; ac.t = now;
  }
  function strike(room, c, why) {
    const ac = c.ac, now = Date.now();
    ac.strikes = Math.max(0, (ac.strikes || 0) - (now - (ac.st || now)) / 10000) + 1; ac.st = now;
    if (ac.strikes >= 6 && !ac.kicked) {
      ac.kicked = true;
      db.run('INSERT INTO reports (user_id, by_id, kind, detail, created) VALUES (?,?,?,?,?)', c.user.uid, null, 'relay', why, now);
      db.run('UPDATE users SET sus = sus + 25 WHERE id = ?', c.user.uid);
      sendj(c.ws, { sys: 'kicked', why: 'Античит: ' + why });
      if (room.host) sendj(room.host, { sys: 'leave', id: c.id, cheat: why });
      setTimeout(() => { try { c.ws.close(4003, 'anticheat'); } catch (e) { } }, 100);
    }
  }
  function pvp(room, w, l) { // elo for a kill reported by the host, both players must be here
    const wu = w === 'h' ? room.hostUser : (room.clients.get(String(w)) || {}).user, lu = l === 'h' ? room.hostUser : (room.clients.get(String(l)) || {}).user;
    if (!wu || !lu || wu.uid === lu.uid || !room.info.pvp) return;
    const key = wu.uid + ':' + lu.uid, last = room.pvpSeen.get(key) || 0; if (Date.now() - last < 20000) return; room.pvpSeen.set(key, Date.now());
    const W = A.load(wu.uid), L = A.load(lu.uid); if (!W || !L) return;
    const E = 1 / (1 + Math.pow(10, (L.d.rn - W.d.rn) / 400)), k = Math.max(4, Math.round(32 * (1 - E)));
    A.addRn(W, k, 'победа над ' + L.name); W.d.stats.pvpKills = (W.d.stats.pvpKills || 0) + 1; A.grantAch(W, { ach: [] }); A.save(W);
    A.addRn(L, -k, 'поражение от ' + W.name); A.save(L);
    ctx.push(W.id, { t: 'me' }); ctx.push(L.id, { t: 'me' });
  }

  // ---------------------------------------------------------------- relay connections
  const wssRelay = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024, handleProtocols: (ps) => ps.has('tz') ? 'tz' : false });
  wssRelay.on('connection', (ws, req, u) => {
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    const url = new URL(req.url, 'http://x');
    const role = url.searchParams.get('role'), rid = String(url.searchParams.get('room') || '');
    const me = { uid: u.id, pub: u.pubid, name: u.name };
    let room;
    if (rid.startsWith('s')) { // public server: first player hosts, others join
      const sid = parseInt(rid.slice(1), 10), s = srvRow(sid);
      if (!s) { sendj(ws, { sys: 'denied', why: 'Сервер не найден' }); return ws.close(); }
      room = rooms.get('s' + sid);
      if (!room) { room = new Room('s' + sid, 'public', null, { serverId: sid, name: s.name, max: s.max, pvp: !!s.pvp }); rooms.set(room.id, room); }
      const why = canJoin(room, u); if (why) { sendj(ws, { sys: 'denied', why }); return ws.close(); }
      if (!room.host) return becomeHost(room, ws, me, { world: loadWorld(sid), cfg: srvCfg(s) });
      return joinClient(room, ws, me);
    }
    if (role === 'host') {
      if (userRoom.has(u.id)) { const old = rooms.get(userRoom.get(u.id)); if (old && old.host && old.hostUser.uid === u.id) closeRoom(old, 'Хост открыл другой мир'); }
      const id = U.token(6).replace(/[-_]/g, 'x');
      const access = ['friends', 'invite', 'code'].includes(url.searchParams.get('access')) ? url.searchParams.get('access') : 'friends';
      room = new Room(id, 'private', null, { access, code: String(Math.floor(100000 + Math.random() * 900000)), name: String(url.searchParams.get('name') || u.name + ' — мир').slice(0, 40), max: Math.max(2, Math.min(16, +url.searchParams.get('max') || 8)), pvp: url.searchParams.get('pvp') === '1' });
      rooms.set(id, room);
      return becomeHost(room, ws, me, {});
    }
    room = rooms.get(rid);
    if (!room || !room.host) { sendj(ws, { sys: 'denied', why: 'Мир закрыт или ещё не создан' }); return ws.close(); }
    if (room.access === 'code' && !room.invited.has(u.id) && !(room.hostUser && ctx.S.isFriend(room.hostUser.uid, u.id)) && url.searchParams.get('code') !== room.code) { sendj(ws, { sys: 'denied', why: 'Неверный код мира' }); return ws.close(); }
    const why = canJoin(room, u); if (why) { sendj(ws, { sys: 'denied', why }); return ws.close(); }
    joinClient(room, ws, me);
  });

  function becomeHost(room, ws, me, extra) {
    room.host = ws; room.hostUser = me; userRoom.set(me.uid, room.id);
    sendj(ws, Object.assign({ sys: 'ok', host: true, room: room.id, code: room.code, access: room.access, you: me.pub }, extra));
    const lim = { t: 400, at: Date.now() };
    ws.on('message', (raw) => {
      lim.t = Math.min(400, lim.t + (Date.now() - lim.at) / 1000 * 200); lim.at = Date.now(); if (lim.t < 1) return; lim.t--;
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.kick != null) { const c = room.clients.get(String(m.kick)); if (c) { sendj(c.ws, { sys: 'kicked', why: m.why ? String(m.why).slice(0, 100) : 'Хост выгнал вас' }); c.ws.close(); } return; }
      if (m.info) { if (typeof m.info.name === 'string' && room.kind === 'private') room.info.name = m.info.name.slice(0, 40); if (room.kind === 'private' && typeof m.info.pvp === 'boolean') room.info.pvp = m.info.pvp; return; }
      if (m.save != null && room.kind === 'public') { if (typeof m.save === 'string' && m.save.length < 8e6 && Date.now() - room.lastSave > 15000) { room.lastSave = Date.now(); try { saveWorld(room.serverId, m.save); } catch (e) { console.error('world save', e.message); } } return; }
      if (m.pvp) { pvp(room, m.pvp.w, m.pvp.l); return; }
      if (m.report) { const c = room.clients.get(String(m.report.id)); if (c) strike(room, c, 'хост: ' + String(m.report.why || '').slice(0, 60)); return; }
      if (m.invite) { RT.invite(me.uid, String(m.invite)); return; }
      if (m.to === '*') { const s = JSON.stringify(m.d); for (const c of room.clients.values()) if (c.ws.readyState === 1) c.ws.send(s); return; }
      const c = room.clients.get(String(m.to)); if (!c) return;
      if (m.d && m.d.t === 'p' && m.d.d && ['teleport', 'vehOut', 'respawn', 'vehIn'].includes(m.d.d.t)) c.ac.grace = Date.now() + 3000;
      if (m.d && m.d.t === 'welcome') c.ac.grace = Date.now() + 5000;
      sendj(c.ws, m.d);
    });
    ws.on('close', () => {
      if (room.host !== ws) return;
      room.host = null; userRoom.delete(me.uid);
      for (const c of room.clients.values()) { sendj(c.ws, { sys: 'hostgone', migrate: room.kind === 'public' }); c.ws.close(); }
      room.clients.clear();
      if (room.kind === 'private') rooms.delete(room.id);
      presence(me.uid, true);
    });
    presence(me.uid, true);
  }
  function joinClient(room, ws, me) {
    for (const c of room.clients.values()) if (c.user.uid === me.uid) { sendj(c.ws, { sys: 'kicked', why: 'Вы зашли с другого устройства' }); c.ws.close(); }
    if (room.hostUser && room.hostUser.uid === me.uid) { sendj(ws, { sys: 'denied', why: 'Вы уже хост этого мира' }); return ws.close(); }
    const id = String(room.nextId++), c = { id, ws, user: me, joined: false, ac: { grace: Date.now() + 8000 } };
    sendj(ws, { sys: 'ok', host: false, room: room.id, you: me.pub, cfg: room.kind === 'public' ? srvCfg(srvRow(room.serverId)) : null });
    const lim = { t: 240, at: Date.now() };
    ws.on('message', (raw) => {
      if (!room.host) { sendj(ws, { sys: 'hostgone', migrate: room.kind === 'public' }); return ws.close(); }
      lim.t = Math.min(240, lim.t + (Date.now() - lim.at) / 1000 * 90); lim.at = Date.now();
      if (lim.t < 1) { strike(room, c, 'флуд пакетами'); return; } lim.t--;
      if (raw.length > 256 * 1024) { strike(room, c, 'огромный пакет'); return; }
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!c.joined) {
        c.joined = true; room.clients.set(id, c); userRoom.set(me.uid, room.id);
        const hello = m && m.d ? m.d : {};
        // identity from the server session, never from the game client
        const full = A.load(me.uid); hello.uid = me.pub; hello.name = full.name;
        hello.profile = Object.assign({}, hello.profile || {}, A.publicView(full, true), { uid: me.pub });
        sendj(room.host, { sys: 'join', id, d: hello, user: { id: me.pub, name: full.name } });
        presence(me.uid, true);
        if (room.kind === 'public') db.run('UPDATE servers SET peak = MAX(peak, ?) WHERE id = ?', room.count(), room.serverId);
        return;
      }
      if (m && m.t === 'st') checkState(room, c, m.d);
      if (m && m.t === 'profile' && m.d) { const full = A.load(me.uid); m.d = Object.assign({}, m.d, A.publicView(full, true), { uid: me.pub }); }
      sendj(room.host, { from: id, d: m });
    });
    ws.on('close', () => {
      if (room.clients.get(id) === c) { room.clients.delete(id); if (room.host) sendj(room.host, { sys: 'leave', id }); }
      if (userRoom.get(me.uid) === room.id) userRoom.delete(me.uid);
      presence(me.uid, ctx.isOnline(me.uid));
    });
  }
  function closeRoom(room, why) { if (room.host) { sendj(room.host, { sys: 'closed', why }); room.host.close(); } }

  // ---------------------------------------------------------------- API helpers used by HTTP routes
  RT.invite = (fromUid, toPub) => {
    const room = rooms.get(userRoom.get(fromUid)); if (!room || !room.hostUser || room.hostUser.uid !== fromUid && room.kind === 'private') return { ok: false, why: 'Сначала откройте свой мир для друзей' };
    const t = A.byPub(toPub); if (!t) return { ok: false, why: 'Игрок не найден' };
    room.invited.add(t.id);
    const from = A.load(fromUid);
    ctx.push(t.id, { t: 'invite', room: room.id, pub: room.kind === 'public', world: room.info.name, from: { id: from.pubid, name: from.name }, code: room.access === 'code' ? room.code : undefined });
    return { ok: true };
  };
  RT.publicRooms = () => {
    const now = Date.now();
    return db.all('SELECT * FROM servers WHERE paid_until > ? ORDER BY id', now).map(s => {
      const r = rooms.get('s' + s.id);
      return { id: s.id, name: s.name, tags: s.tags ? s.tags.split(',').filter(Boolean) : [], descr: s.descr, max: s.max, pvp: !!s.pvp, diff: s.diff, players: r ? r.count() : 0, online: !!(r && r.host), owner: (A.load(s.owner) || {}).name, until: s.paid_until, peak: s.peak, list: r ? r.users().map(x => x.name).slice(0, 20) : [] };
    }).sort((a, b) => b.players - a.players);
  };
  RT.friendRooms = (uid) => {
    const out = [];
    for (const f of db.all("SELECT b FROM friends WHERE a = ? AND status = 'accepted'", uid)) {
      const r = rooms.get(userRoom.get(f.b)); if (!r || !r.host || r.kind !== 'private' || r.hostUser.uid !== f.b) continue;
      if (r.access === 'invite' && !r.invited.has(uid)) continue;
      out.push({ room: r.id, name: r.info.name, host: r.hostUser.name, hostId: r.hostUser.pub, players: r.count(), max: r.info.max, pvp: r.info.pvp, access: r.access });
    }
    for (const r of rooms.values()) if (r.kind === 'private' && r.invited.has(uid) && r.host && !out.some(o => o.room === r.id)) out.push({ room: r.id, name: r.info.name, host: r.hostUser.name, hostId: r.hostUser.pub, players: r.count(), max: r.info.max, pvp: r.info.pvp, invited: true });
    return out;
  };
  RT.kickFromServer = (sid, pub, why) => { const r = rooms.get('s' + sid); if (!r) return; for (const c of r.clients.values()) if (c.user.pub === pub) { sendj(c.ws, { sys: 'kicked', why }); c.ws.close(); } if (r.hostUser && r.hostUser.pub === pub) { sendj(r.host, { sys: 'closed', why }); r.host.close(); } };
  RT.serverChanged = (sid) => { const r = rooms.get('s' + sid); const s = srvRow(sid); if (!r || !s) return; r.info.name = s.name; r.info.max = s.max; r.info.pvp = !!s.pvp; if (r.host) sendj(r.host, { sys: 'cfg', cfg: srvCfg(s) }); };
  RT.kickUserEverywhere = (uid, why) => { for (const set of [online.get(uid)]) if (set) for (const ws of set) ws.close(); for (const r of rooms.values()) { for (const c of r.clients.values()) if (c.user.uid === uid) { sendj(c.ws, { sys: 'kicked', why }); c.ws.close(); } if (r.hostUser && r.hostUser.uid === uid && r.host) { sendj(r.host, { sys: 'closed', why }); r.host.close(); } } };
  ctx.onClanChange = (cid, uid) => { // let hosts refresh clan info of players in their world
    const ids = new Set(db.all('SELECT user_id FROM clan_members WHERE clan_id = ?', cid).map(r => r.user_id)); if (uid) ids.add(uid);
    for (const r of rooms.values()) if (r.host) { const affected = r.users().filter(x => ids.has(x.uid)); if (affected.length) sendj(r.host, { sys: 'clans', players: affected.map(x => ({ id: x.pub, clan: A.clanOf(x.uid) })) }); }
  };
  RT.stats = () => ({ online: online.size, rooms: rooms.size, playing: userRoom.size });

  // ---------------------------------------------------------------- upgrade routing
  RT.upgrade = (req, socket, head) => {
    const p = new URL(req.url, 'http://x').pathname;
    const u = authProto(req);
    const deny = (code, why) => { socket.write(`HTTP/1.1 ${code} ${why}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if (p !== '/ws' && p !== '/relay') return deny(404, 'Not Found');
    if (!u) return deny(401, 'Unauthorized');
    if (u.banned_until > Date.now()) return deny(403, 'Forbidden');
    try { U.limit('wsup:' + U.clientIp(req, cfg.trustProxy), 60, 30); } catch (e) { return deny(429, 'Too Many Requests'); }
    if (p === '/relay' && !u.email_verified && !u.google_sub && !u.apple_sub) return deny(403, 'Forbidden');
    const w = p === '/ws' ? wssNotify : wssRelay;
    w.handleUpgrade(req, socket, head, (ws) => w.emit('connection', ws, req, u));
  };
  setInterval(() => { for (const w of [wssNotify, wssRelay]) for (const ws of w.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) { } } }, 15000).unref();
  return RT;
};
