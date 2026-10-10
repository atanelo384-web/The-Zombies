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
const SCREENS = ['menu', 'worlds', 'mp', 'profile', 'achs', 'setup', 'login', 'shop'];
M.show = (id) => {
  for (const s of SCREENS) $('#' + s).classList.toggle('hidden', s !== id);
  M.cur = id; TZ.audio.play('ui');
  if (id === 'menu') { M.renderAccCard(); M.renderTip(); TZ.Social.loadCounts(); $('#dailylist').innerHTML = TZ.Daily.html(); const a = Acc.active(); if (a) $('#achsub').textContent = `Открыто ${Object.keys(a.ach).length} из ${TZ.ACH.length} · рамки, аватары, фоны`; }
  if (id === 'worlds') M.renderWorlds();
  if (id === 'mp') TZ.Social.MP.render();
  if (id === 'shop') TZ.Social.Shop.render();
  if (id === 'profile') M.renderProfile();
  if (id === 'achs') M.renderAchs();
};
// animated embers, ash and drifting fog over the menu background
const FX = { p: [], fog: [], t: 0, flash: 0 };
M.fx = (dt) => {
  const cv = $('#menufx'); if (!cv || !['menu', 'worlds', 'mp', 'profile', 'achs', 'shop'].includes(M.cur)) return;
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
  const a = Acc.active(), r = Acc.rankOf(a.rn), on = Acc.isOnline(), O = TZ.Online;
  const cls = TZ.CLASS[a.cls || 'survivor'];
  $('#acccard').innerHTML = `<div class="pav"><img class="pavimg" src="${Cos.url(Cos.avatar(a.avatar, Acc.lookWithSkin(), 72))}"><img class="pfr" src="${Cos.url(Cos.frame(a.frame, 92))}"></div><div class="accinfo"><div class="acc-n">${esc(a.name)} ${on ? `<small class="accid">#${esc(a.id)}</small>` : `<small class="guestb">${TZ.t('гость')}</small>`}</div><div class="acc-r" style="color:${r.color}">${TZ.t(r.name)} · ${TZ.t('Уровень')} ${Acc.levelOf(a.rn)}</div><div class="acc-x">${a.rn} RN${on ? ` · <i class="coin"></i>${a.coins || 0}` : ''} · <img class="clsmini" src="${Cos.url(TZ.Classes.icon(cls.id, 18))}">${TZ.t(cls.name)}</div>${on ? `<div class="acc-st ${O.online ? 'onl' : 'off'}">● ${O.online ? TZ.t('в сети') : TZ.t('нет связи с сервером')}${O.me && O.me.clan ? ` · <b style="color:${O.me.clan.color}">[${esc(O.me.clan.tag)}]</b>` : ''}</div>` : `<button class="px-btn small green" id="accLogin">${TZ.t('Войти в аккаунт')}</button>`}</div><span class="profgo">${TZ.t('профиль')} ›</span>`;
  $('#acccard').onclick = (e) => { if (e.target.id === 'accLogin') { e.stopPropagation(); TZ.Social.Login.show(); return; } M.show('profile'); };
};
M.afterLogin = () => { M.show('menu'); };
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
    clearInterval(iv); const g = Acc.active(); g.name = name.slice(0, 16); g.look = look; Acc.save(); $('#setup').classList.add('hidden'); done();
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
// ---------------------------------------------------------------- profile
const PTABS = [['avatar', 'Аватар'], ['frame', 'Рамка'], ['bg', 'Фон'], ['medals', 'Медали'], ['look', 'Внешность'], ['skins', 'Скины'], ['class', 'Класс'], ['account', 'Аккаунт'], ['history', 'История RN']];
const t = (x) => TZ.t(x);
M.renderProfile = () => {
  M.ptab = M.ptab || 'avatar';
  $('#profcard').innerHTML = Cos.card(Acc.profile());
  $('#proftabs').innerHTML = PTABS.map(([k, n]) => `<button class="tab ${k === M.ptab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('');
  $('#proftabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; M.ptab = b.dataset.t; TZ.audio.play('ui'); M.renderProfile(); };
  const body = $('#profbody'); body.innerHTML = ''; const a = Acc.active();
  const set = async (patch) => { await Acc.setProfile(patch); M.renderProfile(); };
  const pick = (kind, table, render) => {
    const grid = el('div', 'pick');
    for (const id in table) {
      const ok = Acc.unlocked(kind, id), on = a[kind] === id;
      const it = el('div', `pickit ${on ? 'on' : ''} ${ok ? '' : 'locked'} ${kind === 'bg' ? 'bgp' : ''}`, `${render(id)}<div>${table[id].name}</div>${ok ? '' : `<small>${esc(Acc.requirement(kind, id))}</small>`}`);
      it.title = ok ? t('Выбрать') : t('Закрыто') + ': ' + Acc.requirement(kind, id);
      it.onclick = () => { if (!ok) { TZ.audio.play('error'); return; } TZ.audio.play('ui'); set({ [kind]: id }); };
      grid.append(it);
    }
    body.append(grid);
  };
  const look = Acc.lookWithSkin();
  if (M.ptab === 'avatar') pick('avatar', TZ.AVATARS, id => `<img src="${Cos.url(Cos.avatar(id, look, 80))}">`);
  if (M.ptab === 'frame') pick('frame', TZ.FRAMES, id => `<div style="position:relative;width:80px;height:80px"><img style="position:absolute;inset:9px;width:62px;height:62px" src="${Cos.url(Cos.avatar(a.avatar, look, 62))}"><img style="position:absolute;inset:0" src="${Cos.url(Cos.frame(id, 80))}"></div>`);
  if (M.ptab === 'bg') pick('bg', TZ.BGS, id => `<img src="${Cos.url(Cos.background(id, 160, 60))}">`);
  if (M.ptab === 'medals') {
    body.append(el('div', 'sub', t('Выберите до 3 медалей — их увидят другие игроки в вашем профиле. Медали выдаются за достижения.')));
    const grid = el('div', 'pick');
    const got = TZ.ACH.filter(c => a.ach[c.id]);
    if (!got.length) grid.append(el('div', 'empty', t('Пока нет медалей. Выполняйте достижения!')));
    for (const c of got) {
      const on = a.medals.includes(c.id);
      const it = el('div', `pickit ${on ? 'on' : ''}`, `<img src="${Cos.url(Cos.medal(c.id, 80))}"><div>${c.name}</div><small>${on ? t('На профиле') + ' #' + (a.medals.indexOf(c.id) + 1) : ''}</small>`);
      it.onclick = () => { let m = a.medals.slice(); if (on) m = m.filter(x => x !== c.id); else { if (m.length >= 3) m.shift(); m.push(c.id); } TZ.audio.play('ui'); set({ medals: m }); };
      grid.append(it);
    }
    body.append(grid);
  }
  if (M.ptab === 'look') {
    const cv = TZ.canvas(160, 180); cv.style.cssText = 'image-rendering:pixelated;display:block;margin:0 auto 8px';
    const box = el('div'); body.append(cv, box);
    const lk = Object.assign({}, a.look);
    const draw = () => { const s2 = TZ.Chars.playerSet(Object.assign({}, lk, a.skin ? { sk: a.skin } : {}), { head: 'cap' }).get('idle', 0, ((performance.now() / 700) | 0) % 8); M.drawFigure(cv.g, 160, 180, s2); };
    let tm = 0;
    M.lookEditor(box, lk, () => { draw(); clearTimeout(tm); tm = setTimeout(() => Acc.setProfile({ look: lk }).then(() => { $('#profcard').innerHTML = Cos.card(Acc.profile()); }), 700); });
    if (a.skin) body.append(el('p', 'phint', t('Сейчас надет свой скин — он перекрывает внешность. Снять: вкладка «Скины».')));
    clearInterval(M._lookIv); M._lookIv = setInterval(() => { if (M.ptab !== 'look' || M.cur !== 'profile') return clearInterval(M._lookIv); draw(); }, 200); draw();
  }
  if (M.ptab === 'skins') M.renderSkins(body, a);
  if (M.ptab === 'class') {
    const cur = TZ.CLASS[a.cls || 'survivor'];
    body.append(el('div', 'clscur', `<img src="${Cos.url(TZ.Classes.icon(cur.id, 64))}"><div><b>${t(cur.name)}</b><div class="sub">${t(cur.desc)}</div></div>`));
    const grid = el('div', 'clsgrid small');
    for (const c of TZ.CLASSES) {
      const own = (a.classes || ['survivor']).includes(c.id);
      const it = el('div', 'clscard' + (a.cls === c.id ? ' on' : '') + (own ? ' own' : ' locked'), `<div class="clsic" style="--cc:${c.color}"><img src="${Cos.url(TZ.Classes.icon(c.id, 48))}"></div><div class="clsn">${t(c.name)}</div>${own ? '' : `<small>${c.price} <i class="coin"></i></small>`}`);
      it.title = t(c.desc);
      it.onclick = () => { if (own) { TZ.audio.play('ui'); set({ cls: c.id }); } else { M.show('shop'); } };
      grid.append(it);
    }
    body.append(grid, el('p', 'phint', t('Новые классы — в «Магазине» за монеты. Класс действует во всех мирах и на серверах.')));
  }
  if (M.ptab === 'account') M.renderAccount(body, a);
  if (M.ptab === 'history') {
    const h = (a.history || []).slice().reverse();
    if (!h.length) body.append(el('div', 'empty', t('Пока пусто. RN начисляется за пережитые ночи, достижения и боссов, отнимается за смерть.')));
    for (const e of h) body.append(el('div', 'srv', `<span>${esc(t(e.why || ''))}</span><span style="color:${e.d > 0 ? '#8fd86a' : '#ff6a50'}">${e.d > 0 ? '+' : ''}${e.d} RN <small>${new Date(e.t).toLocaleString()}</small></span>`));
  }
};
M.renderSkins = async (body, a) => {
  const O = TZ.Online, Sk = TZ.Skins;
  if (!Acc.isOnline()) { body.append(el('div', 'empty', t('Свои скины доступны с аккаунтом.'))); return; }
  const top = el('div', 'skintop');
  const prev = TZ.canvas(160, 180); prev.style.cssText = 'image-rendering:pixelated';
  const info = el('div', 'skininfo', `<p>${t('Скин — это PNG 64×64 по шаблону: голова, тело, руки и ноги развёрнуты как выкройка. Прозрачные пиксели берутся из обычной внешности.')}</p>`);
  const row = el('div', 'row2');
  const dl = el('button', 'px-btn', t('Скачать шаблон с моим персонажем'));
  dl.onclick = () => { const cv = Sk.template(a.look); const l = document.createElement('a'); l.download = 'thezombies_skin.png'; l.href = cv.toDataURL('image/png'); l.click(); };
  const guide = el('button', 'px-btn small ghost', t('Схема шаблона'));
  guide.onclick = () => { TZ.app.alert(''); const box = $('#cfmtext'); box.innerHTML = ''; const g = Sk.guide(); g.style.cssText = 'width:100%;max-width:512px;image-rendering:pixelated'; box.append(g); };
  const up = el('label', 'px-btn green filebtn', `${t('Загрузить скин (PNG)')}<input type="file" accept="image/png" hidden>`);
  up.querySelector('input').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    try { const r = await Sk.readFile(f); const res = await O.post('/api/skins', { png: r.dataUrl, name: (f.name || 'skin').replace(/\.png$/i, '').slice(0, 24) }); Sk.setLocal(res.id, r.data); O.applyMe(res.me); TZ.audio.play('unlock'); M.renderProfile(); }
    catch (err) { TZ.app.alert(err.message); }
  };
  row.append(dl, guide, up); info.append(row);
  top.append(prev, info); body.append(top);
  const draw = () => { const s2 = TZ.Chars.playerSet(Acc.lookWithSkin(), { head: null }).get('walk', ((performance.now() / 110) | 0) % 8, ((performance.now() / 900) | 0) % 8); M.drawFigure(prev.g, 160, 180, s2); };
  clearInterval(M._skIv); M._skIv = setInterval(() => { if (M.ptab !== 'skins' || M.cur !== 'profile') return clearInterval(M._skIv); draw(); }, 110); draw();
  body.append(el('div', 'flabel', t('Мои скины')));
  const grid = el('div', 'pick'); body.append(grid);
  const none = el('div', 'pickit' + (a.skin ? '' : ' on'), `<div class="skinnone">—</div><div>${t('Без скина')}</div>`); none.onclick = () => Acc.setProfile({ skin: null }).then(M.renderProfile); grid.append(none);
  try {
    const r = await O.get('/api/skins');
    for (const k of r.skins) {
      const it = el('div', 'pickit' + (a.skin === k.id ? ' on' : '') + (k.status === 'rejected' ? ' locked' : ''), `<img class="skinimg" src="${O.skinUrl(k.id)}" crossorigin="anonymous"><div>${esc(k.name)}</div>${k.status === 'rejected' ? `<small>${t('отклонён модератором')}</small>` : ''}`);
      it.onclick = () => { if (k.status === 'rejected') return; Acc.setProfile({ skin: k.id }).then(M.renderProfile); };
      const del = el('button', 'px-btn small red skdel', '✕'); del.onclick = (e) => { e.stopPropagation(); TZ.app.confirm(t('Удалить скин?'), async () => { await O.post('/api/skins/delete', { id: k.id }); O.refresh(); setTimeout(M.renderProfile, 400); }); };
      it.append(del); grid.append(it);
    }
  } catch (e) { }
  body.append(el('p', 'phint', t('Скины видят все игроки. Оскорбительные скины удаляются, а аккаунт может быть заблокирован.')));
};
M.renderAccount = (body, a) => {
  const O = TZ.Online, f = el('div', 'form');
  if (!Acc.isOnline()) {
    f.innerHTML = `<div class="flabel big">${t('Гостевой режим')}</div><p class="sub">${t('Прогресс гостя хранится только на этом устройстве. Мультиплеер, друзья, кланы и магазин доступны с аккаунтом.')}</p>`;
    const b = el('button', 'px-btn big green', t('Войти или создать аккаунт')); b.onclick = () => TZ.Social.Login.show();
    const n = el('div', 'row2', `<input id="accname" class="px-input" maxlength="16" value="${esc(a.name)}">`); const sv = el('button', 'px-btn', t('Сохранить имя')); sv.onclick = () => { const v = $('#accname').value.trim(); if (v.length >= 2) { a.name = v; Acc.save(); M.renderProfile(); } }; n.append(sv);
    f.append(b, el('div', 'flabel', t('Имя гостя')), n); body.append(f); return;
  }
  const me = O.me;
  f.innerHTML = `<div class="accrow"><span>${t('Ваш ID')}</span><b class="gold">#${esc(me.id)}</b><button class="px-btn small" id="accCopy">${t('Копировать')}</button></div>
    <div class="accrow"><span>${t('Почта')}</span><b>${esc(me.email || t('не привязана'))}</b>${me.email ? (me.verified ? `<span class="onl">✓ ${t('подтверждена')}</span>` : `<span class="warn">${t('не подтверждена')}</span>`) : ''}</div>
    <div class="accrow"><span>${t('Вход через')}</span><b>${[me.hasPassword ? t('почта и пароль') : '', me.google ? 'Google' : '', me.apple ? 'Apple' : ''].filter(Boolean).join(', ')}</b></div>
    <div class="accrow"><span>${t('Монеты')}</span><b><i class="coin"></i>${a.coins || 0}</b></div>
    <label>${t('Ник')}<input id="accname" class="px-input" maxlength="16" value="${esc(me.name)}"></label>`;
  body.append(f);
  $('#accCopy').onclick = () => { try { navigator.clipboard.writeText(me.id); TZ.notify(t('ID скопирован'), '#' + me.id); } catch (e) { } };
  const sv = el('button', 'px-btn', t('Сохранить ник')); sv.onclick = () => TZ.Social.busyBtn(sv, async () => { await O.updateMe({ name: $('#accname').value.trim() }); M.renderProfile(); }); f.append(sv);
  if (!me.email) {
    f.append(el('div', 'flabel', t('Привязать почту (для восстановления пароля)')));
    const r = el('div', 'form', `<input id="lnemail" class="px-input" type="email" placeholder="${t('Почта')}"><input id="lnpass" class="px-input" type="password" placeholder="${t('Пароль (необязательно)')}">`);
    const b = el('button', 'px-btn green', t('Привязать')); b.onclick = () => TZ.Social.busyBtn(b, async () => { const x = await O.post('/api/auth/email', { email: $('#lnemail').value.trim(), password: $('#lnpass').value || undefined }); TZ.app.prompt(t('Код из письма'), x.devCode || '', async (code) => { try { await O.verify(x.email, code); M.renderProfile(); } catch (e) { TZ.app.alert(e.message); } }); });
    r.append(b); f.append(r);
  } else {
    f.append(el('div', 'flabel', t('Сменить пароль')));
    const r = el('div', 'form', `${me.hasPassword ? `<input id="pwold" class="px-input" type="password" placeholder="${t('Старый пароль')}">` : ''}<input id="pwnew" class="px-input" type="password" placeholder="${t('Новый пароль')}">`);
    const b = el('button', 'px-btn', t('Сменить пароль')); b.onclick = () => TZ.Social.busyBtn(b, async () => { const x = await O.post('/api/auth/password', { old: $('#pwold') ? $('#pwold').value : '', password: $('#pwnew').value }); O.setSession(x.token, x.me); TZ.notify(t('Пароль изменён'), t('Другие устройства вышли из аккаунта')); M.renderProfile(); });
    r.append(b); f.append(r);
  }
  const row = el('div', 'row2');
  const lo = el('button', 'px-btn', t('Выйти из аккаунта')); lo.onclick = () => TZ.app.confirm(t('Выйти из аккаунта на этом устройстве?'), async () => { await O.logout(); TZ.Social.Login.show(); });
  const la = el('button', 'px-btn ghost', t('Выйти на всех устройствах')); la.onclick = () => TZ.app.confirm(t('Выйти из аккаунта на всех устройствах?'), async () => { try { await O.post('/api/auth/logout-all'); } catch (e) { } await O.logout(); TZ.Social.Login.show(); });
  row.append(lo, la); f.append(el('div', 'flabel', t('Безопасность')), row);
  f.append(el('p', 'phint', t('Никому не сообщайте пароль и коды из писем — даже «поддержке». Поддержка никогда их не спрашивает.')));
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
  M.bindNewWorld();
  document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.px-btn, .tab, .pickit')) TZ.audio.play('ui_hover'); });
};
})();
