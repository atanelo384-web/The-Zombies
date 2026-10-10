// =====================================================================
//  THE ZOMBIES 5.0 — online screens: login, friends, messages, clan,
//  multiplayer lists, shop, support, notifications.
// =====================================================================
'use strict';
(() => {
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => TZ.esc(s == null ? '' : String(s));
const O = TZ.Online, Acc = TZ.Account, Cos = TZ.Cosmetics, R = TZ.RULES;
const t = (s, v) => TZ.t(s, v);
const SO = TZ.Social = {};
const ago = (ts) => { const s = (Date.now() - ts) / 1000; if (s < 60) return t('только что'); if (s < 3600) return t('{n} мин назад').replace('{n}', Math.floor(s / 60)); if (s < 86400) return t('{n} ч назад').replace('{n}', Math.floor(s / 3600)); return new Date(ts).toLocaleDateString(); };
const coin = '<i class="coin"></i>';
const busyBtn = async (b, fn) => { if (b.disabled) return; const txt = b.innerHTML; b.disabled = true; b.classList.add('busy'); try { await fn(); } catch (e) { TZ.audio.play('error'); TZ.notify(t('Ошибка'), e.message, { bad: true }); } finally { b.disabled = false; b.classList.remove('busy'); if (b.isConnected && b.innerHTML === txt) b.innerHTML = txt; } };
SO.busyBtn = busyBtn;

// ---------------------------------------------------------------- global notifications
TZ.notify = (title, sub, opt = {}) => {
  const box = $('#gtoasts'); if (!box) return;
  const n = el('div', 'gtoast' + (opt.bad ? ' bad' : '') + (opt.gold ? ' gold' : ''));
  const ic = opt.ach ? `<img class="gtic" src="${Cos.url(Cos.medal(opt.ach, 40))}">` : opt.avatar ? `<img class="gtic" src="${Cos.url(Cos.avatar(opt.avatar.avatar, opt.avatar.look, 40))}">` : '';
  n.innerHTML = `${ic}<div class="gtt"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  if (opt.actions) { const row = el('div', 'gtbtns'); for (const a of opt.actions) { const b = el('button', 'px-btn small ' + (a.cls || ''), esc(a.label)); b.onclick = (e) => { e.stopPropagation(); n.remove(); a.fn(); }; row.append(b); } n.append(row); }
  n.onclick = () => n.remove();
  box.append(n); while (box.children.length > 4) box.firstChild.remove();
  if (opt.ach) TZ.audio && TZ.audio.play('unlock'); else TZ.audio && TZ.audio.play(opt.sound || 'ui_open');
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, opt.ttl || (opt.actions ? 12000 : 5000));
};

// ---------------------------------------------------------------- login screen
const L = SO.Login = { tab: 'in', step: null, email: '' };
L.show = (opts = {}) => {
  TZ.Menu.hideAll(); $('#login').classList.remove('hidden'); TZ.Menu.cur = 'login';
  L.tab = opts.tab || 'in'; L.step = null; L.render();
  const lg = $('#loglang'); lg.innerHTML = '';
  for (const [c, n] of TZ.LANGS) { const b = el('button', 'langbtn' + (c === TZ.lang ? ' on' : ''), esc(n)); b.onclick = () => { TZ.setLang(c); L.show(); }; lg.append(b); }
  const src = $('#logoimg') && $('#logoimg').src; if (src) $('#login .logoimg').src = src;
};
L.done = () => { $('#login').classList.add('hidden'); TZ.Menu.afterLogin(); };
L.render = () => {
  $('#logtabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === L.tab));
  $('#logtabs').classList.toggle('hidden', !!L.step);
  $('#logtabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; L.tab = b.dataset.t; L.step = null; TZ.audio.play('ui'); L.render(); };
  const box = $('#logbody'); box.innerHTML = '';
  const err = el('div', 'logerr');
  if (!O.base()) {
    const sv = el('div', 'form', `<div class="warnbox">${t('Онлайн-сервер ещё не подключён. Введите его адрес (его даёт владелец игры) или играйте как гость.')}</div><input id="lsrv" class="px-input" placeholder="https://..." spellcheck="false">`);
    const ok = el('button', 'px-btn green', t('Подключить')); ok.onclick = () => { const v = $('#lsrv').value.trim(); if (!/^https?:\/\/[^\s]+$/.test(v)) { TZ.audio.play('error'); return; } TZ.store.set('serverUrl', v); const su = $('#srvurl'); if (su) su.value = v; L.render(); };
    sv.append(ok); box.append(sv);
  }
  const fail = (e) => { err.textContent = e.message || String(e); TZ.audio.play('error'); };
  if (L.step === 'verify') {
    box.innerHTML = `<div class="logtitle">${t('Подтвердите почту')}</div><p class="sub">${t('Мы отправили 6-значный код на')} <b>${esc(L.email)}</b>. ${t('Проверьте папку «Спам», если письма нет.')}</p>
      <input id="lcode" class="px-input codein" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">`;
    const ok = el('button', 'px-btn big green', t('Подтвердить'));
    ok.onclick = () => busyBtn(ok, async () => { try { await O.verify(L.email, $('#lcode').value.trim()); L.done(); } catch (e) { fail(e); } });
    const re = el('button', 'px-btn small', t('Отправить код ещё раз'));
    re.onclick = () => busyBtn(re, async () => { try { const r = await O.post('/api/auth/resend', { email: L.email }); if (r.devCode) $('#lcode').value = r.devCode; err.textContent = t('Код отправлен'); } catch (e) { fail(e); } });
    const back = el('button', 'px-btn small ghost', t('Назад')); back.onclick = () => { L.step = null; L.render(); };
    box.append(ok, err, el('div', 'row2', ''), re, back);
    if (L.devCode) $('#lcode').value = L.devCode;
    $('#lcode').onkeydown = (e) => { if (e.key === 'Enter') ok.click(); };
    setTimeout(() => $('#lcode').focus(), 50); return;
  }
  if (L.step === 'forgot' || L.step === 'reset') {
    box.innerHTML = `<div class="logtitle">${t('Восстановление пароля')}</div>
      <label>${t('Почта')}<input id="lfemail" class="px-input" type="email" autocomplete="email" value="${esc(L.email)}"></label>
      ${L.step === 'reset' ? `<p class="sub">${t('Введите код из письма и новый пароль.')}</p><input id="lfcode" class="px-input codein" inputmode="numeric" maxlength="6" placeholder="000000"><label>${t('Новый пароль')}<input id="lfpass" class="px-input" type="password" autocomplete="new-password"></label>` : `<p class="sub">${t('Если к аккаунту привязана почта, на неё придёт код.')}</p>`}`;
    const go = el('button', 'px-btn big green', L.step === 'reset' ? t('Сменить пароль и войти') : t('Получить код'));
    go.onclick = () => busyBtn(go, async () => {
      try {
        L.email = $('#lfemail').value.trim();
        if (L.step === 'forgot') { const r = await O.forgot(L.email); L.step = 'reset'; L.render(); if (r.devCode) $('#lfcode').value = r.devCode; return; }
        await O.reset(L.email, $('#lfcode').value.trim(), $('#lfpass').value); L.done();
      } catch (e) { fail(e); }
    });
    const back = el('button', 'px-btn small ghost', t('Назад ко входу')); back.onclick = () => { L.step = null; L.tab = 'in'; L.render(); };
    box.append(go, err, back); return;
  }
  if (L.tab === 'in') {
    box.innerHTML = `<label>${t('Почта')}<input id="lemail" class="px-input" type="email" autocomplete="email" value="${esc(L.email)}"></label>
      <label>${t('Пароль')}<input id="lpass" class="px-input" type="password" autocomplete="current-password"></label>`;
    const go = el('button', 'px-btn big green', t('Войти'));
    go.onclick = () => busyBtn(go, async () => {
      try { L.email = $('#lemail').value.trim(); const r = await O.login(L.email, $('#lpass').value); if (r.needVerify) { L.devCode = r.devCode; L.step = 'verify'; L.render(); return; } L.done(); } catch (e) { fail(e); }
    });
    const fg = el('button', 'linkbtn', t('Забыли пароль?')); fg.onclick = () => { L.email = $('#lemail').value.trim(); L.step = 'forgot'; L.render(); };
    $('#lpass') && box.querySelector('#lpass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    box.append(go, err, fg);
  } else {
    box.innerHTML = `<label>${t('Ник')}<input id="rname" class="px-input" maxlength="16" autocomplete="nickname" placeholder="${t('Например: Волк')}"></label>
      <label>${t('Почта')}<input id="remail" class="px-input" type="email" autocomplete="email"></label>
      <label>${t('Пароль')} <small>${t('от 8 символов, буквы и цифры')}</small><input id="rpass" class="px-input" type="password" autocomplete="new-password"></label>`;
    const go = el('button', 'px-btn big green', t('Создать аккаунт'));
    go.onclick = () => busyBtn(go, async () => {
      try { L.email = $('#remail').value.trim(); const r = await O.register(L.email, $('#rpass').value, $('#rname').value.trim()); L.devCode = r.devCode; L.step = 'verify'; L.render(); } catch (e) { fail(e); }
    });
    box.append(go, err);
  }
  box.append(el('div', 'logor', `<span>${t('или')}</span>`));
  const soc = el('div', 'logsoc');
  const g = el('button', 'px-btn socbtn google', `<i class="gicon"></i>${t('Войти через Google')}`);
  const a = el('button', 'px-btn socbtn apple', `<i class="aicon"></i>${t('Войти через Apple')}`);
  g.onclick = () => L.social('google'); a.onclick = () => L.social('apple');
  soc.append(g, a); box.append(soc);
  const guest = el('button', 'px-btn ghost guestbtn', `${t('Играть как гость')} <small>${t('без мультиплеера и магазина')}</small>`);
  guest.onclick = () => { TZ.audio.play('ui'); Acc.useGuest(); if (!Acc.active().look || Acc.active().name === 'Гость') TZ.Menu.setup(() => L.done()); else L.done(); };
  box.append(guest);
  box.append(el('p', 'phint', t('Аккаунт хранится на сервере: прогресс не потеряется при смене устройства. Пароль хранится в зашифрованном виде.')));
};
// Google / Apple: in the browser version — their own buttons; in the apps — sign in on the website with a code
L.social = async (kind) => {
  TZ.audio.play('ui');
  let cfg = {}; try { cfg = await O.get('/api/config'); } catch (e) { return TZ.app.alert(e.message); }
  const id = kind === 'google' ? cfg.google : cfg.apple;
  if (!id) return TZ.app.alert(kind === 'google' ? t('Вход через Google ещё не настроен на сервере. Войдите по почте.') : t('Вход через Apple ещё не настроен на сервере. Войдите по почте.'));
  const sameSite = /^https?:$/.test(location.protocol) && location.origin === O.base();
  if (sameSite && kind === 'google') {
    try {
      await loadScript('https://accounts.google.com/gsi/client');
      google.accounts.id.initialize({ client_id: id, callback: async (r) => { try { await O.idToken('google', r.credential); L.done(); } catch (e) { TZ.app.alert(e.message); } } });
      google.accounts.id.prompt((n) => { if (n.isNotDisplayed() || n.isSkippedMoment()) L.device(kind); });
      return;
    } catch (e) { }
  }
  if (sameSite && kind === 'apple') {
    try {
      await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
      AppleID.auth.init({ clientId: id, scope: 'name email', redirectURI: location.origin + '/', usePopup: true });
      const r = await AppleID.auth.signIn();
      const nm = r.user && r.user.name ? (r.user.name.firstName || '') : '';
      await O.idToken('apple', r.authorization.id_token, nm); L.done(); return;
    } catch (e) { if (e && e.error === 'popup_closed_by_user') return; }
  }
  L.device(kind);
};
const loadScript = (src) => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
L.device = async (kind) => {
  let cancelled = false;
  TZ.app.alert('', () => { cancelled = true; });
  const box = $('#cfmtext'); $('#cfmyes').textContent = t('Отмена');
  box.innerHTML = `<div class="sub">${t('Подключение...')}</div>`;
  try {
    const r = await O.deviceLogin((d) => {
      box.innerHTML = `<b>${kind === 'google' ? t('Вход через Google') : t('Вход через Apple')}</b>
        <p>${t('Откройте сайт игры на любом устройстве, войдите и подтвердите код:')}</p>
        <div class="devcode">${esc(d.code)}</div><div class="biglink">${esc(d.url.replace(/^https?:\/\//, ''))}</div>
        <button class="px-btn green" id="devopen">${t('Открыть сайт')}</button><p class="sub">${t('Окно закроется само, когда вход будет подтверждён.')}</p>`;
      $('#devopen').onclick = () => openExternal(d.url);
    }, () => cancelled);
    if (r) { $('#confirm').classList.remove('show'); L.done(); }
  } catch (e) { if (!cancelled) box.innerHTML = esc(e.message); }
};
const openExternal = SO.openExternal = (url) => {
  try { if (window.tzNative && window.tzNative.openExternal) return window.tzNative.openExternal(url); } catch (e) { }
  try { if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) return window.Capacitor.Plugins.Browser.open({ url }); } catch (e) { }
  const w = window.open(url, '_blank'); if (!w) location.href = url;
};

// ---------------------------------------------------------------- live events → notifications
const needOnline = () => { if (Acc.isOnline()) return true; TZ.app.confirm(t('Это доступно только с аккаунтом. Войти или создать аккаунт?'), () => { TZ.app.toMenu && TZ.app.game ? (TZ.app.toMenu(), L.show()) : L.show(); }); return false; };
SO.needOnline = needOnline;
SO.unread = 0; SO.incoming = 0;
const badge = () => { const n = SO.unread + SO.incoming; const b = $('#socbadge'); if (b) { b.textContent = n; b.classList.toggle('hidden', !n); } };
SO.loadCounts = async () => { if (!Acc.isOnline()) { SO.unread = SO.incoming = 0; badge(); return; } try { const r = await O.get('/api/friends'); SO.friends = r; SO.unread = r.unread.reduce((a, x) => a + x.n, 0); SO.incoming = r.incoming.length; badge(); } catch (e) { } };
O.on('login', () => SO.loadCounts());
O.on('online', () => { SO.loadCounts(); if (TZ.Menu.cur === 'menu' && TZ.app.state === 'menu') TZ.Menu.renderAccCard(); });
O.on('friendReq', (m) => { SO.incoming++; badge(); TZ.notify(t('Заявка в друзья'), m.from.name + ' #' + m.from.id, { avatar: m.from, actions: [{ label: t('Принять'), cls: 'green', fn: () => SO.friendOp('accept', m.from.id) }, { label: t('Позже'), fn: () => { } }] }); if (S.open && S.tab === 'friends') S.render(); });
O.on('friendAccepted', (m) => { SO.loadCounts(); TZ.notify(t('Новый друг!'), t('{name} принял(а) вашу заявку').replace('{name}', m.from.name), { avatar: m.from }); if (S.open) S.render(); });
O.on('msg', (m) => {
  if (S.open && S.tab === 'msgs' && S.thread === m.m.from) { S.appendMsg(m.m, false); O.get('/api/messages/' + m.m.from).catch(() => { }); return; }
  SO.unread++; badge();
  const G = TZ.app.game; if (G && G.ui) G.ui.chatMsg('✉ ' + m.fromName, m.m.text, '#ff9ad0');
  TZ.notify(t('Сообщение от {name}').replace('{name}', m.fromName), m.m.text.slice(0, 90), { actions: [{ label: t('Ответить'), cls: 'green', fn: () => S.show('msgs', m.m.from) }] });
});
O.on('invite', (m) => {
  if (TZ.app.game && TZ.app.game.room === m.room) return;
  TZ.notify(t('Приглашение в игру'), t('{name} зовёт вас в мир «{world}»').replace('{name}', m.from.name).replace('{world}', m.world), { gold: true, ttl: 30000, sound: 'quest', actions: [{ label: t('Присоединиться'), cls: 'green', fn: () => SO.joinRoom(m.room, m.code) }, { label: t('Нет'), fn: () => { } }] });
});
O.on('clanInvite', (m) => TZ.notify(t('Приглашение в клан'), `«${m.clan.name}» [${m.clan.tag}] — ${m.from}`, { ttl: 30000, actions: [{ label: t('Вступить'), cls: 'green', fn: () => SO.clanOp('/api/clans/join', { id: m.clan.id }) }, { label: t('Отказаться'), fn: () => SO.clanOp('/api/clans/decline', { id: m.clan.id }) }] }));
O.on('clanMsg', (m) => {
  if (S.open && S.tab === 'clan') S.appendClanMsg(m.m);
  const G = TZ.app.game; const me = O.me;
  if (G && G.ui && (!m.m.from || m.m.from.id !== (me && me.id))) { const c = me && me.clan; G.ui.chatMsg(m.m.sys ? '' : m.m.from.name, m.m.sys ? '★ ' + m.m.text : m.m.text, c ? c.color : '#e8b030', c ? c.tag : null, c ? c.color : null); }
});
O.on('clan', (m) => { O.refresh(); if (m.kicked) TZ.notify(t('Клан'), t('Вас исключили из клана')); if (m.gone) TZ.notify(t('Клан'), t('Клан распущен')); if (S.open && S.tab === 'clan') setTimeout(() => S.render(), 400); });
O.on('presence', () => { if (S.open && S.tab === 'friends') S.render(); if (TZ.Menu.cur === 'mp' && MP.tab === 'friends') MP.render(); });
O.on('paid', (m) => { TZ.notify(t('Оплата прошла!'), m.name, { gold: true, sound: 'unlock' }); O.refresh(); if (TZ.Menu.cur === 'shop') setTimeout(() => SH.render(), 500); });
O.on('support', (m) => TZ.notify(t('Ответ поддержки'), m.text, { actions: [{ label: t('Открыть'), cls: 'green', fn: () => SU.show(m.id) }] }));
O.on('ticket', (m) => TZ.notify(t('Новое обращение'), m.from + ': ' + m.subject, { actions: [{ label: t('Открыть'), cls: 'green', fn: () => SU.show(m.id) }] }));
O.on('me', () => { if (TZ.Menu.cur === 'menu' && TZ.app.state === 'menu') TZ.Menu.renderAccCard(); if (TZ.Menu.cur === 'shop') SH.coins(); });
O.on('logout', (d) => { if (d.expired && TZ.app.state === 'menu') { TZ.notify(t('Сессия истекла'), t('Войдите снова')); L.show(); } });

// ---------------------------------------------------------------- friends / clan helpers
SO.friendOp = async (op, id) => { try { await O.post('/api/friends/' + op, { id }); TZ.audio.play('ui'); await SO.loadCounts(); if (S.open) S.render(); return true; } catch (e) { TZ.notify(t('Ошибка'), e.message, { bad: true }); return false; } };
SO.clanOp = async (path, body) => { try { const r = await O.post(path, body || {}); O.refresh(); if (S.open && S.tab === 'clan') S.render(r); return r; } catch (e) { TZ.notify(t('Клан'), e.message, { bad: true }); return null; } };
SO.invite = async (id) => { try { await O.post('/api/invite', { to: id }); TZ.notify(t('Приглашение отправлено'), ''); return true; } catch (e) { TZ.notify(t('Не получилось'), e.message, { bad: true }); return false; } };
SO.joinRoom = (room, code) => {
  const go = () => TZ.app.joinRoom(room, code);
  if (TZ.app.game) TZ.app.confirm(t('Выйти из текущего мира и присоединиться?'), () => { TZ.app.toMenu(); setTimeout(go, 300); }); else go();
};
// player card with actions (from the player list, friends, search)
SO.showPlayer = async (p, ctx = {}) => {
  $('#pviewbody').innerHTML = Cos.card(p);
  const body = $('#pviewbody');
  const id = p.uid || p.id;
  const mine = Acc.isOnline() && id === O.me.id;
  if (id && !mine && Acc.isOnline() && !p.guest && /^[2-9A-HJ-NP-Z]{8}$/.test(id)) {
    const row = el('div', 'pactions');
    const msg = el('button', 'px-btn green', t('Сообщение')); msg.onclick = () => { $('#pview').classList.remove('show'); S.show('msgs', id); };
    const fr = (SO.friends && SO.friends.friends || []).some(f => f.id === id);
    const add = el('button', 'px-btn', fr ? t('Уже в друзьях') : t('В друзья')); add.disabled = fr;
    add.onclick = () => busyBtn(add, async () => { await O.post('/api/friends/request', { id }); add.textContent = t('Заявка отправлена'); add.disabled = true; });
    row.append(msg, add);
    const me = O.me;
    if (me.clan && me.clan.role !== 'member' && !(p.clan)) { const cb = el('button', 'px-btn', t('В клан')); cb.onclick = () => busyBtn(cb, async () => { await O.post('/api/clans/invite', { id }); cb.textContent = t('Приглашён'); cb.disabled = true; }); row.append(cb); }
    if (TZ.app.game && TZ.app.game.role === 'host' && ctx.pid != null) { const kb = el('button', 'px-btn red', t('Выгнать')); kb.onclick = () => TZ.app.confirm(t('Выгнать игрока из мира?'), () => { TZ.app.game.net.kickPid && TZ.app.game.net.kickPid(ctx.pid); $('#pview').classList.remove('show'); }); row.append(kb); }
    const bl = el('button', 'px-btn small ghost', t('Заблокировать')); bl.onclick = () => TZ.app.confirm(t('Заблокировать игрока? Он не сможет писать вам и добавлять в друзья.'), async () => { try { await O.post('/api/block', { id }); TZ.notify(t('Игрок заблокирован'), ''); } catch (e) { TZ.app.alert(e.message); } });
    row.append(bl);
    body.append(row);
    body.append(el('div', 'pid', `ID: <b>#${esc(id)}</b>`));
  }
  $('#pview').classList.add('show'); TZ.audio.play('ui_open');
};

// ---------------------------------------------------------------- social window (friends · messages · clan · search)
const S = SO.Win = { open: false, tab: 'friends', thread: null };
SO.open = (tab, arg) => S.show(tab, arg);
S.show = (tab, arg) => {
  if (!needOnline()) return;
  S.tab = tab || S.tab || 'friends'; if (arg) S.thread = arg;
  $('#social').classList.add('show'); S.open = true; TZ.audio.play('ui_open');
  $('#socme').innerHTML = `${esc(O.me.name)} <b class="gold">#${esc(O.me.id)}</b> <button class="px-btn small" id="copyid">${t('Копировать ID')}</button>`;
  $('#copyid').onclick = () => { try { navigator.clipboard.writeText(O.me.id); TZ.notify(t('ID скопирован'), '#' + O.me.id); } catch (e) { } };
  S.render();
};
const closeObs = new MutationObserver(() => { S.open = $('#social').classList.contains('show'); });
S.render = async (pre) => {
  $('#soctabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  $('#soctabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; S.tab = b.dataset.t; TZ.audio.play('ui'); S.render(); };
  const box = $('#socbody'); const tab = S.tab;
  if (!box.firstChild || box.dataset.tab !== tab) box.innerHTML = `<div class="sub">${t('Загрузка...')}</div>`;
  box.dataset.tab = tab;
  try {
    if (tab === 'friends') await S.friends(box);
    if (tab === 'msgs') await S.msgs(box);
    if (tab === 'clan') await S.clan(box, pre);
    if (tab === 'find') S.find(box);
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
};
const prow = (u, extra) => {
  const r = el('div', 'frow' + (u.online ? ' on' : ''));
  r.innerHTML = `<div class="pav-s"><img src="${Cos.url(Cos.avatar(u.avatar, u.look, 44))}"><img src="${Cos.url(Cos.frame(u.frame, 44))}"></div>
    <div class="fname"><b>${esc(u.name)}</b> <small>#${esc(u.id)}</small><div class="fst">${u.online ? (u.playing ? `<span class="playing">${t('играет')}: ${esc(u.playing.name)}</span>` : `<span class="onl">${t('в сети')}</span>`) : t('не в сети') + (u.lastSeen ? ' · ' + ago(u.lastSeen) : '')}</div></div>
    <div class="frn">${esc(t(u.rank || ''))}<br><small>${u.rn} RN</small></div><div class="fbtns"></div>`;
  r.querySelector('.pav-s').onclick = r.querySelector('.fname').onclick = async () => { try { const x = await O.get('/api/users/' + u.id); SO.showPlayer(x.profile); } catch (e) { } };
  if (extra) for (const b of extra) r.querySelector('.fbtns').append(b);
  return r;
};
const btn = (label, cls, fn) => { const b = el('button', 'px-btn small ' + (cls || ''), esc(label)); b.onclick = (e) => { e.stopPropagation(); busyBtn(b, fn); }; return b; };
S.friends = async (box) => {
  const r = await O.get('/api/friends'); SO.friends = r; SO.incoming = r.incoming.length; SO.unread = r.unread.reduce((a, x) => a + x.n, 0); badge();
  box.innerHTML = '';
  const G = TZ.app.game, hosting = G && G.net && (G.role === 'host' || G.pubServer);
  if (r.incoming.length) {
    box.append(el('div', 'flabel', t('Заявки в друзья') + ` (${r.incoming.length})`));
    for (const u of r.incoming) box.append(prow(u, [btn(t('Принять'), 'green', () => SO.friendOp('accept', u.id)), btn(t('Отклонить'), '', () => SO.friendOp('decline', u.id))]));
  }
  box.append(el('div', 'flabel', t('Друзья') + ` (${r.friends.length})`));
  if (!r.friends.length) box.append(el('div', 'empty', t('Пока никого. Найдите игрока по нику или ID во вкладке «Найти игрока» или нажмите на игрока в мультиплеере.')));
  for (const u of r.friends) {
    const b = [];
    const un = (r.unread.find(x => x.id === u.id) || {}).n;
    b.push(btn(t('Написать') + (un ? ` (${un})` : ''), un ? 'green' : '', () => S.show('msgs', u.id)));
    if (hosting && u.online) b.push(btn(t('Пригласить'), 'green', () => SO.invite(u.id)));
    if (u.playing && !u.playing.pub) b.push(btn(t('К нему'), '', async () => SO.joinRoom(u.playing.room)));
    if (u.playing && u.playing.pub) b.push(btn(t('На сервер'), '', async () => SO.joinRoom(u.playing.room)));
    b.push(btn('✕', 'ghost', () => new Promise(res => TZ.app.confirm(t('Удалить {name} из друзей?').replace('{name}', u.name), async () => { await SO.friendOp('remove', u.id); res(); }))));
    box.append(prow(u, b));
  }
  if (r.outgoing.length) { box.append(el('div', 'flabel', t('Отправленные заявки'))); for (const u of r.outgoing) box.append(prow(u, [btn(t('Отменить'), 'ghost', () => SO.friendOp('decline', u.id))])); }
  if (!hosting) box.append(el('p', 'phint', t('Пригласить друга в свой мир: «Мультиплеер → Открыть свой мир», затем здесь появится кнопка «Пригласить».')));
};
S.msgs = async (box) => {
  const fr = SO.friends || await O.get('/api/friends'); SO.friends = fr;
  box.innerHTML = '';
  const wrap = el('div', 'msgwrap'), list = el('div', 'msglist scroll'), th = el('div', 'msgthread');
  wrap.append(list, th); box.append(wrap);
  const people = fr.friends.slice(); for (const u of fr.unread) if (!people.some(p => p.id === u.id)) people.push({ id: u.id, name: '#' + u.id, avatar: 'self', frame: 'none', look: null, unreadOnly: true });
  if (S.thread && !people.some(p => p.id === S.thread)) people.unshift({ id: S.thread, name: '#' + S.thread, avatar: 'self', frame: 'none' });
  for (const u of people) {
    const un = (fr.unread.find(x => x.id === u.id) || {}).n;
    const it = el('div', 'msgp' + (S.thread === u.id ? ' on' : '') + (u.online ? ' onl' : ''), `<img src="${Cos.url(Cos.avatar(u.avatar, u.look, 32))}"><span>${esc(u.name)}</span>${un ? `<em>${un}</em>` : ''}`);
    it.onclick = () => { S.thread = u.id; S.render(); };
    list.append(it);
  }
  if (!people.length) list.append(el('div', 'empty', t('Нет переписок')));
  if (!S.thread) { th.innerHTML = `<div class="empty">${t('Выберите собеседника слева')}</div>`; return; }
  const r = await O.get('/api/messages/' + S.thread);
  SO.unread = Math.max(0, SO.unread - ((fr.unread.find(x => x.id === S.thread) || {}).n || 0)); fr.unread = fr.unread.filter(x => x.id !== S.thread); badge();
  th.innerHTML = `<div class="msghead"><b>${esc(r.with.name)}</b> <small>#${esc(r.with.id)} · ${r.with.online ? t('в сети') : t('не в сети')}</small></div><div class="msgs scroll" id="msgs"></div>
    <div class="msgin"><input id="msgtext" class="px-input" maxlength="500" placeholder="${t('Сообщение...')}" autocomplete="off"><button class="px-btn green" id="msgsend">${t('Отправить')}</button></div>`;
  for (const m of r.msgs) S.appendMsg(m, m.from === O.me.id);
  const send = async () => { const v = $('#msgtext').value.trim(); if (!v) return; $('#msgtext').value = ''; try { const x = await O.post('/api/messages', { to: S.thread, text: v }); S.appendMsg(x.m, true); TZ.audio.play('chat'); } catch (e) { TZ.notify(t('Не отправлено'), e.message, { bad: true }); $('#msgtext').value = v; } };
  $('#msgsend').onclick = send; $('#msgtext').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
  setTimeout(() => $('#msgtext') && $('#msgtext').focus(), 50);
};
S.appendMsg = (m, mine) => { const box = $('#msgs'); if (!box) return; box.append(el('div', 'msg' + (mine || m.from === O.me.id ? ' mine' : ''), `<span>${esc(m.text)}</span><small>${new Date(m.created).toLocaleTimeString().slice(0, 5)}</small>`)); box.scrollTop = 1e9; };
const CLAN_COLORS = ['#e04a3a', '#e8902a', '#e8d040', '#58c068', '#3cc0a8', '#40a8e8', '#4a6ae8', '#a060e0', '#e060a8', '#d8d8d0'];
S.clan = async (box, pre) => {
  const r = pre && pre.clan !== undefined ? pre : await O.get('/api/clans/mine');
  box.innerHTML = '';
  if (!r.clan) {
    if (r.invites.length) { box.append(el('div', 'flabel', t('Приглашения'))); for (const i of r.invites) { const row = el('div', 'clinv', `<span class="clbadge" style="--cc:${i.clan.color}">${esc(i.clan.name)} [${esc(i.clan.tag)}]</span> <small>${t('от')} ${esc(i.from)} · ${i.clan.count} ${t('игроков')}</small>`); row.append(btn(t('Вступить'), 'green', () => SO.clanOp('/api/clans/join', { id: i.clan.id })), btn(t('Отказаться'), '', () => SO.clanOp('/api/clans/decline', { id: i.clan.id }))); box.append(row); } }
    const col = S._col || CLAN_COLORS[(Math.random() * CLAN_COLORS.length) | 0]; S._col = col;
    const f = el('div', 'clannew', `<div class="flabel big">${t('Создать клан')}</div>
      <div class="row2"><label>${t('Название')}<input id="cname" class="px-input" maxlength="20" placeholder="${t('например: Волки')}"></label><label>${t('Тег')}<input id="ctag" class="px-input" maxlength="5" placeholder="WLF"></label></div>
      <div class="flabel">${t('Цвет клана')}</div><div class="clcolors">${CLAN_COLORS.map(c => `<button class="clc ${c === col ? 'on' : ''}" data-col="${c}" style="--cc:${c}"></button>`).join('')}</div>
      <label class="chk"><input type="checkbox" id="copen"><i></i> ${t('Открытый клан: вступить может любой')}</label>`);
    box.append(f);
    f.querySelectorAll('.clc').forEach(b => b.onclick = () => { S._col = b.dataset.col; f.querySelectorAll('.clc').forEach(x => x.classList.toggle('on', x === b)); });
    const mk = btn(t('Создать клан'), 'green big', async () => { const res = await O.post('/api/clans', { name: $('#cname').value, tag: $('#ctag').value, color: S._col, open: $('#copen').checked }); O.refresh(); TZ.audio.play('craft'); S.render(res); });
    box.append(mk);
    box.append(el('div', 'flabel', t('Открытые кланы')));
    const L2 = el('div', 'cllist'); box.append(L2);
    try { const cl = await O.get('/api/clans'); for (const c of cl.clans.filter(c => c.open)) { const row = el('div', 'clinv', `<span class="clbadge" style="--cc:${c.color}">${esc(c.name)} [${esc(c.tag)}]</span> <small>${c.count} ${t('игроков')} · ${c.rn} RN · ${t('лидер')} ${esc(c.leader || '')}</small>`); row.append(btn(t('Вступить'), 'green', () => SO.clanOp('/api/clans/join', { id: c.id }))); L2.append(row); } if (!L2.children.length) L2.append(el('div', 'sub', t('Открытых кланов пока нет'))); } catch (e) { }
    return;
  }
  const c = r.clan, role = r.role, lead = role === 'leader', off = role === 'officer' || lead;
  const head = el('div', 'clhead', `<span class="clbadge" style="--cc:${c.color}">${esc(c.name)} [${esc(c.tag)}]</span><span class="sub inline">${c.count} / 30 · ${c.rn} RN · ${c.pvp ? t('PvP включено') : t('мирный клан')}</span>`);
  box.append(head);
  const cols = el('div', 'clcols3'); box.append(cols);
  // members
  const mem = el('div', 'clmembers scroll');
  for (const m of c.members) {
    const rl = m.role === 'leader' ? t('ЛИДЕР') : m.role === 'officer' ? t('ОФИЦЕР') : '';
    const row = el('div', 'clmem' + (m.online ? ' on' : ''), `<span class="cldot"></span><span class="clmn">${esc(m.name)}</span>${rl ? `<span class="host">${rl}</span>` : ''}<span class="clst">${m.playing ? t('играет') : m.online ? t('в сети') : ago(m.lastSeen || 0)}</span>`);
    row.onclick = async () => { try { const x = await O.get('/api/users/' + m.id); SO.showPlayer(x.profile); } catch (e) { } };
    if (m.id !== O.me.id) {
      if (lead) { row.append(btn(m.role === 'officer' ? '↓' : '↑', 'ghost', () => SO.clanOp('/api/clans/manage', { op: m.role === 'officer' ? 'demote' : 'promote', id: m.id }))); row.append(btn('♛', 'ghost', () => new Promise(res => TZ.app.confirm(t('Передать лидерство игроку {name}?').replace('{name}', m.name), async () => { await SO.clanOp('/api/clans/manage', { op: 'lead', id: m.id }); res(); })))); }
      if (off && m.role !== 'leader' && !(role === 'officer' && m.role === 'officer')) row.append(btn('✕', 'red', () => new Promise(res => TZ.app.confirm(t('Исключить {name} из клана?').replace('{name}', m.name), async () => { await SO.clanOp('/api/clans/manage', { op: 'kick', id: m.id }); res(); }))));
    }
    mem.append(row);
  }
  const left = el('div', ''); left.append(el('div', 'flabel', t('Участники')), mem);
  if (off) { const inv = el('div', 'row2', `<input id="clinvid" class="px-input" placeholder="${t('ID игрока')}" maxlength="9">`); inv.append(btn(t('Пригласить'), 'green', async () => { await O.post('/api/clans/invite', { id: $('#clinvid').value }); $('#clinvid').value = ''; TZ.notify(t('Приглашение отправлено'), ''); })); left.append(inv); }
  // chat
  const chat = el('div', 'clchat'); chat.innerHTML = `<div class="flabel">${t('Чат клана')}</div><div class="msgs scroll" id="clmsgs"></div><div class="msgin"><input id="cltext" class="px-input" maxlength="400" placeholder="${t('Сообщение клану... (в игре: /c текст)')}" autocomplete="off"><button class="px-btn green" id="clsend">${t('Отправить')}</button></div>`;
  // settings
  const set = el('div', 'clset', `<div class="flabel">${t('Настройки')}${off ? '' : ` <small>(${t('меняют лидер и офицеры')})</small>`}</div>
    <label>${t('Название')}<input id="cren" class="px-input" maxlength="20" value="${esc(c.name)}" ${off ? '' : 'disabled'}></label>
    <label>${t('Тег')}<input id="ctg" class="px-input" maxlength="5" value="${esc(c.tag)}" ${off ? '' : 'disabled'}></label>
    <div class="clcolors">${CLAN_COLORS.map(x => `<button class="clc ${x === c.color ? 'on' : ''}" data-col="${x}" style="--cc:${x}" ${off ? '' : 'disabled'}></button>`).join('')}</div>
    <label>${t('Описание')}<input id="cdesc" class="px-input" maxlength="300" value="${esc(c.descr || '')}" ${off ? '' : 'disabled'}></label>
    <label class="chk"><input type="checkbox" id="cpvp" ${c.pvp ? 'checked' : ''} ${off ? '' : 'disabled'}><i></i> ${t('PvP: клан сражается с другими игроками')}</label>
    <label class="chk"><input type="checkbox" id="cmark" ${c.markers ? 'checked' : ''} ${off ? '' : 'disabled'}><i></i> ${t('Соклановцы видны на карте')}</label>
    <label class="chk"><input type="checkbox" id="copen2" ${c.open ? 'checked' : ''} ${off ? '' : 'disabled'}><i></i> ${t('Открытый клан')}</label>`);
  if (off) { set.querySelectorAll('.clc').forEach(b => b.onclick = () => { set.querySelectorAll('.clc').forEach(x => x.classList.toggle('on', x === b)); S._col2 = b.dataset.col; }); set.append(btn(t('Сохранить'), 'green', () => SO.clanOp('/api/clans/edit', { id: c.id, name: $('#cren').value, tag: $('#ctg').value, color: S._col2 || c.color, descr: $('#cdesc').value, pvp: $('#cpvp').checked, markers: $('#cmark').checked, open: $('#copen2').checked }))); }
  const exits = el('div', 'row2');
  exits.append(btn(t('Покинуть клан'), '', () => new Promise(res => TZ.app.confirm(t('Покинуть клан «{name}»?').replace('{name}', c.name), async () => { await SO.clanOp('/api/clans/leave'); res(); }))));
  if (lead) exits.append(btn(t('Распустить'), 'red', () => new Promise(res => TZ.app.confirm(t('Распустить клан «{name}»? Все участники выйдут из него.').replace('{name}', c.name), async () => { await SO.clanOp('/api/clans/manage', { op: 'disband' }); res(); }))));
  set.append(exits);
  cols.append(left, chat, set);
  const ms = await O.get('/api/clans/' + c.id + '/messages');
  for (const m of ms.msgs) S.appendClanMsg(m);
  const send = async () => { const v = $('#cltext').value.trim(); if (!v) return; $('#cltext').value = ''; try { const x = await O.post('/api/clans/messages', { text: v }); S.appendClanMsg(x.m); } catch (e) { TZ.notify(t('Не отправлено'), e.message, { bad: true }); } };
  $('#clsend').onclick = send; $('#cltext').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); };
};
S.appendClanMsg = (m) => { const box = $('#clmsgs'); if (!box || box.querySelector(`[data-id="${m.id}"]`)) return; const d = el('div', 'msg' + (m.sys ? ' sys' : m.from && O.me && m.from.id === O.me.id ? ' mine' : ''), m.sys ? `<span>★ ${esc(m.text)}</span>` : `<b>${esc(m.from.name)}</b><span>${esc(m.text)}</span><small>${new Date(m.created).toLocaleTimeString().slice(0, 5)}</small>`); d.dataset.id = m.id; box.append(d); box.scrollTop = 1e9; };
S.find = (box) => {
  box.innerHTML = `<div class="row2"><input id="fq" class="px-input" placeholder="${t('Ник или ID (например #K7F2Q9XM)')}" maxlength="20"><button class="px-btn green" id="fgo">${t('Найти')}</button></div><div id="fres"></div>
    <p class="phint">${t('Ваш ID')}: <b class="gold">#${esc(O.me.id)}</b> — ${t('сообщите его другу, чтобы он нашёл вас.')}</p>`;
  const go = async () => {
    const q = $('#fq').value.trim(); if (!q) return; const res = $('#fres'); res.innerHTML = `<div class="sub">${t('Поиск...')}</div>`;
    try { const r = await O.get('/api/search?q=' + encodeURIComponent(q)); res.innerHTML = ''; if (!r.users.length) res.innerHTML = `<div class="empty">${t('Никого не нашли')}</div>`; for (const u of r.users) res.append(prow(u, u.id === O.me.id ? [] : [btn(t('В друзья'), 'green', async () => { await O.post('/api/friends/request', { id: u.id }); TZ.notify(t('Заявка отправлена'), u.name); }), btn(t('Написать'), '', () => S.show('msgs', u.id))])); } catch (e) { res.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  $('#fgo').onclick = go; $('#fq').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); };
};

// ---------------------------------------------------------------- multiplayer screen
const MP = SO.MP = { tab: 'servers' };
MP.render = async () => {
  $('#mptabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === MP.tab));
  $('#mptabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; MP.tab = b.dataset.t; TZ.audio.play('ui'); MP.render(); };
  const box = $('#mpbody');
  $('#mpstatus').innerHTML = Acc.isOnline() ? (O.online ? `<span class="onl">● ${t('онлайн')}</span>` : `<span class="warn">● ${t('нет связи с сервером')}</span>`) : '';
  if (!Acc.isOnline()) {
    box.innerHTML = `<div class="empty big">${t('Мультиплеер доступен только с аккаунтом.')}<br><small>${t('Гостевой режим — только одиночная игра.')}</small></div>`;
    const b = el('button', 'px-btn big green', t('Войти или создать аккаунт')); b.onclick = () => L.show(); box.append(b); return;
  }
  if (!box.dataset.tab || box.dataset.tab !== MP.tab) box.innerHTML = `<div class="sub">${t('Загрузка...')}</div>`;
  box.dataset.tab = MP.tab;
  let r; try { r = await O.get('/api/rooms'); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  box.innerHTML = '';
  if (MP.tab === 'servers') {
    const top = el('div', 'mptop', `<input id="srvq" class="px-input" placeholder="${t('Поиск по названию или #хештегу')}" value="${esc(MP.q || '')}">`);
    box.append(top);
    box.append(el('p', 'phint', t('Свой общий сервер можно создать и настроить на сайте игры.')));
    const list = el('div', 'srvgrid'); box.append(list);
    const draw = () => {
      list.innerHTML = ''; const q = (MP.q || '').toLowerCase().replace('#', '');
      const arr = r.servers.filter(s => !q || s.name.toLowerCase().includes(q) || s.tags.some(x => x.toLowerCase().includes(q)));
      if (!arr.length) list.append(el('div', 'empty', r.servers.length ? t('Ничего не найдено') : t('Пока нет общих серверов. Создайте первый!')));
      for (const s of arr) {
        const card = el('div', 'srvcard' + (s.players ? ' live' : ''));
        card.innerHTML = `<div class="srvn">${esc(s.name)} ${s.pvp ? '<span class="tagpvp">PvP</span>' : '<span class="tagpve">PvE</span>'}</div>
          <div class="srvtags">${s.tags.map(x => `<span>#${esc(x)}</span>`).join('')}</div>
          ${s.descr ? `<div class="srvd">${esc(s.descr)}</div>` : ''}
          <div class="srvp"><b>${s.players}</b> / ${s.max} ${t('игроков')} · ${esc(t(TZ.DIFFICULTY[s.diff] ? TZ.DIFFICULTY[s.diff].name : ''))} · ${t('владелец')} ${esc(s.owner || '')}</div>`;
        const go = el('button', 'px-btn green', s.players >= s.max ? t('Заполнен') : t('Играть')); go.disabled = s.players >= s.max;
        go.onclick = () => TZ.app.joinRoom('s' + s.id); card.append(go); list.append(card);
      }
    };
    $('#srvq').oninput = (e) => { MP.q = e.target.value; draw(); }; $('#srvq').onkeydown = (e) => e.stopPropagation();
    draw();
  }
  if (MP.tab === 'friends') {
    if (!r.friends.length) box.append(el('div', 'empty', t('Сейчас никто из друзей не открыл свой мир. Когда друг откроет мир или пригласит вас, он появится здесь.')));
    for (const w of r.friends) {
      const card = el('div', 'srvcard live', `<div class="srvn">${esc(w.name)} ${w.pvp ? '<span class="tagpvp">PvP</span>' : ''}${w.invited ? `<span class="tagpve">${t('вас пригласили')}</span>` : ''}</div><div class="srvp">${t('хост')}: <b>${esc(w.host)}</b> · ${w.players} / ${w.max}</div>`);
      const go = el('button', 'px-btn green', t('Присоединиться')); go.onclick = () => TZ.app.joinRoom(w.room); card.append(go); box.append(card);
    }
    const code = el('div', 'mptop', `<input id="roomcode" class="px-input" placeholder="${t('Код мира от друга (например abc123:456789)')}">`);
    const cj = el('button', 'px-btn', t('Войти по коду')); cj.onclick = () => { const v = $('#roomcode').value.trim(); if (!v) return; const [room, c] = v.split(':'); TZ.app.joinRoom(room, c); };
    code.append(cj); box.append(el('div', 'flabel', t('По коду')), code);
    $('#roomcode').onkeydown = (e) => e.stopPropagation();
    const fb = el('button', 'px-btn', t('Друзья и приглашения')); fb.onclick = () => S.show('friends'); box.append(fb);
  }
  if (MP.tab === 'host') {
    const f = el('div', 'form hostform');
    f.innerHTML = `<label>${t('Мир')}<select id="hworld" class="px-input"><option value="__new">+ ${t('Новый мир')}</option>${TZ.Saves.list().map(m => `<option value="${m.id}">${esc(m.name)} (${t('день')} ${m.day || 1})</option>`).join('')}</select></label>
      <label>${t('Кто может зайти')}<select id="haccess" class="px-input"><option value="friends">${t('Все мои друзья')}</option><option value="invite">${t('Только приглашённые')}</option><option value="code">${t('Друзья и все, у кого есть код')}</option></select></label>
      <div class="flabel">${t('Игроков максимум')}</div><div class="seg" id="hmax"><button class="px-btn" data-v="2">2</button><button class="px-btn" data-v="4">4</button><button class="px-btn sel" data-v="8">8</button><button class="px-btn" data-v="16">16</button></div>
      <label class="chk"><input type="checkbox" id="hpvp"><i></i> ${t('PvP: игроки могут ранить друг друга')}</label>
      <p class="phint">${t('Мир работает на вашем устройстве, друзья подключаются через наш сервер из любой точки мира — без VPN и настроек роутера. После запуска приглашайте друзей: Esc → «Пригласить друзей».')}</p>`;
    box.append(f);
    let max = 8; $('#hmax').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; max = +b.dataset.v; $('#hmax').querySelectorAll('.px-btn').forEach(x => x.classList.toggle('sel', x === b)); };
    const go = el('button', 'px-btn big green', t('Открыть мир для друзей'));
    go.onclick = () => { const opts = { access: $('#haccess').value, max, pvp: $('#hpvp').checked }; const wid = $('#hworld').value; if (wid === '__new') TZ.Menu.newWorld((m) => TZ.app.startRelayHost(m, opts)); else TZ.app.startRelayHost(TZ.Saves.meta(wid), opts); };
    box.append(go);
  }
};

// ---------------------------------------------------------------- shop
const SH = SO.Shop = { tab: 'classes', data: null };
SH.coins = () => { const a = Acc.active(); $('#shopcoins').innerHTML = Acc.isOnline() ? `${coin}<b>${a.coins || 0}</b>` : ''; };
SH.render = async () => {
  $('#shoptabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === SH.tab));
  $('#shoptabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; SH.tab = b.dataset.t; TZ.audio.play('ui'); SH.render(); };
  SH.coins();
  const box = $('#shopbody'); box.innerHTML = '';
  if (!Acc.isOnline()) { box.innerHTML = `<div class="empty big">${t('Магазин доступен только с аккаунтом.')}</div>`; const b = el('button', 'px-btn big green', t('Войти или создать аккаунт')); b.onclick = () => L.show(); box.append(b); return; }
  const a = Acc.active();
  if (SH.tab === 'classes') {
    box.append(el('p', 'phint', t('Класс даёт постоянные умения. Монеты дают за достижения, задания дня, ночи и боссов — или их можно купить. Сменить класс можно в любой момент.')));
    const grid = el('div', 'clsgrid'); box.append(grid);
    for (const c of R.CLASSES) {
      const own = a.classes.includes(c.id), on = a.cls === c.id;
      const card = el('div', 'clscard' + (on ? ' on' : '') + (own ? ' own' : ''));
      card.innerHTML = `<div class="clsic" style="--cc:${c.color}"><img src="${Cos.url(TZ.Classes.icon(c.id, 56))}"></div><div class="clsn">${esc(t(c.name))}</div><div class="clsd">${esc(t(c.desc))}</div>`;
      const b = on ? el('button', 'px-btn small', t('Выбран')) : own ? el('button', 'px-btn small green', t('Выбрать')) : el('button', 'px-btn small gold', `${c.price} ${coin}`);
      b.disabled = on;
      b.onclick = () => busyBtn(b, async () => {
        if (own) { await Acc.setProfile({ cls: c.id }); TZ.audio.play('ui'); SH.render(); return; }
        if ((a.coins || 0) < c.price) { TZ.notify(t('Не хватает монет'), t('Нужно ещё {n}').replace('{n}', c.price - (a.coins || 0)), { bad: true, actions: [{ label: t('Купить монеты'), cls: 'gold', fn: () => { SH.tab = 'donate'; SH.render(); } }] }); return; }
        await new Promise((res) => TZ.app.confirm(t('Купить класс «{name}» за {price} монет?').replace('{name}', t(c.name)).replace('{price}', c.price), async () => { const r = await O.post('/api/classes/buy', { id: c.id }); O.applyMe(r.me); TZ.audio.play('unlock'); TZ.notify(t('Новый класс!'), t(c.name), { gold: true }); SH.render(); res(); }));
      });
      card.append(b); grid.append(card);
    }
  }
  if (SH.tab === 'kits') {
    box.append(el('p', 'phint', t('Набор появится в «Мои наборы». Забрать его можно в любом мире: Esc → «Получить наборы».')));
    const grid = el('div', 'shopgrid'); box.append(grid);
    for (const p of R.PRODUCTS.filter(p => R.COIN_KITS[p.id])) {
      const price = R.COIN_KITS[p.id];
      const card = SH.card(p, `${price} ${coin}`);
      const b = el('button', 'px-btn gold', `${t('Купить за')} ${price} ${coin}`);
      b.onclick = () => busyBtn(b, async () => { if ((a.coins || 0) < price) { TZ.notify(t('Не хватает монет'), '', { bad: true }); return; } const r = await O.post('/api/kits/buy', { id: p.id }); O.applyMe(r.me); TZ.audio.play('unlock'); TZ.notify(t('Набор куплен'), t(p.name), { gold: true }); SH.render(); });
      card.append(b); grid.append(card);
    }
  }
  if (SH.tab === 'donate') {
    let info = SH.data; if (!info) { try { info = SH.data = await O.get('/api/shop'); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; } }
    if (!info.payReady) box.append(el('div', 'warnbox', t('Оплата ещё подключается. Попробуйте позже или напишите в поддержку.')));
    box.append(el('p', 'phint', t('Оплата картой любого банка или кошельком ЮMoney. После оплаты награда придёт автоматически за несколько секунд.')));
    const grid = el('div', 'shopgrid'); box.append(grid);
    for (const p of info.products.filter(p => p.id !== 'server')) {
      const card = SH.card(p, `${p.price} ₽`);
      const b = el('button', 'px-btn green', `${t('Купить')} — ${p.price} ₽`); b.disabled = !info.payReady;
      b.onclick = () => SH.buy(p.id);
      card.append(b); grid.append(card);
    }
  }
  if (SH.tab === 'mine') {
    const kits = a.kits || [];
    if (!kits.length) box.append(el('div', 'empty', t('Наборов нет. Купите набор за монеты или в разделе «Донат».')));
    for (const k of kits) box.append(el('div', 'kitrow', `<b>${esc(t(k.name))}</b> <small>${Object.entries(k.items).map(([i, n]) => esc(t(TZ.ITEMS[i] ? TZ.ITEMS[i].name : i)) + ' ×' + n).join(', ')}</small>`));
    if (kits.length) box.append(el('p', 'phint', t('Забрать: зайдите в мир и нажмите Esc → «Получить наборы».')));
    box.append(el('div', 'flabel', t('Мои покупки')));
    try { const o = await O.get('/api/shop/orders'); for (const x of o.orders) box.append(el('div', 'srv', `<span>${esc(t((R.PRODUCT[x.product] || {}).name || x.product))}</span><span>${x.price} ₽ · <b class="${x.status === 'paid' ? 'onl' : 'warn'}">${x.status === 'paid' ? t('оплачено') : t('не оплачено')}</b> <small>${new Date(x.created).toLocaleDateString()}</small></span>`)); if (!o.orders.length) box.append(el('div', 'sub', t('Покупок пока нет'))); } catch (e) { }
  }
};
SH.card = (p, priceHtml) => {
  const card = el('div', 'shopcard' + (p.best ? ' best' : ''));
  const items = p.items ? Object.entries(p.items).map(([i, n]) => `<span class="kitit" title="${esc(t(TZ.ITEMS[i] ? TZ.ITEMS[i].name : i))}">${TZ.iconURL ? `<img src="${TZ.iconURL(i)}">` : ''}×${n}</span>`).join('') : '';
  card.innerHTML = `${p.best ? `<div class="ribbon">${t('ВЫГОДНО')}</div>` : ''}<div class="shopic">${TZ.Classes.shopIcon(p.icon)}</div><div class="shopn">${esc(t(p.name))}</div><div class="shopd">${esc(t(p.desc))}</div>
    ${p.coins ? `<div class="shopc">+${p.coins} ${coin}</div>` : ''}${p.classes ? `<div class="shopc">${t('Классы')}: ${p.classes.map(c => esc(t(R.CLASS[c].name))).join(', ')}</div>` : ''}<div class="kititems">${items}</div>`;
  return card;
};
SH.buy = async (product, extra) => {
  try {
    const r = await O.post('/api/shop/order', Object.assign({ product }, extra || {}));
    openExternal(r.url);
    TZ.notify(t('Ожидаем оплату'), t('Страница оплаты открыта. Награда придёт автоматически.'), { ttl: 9000 });
    const until = Date.now() + 20 * 60e3;
    const poll = async () => { if (Date.now() > until) return; try { const s = await O.get('/api/shop/orders/' + r.label); if (s.order.status === 'paid') { O.refresh(); return; } } catch (e) { } setTimeout(poll, 5000); };
    setTimeout(poll, 6000);
  } catch (e) { TZ.app.alert(e.message); }
};
SH.claimKits = async () => {
  const G = TZ.app.game; if (!G) return;
  if (!Acc.isOnline()) return TZ.app.alert(t('Наборы доступны только с аккаунтом.'));
  const box = $('#kitbody'); box.innerHTML = ''; $('#kitp').classList.add('show');
  const kits = Acc.active().kits || [];
  if (!kits.length) { box.append(el('div', 'empty', t('Наборов нет. Их можно купить в магазине.'))); return; }
  for (const k of kits) {
    const row = el('div', 'kitrow', `<b>${esc(t(k.name))}</b><small>${Object.entries(k.items).map(([i, n]) => esc(t(TZ.ITEMS[i] ? TZ.ITEMS[i].name : i)) + ' ×' + n).join(', ')}</small>`);
    const b = el('button', 'px-btn green', t('Забрать'));
    b.onclick = () => busyBtn(b, async () => { const r = await O.post('/api/kits/claim', { id: k.id }); O.applyMe(r.me); const items = {}; for (const [i, n] of Object.entries(r.items)) if (TZ.ITEMS[i]) items[i] = n; G.receive(items, G.me.x, G.me.y); TZ.audio.play('unlock'); row.remove(); });
    row.append(b); box.append(row);
  }
};

// ---------------------------------------------------------------- support
const SU = SO.Support = {};
SU.show = async (openId) => {
  if (!needOnline()) return;
  $('#support').classList.add('show'); TZ.audio.play('ui_open');
  const box = $('#supbody'); box.innerHTML = `<div class="sub">${t('Загрузка...')}</div>`;
  try {
    if (openId) return SU.thread(openId);
    const r = await O.get('/api/support'); box.innerHTML = '';
    const nw = el('div', 'form', `<div class="flabel big">${t('Новое обращение')}</div><label>${t('Тема')}<input id="stsub" class="px-input" maxlength="80" placeholder="${t('Например: не пришла покупка')}"></label><label>${t('Опишите проблему')}<textarea id="sttext" class="px-input" rows="4" maxlength="2000"></textarea></label>`);
    const send = btn(t('Отправить в поддержку'), 'green', async () => { const x = await O.post('/api/support', { subject: $('#stsub').value, text: $('#sttext').value }); SU.thread(x.id); });
    nw.append(send); box.append(nw);
    nw.querySelectorAll('input,textarea').forEach(i => i.onkeydown = (e) => e.stopPropagation());
    box.append(el('div', 'flabel', t('Мои обращения')));
    if (!r.tickets.length) box.append(el('div', 'sub', t('Обращений пока нет')));
    for (const x of r.tickets) { const row = el('div', 'srv clickable', `<span>${esc(x.subject)}</span><span><b class="${x.status === 'answered' ? 'onl' : x.status === 'closed' ? '' : 'warn'}">${x.status === 'answered' ? t('есть ответ') : x.status === 'closed' ? t('закрыто') : t('ждёт ответа')}</b> <small>${ago(x.updated)}</small></span>`); row.onclick = () => SU.thread(x.id); box.append(row); }
    if (O.me.admin) { box.append(el('div', 'flabel', t('Панель поддержки'))); const adm = await O.get('/api/admin/tickets?status=open'); for (const x of adm.tickets) { const row = el('div', 'srv clickable', `<span>${esc(x.subject)} <small>${esc(x.name)} #${esc(x.pubid)}</small></span><span><small>${ago(x.updated)}</small></span>`); row.onclick = () => SU.thread(x.id); box.append(row); } if (!adm.tickets.length) box.append(el('div', 'sub', t('Открытых обращений нет'))); box.append(el('p', 'phint', t('Полная админ-панель (баны, заказы, античит) — на сайте в разделе «Профиль → Поддержка».'))); }
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
};
SU.thread = async (id) => {
  const box = $('#supbody'); const r = await O.get('/api/support/' + id); box.innerHTML = '';
  const back = el('button', 'px-btn small ghost', '← ' + t('Все обращения')); back.onclick = () => SU.show(); box.append(back);
  box.append(el('div', 'flabel big', esc(r.ticket.subject) + (r.ticket.user ? ` <small>${esc(r.ticket.user.name)} #${esc(r.ticket.user.id)} ${esc(r.ticket.email || '')}</small>` : '')));
  const ms = el('div', 'msgs tickmsgs'); box.append(ms);
  for (const m of r.msgs) ms.append(el('div', 'msg' + (m.staff ? ' staff' : ' mine'), `<b>${m.staff ? t('Поддержка') : t('Вы')}</b><span>${esc(m.text)}</span><small>${new Date(m.created).toLocaleString()}</small>`));
  const inp = el('div', 'form', `<textarea id="strep" class="px-input" rows="3" maxlength="2000" placeholder="${t('Ответ...')}"></textarea>`); box.append(inp);
  $('#strep').onkeydown = (e) => e.stopPropagation();
  const row = el('div', 'row2'); box.append(row);
  row.append(btn(t('Отправить'), 'green', async () => { await O.post('/api/support/' + id, { text: $('#strep').value }); SU.thread(id); }));
  if (O.me.admin && r.ticket.user) row.append(btn(t('Ответить и закрыть'), '', async () => { await O.post('/api/support/' + id, { text: $('#strep').value || t('Вопрос решён'), close: true }); SU.show(); }));
};

// ---------------------------------------------------------------- bind
SO.bind = () => {
  closeObs.observe($('#social'), { attributes: true, attributeFilter: ['class'] });
  $('#btnSocial').onclick = () => { TZ.audio.init(); S.show(); };
  $('#btnSupport').onclick = () => { TZ.audio.init(); SU.show(); };
};
})();
