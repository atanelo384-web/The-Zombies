// =====================================================================
//  THE ZOMBIES 4.0 — voice chat
//  WebRTC mesh between all players of a session. Signalling goes through
//  the game connection (client -> host -> client), audio goes peer-to-peer.
//  • Proximity: you hear players within ~25 tiles, quieter with distance
//    and panned to the side they stand on.
//  • Walkie-talkie item: players who both carry one hear each other at any
//    distance, with a radio filter.
//  • Push-to-talk (default Z) or open mic with a voice-activity gate.
//  Microphone access needs a secure page (desktop app, phone app,
//  localhost or https). Phones that opened the game by an http:// LAN link
//  can still hear everybody; they just cannot talk.
// =====================================================================
'use strict';
(() => {
const $ = s => document.querySelector(s);
const RANGE = 25;
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const V = TZ.Voice = {
  peers: new Map(), // pid -> { pc, tr, audio, src, gD, gR, pan, talk, radio, level }
  mic: null, micTrack: null, micErr: '', talking: false, radio: false, level: 0, hang: 0, syncT: 0, testing: false,
  get canMic() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && (window.isSecureContext !== false); },
  get mode() { return TZ.settings.voiceMode || 'ptt'; },
};

// ---------------------------------------------------------------- microphone
V.startMic = async () => {
  if (V.mic || V._starting) return !!V.mic;
  if (!V.canMic) { V.micErr = 'Микрофон доступен только в приложении (ПК/телефон) или по https. По http-ссылке вы слышите других, но не говорите.'; return false; }
  V._starting = true;
  try {
    TZ.audio.init();
    const A = TZ.audio, C = A.ctx; if (!C) throw new Error('нет звука');
    const dev = TZ.settings.micDev;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: dev ? { exact: dev } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const src = C.createMediaStreamSource(stream), gain = C.createGain(), an = C.createAnalyser(), dst = C.createMediaStreamDestination();
    gain.gain.value = TZ.settings.micGain ?? 1; an.fftSize = 512;
    src.connect(gain); gain.connect(an); gain.connect(dst);
    V.mic = { stream, src, gain, an, dst, buf: new Float32Array(512) };
    V.micTrack = dst.stream.getAudioTracks()[0]; V.micTrack.enabled = false;
    for (const p of V.peers.values()) V.attachTrack(p);
    V.micErr = ''; V.listMics();
    return true;
  } catch (e) {
    V.micErr = e && e.name === 'NotAllowedError' ? 'Доступ к микрофону запрещён. Разрешите его в настройках браузера или телефона.' : e && e.name === 'NotFoundError' ? 'Микрофон не найден.' : 'Микрофон недоступен: ' + (e && e.message || e);
    return false;
  } finally { V._starting = false; }
};
V.stopMic = () => {
  if (!V.mic) return;
  try { V.mic.stream.getTracks().forEach(t => t.stop()); V.mic.src.disconnect(); V.mic.gain.disconnect(); } catch (e) { }
  V.mic = null; V.micTrack = null;
  for (const p of V.peers.values()) { try { p.tr && p.tr.sender.replaceTrack(null); } catch (e) { } }
  V.setTalking(false);
};
V.listMics = async () => {
  const sel = $('#micSel'); if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const cur = TZ.settings.micDev || '';
    sel.innerHTML = '<option value="">По умолчанию</option>' + devs.filter(d => d.deviceId && d.deviceId !== 'default').map((d, i) => `<option value="${TZ.esc(d.deviceId)}">${TZ.esc(d.label || 'Микрофон ' + (i + 1))}</option>`).join('');
    sel.value = cur; if (sel.value !== cur) sel.value = '';
  } catch (e) { }
  const note = $('#voiceNote'); if (note && !V.canMic) note.innerHTML = '<span class="warn">Здесь микрофон недоступен</span>: игра открыта по http-ссылке. Вы слышите других игроков, но говорить можно только из приложения для ПК/телефона или по https.';
};
V.applySettings = (k) => {
  if (k === 'micGain' && V.mic) V.mic.gain.gain.value = TZ.settings.micGain;
  if (k === 'micDev' && V.mic) { V.stopMic(); V.startMic(); }
  if (k === 'voiceMode' && V.mode === 'off') V.stopMic();
};
// settings → "check microphone": live level meter for 8 seconds
V.test = async () => {
  if (!(await V.startMic())) { TZ.app.alert(V.micErr || 'Микрофон недоступен'); return; }
  V.testing = true; const bar = $('#vmeterBar'), t0 = performance.now();
  const tick = () => {
    V.measure(); if (bar) bar.style.width = Math.min(100, V.level * 900) + '%';
    if (performance.now() - t0 < 8000 && $('#settings').classList.contains('show')) requestAnimationFrame(tick);
    else { V.testing = false; if (bar) bar.style.width = '0'; if (!V.session()) V.stopMic(); }
  };
  tick();
};
V.measure = () => {
  if (!V.mic) { V.level = 0; return 0; }
  const b = V.mic.buf; V.mic.an.getFloatTimeDomainData(b); let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  V.level = V.level * 0.6 + Math.sqrt(s / b.length) * 0.4; return V.level;
};

