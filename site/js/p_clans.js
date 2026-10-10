// =====================================================================
//  THE ZOMBIES — website: clans (top, search, create, invites), clan page
//  with members and clan chat.
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;
const ROLE_ORD = { leader: 0, officer: 1, member: 2 };

function clanCard(c, i, first) {
  const col = S.color(c.color, '#ff5a4a');
  return h('a.clan.panel' + (first ? '.reveal' : ''), { href: '#/clan/' + encodeURIComponent(c.id), style: { '--cc': col } },
    h('span.crank', '#' + (i + 1)),
    h('div.cflag', { 'aria-hidden': 'true' }, h('b', c.tag)),
    h('div.cbody',
      h('h3', h('span.ctag', '[' + c.tag + ']'), ' ', c.name),
      c.descr ? h('p.descr', c.descr) : null,
      h('div.meta',
        h('span.mi', S.img(PX.glyph('people', '#9a9888', 2)), ' ', t('clan.members', { n: c.count })),
        h('span.mi', h('b.gold', S.num(c.rn)), ' RN'),
        c.leader ? h('span.mi', S.img(PX.glyph('star', '#e8b030', 2)), ' ', c.leader) : null,
        h('span.badge' + (c.open ? '.green' : ''), c.open ? t('clan.open') : t('clan.closed')),
        c.pvp ? h('span.badge.red', 'PvP') : null)));
}

function createForm(onDone) {
  const color = h('input.colorinp', { type: 'color', name: 'color', value: '#d2322a', 'aria-label': t('clan.color') });
  const prev = h('span.cprev', '[TAG]');
  const f = h('form.form', { novalidate: true },
    S.field(t('clan.name'), S.input({ name: 'name', required: true, minlength: 3, maxlength: 20 }), t('clan.namehint')),
    h('div.row.gap.wrapr',
      S.field(t('clan.tag'), S.input({ name: 'tag', required: true, minlength: 2, maxlength: 5, class: 'inp mono upper' }), t('clan.taghint')),
      h('label.field', h('span.flabel', t('clan.color')), h('div.row.gap', color, prev))),
    S.check(t('clan.openq'), { name: 'open', checked: true }),
    h('p.formerr', { role: 'alert' }),
    h('button.btn.gold.wide', { type: 'submit' }, t('clan.create')));
  const upd = () => { prev.textContent = '[' + (f.elements.tag.value.toUpperCase() || 'TAG') + ']'; prev.style.color = S.color(color.value); };
  f.elements.tag.addEventListener('input', upd); color.addEventListener('input', upd); upd();
  f.addEventListener('submit', (e) => {
    e.preventDefault(); const err = f.querySelector('.formerr');
    S.busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const r = await S.post('/api/clans', { name: f.elements.name.value.trim(), tag: f.elements.tag.value.trim().toUpperCase(), color: S.color(color.value, '#d2322a').toLowerCase(), open: f.elements.open.checked });
        S.toast(t('clan.created'), 'ok'); S.loadMe(); onDone(r);
      } catch (x) { err.textContent = S.errText(x); err.classList.add('show'); }
    });
  });
  return f;
}

