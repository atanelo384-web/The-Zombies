// =====================================================================
//  THE ZOMBIES — website: support tickets (players and staff).
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;
const stBadge = (s) => h('span.badge.' + ({ open: 'gold', answered: 'green', closed: '' }[s] || ''), t('tk.' + s));
S.ticketBadge = stBadge;

S.pages.support = (main, p, ctx) => {
  if (!S.needLogin(main, t('sup.login'))) return;
  const list = h('div.tlist', S.loading());
  const f = h('form.form', { novalidate: true },
    S.field(t('sup.subject'), S.input({ name: 'subject', required: true, maxlength: 80 })),
    h('label.field', h('span.flabel', t('sup.text')), h('textarea.inp', { name: 'text', rows: 6, maxlength: 2000, required: true, placeholder: t('sup.textph') })),
    h('p.formerr', { role: 'alert' }),
    h('button.btn.green', { type: 'submit' }, t('sup.send')));
  f.addEventListener('submit', (e) => {
    e.preventDefault(); const err = f.querySelector('.formerr'); err.classList.remove('show');
    S.busy(f.querySelector('button[type=submit]'), async () => {
      try {
        const r = await S.post('/api/support', { subject: f.elements.subject.value.trim(), text: f.elements.text.value.trim() });
        S.toast(t('sup.sent'), 'ok'); location.hash = '#/support/' + r.id;
      } catch (x) { err.textContent = S.errText(x); err.classList.add('show'); }
    });
  });
  main.appendChild(h('section.sec.first', h('div.wrap',
    h('div.pagehead', S.img(PX.badge(['circle', '#5fd0ff', 'chat'], 64), 'phico'), h('div.grow', h('h1.ttl', t('sup.title')), h('p.sub', t('sup.sub'))),
      S.me && S.me.admin ? h('a.btn.gold.small', { href: '#/admin' }, t('nav.admin')) : null),
    h('div.supgrid',
      h('section.panel.pad.reveal', h('h2.ptitle', t('sup.new')), f),
      h('section.panel.pad.reveal', h('h2.ptitle', t('sup.mine')), list)))));
  S.get('/api/support').then(r => {
    if (!ctx.alive()) return; S.clear(list);
    const ts = r.tickets || [];
    if (!ts.length) { list.appendChild(S.empty(t('sup.none'), 'chat')); return; }
    for (const tk of ts) list.appendChild(h('a.titem', { href: '#/support/' + tk.id }, h('div.grow', h('b', tk.subject), h('div.dim.tiny', '#' + tk.id + ' · ' + S.dt(tk.updated))), stBadge(tk.status)));
  }).catch(e => { if (ctx.alive()) S.clear(list).appendChild(S.errorBox(e)); });
};

S.pages.ticket = (main, params, ctx) => {
  if (!S.needLogin(main, t('sup.login'))) return;
  const id = params[0];
  const wrap = h('div.wrap.mid', S.loading());
  main.appendChild(h('section.sec.first', wrap));
  const staff = !!(S.me && S.me.admin);
  let lastN = -1;
  const draw = (r) => {
    const tk = r.ticket, msgs = r.msgs || [];
    if (msgs.length === lastN && wrap.querySelector('.thread')) { const b = wrap.querySelector('.tstatus'); if (b) b.replaceWith(h('span.tstatus', stBadge(tk.status))); return; }
    lastN = msgs.length; S.clear(wrap);
    wrap.appendChild(h('a.back', { href: staff ? '#/admin' : '#/support' }, '← ' + (staff ? t('nav.admin') : t('sup.title'))));
    wrap.appendChild(h('div.pagehead', h('div.grow', h('h1.ttl', tk.subject), h('p.sub', '#' + tk.id + ' · ' + S.dt(tk.created))), h('span.tstatus', stBadge(tk.status))));
    if (staff && tk.user) wrap.appendChild(h('div.notice', t('sup.from'), ' ', S.userLink(tk.user), ' ', h('span.dim', '#' + tk.user.id), tk.email ? [' · ', h('span.mono', tk.email)] : null));
    wrap.appendChild(h('div.thread', msgs.map(m => h('div.tmsg' + (m.staff ? '.staff' : '.user'),
      h('div.mh', h('b', m.staff ? t('sup.staff') : (staff && tk.user ? tk.user.name : t('sup.you'))), h('time', S.dt(m.created))),
      h('div.mt', m.text)))));
    const f = h('form.form.reply', { novalidate: true },
      h('label.field', h('span.flabel', t('sup.reply')), h('textarea.inp', { name: 'text', rows: 4, maxlength: 2000, required: true })),
      h('div.row.between.wrapr', staff ? S.check(t('sup.close'), { name: 'close' }) : h('span.hint', tk.status === 'closed' ? t('sup.reopen') : t('sup.wait')),
        h('button.btn.green', { type: 'submit' }, t('sup.send'))));
    f.addEventListener('submit', (e) => {
      e.preventDefault(); const text = f.elements.text.value.trim(); if (!text) return;
      S.busy(f.querySelector('button[type=submit]'), async () => {
        const r2 = await S.post('/api/support/' + encodeURIComponent(id), { text, close: staff && f.elements.close ? f.elements.close.checked : undefined });
        S.toast(t('sup.sent'), 'ok'); lastN = -1; draw(r2);
      });
    });
    wrap.appendChild(h('section.panel.pad', f));
  };
  const load = () => S.get('/api/support/' + encodeURIComponent(id)).then(r => { if (ctx.alive()) draw(r); }).catch(e => { if (ctx.alive() && lastN < 0) S.clear(wrap).appendChild(S.errorBox(e)); });
  load(); ctx.every(15000, () => { const ta = wrap.querySelector('textarea'); if (!ta || !ta.value) load(); });
};
})();
