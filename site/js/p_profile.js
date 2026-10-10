// =====================================================================
//  THE ZOMBIES — website: my profile (card, stats, RN history, friends,
//  orders, security), public profiles, device sign-in for the apps.
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;
const STATS = ['kills', 'deaths', 'nights', 'maxDay', 'built', 'km', 'recruited', 'animals', 'heads', 'pvpKills', 'boss'];
const STAT_ICON = { kills: 'skull', deaths: 'cross', nights: 'moon', maxDay: 'star', built: 'brick', km: 'wheel', recruited: 'people', animals: 'paw', heads: 'eye', pvpKills: 'blade', boss: 'bomb' };

// ---------------------------------------------------------------- pieces
function avatar(p, size) {
  const r = S.rank(p.rank);
  return h('div.ava', { style: { '--rc': r.color } }, S.img(PX.classIcon({ id: p.cls || 'survivor', color: r.color, icon: 'skull', price: 0 }, size || 96)), p.online ? h('span.dot.on.adot') : null);
}
function profileCard(p, self) {
  const r = S.rank(p.rank), d = self ? p.data || {} : {};
  return h('section.pcard.panel.reveal', { style: { '--rc': r.color } },
    h('div.pbanner', { 'aria-hidden': 'true' }),
    h('div.ptop',
      avatar(p),
      h('div.pmain',
        h('h1.pname', p.name, p.role === 'support' || (self && p.admin) ? h('span.badge.gold.staff', t('prof.staff')) : null),
        h('div.prow', S.idTag(p.id), self ? null : h('span.mi', p.online ? h('span.ok', '● ' + t('ui.online')) : t('prof.seen', { when: S.ago(p.lastSeen) }))),
        h('div.prank', h('b', { style: { color: r.color } }, r.name), ' · ', t('prof.level', { n: p.level })),
        p.clan ? h('div.prow', S.clanBadge(p.clan), p.clan.role ? h('span.dim', ' ' + t('role.' + p.clan.role)) : null) : null)),
    h('div.pnums',
      h('div.pn', h('b.big', { style: { color: r.color } }, S.num(p.rn)), h('span', 'RN')),
      h('div.pn', h('b.big', S.num(p.rnPeak || p.rn)), h('span', t('prof.peak'))),
      self ? h('div.pn', h('b.big.gold', S.coinIco(), S.num(d.coins)), h('span', t('prof.coins'))) : null,
      h('div.pn', h('b.big', S.num(p.achCount || 0)), h('span', t('prof.ach'))),
      h('div.pn', h('b.big.cls', S.cname(p.cls || 'survivor')), h('span', t('prof.class')))),
    h('div.pfoot', h('span', t('prof.since', { date: S.date(p.created) })),
      self ? h('span', p.email ? [p.email, ' ', p.verified ? h('span.ok', '✓') : h('span.warn', t('prof.unverified'))] : null) : null,
      self && p.google ? h('span.badge', 'Google') : null, self && p.apple ? h('span.badge', 'Apple') : null));
}
function statsGrid(st) {
  st = st || {};
  return h('section.panel.pad.reveal', h('h2.ptitle', t('prof.stats')),
    h('div.stgrid', STATS.map(k => h('div.st', S.img(PX.glyph(STAT_ICON[k], '#9a9888', 3), 'stico'), h('b', k === 'km' ? (+st[k] || 0).toFixed(1) : S.num(st[k] || 0)), h('span', t('st.' + k))))));
}
function rnChart(hist, rn) {
  const pts = []; let v = rn;
  for (let i = hist.length - 1; i >= 0; i--) { pts.unshift(v); v -= hist[i].d; } pts.unshift(v);
  const W = 160, H = 48, c = PX.canvas(W, H), g = c.g;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = Math.max(1, hi - lo);
  const X = (i) => Math.round(i / Math.max(1, pts.length - 1) * (W - 1)), Y = (v) => Math.round(H - 4 - (v - lo) / span * (H - 10));
  for (let y = 0; y < H; y += 8) { g.fillStyle = 'rgba(90,96,70,.25)'; g.fillRect(0, y, W, 1); }
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = X(i), x1 = X(i + 1), y0 = Y(pts[i]), y1 = Y(pts[i + 1]);
    for (let x = x0; x <= x1; x++) { const y = Math.round(y0 + (y1 - y0) * ((x - x0) / Math.max(1, x1 - x0))); g.fillStyle = 'rgba(232,176,48,.16)'; g.fillRect(x, y, 1, H - y); g.fillStyle = '#e8b030'; g.fillRect(x, y, 1, 2); }
  }
  const lx = X(pts.length - 1), ly = Y(pts[pts.length - 1]); g.fillStyle = '#fff3b0'; g.fillRect(lx - 1, ly - 1, 3, 3);
  return h('img.rnchart', { src: c.toDataURL(), alt: '' });
}
function historyBlock(me) {
  const hist = (me.data && me.data.history) || [];
  return h('section.panel.pad.reveal', h('h2.ptitle', t('prof.history')),
    hist.length < 1 ? S.empty(t('prof.nohist'), 'moon') : [
      rnChart(hist, me.data.rn != null ? me.data.rn : me.rn),
      h('ul.hist', hist.slice(-14).reverse().map(x => h('li', h('span.hd', S.dt(x.t)), h('span.hw', S.why(x.why)), h('b' + (x.d >= 0 ? '.ok' : '.err'), (x.d > 0 ? '+' : '') + x.d))))]);
}
function friendRow(f, actions) {
  const r = S.rank(f.rank);
  return h('li.fr', S.onlineDot(f.online), S.userLink(f), h('span.frk', { style: { color: r.color } }, S.num(f.rn)), f.playing ? h('span.badge.green.tiny', t('fr.playing')) : (!f.online && f.lastSeen ? h('span.dim.tiny', S.ago(f.lastSeen)) : null), actions || null);
}
function friendsBlock(ctx) {
  const box = h('section.panel.pad.reveal', h('h2.ptitle', t('fr.title')), S.loading());
  const load = () => S.get('/api/friends').then(r => {
    if (!ctx.alive()) return;
    while (box.childNodes.length > 1) box.removeChild(box.lastChild);
    const inc = r.incoming || [], fr = r.friends || [], out = r.outgoing || [];
    const unread = new Map((r.unread || []).map(u => [u.id, u.n]));
    if (inc.length) box.appendChild(h('div.frgroup', h('div.flabel', t('fr.incoming'), ' ', h('span.badge.red', String(inc.length))), h('ul.frl', inc.map(f => {
      const a = h('button.btn.tiny.green', { type: 'button' }, t('fr.accept')), d = h('button.btn.tiny.ghost', { type: 'button' }, t('fr.decline'));
      a.addEventListener('click', () => S.busy(a, async () => { await S.post('/api/friends/accept', { id: f.id }); S.toast(t('fr.accepted', { name: f.name }), 'ok'); load(); }));
      d.addEventListener('click', () => S.busy(d, async () => { await S.post('/api/friends/decline', { id: f.id }); load(); }));
      return friendRow(f, h('span.fract', a, d));
    }))));
    box.appendChild(h('div.frgroup', h('div.flabel', t('fr.list'), ' · ', String(fr.length)),
      fr.length ? h('ul.frl', fr.map(f => friendRow(f, unread.get(f.id) ? h('span.badge.gold.tiny', { title: t('fr.unread') }, '✉ ' + unread.get(f.id)) : null))) : h('p.dim', t('fr.none'))));
    if (out.length) box.appendChild(h('div.frgroup', h('div.flabel', t('fr.outgoing')), h('ul.frl', out.map(f => friendRow(f, h('span.dim.tiny', t('fr.waiting')))))));
    box.appendChild(h('p.hint', t('fr.hint')));
  }).catch(e => { if (ctx.alive()) { while (box.childNodes.length > 1) box.removeChild(box.lastChild); box.appendChild(S.errorBox(e, load)); } });
  load(); ctx.every(30000, load);
  return box;
}
function ordersBlock(ctx) {
  const box = h('section.panel.pad.reveal', h('h2.ptitle', t('ord.title')), S.loading());
  Promise.all([S.get('/api/shop/orders'), S.get('/api/shop').catch(() => ({ products: [] }))]).then(([r, shop]) => {
    if (!ctx.alive()) return; box.removeChild(box.lastChild);
    const P = new Map((shop.products || []).map(p => [p.id, p]));
    const list = r.orders || [];
    if (!list.length) { box.appendChild(h('p.dim', t('ord.none'))); box.appendChild(h('a.btn.small.gold', { href: '#/donate' }, t('nav.donate'))); return; }
    box.appendChild(h('div.tablewrap', h('table.tbl', h('thead', h('tr', h('th', t('ord.date')), h('th', t('ord.item')), h('th.r', t('ord.sum')), h('th', t('ord.status')))),
      h('tbody', list.map(o => h('tr', h('td.dim', S.sdate(o.created)), h('td', P.get(o.product) ? S.pname(P.get(o.product)) : o.product), h('td.r', S.num(o.price) + ' ₽'),
        h('td', h('span.badge.' + ({ paid: 'green', new: 'gold', underpaid: 'red' }[o.status] || 'gold'), t('ord.s.' + o.status)), o.status === 'new' ? h('a.tiny.link', { href: '#/paid/' + encodeURIComponent(o.label) }, ' ' + t('ord.check')) : null)))))));
  }).catch(e => { if (ctx.alive()) { box.removeChild(box.lastChild); box.appendChild(S.errorBox(e)); } });
  return box;
}
function securityBlock(me) {
  const f = h('form.form', { novalidate: true },
    me.hasPassword ? S.field(t('sec.old'), S.input({ type: 'password', name: 'old', autocomplete: 'current-password', required: true })) : h('p.note', t('sec.nopw')),
    S.field(t('auth.newpw'), S.input({ type: 'password', name: 'password', autocomplete: 'new-password', required: true, minlength: 8 }), t('auth.pwhint')),
    h('button.btn.green', { type: 'submit' }, me.hasPassword ? t('sec.change') : t('sec.set')));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    S.busy(f.querySelector('button[type=submit]'), async () => {
      const r = await S.post('/api/auth/password', { old: f.elements.old ? f.elements.old.value : undefined, password: f.elements.password.value });
      S.login(r); S.toast(t('sec.changed'), 'ok'); f.reset();
    });
  });
  const lo = h('button.btn.ghost', { type: 'button' }, t('sec.logout'));
  lo.addEventListener('click', () => S.busy(lo, async () => { try { await S.post('/api/auth/logout'); } catch (e) { /* token may be gone */ } S.setToken(null); S.me = null; S.renderUser(); S.toast(t('sec.bye'), 'ok'); location.hash = '#/'; }));
  const la = h('button.btn.red', { type: 'button' }, t('sec.logoutall'));
  la.addEventListener('click', () => S.busy(la, async () => {
    if (!(await S.confirm(t('sec.logoutall'), t('sec.logoutallq'), t('sec.logoutall'), true))) return;
    await S.post('/api/auth/logout-all'); S.setToken(null); S.me = null; S.renderUser(); S.toast(t('sec.bye'), 'ok'); location.hash = '#/';
  }));
  return h('section.panel.pad.reveal', h('h2.ptitle', t('sec.title')), f, h('div.sep'), h('div.row.gap.wrapr', lo, la), h('p.hint', t('sec.hint')));
}

