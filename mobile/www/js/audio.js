// =====================================================================
//  THE ZOMBIES 2.0 — audio: Kenney CC0 samples + layered synthesis
// =====================================================================
'use strict';
(() => {
const AU = TZ.audio = {
  ctx: null, ok: false, musicMode: null, tension: 0, last: {}, buf: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.comp = C.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 4; this.comp.connect(C.destination);
      this.master = C.createGain(); this.master.connect(this.comp);
      this.sfx = C.createGain(); this.sfx.connect(this.master);
      this.ui = C.createGain(); this.ui.connect(this.master);
      this.mus = C.createGain(); this.mus.connect(this.master);
      this.amb = C.createGain(); this.amb.connect(this.master);
      this.voice = C.createGain(); this.voice.connect(this.master); this.voice.gain.value = TZ.settings.voicevol ?? 1;
      this.verb = C.createConvolver(); this.verb.buffer = this.impulse(2.4); this.verbGain = C.createGain(); this.verbGain.gain.value = 0.28; this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
      this.noise = this.makeNoise(2, false); this.brown = this.makeNoise(4, true);
      this.applyVolumes(); this.startLoops(); this.ok = true; this.musicLoop(); this.loadSamples();
    } catch (e) { console.warn('audio fail', e); }
  },
  loadSamples() {
    const D = TZ.SOUND_DATA || {};
    for (const name in D) {
      this.buf[name] = [];
      D[name].forEach((b64, i) => {
        const bin = atob(b64), arr = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        this.ctx.decodeAudioData(arr.buffer).then(b => { this.buf[name][i] = b; }).catch(() => { });
      });
    }
  },
  applyVolumes() { if (!this.ctx) return; const S = TZ.settings; this.master.gain.value = S.master; this.sfx.gain.value = S.sfx; this.ui.gain.value = (S.uivol ?? 0.8); this.mus.gain.value = S.music * 0.55; this.amb.gain.value = (S.amb ?? 0.8); if (this.voice) this.voice.gain.value = (S.voicevol ?? 1); },
  makeNoise(sec, brown) { const C = this.ctx, b = C.createBuffer(1, C.sampleRate * sec, C.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; },
  impulse(sec) { const C = this.ctx, b = C.createBuffer(2, C.sampleRate * sec, C.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); } return b; },
  env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); },
  nz(t, dur, vol, ftype, f0, f1, q = 1, dest, verb = 0, a = 0.003) {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = C.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
    const g = C.createGain(); this.env(g, t, a, vol, dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); if (verb) { const vg = C.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + a + 0.05);
  },
  osc(t, dur, vol, type, f0, f1, dest, a = 0.005, verb = 0) {
    const C = this.ctx, o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = C.createGain(); this.env(g, t, a, vol, dur);
    o.connect(g); g.connect(dest || this.sfx); if (verb) { const vg = C.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    o.start(t); o.stop(t + a + dur + 0.05); return o;
  },
  sample(name, vol = 1, rate = 1, dest, verb = 0, when = 0) {
    const arr = this.buf[name]; if (!arr || !arr.length) return false;
    const b = arr[(Math.random() * arr.length) | 0]; if (!b) return false;
    const C = this.ctx, s = C.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    const g = C.createGain(); g.gain.value = vol; s.connect(g); g.connect(dest || this.sfx);
    if (verb) { const vg = C.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    s.start(C.currentTime + when); return true;
  },
  throttle(k, ms) { const n = performance.now(); if (this.last[k] && n - this.last[k] < ms) return true; this.last[k] = n; return false; },
  // ---------------- guns: transient + body + thump + tail ----------------
  shot(kind, vol = 1) {
    if (!this.ok || vol <= 0.01) return; const t = this.ctx.currentTime, v = vol;
    const layer = (click, body, bodyF, low, lowF, tail, tailF, verb) => {
      this.nz(t, 0.012, click * v, 'highpass', 4500, null, 0.7);
      this.nz(t, body[1], body[0] * v, 'bandpass', bodyF[0], bodyF[1], 0.9, null, verb * 0.5, 0.001);
      this.osc(t, low[1], low[0] * v, 'sine', lowF[0], lowF[1], null, 0.002);
      this.nz(t + 0.01, tail[1], tail[0] * v, 'lowpass', tailF[0], tailF[1], 0.6, null, verb, 0.01);
    };
    switch (kind) {
      case 'pistol': layer(0.7, [0.9, 0.09], [2400, 700], [0.8, 0.14], [190, 45], [0.35, 0.35], [2200, 260], 0.35); break;
      case 'revolver': layer(0.9, [1.1, 0.13], [1800, 500], [1.1, 0.2], [150, 38], [0.5, 0.6], [1800, 200], 0.55); break;
      case 'smg': layer(0.5, [0.7, 0.06], [2800, 900], [0.55, 0.08], [220, 60], [0.22, 0.2], [2600, 400], 0.2); break;
      case 'shotgun': layer(1.0, [1.3, 0.16], [1500, 300], [1.3, 0.26], [120, 32], [0.7, 0.75], [1600, 160], 0.6); setTimeout(() => this.pump(v), 380); break;
      case 'rifle': layer(0.8, [0.9, 0.08], [3000, 800], [0.7, 0.12], [170, 50], [0.32, 0.28], [2600, 300], 0.3); break;
      case 'sniper': layer(1.0, [1.2, 0.14], [2600, 400], [1.2, 0.3], [130, 30], [0.75, 1.1], [2400, 140], 0.8); break;
      case 'turret': layer(0.4, [0.5, 0.06], [3000, 1100], [0.35, 0.06], [260, 90], [0.15, 0.15], [3000, 600], 0.15); break;
      case 'crossbow': this.osc(t, 0.12, 0.35 * v, 'triangle', 220, 120); this.nz(t, 0.05, 0.25 * v, 'bandpass', 1800, 900, 3); break;
      case 'nailgun': this.nz(t, 0.03, 0.4 * v, 'bandpass', 3200, 1600, 2); this.osc(t, 0.05, 0.25 * v, 'square', 520, 180); break;
      case 'gl': this.osc(t, 0.18, 0.6 * v, 'sine', 160, 50); this.nz(t, 0.12, 0.5 * v, 'lowpass', 1400, 200, 1, null, 0.2); break;
      case 'flamer': if (!this.throttle('flame', 90)) this.nz(t, 0.18, 0.28 * v, 'bandpass', 600, 1400, 0.7, null, 0, 0.02); break;
    }
  },
  pump(v) { if (!this.ok) return; this.sample('metal_click', 0.6 * v, 0.8) || this.nz(this.ctx.currentTime, 0.06, 0.4 * v, 'bandpass', 1800, 900, 3); setTimeout(() => this.sample('latch', 0.5 * v, 1.1), 120); },
  reload(wid) { if (!this.ok) return; this.sample('metal_click', 0.6, 1); setTimeout(() => this.sample('latch', 0.6, wid === 'pistol' ? 1.3 : 1), wid === 'pistol' ? 350 : 600); },
  step(ground) {
    if (!this.ok) return;
    const TL = TZ.TILE;
    const surf = ground === TL.SNOW || ground === TL.SNOW2 || ground === TL.ICE ? 'snow' : ground === TL.WOOD ? 'wood' : ground === TL.CARPET ? 'carpet' : TZ.isRoad(ground) || ground === TL.CONCRETE || ground === TL.TILES || ground === TL.GRAVEL ? 'concrete' : 'grass';
    if (ground === TL.SHALLOW || ground === TL.MUD) { this.nz(this.ctx.currentTime, 0.12, 0.12, 'lowpass', 900, 300, 1.4); return; }
    this.sample('step_' + surf, 0.32) || this.nz(this.ctx.currentTime, 0.06, 0.08, 'lowpass', 900, 300);
  },
  groan(type, vol = 1) {
    if (!this.ok || vol < 0.05 || this.throttle('groan', 240)) return;
    const C = this.ctx, t = C.currentTime;
    const base = { brute: 55, boss: 36, runner: 150, spitter: 90, frozen: 70, screamer: 200, soldier: 80, exploder: 95 }[type] || 75 + Math.random() * 40;
    const dur = 0.7 + Math.random() * 0.8;
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(base * 1.25, t); o.frequency.linearRampToValueAtTime(base * (0.75 + Math.random() * 0.3), t + dur);
    const sub = C.createOscillator(); sub.type = 'square'; sub.frequency.setValueAtTime(base * 0.62, t); sub.frequency.linearRampToValueAtTime(base * 0.5, t + dur);
    const lfo = C.createOscillator(); lfo.frequency.value = 5 + Math.random() * 6; const lg = C.createGain(); lg.gain.value = base * 0.08; lfo.connect(lg); lg.connect(o.frequency);
    const f1 = C.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.setValueAtTime(400 + Math.random() * 200, t); f1.frequency.linearRampToValueAtTime(600 + Math.random() * 300, t + dur); f1.Q.value = 6;
    const f2 = C.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1000 + Math.random() * 400; f2.Q.value = 7;
    const g = C.createGain(); this.env(g, t, 0.12, 0.3 * vol * (type === 'boss' ? 2 : 1), dur);
    const sg = C.createGain(); sg.gain.value = 0.25; sub.connect(sg); sg.connect(f1);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.sfx);
    const vg = C.createGain(); vg.gain.value = 0.3; g.connect(vg); vg.connect(this.verb);
    o.start(t); sub.start(t); lfo.start(t); o.stop(t + dur + 0.2); sub.stop(t + dur + 0.2); lfo.stop(t + dur + 0.2);
    this.nz(t, dur * 0.8, 0.05 * vol, 'bandpass', 1400, 600, 2);
  },
  zdie(type, vol = 1) { if (!this.ok || vol < 0.03) return; const t = this.ctx.currentTime; this.groan(type, vol * 0.8); this.sample('flesh', 0.6 * vol, 0.85) || this.nz(t, 0.25, 0.45 * vol, 'lowpass', 900, 120, 1); this.osc(t, 0.2, 0.3 * vol, 'sine', 90, 35); },
  // ---------------- named sounds ----------------
  play(name, vol = 1) {
    if (!this.ok || vol <= 0.02) return; const t = this.ctx.currentTime, v = vol;
    switch (name) {
      case 'swing': this.nz(t, 0.14, 0.3 * v, 'bandpass', 700, 3000, 2); break;
      case 'swing_heavy': this.nz(t, 0.22, 0.38 * v, 'bandpass', 400, 2000, 2); break;
      case 'chainsaw': if (!this.throttle('saw', 120)) { this.osc(t, 0.3, 0.12 * v, 'sawtooth', 110, 130); this.osc(t, 0.3, 0.08 * v, 'square', 220, 240); } break;
      case 'hit_flesh': this.sample('flesh', 0.7 * v) ; this.sample('punch', 0.5 * v, 0.8); break;
      case 'slash': this.sample('slash', 0.8 * v) || this.nz(t, 0.1, 0.4 * v, 'highpass', 2000); this.sample('flesh', 0.4 * v, 1.2); break;
      case 'zombie_hit': this.sample('punch', 0.6 * v, 0.7) || this.nz(t, 0.1, 0.45 * v, 'lowpass', 900, 200); break;
      case 'chop': this.sample('chop', 0.8 * v) || this.osc(t, 0.12, 0.5 * v, 'triangle', 240, 140); break;
      case 'mine': this.sample('mine', 0.7 * v) || this.osc(t, 0.25, 0.25 * v, 'triangle', 1100, 900); break;
      case 'tree_fall': this.sample('creak', 0.8 * v, 0.7); setTimeout(() => { if (this.ok) { this.nz(this.ctx.currentTime, 0.9, 0.5 * v, 'lowpass', 1500, 80, 1, null, 0.5); this.osc(this.ctx.currentTime, 0.5, 0.5 * v, 'sine', 70, 30); } }, 500); break;
      case 'hit_wood': if (this.throttle('hw', 70)) return; this.sample('hit_wood', 0.55 * v) || this.osc(t, 0.1, 0.4 * v, 'triangle', 180, 90); break;
      case 'hit_metal': if (this.throttle('hm', 70)) return; this.sample('hit_metal', 0.5 * v) || this.osc(t, 0.3, 0.2 * v, 'square', 420, 380); break;
      case 'hit_stone': if (this.throttle('hs', 70)) return; this.sample('hit_stone', 0.5 * v); break;
      case 'break': this.sample('plank', 0.8 * v, 0.7); this.nz(t, 0.5, 0.6 * v, 'lowpass', 2500, 100, 1, null, 0.4); break;
      case 'build': this.sample('plank', 0.6, 1.1) || this.osc(t, 0.07, 0.35, 'triangle', 300, 150); setTimeout(() => this.sample('plank', 0.5, 1.2), 120); break;
      case 'pickup': this.sample('pickup', 0.7) || this.osc(t, 0.08, 0.15, 'sine', 660); this.osc(t + 0.04, 0.1, 0.06, 'sine', 990); break;
      case 'equip': this.sample('belt', 0.6) || this.nz(t, 0.06, 0.25, 'bandpass', 2000, 1200, 3); break;
      case 'cloth': this.sample('cloth', 0.6); break;
      case 'ui': this.sample('ui_click', 0.5, 1, this.ui) || this.osc(t, 0.05, 0.12, 'square', 880, 660, this.ui); break;
      case 'ui_hover': if (this.throttle('hov', 60)) return; this.sample('ui_hover', 0.25, 1, this.ui); break;
      case 'ui_open': this.sample('ui_open', 0.5, 1, this.ui); break;
      case 'ui_close': this.sample('ui_close', 0.5, 1, this.ui); break;
      case 'switch': this.sample('ui_switch', 0.5, 1, this.ui); break;
      case 'error': this.sample('ui_error', 0.5, 1, this.ui) || this.osc(t, 0.15, 0.15, 'square', 140, 120, this.ui); break;
      case 'quest': this.sample('ui_confirm', 0.6, 1, this.ui); [523, 659, 784].forEach((f, i) => this.osc(t + i * 0.09, 0.4, 0.1, 'triangle', f, null, this.ui, 0.01, 0.4)); break;
      case 'craft': this.sample('pot', 0.5) ; this.sample('latch', 0.4, 1.2, null, 0, 0.15); break;
      case 'hurt': this.sample('punch', 0.6, 0.9); this.osc(t, 0.18, 0.25, 'sawtooth', 180, 110); break;
      case 'eat': for (let i = 0; i < 3; i++) this.nz(t + i * 0.12, 0.07, 0.25, 'bandpass', 900 + Math.random() * 400, 500, 3); break;
      case 'drink': for (let i = 0; i < 3; i++) this.osc(t + i * 0.14, 0.09, 0.15, 'sine', 300 + i * 40, 500); break;
      case 'bandage': this.sample('cloth', 0.7, 1.1); this.sample('cloth', 0.5, 0.9, null, 0, 0.2); break;
      case 'search': this.sample('cloth', 0.5); this.sample('book', 0.4, 1, null, 0, 0.25); break;
      case 'empty': this.sample('ui_back', 0.4, 1, this.ui); break;
      case 'glass': this.sample('glass', 0.9 * v) || this.nz(t, 0.3, 0.6 * v, 'highpass', 3000, 6000); break;
      case 'clank': this.sample('tin', 0.6 * v); break;
      case 'fire_whoosh': this.nz(t, 0.8, 0.6 * v, 'lowpass', 300, 2000, 1, null, 0.3); break;
      case 'spit': this.nz(t, 0.18, 0.4 * v, 'bandpass', 600, 1400, 3); break;
      case 'acid_hit': this.nz(t, 0.4, 0.4 * v, 'highpass', 2000, 5000, 1); break;
      case 'explosion': this.nz(t, 1.6, 1.4 * v, 'lowpass', 2000, 60, 0.7, null, 0.9, 0.004); this.osc(t, 0.6, 1.2 * v, 'sine', 80, 25); this.nz(t, 0.04, 0.9 * v, 'highpass', 2500); this.sample('plate', 0.5 * v, 0.6); break;
      case 'crash': this.sample('plate', 0.9 * v, 0.8); this.sample('glass', 0.4 * v, 1); this.nz(t, 0.3, 0.6 * v, 'lowpass', 1500, 200); break;
      case 'car_hit': if (this.throttle('ch', 60)) return; this.sample('flesh', 0.7 * v, 0.7); this.sample('plate', 0.3 * v, 1.2); break;
      case 'carhorn': [392, 494].forEach(f => this.osc(t, 0.45, 0.16 * v, 'square', f, f, null, 0.01)); break;
      case 'door': this.sample('door_close', 0.6); break;
      case 'unlock': this.sample('latch', 0.7); this.sample('ui_confirm', 0.4, 1, this.ui, 0, 0.1); break;
      case 'gate': this.sample('creak', 0.5 * v, 1.2); break;
      case 'reload_end': this.sample('metal_click', 0.6, 1.2); break;
      case 'dry': this.sample('metal_click', 0.4, 1.6) || this.nz(t, 0.03, 0.3, 'bandpass', 3500, 2500, 6); break;
      case 'repair': this.sample('latch', 0.6 * v); this.sample('hit_metal', 0.4 * v, 1.2, null, 0, 0.2); break;
      case 'fuel': for (let i = 0; i < 6; i++) this.osc(t + i * 0.09, 0.08, 0.12 * v, 'sine', 180 + Math.random() * 80, 260); break;
      case 'starter_fail': for (let i = 0; i < 3; i++) { this.osc(t + i * 0.18, 0.12, 0.2, 'sawtooth', 70, 50); this.nz(t + i * 0.18, 0.1, 0.15, 'bandpass', 600, 300, 2); } break;
      case 'scream': { const C = this.ctx; for (const f of [520, 780]) this.osc(t, 1.4, 0.18 * v, 'sawtooth', f * 1.2, f * 0.8, null, 0.05, 0.6); this.nz(t, 1.2, 0.2 * v, 'bandpass', 2400, 1400, 2, null, 0.5); break; }
      case 'wolf_bite': this.osc(t, 0.25, 0.3 * v, 'sawtooth', 160, 90); this.sample('flesh', 0.5 * v, 1.2); break;
      case 'bear_hit': this.osc(t, 0.5, 0.45 * v, 'sawtooth', 70, 45, null, 0.02, 0.3); this.sample('punch', 0.7 * v, 0.6); break;
      case 'detect': this.osc(t, 0.06, 0.18 * v, 'sine', 1300 + v * 900, 1300 + v * 900); break;
      case 'beep': this.osc(t, 0.08, 0.2 * v, 'square', 1800, 1800); break;
      case 'splash': this.nz(t, 0.35, 0.35 * v, 'bandpass', 1400, 500, 1.5); this.nz(t + 0.05, 0.25, 0.2 * v, 'highpass', 3000, 2000); break;
      case 'decoy': this.osc(t, 0.07, 0.16 * v, 'square', 2200, 2200); this.osc(t + 0.12, 0.07, 0.16 * v, 'square', 1700, 1700); break;
      case 'flare': this.nz(t, 0.6, 0.3 * v, 'bandpass', 1800, 600, 1); this.osc(t, 0.5, 0.08 * v, 'sawtooth', 300, 900); break;
      case 'trap': this.osc(t, 0.05, 0.5 * v, 'square', 220, 90); this.nz(t, 0.12, 0.4 * v, 'highpass', 2500, 1200); break;
      case 'bark': this.osc(t, 0.09, 0.3 * v, 'sawtooth', 420, 260); this.osc(t + 0.14, 0.08, 0.25 * v, 'sawtooth', 460, 280); break;
      case 'boss_roar': for (const f of [42, 63, 85]) this.osc(t, 2.4, 0.35, 'sawtooth', f * 1.3, f, null, 0.3, 0.6); this.nz(t, 2.2, 0.4, 'lowpass', 800, 150, 1, null, 0.6); break;
      case 'horn': for (const f of [69, 103.5, 138]) this.osc(t, 3.5, 0.18, 'sawtooth', f, f * 0.94, null, 0.8, 0.8); this.nz(t, 3, 0.1, 'lowpass', 400, 200, 1, null, 0.6); break;
      case 'dawn': [392, 494, 587, 740].forEach((f, i) => this.osc(t + i * 0.25, 2.2, 0.08, 'sine', f, null, null, 0.3, 0.6)); break;
      case 'death': for (const f of [110, 104, 98]) this.osc(t, 3, 0.2, 'sawtooth', f, f * 0.5, null, 0.1, 0.8); break;
      case 'ally_die': this.osc(t, 1.2, 0.15, 'triangle', 330, 220, null, 0.05, 0.5); break;
      case 'save': this.sample('ui_confirm', 0.5, 1, this.ui); break;
      case 'radio': for (let i = 0; i < 6; i++) this.osc(t + i * 0.16, 0.08, 0.1, 'square', 1200, 1200); this.nz(t, 1.6, 0.18, 'bandpass', 2000, 2000, 0.8); break;
      case 'plane': this.osc(t, 7, 0.25, 'sawtooth', 120, 80, null, 2.5, 0.5); this.nz(t, 7, 0.2, 'lowpass', 300, 200, 1, null, 0.4); break;
      case 'heli': for (let i = 0; i < 70; i++) this.nz(t + i * 0.085, 0.07, 0.35 * Math.min(1, i / 20), 'lowpass', 500, 150, 1); break;
      case 'achievement': [523, 659, 784, 1047].forEach((f, i) => this.osc(t + i * 0.08, 0.5, 0.1, 'square', f, null, this.ui, 0.01, 0.3)); break;
      case 'chat': this.sample('ui_tick', 0.4, 1, this.ui); break;
      case 'radio_on': this.nz(t, 0.09, 0.12 * v, 'bandpass', 2400, 1200, 1.5, this.ui); this.osc(t, 0.04, 0.06 * v, 'square', 1400, 1400, this.ui); break;
    }
  },
  // ---------------- loops ----------------
  startLoops() {
    const C = this.ctx;
    const loop = (buf, ftype, freq, q) => { const s = C.createBufferSource(); s.buffer = buf; s.loop = true; const f = C.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q; const g = C.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.amb); s.start(); return { s, f, g }; };
    this.rainL = loop(this.noise, 'lowpass', 2500, 0.5);
    this.windL = loop(this.brown, 'lowpass', 500, 0.7); this.windL.g.gain.value = 0.15;
    this.fireL = loop(this.noise, 'bandpass', 1800, 0.8); this.fireLevel = 0;
    // engine voice
    const eo = C.createOscillator(); eo.type = 'sawtooth'; eo.frequency.value = 40;
    const eo2 = C.createOscillator(); eo2.type = 'square'; eo2.frequency.value = 20;
    const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 400; ef.Q.value = 2;
    const eg = C.createGain(); eg.gain.value = 0; const e2g = C.createGain(); e2g.gain.value = 0.5;
    eo.connect(ef); eo2.connect(e2g); e2g.connect(ef); ef.connect(eg); eg.connect(this.sfx); eo.start(); eo2.start();
    this.eng = { o: eo, o2: eo2, f: ef, g: eg };
    setInterval(() => { // crackle, birds, crickets
      if (!this.ok) return; const t = C.currentTime;
      if (this.fireLevel > 0.05) for (let i = 0; i < 3; i++) if (Math.random() < 0.6) this.nz(t + Math.random() * 0.25, 0.02, 0.25 * this.fireLevel, 'highpass', 2000 + Math.random() * 3000, null, 1, this.amb);
      const G = TZ.game; if (!G || G.demo) return;
      const night = G.isNight(), b = G.world.biomeAt(G.me.x, G.me.y);
      if (!night && (b === 0 || b === 1) && Math.random() < 0.08) { const f = 2400 + Math.random() * 1600; for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) this.osc(t + i * 0.09, 0.06, 0.03, 'sine', f, f * (1.1 + Math.random() * 0.2), this.amb); }
      if (night && b !== 2 && Math.random() < 0.15) for (let i = 0; i < 4; i++) this.osc(t + i * 0.05, 0.03, 0.015, 'square', 4200, 4400, this.amb);
      if (b === 3 && Math.random() < 0.06) { this.osc(t, 0.18, 0.06, 'sawtooth', 120, 80, this.amb); this.osc(t + 0.22, 0.18, 0.05, 'sawtooth', 110, 75, this.amb); }
    }, 250);
    setInterval(() => { if (this.ok) this.windL.f.frequency.setTargetAtTime(300 + Math.random() * 500 + (this.windAmt || 0) * 400, C.currentTime, 2); }, 3000);
  },
  engine(rpm, kind) {
    if (!this.ok) return; const t = this.ctx.currentTime, E = this.eng;
    if (rpm < 0) { E.g.gain.setTargetAtTime(0, t, 0.15); return; }
    const base = kind === 'snowmobile' || kind === 'buggy' ? 46 : kind === 'uaz' || kind === 'pickup' ? 30 : 36;
    const f = base + rpm * base * 2.4;
    E.o.frequency.setTargetAtTime(f, t, 0.08); E.o2.frequency.setTargetAtTime(f / 2, t, 0.08);
    E.f.frequency.setTargetAtTime(300 + rpm * 900, t, 0.1); E.g.gain.setTargetAtTime(0.06 + rpm * 0.1, t, 0.1);
  },
  setRain(r) { if (this.ok) this.rainL.g.gain.setTargetAtTime(r * 0.35, this.ctx.currentTime, 0.5); },
  setWind(w) { this.windAmt = w; if (this.ok) this.windL.g.gain.setTargetAtTime(0.1 + w * 0.3, this.ctx.currentTime, 1); },
  setFire(v) { if (!this.ok) return; this.fireLevel = v; this.fireL.g.gain.setTargetAtTime(v * 0.05, this.ctx.currentTime, 0.3); },
  setTension(v) { this.tension = v; },
  setMusic(mode) { this.musicMode = mode; },
  musicLoop() {
    const C = this.ctx; let nextBar = C.currentTime + 0.5, bar = 0;
    const chords = { menu: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], day: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 55, 59]], dusk: [[57, 60, 63], [56, 59, 62], [53, 56, 60], [52, 56, 59]], night: [[45, 48, 51], [44, 47, 50], [45, 48, 51], [41, 44, 48]], death: [[45, 48, 52], [41, 45, 48], [40, 44, 47], [45, 48, 52]] };
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const pad = (t, notes, dur, vol, bright) => { for (const n of notes) { const o = C.createOscillator(), o2 = C.createOscillator(); o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = mtof(n); o2.frequency.value = mtof(n) * 1.004; const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(bright * 0.6, t); f.frequency.linearRampToValueAtTime(bright, t + dur / 2); f.frequency.linearRampToValueAtTime(bright * 0.5, t + dur); const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur); o.connect(f); o2.connect(f); f.connect(g); g.connect(this.mus); const vg = C.createGain(); vg.gain.value = 0.5; g.connect(vg); vg.connect(this.verb); o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); } };
    const pluck = (t, n, vol) => { const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n); const g = C.createGain(); this.env(g, t, 0.005, vol, 1.6); o.connect(g); g.connect(this.mus); const vg = C.createGain(); vg.gain.value = 0.7; g.connect(vg); vg.connect(this.verb); o.start(t); o.stop(t + 1.8); };
    const beat = (t, vol) => { this.osc(t, 0.18, vol, 'sine', 70, 35, this.mus); this.osc(t + 0.2, 0.15, vol * 0.7, 'sine', 65, 35, this.mus); };
    const tick = () => {
      if (!this.ok) return;
      const mode = this.musicMode || 'menu';
      while (nextBar < C.currentTime + 1.0) {
        const ch = chords[mode] || chords.day, c = ch[bar % ch.length], barLen = mode === 'night' ? 4 : 5.2, t = nextBar;
        const bright = mode === 'night' ? 500 + this.tension * 900 : mode === 'menu' ? 900 : 1100;
        pad(t, c.map(n => n - 12), barLen, mode === 'night' ? 0.05 : 0.04, bright);
        if (mode === 'day' || mode === 'menu' || mode === 'dusk') { const sc = [0, 3, 5, 7, 10, 12]; for (let i = 0; i < 4; i++) if (Math.random() < 0.55) pluck(t + i * barLen / 4 + Math.random() * 0.2, c[0] + 12 + sc[(Math.random() * sc.length) | 0], 0.05); }
        if (mode === 'night') { const bpm = 1.2 + this.tension * 0.8; for (let i = 0; i < barLen * bpm; i++) beat(t + i / bpm, 0.12 + this.tension * 0.18); if (this.tension > 0.4) for (let i = 0; i < 8; i++) this.nz(t + i * barLen / 8, 0.05, 0.03 * this.tension, 'highpass', 6000, null, 1, this.mus); if (Math.random() < 0.4) pluck(t + Math.random() * 2, c[0] + 24 + (Math.random() < .5 ? 1 : 6), 0.03); }
        nextBar += barLen; bar++;
      }
    };
    setInterval(tick, 300);
  },
};
})();
