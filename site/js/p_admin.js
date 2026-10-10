// =====================================================================
//  THE ZOMBIES — website: admin panel (only for me.admin).
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;
const TABS = ['stats', 'tickets', 'users', 'reports', 'orders', 'skins', 'servers'];
const TAB_ICON = { stats: 'star', tickets: 'chat', users: 'people', reports: 'eye', orders: 'coin', skins: 'shirt', servers: 'globe' };
let tab = 'stats';
try { tab = sessionStorage.getItem('tz_site_admtab') || 'stats'; } catch (e) { /* ignore */ }
if (!TABS.includes(tab)) tab = 'stats';

const tile = (label, value, cls) => h('div.atile' + (cls ? '.' + cls : ''), h('b', value), h('span', label));
const yes = (v) => v ? h('span.badge.green', t('ui.yes')) : h('span.badge.red', t('ui.no'));

function statsTab(box, ctx) {
  const load = () => S.get('/api/admin/stats').then(s => {
    if (!ctx.alive()) return; S.clear(box);
    box.appendChild(h('div.agrid',
      tile(t('adm.users'), S.num(s.users)), tile(t('adm.today'), S.num(s.today)), tile(t('adm.open'), S.num(s.open), s.open ? 'warn' : ''),
      tile(t('adm.revenue'), S.num(s.revenue) + ' ₽', 'gold'), tile(t('adm.month'), S.num(s.month) + ' ₽', 'gold'), tile(t('adm.servers'), S.num(s.servers)),
      tile(t('stats.online'), S.num(s.rt && s.rt.online), 'ok'), tile(t('adm.rooms'), S.num(s.rt && s.rt.rooms)), tile(t('stats.playing'), S.num(s.rt && s.rt.playing))));
    box.appendChild(h('div.row.gap.wrapr.amisc', h('span', t('adm.pay'), ' ', yes(s.payReady)), h('span', t('adm.mail'), ' ', yes(s.mail))));
  }).catch(e => { if (ctx.alive()) S.clear(box).appendChild(S.errorBox(e, load)); });
  load(); ctx.every(15000, load);
}

function ticketsTab(box, ctx) {
  let status = 'open';
  const list = h('div.tlist');
  const sw = h('div.seg', ['open', 'all'].map(s => h('button.segb' + (s === status ? '.on' : ''), { type: 'button', 'data-s': s }, t('adm.t.' + s))));
  sw.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; status = b.dataset.s; for (const x of sw.children) x.classList.toggle('on', x === b); load(); });
  S.clear(box).append(sw, list);
  const load = () => { S.clear(list).appendChild(S.loading()); S.get('/api/admin/tickets?status=' + status).then(r => {
    if (!ctx.alive()) return; S.clear(list);
    const ts = r.tickets || []; if (!ts.length) { list.appendChild(S.empty(t('adm.notickets'), 'check')); return; }
    for (const tk of ts) list.appendChild(h('a.titem', { href: '#/support/' + tk.id }, h('div.grow', h('b', tk.subject), h('div.dim.tiny', '#' + tk.id + ' · ' + tk.name + ' #' + tk.pubid + ' · ' + S.dt(tk.updated))), S.ticketBadge(tk.status)));
  }).catch(e => { if (ctx.alive()) S.clear(list).appendChild(S.errorBox(e, load)); }); };
  load();
}