// ---------------------------------------------------------------- peers
V.session = () => { const G = TZ.app && TZ.app.game; return G && G.net && G.plist && G.plist.length > 1 ? G : null; };
V.newPeer = (G, pid, initiator) => {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const A = TZ.audio, C = A.ctx;
  const p = { pid, pc, tr: null, audio: null, src: null, talk: false, radio: false, level: 0, made: performance.now() };
  pc.onicecandidate = (e) => { if (e.candidate) G.voiceSend(pid, { ice: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
  pc.ontrack = (e) => {
    const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
    // Chrome only feeds remote WebRTC audio into WebAudio when it also plays in a (muted) media element
    const el = new Audio(); el.muted = true; el.srcObject = stream; el.play().catch(() => { });
    p.audio = el;
    if (C) {
      try {
        const src = C.createMediaStreamSource(stream), gD = C.createGain(), gR = C.createGain(), pan = C.createStereoPanner ? C.createStereoPanner() : C.createGain();
        const hp = C.createBiquadFilter(), bp = C.createBiquadFilter(), sh = C.createWaveShaper();
        hp.type = 'highpass'; hp.frequency.value = 420; bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
        const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.4); } sh.curve = curve;
        gD.gain.value = 0; gR.gain.value = 0;
        src.connect(gD); gD.connect(pan);
        src.connect(hp); hp.connect(bp); bp.connect(sh); sh.connect(gR); gR.connect(pan);
        pan.connect(A.voice || A.master);
        const an = C.createAnalyser(); an.fftSize = 256; src.connect(an);
        Object.assign(p, { src, gD, gR, pan, an, buf: new Float32Array(256) });
      } catch (err) { el.muted = false; } // no WebAudio routing: play it plainly
    } else el.muted = false;
  };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { V.drop(pid); } };
  if (initiator) {
    p.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    V.attachTrack(p);
    pc.onnegotiationneeded = async () => {
      try { const o = await pc.createOffer(); await pc.setLocalDescription(o); G.voiceSend(pid, { sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }); } catch (e) { }
    };
  }
  V.peers.set(pid, p);
  return p;
};
V.attachTrack = (p) => { if (p.tr && V.micTrack) { try { p.tr.sender.replaceTrack(V.micTrack); } catch (e) { } } };
V.drop = (pid) => {
  const p = V.peers.get(pid); if (!p) return;
  try { p.pc.close(); } catch (e) { } try { p.src && p.src.disconnect(); p.pan && p.pan.disconnect(); } catch (e) { }
  if (p.audio) { p.audio.srcObject = null; }
  V.peers.delete(pid);
};
V.dropAll = () => { for (const pid of [...V.peers.keys()]) V.drop(pid); V.stopMic(); V.renderTalk(true); };
// signalling message from another player (via the host)
V.onSignal = async (from, d) => {
  const G = V.session(); if (!G || !d) return;
  let p = V.peers.get(from);
  try {
    if (d.sdp) {
      if (d.sdp.type === 'offer') {
        if (p && p.pc.signalingState !== 'stable') { V.drop(from); p = null; }
        if (!p) p = V.newPeer(G, from, false);
        await p.pc.setRemoteDescription(d.sdp);
        p.tr = p.pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') || p.pc.getTransceivers()[0];
        if (p.tr) { try { p.tr.direction = 'sendrecv'; } catch (e) { } V.attachTrack(p); }
        const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a);
        G.voiceSend(from, { sdp: { type: p.pc.localDescription.type, sdp: p.pc.localDescription.sdp } });
        for (const c of p.pendIce || []) { try { await p.pc.addIceCandidate(c); } catch (e) { } } p.pendIce = null;
      } else if (d.sdp.type === 'answer' && p) {
        await p.pc.setRemoteDescription(d.sdp);
        for (const c of p.pendIce || []) { try { await p.pc.addIceCandidate(c); } catch (e) { } } p.pendIce = null;
      }
    } else if (d.ice) {
      if (!p || !p.pc.remoteDescription) { if (!p) return; (p.pendIce = p.pendIce || []).push(d.ice); return; }
      try { await p.pc.addIceCandidate(d.ice); } catch (e) { }
    }
  } catch (e) { console.warn('voice', e); }
};
// another player started/stopped talking
V.onState = (from, d) => { const p = V.peers.get(from); if (p) { p.talk = !!d.talk; p.radio = !!d.radio; } V.renderTalk(); };