S.pages.clans = (main, p, ctx) => {
  let first = true;
  const search = S.input({ type: 'search', placeholder: t('clan.search'), 'aria-label': t('clan.search'), class: 'inp search', maxlength: 30 });
  const grid = h('div.clangrid', S.loading());
  const side = h('aside.clanside');
  main.appendChild(h('section.sec.first', h('div.wrap',
    h('div.pagehead', S.img(PX.badge(['shield', '#d2322a', 'people'], 64), 'phico'), h('div.grow', h('h1.ttl', t('clan.title')), h('p.sub', t('clan.sub')))),
    h('div.clanlayout', h('div', h('div.toolbar', h('div.sbox', S.img(PX.glyph('eye', '#9a9888', 2), 'sico'), search)), grid), side))));
  let qt = 0;
  const load = () => S.get('/api/clans?q=' + encodeURIComponent(search.value.trim())).then(r => {
    if (!ctx.alive()) return; S.clear(grid);
    const list = r.clans || [];
    if (!list.length) grid.appendChild(S.empty(search.value.trim() ? t('clan.nomatch') : t('clan.none'), 'people'));
    list.forEach((c, i) => grid.appendChild(clanCard(c, i, first)));
    if (first) { first = false; S.reveal(grid); }
  }).catch(e => { if (ctx.alive()) S.clear(grid).appendChild(S.errorBox(e, load)); });
  search.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(load, 300); });
  load();
  // my clan / invites / create
  const mine = () => {
    S.clear(side);
    if (!S.me) { side.appendChild(h('div.panel.pad.c', S.img(PX.badge(['shield', '#d2322a', 'people'], 56)), h('p', t('clan.loginhint')), h('button.btn.red', { type: 'button', onclick: S.goLogin }, t('nav.login')))); return; }
    side.appendChild(S.loading());
    S.get('/api/clans/mine').then(r => {
      if (!ctx.alive()) return; S.clear(side);
      if (r.clan) {
        const c = r.clan;
        side.appendChild(h('a.panel.pad.myclan', { href: '#/clan/' + encodeURIComponent(c.id), style: { '--cc': S.color(c.color, '#ff5a4a') } },
          h('div.flabel', t('clan.mine')), h('div.cflag.big', h('b', c.tag)), h('h3', c.name), h('p.dim', t('role.' + r.role) + ' · ' + t('clan.members', { n: c.count })), h('span.btn.small.ghost', t('clan.open_page'))));
      } else {
        for (const inv of r.invites || []) {
          const c = inv.clan; const j = h('button.btn.tiny.green', { type: 'button' }, t('clan.join')), d = h('button.btn.tiny.ghost', { type: 'button' }, t('fr.decline'));
          j.addEventListener('click', () => S.busy(j, async () => { const x = await S.post('/api/clans/join', { id: c.id }); S.toast(t('clan.joined'), 'ok'); S.loadMe(); location.hash = '#/clan/' + (x.clan ? x.clan.id : c.id); }));
          d.addEventListener('click', () => S.busy(d, async () => { await S.post('/api/clans/decline', { id: c.id }); mine(); }));
          side.appendChild(h('div.panel.pad.invite', { style: { '--cc': S.color(c.color, '#ff5a4a') } }, h('div.flabel', t('clan.invite')), h('p', h('a.link', { href: '#/clan/' + encodeURIComponent(c.id) }, '[' + c.tag + '] ' + c.name)), h('p.dim', t('clan.from', { name: inv.from || '?' })), h('div.row.gap', j, d)));
        }
        side.appendChild(h('div.panel.pad', h('h3.ptitle', t('clan.new')), createForm((x) => { if (x.clan) location.hash = '#/clan/' + x.clan.id; else mine(); })));
      }
    }).catch(e => { if (ctx.alive()) S.clear(side).appendChild(S.errorBox(e, mine)); });
  };
  mine();
};