// ---------------------------------------------------------------- pages
S.pages.profile = (main, p, ctx) => {
  if (!S.me) {
    main.appendChild(h('section.sec.first', h('div.wrap.narrow', h('div.panel.pad.authpanel.reveal',
      S.img(PX.badge(['shield', '#d2322a', 'skull'], 64), 'authico'),
      h('h1.ttl.c', t('auth.title')), h('p.sub.c', t('auth.sub')), S.pages.authBlock()))));
    return;
  }
  const wrap = h('div.wrap', S.loading());
  main.appendChild(h('section.sec.first', wrap));
  S.loadMe().then((me) => {
    if (!ctx.alive()) return;
    if (!me) { S.route(true); return; }
    S.clear(wrap);
    wrap.appendChild(h('div.pgrid',
      h('div.pcol', profileCard(me, true), statsGrid(me.stats), historyBlock(me)),
      h('div.pcol', me.admin ? h('a.panel.pad.adminlink.reveal', { href: '#/admin' }, S.img(PX.badge(['star', '#e8b030', 'shield'], 48)), h('div', h('b', t('nav.admin')), h('p.dim', t('adm.go')))) : null,
        friendsBlock(ctx), ordersBlock(ctx), securityBlock(me),
        h('a.panel.pad.adminlink.reveal', { href: '#/support' }, S.img(PX.badge(['circle', '#5fd0ff', 'chat'], 48)), h('div', h('b', t('nav.support')), h('p.dim', t('sup.go')))))));
    S.reveal(wrap);
  });
};

