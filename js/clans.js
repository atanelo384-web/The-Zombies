// =====================================================================
//  THE ZOMBIES 4.2 — clans (multiplayer)
//  Clans live on the host and are saved with the world. Each clan has a
//  name, a colour, a PvP switch and a "show members on the map" switch.
//  Members never hurt each other; the clan tag is shown in chat, above
//  heads and in the player list. Clan chat: /c text.
// =====================================================================
'use strict';
(() => {
const $ = s => document.querySelector(s), esc = s => TZ.esc(s);
const COLORS = ['#e04a3a', '#e8902a', '#e8d040', '#58c068', '#3cc0a8', '#40a8e8', '#4a6ae8', '#a060e0', '#e060a8', '#d8d8d0'];
TZ.CLAN_COLORS = COLORS;
const MAX = 16;
const P = TZ.Game.prototype;
P.clanOf = function (uid) { if (!uid || !this.clans) return null; for (const c of this.clans) if (c.members.includes(uid)) return c; return null; };
P.sameClan = function (a, b) { const c = this.clanOf(a); return !!c && a !== b && c.members.includes(b); };
P.syncClans = function () {
  this.clansVer = (this.clansVer || 0) + 1;
  if (this.net && this.role === 'host') this.net.broadcast('clans', this.clans || []);
  if (this.ui && this.ui.onClans) this.ui.onClans(this);
};
P.clanCmd = function (op, d = {}) { this.act('clan', Object.assign({ op }, d)); };
// authority: every clan change goes through here
P.clanAct = function (pid, d) {
  const p = this.players.get(pid); if (!p || !d) return;
  this.clans = this.clans || [];
  const uid = p.uid, mine = this.clanOf(uid);
  const clean = (s) => String(s || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const taken = (n, self) => this.clans.some(c => c !== self && c.name.toLowerCase() === n.toLowerCase());
  switch (d.op) {
    case 'create': {
      if (!this.net) return this.hintTo(pid, 'Кланы работают в мультиплеере');
      if (mine) return this.hintTo(pid, 'Вы уже состоите в клане');
      const n = clean(d.name); if (n.length < 2) return this.hintTo(pid, 'Название клана — от 2 символов');
      if (taken(n)) return this.hintTo(pid, 'Клан с таким названием уже есть');
      const c = { id: 'k' + Date.now().toString(36) + ((Math.random() * 1e4) | 0), name: n, color: COLORS.includes(d.color) ? d.color : COLORS[0], owner: uid, members: [uid], names: { [uid]: p.name }, pvp: true, markers: true, made: Date.now() };
      this.clans.push(c); this.ev('sys', `${p.name} основал клан «${n}»`, 'good'); this.toPlayer(pid, 'stat', { k: 'clanMade', n: 1 });
      break;
    }
    case 'edit': {
      if (!mine || mine.owner !== uid) return this.hintTo(pid, 'Менять настройки может только глава клана');
      if (d.name != null) { const n = clean(d.name); if (n.length >= 2 && !taken(n, mine)) mine.name = n; else if (n !== mine.name) this.hintTo(pid, 'Это название занято или слишком короткое'); }
      if (COLORS.includes(d.color)) mine.color = d.color;
      if (d.pvp != null) { mine.pvp = !!d.pvp; for (const u of mine.members) this.msgTo(u, mine.pvp ? `Клан «${mine.name}»: PvP включено — вы можете сражаться с другими игроками` : `Клан «${mine.name}»: PvP выключено — клан не участвует в боях с игроками`, 'warn'); }
      if (d.markers != null) mine.markers = !!d.markers;
      break;
    }
    case 'invite': {
      if (!mine) return this.hintTo(pid, 'Сначала создайте клан');
      const t = this.players.get(d.pid); if (!t || t === p) return;
      if (this.clanOf(t.uid)) return this.hintTo(pid, `${t.name} уже состоит в клане`);
      if (mine.members.length >= MAX) return this.hintTo(pid, `В клане может быть не больше ${MAX} игроков`);
      this.clanInv = this.clanInv || {};
      this.clanInv[t.uid] = { id: mine.id, t: Date.now() };
      this.toPlayer(t.pid, 'clanInvite', { id: mine.id, name: mine.name, color: mine.color, from: p.name });
      this.msgTo(uid, `Приглашение в клан отправлено: ${t.name}`, 'good');
      return;
    }
    case 'accept': {
      const inv = this.clanInv && this.clanInv[uid];
      if (!inv || inv.id !== d.id || Date.now() - inv.t > 5 * 60000) return this.hintTo(pid, 'Приглашение устарело');
      delete this.clanInv[uid];
      if (mine) return this.hintTo(pid, 'Сначала покиньте свой клан');
      const c = this.clans.find(c => c.id === d.id); if (!c) return this.hintTo(pid, 'Этого клана больше нет');
      if (c.members.length >= MAX) return this.hintTo(pid, 'Клан заполнен');
      c.members.push(uid); c.names[uid] = p.name;
      this.ev('sys', `${p.name} вступил в клан «${c.name}»`, 'good');
      break;
    }
    case 'decline': { const inv = this.clanInv && this.clanInv[uid]; if (inv) { delete this.clanInv[uid]; const c = this.clans.find(c => c.id === inv.id); if (c) this.msgTo(c.owner, `${p.name} отклонил приглашение в клан`, 'warn'); } return; }
    case 'leave': {
      if (!mine) return;
      mine.members = mine.members.filter(u => u !== uid); delete mine.names[uid];
      this.ev('sys', `${p.name} покинул клан «${mine.name}»`, 'warn');
      if (!mine.members.length) this.clans = this.clans.filter(c => c !== mine);
      else if (mine.owner === uid) { mine.owner = mine.members[0]; this.msgTo(mine.owner, `Теперь вы глава клана «${mine.name}»`, 'good'); }
      break;
    }
    case 'kick': {
      if (!mine || mine.owner !== uid || d.uid === uid || !mine.members.includes(d.uid)) return;
      mine.members = mine.members.filter(u => u !== d.uid); const nm = mine.names[d.uid]; delete mine.names[d.uid];
      this.msgTo(d.uid, `Вас исключили из клана «${mine.name}»`, 'bad');
      for (const u of mine.members) this.msgTo(u, `${nm || 'Игрок'} исключён из клана`, 'warn');
      break;
    }
    case 'lead': {
      if (!mine || mine.owner !== uid || !mine.members.includes(d.uid)) return;
      mine.owner = d.uid; for (const u of mine.members) this.msgTo(u, `Новый глава клана: ${mine.names[d.uid] || ''}`, 'good');
      break;
    }
    case 'disband': {
      if (!mine || mine.owner !== uid) return;
      this.clans = this.clans.filter(c => c !== mine);
      this.ev('sys', `Клан «${mine.name}» распущен`, 'warn');
      break;
    }
    case 'chat': {
      if (!mine) return this.hintTo(pid, 'Вы не состоите в клане');
      const txt = String(d.text || '').slice(0, 160); if (!txt) return;
      for (const u of mine.members) { const q = this.playerByUid(u); if (q) this.toPlayer(q.pid, 'clanChat', { name: p.name, text: txt, color: mine.color, clan: mine.name }); }
      return;
    }
    default: return;
  }
  this.syncClans();
};
// clan rules for player-vs-player damage (true = blocked)
P.clanBlocksDamage = function (attackerPid, victim) {
  const a = this.players.get(attackerPid); if (!a || a === victim) return false;
  if (this.sameClan(a.uid, victim.uid)) return true;
  const ca = this.clanOf(a.uid), cv = this.clanOf(victim.uid);
  return !!((ca && !ca.pvp) || (cv && !cv.pvp));
};
// keep member names fresh (shown for offline members too)
P.clanTouchNames = function () { for (const c of this.clans || []) for (const p of this.players.values()) if (c.members.includes(p.uid) && c.names[p.uid] !== p.name) c.names[p.uid] = p.name; };

// ---------------------------------------------------------------- UI
const UI = TZ.ClanUI = {
  open() {
    const G = TZ.game; if (!G || G.demo) return;
    $('#clanp').classList.add('show'); TZ.audio.play('ui_open'); UI.render(G);
  },
  close() { $('#clanp').classList.remove('show'); },
  toggle() { if ($('#clanp').classList.contains('show')) UI.close(); else UI.open(); },
  render(G) {
    const box = $('#clanbody'); if (!box) return;
    const me = G.me, c = G.clanOf(me.uid);
    if (!G.net) { box.innerHTML = '<div class="empty">Кланы работают в мультиплеере.<br>Запустите сервер или подключитесь к другу.</div>'; return; }
    if (!c) {
      const sel = UI._color || COLORS[(Math.random() * COLORS.length) | 0]; UI._color = sel;
      box.innerHTML = `<div class="clannew">
        <div class="flabel big">Создать клан</div>
        <label class="cl-row">Название<input id="clanname" class="px-input" maxlength="16" placeholder="например: Волки"></label>
        <div class="flabel">Цвет клана</div>
        <div class="clcolors">${COLORS.map(col => `<button class="clc ${col === sel ? 'on' : ''}" data-col="${col}" style="--cc:${col}"></button>`).join('')}</div>
        <div class="mbtns row"><button class="px-btn big green" id="clancreate">Создать клан</button></div>
        <p class="shint">В клан приглашают через список игроков (F3) — кнопка «В клан» рядом с игроком. Соклановцы не наносят друг другу урон, видят друг друга на карте и пишут в клановый чат командой <kbd>/c</kbd>.</p>
      </div>`;
      box.querySelectorAll('.clc').forEach(b => b.onclick = () => { UI._color = b.dataset.col; box.querySelectorAll('.clc').forEach(x => x.classList.toggle('on', x === b)); TZ.audio.play('ui'); });
      $('#clancreate').onclick = () => { const n = $('#clanname').value.trim(); if (n.length < 2) { $('#clanname').focus(); TZ.audio.play('error'); return; } G.clanCmd('create', { name: n, color: UI._color }); TZ.audio.play('craft'); };
      return;
    }
    const lead = c.owner === me.uid;
    const online = new Set([...G.players.values()].map(p => p.uid));
    const members = c.members.map(u => `<div class="clmem ${online.has(u) ? 'on' : ''}"><span class="cldot"></span><span class="clmn">${esc(c.names[u] || 'Игрок')}</span>${u === c.owner ? '<span class="host">ГЛАВА</span>' : ''}${u === me.uid ? '<span class="host">ВЫ</span>' : ''}<span class="clst">${online.has(u) ? 'в игре' : 'не в сети'}</span>${lead && u !== me.uid ? `<button class="px-btn small" data-lead="${u}">Главой</button><button class="px-btn small red" data-kick="${u}">Исключить</button>` : ''}</div>`).join('');
    box.innerHTML = `<div class="clhead" style="--cc:${c.color}"><span class="clbadge">${esc(c.name)}</span><span class="sub inline">${c.members.length} / ${MAX} · ${c.pvp ? 'PvP включено' : 'мирный клан'}</span></div>
      <div class="clcols">
        <div><div class="flabel">Участники</div><div class="clmembers scroll">${members}</div>
          <p class="shint">Пригласить: F3 → «В клан» рядом с игроком. Клановый чат: <kbd>/c</kbd> текст.</p></div>
        <div class="clset">
          <div class="flabel">Настройки${lead ? '' : ' <small>(меняет глава)</small>'}</div>
          <label class="cl-row">Название<input id="clanrename" class="px-input" maxlength="16" value="${esc(c.name)}" ${lead ? '' : 'disabled'}></label>
          <div class="clcolors">${COLORS.map(col => `<button class="clc ${col === c.color ? 'on' : ''}" data-col="${col}" style="--cc:${col}" ${lead ? '' : 'disabled'}></button>`).join('')}</div>
          <label class="chk"><input type="checkbox" id="clanpvp" ${c.pvp ? 'checked' : ''} ${lead ? '' : 'disabled'}><i></i> PvP: клан сражается с другими игроками</label>
          <label class="chk"><input type="checkbox" id="clanmark" ${c.markers ? 'checked' : ''} ${lead ? '' : 'disabled'}><i></i> Соклановцы видны на мини-карте и карте мира</label>
          <p class="shint">Урона по своим нет никогда. Если PvP выключено, участники клана не ранят других игроков и сами неуязвимы для них.${G.pvp ? '' : ' <span class="warn">На этом сервере PvP выключено целиком.</span>'}</p>
          <div class="mbtns row">${lead ? '<button class="px-btn small" id="clansave">Сохранить название</button>' : ''}<button class="px-btn small" id="clanleave">Покинуть клан</button>${lead ? '<button class="px-btn small red" id="clandisband">Распустить</button>' : ''}</div>
        </div>
      </div>`;
    if (lead) {
      box.querySelectorAll('.clc').forEach(b => b.onclick = () => { G.clanCmd('edit', { color: b.dataset.col }); TZ.audio.play('ui'); });
      $('#clanpvp').onchange = (e) => G.clanCmd('edit', { pvp: e.target.checked });
      $('#clanmark').onchange = (e) => G.clanCmd('edit', { markers: e.target.checked });
      $('#clansave').onclick = () => { G.clanCmd('edit', { name: $('#clanrename').value }); TZ.audio.play('ui'); };
      $('#clandisband').onclick = () => TZ.app.confirm(`Распустить клан «${c.name}»? Все участники выйдут из него.`, () => G.clanCmd('disband'));
      box.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => TZ.app.confirm(`Исключить ${c.names[b.dataset.kick] || 'игрока'} из клана?`, () => G.clanCmd('kick', { uid: b.dataset.kick })));
      box.querySelectorAll('[data-lead]').forEach(b => b.onclick = () => TZ.app.confirm(`Передать главенство игроку ${c.names[b.dataset.lead] || ''}?`, () => G.clanCmd('lead', { uid: b.dataset.lead })));
    }
    $('#clanleave').onclick = () => TZ.app.confirm(`Покинуть клан «${c.name}»?`, () => G.clanCmd('leave'));
  },
  invited(G, d) {
    TZ.audio.play('quest');
    const t = $('#cfmtext');
    TZ.app.confirm('', () => G.clanCmd('accept', { id: d.id }));
    t.innerHTML = `<b>${esc(d.from)}</b> приглашает вас в клан<br><span class="clbadge" style="--cc:${d.color}">${esc(d.name)}</span>`;
    $('#cfmyes').textContent = 'Вступить'; $('#cfmno').textContent = 'Отказаться';
    const no = $('#cfmno'); const prev = no.onclick; no.onclick = () => { if (prev) prev(); G.clanCmd('decline'); $('#cfmno').textContent = 'Нет'; };
  },
};
// tag helpers used by chat, name tags and the player list
TZ.clanTag = (G, uid) => { const c = G && G.clanOf ? G.clanOf(uid) : null; return c ? { name: c.name, color: c.color } : null; };
})();