function userCard(u, redraw, single) {
  const r = S.rank(u.rank);
  const el = h('article.auser.panel');
  const post = (body, btn, okMsg) => S.busy(btn, async () => { const res = await S.post('/api/admin/users/' + encodeURIComponent(u.id), body); S.toast(okMsg || t('ui.saved'), 'ok'); const nu = (res.users || [])[0]; if (nu) redraw(el, nu); });
  const hours = S.input({ type: 'number', min: 0, max: 87600, value: 24, class: 'inp num', 'aria-label': t('adm.hours') });
  const reason = S.input({ maxlength: 200, placeholder: t('adm.reason'), 'aria-label': t('adm.reason') });
  const banB = h('button.btn.tiny.red', { type: 'button' }, t('adm.ban')); banB.addEventListener('click', () => post({ ban: Math.max(1, parseInt(hours.value, 10) || 24), reason: reason.value.trim() || undefined }, banB, t('adm.banned')));
  const unB = h('button.btn.tiny.green', { type: 'button' }, t('adm.unban')); unB.addEventListener('click', () => post({ ban: 0 }, unB));
  const coins = S.input({ type: 'number', value: 100, class: 'inp num', 'aria-label': t('prof.coins') });
  const coinB = h('button.btn.tiny.gold', { type: 'button' }, t('adm.addcoins')); coinB.addEventListener('click', () => { const n = parseInt(coins.value, 10); if (n) post({ coins: n }, coinB); });
  const rn = S.input({ type: 'number', value: 50, class: 'inp num', 'aria-label': 'RN' });
  const rnB = h('button.btn.tiny.ghost', { type: 'button' }, t('adm.addrn')); rnB.addEventListener('click', () => { const n = parseInt(rn.value, 10); if (n) post({ rn: n }, rnB); });
  const susB = h('button.btn.tiny.ghost', { type: 'button' }, t('adm.resetsus')); susB.addEventListener('click', () => post({ resetSus: true }, susB));
  const progB = h('button.btn.tiny.red', { type: 'button' }, t('adm.resetprog')); progB.addEventListener('click', async () => { if (await S.confirm(t('adm.resetprog'), t('adm.resetprogq', { name: u.name }), t('adm.resetprog'), true)) post({ resetProgress: true }, progB); });
  const isAdm = u.role === 'support';
  const roleB = h('button.btn.tiny.ghost', { type: 'button' }, isAdm ? t('adm.mkuser') : t('adm.mkadmin')); roleB.addEventListener('click', async () => { if (await S.confirm(t('adm.role'), isAdm ? t('adm.mkuserq', { name: u.name }) : t('adm.mkadminq', { name: u.name }), t('ui.ok'), !isAdm)) post({ role: isAdm ? 'user' : 'admin' }, roleB); });
  const sus = +u.sus || 0;
  S.add(el, [
    h('div.auhead', S.onlineDot(u.online), h('div.grow', h('b', S.userLink(u)), ' ', h('span.mono.dim', '#' + u.id), isAdm ? h('span.badge.gold.tiny', t('prof.staff')) : null,
      h('div.dim.tiny', u.email || '—', ' · ', t('prof.since', { date: S.date(u.created) }))),
    h('span.badge' + (sus > 20 ? '.red' : sus > 5 ? '.gold' : '.green'), t('adm.sus'), ' ', String(sus))),
    h('div.meta', h('span.mi', h('b', { style: { color: r.color } }, S.num(u.rn)), ' RN · ', r.name), h('span.mi', S.coinIco(), S.num(u.coins)), h('span.mi', t('adm.donated'), ' ', h('b.gold', S.num(u.donated) + ' ₽')),
      u.clan ? S.clanBadge(u.clan) : null),
    u.banned ? h('div.notice.err', t('adm.bannedto', { date: S.dt(u.banned) }), u.banReason ? ' — ' + u.banReason : '') : null,
    (u.reports || []).length ? h('details.reps', h('summary', t('adm.reports'), ' · ', String(u.reports.length)), h('ul', u.reports.map(x => h('li', h('span.dim.tiny', S.dt(x.created)), ' ', h('b', x.kind), ' ', h('code', String(x.detail || '')))))) : null,
    h('details.edit.aact', { open: !!single }, h('summary', t('adm.actions')),
      h('div.arow', hours, h('span.dim.tiny', t('adm.h')), reason, banB, u.banned ? unB : null),
      h('div.arow', coins, coinB, rn, rnB),
      h('div.arow', susB, progB, roleB)),
  ]);
  return el;
}
function usersTab(box, ctx) {
  const q = S.input({ type: 'search', placeholder: t('adm.uq'), 'aria-label': t('adm.uq'), class: 'inp search' });
  const go = h('button.btn.small.green', { type: 'submit' }, t('adm.find'));
  const susB = h('button.btn.small.gold', { type: 'button' }, t('adm.suslist'));
  const res = h('div.ausers');
  const f = h('form.toolbar', h('div.sbox', S.img(PX.glyph('eye', '#9a9888', 2), 'sico'), q), go, susB);
  S.clear(box).append(f, res);
  const redraw = (old, nu) => old.replaceWith(userCard(nu, redraw, true));
  const load = (query) => { S.clear(res).appendChild(S.loading()); S.get('/api/admin/users?q=' + encodeURIComponent(query)).then(r => {
    if (!ctx.alive()) return; S.clear(res);
    const us = r.users || []; if (!us.length) { res.appendChild(S.empty(t('adm.nousers'), 'people')); return; }
    for (const u of us) res.appendChild(userCard(u, redraw, us.length === 1));
  }).catch(e => { if (ctx.alive()) S.clear(res).appendChild(S.errorBox(e)); }); };
  f.addEventListener('submit', (e) => { e.preventDefault(); load(q.value.trim()); });
  susB.addEventListener('click', () => { q.value = 'sus'; load('sus'); });
  load('');
}