// ---------------------------------------------------------------- per-frame update
V.update = (G, dt) => {
  if (!G || G.demo) return;
  const S = V.session();
  if (!S) { if (V.peers.size || (V.mic && !V.testing)) V.dropAll(); return; }
  // keep one connection per other player; the smaller pid makes the offer
  V.syncT -= dt;
  if (V.syncT <= 0) {
    V.syncT = 1;
    const want = new Set(G.plist.map(e => e.pid).filter(pid => pid !== G.me.pid));
    for (const pid of [...V.peers.keys()]) if (!want.has(pid)) V.drop(pid);
    for (const pid of want) { const p = V.peers.get(pid); if (!p && G.me.pid < pid) V.newPeer(G, pid, true); else if (p && p.pc.connectionState !== 'connected' && performance.now() - p.made > 15000 && G.me.pid < pid) V.drop(pid); }
    if (V.mode !== 'off' && !V.mic && !V._starting && !V._triedMic) { V._triedMic = true; V.startMic().then(ok => { if (!ok && V.micErr) G.msg(V.micErr, 'hint'); }); }
  }
  document.body.classList.toggle('voiceon', V.mode === 'ptt');
  // transmit gate
  const I = TZ.input, P = G.me;
  let want = false;
  if (V.mic && V.mode !== 'off' && !P.dead) {
    const ptt = !G.typing && I.on('voice');
    if (V.mode === 'ptt') want = ptt;
    else { const thr = 0.003 + (1 - (TZ.settings.vad ?? 0.35)) * 0.05; V.measure(); if (V.level > thr || ptt) V.hang = 0.45; else V.hang -= dt; want = V.hang > 0; }
  }
  const radio = want && G.count('walkie') > 0;
  if (want !== V.talking || radio !== V.radio) { V.radio = radio; V.setTalking(want); }
  if (V.mode === 'ptt' && I.on('voice') && !V.mic && !G.typing && !V._warned) { V._warned = true; G.msg(V.micErr || 'Микрофон ещё не готов', 'hint'); }
  // proximity / radio mix
  const C = TZ.audio.ctx, iHaveRadio = G.count('walkie') > 0, now = C ? C.currentTime : 0, v3 = TZ.settings.voice3d !== false;
  for (const p of V.peers.values()) {
    if (!p.gD) continue;
    const pl = G.players.get(p.pid);
    let gd = 0, gr = 0, pan = 0;
    if (pl && !(pl.dead && P.dead)) {
      const d = Math.hypot(pl.x - P.x, pl.y - P.y);
      gd = v3 ? Math.pow(clamp(1 - d / RANGE, 0, 1), 1.4) : (d < RANGE ? 1 : 0);
      if (p.radio && iHaveRadio && gd < 0.25) { gr = 0.9; gd = gd * 0.5; }
      pan = v3 ? clamp(((pl.x - pl.y) - (P.x - P.y)) / 14, -1, 1) * 0.75 : 0;
    }
    p.gD.gain.setTargetAtTime(gd, now, 0.08); p.gR.gain.setTargetAtTime(gr, now, 0.08);
    if (p.pan.pan) p.pan.pan.setTargetAtTime(pan, now, 0.1);
    if (p.an) { p.an.getFloatTimeDomainData(p.buf); let s = 0; for (let i = 0; i < p.buf.length; i += 2) s += p.buf[i] * p.buf[i]; p.level = Math.sqrt(s / (p.buf.length / 2)) * Math.max(gd, gr); }
  }
  V.renderTalkT = (V.renderTalkT || 0) - dt; if (V.renderTalkT <= 0) { V.renderTalkT = 0.2; V.renderTalk(); }
};
V.setTalking = (on) => {
  V.talking = on; if (V.micTrack) V.micTrack.enabled = on;
  const G = V.session(); if (G) G.voiceState({ talk: on ? 1 : 0, radio: V.radio ? 1 : 0 });
  if (on) TZ.audio.play(V.radio ? 'radio_on' : 'ui', 0.3);
  V.renderTalk();
};
V.renderTalk = (clear) => {
  const badge = $('#voicebadge'), list = $('#voicetalk'); if (!badge || !list) return;
  if (clear) { badge.classList.remove('on'); list.innerHTML = ''; return; }
  badge.classList.toggle('on', V.talking); badge.classList.toggle('tx', V.talking && !V.radio); badge.classList.toggle('radio', V.talking && V.radio);
  const lbl = badge.querySelector('span'); if (lbl) lbl.textContent = V.radio ? 'Рация: в эфире' : 'Микрофон включён';
  const G = V.session(); if (!G) { list.innerHTML = ''; return; }
  const rows = [];
  for (const p of V.peers.values()) { if (!p.talk) continue; const pl = G.players.get(p.pid); if (!pl) continue; const audible = p.level > 0.002 || (p.radio && G.count('walkie') > 0); if (!audible && !p.radio) continue; rows.push(`<div class="vtalk${p.radio ? ' radio' : ''}">${TZ.esc(pl.name)}${p.radio ? ' · рация' : ''}</div>`); }
  const h = rows.join(''); if (h !== list._h) { list._h = h; list.innerHTML = h; }
};
V.isTalking = (pid) => { const p = V.peers.get(pid); return !!(p && p.talk); };
})();
