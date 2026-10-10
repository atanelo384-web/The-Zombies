// =====================================================================
//  THE ZOMBIES — website: public servers, buying a server, "my servers".
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;
const DIFFS = ['easy', 'normal', 'hard'];
const diffLabel = (d) => t('diff.' + (DIFFS.includes(d) ? d : 'normal'));

function goPay(r) {
  const url = S.safeUrl(r && r.url);
  if (!/^(https?:\/\/|\/)/.test(url)) throw new Error(t('err.unknown'));
  S.toast(t('shop.redirect'), 'ok');
  location.href = url;
}
S.goPay = goPay;

function serverCard(s, onTag, first) {
  const max = Math.max(1, s.max || 16), pl = Math.max(0, s.players || 0), live = pl > 0;
  const tags = (s.tags || []).map(x => h('button.tag', { type: 'button', onclick: () => onTag('#' + x) }, '#' + x));
  const list = (s.list || []).length ? h('details.plist', h('summary', t('srv.who', { n: s.list.length })), h('div.names', s.list.map(n => h('span.pname', n)))) : null;
  return h('article.srv.panel' + (live ? '.live' : '') + (first ? '.reveal' : ''),
    h('div.srvtop',
      h('span.dot' + (s.online ? '.on' : ''), { title: s.online ? t('srv.up') : t('srv.idle') }),
      h('h3.srvname', s.name),
      h('span.pcount' + (live ? '.on' : ''), h('b', String(pl)), '/' + max)),
    tags.length ? h('div.tags', tags) : null,
    s.descr ? h('p.descr', s.descr) : null,
    h('div.bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(pl) }, h('i', { style: { width: Math.min(100, pl / max * 100) + '%' } })),
    h('div.meta',
      h('span.badge' + (s.pvp ? '.red' : '.green'), s.pvp ? 'PvP' : 'PvE'),
      h('span.badge.d-' + (DIFFS.includes(s.diff) ? s.diff : 'normal'), diffLabel(s.diff)),
      s.owner ? h('span.mi', t('srv.owner'), ' ', h('b', s.owner)) : null,
      s.peak ? h('span.mi', t('srv.peak', { n: s.peak })) : null),
    list,
    h('a.btn.small' + (live ? '.green' : '.ghost') + '.play', { href: S.base() + '/play/' }, t('srv.play')));
}

function createDialog(price) {
  if (!S.me) { S.goLogin(); return; }
  const f = h('form.form', { novalidate: true },
    h('p.note', t('srv.buytext', { price })),
    S.field(t('srv.name'), S.input({ name: 'name', required: true, minlength: 3, maxlength: 32, value: S.me.name + ' — ' + t('srv.server') })),
    S.field(t('srv.tags'), S.input({ name: 'tags', maxlength: 100, placeholder: '#pvp #rp #survival' }), t('srv.tagshint')),
    h('div.row.gap.wrapr',
      S.field(t('srv.max'), S.input({ type: 'number', name: 'max', min: 2, max: 32, value: 16, inputmode: 'numeric' })),
      h('div.field', h('span.flabel', t('srv.mode')), S.check(t('srv.pvp'), { name: 'pvp' }))),
    h('p.formerr', { role: 'alert' }),
    h('button.btn.gold.wide', { type: 'submit' }, t('srv.pay', { price })));
  const m = S.modal(t('srv.create'), f);
  f.addEventListener('submit', (e) => {
    e.preventDefault(); const btn = f.querySelector('button[type=submit]'), err = f.querySelector('.formerr');
    S.busy(btn, async () => {
      try {
        const r = await S.post('/api/shop/order', { product: 'server', name: f.elements.name.value.trim(), tags: f.elements.tags.value, pvp: f.elements.pvp.checked, max: Math.max(2, Math.min(32, parseInt(f.elements.max.value, 10) || 16)) });
        goPay(r);
      } catch (x) { err.textContent = S.errText(x); err.classList.add('show'); }
    });
  });
  return m;
}

function mineCard(s, reload, price) {
  const left = Math.ceil((s.until - Date.now()) / 864e5);
  const status = left > 0 ? h('span.badge' + (left <= 5 ? '.gold' : '.green'), t('srv.until', { date: S.date(s.until) }), ' · ', t('srv.daysleft', { n: left })) : h('span.badge.red', t('srv.expired'));
  // edit form
  const diffSel = h('select.inp', { name: 'diff' }, DIFFS.map(d => h('option', { value: d, selected: s.diff === d }, diffLabel(d))));
  const f = h('form.form.grid2', { novalidate: true },
    S.field(t('srv.name'), S.input({ name: 'name', value: s.name, minlength: 3, maxlength: 32, required: true })),
    S.field(t('srv.tags'), S.input({ name: 'tags', value: (s.tags || []).map(x => '#' + x).join(' '), maxlength: 100 })),
    h('label.field.span2', h('span.flabel', t('srv.descr')), h('textarea.inp', { name: 'descr', maxlength: 200, rows: 2 }, s.descr || '')),
    S.field(t('srv.max'), S.input({ type: 'number', name: 'max', min: 2, max: 32, value: s.max, inputmode: 'numeric' })),
    S.field(t('srv.diff'), diffSel),
    h('div.field', h('span.flabel', t('srv.mode')), S.check(t('srv.pvp'), { name: 'pvp', checked: !!s.pvp })),
    h('div.field.end', h('button.btn.green', { type: 'submit' }, t('ui.save'))));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    S.busy(f.querySelector('button[type=submit]'), async () => {
      const max = parseInt(f.elements.max.value, 10);
      await S.post('/api/servers/edit', { id: s.id, name: f.elements.name.value.trim(), tags: f.elements.tags.value, descr: f.elements.descr.value, max: Math.max(2, Math.min(32, max || s.max)), pvp: f.elements.pvp.checked, diff: f.elements.diff.value });
      S.toast(t('ui.saved'), 'ok'); reload();
    });
  });
  // moderation
  const pid = S.input({ name: 'player', placeholder: t('srv.pid'), maxlength: 9, autocomplete: 'off', class: 'inp mono' });
  const act = (op, player, btn) => S.busy(btn, async () => {
    const id = String(player || '').trim().replace(/^#/, '').toUpperCase();
    if (op !== 'wipe' && !/^[2-9A-HJ-NP-Z]{8}$/.test(id)) { S.toast(t('srv.badpid'), 'err'); return; }
    if (op === 'wipe' && !(await S.confirm(t('srv.wipe'), t('srv.wipeq', { name: s.name }), t('srv.wipe'), true))) return;
    if (op === 'ban' && !(await S.confirm(t('srv.ban'), t('srv.banq', { id }), t('srv.ban'), true))) return;
    await S.post('/api/servers/action', { id: s.id, op, player: op === 'wipe' ? undefined : id });
    S.toast(t('srv.done.' + op), 'ok'); reload();
  });
  const kb = h('button.btn.small.ghost', { type: 'button' }, t('srv.kick')); kb.addEventListener('click', () => act('kick', pid.value, kb));
  const bb = h('button.btn.small.red', { type: 'button' }, t('srv.ban')); bb.addEventListener('click', () => act('ban', pid.value, bb));
  const wb = h('button.btn.small.red', { type: 'button' }, t('srv.wipe')); wb.addEventListener('click', () => act('wipe', '', wb));
  const xb = h('button.btn.small.gold', { type: 'button' }, t('srv.extend', { price })); xb.addEventListener('click', () => S.busy(xb, async () => goPay(await S.post('/api/shop/order', { product: 'server', serverId: s.id }))));
  const bans = (s.bans || []).length ? h('div.bans', (s.bans || []).map(b => { const u = h('button.chipx', { type: 'button', title: t('srv.unban') }, '#' + b, h('i', '×')); u.addEventListener('click', () => act('unban', b, u)); return u; })) : h('p.dim', t('srv.nobans'));
  return h('article.mine.panel.reveal' + (s.players ? '.live' : ''),
    h('div.minehead', h('div', h('h3', s.name, ' ', h('span.dim', '#' + s.id)), h('div.meta', status, h('span.mi', t('srv.online', { n: s.players || 0, max: s.max })), s.peak ? h('span.mi', t('srv.peak', { n: s.peak })) : null)), xb),
    (s.list || []).length ? h('div.names', s.list.map(n => h('span.pname', n))) : null,
    h('details.edit', { open: true }, h('summary', t('srv.settings')), f),
    h('details.edit', h('summary', t('srv.moder')),
      h('div.modrow', pid, kb, bb), h('p.hint', t('srv.pidhint')),
      h('div.flabel', t('srv.bans')), bans,
      h('div.danger', h('div', h('b', t('srv.wipe')), h('p.hint', t('srv.wipehint'))), wb)));
}

