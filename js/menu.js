// =====================================================================
//  THE ZOMBIES 2.0 — menus: account, worlds, multiplayer, profile
// =====================================================================
'use strict';
(() => {
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => TZ.esc(s);
const Acc = TZ.Account, Cos = TZ.Cosmetics;
const M = TZ.Menu = {};
const SCREENS = ['menu', 'worlds', 'mp', 'profile', 'achs', 'setup'];
M.show = (id) => {
  for (const s of SCREENS) $('#' + s).classList.toggle('hidden', s !== id);
  M.cur = id; TZ.audio.play('ui');
  if (id === 'menu') { M.renderAccCard(); M.renderServed(); M.renderTip(); $('#dailylist').innerHTML = TZ.Daily.html(); const a = Acc.active(); if (a) $('#achsub').textContent = `Открыто ${Object.keys(a.ach).length} из ${TZ.ACH.length} · рамки, аватары, фоны`; }
  if (id === 'worlds') M.renderWorlds();
  if (id === 'mp') M.renderMP();
  if (id === 'profile') M.renderProfile();
  if (id === 'achs') M.renderAchs();
};
// animated embers, ash and drifting fog over the menu background
const FX = { p: [], fog: [], t: 0, flash: 0 };
M.fx = (dt) => {
  const cv = $('#menufx'); if (!cv || M.cur !== 'menu' && M.cur !== 'worlds' && M.cur !== 'mp' && M.cur !== 'profile' && M.cur !== 'achs') return;
  const W = 480, Hh = 270; if (cv.width !== W) { cv.width = W; cv.height = Hh; }
  const g = cv.getContext('2d'); FX.t += dt; g.clearRect(0, 0, W, Hh);
  if (!FX.fog.length) for (let i = 0; i < 7; i++) FX.fog.push({ x: Math.random() * W, y: 120 + Math.random() * 150, r: 60 + Math.random() * 80, s: 3 + Math.random() * 6 });
  for (const f of FX.fog) { f.x += f.s * dt; if (f.x - f.r > W) f.x = -f.r; const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r); gr.addColorStop(0, 'rgba(150,160,150,0.10)'); gr.addColorStop(1, 'rgba(150,160,150,0)'); g.fillStyle = gr; g.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); }
  while (FX.p.length < 70) { const ember = Math.random() < 0.6; FX.p.push({ x: Math.random() * W, y: ember ? Hh + 4 : -4, vx: (Math.random() - 0.3) * 10, vy: ember ? -(8 + Math.random() * 22) : 6 + Math.random() * 10, life: 4 + Math.random() * 8, ember, ph: Math.random() * 6 }); }
  for (let i = FX.p.length - 1; i >= 0; i--) {
    const p = FX.p[i]; p.life -= dt; p.x += (p.vx + Math.sin(FX.t * 1.5 + p.ph) * 6) * dt; p.y += p.vy * dt;
    if (p.life <= 0 || p.y < -6 || p.y > Hh + 6) { FX.p.splice(i, 1); continue; }
    const a = Math.min(1, p.life / 2);
    g.fillStyle = p.ember ? `rgba(255,${120 + (Math.sin(FX.t * 9 + p.ph) * 60 | 0)},40,${a * 0.9})` : `rgba(170,170,160,${a * 0.5})`;
    g.fillRect(p.x | 0, p.y | 0, 1, 1);
  }
  // distant lightning every so often
  FX.flash -= dt; if (FX.flash < -9 - Math.random() * 30) FX.flash = 0.35;
  if (FX.flash > 0) { g.fillStyle = `rgba(200,210,255,${FX.flash * (Math.sin(FX.flash * 60) > 0 ? 0.35 : 0.12)})`; g.fillRect(0, 0, W, Hh); }
};
M.hideAll = () => { for (const s of SCREENS) $('#' + s).classList.add('hidden'); };
// ---------------------------------------------------------------- account card
M.renderAccCard = () => {
  const a = Acc.active(), r = Acc.rankOf(a.rn);
  $('#acccard').innerHTML = `<div class="pav"><img class="pavimg" src="${Cos.url(Cos.avatar(a.avatar, a.look, 72))}"><img class="pfr" src="${Cos.url(Cos.frame(a.frame, 92))}"></div><div><div class="acc-n">${esc(a.name)}</div><div class="acc-r" style="color:${r.color}">${r.name} · Уровень ${Acc.levelOf(a.rn)}</div><div class="acc-x">${a.rn} RN · достижений ${Object.keys(a.ach).length}/${TZ.ACH.length}</div></div>`;
  $('#acccard').onclick = () => M.show('profile');
};
// ---------------------------------------------------------------- first launch
M.setup = (done) => {
  M.hideAll(); $('#setup').classList.remove('hidden');
  const look = TZ.Chars.defaultLook();
  let steamName = null; try { steamName = window.tzNative && window.tzNative.steamName && window.tzNative.steamName(); } catch (e) { }
  if (steamName) $('#setupname').value = steamName.slice(0, 16);
  M.lookEditor($('#setuplook'), look, () => drawPrev());
  const cv = $('#setupcv'), g = cv.getContext('2d');
  let t = 0; const drawPrev = () => { const s = TZ.Chars.playerSet(look, { head: 'cap' }).get('walk', (t * 8 | 0) % 8, ((t * 0.6) | 0) % 8); M.drawFigure(g, cv.width, cv.height, s); };
  const iv = setInterval(() => { t += 0.05; drawPrev(); }, 50);
  $('#btnSetupDone').onclick = () => {
    const name = $('#setupname').value.trim();
    if (name.length < 2) { $('#setupname').focus(); TZ.audio.play('error'); return; }
    clearInterval(iv); Acc.create(name, look); $('#setup').classList.add('hidden'); done();
  };
};
M.drawFigure = (g, w, h, s) => {
  g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false;
  const k = 5, by = h - 14;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(w / 2, by, 30, 9, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(s.c, Math.round(w / 2 - s.ax * k), Math.round(by - s.ay * k), s.c.width * k, s.c.height * k);
};
M.lookEditor = (box, look, onChange) => {
  const C = TZ.Chars;
  const rows = [['skin', 'Кожа', C.SKINS.length, i => ['Светлая', 'Обычная', 'Смуглая', 'Тёмная', 'Очень тёмная'][i]], ['hair', 'Цвет волос', C.HAIRS.length, i => ['Чёрные', 'Каштан', 'Рыжие', 'Русые', 'Седые', 'Красные', 'Синие'][i]], ['style', 'Причёска', C.HAIRSTYLES.length, i => ['Короткая', 'Длинная', 'Хвост', 'Лысый', 'Ирокез', 'Растрёпанная'][i]], ['outfit', 'Одежда', C.OUTFITS.length, i => C.OUTFITS[i].name]];
  box.innerHTML = '';
  for (const [k, label, n, nameOf] of rows) {
    const r = el('div', 'lookrow', `<span>${label}</span><button class="px-btn small">◀</button><div class="val">${nameOf(look[k] % n)}</div><button class="px-btn small">▶</button>`);
    const [prev, next] = r.querySelectorAll('button');
    const upd = (d) => { look[k] = (look[k] + d + n) % n; r.querySelector('.val').textContent = nameOf(look[k]); TZ.audio.play('ui'); onChange && onChange(); };
    prev.onclick = () => upd(-1); next.onclick = () => upd(1);
    box.append(r);
  }
};
// ---------------------------------------------------------------- worlds
const worldThumb = (m) => {
  const cv = TZ.canvas(100, 64);
  try {
    const w = new TZ.World(m.seed, { biomeOffset: m.off });
    const id = cv.g.createImageData(100, 64);
    const BC = [[74, 92, 46], [116, 122, 58], [220, 226, 236], [72, 86, 52], [184, 158, 114], [222, 186, 124]];
    for (let j = 0; j < 64; j++) for (let i = 0; i < 100; i++) { const x = 70 + (i - 50) * 6, y = 74 + (j - 32) * 6; let c = BC[w.biomeRaw(x, y)]; if (w.roadAt(x, y) && w.roadAt(x, y) !== 4) c = [60, 60, 64]; if (w.lake(x, y) > 0.71) c = [44, 74, 100]; const k = (j * 100 + i) * 4; id.data[k] = c[0]; id.data[k + 1] = c[1]; id.data[k + 2] = c[2]; id.data[k + 3] = 255; }
    cv.g.putImageData(id, 0, 0); cv.g.fillStyle = '#7dff6a'; cv.g.fillRect(49, 31, 3, 3);
  } catch (e) { }
  return cv;
};
M.renderWorlds = () => {
  const box = $('#worldlist'); box.innerHTML = '';
  const L = TZ.Saves.list();
  if (!L.length) box.innerHTML = '<div class="empty">Пока нет ни одного мира.<br>Нажмите «Создать мир», чтобы начать выживание.</div>';
  for (const m of L) {
    const c = el('div', 'wcard');
    c.append(worldThumb(m));
    c.append(el('div', '', `<div class="wname">${esc(m.name)}</div><div class="wmeta">День ${m.day || 1} · ${TZ.DIFFICULTY[m.diff || 'normal'].name} · ${m.story === false ? 'свободный режим' : 'сюжет'} · зерно ${m.seed}</div><div class="wmeta">Последняя игра: ${new Date(m.played || m.created).toLocaleString('ru-RU')}</div>`));
    const b = el('div', 'wbtns');
    const play = el('button', 'px-btn green', 'Играть'); play.onclick = () => TZ.app.startSolo(m);
    const ren = el('button', 'px-btn small', 'Имя'); ren.onclick = () => TZ.app.prompt('Новое название мира', m.name, (v) => { if (v) { TZ.Saves.rename(m.id, v.slice(0, 28)); M.renderWorlds(); } });
    const del = el('button', 'px-btn small red', 'Удалить'); del.onclick = () => TZ.app.confirm(`Удалить мир «${m.name}»? Это нельзя отменить.`, () => { TZ.Saves.remove(m.id); M.renderWorlds(); });
    b.append(play, ren, del); c.append(b); box.append(c);
  }
};
M.newWorld = (after) => {
  $('#newworld').classList.add('show'); $('#nwname').value = 'Мир ' + (TZ.Saves.list().length + 1); $('#nwseed').value = '';
  M._nwAfter = after;
};
M.bindNewWorld = () => {
  let diff = 'normal';
  $('#nwdiff').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; diff = b.dataset.v; $('#nwdiff').querySelectorAll('.px-btn').forEach(x => x.classList.toggle('sel', x === b)); TZ.audio.play('ui'); };
  $('#btnCreateWorld').onclick = () => {
    const m = TZ.Saves.create({ name: $('#nwname').value.trim() || 'Новый мир', seed: $('#nwseed').value.trim(), diff, story: $('#nwstory').checked });
    $('#newworld').classList.remove('show');
    if (M._nwAfter) { const f = M._nwAfter; M._nwAfter = null; f(m); } else TZ.app.startSolo(m);
  };
};
M.renderTip = () => {
  const box = $('#tipbox'); let t = '';
  if (TZ.isIOS && !TZ.isApp && !navigator.standalone) t = 'iPhone: нажмите «Поделиться» → «На экран Домой» — игра будет открываться на весь экран, как приложение.';
  else if (TZ.isAndroid && !TZ.isApp && !matchMedia('(display-mode: fullscreen)').matches) t = 'Android: меню браузера ⋮ → «Добавить на главный экран» — игра будет открываться на весь экран.';
  box.classList.toggle('hidden', !t); box.textContent = t;
};
// ---------------------------------------------------------------- page served by a game server (phone opened http://pc:27015)
M.renderServed = async (refresh) => {
  const box = $('#servedbox'); if (!TZ.Net.served) { box.classList.add('hidden'); return; }
  if (refresh) await TZ.Net.detect();
  const s = TZ.Net.served;
  box.classList.remove('hidden');
  if (s.host) {
    box.innerHTML = `<div class="sv1">Сервер «${esc(s.name || 'Сервер')}»</div><div class="sv2">игроков ${s.players || 1} из ${s.max || 8} · ${esc(location.host)}</div><button class="px-btn big green" id="btnPlayServed">Играть на этом сервере</button>`;
    $('#btnPlayServed').onclick = () => { TZ.audio.play('ui'); TZ.app.joinServer({ via: 'ws', addr: location.host }); };
  } else if (s.open) {
    box.innerHTML = `<div class="sv1">Выделенный сервер</div><div class="sv2">Хоста пока нет — создайте мир, и друзья смогут зайти</div><button class="px-btn big green" id="btnHostServed">Создать мир на сервере</button>`;
    $('#btnHostServed').onclick = () => { TZ.audio.play('ui'); M.show('mp'); };
  } else {
    box.innerHTML = `<div class="sv1">Сервер «${esc(s.name || '')}»</div><div class="sv2">Хост вышел из игры. Ожидание...</div>`;
  }
  clearTimeout(M._svT); M._svT = setTimeout(() => { if (M.cur === 'menu' && TZ.app.state === 'menu') M.renderServed(true); }, 4000);
};
// ---------------------------------------------------------------- multiplayer
M.renderMP = () => {
  const a = Acc.active();
  if (!$('#srvname').value) $('#srvname').value = `Сервер ${a.name}`;
  const sel = $('#srvworld'); sel.innerHTML = '<option value="__new">+ Новый мир</option>' + TZ.Saves.list().map(m => `<option value="${m.id}">${esc(m.name)} (день ${m.day || 1})</option>`).join('');
  const nat = !!(window.tzNative && window.tzNative.server);
  document.querySelectorAll('.nbonly').forEach(e => e.classList.toggle('hidden', !nat));
  const sv = TZ.Net.served;
  $('#mpnote').innerHTML = nat ? 'Игроки в одной сети видят сервер в списке. Телефоны подключаются по ссылке или QR-коду (Esc → «Пригласить» после запуска). Через интернет: откройте TCP-порт 27015 на роутере или используйте Radmin VPN / Hamachi.'
    : sv ? `Игра открыта с сервера <b>${esc(location.host)}</b>. ${sv.open ? 'Хоста пока нет: «Запустить сервер» создаст мир на нём.' : 'Нажмите «Войти» в списке.'}`
    : TZ.isApp ? 'Найдите сервер в той же Wi-Fi сети («Глубокий поиск») или введите IP, который показывает хост.'
    : 'В браузере сервер работает между вкладками. Чтобы играть с телефонами — запустите сервер в версии для ПК: телефоны просто откроют ссылку. По IP можно зайти на сервер, запущенный в версии для ПК.';
  M.scan();
};
M.scan = async () => {
  const box = $('#srvlist'); box.innerHTML = '<div class="sub">Поиск серверов...</div>';
  const list = await TZ.Net.scanLan();
  M.listServers(list);
};
M.listServers = (list) => {
  const box = $('#srvlist');
  box.innerHTML = '';
  if (!list.length) box.innerHTML = '<div class="sub">Серверов не найдено</div>';
  const seen = new Set();
  for (const s of list) {
    const key = s.via === 'tab' ? s.sid : s.addr; if (seen.has(key)) continue; seen.add(key);
    if (s.open && !s.host) continue;
    const row = el('div', 'srv', `<span>${esc(s.name || 'Сервер')} <small>${s.via === 'tab' ? 'вкладка браузера' : esc(s.addr || '')}</small></span><span>${s.players || 1}/${s.max || 8} <button class="px-btn small green">Войти</button></span>`);
    row.querySelector('button').onclick = () => TZ.app.joinServer(s.via === 'tab' ? { via: 'tab', sid: s.sid } : { via: 'ws', addr: s.addr });
    box.append(row);
  }
};
M.bindMP = () => {
  let max = 8;
  $('#srvmax').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; max = +b.dataset.v; $('#srvmax').querySelectorAll('.px-btn').forEach(x => x.classList.toggle('sel', x === b)); };
  $('#btnScan').onclick = () => { TZ.audio.play('ui'); M.scan(); };
  $('#btnSweep').onclick = async () => {
    TZ.audio.play('ui'); const b = $('#btnSweep'); if (b.disabled) return; b.disabled = true;
    const box = $('#srvlist');
    const list = await TZ.Net.sweep((p, found) => { b.textContent = `Ищем в сети... ${Math.round(p * 100)}%`; if (found.length) M.listServers(found); });
    b.disabled = false; b.textContent = 'Глубокий поиск в Wi-Fi';
    if (list.length) M.listServers(list); else box.innerHTML = '<div class="sub">Серверов не найдено. Введите IP вручную — его показывает хост (Esc → «Пригласить»).</div>';
  };
  $('#btnJoinIP').onclick = () => { const a = $('#joinip').value.trim(); if (!a) { $('#joinip').focus(); return; } TZ.app.joinServer({ via: 'ws', addr: a }); };
  $('#btnHost').onclick = () => {
    const info = { name: $('#srvname').value.trim() || 'Сервер', max, pvp: $('#srvpvp').checked, port: +$('#srvport').value || TZ.Net.PORT };
    const wid = $('#srvworld').value;
    if (wid === '__new') M.newWorld((m) => TZ.app.startHost(m, info));
    else TZ.app.startHost(TZ.Saves.meta(wid), info);
  };
};
// ---------------------------------------------------------------- profile
const PTABS = [['avatar', 'Аватар'], ['frame', 'Рамка'], ['bg', 'Фон'], ['medals', 'Медали'], ['look', 'Внешность'], ['accounts', 'Аккаунты'], ['history', 'История RN']];
M.renderProfile = () => {
  M.ptab = M.ptab || 'avatar';
  $('#profcard').innerHTML = Cos.card(Acc.profile());
  $('#proftabs').innerHTML = PTABS.map(([k, n]) => `<button class="tab ${k === M.ptab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('');
  $('#proftabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; M.ptab = b.dataset.t; TZ.audio.play('ui'); M.renderProfile(); };
  const body = $('#profbody'); body.innerHTML = ''; const a = Acc.active();
  const save = () => { Acc.save(); M.renderProfile(); };
  const pick = (kind, table, render) => {
    const grid = el('div', 'pick');
    for (const id in table) {
      const ok = Acc.unlocked(kind, id), on = a[kind] === id;
      const it = el('div', `pickit ${on ? 'on' : ''} ${ok ? '' : 'locked'} ${kind === 'bg' ? 'bgp' : ''}`, `${render(id)}<div>${table[id].name}</div>${ok ? '' : `<small>${esc(Acc.requirement(kind, id))}</small>`}`);
      it.title = ok ? 'Выбрать' : 'Закрыто: ' + Acc.requirement(kind, id);
      it.onclick = () => { if (!ok) { TZ.audio.play('error'); return; } a[kind] = id; TZ.audio.play('ui'); save(); };
      grid.append(it);
    }
    body.append(grid);
  };
  if (M.ptab === 'avatar') pick('avatar', TZ.AVATARS, id => `<img src="${Cos.url(Cos.avatar(id, a.look, 80))}">`);
  if (M.ptab === 'frame') pick('frame', TZ.FRAMES, id => `<div style="position:relative;width:80px;height:80px"><img style="position:absolute;inset:9px;width:62px;height:62px" src="${Cos.url(Cos.avatar(a.avatar, a.look, 62))}"><img style="position:absolute;inset:0" src="${Cos.url(Cos.frame(id, 80))}"></div>`);
  if (M.ptab === 'bg') pick('bg', TZ.BGS, id => `<img src="${Cos.url(Cos.background(id, 160, 60))}">`);
  if (M.ptab === 'medals') {
    body.append(el('div', 'sub', 'Выберите до 3 медалей — их увидят другие игроки в вашем профиле (F3). Медали выдаются за достижения.'));
    const grid = el('div', 'pick');
    const got = TZ.ACH.filter(c => a.ach[c.id]);
    if (!got.length) grid.append(el('div', 'empty', 'Пока нет медалей. Выполняйте достижения!'));
    for (const c of got) {
      const on = a.medals.includes(c.id);
      const it = el('div', `pickit ${on ? 'on' : ''}`, `<img src="${Cos.url(Cos.medal(c.id, 80))}"><div>${c.name}</div><small>${on ? 'На профиле #' + (a.medals.indexOf(c.id) + 1) : ''}</small>`);
      it.onclick = () => { if (on) a.medals = a.medals.filter(m => m !== c.id); else { if (a.medals.length >= 3) a.medals.shift(); a.medals.push(c.id); } TZ.audio.play('ui'); save(); };
      grid.append(it);
    }
    body.append(grid);
  }
  if (M.ptab === 'look') {
    const cv = TZ.canvas(160, 180); cv.style.cssText = 'image-rendering:pixelated;display:block;margin:0 auto 8px';
    const box = el('div'); body.append(cv, box);
    const look = a.look;
    const draw = () => { const s = TZ.Chars.playerSet(look, { head: 'cap' }).get('idle', 0, ((performance.now() / 700) | 0) % 8); M.drawFigure(cv.g, 160, 180, s); };
    M.lookEditor(box, look, () => { Acc.save(); draw(); $('#profcard').innerHTML = Cos.card(Acc.profile()); });
    clearInterval(M._lookIv); M._lookIv = setInterval(() => { if (M.ptab !== 'look' || M.cur !== 'profile') return clearInterval(M._lookIv); draw(); }, 200); draw();
  }
  if (M.ptab === 'accounts') {
    const f = el('div', 'form');
    f.innerHTML = `<label>Имя текущего аккаунта<input id="accname" class="px-input" maxlength="16" value="${esc(a.name)}"></label>`;
    const sv = el('button', 'px-btn', 'Сохранить имя'); sv.onclick = () => { const v = $('#accname').value.trim(); if (v.length >= 2) { a.name = v; save(); } };
    f.append(sv);
    f.append(el('div', 'flabel', 'Аккаунты на этом компьютере'));
    const list = el('div', 'acclist');
    for (const x of Acc.all()) {
      const r = el('div', 'srv', `<span>${esc(x.name)} <small>${x.rn} RN · ур. ${Acc.levelOf(x.rn)}</small></span><span>${x.id === a.id ? '<span class="gold">активен</span>' : ''}</span>`);
      if (x.id !== a.id) { const b1 = el('button', 'px-btn small', 'Войти'); b1.onclick = () => { Acc.use(x.id); TZ.audio.play('ui'); M.renderProfile(); }; const b2 = el('button', 'px-btn small red', '✕'); b2.onclick = () => TZ.app.confirm(`Удалить аккаунт «${x.name}»? Весь прогресс будет потерян.`, () => { Acc.remove(x.id); M.renderProfile(); }); r.lastChild.append(b1, b2); }
      list.append(r);
    }
    f.append(list);
    const nb = el('button', 'px-btn green', 'Создать новый аккаунт'); nb.onclick = () => TZ.app.prompt('Имя нового выжившего', '', (v) => { if (v && v.trim().length >= 2) { Acc.create(v.trim().slice(0, 16)); M.renderProfile(); } });
    f.append(nb, el('div', 'phint', 'Несколько аккаунтов удобно для игры вдвоём на одном компьютере (во второй вкладке браузера).'));
    f.append(el('div', 'flabel', 'Перенос аккаунта (ПК ⇄ телефон)'));
    f.append(el('div', 'phint', 'Скопируйте код на одном устройстве и вставьте на другом — перенесутся уровень, RN, медали, рамки и статистика. Отправьте код себе в мессенджер.'));
    const ta = el('textarea', 'px-input acccode'); ta.rows = 3; ta.placeholder = 'Сюда появится код аккаунта или вставьте код с другого устройства';
    const row = el('div', 'row2');
    const be = el('button', 'px-btn', 'Показать код'); be.onclick = async () => { ta.value = Acc.exportCode(); ta.select(); try { await navigator.clipboard.writeText(ta.value); be.textContent = 'Скопировано ✓'; } catch (e) { be.textContent = 'Код выделен — скопируйте'; } TZ.audio.play('ui'); };
    const bi = el('button', 'px-btn green', 'Загрузить из кода'); bi.onclick = () => { try { const o = Acc.importCode(ta.value); TZ.audio.play('unlock'); TZ.app.alert(`Аккаунт «${o.name}» перенесён: ${o.rn} RN, уровень ${Acc.levelOf(o.rn)}.`); M.renderProfile(); } catch (e) { TZ.audio.play('error'); TZ.app.alert(e.message); } };
    row.append(be, bi); f.append(ta, row);
    body.append(f);
  }
  if (M.ptab === 'history') {
    const h = (a.history || []).slice().reverse();
    if (!h.length) body.append(el('div', 'empty', 'Пока пусто. RN начисляется за пережитые ночи, достижения и боссов, отнимается за смерть.'));
    for (const e of h) body.append(el('div', 'srv', `<span>${esc(e.why || '')}</span><span style="color:${e.d > 0 ? '#8fd86a' : '#ff6a50'}">${e.d > 0 ? '+' : ''}${e.d} RN <small>${new Date(e.t).toLocaleString('ru-RU')}</small></span>`));
  }
};
// ---------------------------------------------------------------- achievements
M.renderAchs = () => {
  const a = Acc.active(), box = $('#achlist'); box.innerHTML = '';
  $('#achsum').textContent = `${Object.keys(a.ach).length} из ${TZ.ACH.length}`;
  for (const c of TZ.ACH) {
    const got = !!a.ach[c.id], v = Math.min(c.n, a.stats[c.stat] || 0);
    const rewards = ['медаль'].concat(c.frame ? ['рамка «' + TZ.FRAMES[c.frame].name + '»'] : [], c.bg ? ['фон «' + TZ.BGS[c.bg].name + '»'] : [], c.avatar ? ['аватар «' + TZ.AVATARS[c.avatar].name + '»'] : []);
    box.append(el('div', 'achit' + (got ? '' : ' no'), `<img src="${Cos.url(Cos.medal(c.id, 52))}"><div><div class="an">${c.name}${got ? ' <span class="ok">✓</span>' : ''}</div><div class="ad">${c.desc}</div><div class="ar">Награда: ${rewards.join(', ')} · +${c.rn} RN</div></div><div><div class="prog"><i style="width:${v / c.n * 100}%"></i></div><div class="pt">${got ? 'Получено ' + new Date(a.ach[c.id]).toLocaleDateString('ru-RU') : `${typeof v === 'number' && v % 1 ? v.toFixed(1) : v} / ${c.n}`}</div></div>`));
  }
};
M.bind = () => {
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { TZ.audio.init(); M.show(b.dataset.go); }));
  $('#btnNewWorld').onclick = () => M.newWorld();
  M.bindNewWorld(); M.bindMP();
  document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.px-btn, .tab, .pickit')) TZ.audio.play('ui_hover'); });
};
})();
