// =====================================================================
//  THE ZOMBIES 2.0 — pixel UI kit
//  Generates pixel-art 9-slice images for panels, buttons, close button,
//  scrollbars, sliders, checkboxes and inputs, exposed as CSS variables.
// =====================================================================
'use strict';
(() => {
const PB = TZ.PixelBuf, H = TZ.hash, sh = TZ.shade, hex = TZ.hex;
const url = c => `url(${c.toDataURL()})`;
const K = TZ.UIKit = {};
K.build = () => {
  const root = document.documentElement.style;
  // ---------------- panel (24x24, slice 8) ----------------
  const panel = (fill, light, dark, rivet, seed) => {
    const b = new PB(24, 24);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const e = Math.min(x, y, 23 - x, 23 - y);
      let c;
      if (e === 0) c = [6, 7, 5];
      else if (e === 1) c = (x === 1 || y === 1) && !(x === 22 || y === 22) ? light : dark;
      else if (e === 2) c = [8, 9, 7];
      else if (e === 3) c = (x === 3 || y === 3) && !(x === 20 || y === 20) ? sh(fill, 0.28) : sh(fill, -0.3);
      else c = sh(fill, y < 8 ? 0.05 : y > 15 ? -0.05 : 0); // soft top light, darker bottom
      if ((e === 0) && ((x === 0 || x === 23) && (y === 0 || y === 23))) c = null;
      b.set(x, y, c);
    }
    if (rivet) { // steel corner brackets with a rivet
      for (const [cx, cy, sx, sy] of [[4, 4, 1, 1], [19, 4, -1, 1], [4, 19, 1, -1], [19, 19, -1, -1]]) {
        for (let k = 0; k < 4; k++) { b.set(cx + sx * k, cy, k === 0 ? sh(rivet, 0.2) : sh(rivet, -0.15)); b.set(cx, cy + sy * k, sh(rivet, -0.15)); }
        b.set(cx + sx, cy + sy, sh(rivet, 0.35)); b.set(cx + sx * 2, cy + sy, sh(rivet, -0.4)); b.set(cx + sx, cy + sy * 2, sh(rivet, -0.4));
      }
    }
    return b.canvas();
  };
  root.setProperty('--px-panel', url(panel([24, 26, 21], [112, 116, 92], [30, 32, 25], [150, 136, 104], 1)));
  root.setProperty('--px-panel2', url(panel([34, 37, 28], [120, 126, 96], [38, 40, 30], null, 2)));
  root.setProperty('--px-panel-red', url(panel([40, 20, 18], [150, 60, 50], [40, 16, 14], [200, 90, 70], 3)));
  root.setProperty('--px-panel-gold', url(panel([36, 32, 18], [210, 170, 70], [50, 40, 16], [240, 210, 120], 4)));
  // inset (for slots, inputs) 12x12 slice 4
  const inset = (fill, rim) => { const b = new PB(12, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const e = Math.min(x, y, 11 - x, 11 - y); b.set(x, y, e === 0 ? (x === 0 || y === 0 ? [8, 9, 7] : rim) : e === 1 ? (x === 1 || y === 1 ? sh(fill, -0.35) : sh(fill, 0.08)) : fill); } return b.canvas(); };
  root.setProperty('--px-inset', url(inset([22, 24, 18], [70, 74, 58])));
  root.setProperty('--px-inset-sel', url(inset([46, 40, 20], [232, 176, 48])));
  // ---------------- buttons (16x16, slice 5) ----------------
  const button = (top, bottom, rim, pressed, accent) => {
    const b = new PB(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      let c = TZ.mix(top, bottom, y / 15);
      if (e === 0) c = [6, 7, 5];
      else if (e === 1) c = pressed ? (y >= 14 || x >= 14 ? sh(top, 0.2) : sh(bottom, -0.4)) : (y === 1 || x === 1 ? rim : sh(bottom, -0.45));
      else if (!pressed && y === 2 && x > 2 && x < 13) c = sh(top, 0.18);
      else if (!pressed && y === 13) c = sh(bottom, -0.25);
      if (accent && x >= 2 && x <= 3 && y >= 2 && y <= 13) c = x === 2 ? accent : sh(accent, -0.3);
      if (e === 0 && (x === 0 || x === 15) && (y === 0 || y === 15)) c = null;
      b.set(x, y, c);
    }
    return b.canvas();
  };
  root.setProperty('--px-btn', url(button([64, 68, 52], [38, 41, 31], [124, 130, 98])));
  root.setProperty('--px-btn-hover', url(button([132, 44, 30], [78, 22, 16], [240, 140, 90], false, [255, 200, 90])));
  root.setProperty('--px-btn-down', url(button([96, 32, 22], [64, 18, 14], [200, 100, 60], true, [255, 180, 80])));
  root.setProperty('--px-btn-dis', url(button([46, 46, 42], [32, 32, 30], [70, 70, 64])));
  root.setProperty('--px-btn-green', url(button([60, 110, 50], [34, 70, 30], [130, 210, 110])));
  root.setProperty('--px-btn-red', url(button([150, 46, 36], [96, 24, 20], [230, 110, 90])));
  // ---------------- close button (pixel X) 18x18 ----------------
  const close = (bg, hi) => { const b = new PB(18, 18); for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) { const e = Math.min(x, y, 17 - x, 17 - y); let c = e === 0 ? [6, 7, 5] : e === 1 ? (x === 1 || y === 1 ? sh(bg, 0.35) : sh(bg, -0.45)) : bg; if (e === 0 && (x === 0 || x === 17) && (y === 0 || y === 17)) c = null; b.set(x, y, c); } for (let i = 0; i < 8; i++) { for (const [x, y] of [[5 + i, 5 + i], [12 - i, 5 + i]]) { b.set(x, y, hi); b.set(x + 1, y, hi); b.set(x, y + 1, sh(hi, -0.4)); } } return b.canvas(); };
  root.setProperty('--px-close', url(close([120, 36, 30], [240, 220, 200])));
  root.setProperty('--px-close-hover', url(close([190, 50, 40], [255, 255, 240])));
  // ---------------- scrollbar ----------------
  const track = new PB(12, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) track.set(x, y, x === 0 || x === 11 ? [8, 9, 7] : x === 1 ? [14, 15, 12] : (y % 4 === 0 && x === 6) ? [30, 32, 26] : [20, 22, 17]);
  root.setProperty('--px-scroll-track', url(track.canvas()));
  const thumb = (base) => { const b = new PB(12, 28); for (let y = 0; y < 28; y++) for (let x = 0; x < 12; x++) { const e = Math.min(x, y, 11 - x, 27 - y); let c = e === 0 ? [6, 7, 5] : e === 1 ? (x === 1 || y === 1 ? sh(base, 0.4) : sh(base, -0.45)) : base; if (e === 0 && (x === 0 || x === 11) && (y === 0 || y === 27)) c = null; if (e > 1 && x > 3 && x < 8 && (y === 4 || y === 6 || y === 21 || y === 23)) c = sh(base, -0.4); if (e > 1 && x > 3 && x < 8 && (y === 5 || y === 7 || y === 22 || y === 24)) c = sh(base, 0.25); if (e > 1 && x === 2) c = sh(base, 0.12); b.set(x, y, c); } return b.canvas(); };
  root.setProperty('--px-scroll-thumb', url(thumb([140, 110, 60])));
  root.setProperty('--px-scroll-thumb-hover', url(thumb([210, 150, 60])));
  // ---------------- slider ----------------
  const st = new PB(12, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) st.set(x, y, y === 0 || y === 7 ? [6, 7, 5] : y === 1 ? [10, 10, 8] : y === 6 ? [70, 74, 58] : [24, 26, 20]);
  root.setProperty('--px-slider-track', url(st.canvas()));
  const knob = new PB(12, 18); for (let y = 0; y < 18; y++) for (let x = 0; x < 12; x++) { const e = Math.min(x, y, 11 - x, 17 - y); let c = e === 0 ? [6, 7, 5] : e === 1 ? (x === 1 || y === 1 ? [255, 220, 130] : [120, 80, 20]) : (y > 6 && y < 11 && x > 3 && x < 8 ? [140, 100, 30] : [232, 176, 48]); if (e === 0 && (x === 0 || x === 11) && (y === 0 || y === 17)) c = null; knob.set(x, y, c); }
  root.setProperty('--px-slider-knob', url(knob.canvas()));
  // ---------------- checkbox ----------------
  const chk = (on) => { const b = new PB(14, 14); for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) { const e = Math.min(x, y, 13 - x, 13 - y); b.set(x, y, e === 0 ? [6, 7, 5] : e === 1 ? (x === 1 || y === 1 ? [10, 10, 8] : [80, 84, 66]) : [22, 24, 18]); } if (on) { const pts = [[3, 7], [4, 8], [5, 9], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6], [10, 5], [9, 6]]; for (const [x, y] of pts) { b.set(x, y, [120, 230, 90]); b.set(x, y - 1, [170, 255, 140]); } } return b.canvas(); };
  root.setProperty('--px-check', url(chk(false)));
  root.setProperty('--px-check-on', url(chk(true)));
  // ---------------- tab ----------------
  const tab = (on) => { const b = new PB(16, 12); for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) { const e = Math.min(x, y, 15 - x); let c = e === 0 ? [6, 7, 5] : e === 1 ? (x === 1 || y === 1 ? (on ? [232, 176, 80] : [100, 104, 80]) : [30, 32, 24]) : on ? [70, 56, 30] : [36, 38, 30]; if (e === 0 && (x === 0 || x === 15) && y === 0) c = null; b.set(x, y, c); } return b.canvas(); };
  root.setProperty('--px-tab', url(tab(false)));
  root.setProperty('--px-tab-on', url(tab(true)));
  // ---------------- divider & small icons ----------------
  const lock = new PB(10, 12); lock.rect(2, 0, 6, 1, [150, 150, 140]); lock.rect(1, 1, 1, 4, [150, 150, 140]); lock.rect(8, 1, 1, 4, [150, 150, 140]); lock.rect(0, 5, 10, 7, [200, 170, 70]); lock.rect(0, 5, 10, 1, [240, 210, 110]); lock.rect(4, 7, 2, 3, [60, 40, 10]);
  root.setProperty('--px-lock', url(TZ.outline(lock.canvas(), [10, 8, 6])));
  const arrow = new PB(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8 - Math.abs(y - 3.5) * 2; x++) arrow.set(x + 2, y, [232, 176, 48]);
  root.setProperty('--px-arrow', url(arrow.canvas()));
  const cursor = new PB(16, 16); const cpts = ['#.......', '##......', '#a#.....', '#aa#....', '#aaa#...', '#aaaa#..', '#aaaaa#.', '#aaaaaa#', '#aaa####', '#a#a#...', '##.#a#..', '#...#a#.', '.....##.'];
  cpts.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') cursor.set(x, y, [10, 8, 6]); if (ch === 'a') cursor.set(x, y, [240, 230, 210]); }));
  const cur2 = TZ.canvas(32, 32); cur2.g.imageSmoothingEnabled = false; cur2.g.drawImage(cursor.canvas(), 0, 0, 32, 32);
  root.setProperty('--px-cursor', `url(${cur2.toDataURL()}) 0 0, auto`);
};