function table(head, rows) { return h('div.tablewrap', h('table.tbl', h('thead', h('tr', head.map(x => h('th' + (x.r ? '.r' : ''), x.l || x)))), h('tbody', rows))); }

function reportsTab(box, ctx) {
  S.clear(box).appendChild(S.loading());
  S.get('/api/admin/reports').then(r => {
    if (!ctx.alive()) return; S.clear(box);
    const rs = r.reports || []; if (!rs.length) { box.appendChild(S.empty(t('adm.noreports'), 'check')); return; }
    box.appendChild(table([t('ord.date'), t('clan.player'), t('adm.kind'), t('adm.detail'), { l: t('adm.sus'), r: 1 }],
      rs.map(x => h('tr', h('td.dim', S.dt(x.created)), h('td', S.userLink({ id: x.pubid, name: x.name })), h('td', h('b', x.kind)), h('td', h('code.wrapc', String(x.detail || ''))), h('td.r', String(+(+x.sus || 0).toFixed(1)))))));
  }).catch(e => { if (ctx.alive()) S.clear(box).appendChild(S.errorBox(e)); });
}

function ordersTab(box, ctx) {
  let P = new Map();
  const draw = (r) => {
    S.clear(box);
    const os = r.orders || []; if (!os.length) { box.appendChild(S.empty(t('ord.none'), 'coin')); return; }
    box.appendChild(table([t('ord.date'), t('adm.label'), t('clan.player'), t('ord.item'), { l: t('ord.sum'), r: 1 }, t('ord.status'), ''],
      os.map(o => {
        const b = o.status !== 'paid' ? h('button.btn.tiny.gold', { type: 'button' }, t('adm.markpaid')) : null;
        if (b) b.addEventListener('click', async () => { if (await S.confirm(t('adm.markpaid'), t('adm.markpaidq', { label: o.label, sum: o.price }), t('adm.markpaid'))) S.busy(b, async () => { draw(await S.post('/api/admin/orders/' + encodeURIComponent(o.label) + '/paid')); S.toast(t('ui.saved'), 'ok'); }); });
        return h('tr', h('td.dim', S.dt(o.created)), h('td.mono.tiny', o.label), h('td', S.userLink({ id: o.pubid, name: o.name })), h('td', P.get(o.product) ? S.pname(P.get(o.product)) : o.product), h('td.r', S.num(o.price) + ' ₽'),
          h('td', h('span.badge.' + ({ paid: 'green', new: 'gold', underpaid: 'red' }[o.status] || 'gold'), t('ord.s.' + o.status)), o.paid_sum && o.status !== 'paid' ? h('span.dim.tiny', ' ' + o.paid_sum + ' ₽') : null), h('td', b));
      })));
  };
  S.clear(box).appendChild(S.loading());
  Promise.all([S.get('/api/admin/orders'), S.get('/api/shop').catch(() => ({ products: [] }))]).then(([r, shop]) => { if (!ctx.alive()) return; P = new Map((shop.products || []).map(p => [p.id, p])); draw(r); }).catch(e => { if (ctx.alive()) S.clear(box).appendChild(S.errorBox(e)); });
}

function skinsTab(box, ctx) {
  const draw = (r) => {
    S.clear(box);
    const ss = r.skins || []; if (!ss.length) { box.appendChild(S.empty(t('adm.noskins'), 'shirt')); return; }
    box.appendChild(h('div.skingrid', ss.map(s => {
      const rej = h('button.btn.tiny.red', { type: 'button' }, t('adm.reject')), ok = h('button.btn.tiny.green', { type: 'button' }, t('adm.approve'));
      rej.addEventListener('click', () => S.busy(rej, async () => draw(await S.post('/api/admin/skins/' + encodeURIComponent(s.id), { status: 'rejected' }))));
      ok.addEventListener('click', () => S.busy(ok, async () => draw(await S.post('/api/admin/skins/' + encodeURIComponent(s.id), { status: 'ok' }))));
      return h('div.skin.panel' + (s.status === 'rejected' ? '.rej' : ''),
        s.status !== 'rejected' ? h('img.skimg', { src: S.base() + '/skins/' + encodeURIComponent(s.id) + '.png', alt: s.name, loading: 'lazy' }) : h('div.skimg.none', '✕'),
        h('b', s.name), h('span.tiny', S.userLink({ id: s.pubid, name: s.owner })), h('span.dim.tiny', S.date(s.created)),
        h('div.row.gap', s.status === 'rejected' ? ok : rej));
    })));
  };
  S.clear(box).appendChild(S.loading());
  S.get('/api/admin/skins').then(r => { if (ctx.alive()) draw(r); }).catch(e => { if (ctx.alive()) S.clear(box).appendChild(S.errorBox(e)); });
}

