'use strict';
// Friends, private messages, blocks, clans (stored on the server), clan chat.
const U = require('./util');
const { fail, v } = U;

module.exports = function (ctx) {
  const { db, A } = ctx;
  const S = {};
  const pubOf = (id) => db.get('SELECT pubid FROM users WHERE id = ?', id).pubid;
  const target = (pub) => { const t = A.byPub(v.pub(pub)); if (!t) fail(404, 'no_user', 'Игрок не найден'); return t; };
  const short = (u) => ({ id: u.pubid, name: u.name, avatar: u.d.avatar, frame: u.d.frame, look: u.d.look, rn: u.d.rn, rank: require('../../js/rules.js').rankOf(u.d.rn).name, online: ctx.isOnline(u.id), playing: ctx.playingOf(u.id), lastSeen: u.last_seen, skin: u.d.skin, cls: u.d.cls });
  const isFriend = (a, b) => !!db.get("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'accepted'", a, b);
  S.isFriend = isFriend;
  const blocked = (by, who) => !!db.get('SELECT 1 FROM blocks WHERE a = ? AND b = ?', by, who);

  // ---------------------------------------------------------------- friends
  S.list = (req) => {
    const u = A.auth(req);
    const rows = db.all('SELECT f.a, f.b, f.status FROM friends f WHERE f.a = ? OR f.b = ?', u.id, u.id);
    const friends = [], incoming = [], outgoing = [];
    for (const r of rows) {
      if (r.status === 'accepted') { if (r.a === u.id) friends.push(short(A.load(r.b))); }
      else if (r.a === u.id) outgoing.push(short(A.load(r.b)));
      else incoming.push(short(A.load(r.a)));
    }
    const unread = db.all('SELECT from_id, COUNT(*) n FROM messages WHERE to_id = ? AND read = 0 GROUP BY from_id', u.id).map(r => ({ id: pubOf(r.from_id), n: r.n }));
    friends.sort((x, y) => (y.online - x.online) || x.name.localeCompare(y.name));
    return { friends, incoming, outgoing, unread };
  };
  S.request = (req, b) => {
    const u = A.auth(req); U.limit('freq:' + u.id, 20, 20); const t = target(b.id);
    if (t.id === u.id) fail(400, 'self', 'Это вы');
    if (isFriend(u.id, t.id)) fail(409, 'already', 'Уже в друзьях');
    if (blocked(t.id, u.id)) fail(403, 'blocked', 'Игрок ограничил заявки');
    if (db.get("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'pending'", t.id, u.id)) return S.accept(req, { id: t.pubid }); // they already asked us
    if (db.get('SELECT COUNT(*) n FROM friends WHERE a = ?', u.id).n >= 300) fail(400, 'limit', 'Слишком много друзей и заявок');
    db.run("INSERT OR IGNORE INTO friends (a, b, status, created) VALUES (?,?,'pending',?)", u.id, t.id, Date.now());
    ctx.push(t.id, { t: 'friendReq', from: short(u) });
    return { ok: true };
  };
  S.accept = (req, b) => {
    const u = A.auth(req); const t = target(b.id);
    if (!db.get("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'pending'", t.id, u.id)) fail(404, 'no_request', 'Заявки нет');
    db.tx(() => {
      db.run("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?", t.id, u.id);
      db.run("INSERT OR REPLACE INTO friends (a, b, status, created) VALUES (?,?,'accepted',?)", u.id, t.id, Date.now());
    });
    for (const x of [u, t]) { const y = A.load(x.id); A.recount(y); const o = { ach: [] }; A.grantAch(y, o); A.save(y); }
    ctx.push(t.id, { t: 'friendAccepted', from: short(u) });
    return { ok: true };
  };
  S.decline = (req, b) => { const u = A.auth(req); const t = target(b.id); db.run("DELETE FROM friends WHERE ((a = ? AND b = ?) OR (a = ? AND b = ?)) AND status = 'pending'", t.id, u.id, u.id, t.id); return { ok: true }; };
  S.remove = (req, b) => { const u = A.auth(req); const t = target(b.id); db.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', u.id, t.id, t.id, u.id); return { ok: true }; };
  S.block = (req, b) => { const u = A.auth(req); const t = target(b.id); db.run('INSERT OR IGNORE INTO blocks (a, b) VALUES (?,?)', u.id, t.id); db.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', u.id, t.id, t.id, u.id); return { ok: true }; };
  S.unblock = (req, b) => { const u = A.auth(req); const t = target(b.id); db.run('DELETE FROM blocks WHERE a = ? AND b = ?', u.id, t.id); return { ok: true }; };
  S.profile = (req, pub) => { const t = target(pub); return { profile: A.publicView(t, ctx.isOnline(t.id)) }; };
  S.search = (req, q) => {
    A.auth(req); q = String(q || '').trim().replace(/^#/, '');
    if (/^[2-9A-HJ-NP-Z]{8}$/i.test(q)) { const t = A.byPub(q.toUpperCase()); return { users: t ? [short(t)] : [] }; }
    if (q.length < 2) return { users: [] };
    return { users: db.all("SELECT id FROM users WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20", q.replace(/[%_\\]/g, '\\$&') + '%').map(r => short(A.load(r.id))) };
  };

  // ---------------------------------------------------------------- private messages
  S.sendMsg = (req, b) => {
    const u = A.auth(req); U.limit('dm:' + u.id, 30, 15); const t = target(b.to);
    if (t.id === u.id) fail(400, 'self', 'Это вы');
    if (blocked(t.id, u.id)) fail(403, 'blocked', 'Игрок не принимает ваши сообщения');
    if (!u.email_verified && !u.google_sub && !u.apple_sub) fail(403, 'verify', 'Подтвердите почту, чтобы писать сообщения');
    const text = v.text(b.text, 500);
    const r = db.run('INSERT INTO messages (from_id, to_id, text, created) VALUES (?,?,?,?)', u.id, t.id, text, Date.now());
    const m = { id: Number(r.lastInsertRowid), from: u.pubid, to: t.pubid, text, created: Date.now() };
    ctx.push(t.id, { t: 'msg', m, fromName: u.name });
    return { m };
  };
  S.thread = (req, pub, before) => {
    const u = A.auth(req); const t = target(pub);
    const bid = before ? v.int(before, 0, 1e15) : 1e15;
    const rows = db.all('SELECT id, from_id, text, created FROM messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id < ? ORDER BY id DESC LIMIT 50', u.id, t.id, t.id, u.id, bid);
    db.run('UPDATE messages SET read = 1 WHERE from_id = ? AND to_id = ? AND read = 0', t.id, u.id);
    return { with: short(t), msgs: rows.reverse().map(r => ({ id: r.id, from: r.from_id === u.id ? u.pubid : t.pubid, text: r.text, created: r.created })) };
  };

  // ---------------------------------------------------------------- clans
  const CL = (id) => { const c = db.get('SELECT * FROM clans WHERE id = ?', id); if (!c) fail(404, 'no_clan', 'Клан не найден'); return c; };
  const myRole = (u, cid) => { const m = db.get('SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?', u.id, cid); return m && m.role; };
  const clanView = (c, full) => {
    const members = db.all('SELECT user_id, role, joined FROM clan_members WHERE clan_id = ? ORDER BY CASE role WHEN \'leader\' THEN 0 WHEN \'officer\' THEN 1 ELSE 2 END, joined', c.id);
    const o = { id: c.id, name: c.name, tag: c.tag, color: c.color, descr: c.descr, pvp: !!c.pvp, markers: !!c.markers, open: !!c.open, created: c.created, count: members.length };
    let rn = 0; const ms = members.map(m => { const x = A.load(m.user_id); rn += x.d.rn; return Object.assign(short(x), { role: m.role, joined: m.joined }); });
    o.rn = rn; if (full) o.members = ms; else o.leader = (ms[0] || {}).name;
    return o;
  };
  S.clanView = clanView;
  const notifyClan = (cid, msg, except) => { for (const m of db.all('SELECT user_id FROM clan_members WHERE clan_id = ?', cid)) if (m.user_id !== except) ctx.push(m.user_id, msg); };
  const clanChanged = (cid) => { notifyClan(cid, { t: 'clan', id: cid }); ctx.onClanChange && ctx.onClanChange(cid); };
  const MAXM = 30;

  S.clans = (req, q) => {
    q = String(q || '').trim();
    const rows = q ? db.all("SELECT * FROM clans WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE OR tag LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 50", '%' + q.replace(/[%_\\]/g, '\\$&') + '%', q.replace(/[%_\\]/g, '\\$&') + '%') : db.all('SELECT * FROM clans ORDER BY id DESC LIMIT 200');
    return { clans: rows.map(c => clanView(c)).sort((a, b) => b.rn - a.rn).slice(0, 50) };
  };
  S.clan = (req, id) => { const c = CL(v.int(id, 1, 1e12)); return { clan: clanView(c, true) }; };
  S.myClan = (req) => {
    const u = A.auth(req); const m = db.get('SELECT clan_id FROM clan_members WHERE user_id = ?', u.id);
    const inv = db.all('SELECT i.clan_id, i.from_id FROM clan_invites i WHERE i.user_id = ?', u.id).map(i => { const c = db.get('SELECT * FROM clans WHERE id = ?', i.clan_id); return c && { clan: clanView(c), from: (A.load(i.from_id) || {}).name }; }).filter(Boolean);
    return { clan: m ? clanView(CL(m.clan_id), true) : null, role: m ? myRole(u, m.clan_id) : null, invites: inv };
  };
  function clanFields(b, c) {
    const o = {};
    if (b.name != null || !c) { o.name = String(b.name || '').trim(); if (!/^[A-Za-zА-Яа-яЁё0-9 _\-.]{3,20}$/.test(o.name)) fail(400, 'bad_name', 'Название клана: 3–20 символов'); }
    if (b.tag != null || !c) { o.tag = String(b.tag || '').trim().toUpperCase(); if (!/^[A-ZА-ЯЁ0-9]{2,5}$/.test(o.tag)) fail(400, 'bad_tag', 'Тег: 2–5 букв или цифр'); }
    if (b.color != null || !c) o.color = v.color(b.color || '#ff5a4a');
    if (b.descr != null) o.descr = v.text(b.descr, 300, 0);
    for (const k of ['pvp', 'markers', 'open']) if (b[k] != null) o[k] = b[k] ? 1 : 0;
    return o;
  }
  S.createClan = (req, b) => {
    const u = A.auth(req); U.limit('clanc:' + u.id, 3, 3);
    if (db.get('SELECT 1 FROM clan_members WHERE user_id = ?', u.id)) fail(409, 'in_clan', 'Сначала выйдите из текущего клана');
    const f = clanFields(b);
    if (db.get('SELECT 1 FROM clans WHERE name = ? COLLATE NOCASE', f.name)) fail(409, 'name_taken', 'Такое название уже занято');
    const id = db.tx(() => {
      const r = db.run('INSERT INTO clans (name, tag, color, descr, pvp, markers, open, owner, created) VALUES (?,?,?,?,?,?,?,?,?)', f.name, f.tag, f.color, f.descr || '', f.pvp || 0, f.markers == null ? 1 : f.markers, f.open || 0, u.id, Date.now());
      const id = Number(r.lastInsertRowid); db.run("INSERT INTO clan_members (clan_id, user_id, role, joined) VALUES (?,?,'leader',?)", id, u.id, Date.now()); return id;
    });
    ctx.onClanChange && ctx.onClanChange(id);
    return S.myClan(req);
  };
  S.editClan = (req, b) => {
    const u = A.auth(req); const c = CL(v.int(b.id, 1, 1e12)); const r = myRole(u, c.id);
    if (r !== 'leader' && r !== 'officer') fail(403, 'forbidden', 'Только лидер или офицер');
    const f = clanFields(b, c);
    if (f.name && f.name.toLowerCase() !== c.name.toLowerCase() && db.get('SELECT 1 FROM clans WHERE name = ? COLLATE NOCASE', f.name)) fail(409, 'name_taken', 'Такое название уже занято');
    const keys = Object.keys(f); if (keys.length) db.run(`UPDATE clans SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`, ...keys.map(k => f[k]), c.id);
    clanChanged(c.id); return S.myClan(req);
  };
  S.inviteClan = (req, b) => {
    const u = A.auth(req); U.limit('clani:' + u.id, 30, 20); const m = db.get('SELECT clan_id, role FROM clan_members WHERE user_id = ?', u.id);
    if (!m) fail(400, 'no_clan', 'Вы не в клане'); if (m.role === 'member') fail(403, 'forbidden', 'Приглашать могут лидер и офицеры');
    const t = target(b.id);
    if (db.get('SELECT 1 FROM clan_members WHERE user_id = ?', t.id)) fail(409, 'in_clan', 'Игрок уже в клане');
    if (db.get('SELECT COUNT(*) n FROM clan_members WHERE clan_id = ?', m.clan_id).n >= MAXM) fail(400, 'full', 'В клане максимум ' + MAXM + ' игроков');
    db.run('INSERT OR REPLACE INTO clan_invites (clan_id, user_id, from_id, created) VALUES (?,?,?,?)', m.clan_id, t.id, u.id, Date.now());
    const c = CL(m.clan_id); ctx.push(t.id, { t: 'clanInvite', clan: { id: c.id, name: c.name, color: c.color, tag: c.tag }, from: u.name });
    return { ok: true };
  };
  S.joinClan = (req, b) => { // accept an invite, or join an open clan
    const u = A.auth(req); const c = CL(v.int(b.id, 1, 1e12));
    if (db.get('SELECT 1 FROM clan_members WHERE user_id = ?', u.id)) fail(409, 'in_clan', 'Сначала выйдите из текущего клана');
    const inv = db.get('SELECT 1 FROM clan_invites WHERE clan_id = ? AND user_id = ?', c.id, u.id);
    if (!inv && !c.open) fail(403, 'closed', 'В этот клан только по приглашению');
    if (db.get('SELECT COUNT(*) n FROM clan_members WHERE clan_id = ?', c.id).n >= MAXM) fail(400, 'full', 'Клан заполнен');
    db.run("INSERT INTO clan_members (clan_id, user_id, role, joined) VALUES (?,?,'member',?)", c.id, u.id, Date.now());
    db.run('DELETE FROM clan_invites WHERE user_id = ?', u.id);
    S.clanSys(c.id, u.name + ' вступил(а) в клан'); clanChanged(c.id); return S.myClan(req);
  };
  S.declineClan = (req, b) => { const u = A.auth(req); db.run('DELETE FROM clan_invites WHERE user_id = ? AND clan_id = ?', u.id, v.int(b.id, 1, 1e12)); return S.myClan(req); };
  S.leaveClan = (req) => {
    const u = A.auth(req); const m = db.get('SELECT clan_id, role FROM clan_members WHERE user_id = ?', u.id); if (!m) fail(400, 'no_clan', 'Вы не в клане');
    db.tx(() => {
      db.run('DELETE FROM clan_members WHERE user_id = ?', u.id);
      if (m.role === 'leader') {
        const next = db.get("SELECT user_id FROM clan_members WHERE clan_id = ? ORDER BY CASE role WHEN 'officer' THEN 0 ELSE 1 END, joined LIMIT 1", m.clan_id);
        if (next) { db.run("UPDATE clan_members SET role = 'leader' WHERE user_id = ?", next.user_id); db.run('UPDATE clans SET owner = ? WHERE id = ?', next.user_id, m.clan_id); }
        else db.run('DELETE FROM clans WHERE id = ?', m.clan_id);
      }
    });
    if (db.get('SELECT 1 FROM clans WHERE id = ?', m.clan_id)) { S.clanSys(m.clan_id, u.name + ' покинул(а) клан'); clanChanged(m.clan_id); }
    ctx.onClanChange && ctx.onClanChange(m.clan_id, u.id);
    return S.myClan(req);
  };
  S.manageClan = (req, b) => { // kick / promote / demote / lead / disband
    const u = A.auth(req); const m = db.get('SELECT clan_id, role FROM clan_members WHERE user_id = ?', u.id); if (!m) fail(400, 'no_clan', 'Вы не в клане');
    const op = String(b.op);
    if (op === 'disband') { if (m.role !== 'leader') fail(403, 'forbidden', 'Только лидер'); const ids = db.all('SELECT user_id FROM clan_members WHERE clan_id = ?', m.clan_id); db.run('DELETE FROM clans WHERE id = ?', m.clan_id); for (const x of ids) { ctx.push(x.user_id, { t: 'clan', id: m.clan_id, gone: true }); ctx.onClanChange && ctx.onClanChange(m.clan_id, x.user_id); } return S.myClan(req); }
    const t = target(b.id); const tm = db.get('SELECT role FROM clan_members WHERE user_id = ? AND clan_id = ?', t.id, m.clan_id); if (!tm) fail(404, 'not_member', 'Игрок не в вашем клане');
    if (op === 'kick') { if (m.role === 'member' || tm.role === 'leader' || (m.role === 'officer' && tm.role === 'officer')) fail(403, 'forbidden', 'Недостаточно прав'); db.run('DELETE FROM clan_members WHERE user_id = ?', t.id); ctx.push(t.id, { t: 'clan', id: m.clan_id, kicked: true }); S.clanSys(m.clan_id, t.name + ' исключён(а) из клана'); ctx.onClanChange && ctx.onClanChange(m.clan_id, t.id); }
    else if (op === 'promote' || op === 'demote') { if (m.role !== 'leader') fail(403, 'forbidden', 'Только лидер'); db.run('UPDATE clan_members SET role = ? WHERE user_id = ?', op === 'promote' ? 'officer' : 'member', t.id); }
    else if (op === 'lead') { if (m.role !== 'leader') fail(403, 'forbidden', 'Только лидер'); db.run("UPDATE clan_members SET role = 'officer' WHERE user_id = ?", u.id); db.run("UPDATE clan_members SET role = 'leader' WHERE user_id = ?", t.id); db.run('UPDATE clans SET owner = ? WHERE id = ?', t.id, m.clan_id); }
    else fail(400, 'bad_op', 'Неизвестное действие');
    clanChanged(m.clan_id); return S.myClan(req);
  };
  S.clanSys = (cid, text) => { const r = db.run('INSERT INTO clan_msgs (clan_id, user_id, text, created) VALUES (?,?,?,?)', cid, 0, text, Date.now()); notifyClan(cid, { t: 'clanMsg', clan: cid, m: { id: Number(r.lastInsertRowid), sys: true, text, created: Date.now() } }); };
  S.clanMsgs = (req, id, before) => {
    const u = A.auth(req); const cid = v.int(id, 1, 1e12); if (!myRole(u, cid)) fail(403, 'forbidden', 'Чат клана — только для участников');
    const rows = db.all('SELECT id, user_id, text, created FROM clan_msgs WHERE clan_id = ? AND id < ? ORDER BY id DESC LIMIT 60', cid, before ? v.int(before, 0, 1e15) : 1e15);
    const names = new Map(); const nm = (id) => { if (!names.has(id)) { const x = id && A.load(id); names.set(id, x ? { id: x.pubid, name: x.name } : null); } return names.get(id); };
    return { msgs: rows.reverse().map(r => r.user_id ? { id: r.id, from: nm(r.user_id), text: r.text, created: r.created } : { id: r.id, sys: true, text: r.text, created: r.created }) };
  };
  S.clanSend = (req, b) => {
    const u = A.auth(req); U.limit('clanm:' + u.id, 30, 15); const m = db.get('SELECT clan_id FROM clan_members WHERE user_id = ?', u.id); if (!m) fail(400, 'no_clan', 'Вы не в клане');
    const text = v.text(b.text, 400);
    const r = db.run('INSERT INTO clan_msgs (clan_id, user_id, text, created) VALUES (?,?,?,?)', m.clan_id, u.id, text, Date.now());
    const msg = { id: Number(r.lastInsertRowid), from: { id: u.pubid, name: u.name }, text, created: Date.now() };
    notifyClan(m.clan_id, { t: 'clanMsg', clan: m.clan_id, m: msg });
    db.run('DELETE FROM clan_msgs WHERE clan_id = ? AND id < ?', m.clan_id, Number(r.lastInsertRowid) - 2000);
    return { m: msg };
  };
  return S;
};