// ---------------- touch-control icons & joystick art (12x12 glyphs, outlined) ----------------
const PAL = { a: [232, 226, 204], b: [150, 100, 56], c: [60, 62, 56], r: [214, 58, 46], g: [110, 200, 90], y: [240, 200, 70], w: [255, 255, 255] };
const GLYPHS = {
  bag: ['....cccc....', '...c....c...', '..bbbbbbbb..', '.bbaaaaaabb.', '.bbaaaaaabb.', '.bbbbbbbbbb.', '.bbbbyybbbb.', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '..bbbbbbbb..', '............'],
  craft: ['............', '..cccccccc..', '..caaaaaac..', '..cccccccc..', '.....bb.....', '.....bb.....', '.....bb.....', '.....bb.....', '.....bb.....', '.....bb.....', '.....bb.....', '............'],
  build: ['............', 'rrrrr.rrrrr.', 'rrrrr.rrrrr.', '............', 'rr.rrrrr.rrr', 'rr.rrrrr.rrr', '............', 'rrrrr.rrrrr.', 'rrrrr.rrrrr.', '............', 'rr.rrrrr.rrr', 'rr.rrrrr.rrr'],
  map: ['............', '.aaaaaaaaaa.', '.abbbbbbbba.', '.abggbbbbba.', '.abbggbbrba.', '.abbbgbrbba.', '.abbbbrbbba.', '.abbbrbrbba.', '.abbggbbbba.', '.abggbbbbba.', '.aaaaaaaaaa.', '............'],
  players: ['............', '...aa...bb..', '..aaaa.bbbb.', '..aaaa.bbbb.', '...aa...bb..', '............', '..aaaa.bbbb.', '.aaaaaabbbbb', '.aaaaaabbbbb', '.aaaaaabbbbb', '............', '............'],
  chat: ['............', '.aaaaaaaaaa.', 'aaaaaaaaaaaa', 'aaccaccaccaa', 'aaccaccaccaa', 'aaaaaaaaaaaa', '.aaaaaaaaaa.', '..aaa.......', '..aa........', '..a.........', '............', '............'],
  say: ['.yyyyyyyyyy.', 'yyyyyccyyyyy', 'yyyyyccyyyyy', 'yyyyyccyyyyy', 'yyyyyccyyyyy', 'yyyyyyyyyyyy', 'yyyyyccyyyyy', '.yyyyyyyyyy.', '...yyy......', '...yy.......', '...y........', '............'],
  pause: ['............', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '..aaa..aaa..', '............', '............'],
  reload: ['....y...y...', '...yyy.yyy..', '...yyy.yyy..', '...bbb.bbb..', '...bbb.bbb..', '...bbb.bbb..', '...bbb.bbb..', '...bbb.bbb..', '...bbb.bbb..', '...ccc.ccc..', '............', '............'],
  heal: ['............', '....cccc....', '...c....c...', '.aaaaaaaaaa.', '.aaaarraaaa.', '.aaaarraaaa.', '.arrrrrrrra.', '.arrrrrrrra.', '.aaaarraaaa.', '.aaaarraaaa.', '.aaaaaaaaaa.', '............'],
  light: ['............', '.........yy.', '......cyyyy.', '.ccccccyyyyy', '.cbbbbcyyyyy', '.cbbbbcyyyyy', '.ccccccyyyyy', '......cyyyy.', '.........yy.', '............', '............', '............'],
  team: ['............', '.c..........', '.crrrrrr....', '.crrrrrrr...', '.crrrrrrrr..', '.crrrrrr....', '.c..........', '.c..........', '.c..........', '.c..........', 'ccc.........', '............'],
  brake: ['....rrrr....', '..rrrrrrrr..', '.rrrrrrrrrr.', '.rrrrrrrrrr.', 'rrrrrrrrrrrr', 'rwwwwwwwwwwr', 'rwwwwwwwwwwr', 'rrrrrrrrrrrr', '.rrrrrrrrrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '....rrrr....'],
  horn: ['............', '......c.....', '.....cc..a..', '.cccccc...a.', '.cbbbbc.a.a.', '.cbbbbc.a.a.', '.cccccc...a.', '.....cc..a..', '......c.....', '............', '............', '............'],
  exit: ['.cccccc.....', '.cbbbbc.....', '.cbbbbc..g..', '.cbbbbc..gg.', '.cbbbygggggg', '.cbbbbc..gg.', '.cbbbbc..g..', '.cbbbbc.....', '.cccccc.....', '............', '............', '............'],
  demolish: ['rr........rr', 'rrr......rrr', '.rrr....rrr.', '..rrr..rrr..', '...rrrrrr...', '....rrrr....', '....rrrr....', '...rrrrrr...', '..rrr..rrr..', '.rrr....rrr.', 'rrr......rrr', 'rr........rr'],
  full: ['aaaa....aaaa', 'a..........a', 'a..........a', 'a..........a', '............', '............', '............', '............', 'a..........a', 'a..........a', 'a..........a', 'aaaa....aaaa'],
  hand: ['....aa......', '....aa......', '....aaaa....', '....aaaaaa..', '.aa.aaaaaaa.', '.aaaaaaaaaa.', '..aaaaaaaaa.', '..aaaaaaaa..', '...aaaaaaa..', '....aaaaa...', '....aaaaa...', '............'],
  run: ['.......aa...', '.......aa...', '.....aaaa...', '....a.aa.a..', '...a..aa..a.', '......aa....', '.....a..a...', '....a....a..', '...a......a.', '............', '............', '............'],
  ping: ['...rrrrrr...', '..rrrrrrrr..', '.rrrwwwwrrr.', '.rrwwwwwwrr.', '.rrwwwwwwrr.', '.rrrwwwwrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '.....rr.....', '............'],
  ok: ['............', '..........gg', '.........ggg', '........ggg.', '.......ggg..', 'gg....ggg...', 'ggg..ggg....', '.ggggggg....', '..ggggg.....', '...ggg......', '............', '............'],
  up: ['.....gg.....', '....gggg....', '...gggggg...', '..gggggggg..', '.gggggggggg.', '....gggg....', '....gggg....', '....gggg....', '....gggg....', '....gggg....', '............', '............'],
  down: ['............', '....rrrr....', '....rrrr....', '....rrrr....', '....rrrr....', '....rrrr....', '.rrrrrrrrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....rr.....', '............'],
  skull: ['............', '..aaaaaaaa..', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '.aaccaaccaa.', '.acccaaccca.', '.aaccaaccaa.', '..aaacaaaa..', '..aaaaaaaa..', '...a.aa.a...', '...aaaaaa...', '............'],
  trophy: ['.yyyyyyyyyy.', 'yyyyyyyyyyyy', 'y.yyyyyyyy.y', 'y.yyyyyyyy.y', '.yyyyyyyyyy.', '..yyyyyyyy..', '....yyyy....', '.....yy.....', '.....yy.....', '...bbbbbb...', '...bbbbbb...', '............'],
  gear: ['.....aa.....', '..aa.aa.aa..', '..aaaaaaaa..', '...aaccaa...', 'aaaac..caaaa', 'aaaac..caaaa', '...aaccaa...', '..aaaaaaaa..', '..aa.aa.aa..', '.....aa.....', '............', '............'],
  help: ['...yyyyyy...', '..yy....yy..', '..yy....yy..', '.......yy...', '......yy....', '.....yy.....', '.....yy.....', '............', '.....yy.....', '.....yy.....', '............', '............'],
  user: ['....aaaa....', '...aaaaaa...', '...aaaaaa...', '...aaaaaa...', '....aaaa....', '............', '..aaaaaaaa..', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '.aaaaaaaaaa.', '............', '............'],
  mic: ['....cccc....', '....caac....', '....caac....', '....caac....', '..c.caac.c..', '..c.cccc.c..', '...c....c...', '....cccc....', '.....cc.....', '...cccccc...', '............', '............'],
  globe: ['....gggg....', '..gggbbggg..', '.ggbbbbbggg.', '.gbbbggbbbg.', 'ggbbgggbbbgg', 'gbbbggbbbbbg', 'gbbbbbbbggbg', 'ggbbbbbgggbg', '.gggbbbggbg.', '.gggggbbbgg.', '..gggggggg..', '....gggg....'],
  close: ['............', '.rr......rr.', '.rrr....rrr.', '..rrr..rrr..', '...rrrrrr...', '....rrrr....', '....rrrr....', '...rrrrrr...', '..rrr..rrr..', '.rrr....rrr.', '.rr......rr.', '............'],
};
const OVR = { mic: { c: [170, 172, 184], a: [255, 255, 255] }, globe: { b: [70, 130, 200], g: [110, 190, 90] }, gear: { a: [196, 198, 206], c: [70, 72, 80] }, user: { a: [230, 200, 150] }, map: { b: [220, 200, 150] }, players: { a: [110, 190, 230], b: [232, 176, 80] }, chat: { c: [40, 40, 40] }, reload: { b: [210, 170, 80], y: [200, 120, 60] }, light: { b: [90, 90, 96] }, horn: { b: [150, 150, 160] }, run: { a: [232, 226, 204] } };
K.icons = {};
K.buildTouch = () => {
  for (const k in GLYPHS) {
    const b = new PB(14, 14), pal = Object.assign({}, PAL, OVR[k] || {});
    GLYPHS[k].forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) b.set(x + 1, y + 1, pal[ch]); }));
    const cv = b.canvas(); TZ.outline(cv, [10, 8, 6]);
    K.icons[k] = cv.toDataURL();
  }
  // joystick base: pixel ring with direction notches
  const R = 24, base = new PB(R * 2, R * 2);
  for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) {
    const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
    if (d > R - 0.5) continue;
    let c = null;
    if (d > R - 2) c = [8, 9, 7]; else if (d > R - 4) c = (y < R ? [150, 156, 120] : [70, 74, 58]); else if (d > R - 5) c = [8, 9, 7];
    else c = [26, 29, 22, 150];
    const ang = Math.atan2(y + 0.5 - R, x + 0.5 - R), q = Math.abs(((ang / (Math.PI / 2)) % 1 + 1) % 1 - 0.5);
    if (d > R - 9 && d < R - 6 && q > 0.46) c = [232, 176, 48];
    if (c) base.set(x, y, c, c[3] ?? 255);
  }
  K.stickBase = base.canvas().toDataURL();
  const r = 11, knob = new PB(r * 2, r * 2);
  for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
    const dx = x + 0.5 - r, dy = y + 0.5 - r, d = Math.hypot(dx, dy); if (d > r - 0.5) continue;
    let c = d > r - 1.5 ? [8, 9, 7] : (dx + dy < -6 ? [250, 220, 140] : dx + dy < 2 ? [232, 176, 48] : dx + dy < 8 ? [190, 130, 30] : [130, 86, 20]);
    if (d < 3 && d > 1.5) c = [120, 80, 20];
    knob.set(x, y, c);
  }
  K.stickKnob = knob.canvas().toDataURL();
  // square touch button (darker, translucent fill)
  const tb = (rim, fill) => { const b = new PB(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = Math.min(x, y, 15 - x, 15 - y); let c = e === 0 ? [6, 7, 5] : e === 1 ? (x === 1 || y === 1 ? rim : sh(rim, -0.55)) : e === 2 ? [10, 11, 8, 200] : fill; if (e === 0 && (x === 0 || x === 15) && (y === 0 || y === 15)) c = null; if (c) b.set(x, y, c, c[3] ?? 255); } return b.canvas(); };
  root.style.setProperty('--px-tbtn', url(tb([140, 146, 112], [30, 33, 26, 170])));
  root.style.setProperty('--px-tbtn-on', url(tb([240, 196, 90], [92, 66, 26, 200])));
  root.style.setProperty('--px-tbtn-red', url(tb([230, 110, 90], [96, 28, 22, 190])));
};
// ---------------- pixel logo: weathered letters with blood drips (drawn once the font is loaded) ----------------
K.logo = (text = 'ZOMBIES', px = 16, seed = 7) => {
  const w = text.length * px + 8, h = px + 22, c = TZ.canvas(w, h), g = c.g;
  g.font = `${px}px "Press Start 2P"`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(text, 4, 3);
  const src = g.getImageData(0, 0, w, h).data, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 110;
  const out = new PB(w + 4, h + 4), solid = new Uint8Array((w + 4) * (h + 4)); const S = (x, y) => solid[(y + 2) * (w + 4) + x + 2];
  const R = TZ.RNG(seed);
  let top = h, bot = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const put = (x, y, col) => { out.set(x + 2, y + 2, col); solid[(y + 2) * (w + 4) + x + 2] = 1; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const t = (y - top) / Math.max(1, bot - top);
    let col = t < 0.42 ? TZ.mix([246, 238, 214], [214, 200, 168], t / 0.42) : TZ.mix([196, 34, 24], [104, 10, 8], (t - 0.42) / 0.58);
    if (t > 0.38 && t < 0.5) col = [150, 20, 14]; // the blood line
    if (!on(x, y - 1)) col = TZ.shade(col, 0.22);
    if (H(x, y, seed) < 0.05 && on(x + 1, y) && on(x - 1, y) && on(x, y + 1) && on(x, y - 1)) col = TZ.shade(col, -0.45); // scratches
    put(x, y, col);
  }
  // drips from the bottom edges of the letters
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) {
    if (!on(x, y)) continue; if (on(x, y + 1) || R() > 0.16) break;
    const len = 2 + (R() * R() * 14 | 0); let yy = y + 1;
    for (let k = 0; k < len && yy < h + 1; k++, yy++) put(x, yy, k > len - 2 ? [210, 40, 30] : [140, 14, 10]);
    if (len > 6 && x + 1 < w) { put(x + 1, yy - 2, [120, 10, 8]); put(x, yy, [200, 36, 28]); put(x + 1, yy - 1, [170, 24, 18]); }
    break;
  }
  // outline + hard shadow
  const W2 = w + 4, H2 = h + 4, res = TZ.canvas(W2 + 3, H2 + 3), rg = res.g;
  const base = out.canvas(); const id = rg.createImageData(W2 + 3, H2 + 3), d = id.data;
  const at = (x, y) => x >= 0 && y >= 0 && x < W2 && y < H2 && solid[y * W2 + x];
  for (let y = 0; y < H2 + 3; y++) for (let x = 0; x < W2 + 3; x++) {
    const k = (y * (W2 + 3) + x) * 4;
    if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) || at(x - 1, y - 1) || at(x + 1, y + 1))) { d[k] = 8; d[k + 1] = 4; d[k + 2] = 4; d[k + 3] = 255; }
    else if (!at(x, y) && (at(x - 3, y - 3) || at(x - 2, y - 3) || at(x - 3, y - 2))) { d[k] = 0; d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = 170; }
  }
  rg.putImageData(id, 0, 0); rg.drawImage(base, 0, 0);
  return res;
};
const root = document.documentElement;
})();