function serversTab(box, ctx) {
  const draw = (r) => {
    S.clear(box);
    const ss = r.servers || []; if (!ss.length) { box.appendChild(S.empty(t('srv.none'), 'globe')); return; }
    box.appendChild(table(['ID', t('srv.name'), t('srv.owner'), t('adm.paidto'), { l: t('srv.max'), r: 1 }, '', t('adm.days')],
      ss.map(s => {
        const days = S.input({ type: 'number', value: 30, min: -3650, max: 3650, class: 'inp num', 'aria-label': t('adm.days') });
        const b = h('button.btn.tiny.gold', { type: 'button' }, t('adm.adddays'));
        b.addEventListener('click', () => { const n = parseInt(days.value, 10); if (n) S.busy(b, async () => { draw(await S.post('/api/admin/servers/' + encodeURIComponent(s.id) + '/days', { days: n })); S.toast(t('ui.saved'), 'ok'); }); });
        const alive = s.paid_until > Date.now();
        return h('tr', h('td.dim', '#' + s.id), h('td', h('b', s.name), s.tags ? h('div.dim.tiny', String(s.tags).split(',').filter(Boolean).map(x => '#' + x).join(' ')) : null), h('td', s.owner_name),
          h('td', h('span.badge.' + (alive ? 'green' : 'red'), S.date(s.paid_until))), h('td.r', String(s.max)), h('td', s.pvp ? h('span.badge.red', 'PvP') : h('span.badge.green', 'PvE')), h('td', h('div.row.gap', days, b)));
      })));
  };
  S.clear(box).appendChild(S.loading());
  S.get('/api/admin/servers').then(r => { if (ctx.alive()) draw(r); }).catch(e => { if (ctx.alive()) S.clear(box).appendChild(S.errorBox(e)); });
}

const RENDER = { stats: statsTab, tickets: ticketsTab, users: usersTab, reports: reportsTab, orders: ordersTab, skins: skinsTab, servers: serversTab };

S.pages.admin = (main, p, ctx) => {
  if (!S.needLogin(main)) return;
  if (!S.me.admin) { main.appendChild(h('section.sec.first', h('div.wrap.narrow.c', S.empty(t('adm.denied'), 'lock'), h('a.btn.ghost', { href: '#/' }, t('ui.home'))))); return; }
  const box = h('div.abox');
  const tabs = h('div.atabs', { role: 'tablist' }, TABS.map(k => h('button.atab' + (k === tab ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(k === tab), 'data-t': k }, S.img(PX.glyph(TAB_ICON[k], k === tab ? '#e8b030' : '#9a9888', 2)), h('span', t('adm.tab.' + k)))));
  let sub = null;
  const open = (k) => {
    tab = k; try { sessionStorage.setItem('tz_site_admtab', k); } catch (e) { /* ignore */ }
    for (const b of tabs.children) { const on = b.dataset.t === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.querySelector('img').src = PX.url(PX.glyph(TAB_ICON[b.dataset.t], on ? '#e8b030' : '#9a9888', 2)); }
    // a sub-context so a tab's timers stop when another tab opens
    const my = (sub = {}); const subctx = { alive: () => ctx.alive() && sub === my, every: (ms, fn) => ctx.every(ms, () => { if (sub === my) fn(); }), later: ctx.later, onLeave: ctx.onLeave };
    S.clear(box); RENDER[k](box, subctx);
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) open(b.dataset.t); });
  main.appendChild(h('section.sec.first', h('div.wrap',
    h('div.pagehead', S.img(PX.badge(['star', '#e8b030', 'shield'], 64), 'phico'), h('div.grow', h('h1.ttl', t('adm.title')), h('p.sub', t('adm.sub')))),
    tabs, h('div.panel.pad.apanel', box))));
  open(tab);
};
})();
