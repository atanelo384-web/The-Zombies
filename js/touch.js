// =====================================================================
//  THE ZOMBIES 3.0 — touch controls for phones and tablets (Android / iPhone / iPad)
//  Twin-stick: left stick moves (push to the edge = run), right stick aims
//  and fires (tap = quick attack with aim assist). Pixel buttons for actions.
//  In a vehicle the left stick drives; in build mode taps on the world build.
// =====================================================================
'use strict';
(() => {
const $ = s => document.querySelector(s);
const I = TZ.input;
const R = 82; // stick radius in virtual px
const T = TZ.Touch = {
  ready: false, mode: '', vkeys: new Set(),
  L: { id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0 },
  Rs: { id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0, t0: 0, moved: 0 },
  aim: { x: 1, y: 0.5 }, firing: false, tapFire: 0, runLock: false, demolish: false, build: { id: null },
};
const btn = (icon, label, attrs = '', cls = '') => `<button class="tbtn ${cls}" ${attrs}><img src="${TZ.UIKit.icons[icon]}" alt=""><span>${label}</span></button>`;

T.init = () => {
  if (T.ready) return; T.ready = true;
  const box = $('#touch');
  box.innerHTML = `
    <div class="zone" id="tzWorld"></div>
    <div class="zone" id="tzLeft"></div>
    <div class="zone" id="tzRight"></div>
    <div class="stick" id="stickL"><img class="sb" src="${TZ.UIKit.stickBase}"><img class="sk" src="${TZ.UIKit.stickKnob}"><div class="slab">ходить</div></div>
    <div class="stick" id="stickR"><img class="sb" src="${TZ.UIKit.stickBase}"><img class="sk" src="${TZ.UIKit.stickKnob}"><div class="slab">целиться · огонь</div></div>
    <div id="tbTop">
      ${btn('bag', 'Вещи', 'data-k="Tab"', 'small')}${btn('craft', 'Крафт', 'data-k="KeyC"', 'small')}${btn('build', 'Стройка', 'data-k="KeyB" data-id="tbBuild"', 'small')}
      ${btn('map', 'Карта', 'data-k="KeyM"', 'small')}${btn('players', 'Игроки', 'data-k="F3"', 'small')}${btn('chat', 'Чат', 'data-fn="chat"', 'small')}
      ${btn('say', 'Фразы', 'data-fn="phrases"', 'small')}${btn('pause', 'Пауза', 'data-k="Escape"', 'small')}
    </div>
    <div class="tset" id="tsPlay">
      ${btn('heal', 'Лечение', 'data-k="KeyQ" style="right:24px;bottom:290px"')}
      ${btn('reload', 'Патроны', 'data-k="KeyR" style="right:124px;bottom:290px"')}
      ${btn('team', 'Команда', 'data-k="KeyF" style="right:224px;bottom:296px"', 'small')}
      ${btn('light', 'Фонарь', 'data-k="KeyL" style="right:310px;bottom:296px"', 'small')}
      ${btn('run', 'Бег', 'data-fn="run" id="tbRun" style="left:292px;bottom:24px"', 'small')}
      ${btn('mic', 'Голос', 'data-k="KeyZ" data-hold="1" id="tbMic" style="right:396px;bottom:296px"', 'small vmic')}
    </div>
    <div class="tset" id="tsVeh">
      ${btn('brake', 'Тормоз', 'data-k="Space" data-hold="1" style="right:40px;bottom:60px"', 'big gnd')}
      ${btn('up', 'Вверх', 'data-k="ShiftLeft" data-hold="1" style="right:40px;bottom:330px"', 'airb')}
      ${btn('down', 'Вниз', 'data-k="Space" data-hold="1" style="right:40px;bottom:60px"', 'big airb')}
      ${btn('horn', 'Сигнал', 'data-k="KeyH" data-hold="1" style="right:190px;bottom:60px"')}
      ${btn('exit', 'Выйти', 'data-k="KeyE" style="right:40px;bottom:210px"')}
      ${btn('mic', 'Голос', 'data-k="KeyZ" data-hold="1" style="right:190px;bottom:210px"', 'small vmic')}
    </div>
    <div class="tset" id="tsBuild">
      ${btn('demolish', 'Разобрать', 'data-fn="demolish" id="tbDem" style="right:30px;bottom:200px"')}
      ${btn('ok', 'Готово', 'data-k="KeyB" style="right:30px;bottom:310px"')}
    </div>`;
  // buttons
  box.querySelectorAll('.tbtn').forEach(b => {
    const k = b.dataset.k, hold = b.dataset.hold === '1', fn = b.dataset.fn;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (er) { }
      TZ.audio.init(); TZ.audio.play('ui', 0.5);
      if (k) { I.vpress(k); if (hold) I.vkey(k, true); }
      if (fn) T.fn(fn, b);
    });
    const up = () => { b.classList.remove('down'); if (k && hold) I.vkey(k, false); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
  // sticks
  const zone = (el, S, right) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (S.id !== null) return;
      TZ.audio.init(); if (TZ.app.ui) TZ.app.ui.overUI = false;
      S.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (er) { }
      const z = TZ.uiz; S.ox = e.clientX / z; S.oy = e.clientY / z; S.x = S.y = S.mag = 0; S.t0 = performance.now(); S.moved = 0;
      T.place(right ? 'stickR' : 'stickL', S.ox, S.oy, true);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== S.id) return;
      const z = TZ.uiz; let dx = e.clientX / z - S.ox, dy = e.clientY / z - S.oy; const d = Math.hypot(dx, dy);
      S.moved = Math.max(S.moved, d / R);
      if (d > R) { // drag the base along when the finger goes past the edge
        S.ox += dx * (1 - R / d); S.oy += dy * (1 - R / d); dx *= R / d; dy *= R / d; T.place(right ? 'stickR' : 'stickL', S.ox, S.oy, true);
      }
      S.x = dx / R; S.y = dy / R; S.mag = Math.min(1, d / R);
      T.knob(right ? 'stickR' : 'stickL', dx, dy);
    });
    const end = (e) => {
      if (e.pointerId !== S.id) return;
      if (right && performance.now() - S.t0 < 260 && S.moved < 0.3) T.tapFire = 2; // quick tap = attack with aim assist
      S.id = null; S.x = S.y = S.mag = 0; T.knob(right ? 'stickR' : 'stickL', 0, 0); T.idle();
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  zone($('#tzLeft'), T.L, false);
  zone($('#tzRight'), T.Rs, true);
  // build mode: tap / drag on the world to place
  const w = $('#tzWorld'); let wid = null;
  w.addEventListener('pointerdown', (e) => {
    e.preventDefault(); if (wid !== null) return; wid = e.pointerId; try { w.setPointerCapture(e.pointerId); } catch (er) { }
    if (TZ.app.ui) TZ.app.ui.overUI = false;
    I.mouse.x = e.clientX; I.mouse.y = e.clientY;
    if (T.demolish) I.vpress('KeyX'); else { I.mouse.down = true; I.mouse.clicked = true; }
  });
  w.addEventListener('pointermove', (e) => { if (e.pointerId !== wid) return; I.mouse.x = e.clientX; I.mouse.y = e.clientY; });
  const wend = (e) => { if (e.pointerId !== wid) return; wid = null; I.mouse.down = false; };
  w.addEventListener('pointerup', wend); w.addEventListener('pointercancel', wend);
  // the interaction prompt is a big button on touch screens
  $('#prompt').addEventListener('pointerdown', (e) => { if (!TZ.isTouch) return; e.preventDefault(); I.vpress('KeyE'); TZ.audio.play('ui', 0.5); });
  T.applySettings();
  window.addEventListener('resize', () => T.idle());
};
T.applySettings = () => {
  if (!T.ready) return; const S = TZ.settings, lefty = !!S.tLeft, box = $('#touch');
  if (box.classList.contains('lefty') !== lefty) {
    box.classList.toggle('lefty', lefty);
    box.querySelectorAll('.tset .tbtn').forEach(b => { const l = b.style.left, r = b.style.right; b.style.left = r || ''; b.style.right = l || ''; });
  }
  T.idle();
};
T.place = (id, x, y, on) => { const s = $('#' + id); s.style.left = x + 'px'; s.style.top = y + 'px'; s.classList.toggle('on', !!on); };
T.knob = (id, dx, dy) => { $('#' + id + ' .sk').style.transform = `translate(${dx}px, ${dy}px)`; };
T.idle = () => {
  const W = window.innerWidth / TZ.uiz, H = window.innerHeight / TZ.uiz;
  const lefty = !!TZ.settings.tLeft;
  if (T.L.id === null) T.place('stickL', lefty ? W - 200 : 180, H - 160, false);
  if (T.Rs.id === null) T.place('stickR', lefty ? 180 : W - 200, H - 160, false);
};
T.fn = (fn, b) => {
  const ui = TZ.app.ui;
  if (fn === 'chat') { ui && ui.openChat(); return; }
  if (fn === 'phrases') { TZ.app.phrases(); return; }
  if (fn === 'run') { T.runLock = !T.runLock; b.classList.toggle('on', T.runLock); return; }
  if (fn === 'demolish') { T.demolish = !T.demolish; b.classList.toggle('on', T.demolish); TZ.game && TZ.game.hint(T.demolish ? 'Нажмите на свою постройку, чтобы разобрать её' : 'Режим стройки'); return; }
};
T.clearKeys = () => { for (const k of T.vkeys) I.vkey(k, false); T.vkeys.clear(); };
T.setKey = (k, on) => { if (on) { I.vkey(k, true); T.vkeys.add(k); } else if (T.vkeys.has(k)) { I.vkey(k, false); T.vkeys.delete(k); } };

// called every frame before the game update
T.update = (G) => {
  if (!TZ.isTouch || !G || G.demo) { I.stick = null; return; }
  if (!T.ready) T.init();
  const P = G.me, box = $('#touch');
  const mode = P.dead || G.mode === 'dead' ? 'dead' : P.vehicle ? 'veh' : G.mode === 'build' ? 'build' : 'play';
  if (mode !== T.mode) {
    T.mode = mode; T.clearKeys();
    $('#tsPlay').classList.toggle('show', mode === 'play'); $('#tsVeh').classList.toggle('show', mode === 'veh'); $('#tsBuild').classList.toggle('show', mode === 'build');
    box.classList.toggle('build', mode === 'build');
    { const v = P.vehicle && G.vehicles.find(q => q.id === P.vehicle); box.classList.toggle('air', !!(v && v.T.air)); }
    $('#stickR').style.display = mode === 'play' ? '' : 'none';
    $('#stickL .slab').textContent = mode === 'veh' ? 'газ · руль' : 'ходить';
    if (mode !== 'build' && T.demolish) { T.demolish = false; $('#tbDem').classList.remove('on'); }
    box.style.visibility = mode === 'dead' ? 'hidden' : '';
    if (mode === 'build') { const sp = TZ.app.renderer.worldToScreen(P.x + Math.cos(P.ang) * 2, P.y + Math.sin(P.ang) * 2); I.mouse.x = sp.x; I.mouse.y = sp.y; }
  }
  box.classList.toggle('off', !!G.paused);
  const L = T.L, S = T.Rs;
  // ---- vehicle: stick -> virtual keys ----
  if (mode === 'veh') {
    T.setKey('KeyW', L.y < -0.3); T.setKey('KeyS', L.y > 0.35); T.setKey('KeyA', L.x < -0.3); T.setKey('KeyD', L.x > 0.3);
    I.stick = null; return;
  }
  // ---- on foot: analog movement ----
  I.stick = L.mag > 0.12 ? { x: L.x, y: L.y, mag: L.mag, run: L.mag > 0.96 || T.runLock } : null;
  if (mode === 'build' || mode === 'dead') return;
  // ---- aiming ----
  const ps = TZ.app.renderer.worldToScreen(P.x, P.y, 14);
  let fire = false;
  if (S.id !== null && S.mag > 0.22) { const l = Math.hypot(S.x, S.y) || 1; T.aim = { x: S.x / l, y: S.y / l }; fire = S.mag > 0.62; }
  else if (L.mag > 0.3 && S.id === null) { const l = Math.hypot(L.x, L.y) || 1; T.aim = { x: L.x / l, y: L.y / l }; }
  if (T.tapFire > 0 && TZ.settings.aimAssist === false) { T.tapFire--; fire = true; }
  if (T.tapFire > 0) {
    // aim assist: nearest enemy within reach
    const W2 = TZ.WEAPONS[P.weapon] || {}, reach = W2.melee ? 3.5 : Math.min(14, (W2.range || 10));
    let best = null, bd = reach * reach;
    for (const z of G.zombies) { if (z.dead) continue; const d = (z.x - P.x) ** 2 + (z.y - P.y) ** 2; if (d < bd && !(G.hiddenAt && G.enclosures.size && G.hiddenAt(z.x, z.y))) { bd = d; best = z; } }
    if (!best) for (const a of G.animals) { if (a.dead) continue; const d = (a.x - P.x) ** 2 + (a.y - P.y) ** 2; if (d < bd) { bd = d; best = a; } }
    if (best) { const s = TZ.app.renderer.worldToScreen(best.x, best.y, 12), dx = s.x - ps.x, dy = s.y - ps.y, l = Math.hypot(dx, dy) || 1; T.aim = { x: dx / l, y: dy / l }; }
    T.tapFire--; fire = true;
  }
  const reach = 150 * (TZ.app.renderer.scale / 2);
  I.mouse.x = ps.x + T.aim.x * reach; I.mouse.y = ps.y + T.aim.y * reach;
  if (!G.uiBlocking) { I.mouse.down = fire; if (fire) I.mouse.clicked = true; } else I.mouse.down = false;
  T.firing = fire;
  $('#stickR').classList.toggle('fire', fire);
};
// Android: real fullscreen + landscape lock (iPhone: add to Home Screen instead)
T.fullscreen = () => {
  if (!TZ.isTouch || TZ.isIOS || TZ.isApp || document.fullscreenElement) return;
  const el = document.documentElement;
  try { const p = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { }); } catch (e) { }
};
})();
