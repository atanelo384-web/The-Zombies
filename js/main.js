// =====================================================================
//  THE ZOMBIES 2.0 — boot, game lifecycle, main loop
// =====================================================================
'use strict';
(() => {
const $ = s => document.querySelector(s);
TZ.settings = Object.assign({ master: 0.8, music: 0.5, sfx: 0.9, amb: 0.8, uivol: 0.8, voicevol: 1, muteBg: true, shake: true, zoom: 0, fps: false, uiScale: 0, touch: -1, particles: 1, weatherFx: true, dmgNums: true, vignette: true, chatAlpha: 0.85, keyHints: true, showNames: true, minimap: true, tSize: 1, tAlpha: 0.9, tLeft: false, aimAssist: true, vibrate: true, voiceMode: 'ptt', vad: 0.35, micGain: 1, micDev: '', voice3d: true }, TZ.store.get('settings2', {}));
const applyTouchSetting = () => { const t = TZ.settings.touch; TZ.isTouch = t === -1 || t == null ? (TZ.touchForced ?? TZ.touchAuto) : !!t; };
applyTouchSetting(); TZ.applyUIScale();
window.addEventListener('resize', () => TZ.applyUIScale());
window.addEventListener('orientationchange', () => setTimeout(() => { TZ.applyUIScale(); App.renderer && App.renderer.resize(); }, 250));
const App = TZ.app = { state: 'loading', game: null, demo: null, renderer: null, ui: null };

const steps = [];
const step = (label, fn) => steps.push([label, fn]);
async function boot() {
  $('#ver').textContent = TZ.VERSION;
  const A = TZ.art;
  step('Рисуем землю...', () => { A.buildTiles(); A.buildDecor(); A.buildDecals(); });
  step('Сажаем деревья...', () => { A.buildTrees(); A.buildExtra(); });
  step('Чистим оружие...', () => { A.buildWeapons(); A.buildWeapons2(); A.buildIcons(); A.buildIcons2(); });
  step('Рисуем интерфейс...', () => { TZ.UIKit.build(); TZ.UIKit.buildTouch(); document.documentElement.style.setProperty('--px-hand', `url(${TZ.UIKit.icons.hand})`); $('#rotimg').src = TZ.UIKit.icons.full; });
  step('Будим мертвецов...', () => { for (const t of ['walker', 'runner', 'brute']) TZ.Chars.zombieSet(t, 0, 0).get('walk', 0, 1); });
  step('Заводим машины...', () => { TZ.Chars.vehicleSet('sedan', TZ.PAINTS[0]).get(0, 0, 2); });
  step('Строим мир...', () => { App.renderer = new TZ.Renderer($('#game')); TZ.input.init($('#game')); });
  for (let i = 0; i < steps.length; i++) {
    const [label, fn] = steps[i];
    $('#loadtxt').textContent = label; $('#loadbar i').style.width = (i / steps.length * 100) + '%';
    await new Promise(r => setTimeout(r, 16));
    try { fn(); } catch (e) { console.error(label, e); }
  }
  $('#loadbar i').style.width = '100%';
  try { await document.fonts.ready; await document.fonts.load('16px "Press Start 2P"', 'ZOMBIES'); } catch (e) { }
  try { const lg = TZ.UIKit.logo('ZOMBIES', 16, 11); $('#logoimg').src = lg.toDataURL(); document.body.classList.add('pxlogo'); } catch (e) { console.warn(e); }
  document.querySelectorAll('img[data-ic]').forEach(i => { i.src = TZ.UIKit.icons[i.dataset.ic] || ''; });
  document.querySelectorAll('.mitem').forEach(b => b.addEventListener('pointerenter', () => TZ.audio.play('ui_hover', 0.35)));
  bindUI(); TZ.Menu.bind();
  try { await TZ.Net.detect(); } catch (e) { }
  makeDemo();
  $('#loading').classList.add('hidden');
  App.state = 'menu';
  if (!TZ.Account.hasAny()) TZ.Menu.setup(() => TZ.Menu.show('menu'));
  else TZ.Menu.show('menu');
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- menu background
function makeDemo() {
  const G = new TZ.Game({ role: 'solo', seed: 5150, meta: { name: 'demo', story: false } });
  G.demo = true; G.canControl = false; G.ui = fakeUI; G.me.dead = true;
  const W = G.world, cx = 70, cy = 74;
  G.zombies.length = 0; G.vehicles.length = 0; G.allies.length = 0;
  for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++) { const o = W.get(x, y); if (o) W.set(x, y, null, true); }
  for (let a = 0; a < 64; a++) {
    const ang = a / 64 * Math.PI * 2, x = Math.round(cx + Math.cos(ang) * 5.5), y = Math.round(cy + Math.sin(ang) * 5.5);
    if (!W.get(x, y)) W.set(x, y, { t: a === 8 ? 'gate_metal' : a % 21 === 3 ? 'wall_stone' : 'wall_wood', hp: 260, v: a % 4, owner: G.me.uid }, true);
  }
  const put = (t, x, y, extra) => W.set(x, y, Object.assign({ t, hp: TZ.BUILD[t].hp, v: 0, owner: G.me.uid }, extra || {}), true);
  put('campfire', cx, cy); put('torch', cx - 3, cy - 3); put('torch', cx + 3, cy + 2); put('torch', cx + 2, cy - 4); put('torch', cx - 4, cy + 2);
  put('workbench', cx - 2, cy - 2); put('bed', cx + 2, cy - 2); put('chest', cx + 1, cy - 3, { items: {} }); put('garden', cx - 2, cy + 3, { planted: -1e9 }); put('garden', cx - 1, cy + 3, { planted: -1e9 });
  put('turret', cx + 3, cy + 3, { ammo: 99999, ang: 0, cd: 0 }); put('collector', cx + 3, cy - 1); put('floor_wood', cx, cy + 1); put('floor_wood', cx + 1, cy + 1);
  G.structures.clear(); for (const c of W.chunks.values()) for (const o of c.obj) if (o && TZ.BUILD[o.t]) G.structures.add(o);
  G.me.x = cx; G.me.y = cy;
  for (const [sid, x, y] of [['demoA', cx - 1.5, cy + 1.2], ['demoB', cx + 1.3, cy + 1.0], ['demoC', cx + 0.2, cy - 1.6]]) { const def = TZ.Chars.survivorDef(sid); def.weapon = sid === 'demoA' ? 'ak' : sid === 'demoB' ? 'shotgun' : 'rifle'; const a = new TZ.Ally(G, def, x, y, sid); a.owner = G.me.uid; a.mode = 'guard'; a.gx = x; a.gy = y; G.allies.push(a); }
  const v = new TZ.Vehicle(G, 'pickup', cx - 2.5, cy - 0.3, 0.6, 'new'); G.vehicles.push(v);
  G.minutes = 22 * 60; G.day = 4;
  App.demo = G; App.demoT = 0;
  G.camera.x = TZ.isoX(cx, cy); G.camera.y = TZ.isoY(cx, cy);
}
const fakeUI = { dirty() { }, log() { }, banner() { }, toast() { }, rnToast() { }, showDeath() { }, showVictory() { }, chatMsg() { } };
function updateDemo(dt) {
  const G = App.demo; App.demoT += dt;
  const cx = 70, cy = 74;
  if (G.zombies.filter(z => !z.dead).length < 34 && Math.random() < dt * 4) {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 6, f = G.findFree(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2);
    if (f) { const t = Math.random(); G.spawnZombie(t < 0.05 ? 'brute' : t < 0.15 ? 'runner' : t < 0.22 ? 'crawler' : t < 0.28 ? 'soldier' : t < 0.32 ? 'spitter' : 'walker', f.x, f.y, true); }
  }
  for (const a of G.allies) if (a.dead) { a.dead = false; a.hp = 100; }
  for (const o of G.structures) if (o.hp < 60) o.hp = TZ.BUILD[o.t].hp;
  G.zgrid.clear(); for (const z of G.zombies) if (!z.dead) G.zgrid.add(z);
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.5; const f = G.world.flowWindow(cx, cy, 30, G.allies, 'z'); G.flows.set(G.me.pid, f); }
  for (const z of G.zombies) { z.hunt = 5; z.update(dt, G); }
  for (let i = G.zombies.length - 1; i >= 0; i--) if (G.zombies[i].dead && G.zombies[i].deadT > 12) G.zombies.splice(i, 1);
  for (const a of G.allies) a.update(dt, G);
  G.updateStructures(dt); G.combat.update(dt); G.fx.update(dt);
  const t = App.demoT * 0.06;
  G.camera.x = TZ.isoX(cx, cy) + Math.cos(t) * 60; G.camera.y = TZ.isoY(cx, cy) + Math.sin(t) * 22 - 8;
  G.camera.sx = G.camera.sy = 0;
}
// zombies in the demo must chase the defenders, not the hidden player
const origNearest = TZ.Game.prototype.nearestTarget;
TZ.Game.prototype.nearestTarget = function (x, y) {
  if (!this.demo) return origNearest.call(this, x, y);
  let best = null, bd = 1e9; for (const a of this.allies) { const d = dist2(x, y, a.x, a.y); if (d < bd) { bd = d; best = a; } } return best;
};
TZ.Game.prototype.flowFor = (function (orig) { return function (tgt, x, y) { if (this.demo) { const f = this.flows.get(this.me.pid); if (!f) return null; const i = Math.floor(x) - f.x0, j = Math.floor(y) - f.y0; return i >= 0 && j >= 0 && i < f.n && j < f.n ? f : null; } return orig.call(this, tgt, x, y); }; })(TZ.Game.prototype.flowFor);

// ---------------------------------------------------------------- game lifecycle
function enterGame(G) {
  App.game = G;
  if (!App.ui) App.ui = new TZ.UI();
  G.ui = App.ui; App.ui.closeInventory(); App.ui.closeVehicle(); App.ui.dirty(); App.ui.logEl.innerHTML = ''; $('#chatlog').innerHTML = '';
  TZ.Menu.hideAll(); $('#menu').classList.add('hidden'); $('#ui').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
  G.camera.x = TZ.isoX(G.me.x, G.me.y); G.camera.y = TZ.isoY(G.me.x, G.me.y);
  TZ.Touch.fullscreen();
  if (TZ.isTouch) TZ.Account.stat('touchGames', 1);
  G.checkQuests && G.auth && G.checkQuests();
  App.state = 'game';
  TZ.audio.setMusic(G.isNight() ? 'night' : 'day');
}
App.startSolo = (meta) => {
  TZ.audio.init();
  try {
    const save = TZ.Saves.load(meta.id);
    const G = new TZ.Game({ role: 'solo', worldId: meta.id, meta: Object.assign({}, meta), seed: meta.seed, save });
    enterGame(G);
    if (!save) { App.ui.banner('ДЕНЬ 1', 'Найдите припасы и подготовьтесь к ночи'); G.msg(TZ.isTouch ? 'Левый джойстик — ходить, правый — целиться и стрелять (короткое касание — удар по ближайшему врагу). Подсказка внизу — действие.' : 'WASD — движение, ЛКМ — атака, E — обыскать. Удачи, выживший.', 'hint'); G.save(); }
    else App.ui.banner(`ДЕНЬ ${G.day}`, meta.name);
  } catch (e) { console.error(e); App.alert('Не удалось загрузить мир: ' + e.message); }
};
App.startHost = async (meta, info) => {
  TZ.audio.init();
  try {
    const save = TZ.Saves.load(meta.id);
    const G = new TZ.Game({ role: 'host', worldId: meta.id, meta: Object.assign({}, meta, { pvp: info.pvp }), seed: meta.seed, save });
    G.pvp = info.pvp;
    G.net = await TZ.Net.host(G, info);
    G.serverName = info.name;
    enterGame(G);
    App.ui.banner('СЕРВЕР ЗАПУЩЕН', info.name);
    const links = TZ.Net.inviteLinks(G.net);
    G.msg(links.length ? `Сервер работает. С телефона или другого ПК откройте: ${links[0]}  (Esc → «Пригласить» — QR-код)` : 'Сервер работает. Откройте игру во второй вкладке и подключитесь через «Мультиплеер».', 'good');
    if (links.length) setTimeout(() => App.invite(), 600);
    if (!save) G.save();
  } catch (e) { console.error(e); App.alert('Не удалось запустить сервер: ' + e.message); }
};
App.joinServer = async (target) => {
  TZ.audio.init();
  $('#mpnote').innerHTML = '<span class="gold">Подключение...</span>';
  try {
    const { net, welcome } = await TZ.Net.join(target);
    const G = new TZ.Game({ role: 'client', net, pid: welcome.pid, welcome, meta: { name: welcome.name, diff: welcome.diff } });
    net.attach(G);
    enterGame(G);
    TZ.Account.stat('mpGames', 1);
    App.ui.banner('ПОДКЛЮЧЕНО', welcome.name);
  } catch (e) { console.error(e); $('#mpnote').innerHTML = ''; App.alert('Не удалось подключиться: ' + e.message); }
};
App.toMenu = () => {
  const G = App.game;
  if (G) { try { if (G.role !== 'client') G.save(); if (G.net) G.net.close(); } catch (e) { console.error(e); } TZ.audio.engine(-1); }
  try { TZ.Voice.dropAll(); } catch (e) { }
  App.game = null; App.state = 'menu'; TZ.game = App.demo;
  $('#ui').classList.add('hidden'); $('#pause').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
  TZ.audio.setMusic('menu'); TZ.Account.save();
  TZ.Menu.show('menu');
};
function setPause(p) {
  const G = App.game; if (!G) return;
  G.paused = p; $('#pause').classList.toggle('hidden', !p);
  if (p) { $('#pausedaily').innerHTML = '<div class="phead small">Задания дня</div>' + TZ.Daily.html(); App.ui.closeInventory(); $('#btnSave').classList.toggle('hidden', G.role === 'client'); $('#btnInvite').classList.toggle('hidden', G.role !== 'host'); $('#btnClan').classList.toggle('hidden', !G.net); $('#pausenet').textContent = G.net ? (G.role === 'host' ? `Сервер: ${G.serverName} · игроков ${G.players.size}` : `Вы на сервере «${G.serverName}». Игра не останавливается.`) : ''; }
}
// ---------------------------------------------------------------- invite (links + QR for phones)
App.invite = () => {
  const G = App.game; if (!G || !G.net) return;
  const links = TZ.Net.inviteLinks(G.net), body = $('#invbody'); body.innerHTML = '';
  if (!links.length) {
    body.innerHTML = '<p>Сервер работает внутри браузера. Откройте игру во второй вкладке, создайте там другой аккаунт (Профиль → Аккаунты) и подключитесь через «Мультиплеер».</p><p class="sub">Чтобы играть с телефона, запустите сервер в версии для Windows / Mac / Linux или командой <b>node electron/server.js</b>.</p>';
  } else {
    const main = links[0];
    const wrap = document.createElement('div'); wrap.className = 'invgrid';
    const qr = TZ.qr(main, 5); qr.className = 'qr';
    const txt = document.createElement('div');
    txt.innerHTML = `<p><b class="gold">Телефон (Android, iPhone) или другой ПК в той же Wi-Fi сети:</b><br>отсканируйте QR-код камерой или откройте в браузере</p>
      <div class="biglink">${TZ.esc(main)}</div>
      ${links.length > 1 ? `<p class="sub">Другие адреса этого ПК: ${links.slice(1).map(TZ.esc).join(', ')}</p>` : ''}
      <p><b class="gold">Версия для ПК или телефона:</b> Мультиплеер → «Подключиться по IP» → <b>${TZ.esc(main.replace('http://', ''))}</b></p>
      <p class="sub">Игроки должны быть в одной сети. Через интернет: откройте TCP-порт ${G.net.tr.port} на роутере или используйте Radmin VPN / Hamachi. Если Windows спросит про доступ к сети — разрешите.</p>`;
    wrap.append(qr, txt); body.append(wrap);
  }
  $('#invite').classList.add('show');
};
// ---------------------------------------------------------------- context menu (touch) & quick phrases
App.ctx = (x, y, title, sub, items) => {
  const box = $('#ctx'), z = TZ.uiz; box.innerHTML = `<div class="ctitle">${TZ.esc(title)}</div>${sub ? `<div class="sub" style="max-width:300px;padding:0 4px 4px">${TZ.esc(sub)}</div>` : ''}`;
  for (const it of items) { const b = document.createElement('button'); b.className = 'px-btn ' + (it.cls || ''); b.textContent = it.label; b.onclick = (e) => { e.stopPropagation(); box.classList.remove('show'); TZ.audio.play('ui'); it.fn(); }; box.append(b); }
  box.style.transform = `scale(${z})`; box.style.transformOrigin = '0 0';
  box.classList.add('show');
  const w = box.offsetWidth * z, h = box.offsetHeight * z;
  box.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, x - w / 2)) + 'px'; box.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, y - h / 2)) + 'px';
  setTimeout(() => { const close = (e) => { if (!box.contains(e.target)) { box.classList.remove('show'); document.removeEventListener('pointerdown', close, true); } }; document.addEventListener('pointerdown', close, true); }, 0);
};
const PHRASES = ['Сюда!', 'Помогите!', 'Зомби рядом!', 'Отступаем!', 'Нужны патроны', 'Нужна аптечка', 'Иду к тебе', 'Жду на базе', 'Орда идёт!', 'Спасибо!', 'Хорошо', 'Нет'];
App.phrases = () => {
  const G = App.game; if (!G) return;
  const grid = $('#phgrid'); grid.innerHTML = '';
  for (const t of PHRASES) { const b = document.createElement('button'); b.className = 'px-btn'; b.textContent = t; b.onclick = () => { $('#phrases').classList.remove('show'); App.ui.sendChat(t); }; grid.append(b); }
  const pb = document.createElement('button'); pb.className = 'px-btn green'; pb.textContent = 'Метка здесь'; pb.onclick = () => { $('#phrases').classList.remove('show'); G.ping && G.ping(G.me.x, G.me.y); }; grid.append(pb);
  $('#phrases').classList.add('show'); TZ.audio.play('ui_open');
};
// ---------------------------------------------------------------- dialogs
App.confirm = (text, yes) => { $('#cfmtext').textContent = text; $('#cfmyes').textContent = 'Да'; $('#cfmno').textContent = 'Нет'; $('#cfmno').classList.remove('hidden'); $('#confirm').classList.add('show'); $('#cfmyes').onclick = () => { $('#confirm').classList.remove('show'); yes && yes(); }; $('#cfmno').onclick = () => $('#confirm').classList.remove('show'); };
App.alert = (text, ok) => { $('#cfmtext').textContent = text; $('#cfmyes').textContent = 'OK'; $('#cfmno').classList.add('hidden'); $('#confirm').classList.add('show'); $('#cfmyes').onclick = () => { $('#confirm').classList.remove('show'); ok && ok(); }; };
App.prompt = (text, val, done) => { $('#cfmtext').innerHTML = `${TZ.esc(text)}<input id="cfmin" class="px-input" maxlength="28" value="${TZ.esc(val || '')}" style="margin-top:10px">`; $('#cfmyes').textContent = 'OK'; $('#cfmno').classList.remove('hidden'); $('#confirm').classList.add('show'); setTimeout(() => $('#cfmin').focus(), 30); $('#cfmyes').onclick = () => { const v = $('#cfmin').value; $('#confirm').classList.remove('show'); done(v); }; $('#cfmno').onclick = () => $('#confirm').classList.remove('show'); };