S.pages.clan = (main, params, ctx) => {
  const id = params[0];
  const wrap = h('div.wrap', S.loading());
  main.appendChild(h('section.sec.first', wrap));
  let chatBox = null;
  const load = async () => {
    let r, my = null;
    try { r = await S.get('/api/clans/' + encodeURIComponent(id)); if (S.me) my = await S.get('/api/clans/mine').catch(() => null); }
    catch (e) { if (ctx.alive()) S.clear(wrap).appendChild(S.errorBox(e, load)); return; }
    if (!ctx.alive()) return;
    const c = r.clan, col = S.color(c.color, '#ff5a4a');
    const member = !!(my && my.clan && String(my.clan.id) === String(c.id));
    const inOther = !!(my && my.clan && !member);
    const invited = !!(my && (my.invites || []).some(i => String(i.clan.id) === String(c.id)));
    S.clear(wrap);
    const actions = h('div.row.gap.wrapr');
    if (S.me && member) {
      const lv = h('button.btn.ghost.small', { type: 'button' }, t('clan.leave'));
      lv.addEventListener('click', () => S.busy(lv, async () => {
        if (!(await S.confirm(t('clan.leave'), my.role === 'leader' ? t('clan.leaveleader') : t('clan.leaveq', { name: c.name }), t('clan.leave'), true))) return;
        await S.post('/api/clans/leave'); S.toast(t('clan.left'), 'ok'); S.loadMe(); load();
      }));
      actions.appendChild(lv);
    } else if (S.me && !inOther && (c.open || invited)) {
      const jn = h('button.btn.green', { type: 'button' }, t('clan.join'));
      jn.addEventListener('click', () => S.busy(jn, async () => { await S.post('/api/clans/join', { id: c.id }); S.toast(t('clan.joined'), 'ok'); S.loadMe(); load(); }));
      actions.appendChild(jn);
    } else if (!S.me) actions.appendChild(h('button.btn.red.small', { type: 'button', onclick: S.goLogin }, t('clan.loginjoin')));
    else if (inOther) actions.appendChild(h('span.dim', t('clan.inother')));
    else actions.appendChild(h('span.badge', t('clan.closed')));

    const members = (c.members || []).slice().sort((a, b) => (ROLE_ORD[a.role] - ROLE_ORD[b.role]) || (b.online - a.online) || (b.rn - a.rn));
    wrap.appendChild(h('section.clanhead.panel.reveal', { style: { '--cc': col } },
      h('div.cflag.huge', { 'aria-hidden': 'true' }, h('b', c.tag)),
      h('div.grow', h('h1.ttl', h('span.ctag', '[' + c.tag + ']'), ' ', c.name), c.descr ? h('p.sub', c.descr) : null,
        h('div.meta', h('span.mi', t('clan.members', { n: c.count })), h('span.mi', h('b.gold', S.num(c.rn)), ' RN'), h('span.badge' + (c.open ? '.green' : ''), c.open ? t('clan.open') : t('clan.closed')), c.pvp ? h('span.badge.red', t('clan.pvp')) : null, c.created ? h('span.mi.dim', t('clan.since', { date: S.date(c.created) })) : null)),
      actions));
    const memb = h('section.panel.pad.reveal', h('h2.ptitle', t('clan.list'), ' · ', String(members.length)),
      h('div.tablewrap', h('table.tbl.members', h('thead', h('tr', h('th', ''), h('th', t('clan.player')), h('th', t('clan.role')), h('th.r', 'RN'), h('th.hide-s', t('clan.seen')))),
        h('tbody', members.map(m => { const rk = S.rank(m.rank); return h('tr', h('td', S.onlineDot(m.online)), h('td', S.userLink(m)), h('td', h('span.role.' + m.role, t('role.' + m.role))), h('td.r', h('b', { style: { color: rk.color } }, S.num(m.rn))), h('td.dim.hide-s', m.online ? t('ui.online') : S.ago(m.lastSeen))); })))));
    if (member) { chatBox = chat(c, ctx); wrap.appendChild(h('div.clangrid2', memb, chatBox)); }
    else wrap.appendChild(memb);
    S.reveal(wrap);
  };
  load();
};

function chat(c, ctx) {
  const log = h('div.chatlog', { role: 'log', 'aria-live': 'polite' }, S.loading());
  const inp = h('input.inp', { type: 'text', maxlength: 400, placeholder: t('chat.ph'), 'aria-label': t('chat.ph'), autocomplete: 'off' });
  const send = h('button.btn.green', { type: 'submit' }, t('chat.send'));
  const f = h('form.chatform', inp, send);
  let lastId = -1;
  const draw = (msgs) => {
    const top = msgs.length ? msgs[msgs.length - 1].id : 0; if (top === lastId) return; lastId = top;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    S.clear(log);
    if (!msgs.length) log.appendChild(h('p.dim.c', t('chat.empty')));
    for (const m of msgs) {
      if (m.sys || !m.from) log.appendChild(h('div.msg.sys', h('span', m.text), h('time', S.dt(m.created))));
      else log.appendChild(h('div.msg' + (S.me && m.from.id === S.me.id ? '.me' : ''), h('div.mh', S.userLink(m.from), h('time', S.dt(m.created))), h('div.mt', m.text)));
    }
    if (atBottom || lastId === top) log.scrollTop = log.scrollHeight;
  };
  const load = () => S.get('/api/clans/' + encodeURIComponent(c.id) + '/messages').then(r => { if (ctx.alive()) draw(r.msgs || []); }).catch(e => { if (ctx.alive() && lastId < 0) S.clear(log).appendChild(S.errorBox(e)); });
  f.addEventListener('submit', (e) => {
    e.preventDefault(); const text = inp.value.trim(); if (!text) return;
    S.busy(send, async () => { await S.post('/api/clans/messages', { text }); inp.value = ''; await load(); log.scrollTop = log.scrollHeight; inp.focus(); });
  });
  load(); ctx.every(5000, load);
  return h('section.panel.pad.chat.reveal', h('h2.ptitle', t('chat.title')), log, f);
}
})();
