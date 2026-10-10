'use strict';
// Shop (YooMoney wallet, no documents needed), public servers management,
// support tickets and the admin panel API.
const crypto = require('crypto');
const U = require('./util');
const R = require('../../js/rules.js');
const { fail, v } = U;

module.exports = function (ctx) {
  const { db, A, cfg } = ctx;
  const SH = {};
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- orders
  SH.products = () => ({ products: R.PRODUCTS.map(p => ({ id: p.id, name: p.name, price: p.id === 'server' ? cfg.serverPrice : p.price, coins: p.coins || 0, icon: p.icon, desc: p.desc, items: p.items || null, classes: p.classes || null, best: p.best, coinPrice: R.COIN_KITS[p.id] || null })), classes: R.CLASSES, payReady: !!(cfg.yoomoney.wallet && cfg.yoomoney.secret) });
  SH.order = (req, b) => {
    const u = A.auth(req); U.limit('order:' + u.id, 10, 10);
    const p = R.PRODUCT[String(b.product)]; if (!p) fail(404, 'no_product', 'Нет такого товара');
    if (!cfg.yoomoney.wallet) fail(503, 'pay_off', 'Оплата ещё не подключена. Напишите в поддержку.');
    const meta = {};
    if (p.server) {
      if (b.serverId) { const s = db.get('SELECT id FROM servers WHERE id = ? AND owner = ?', v.int(b.serverId, 1, 1e12), u.id); if (!s) fail(404, 'no_server', 'Сервер не найден'); meta.serverId = s.id; }
      else { meta.name = v.text(b.name || (u.name + ' — сервер'), 32, 3); meta.pvp = !!b.pvp; meta.max = v.int(b.max || 16, 2, 32, 16); meta.tags = cleanTags(b.tags); }
    }
    const price = p.server ? cfg.serverPrice : p.price;
    const label = 'TZ' + Date.now().toString(36).toUpperCase() + U.token(5).replace(/[-_]/g, 'Z');
    db.run('INSERT INTO orders (label, user_id, product, price, meta, status, created) VALUES (?,?,?,?,?,?,?)', label, u.id, p.id, price, JSON.stringify(meta), 'new', Date.now());
    return { label, price, url: cfg.publicUrl.replace(/\/$/, '') + '/pay/' + label };
  };
  SH.payPage = (label, method) => { // the page the game / site opens: auto-submits to YooMoney
    const o = db.get('SELECT * FROM orders WHERE label = ?', String(label));
    if (!o) return page('Заказ не найден', '<p>Ссылка устарела. Создайте заказ заново.</p>');
    if (o.status === 'paid') return page('Уже оплачено', '<p>Этот заказ уже оплачен — награда в вашем аккаунте. Можно вернуться в игру.</p>');
    const p = R.PRODUCT[o.product];
    const f = { receiver: cfg.yoomoney.wallet, 'quickpay-form': 'button', paymentType: method === 'PC' ? 'PC' : 'AC', sum: o.price.toFixed(2), label: o.label, targets: 'The Zombies: ' + p.name, successURL: cfg.publicUrl.replace(/\/$/, '') + '/#/paid/' + o.label };
    return page('Оплата: ' + p.name, `<p>${esc(p.name)} — <b>${o.price} ₽</b></p><p class="s">Сейчас откроется страница ЮMoney. Оплатить можно банковской картой или кошельком ЮMoney.</p>
      <form id="f" method="POST" action="https://yoomoney.ru/quickpay/confirm">${Object.entries(f).map(([k, x]) => `<input type="hidden" name="${esc(k)}" value="${esc(x)}">`).join('')}
      <button type="submit">Оплатить картой</button></form>
      <form method="GET" action="/pay/${esc(o.label)}"><input type="hidden" name="m" value="PC"><button class="alt" type="submit">Кошельком ЮMoney</button></form>
      <script nonce="NONCE">if(!location.search)setTimeout(function(){document.getElementById('f').submit()},900)</script>`);
  };
  function page(title, body) {
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14110c;color:#e8dcc0;font:16px Verdana,sans-serif}
.c{max-width:420px;margin:16px;padding:24px;background:#221c14;border:4px solid #4a3a26;box-shadow:0 0 0 4px #0d0b08}h1{color:#ff5a4a;font-size:20px;letter-spacing:2px}
.s{color:#9a8a70;font-size:13px}button{display:block;width:100%;margin-top:12px;padding:14px;font:bold 16px Verdana;background:#3a8a3a;color:#fff;border:0;box-shadow:inset 0 -4px #1f5a1f;cursor:pointer}
button.alt{background:#6a40b0;box-shadow:inset 0 -4px #452a78}</style></head><body><div class="c"><h1>THE ZOMBIES</h1><h2 style="font-size:17px">${esc(title)}</h2>${body}</div></body></html>`;
  }
  SH.page = page;
  // YooMoney HTTP notification: sha1(notification_type&operation_id&amount&currency&datetime&sender&codepro&secret&label)
  SH.notify = (form) => {
    const f = Object.fromEntries(new URLSearchParams(form));
    if (!cfg.yoomoney.secret) { console.warn('YooMoney notification, but secret is empty in config.json'); return false; }
    const str = [f.notification_type, f.operation_id, f.amount, f.currency, f.datetime, f.sender, f.codepro, cfg.yoomoney.secret, f.label].join('&');
    const want = crypto.createHash('sha1').update(str, 'utf8').digest('hex');
    if (!f.sha1_hash || !U.safeEq(want, String(f.sha1_hash).toLowerCase())) { console.warn('YooMoney: bad signature', f.operation_id); return false; }
    if (f.codepro === 'true' || f.unaccepted === 'true') return true; // protected / held transfers are not credited
    const o = db.get('SELECT * FROM orders WHERE label = ?', String(f.label || ''));
    if (!o) { console.warn('YooMoney: payment without order', f.operation_id, f.amount); return true; }
    if (o.status === 'paid') return true;
    const paid = parseFloat(f.withdraw_amount || f.amount || '0');
    if (!(paid + 0.01 >= o.price)) { db.run("UPDATE orders SET status = 'underpaid', paid_sum = ?, op_id = ? WHERE label = ?", paid, f.operation_id, o.label); return true; }
    if (db.get('SELECT 1 FROM orders WHERE op_id = ?', f.operation_id)) return true;
    fulfill(o, f.operation_id, paid);
    return true;
  };
  function fulfill(o, opId, paid) {
    const p = R.PRODUCT[o.product], meta = JSON.parse(o.meta || '{}');
    db.tx(() => {
      db.run("UPDATE orders SET status = 'paid', paid_at = ?, op_id = ?, paid_sum = ? WHERE label = ? AND status != 'paid'", Date.now(), opId, paid, o.label);
      const u = A.load(o.user_id), d = u.d;
      if (p.coins) d.coins += p.coins;
      if (p.items) A.giveKit(u, p);
      if (p.classes) for (const c of p.classes) if (!d.classes.includes(c)) d.classes.push(c);
      if (p.cosmetics) { if (p.cosmetics.frame && !d.cosmetics.frames.includes(p.cosmetics.frame)) d.cosmetics.frames.push(p.cosmetics.frame); if (p.cosmetics.bg && !d.cosmetics.bgs.includes(p.cosmetics.bg)) d.cosmetics.bgs.push(p.cosmetics.bg); }
      d.donated = (d.donated || 0) + o.price;
      A.recount(u); A.grantAch(u, { ach: [] }); A.save(u);
      if (p.server) {
        const days = p.server * 864e5;
        if (meta.serverId) db.run('UPDATE servers SET paid_until = MAX(paid_until, ?) + ? WHERE id = ?', Date.now(), days, meta.serverId);
        else db.run('INSERT INTO servers (owner, name, tags, max, pvp, seed, created, paid_until) VALUES (?,?,?,?,?,?,?,?)', u.id, meta.name, meta.tags || '', meta.max || 16, meta.pvp ? 1 : 0, crypto.randomInt(1, 2 ** 31), Date.now(), Date.now() + days);
      }
    });
    ctx.push(o.user_id, { t: 'paid', product: p.id, name: p.name });
    ctx.push(o.user_id, { t: 'me' });
    console.log('Оплачено:', o.label, p.id, paid + '₽');
  }
  SH.fulfill = fulfill;
  SH.myOrders = (req) => { const u = A.auth(req); return { orders: db.all('SELECT label, product, price, status, created, paid_at FROM orders WHERE user_id = ? ORDER BY created DESC LIMIT 50', u.id) }; };
  SH.orderStatus = (req, label) => { const u = A.auth(req); const o = db.get('SELECT label, product, status FROM orders WHERE label = ? AND user_id = ?', String(label), u.id); if (!o) fail(404, 'no_order', 'Заказ не найден'); return { order: o }; };

  // ---------------------------------------------------------------- servers (owner edits from the site or the game)
  function cleanTags(t) { const a = (Array.isArray(t) ? t : String(t || '').split(/[,\s#]+/)).map(x => String(x).replace(/[^A-Za-zА-Яа-яЁё0-9_]/g, '').slice(0, 16)).filter(Boolean); return [...new Set(a)].slice(0, 6).join(','); }
  const own = (u, id) => { const s = db.get('SELECT * FROM servers WHERE id = ?', v.int(id, 1, 1e12)); if (!s || (s.owner !== u.id && !A.isAdmin(u))) fail(404, 'no_server', 'Сервер не найден'); return s; };
  SH.myServers = (req) => { const u = A.auth(req); const live = ctx.RT.publicRooms(); return { servers: db.all('SELECT * FROM servers WHERE owner = ? ORDER BY id', u.id).map(s => Object.assign({ id: s.id, name: s.name, tags: s.tags ? s.tags.split(',') : [], descr: s.descr, max: s.max, pvp: !!s.pvp, diff: s.diff, until: s.paid_until, bans: JSON.parse(s.bans), peak: s.peak }, { players: (live.find(x => x.id === s.id) || {}).players || 0, list: (live.find(x => x.id === s.id) || {}).list || [] })) }; };
  SH.editServer = (req, b) => {
    const u = A.auth(req); const s = own(u, b.id); const f = {};
    if (b.name != null) f.name = v.text(b.name, 32, 3);
    if (b.tags != null) f.tags = cleanTags(b.tags);
    if (b.descr != null) f.descr = v.text(b.descr, 200, 0);
    if (b.max != null) f.max = v.int(b.max, 2, 32);
    if (b.pvp != null) f.pvp = b.pvp ? 1 : 0;
    if (b.diff != null) { if (!['easy', 'normal', 'hard'].includes(b.diff)) fail(400, 'bad_diff', 'Неверная сложность'); f.diff = b.diff; }
    const k = Object.keys(f); if (k.length) db.run(`UPDATE servers SET ${k.map(x => x + ' = ?').join(', ')} WHERE id = ?`, ...k.map(x => f[x]), s.id);
    ctx.RT.serverChanged(s.id); return SH.myServers(req);
  };
  SH.serverAction = (req, b) => {
    const u = A.auth(req); const s = own(u, b.id); const op = String(b.op);
    if (op === 'kick' || op === 'ban') { const pub = v.pub(b.player); if (op === 'ban') { const bans = JSON.parse(s.bans); if (!bans.includes(pub)) bans.push(pub); db.run('UPDATE servers SET bans = ? WHERE id = ?', JSON.stringify(bans.slice(-500)), s.id); } ctx.RT.kickFromServer(s.id, pub, op === 'ban' ? 'Вы забанены на сервере «' + s.name + '»' : 'Владелец сервера выгнал вас'); }
    else if (op === 'unban') { const pub = v.pub(b.player); db.run('UPDATE servers SET bans = ? WHERE id = ?', JSON.stringify(JSON.parse(s.bans).filter(x => x !== pub)), s.id); }
    else if (op === 'wipe') { ctx.RT.deleteWorld(s.id); db.run('UPDATE servers SET seed = ? WHERE id = ?', crypto.randomInt(1, 2 ** 31), s.id); }
    else fail(400, 'bad_op', 'Неизвестное действие');
    return SH.myServers(req);
  };

  // ---------------------------------------------------------------- support
  const admins = () => db.all('SELECT id, email, role FROM users WHERE role = \'admin\' OR email IN (' + (cfg.adminEmails.map(() => '?').join(',') || "''") + ')', ...cfg.adminEmails).map(r => r.id);
  SH.newTicket = (req, b) => {
    const u = A.auth(req, { allowBanned: true }); U.limit('ticket:' + u.id, 3, 5);
    const subject = v.text(b.subject, 80), text = v.text(b.text, 2000);
    const r = db.run('INSERT INTO tickets (user_id, subject, status, created, updated) VALUES (?,?,?,?,?)', u.id, subject, 'open', Date.now(), Date.now());
    const id = Number(r.lastInsertRowid); db.run('INSERT INTO ticket_msgs (ticket_id, user_id, staff, text, created) VALUES (?,?,0,?,?)', id, u.id, text, Date.now());
    for (const a of admins()) ctx.push(a, { t: 'ticket', id, subject, from: u.name });
    return { id };
  };
  SH.myTickets = (req) => { const u = A.auth(req, { allowBanned: true }); return { tickets: db.all('SELECT id, subject, status, created, updated FROM tickets WHERE user_id = ? ORDER BY updated DESC LIMIT 50', u.id) }; };
  function ticket(u, id, staff) { const t = db.get('SELECT * FROM tickets WHERE id = ?', v.int(id, 1, 1e12)); if (!t || (!staff && t.user_id !== u.id)) fail(404, 'no_ticket', 'Обращение не найдено'); return t; }
  SH.ticket = (req, id) => {
    const u = A.auth(req, { allowBanned: true }); const staff = A.isAdmin(u); const t = ticket(u, id, staff); const owner = A.load(t.user_id);
    return { ticket: { id: t.id, subject: t.subject, status: t.status, created: t.created, user: staff ? A.publicView(owner) : undefined, email: staff ? owner.email : undefined }, msgs: db.all('SELECT id, staff, text, created FROM ticket_msgs WHERE ticket_id = ? ORDER BY id', t.id) };
  };
  SH.replyTicket = (req, id, b) => {
    const u = A.auth(req, { allowBanned: true }); U.limit('treply:' + u.id, 20, 10); const staff = A.isAdmin(u); const t = ticket(u, id, staff);
    const text = v.text(b.text, 2000);
    db.run('INSERT INTO ticket_msgs (ticket_id, user_id, staff, text, created) VALUES (?,?,?,?,?)', t.id, u.id, staff && t.user_id !== u.id ? 1 : 0, text, Date.now());
    const status = staff && b.close ? 'closed' : staff && t.user_id !== u.id ? 'answered' : 'open';
    db.run('UPDATE tickets SET status = ?, updated = ? WHERE id = ?', status, Date.now(), t.id);
    if (staff && t.user_id !== u.id) ctx.push(t.user_id, { t: 'support', id: t.id, text: text.slice(0, 120) });
    else for (const a of admins()) ctx.push(a, { t: 'ticket', id: t.id, subject: t.subject, from: u.name });
    return SH.ticket(req, id);
  };

  // ---------------------------------------------------------------- admin
  SH.admin = {
    stats: (req) => { A.authAdmin(req); const now = Date.now(); return { users: db.get('SELECT COUNT(*) n FROM users').n, today: db.get('SELECT COUNT(*) n FROM users WHERE last_seen > ?', now - 864e5).n, open: db.get("SELECT COUNT(*) n FROM tickets WHERE status = 'open'").n, revenue: db.get("SELECT COALESCE(SUM(price),0) s FROM orders WHERE status = 'paid'").s, month: db.get("SELECT COALESCE(SUM(price),0) s FROM orders WHERE status = 'paid' AND paid_at > ?", now - 30 * 864e5).s, servers: db.get('SELECT COUNT(*) n FROM servers WHERE paid_until > ?', now).n, rt: ctx.RT.stats(), payReady: !!(cfg.yoomoney.wallet && cfg.yoomoney.secret), mail: ctx.mail.enabled() }; },
    tickets: (req, status) => { A.authAdmin(req); return { tickets: db.all('SELECT t.id, t.subject, t.status, t.updated, u.name, u.pubid FROM tickets t JOIN users u ON u.id = t.user_id WHERE (? = \'all\' OR t.status = ?) ORDER BY t.updated DESC LIMIT 100', status || 'open', status || 'open') }; },
    users: (req, q) => {
      A.authAdmin(req); q = String(q || '').trim();
      const rows = q === 'sus' ? db.all('SELECT id FROM users WHERE sus > 5 ORDER BY sus DESC LIMIT 50')
        : /^#?[2-9A-HJ-NP-Z]{8}$/i.test(q) ? db.all('SELECT id FROM users WHERE pubid = ?', q.replace('#', '').toUpperCase())
        : q.includes('@') ? db.all('SELECT id FROM users WHERE email = ?', q.toLowerCase())
        : db.all("SELECT id FROM users WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY last_seen DESC LIMIT 50", q.replace(/[%_\\]/g, '\\$&') + '%');
      return { users: rows.map(r => { const u = A.load(r.id); return Object.assign(A.publicView(u, ctx.isOnline(u.id)), { email: u.email, sus: +u.sus.toFixed(1), banned: u.banned_until > Date.now() ? u.banned_until : 0, banReason: u.ban_reason, coins: u.d.coins, donated: u.d.donated || 0, reports: db.all('SELECT kind, detail, created FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 8', u.id) }); }) };
    },
    user: (req, pub, b) => {
      const me = A.authAdmin(req); const u = A.byPub(v.pub(pub)); if (!u) fail(404, 'no_user', 'Игрок не найден');
      if (b.ban != null) { const h = v.int(b.ban, 0, 24 * 3650); db.run('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?', h ? Date.now() + h * 3600e3 : 0, h ? v.text(b.reason || 'нарушение правил', 200) : null, u.id); if (h) { db.run('DELETE FROM sessions WHERE user_id = ?', u.id); ctx.RT.kickUserEverywhere(u.id, 'Аккаунт заблокирован'); } }
      const x = A.load(u.id);
      if (b.coins) { x.d.coins = Math.max(0, x.d.coins + v.int(b.coins, -1e7, 1e7)); }
      if (b.rn) A.addRn(x, v.int(b.rn, -1e6, 1e6), 'поддержка');
      if (b.resetSus) x.sus = 0;
      if (b.resetProgress) { const fresh = require('./accounts').freshData(); x.d.rn = fresh.rn; x.d.rnPeak = fresh.rn; x.d.stats = {}; x.d.ach = {}; x.d.medals = []; x.d.history = []; }
      if (b.role != null && ['user', 'admin'].includes(b.role) && x.id !== me.id) db.run('UPDATE users SET role = ? WHERE id = ?', b.role, x.id);
      A.save(x); ctx.push(x.id, { t: 'me' });
      return SH.admin.users(req, x.pubid);
    },
    reports: (req) => { A.authAdmin(req); return { reports: db.all('SELECT r.kind, r.detail, r.created, u.name, u.pubid, u.sus FROM reports r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 100') }; },
    skins: (req) => { A.authAdmin(req); return { skins: db.all('SELECT s.id, s.name, s.status, s.created, u.name owner, u.pubid FROM skins s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 120') }; },
    skin: (req, id, b) => { A.authAdmin(req); db.run('UPDATE skins SET status = ? WHERE id = ?', b.status === 'rejected' ? 'rejected' : 'ok', v.int(id, 1, 1e12)); return SH.admin.skins(req); },
    orders: (req) => { A.authAdmin(req); return { orders: db.all('SELECT o.label, o.product, o.price, o.status, o.created, o.paid_at, o.paid_sum, u.name, u.pubid FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created DESC LIMIT 100') }; },
    markPaid: (req, label) => { A.authAdmin(req); const o = db.get('SELECT * FROM orders WHERE label = ?', String(label)); if (!o) fail(404, 'no_order', 'Заказ не найден'); if (o.status !== 'paid') fulfill(o, 'manual-' + o.label, o.price); return SH.admin.orders(req); },
    servers: (req) => { A.authAdmin(req); return { servers: db.all('SELECT s.*, u.name owner_name FROM servers s JOIN users u ON u.id = s.owner ORDER BY s.id DESC').map(s => Object.assign(s, { bans: JSON.parse(s.bans) })) }; },
    serverDays: (req, id, b) => { A.authAdmin(req); db.run('UPDATE servers SET paid_until = MAX(paid_until, ?) + ? WHERE id = ?', Date.now(), v.int(b.days, -3650, 3650) * 864e5, v.int(id, 1, 1e12)); return SH.admin.servers(req); },
  };
  return SH;
};