function bindUI() {
  const click = (id, fn) => $(id).addEventListener('click', () => { TZ.audio.init(); TZ.audio.play('ui'); fn(); });
  document.addEventListener('pointerdown', () => { TZ.audio.init(); if (App.state === 'menu' && !TZ.audio.musicMode) TZ.audio.setMusic('menu'); });
  // iOS Safari unlocks audio only inside touchend / click handlers
  for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => { TZ.audio.init(); if (TZ.audio.ctx && TZ.audio.ctx.state !== 'running') TZ.audio.ctx.resume(); }, { passive: true });
  // phones: pause music and save when the app goes to the background
  document.addEventListener('visibilitychange', () => {
    const ctx = TZ.audio.ctx; if (!ctx) return;
    if (document.hidden) { ctx.suspend && ctx.suspend(); const G = App.game; if (G && G.role !== 'client') try { G.save(true, true); } catch (e) { } if (G && !G.net && !G.paused && G.mode !== 'dead') setPause(true); }
    else ctx.resume && ctx.resume();
  });
  click('#btnSettings', () => $('#settings').classList.add('show')); click('#btnSettings2', () => $('#settings').classList.add('show'));
  click('#btnHelp', () => $('#help').classList.add('show')); click('#btnHelp2', () => $('#help').classList.add('show'));
  click('#btnQuit', () => { if (window.tzNative && window.tzNative.quit) window.tzNative.quit(); else App.alert('Закройте вкладку, чтобы выйти.'); });
  click('#btnResume', () => setPause(false));
  click('#btnSave', () => { const G = App.game; if (!G) return; if (G.save()) { $('#btnSave').textContent = 'Сохранено ✓'; setTimeout(() => $('#btnSave').textContent = 'Сохранить мир', 1500); } });
  click('#btnInvite', () => App.invite());
  click('#btnClan', () => { setPause(false); TZ.ClanUI.open(); }); click('#btnClan2', () => { $('#plist').classList.remove('show'); TZ.ClanUI.open(); });
  click('#btnMenu', () => App.confirm('Выйти в главное меню? Мир будет сохранён.', () => App.toMenu()));
  click('#deathrespawn', () => { $('#death').classList.remove('show'); App.game.respawn(); });
  click('#deathload', () => { const G = App.game; const m = TZ.Saves.meta(G.worldId); App.game = null; if (m) App.startSolo(m); });
  click('#deathmenu', () => App.toMenu());
  click('#winmenu', () => App.toMenu());
  click('#wincont', () => { const G = App.game; if (!G) return; $('#victory').classList.remove('show'); G.heli = null; G.canControl = true; G.evacDay = 0; G.endless = true; G.msg('Вы остались. Сколько ночей вы продержитесь?', 'warn'); if (G.role !== 'client') G.save(true); });
  click('#btnFull', () => toggleFull());
  if (TZ.isTouch) $('#btnFull').textContent = 'Во весь экран';
  if (TZ.isIOS && !TZ.isApp) $('#btnFull').classList.add('hidden');
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { TZ.audio.play('ui_close'); closeModal(b.dataset.close); }));
  document.querySelectorAll('[data-set]').forEach(inp => {
    const k = inp.dataset.set, str = inp.dataset.str === '1';
    const showVal = () => { const b = inp.parentElement.querySelector('.sval'); if (!b) return; const v = TZ.settings[k]; b.textContent = k === 'zoom' ? ['×0.75', '×1', '×1.25', '×1.5'][v + 1] || v : Math.round(v * 100) + '%'; };
    if (inp.type === 'checkbox') inp.checked = !!TZ.settings[k]; else inp.value = String(TZ.settings[k]);
    showVal();
    inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
      TZ.settings[k] = inp.type === 'checkbox' ? inp.checked : str ? inp.value : parseFloat(inp.value); showVal();
      TZ.store.set('settings2', TZ.settings); TZ.audio.applyVolumes(); applySettings(k);
    });
  });
  // tabs
  document.querySelectorAll('.stab').forEach(b => b.addEventListener('click', () => { TZ.audio.play('ui'); document.querySelectorAll('.stab').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.spage').forEach(p => p.classList.toggle('show', p.dataset.sp === b.dataset.st)); if (b.dataset.st === 'voice' && TZ.Voice) TZ.Voice.listMics(); if (b.dataset.st === 'ctl') buildBinds(); }));
  click('#btnBindReset', () => App.confirm('Вернуть все клавиши по умолчанию?', () => { TZ.input.resetBinds(); buildBinds(); App.ui && App.ui.dirty(); }));
  click('#btnMicTest', () => TZ.Voice && TZ.Voice.test());
  buildBinds(); applySettings();
}
// ---------------------------------------------------------------- settings helpers
document.addEventListener('visibilitychange', () => { const A = TZ.audio; if (!A.ctx || !TZ.settings.muteBg) return; try { if (document.hidden) A.ctx.suspend(); else A.ctx.resume(); } catch (e) { } });
// Android app: the system Back button acts like Esc
window.tzBack = () => { TZ.input.pressed.Escape = true; if (App.state === 'menu' && TZ.Menu.cur && TZ.Menu.cur !== 'menu') TZ.Menu.show('menu'); };
function applySettings(k) {
  const S = TZ.settings, root = document.documentElement;
  if (k === 'zoom') App.renderer.resize();
  if (k === 'touch') applyTouchSetting();
  if (k === 'uiScale' || k === 'touch') { TZ.applyUIScale(); App.ui && App.ui.dirty && App.ui.dirty(); }
  root.style.setProperty('--ts', S.tSize); root.style.setProperty('--ta', S.tAlpha); root.style.setProperty('--chatA', S.chatAlpha);
  document.body.classList.toggle('nohints', !S.keyHints); document.body.classList.toggle('nominimap', !S.minimap);
  TZ.Touch && TZ.Touch.applySettings && TZ.Touch.applySettings();
  if (TZ.Voice && (k === 'voiceMode' || k === 'micDev' || k === 'micGain')) TZ.Voice.applySettings(k);
}
TZ.applySettings = applySettings;
function keyHint() {
  const I = TZ.input; if (!I.binds) I.loadBinds(); const k = a => TZ.esc(TZ.keyName(I.binds[a][0] || I.binds[a][1]));
  const el = $('#keyhint'); if (el) el.innerHTML = `<kbd>${k('build')}</kbd> стройка <kbd>${k('craft')}</kbd> крафт <kbd>${k('inv')}</kbd> инвентарь <kbd>${k('map')}</kbd> карта <kbd>${k('chat')}</kbd> чат <kbd>${k('voice')}</kbd> голос <kbd>${k('players')}</kbd> игроки <kbd>${k('help')}</kbd> помощь`;
}
function buildBinds() {
  const I = TZ.input; if (!I.binds) I.loadBinds();
  keyHint();
  const box = $('#bindlist'); if (!box) return;
  box.innerHTML = TZ.BINDS.map(([a, label]) => `<div class="bindrow"><span>${label}</span>${[0, 1].map(i => `<button class="px-btn small kbtn" data-a="${a}" data-i="${i}">${TZ.keyName(I.binds[a][i])}</button>`).join('')}</div>`).join('');
  box.querySelectorAll('.kbtn').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault(); TZ.audio.play('ui');
    box.querySelectorAll('.kbtn.wait').forEach(x => { x.classList.remove('wait'); x.textContent = TZ.keyName(I.binds[x.dataset.a][+x.dataset.i]); });
    b.classList.add('wait'); b.textContent = 'Нажмите…';
    setTimeout(() => { I.capture = (code) => {
      const a = b.dataset.a, i = +b.dataset.i;
      if (code === 'Escape') { buildBinds(); return; }
      if (code === 'Backspace' || code === 'Delete') { I.binds[a][i] = ''; }
      else {
        for (const k in I.binds) I.binds[k] = I.binds[k].map((c, j) => (c === code && !(k === a && j === i)) ? '' : c); // a key does one thing
        I.binds[a][i] = code;
      }
      I.saveBinds(); buildBinds(); App.ui && App.ui.dirty(); TZ.audio.play('equip');
      const pk = $('#pttKey'); if (pk) pk.textContent = TZ.keyName(I.binds.voice[0]);
    }; }, 30);
  }));
  const pk = $('#pttKey'); if (pk) pk.textContent = TZ.keyName(I.binds.voice[0]);
}
function closeModal(id) {
  const ui = App.ui;
  if (id === 'inv') { ui && ui.closeInventory(); return; }
  if (id === 'chestp') { ui && ui.closeChest(); return; }
  if (id === 'vehp') { ui && ui.closeVehicle(); return; }
  if (id === 'craft') { ui && ui.closeCraft(); return; }
  $('#' + id).classList.remove('show');
}
function toggleFull() {
  if (window.tzNative && window.tzNative.fullscreen) { window.tzNative.fullscreen(); return; }
  if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { });
  else document.exitFullscreen && document.exitFullscreen();
}
// ---------------------------------------------------------------- keys
function globalKeys() {
  const I = TZ.input, G = App.game, ui = App.ui;
  if (I.hit('F11')) toggleFull();
  if (App.state !== 'game' || !G) return;
  if (ui.chatOpen) return;
  const top = ['settings', 'help', 'confirm', 'pview', 'keypad', 'bigmap', 'clanp', 'plist', 'phrases', 'invite'].find(id => $('#' + id).classList.contains('show'));
  if (I.hit('Escape')) {
    if (top) { $('#' + top).classList.remove('show'); return; }
    if ($('#craft').classList.contains('show')) { ui.closeCraft(); return; }
    if ($('#dialog').classList.contains('show')) { ui.closeDialog(); return; }
    if (ui.veh) { ui.closeVehicle(); return; }
    if (G.mode === 'dead' || G.won) return;
    if (ui.invOpen) { ui.closeInventory(); return; }
    if (G.mode === 'build') { G.exitBuild(); return; }
    setPause(!G.paused); return;
  }
  if (top === 'keypad' || top === 'confirm' || top === 'pview' || top === 'settings') return;
  if (I.act('players')) { ui.togglePlist(); return; }
  if (I.act('clan') && G.net) { TZ.ClanUI.toggle(); return; }
  if (G.paused && !$('#craft').classList.contains('show')) return;
  if (G.mode === 'dead') return;
  if (I.act('chat')) { ui.openChat(); return; }
  if (I.act('cmd')) { ui.openChat('/'); return; }
  if (I.act('map')) ui.toggleMap();
  if (I.act('phrases')) { if ($('#phrases').classList.contains('show')) $('#phrases').classList.remove('show'); else App.phrases(); }
  if (I.act('inv')) ui.toggleInventory(G);
  if (I.act('build')) { if (G.mode === 'build') G.exitBuild(); else if (!G.me.vehicle) { ui.closeInventory(); G.enterBuild(); } TZ.audio.play('ui'); }
  if (I.act('craft')) { if ($('#craft').classList.contains('show')) ui.closeCraft(); else ui.openCraft(null); }
  if (I.act('help')) $('#help').classList.toggle('show');
}
// ---------------------------------------------------------------- loop
let last = performance.now(), fpsN = 0, fpsT = 0;
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  try {
    globalKeys();
    if (App.state === 'menu' && App.demo) { TZ.game = App.demo; updateDemo(dt); App.renderer.draw(App.demo, dt); TZ.Menu.fx(dt); }
    else if (App.state === 'game' && App.game) {
      const G = App.game; TZ.game = G;
      TZ.Touch.update(G);
      G.update(dt);
      App.renderer.draw(G, G.paused && !G.net ? 0 : dt);
      App.ui.update(G, dt);
    }
  } catch (e) { console.error(e); }
  fpsN++; fpsT += dt; if (fpsT > 0.5) { $('#fps').textContent = TZ.settings.fps ? Math.round(fpsN / fpsT) + ' FPS' : ''; fpsN = 0; fpsT = 0; }
  TZ.input.endFrame();
  requestAnimationFrame(loop);
}
window.addEventListener('blur', () => { const G = App.game; if (App.state === 'game' && G && !G.paused && G.mode !== 'dead' && !G.won && !G.net) setPause(true); });
window.addEventListener('beforeunload', () => { const G = App.game; if (G) { try { if (G.role !== 'client') G.save(); if (G.net) G.net.close(); } catch (e) { } } TZ.Account.save(); });
boot();
})();