S.pages.servers = (main, p, ctx) => {
  let all = null, first = true, q = '';
  const price = h('span', '400');
  const createBtn = h('button.btn.gold.create', { type: 'button' }, t('srv.create'), ' — ', price, ' ₽');
  createBtn.addEventListener('click', () => createDialog(price.textContent));
  const search = S.input({ type: 'search', placeholder: t('srv.search'), 'aria-label': t('srv.search'), class: 'inp search' });
  const sum = h('span.sum');
  const grid = h('div.srvgrid', S.loading());
  const mine = h('div.minebox');
  main.appendChild(h('section.sec.first', h('div.wrap',
    h('div.pagehead', S.img(PX.badge(['star', '#5fd0ff', 'globe'], 64), 'phico'), h('div.grow', h('h1.ttl', t('srv.title')), h('p.sub', t('srv.sub'))), createBtn),
    h('div.toolbar', h('div.sbox', S.img(PX.glyph('eye', '#9a9888', 2), 'sico'), search), sum),
    grid,
    mine)));
  S.config().then(c => { if (c && c.serverPrice) price.textContent = String(c.serverPrice); });
  const setQ = (v) => { search.value = v; q = v; draw(); search.focus(); };
  search.addEventListener('input', () => { q = search.value; draw(); });
  function draw() {
    if (!all) return;
    const qq = q.trim().toLowerCase(); const tag = qq.startsWith('#') ? qq.slice(1) : null;
    const list = all.filter(s => !qq || (tag != null ? (s.tags || []).some(x => x.toLowerCase().startsWith(tag)) : (String(s.name).toLowerCase().includes(qq) || (s.tags || []).some(x => x.toLowerCase().includes(qq)))));
    const players = all.reduce((a, s) => a + (s.players || 0), 0);
    sum.textContent = t('srv.sum', { n: all.length, p: players });
    S.clear(grid);
    if (!all.length) grid.appendChild(h('div.span-all', S.empty(t('srv.none'), 'globe'), h('div.c', h('button.btn.gold', { type: 'button', onclick: () => createDialog(price.textContent) }, t('srv.first')))));
    else if (!list.length) grid.appendChild(h('div.span-all', S.empty(t('srv.nomatch'), 'eye')));
    else for (const s of list) grid.appendChild(serverCard(s, setQ, first));
    if (first) { S.reveal(grid); first = false; }
  }
  const load = () => S.get('/api/servers').then(r => { if (!ctx.alive()) return; all = r.servers || []; draw(); }).catch(e => { if (ctx.alive() && !all) S.clear(grid).appendChild(h('div.span-all', S.errorBox(e, load))); });
  load(); ctx.every(10000, load);

  // my servers
  const loadMine = () => {
    if (!S.me) { S.clear(mine).appendChild(h('div.panel.pad.c.loginhint', h('p', t('srv.minelogin')), h('button.btn.red', { type: 'button', onclick: S.goLogin }, t('nav.login')))); return; }
    S.get('/api/servers/mine').then(r => {
      if (!ctx.alive()) return; S.clear(mine);
      const list = r.servers || [];
      mine.appendChild(S.sectionHead(t('srv.mine'), list.length ? t('srv.minesub') : null));
      if (!list.length) mine.appendChild(h('div.panel.pad.c', h('p.dim', t('srv.nomine', { price: price.textContent })), h('button.btn.gold', { type: 'button', onclick: () => createDialog(price.textContent) }, t('srv.create'))));
      for (const s of list) mine.appendChild(mineCard(s, loadMine, price.textContent));
      S.reveal(mine);
    }).catch(e => { if (ctx.alive()) S.clear(mine).appendChild(S.errorBox(e, loadMine)); });
  };
  loadMine();
};
})();
