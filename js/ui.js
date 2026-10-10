// =====================================================================
//  THE ZOMBIES 2.0 — in-game interface
// =====================================================================
'use strict';
(() => {
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => TZ.esc(s);
const iconCache = {};
TZ.iconURL = (id) => {
  if (iconCache[id]) return iconCache[id];
  let c = TZ.art.icons[id];
  if (!c && TZ.VEHICLES && TZ.VEHICLES[id]) { // vehicle portraits for the garage list
    try { const s = TZ.Chars.vehicleSet(id, null, null).get(0, 0, 3), cv = TZ.canvas(64, 48), k = Math.min(1, 60 / s.c.width, 46 / s.c.height); cv.g.imageSmoothingEnabled = false; cv.g.drawImage(s.c, (64 - s.c.width * k) / 2, (48 - s.c.height * k) / 2, s.c.width * k, s.c.height * k); c = cv; } catch (e) { }
  }
  if (!c && TZ.BUILD[id]) {
    const fake = { world: null, gardenProgress: () => 1, gateOpen: () => false, me: {} };
    const spr = TZ.objSprite({ t: id, x: 0, y: 0, v: 0, hp: TZ.BUILD[id].hp, planted: -1e9 }, null);
    const cv = TZ.canvas(48, 48);
    if (spr) { const s = Math.min(1.4, 44 / Math.max(spr.c.width, spr.c.height)); const w = spr.c.width * s, h = spr.c.height * s; cv.g.imageSmoothingEnabled = false; cv.g.drawImage(spr.c, (48 - w) / 2 | 0, (48 - h) / 2 | 0, w, h); }
    if (id === 'campfire' || id === 'torch') { cv.g.fillStyle = '#ff9a20'; cv.g.fillRect(21, id === 'torch' ? 6 : 18, 6, 8); cv.g.fillStyle = '#fff0a0'; cv.g.fillRect(22, id === 'torch' ? 9 : 21, 3, 3); }
    c = cv;
  }
  if (!c && TZ.VEHICLES[id]) { const s = TZ.Chars.vehicleSet(id, null).get(0, 0, 2); const cv = TZ.canvas(64, 48); cv.g.drawImage(s.c, s.ax - 32, s.ay - 32, 64, 48, 0, 0, 64, 48); c = cv; }
  if (!c) return '';
  return iconCache[id] = c.toDataURL();
};
const costHTML = (cost, G, local) => Object.entries(cost).map(([k, n]) => { const have = local ? G.count(k) : G.avail(k); return `<span class="cost ${have >= n ? 'ok' : 'no'}" title="${TZ.ITEMS[k] ? TZ.ITEMS[k].name : k}"><img src="${TZ.iconURL(k)}">${n}<small>/${have}</small></span>`; }).join('');
const BIOME_NAMES = TZ.BIOMES.map(b => b.name);

class UI {
  constructor() {
    this._dirty = true; this.logEl = $('#log'); this.hoverItem = null; this.invOpen = false; this.invTab = 'all'; this.chest = null; this.veh = null;
    this.craftTab = null; this.mapView = null; this.chatOpen = false;
    this.buildHUD();
    this.minimap = new TZ.Minimap($('#minimap'));
    this.bigmap = new TZ.BigMap();
    const markUI = (p) => { p.addEventListener('mouseenter', () => this.overUI = true); p.addEventListener('mouseleave', () => this.overUI = false); };
    document.querySelectorAll('#ui .px-panel, #ui .modal, #hotbar, #buildbar').forEach(markUI);
    this.bindChat(); this.bindMap(); this.bindKeypad();
    $('#invtabs').innerHTML = TZ.ITEM_CATS.map(([k, n]) => `<button class="tab ${k === 'all' ? 'on' : ''}" data-cat="${k}">${n}</button>`).join('');
    $('#invtabs').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; this.invTab = b.dataset.cat; $('#invtabs').querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b)); TZ.audio.play('ui'); this.renderInventory(TZ.game); };
    document.querySelectorAll('.eqs').forEach(s => s.addEventListener('click', () => { const G = TZ.game, id = G.me.eq[s.dataset.slot]; if (id) { G.useItem(id); this.renderInventory(G); } }));
    $('#chestall').onclick = () => { const G = TZ.game, o = this.chest; if (!o) return; for (const k of Object.keys(G.me.inv)) if (TZ.ITEMS[k] && (TZ.ITEMS[k].type === 'mat' || TZ.ITEMS[k].type === 'part')) { const n = G.me.inv[k]; G.take(k, n); G.act('chestPut', { x: o.x, y: o.y, vid: o.vid || 0, id: k, n }); } TZ.audio.play('drop'); };
  }
  dirty() { this._dirty = true; }
  buildHUD() {
    const icons = TZ.art.icons;
    const therm = (() => { const b = new TZ.PixelBuf(9, 12); b.rect(3, 0, 3, 9, [220, 220, 230]); b.rect(4, 2, 1, 7, [200, 40, 40]); b.disc(4.5, 9.5, 2.5, [200, 40, 40]); return TZ.outline(b.canvas(), [10, 8, 8]).toDataURL(); })();
    const bars = $('#bars'); bars.innerHTML = ''; this.bars = {};
    for (const [k, ic, col] of [['hp', icons.hud_heart.toDataURL(), '#d2322a'], ['st', icons.hud_bolt.toDataURL(), '#e8a92a'], ['wa', icons.hud_drop.toDataURL(), '#2f8ee0'], ['fo', icons.hud_food.toDataURL(), '#58b048'], ['wm', therm, '#e07040']]) {
      const row = el('div', 'bar-row'), img = el('img', 'bar-ic'); img.src = ic;
      const bar = el('div', 'bar'), fill = el('div', 'fill'), ghost = el('div', 'ghost'); fill.style.background = col; bar.append(ghost, fill);
      const val = el('span', 'bar-val'); row.append(img, bar, val); bars.append(row);
      this.bars[k] = { fill, val, ghost, last: 1, row };
    }
  }
  update(G, dt) {
    const uiEl = document.getElementById('ui'); if (uiEl._veh !== !!G.me.vehicle) { uiEl._veh = !!G.me.vehicle; uiEl.classList.toggle('inveh', uiEl._veh); }
    const P = G.me;
    const setBar = (k, v, max = 100) => { const b = this.bars[k], f = clamp(v / max, 0, 1); b.fill.style.width = (f * 100) + '%'; b.val.textContent = `${Math.ceil(v)} / ${max}`; b.last += (f - b.last) * Math.min(1, dt * 3); if (b.last < f) b.last = f; b.ghost.style.width = (b.last * 100) + '%'; b.fill.parentElement.classList.toggle('low', f < 0.25); };
    setBar('hp', P.hp, P.maxHp); setBar('st', P.stamina); setBar('wa', P.thirst); setBar('fo', P.hunger); setBar('wm', P.warmth);
    const biome = G.world.biomeAt(P.x, P.y);
    this.bars.wm.row.classList.toggle('hidden', P.warmth > 85 && biome !== 2);
    const st = [];
    if (P.bleeding) st.push(['blood', 'Кровотечение']);
    if (P.infection > 0) st.push(['bio', `Заражение ${Math.floor(P.infection)}%`]);
    if (P.sick > 20) st.push(['sick', 'Отравление']);
    if (P.warmth < 30) st.push(['cold', P.warmth < 10 ? 'Обморожение!' : 'Холодно']);
    if (P.chilled > 0) st.push(['cold', 'Замедление']);
    if (G.weight() > P.carry()) st.push(['heavy', 'Перегруз']);
    if (P.hunger < 20) st.push(['hungry', 'Голод']);
    if (P.thirst < 20) st.push(['thirst', 'Жажда']);
    if (G.nearFire(P.x, P.y)) st.push(['warm', 'У костра']);
    if (P.buffs.tough) st.push(['buff', 'Обезболивающее']);
    if (P.buffs.fast) st.push(['buff', 'Адреналин']);
    const sk = st.map(s => s.join()).join();
    if (sk !== this._sk) { this._sk = sk; $('#status').innerHTML = st.map(([c, t]) => `<span class="chip ${c}">${t}</span>`).join(''); }
    const q = G.curQuest; if (q) { const qk = q.text + '|' + q.hint; if (qk !== this._qk) { this._qk = qk; $('#quest').innerHTML = `<div class="q-title">ЗАДАЧА</div><div class="q-text">${esc(q.text)}</div><div class="q-hint">${esc(q.hint || '')}</div>`; } }
    const team = G.allies.filter(a => a.owner === P.uid && !a.dead);
    const tk = team.map(a => a.name + a.mode + (a.hp | 0) + ((a.food ?? 80) / 10 | 0) + ((a.water ?? 80) / 10 | 0) + (a.task ? a.taskLbl : '')).join();
    if (tk !== this._tk) { this._tk = tk; $('#team').innerHTML = team.length ? `<div class="q-title">КОМАНДА · [F] приказ</div>` + team.map(a => `<div class="mate"><span>${esc(a.name)}</span><span class="mrole">${a.task ? `<span class="gold">${a.taskLbl}</span>` : TZ.ROLES[a.role].name}</span><span class="mbar"><i style="width:${a.hp}%"></i><b class="mf" style="width:${a.food ?? 80}%"></b><b class="mw" style="width:${a.water ?? 80}%"></b></span><span class="mmode">${a.mode === 'follow' ? '>' : '#'}</span></div>`).join('') : ''; }
    const night = G.isNight(), h = G.hour, ck = TZ.fmtTime(G.minutes) + G.day + night;
    if (ck !== this._ck) { this._ck = ck; $('#clock').innerHTML = `<span class="sun ${night ? 'moon' : (h > 17 || h < 7 ? 'dusk' : '')}"></span><span class="time">${TZ.fmtTime(G.minutes)}</span><span class="day">День ${G.day}</span>`; }
    $('#clock').classList.toggle('danger', !!G.horde || (h >= 19.5 && h < 20.5));
    const bt = `${BIOME_NAMES[biome]} · ${Math.floor(P.x)}, ${Math.floor(P.y)}`; if (bt !== this._bt) { this._bt = bt; $('#biomeTag').textContent = bt; TZ.Account.biome(biome); }
    this.minimap.draw(G, dt);
    const label = G.interactLabel(G.interact), pk = label || '';
    if (pk !== this._pk) { this._pk = pk; const p = $('#prompt'); if (label) { p.innerHTML = `<kbd>E</kbd> ${esc(label)}`; p.classList.add('show'); } else p.classList.remove('show'); }
    if (this._dirty) { this._dirty = false; this.renderHotbar(G); this.renderBuildBar(G); if (this.invOpen) this.renderInventory(G); }
    for (let i = 0; i < 8; i++) {
      const id = P.hotbar[i], s = this.slots && this.slots[i]; if (!s) continue;
      s.classList.toggle('sel', i === P.sel && G.mode === 'play');
      let txt = '';
      if (id) { const W2 = TZ.WEAPONS[id]; if (W2 && W2.ammo) txt = W2.pack ? `${Math.round(P.mags[id] || 0)}%` : `${P.mags[id] || 0} / ${G.count(W2.ammo)}`; else if (id === 'chainsaw') txt = `${Math.round((P.mags.chainsaw || 0) * 100)}%`; else if (TZ.ITEMS[id] && TZ.ITEMS[id].stack > 1) txt = G.count(id) || ''; }
      if (s._txt !== txt) { s._txt = txt; s.querySelector('.cnt').textContent = txt; }
      s.classList.toggle('empty', !!id && !G.count(id));
      s.style.setProperty('--rl', P.reload > 0 && i === P.sel ? (1 - P.reload / P.reloadTotal) * 100 + '%' : '0%');
    }
    $('#hotbar').style.display = G.mode === 'build' || P.vehicle ? 'none' : 'flex';
    $('#buildbar').style.display = G.mode === 'build' ? 'flex' : 'none';
    for (const m of [...this.logEl.children]) { m._t = (m._t || 0) + dt; if (m._t > 7) m.style.opacity = Math.max(0, 1 - (m._t - 7) / 1.5); if (m._t > 9) m.remove(); }
    for (const m of [...$('#chatlog').children]) { m._t = (m._t || 0) + dt; m.style.opacity = this.chatOpen ? 1 : Math.max(0, 1 - Math.max(0, m._t - 10) / 2); }
    G.uiBlocking = this.overUI || this.modalOpen() || this.chatOpen;
    G.typing = this.chatOpen;
    document.body.classList.toggle('hidecursor', !G.uiBlocking && !G.paused && G.mode !== 'dead');
    if (this.invOpen) { const k = G.weight() + JSON.stringify(P.eq); if (this._invTick !== k) { this._invTick = k; this.renderInventory(G); } this.drawDoll(G, dt); }
    if (this.veh) { if (!G.vehicles.includes(this.veh) || dist(P.x, P.y, this.veh.x, this.veh.y) > 4) this.closeVehicle(); else if (((this._vt = (this._vt || 0) + dt) > 0.3)) { this._vt = 0; this.renderVehicle(G); } }
    if (this.chest) { if (this.chest.vid) { const v = G.vehicles.find(v => v.id === this.chest.vid); if (!v || dist(P.x, P.y, v.x, v.y) > 4 || P.vehicle) this.closeChest(); } else if (dist(P.x, P.y, this.chest.x + .5, this.chest.y + .5) > 3) this.closeChest(); }
    if ($('#bigmap').classList.contains('show')) this.drawBigMap(G);
    if ($('#plist').classList.contains('show') && ((this._pt = (this._pt || 0) + dt) > 1)) { this._pt = 0; this.renderPlist(G); }
  }
  modalOpen() { return !!document.querySelector('#ui .modal.show, body > .modal.show'); }
  // ---------------- hotbar ----------------
  renderHotbar(G) {
    const hb = $('#hotbar'); hb.innerHTML = ''; this.slots = [];
    const P = G.me;
    for (let i = 0; i < 8; i++) {
      const id = P.hotbar[i];
      const s = el('div', 'slot' + (id && TZ.ITEMS[id] ? ' t-' + TZ.ITEMS[id].type : ''), `<span class="num">${i + 1}</span>${id ? `<img src="${TZ.iconURL(id)}">` : ''}<span class="cnt"></span>`);
      s.title = id ? TZ.ITEMS[id].name : 'Пусто — наведите на предмет в инвентаре и нажмите цифру';
      s.onclick = () => { if (!id) return; const it = TZ.ITEMS[id]; if (it.type === 'food' || it.type === 'med') G.useItem(id); else if (G.count(id)) { P.sel = i; TZ.audio.play('equip'); } this.dirty(); };
      s.oncontextmenu = (e) => { e.preventDefault(); P.hotbar[i] = null; this.dirty(); };
      hb.append(s); this.slots.push(s);
    }
  }
  // ---------------- build bar ----------------
  renderBuildBar(G) {
    const bb = $('#buildbar'); if (G.mode !== 'build') return;
    const cur = TZ.BUILD[G.buildSel], cat = this.buildCat || cur.cat;
    bb.innerHTML = '';
    const tabs = el('div', 'tabs'); tabs.innerHTML = TZ.BUILD_CATS.map(([k, n]) => `<button class="tab ${k === cat ? 'on' : ''}" data-c="${k}">${n}</button>`).join('');
    tabs.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; this.buildCat = b.dataset.c; const first = Object.values(TZ.BUILD).find(B => B.cat === this.buildCat); if (first) G.buildSel = first.id; TZ.audio.play('ui'); this.renderBuildBar(G); };
    const list = el('div', 'blist');
    for (const B of Object.values(TZ.BUILD)) {
      if (B.cat !== cat) continue;
      const b = el('div', `bitem ${G.buildSel === B.id ? 'sel' : ''} ${G.canAfford(B.cost) ? '' : 'poor'}`, `<img src="${TZ.iconURL(B.id)}"><div class="bname">${B.name}</div>`);
      b.onmouseenter = () => this.buildTip(G, B.id); b.onmouseleave = () => this.buildTip(G, G.buildSel);
      b.onclick = () => { G.buildSel = B.id; TZ.audio.play('ui'); this.renderBuildBar(G); };
      list.append(b);
    }
    const tip = el('div', 'btip'); tip.id = 'btip';
    bb.append(tabs, list, tip); this.buildTip(G, G.buildSel);
    bb.onmouseenter = () => this.overUI = true; bb.onmouseleave = () => this.overUI = false;
  }
  buildTip(G, id) {
    const B = TZ.BUILD[id], t = $('#btip'); if (!t) return;
    t.innerHTML = `${B.name} · прочность ${B.hp}${B.needs ? ' · <span class="warn">нужен верстак</span>' : ''}<div class="bdesc">${B.desc}</div><div class="costs">${costHTML(B.cost, G)}</div>${TZ.isTouch ? '<div class="keys">Коснитесь земли, чтобы построить. Ведите пальцем — ставить стену подряд.</div>' : ''}<div class="keys tz-desk"><kbd>ЛКМ</kbd> поставить <kbd>Колесо</kbd> выбор <kbd>X</kbd> разобрать <kbd>ПКМ</kbd>/<kbd>B</kbd> выход${G.myChests().length ? ' · <span class="ok">материалы из ящиков доступны</span>' : ''}</div>`;
  }
  // ---------------- inventory ----------------
  toggleInventory(G) { if (this.invOpen) this.closeInventory(); else this.openInventory(); }
  openInventory() { const G = TZ.game; this.invOpen = true; $('#inv').classList.add('show'); this.renderInventory(G); TZ.audio.play('ui_open'); }
  closeInventory() { this.invOpen = false; $('#inv').classList.remove('show'); this.hoverItem = null; $('#tooltip').classList.remove('show'); this.closeChest(); this.overUI = false; }
  renderInventory(G) {
    const P = G.me, order = ['weapon', 'throw', 'ammo', 'med', 'food', 'wear', 'mat', 'part', 'tool', 'quest'];
    const keys = Object.keys(P.inv).filter(k => P.inv[k] > 0 && TZ.ITEMS[k] && (this.invTab === 'all' || TZ.itemCat(k) === this.invTab)).sort((a, b) => order.indexOf(TZ.ITEMS[a].type) - order.indexOf(TZ.ITEMS[b].type));
    const grid = $('#invgrid'); grid.innerHTML = '';
    for (const k of keys) grid.append(this.itemCell(G, k, P.inv[k], 'inv'));
    for (let i = keys.length; i < 30; i++) grid.append(el('div', 'cell void'));
    for (const s of ['head', 'body', 'back']) { const c = document.querySelector(`.eqs[data-slot=${s}] .cell`); const id = P.eq[s]; c.innerHTML = id ? `<img src="${TZ.iconURL(id)}">` : `<em>${s === 'head' ? 'голова' : s === 'body' ? 'тело' : 'спина'}</em>`; c.title = id ? TZ.ITEMS[id].name + ' — нажмите, чтобы снять' : 'Пусто'; c.classList.toggle('eq', !!id); }
    const w = G.weight(), mw = P.carry();
    $('#invw').innerHTML = `<span class="wlbl">Вес ${w.toFixed(1)} / ${mw}${w > mw ? ' <span class="warn">ПЕРЕГРУЗ</span>' : ''}</span><span class="wbar${w > mw ? ' over' : ''}"><i style="width:${Math.min(100, w / mw * 100)}%"></i></span>`;
    $('#invstats').innerHTML = `<div>Броня: <b>${Math.round(P.armor() * 100)}%</b></div><div>Тепло одежды: <b>${P.warmGear()}</b></div><div>Грузоподъёмность: <b>${mw}</b></div><div>RN: <b class="gold">${TZ.Account.active().rn}</b></div>`;
    $('#invhint').innerHTML = TZ.isTouch ? 'Нажмите на предмет — меню: использовать, на панель, выбросить' : this.chest ? 'ЛКМ — положить в ящик (Shift — всё)' : 'ЛКМ — использовать / надеть · наведи + <kbd>1-8</kbd> — на панель · ПКМ — выбросить 1 (Shift — всё)';
  }
  // touch: tap an item -> pixel context menu
  itemMenu(G, k, e) {
    const P = G.me, it = TZ.ITEMS[k], n = G.count(k); if (!it || !n) return;
    const items = [];
    const done = () => { this.renderInventory(G); this.dirty(); };
    if (this.chest) {
      items.push({ label: 'Положить 1', fn: () => { G.take(k, 1); G.act('chestPut', { x: this.chest.x, y: this.chest.y, vid: this.chest.vid || 0, id: k, n: 1 }); done(); } });
      if (n > 1) items.push({ label: `Положить всё (${n})`, fn: () => { G.take(k, n); P.hotbar = P.hotbar.map(h => (h === k && TZ.WEAPONS[h]) ? null : h); G.act('chestPut', { x: this.chest.x, y: this.chest.y, vid: this.chest.vid || 0, id: k, n }); done(); } });
    }
    const use = it.type === 'wear' ? (P.eq[it.slot] === k ? 'Снять' : 'Надеть') : it.type === 'food' ? (it.food ? 'Съесть' : 'Выпить') : it.type === 'med' ? 'Применить' : (it.type === 'weapon' || it.type === 'throw') ? 'Взять в руки' : null;
    if (use) items.push({ label: use, cls: 'green', fn: () => { G.useItem(k); done(); } });
    if (it.type === 'weapon' || it.type === 'throw' || it.type === 'food' || it.type === 'med') {
      const free = P.hotbar.indexOf(null), cur = P.hotbar.indexOf(k);
      if (cur < 0) items.push({ label: free >= 0 ? `На панель (слот ${free + 1})` : `На панель (заменить ${P.sel + 1})`, fn: () => { P.hotbar[free >= 0 ? free : P.sel] = k; TZ.audio.play('equip'); done(); } });
      else items.push({ label: `Убрать с панели (${cur + 1})`, fn: () => { P.hotbar[cur] = null; done(); } });
    }
    if (it.type !== 'quest') {
      items.push({ label: 'Выбросить 1', fn: () => { G.dropItem(k, 1); TZ.audio.play('drop'); done(); } });
      if (n > 1) items.push({ label: `Выбросить всё (${n})`, cls: 'red', fn: () => { G.dropItem(k, n); TZ.audio.play('drop'); done(); } });
    }
    TZ.app.ctx(e.clientX, e.clientY, `${it.name}${n > 1 ? ' ×' + n : ''}`, it.desc || '', items);
  }
  itemCell(G, k, n, where) {
    const P = G.me, it = TZ.ITEMS[k];
    const c = el('div', 'cell t-' + it.type + (P.hotbar[P.sel] === k || (it.type === 'wear' && P.eq[it.slot] === k) ? ' eq' : ''), `<img src="${TZ.iconURL(k)}">${n > 1 ? `<span class="n">${n}</span>` : ''}${where === 'inv' && P.hotbar.includes(k) ? `<span class="hb">${P.hotbar.indexOf(k) + 1}</span>` : ''}`);
    c.onmouseenter = (e) => { if (TZ.isTouch) return; if (where === 'inv') this.hoverItem = k; this.tooltip(k, e); TZ.audio.play('ui_hover'); };
    c.onmousemove = (e) => this.moveTip(e);
    c.onmouseleave = () => { this.hoverItem = null; $('#tooltip').classList.remove('show'); };
    if (where === 'inv' && TZ.isTouch) c.onclick = (e) => this.itemMenu(G, k, e);
    else if (where === 'inv') {
      c.onclick = (e) => {
        if (this.chest) { const cnt = e.shiftKey ? P.inv[k] : (it.type === 'ammo' || it.type === 'mat') ? Math.min(P.inv[k], 10) : 1; G.take(k, cnt); P.hotbar = P.hotbar.map(h => (h === k && !G.count(k) && TZ.WEAPONS[h]) ? null : h); G.act('chestPut', { x: this.chest.x, y: this.chest.y, vid: this.chest.vid || 0, id: k, n: cnt }); TZ.audio.play('drop'); this.renderInventory(G); this.dirty(); return; }
        G.useItem(k); this.renderInventory(G); this.dirty();
      };
      c.oncontextmenu = (e) => { e.preventDefault(); if (it.type === 'quest') return; G.dropItem(k, e.shiftKey ? P.inv[k] : 1); TZ.audio.play('drop'); this.renderInventory(G); this.dirty(); };
    } else {
      c.onclick = (e) => { const o = this.chest; if (!o) return; const items = this.chestItems(); const cnt = e.shiftKey ? items[k] : (it.type === 'ammo' || it.type === 'mat') ? Math.min(items[k], 10) : 1; G.act('chestTake', { x: o.x, y: o.y, vid: o.vid || 0, id: k, n: cnt }); TZ.audio.play('pickup'); };
    }
    return c;
  }
  tooltip(k, e) {
    const it = TZ.ITEMS[k], t = $('#tooltip'), W2 = TZ.WEAPONS[k];
    let stats = '';
    if (W2 && W2.melee) stats = `<div class="tstat">Урон ${W2.dmg} · ${(1 / W2.cd).toFixed(1)} уд/с · ближний бой</div>`;
    else if (W2 && W2.ammo) stats = `<div class="tstat">Урон ${W2.dmg}${W2.pellets > 1 ? '×' + W2.pellets : ''} · магазин ${W2.mag} · ${TZ.ITEMS[W2.ammo].name}</div>`;
    if (it.type === 'wear') stats = `<div class="tstat">${it.slot === 'head' ? 'Голова' : it.slot === 'body' ? 'Тело' : 'Спина'}${it.armor ? ' · броня ' + it.armor + '%' : ''}${it.warm ? ' · тепло ' + it.warm : ''}${it.carry ? ' · +' + it.carry + ' к весу' : ''}</div>`;
    if (it.type === 'food') stats = `<div class="tstat">${[it.food ? 'сытость ' + it.food : '', it.water ? 'вода ' + it.water : '', it.stamina ? 'силы ' + it.stamina : '', it.warm ? 'тепло ' + it.warm : ''].filter(Boolean).join(' · ')}</div>`;
    const TN = { weapon: 'Оружие', throw: 'Метательное', ammo: 'Патроны', food: 'Еда и питьё', med: 'Медицина', mat: 'Материал', part: 'Деталь', tool: 'Инструмент', wear: 'Одежда', quest: 'Сюжетный предмет' };
    t.className = 't-' + it.type; t.innerHTML = `<div class="ttype">${TN[it.type] || ''}</div><b>${it.name}</b><div>${it.desc}</div>${stats}<div class="tw">Вес: ${it.w} кг</div>`;
    t.classList.add('show'); this.moveTip(e);
  }
  moveTip(e) { const t = $('#tooltip'), z = TZ.uiz; t.style.left = Math.min(window.innerWidth / z - 330, e.clientX / z + 16) + 'px'; t.style.top = Math.min(window.innerHeight / z - 150, e.clientY / z + 12) + 'px'; }
  drawDoll(G, dt) {
    const cv = $('#dollcv'), g = cv.getContext('2d'); this._doll = (this._doll || 0) + dt;
    const d = ((this._doll * 1.2) | 0) % 8; if (d === this._dollD && this._dollEq === JSON.stringify(G.me.eq)) return; this._dollD = d; this._dollEq = JSON.stringify(G.me.eq);
    const s = G.me.sprite.get('idle', 0, d);
    g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
    g.drawImage(s.c, 44 - s.ax * 2, 96 - s.ay * 2, s.c.width * 2, s.c.height * 2);
  }
  // ---------------- chest ----------------
  openChest(o) { this.chest = o; if (!this.invOpen) this.openInventory(); $('#chestp').classList.add('show'); TZ.game.act('chestOpen', { x: o.x, y: o.y, vid: o.vid || 0 }); this.renderChest(); this.renderInventory(TZ.game); }
  openTrunk(v) { this.closeVehicle(); this.openChest({ x: v.x - .5, y: v.y - .5, vid: v.id, trunk: true, items: v.trunk || {} }); }
  closeChest() { this.chest = null; $('#chestp').classList.remove('show'); }
  chestItems() {
    const G = TZ.game, o = this.chest; if (!o) return {};
    if (o.vid) { if (G.auth) { const v = G.vehicles.find(v => v.id === o.vid); return (v && v.trunk) || {}; } return G.chests.get('v' + o.vid) || o.items || {}; }
    return G.auth ? (G.world.get(o.x, o.y) || o).items || {} : G.chests.get(o.x + ',' + o.y) || o.items || {};
  }
  chestUpdate(x, y, items, vid) { if (this.chest && (vid ? this.chest.vid === vid : this.chest.x === x && this.chest.y === y)) this.renderChest(); }
  renderChest() {
    const G = TZ.game, items = this.chestItems(), g = $('#chestgrid'); g.innerHTML = '';
    const keys = Object.keys(items).filter(k => items[k] > 0 && TZ.ITEMS[k]);
    for (const k of keys) g.append(this.itemCell(G, k, items[k], 'chest'));
    for (let i = keys.length; i < 40; i++) g.append(el('div', 'cell void'));
    $('#chesttitle').textContent = this.chest && this.chest.vid ? `Багажник (${keys.length}/16)` : this.chest && this.chest.owner && this.chest.owner !== G.me.uid ? 'Чужой ящик' : `Ящик (${keys.length}/40)`;
  }
  // ---------------- craft ----------------
  openCraft(st) {
    const G = TZ.game; if (!G.net) G.paused = true;
    this.craftTab = st !== undefined ? st : (this.craftTab ?? null);
    $('#craft').classList.add('show'); TZ.audio.play('ui_open'); this.renderCraft(G);
  }
  renderCraft(G) {
    const tabs = [[null, 'Руками'], ['bench', 'Верстак'], ['fire', 'Костёр'], ['garage', 'Гараж']];
    $('#crafttabs').innerHTML = tabs.map(([k, n]) => `<button class="tab ${k === this.craftTab ? 'on' : ''}" data-st="${k || ''}">${n}${k && G.nearStation(k) ? ' ●' : ''}</button>`).join('');
    $('#crafttabs').onclick = (e) => { const b = e.target.closest('[data-st]'); if (!b) return; this.craftTab = b.dataset.st || null; TZ.audio.play('ui'); this.renderCraft(G); };
    const st = this.craftTab, near = G.nearStation(st);
    const stName = { bench: 'верстак', fire: 'костёр', garage: 'гаражный пост' }[st];
    $('#craftbench').innerHTML = !st ? 'Простые вещи, которые можно сделать в любом месте.' : near ? `<span class="ok">Рядом ${stName} — рецепты доступны</span>` : `<span class="warn">Подойдите к станции «${stName}», чтобы создавать эти вещи</span>`;
    const local = !G.auth;
    const list = $('#craftlist'); list.innerHTML = '';
    const recipes = TZ.RECIPES.filter(r => (r.st || null) === st);
    for (const r of recipes) {
      const it = TZ.ITEMS[r.out], owned = it.type === 'weapon' && G.count(r.out) > 0;
      const afford = local ? Object.entries(r.cost).every(([k, n]) => G.count(k) >= n) : G.canAfford(r.cost);
      const can = near && afford && !owned;
      const row = el('div', 'recipe' + (can ? '' : ' poor'), `<img src="${TZ.iconURL(r.out)}"><div class="rinfo">${it.name}${r.n > 1 ? ' ×' + r.n : ''}${owned ? '<span class="tag">есть</span>' : ''}<div class="rdesc">${it.desc}</div><div class="costs">${costHTML(r.cost, G, local)}</div></div>`);
      const btn = el('button', 'px-btn small', 'Создать'); btn.disabled = !can;
      btn.onclick = () => { this.craft(G, r, local); this.renderCraft(G); };
      row.append(btn); list.append(row);
    }
    for (const r of TZ.VEHICLE_RECIPES.filter(r => (r.st === undefined ? 'garage' : r.st) === st)) {
      const afford = local ? Object.entries(r.cost).every(([k, n]) => G.count(k) >= n) : G.canAfford(r.cost), can = near && afford;
      const row = el('div', 'recipe' + (can ? '' : ' poor'), `<img src="${TZ.iconURL(r.out)}"><div class="rinfo">${r.name}<span class="tag">${TZ.VEHICLES[r.out].air ? 'летает' : TZ.VEHICLES[r.out].water ? 'плавает' : 'машина'}</span><div class="rdesc">${r.desc}</div><div class="costs">${costHTML(r.cost, G, local)}</div></div>`);
      const btn = el('button', 'px-btn small green', 'Собрать'); btn.disabled = !can;
      btn.onclick = () => { if (local) { for (const k in r.cost) G.take(k, r.cost[k]); } else this.payCraft(G, r.cost); const gar = [...G.structures].find(o => o.t === 'garage' && dist2(o.x, o.y, G.me.x, G.me.y) < 16); G.act('craftVeh', { vk: r.out, x: (gar ? gar.x : G.me.x) + 2, y: (gar ? gar.y : G.me.y) + 2 }); TZ.audio.play('craft'); G.acc('cars', 1); this.renderCraft(G); };
      row.append(btn); list.append(row);
    }
    if (local) $('#craftbench').innerHTML += ' <small class="sub">(в сетевой игре — только из инвентаря)</small>';
  }
  payCraft(G, cost) { const rest = G.payLocal(cost); for (const c of G.myChests()) for (const k in rest) { const t = Math.min(rest[k], (c.items && c.items[k]) || 0); if (t) { c.items[k] -= t; if (!c.items[k]) delete c.items[k]; rest[k] -= t; G.world.touch(c); } } }
  craft(G, r, local) {
    if (TZ.ITEMS[r.out].type === 'weapon' && G.count(r.out)) return;
    if (local) for (const k in r.cost) G.take(k, r.cost[k]); else this.payCraft(G, r.cost);
    G.receive({ [r.out]: r.n }, null, null, true);
    TZ.audio.play('craft'); G.msg(`Создано: ${TZ.ITEMS[r.out].name} ×${r.n}`, 'good'); G.acc('crafted', 1);
  }
  closeCraft() { $('#craft').classList.remove('show'); TZ.game.paused = false; TZ.audio.play('ui_close'); }
  // ---------------- vehicle panel ----------------
  openVehicle(v) { this.veh = v; $('#vehp').classList.add('show'); this.renderVehicle(TZ.game); TZ.audio.play('ui_open'); }
  closeVehicle() { this.veh = null; $('#vehp').classList.remove('show'); this.overUI = false; }
  renderVehicle(G) {
    const v = this.veh; if (!v) return;
    const wreck = v.state === 'wreck', hpR = v.hp / v.T.hp, P = G.me;
    const gar = G.nearStation('garage', v.x, v.y);
    $('#vehtitle').textContent = v.T.name + (wreck ? ' — сгорела' : '');
    const bar = (f, col) => `<div class="vbar"><i style="width:${clamp(f, 0, 1) * 100}%;background:${col}"></i></div>`;
    const probs = v.problems();
    const hasKey = G.count('wrench') > 0;
    let html = '';
    if (!wreck) html += `<div class="vrow">Корпус ${Math.round(hpR * 100)}% ${bar(hpR, hpR > .5 ? '#6fd04a' : hpR > .25 ? '#e8b030' : '#e03a2a')}</div><div class="vrow">Топливо ${Math.round(v.fuel)}/${v.T.fuel} ${bar(v.fuel / v.T.fuel, '#e8a92a')}</div><div class="vrow">Мест: ${v.T.seats} · Скорость: ${Math.round(v.T.speed * 6)} км/ч</div>`;
    html += probs.length ? `<div class="vprob">${probs.map(esc).join('<br>')}</div>` : '<div class="ok">Машина на ходу!</div>';
    html += '<div class="vbtns">';
    const B = (id, label, ok, title = '') => `<button class="px-btn ${id === 'drive' ? 'green' : ''}" data-v="${id}" ${ok ? '' : 'disabled'} title="${esc(title)}">${label}</button>`;
    if (!wreck) {
      html += B('drive', 'Сесть за руль', !v.seats[0] || (typeof v.seats[0] === 'string' && v.seats[0][0] === 'a'));
      html += B('pass', 'Сесть пассажиром', v.seats.slice(1).includes(null));
      html += B('repair', gar ? 'Починить (гараж)' : 'Починить', hpR < 1 && (gar ? G.count('metal') >= 3 && G.count('parts') >= 2 : hasKey && G.count('repairkit') > 0), gar ? '3 металла + 2 детали' : 'Нужны гаечный ключ и ремкомплект');
      html += B('fuel', 'Заправить', v.fuel < v.T.fuel - 1 && G.count('fuel') > 0, 'Нужна канистра топлива');
      html += B('wheel', 'Поставить колесо', v.flat > 0 && G.count('wheel') > 0, 'Нужно колесо');
      html += B('battery', 'Поставить аккумулятор', !v.battery && G.count('battery') > 0, 'Нужен аккумулятор');
      html += B('trunk', 'Багажник', true, 'Хранилище на 16 ячеек — возит вещи вместе с машиной');
    }
    const tool = hasKey || G.count('sledge') > 0;
    html += B('dismantle', 'Разобрать на металл', tool && !v.seats.some(s => s), 'Нужен гаечный ключ или кувалда');
    html += '</div>';
    if (!wreck && !hasKey && hpR < 1) html += '<div class="phint">Для ремонта нужен гаечный ключ (крафт на верстаке) и ремкомплект.</div>';
    if (v.vk === 'buggy' && !wreck) {
      const mine = !v.owner || v.owner === P.uid;
      html += `<div class="flabel">Улучшения багги ${gar ? '' : '<span class="sub">— подъедьте к гаражному посту</span>'}</div><div class="modlist">`;
      for (const [id, Md] of Object.entries(TZ.VEHICLE_MODS)) {
        const has = v.mods && v.mods[id], reqOk = !Md.req || (v.mods && v.mods[Md.req]), afford = G.canAfford(Md.cost);
        const costs = Object.entries(Md.cost).map(([k, n]) => `<span class="cost ${G.avail(k) >= n ? '' : 'no'}"><img src="${TZ.iconURL(k)}">${n}<small>/${G.avail(k)}</small></span>`).join('');
        html += `<div class="modrow ${has ? 'done' : ''}"><div><b>${esc(Md.name)}</b>${has ? ' <span class="ok">✓ установлено</span>' : ''}<div class="rdesc">${esc(Md.desc)}${!reqOk ? ' · <span class="warn">сначала: ' + esc(TZ.VEHICLE_MODS[Md.req].name) + '</span>' : ''}</div>${has ? '' : `<div class="costs">${costs}</div>`}</div>${has ? '' : `<button class="px-btn small green" data-mod="${id}" ${gar && afford && reqOk && mine ? '' : 'disabled'}>Установить</button>`}</div>`;
      }
      html += '</div>';
    }
    const body = $('#vehbody'); body.innerHTML = html;
    body.onclick = (e) => {
      const mb = e.target.closest('[data-mod]');
      if (mb && !mb.disabled) { const Md = TZ.VEHICLE_MODS[mb.dataset.mod]; this.payCraft(G, Md.cost); G.act('vehMod', { id: v.id, mod: mb.dataset.mod, paid: Md.cost }); TZ.audio.play('craft'); setTimeout(() => this.renderVehicle(G), 200); return; }
      const b = e.target.closest('[data-v]'); if (!b || b.disabled) return; const a = b.dataset.v;
      TZ.audio.play('ui');
      if (a === 'drive') G.act('vehEnter', { id: v.id, seat: 'd' });
      else if (a === 'pass') G.act('vehEnter', { id: v.id, seat: 'p' });
      else if (a === 'repair') { if (gar) { G.take('metal', 3); G.take('parts', 2); } else G.take('repairkit', 1); G.act('vehFix', { id: v.id, what: 'repair', garage: gar }); G.msg('Машина отремонтирована', 'good'); }
      else if (a === 'fuel') { G.take('fuel', 1); G.act('vehFix', { id: v.id, what: 'fuel' }); }
      else if (a === 'wheel') { G.take('wheel', 1); G.act('vehFix', { id: v.id, what: 'wheel' }); }
      else if (a === 'battery') { G.take('battery', 1); G.act('vehFix', { id: v.id, what: 'battery' }); }
      else if (a === 'trunk') { this.openTrunk(v); return; }
      else if (a === 'dismantle') { G.search = { veh: v, x: v.x - .5, y: v.y - .5, t: 0, dur: wreck ? 3 : 5 }; TZ.audio.play('repair'); this.closeVehicle(); return; }
      setTimeout(() => this.renderVehicle(G), 150);
    };
  }
  // ---------------- survivor dialog ----------------
  talk(a) {
    const G = TZ.game; if (!G.net) G.paused = true;
    $('#dialog').classList.add('show');
    const near = G.zombies.filter(z => !z.dead && dist(z.x, z.y, a.x, a.y) < 9).length, R = TZ.ROLES[a.role];
    const lines = { medic: 'Я медик. Если у вас есть безопасное место — я буду лечить раненых.', gatherer: 'Я знаю эти места. Возьмёшь меня — буду таскать дерево, камень и железо.', mechanic: 'Механик я. Стены подлатаю, турели заряжу, машину подшаманю.', shooter: 'Стреляю неплохо. Вдвоём шансов больше.', cook: 'Готовить умею из чего угодно. Голодными не останетесь.' };
    $('#dlgface').src = TZ.Chars.portrait(a.spr, 96).toDataURL();
    $('#dlgname').innerHTML = `${esc(a.name)} <span class="tag">${R.name}</span>`;
    $('#dlgtext').innerHTML = `«${lines[a.role]}»<div class="rdesc">${R.desc} Каждое утро ест 1 порцию еды из ваших ящиков.</div>` + (near ? `<div class="warn">Рядом зомби (${near}). Сначала зачистите территорию!</div>` : '');
    const b = $('#dlgbtns'); b.innerHTML = '';
    const yes = el('button', 'px-btn green', 'Присоединяйся ко мне'); yes.disabled = near > 0;
    yes.onclick = () => { G.act('recruit', { id: a.id }); this.closeDialog(); };
    const no = el('button', 'px-btn', 'Позже'); no.onclick = () => this.closeDialog();
    b.append(yes, no);
  }
  closeDialog() { $('#dialog').classList.remove('show'); TZ.game.paused = false; }
  // ---------------- keypad ----------------
  bindKeypad() {
    const keys = $('#kpkeys');
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']) { const b = el('button', 'px-btn' + (k === 'OK' ? ' green' : k === 'C' ? ' red' : ''), k); b.onclick = () => this.kpPress(k); keys.append(b); }
    window.addEventListener('keydown', (e) => { if (!$('#keypad').classList.contains('show')) return; if (/^Digit\d$/.test(e.code)) this.kpPress(e.code.slice(5)); if (e.code === 'Backspace') this.kpPress('C'); if (e.code === 'Enter') this.kpPress('OK'); });
  }
  codePrompt(x, y, owner) {
    this.kp = { x, y, owner, code: '' };
    $('#kptitle').textContent = owner ? 'Установить код ворот' : 'Кодовый замок';
    $('#kpsub').innerHTML = owner ? 'Введите новый код (4–8 цифр). Друзья вводят его один раз и проходят свободно.' : 'Введите код, чтобы открыть ворота.';
    $('#kpmsg').textContent = ''; this.kpRender(); $('#keypad').classList.add('show'); TZ.audio.play('ui_open');
  }
  kpRender() { const c = this.kp.code; $('#kpscreen').textContent = (this.kp.owner ? c : '*'.repeat(c.length)).padEnd(4, '_'); }
  kpPress(k) {
    const G = TZ.game, kp = this.kp; if (!kp) return;
    TZ.audio.play('beep', 0.6);
    if (k === 'C') kp.code = kp.code.slice(0, -1);
    else if (k === 'OK') { if (kp.code.length < 4) { $('#kpmsg').innerHTML = '<span class="warn">Минимум 4 цифры</span>'; return; } G.act(kp.owner ? 'gateSet' : 'gateCode', { x: kp.x, y: kp.y, code: kp.code }); }
    else if (kp.code.length < 8) kp.code += k;
    this.kpRender();
  }
  codeResult(ok, msg) { if (!this.kp) return; if (ok) { $('#kpmsg').innerHTML = `<span class="ok">${msg || 'Доступ открыт'}</span>`; setTimeout(() => $('#keypad').classList.remove('show'), 600); } else { $('#kpmsg').innerHTML = `<span class="warn">${msg || 'Ошибка'}</span>`; this.kp.code = ''; this.kpRender(); TZ.audio.play('error'); } }
  // ---------------- chat ----------------
  bindChat() {
    const inp = $('#chatinput');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { const t = inp.value.trim(); inp.value = ''; this.closeChat(); if (t) this.sendChat(t); }
      if (e.code === 'Escape') { inp.value = ''; this.closeChat(); }
    });
  }
  openChat(prefix = '') { this.chatOpen = true; $('#chatin').classList.remove('hidden'); const i = $('#chatinput'); i.value = prefix; setTimeout(() => i.focus(), 0); }
  closeChat() { this.chatOpen = false; $('#chatin').classList.add('hidden'); $('#chatinput').blur(); TZ.input.keys = {}; }
  sendChat(t) {
    const G = TZ.game;
    if (t[0] === '/') {
      const [cmd] = t.slice(1).split(' ');
      if (cmd === 'help') this.chatMsg('', 'Команды: /help, /seed, /pos, /c текст (клан), /r текст (рация), /kick имя (только хост)', '#9ad0ff');
      else if (cmd === 'c') { const txt = t.slice(3).trim(); if (txt) TZ.clanSay(txt); }
      else if (cmd === 'r') { const txt = t.slice(3).trim(); if (!txt) return; if (!G.count('walkie')) { this.chatMsg('', 'Нужна рация (крафт на верстаке)', '#ff9a7a'); return; } G.act('chat', { text: txt, radio: 1 }); }
      else if (cmd === 'seed') this.chatMsg('', 'Зерно мира: ' + G.world.seed, '#9ad0ff');
      else if (cmd === 'pos') this.chatMsg('', `Координаты: ${Math.floor(G.me.x)}, ${Math.floor(G.me.y)}`, '#9ad0ff');
      else if (cmd === 'kick' && G.role === 'host') { const name = t.split(' ').slice(1).join(' '); const p = [...G.players.values()].find(p => p.name === name && p !== G.me); if (p) { G.net.kick(p.pid); this.chatMsg('', `${name} отключён`, '#ff9a7a'); } else this.chatMsg('', 'Игрок не найден', '#ff9a7a'); }
      else this.chatMsg('', 'Неизвестная команда. /help', '#ff9a7a');
      return;
    }
    G.act('chat', { text: t });
  }
  chatMsg(name, text, color, clan, clanColor) {
    const m = el('div', 'cmsg', name ? `${clan ? `<b class="ctag" style="--cc:${clanColor || '#e8b030'}">${esc(clan)}</b> ` : ''}<b style="color:${color || '#e8b030'}">${esc(name)}:</b> ${esc(text)}` : `<span style="color:${color || '#9ad0ff'}">${esc(text)}</span>`);
    $('#chatlog').append(m); while ($('#chatlog').children.length > 12) $('#chatlog').firstChild.remove();
    if (name) TZ.audio.play('chat');
  }
  // ---------------- F3 player list ----------------
  togglePlist() { const m = $('#plist'); if (m.classList.contains('show')) { m.classList.remove('show'); return; } this.renderPlist(TZ.game); m.classList.add('show'); TZ.audio.play('ui_open'); }
  renderPlist(G) {
    const list = G.plist || [{ pid: G.me.pid, host: true, profile: TZ.Account.profile(), ping: 0 }];
    $('#plisttitle').textContent = G.net ? `Игроки на сервере «${G.serverName || G.meta.name || ''}» — ${list.length}` : 'Одиночная игра';
    const body = $('#plistbody'); body.innerHTML = '';
    for (const e of list) {
      const p = e.profile, r = TZ.Account.rankOf(p.rn);
      const row = el('div', 'prow', `<div class="pav-s"><img src="${TZ.Cosmetics.url(TZ.Cosmetics.avatar(p.avatar, p.look, 52))}"><img src="${TZ.Cosmetics.url(TZ.Cosmetics.frame(p.frame, 52))}"></div><div>${esc(p.name)}${e.host ? '<span class="host">ХОСТ</span>' : ''}${e.pid === G.me.pid ? '<span class="host">ВЫ</span>' : ''}${p.dev === 'phone' ? '<span class="host dev">ТЕЛЕФОН</span>' : '<span class="host dev">ПК</span>'}${TZ.Voice.isTalking(e.pid) || (e.pid === G.me.pid && TZ.Voice.talking) ? '<span class="vdot" title="говорит"></span>' : ''}</div><div style="color:${r.color}">${r.name}</div><div>Ур. ${TZ.Account.levelOf(p.rn)} · ${p.rn} RN</div><div class="ping">${e.pid === G.me.pid ? '' : (e.ping || 0) + ' мс'}</div>`);
      const ct = TZ.clanTag(G, p.uid); if (ct) row.children[1].insertAdjacentHTML('afterbegin', `<span class="ctag" style="--cc:${ct.color}">${esc(ct.name)}</span> `);
      row.onclick = () => TZ.Social.showPlayer(p, { pid: e.pid });
      body.append(row);
    }
  }
  onClans(G) { if ($('#plist').classList.contains('show')) this.renderPlist(G); }
  showProfile(p) { TZ.Social.showPlayer(p); }
  // ---------------- big map ----------------
  bindMap() {
    const cv = $('#bigmapcv'), pts = new Map(); let pinch = 0;
    cv.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY }); try { cv.setPointerCapture(e.pointerId); } catch (er) { } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p || !this.mapView) return;
      const z = TZ.uiz * (cv.clientWidth ? cv.clientWidth / cv.width : 1);
      if (pts.size === 1) { this.mapView.x -= (e.clientX - p.x) / z / this.mapView.zoom; this.mapView.y -= (e.clientY - p.y) / z / this.mapView.zoom; }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0) this.mapView.zoom = clamp(this.mapView.zoom * d / pinch, 0.25, 8); pinch = d; }
    });
    const up = e => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId); pinch = 0;
      // short tap without dragging: put a map marker there
      if (p && pts.size === 0 && performance.now() - p.t < 300 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 10 && this.mapView && TZ.game && TZ.game.ping) {
        const r = cv.getBoundingClientRect(), z = r.width / cv.width;
        const mx = (e.clientX - r.left) / z, my = (e.clientY - r.top) / z;
        const wx = this.mapView.x + (mx - cv.width / 2) / this.mapView.zoom, wy = this.mapView.y + (my - cv.height / 2) / this.mapView.zoom;
        TZ.game.ping(wx, wy);
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (!this.mapView) return; this.mapView.zoom = clamp(this.mapView.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.25, 8); e.preventDefault(); }, { passive: false });
  }
  toggleMap() {
    const m = $('#bigmap'); if (m.classList.contains('show')) { m.classList.remove('show'); return; }
    const G = TZ.game; m.classList.add('show'); this.mapView = { x: G.me.x, y: G.me.y, zoom: 2 };
    const cv = $('#bigmapcv'); cv.width = cv.clientWidth; cv.height = cv.clientHeight; TZ.audio.play('ui_open');
  }
  drawBigMap(G) { const cv = $('#bigmapcv'); if (cv.width !== cv.clientWidth) { cv.width = cv.clientWidth; cv.height = cv.clientHeight; } this.bigmap.draw(cv, G, this.mapView); $('#mapcoords').textContent = `Вы: ${Math.floor(G.me.x)}, ${Math.floor(G.me.y)} · открыто участков: ${G.world.explored.size}`; TZ.Account.max('chunks', G.world.explored.size); }
  // ---------------- feedback ----------------
  log(t, kind) { const m = el('div', 'msg ' + kind, esc(t)); this.logEl.append(m); while (this.logEl.children.length > 7) this.logEl.firstChild.remove(); }
  banner(title, sub) { const b = $('#banner'); b.innerHTML = `<div class="bt">${esc(title)}</div><div class="bs">${esc(sub || '')}</div>`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
  toast(title, sub, achId) {
    const img = achId ? `<img src="${TZ.Cosmetics.url(TZ.Cosmetics.medal(achId, 48))}">` : '';
    const t = el('div', 'toast px-panel-gold', `${img}<div><div class="tt">${esc(title)}</div><div class="ts">${esc(sub)}</div></div>`);
    $('#toasts').append(t); setTimeout(() => t.classList.add('out'), 5200); setTimeout(() => t.remove(), 6000); TZ.audio.play('achievement');
  }
  rnToast(d, why) { const e = el('div', 'rnpop', `${d > 0 ? '+' : ''}${d} RN <small>${esc(why || '')}</small>`); e.style.color = d > 0 ? '#8fd86a' : '#ff6a50'; $('#ui').append(e); setTimeout(() => e.remove(), 2600); }
  statsHTML(G) { const a = TZ.Account.active(); return `<div class="stats"><div><b>${G.day}</b><span>день</span></div><div><b>${a.stats.kills || 0}</b><span>убито всего</span></div><div><b>${a.rn}</b><span>RN</span></div><div><b>${G.allies.filter(x => x.owner === G.me.uid && !x.dead).length}</b><span>в команде</span></div></div>`; }
  showDeath() { const G = TZ.game; $('#death').classList.add('show'); $('#deathstats').innerHTML = this.statsHTML(G); $('#deathload').style.display = G.role === 'solo' && G.worldId && TZ.Saves.load(G.worldId) ? '' : 'none'; }
  showVictory() { const G = TZ.game; $('#victory').classList.add('show'); $('#winstats').innerHTML = this.statsHTML(G); TZ.audio.setMusic('menu'); }
  disconnected(why) { const G = TZ.game; if (!G || G._dc) return; G._dc = true; TZ.app.alert(why || 'Соединение потеряно', () => TZ.app.toMenu()); }
}
TZ.UI = UI;
})();
