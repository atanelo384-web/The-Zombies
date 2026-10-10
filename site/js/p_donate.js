// =====================================================================
//  THE ZOMBIES — website: shop (YooMoney), classes, payment status.
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;

async function buy(p, btn) {
  if (!S.me) { S.goLogin(); return; }
  await S.busy(btn, async () => S.goPay(await S.post('/api/shop/order', { product: p.id })));
}

function productCard(p, payReady) {
  const btn = h('button.btn.green.wide.buy', { type: 'button', disabled: !payReady }, t('shop.buy'), ' — ', h('b', S.num(p.price) + ' ₽'));
  btn.addEventListener('click', () => buy(p, btn));
  const extra = [];
  if (p.coins) extra.push(h('span.give.coins', '+', S.num(p.coins), ' ', S.coinIco()));
  if (p.classes && p.classes.length) extra.push(h('span.give', t('shop.classes'), ': ', p.classes.map(c => S.cname(c)).join(', ')));
  if (p.items) extra.push(h('span.give', t('shop.kit', { n: Object.keys(p.items).length })));
  if (p.coinPrice) extra.push(h('span.give.dim', t('shop.orcoins', { n: S.num(p.coinPrice) })));
  return h('article.prod.panel.reveal' + (p.best ? '.best' : '') + (p.id === 'server' ? '.srvp' : ''),
    p.best ? h('span.ribbon', t('shop.best')) : null,
    h('div.prodico', S.img(PX.shopIcon(p.icon, 72))),
    p.id === 'server' ? h('div.srvtxt', h('h3', S.pname(p)), h('p.pdesc', S.pdesc(p)), h('span.give.coins', S.num(p.price) + ' ₽ / 30 ' + t('u.days'))) : [h('h3', S.pname(p)), h('p.pdesc', S.pdesc(p)), h('div.gives', extra), h('div.grow')],
    p.id === 'server' ? h('a.btn.gold', { href: '#/servers' }, t('shop.toservers')) : btn);
}

S.pages.donate = (main, p, ctx) => {
  const body = h('div', S.loading());
  main.appendChild(h('section.sec.first', h('div.wrap',
    h('div.pagehead', S.img(PX.badge(['circle', '#f0c040', 'coin'], 64), 'phico'), h('div.grow', h('h1.ttl', t('shop.title')), h('p.sub', t('shop.sub')))),
    body)));
  S.get('/api/shop').then((r) => {
    if (!ctx.alive()) return; S.clear(body);
    if (!r.payReady) body.appendChild(h('div.notice.warn', S.img(PX.glyph('lock', '#e8b030', 2)), t('shop.notready')));
    const prods = r.products || [];
    const groups = [
      ['shop.g.coins', prods.filter(x => /^coins_/.test(x.id))],
      ['shop.g.kits', prods.filter(x => !/^coins_/.test(x.id) && x.id !== 'server')],
      ['shop.g.server', prods.filter(x => x.id === 'server')],
    ];
    for (const [k, list] of groups) if (list.length) body.appendChild(h('div.group', h('h2.gtitle', t(k)), h('div.prodgrid', list.map(x => productCard(x, r.payReady)))));
    body.appendChild(h('div.paynote', S.img(PX.glyph('lock', '#8fd86a', 2)), h('span', t('shop.safe'))));
    // classes
    const cls = r.classes || [];
    body.appendChild(h('div.group',
      S.sectionHead(t('cls.title'), t('cls.sub')),
      h('div.clsgrid', cls.map(c => {
        const owned = S.me && S.me.data && (S.me.data.classes || []).includes(c.id);
        return h('article.cls.panel.reveal', { style: { '--cc': S.color(c.color) } },
          h('div.clsico', S.img(PX.classIcon(c, 56))),
          h('h3', S.cname(c)), h('p', S.cdesc(c)),
          h('div.cprice', owned ? h('span.badge.green', '✓ ' + t('cls.owned')) : c.price ? h('span.price', S.coinIco(), S.num(c.price)) : h('span.badge', t('cls.free'))));
      })),
      h('p.hint.c', t('cls.how'))));
    S.reveal(body);
  }).catch((e) => { if (ctx.alive()) S.clear(body).appendChild(S.errorBox(e, () => S.route(true))); });
};

// ---------------------------------------------------------------- after payment
S.pages.paid = (main, params, ctx) => {
  const label = params[0];
  if (!S.needLogin(main, t('paid.login'))) return;
  const box = h('div.panel.pad.paidbox.c');
  main.appendChild(h('section.sec.first', h('div.wrap.narrow', box)));
  const waiting = () => S.clear(box).append(
    h('div.spinner', { 'aria-hidden': 'true' }, S.img(PX.badge(['circle', '#f0c040', 'coin'], 80))),
    h('h1.ttl', t('paid.wait')), h('p.sub', t('paid.waitsub')), h('p.dim.mono', label), S.loading());
  waiting();
  let tries = 0;
  const check = async () => {
    tries++;
    try {
      const r = await S.get('/api/shop/orders/' + encodeURIComponent(label));
      if (!ctx.alive()) return;
      if (r.order && r.order.status === 'paid') {
        S.clear(box).append(h('div.okburst', { 'aria-hidden': 'true' }, S.img(PX.badge(['star', '#8fd86a', 'check'], 96))),
          h('h1.ttl.ok', t('paid.ok')), h('p.sub', t('paid.oksub')),
          h('div.row.center.gap', h('a.btn.green', { href: '#/profile' }, t('nav.profile')), r.order.product === 'server' ? h('a.btn.gold', { href: '#/servers' }, t('srv.mine')) : null));
        S.loadMe(); return;
      }
      if (r.order && r.order.status === 'underpaid') { S.clear(box).append(h('h1.ttl.err', t('paid.under')), h('p.sub', t('paid.undersub')), h('a.btn.red', { href: '#/support' }, t('nav.support'))); return; }
      if (tries > 200) { S.clear(box).append(h('h1.ttl', t('paid.long')), h('p.sub', t('paid.longsub')), h('a.btn.ghost', { href: '#/support' }, t('nav.support'))); return; }
      ctx.later(3000, check);
    } catch (e) { if (!ctx.alive()) return; if (e.status === 404) { S.clear(box).append(S.errorBox(e)); return; } ctx.later(3000, check); }
  };
  check();
};
})();