S.pages.user = (main, params, ctx) => {
  const id = params[0].toUpperCase();
  const wrap = h('div.wrap.mid', S.loading());
  main.appendChild(h('section.sec.first', wrap));
  S.get('/api/users/' + encodeURIComponent(id)).then((r) => {
    if (!ctx.alive()) return; S.clear(wrap);
    const p = r.profile;
    if (S.me && S.me.id === p.id) wrap.appendChild(h('div.notice', t('prof.yours'), ' ', h('a.link', { href: '#/profile' }, t('nav.profile'))));
    wrap.appendChild(profileCard(p, false));
    wrap.appendChild(statsGrid(p.stats));
    S.reveal(wrap);
  }).catch((e) => { if (ctx.alive()) S.clear(wrap).appendChild(S.errorBox(e)); });
};

S.pages.device = (main, params, ctx) => {
  const code = params[0].toUpperCase();
  if (!S.needLogin(main, t('dev.login'))) { const c = S.$('.authpanel', main); if (c) c.insertBefore(h('div.devcode', code), c.children[2]); return; }
  const box = h('div.panel.pad.devbox.c.reveal');
  main.appendChild(h('section.sec.first', h('div.wrap.narrow', box)));
  const draw = () => {
    S.clear(box);
    const ok = h('button.btn.green.big', { type: 'button' }, t('dev.approve'));
    ok.addEventListener('click', () => S.busy(ok, async () => {
      await S.post('/api/auth/device/approve', { code });
      S.clear(box).append(h('div.okburst', S.img(PX.badge(['star', '#8fd86a', 'check'], 96))), h('h1.ttl.ok', t('dev.done')), h('p.sub', t('dev.donesub')));
    }));
    box.append(S.img(PX.badge(['shield', '#5fd0ff', 'phone'], 80), 'authico'), h('h1.ttl', t('dev.title')), h('p.sub', t('dev.sub', { name: S.me.name })), h('div.devcode', code),
      h('p.hint', t('dev.warn')), h('div.row.center.gap', ok, h('a.btn.ghost', { href: '#/' }, t('ui.cancel'))));
  };
  draw();
  void ctx;
};
})();
