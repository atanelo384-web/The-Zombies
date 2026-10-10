// =====================================================================
//  THE ZOMBIES — languages. The game is written in Russian; every other
//  language is a dictionary "Russian text → translation" in js/lang/<code>.js.
//  Text on screen is translated automatically (also text that appears later),
//  numbers inside phrases are kept: "День 5" → "Day 5".
// =====================================================================
'use strict';
(() => {
const LANGS = [
  ['ru', 'Русский'], ['en', 'English'], ['uk', 'Українська'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'],
  ['pt', 'Português'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['zh', '中文'], ['ja', '日本語'],
];
TZ.LANGS = LANGS;
TZ.L = TZ.L || {}; // TZ.L.en = { 'Русский текст': 'English text', ... } — filled by js/lang/*.js
const pick = () => {
  const saved = TZ.store.get('lang', null); if (saved && LANGS.some(l => l[0] === saved)) return saved;
  const nav = (navigator.languages || [navigator.language || 'ru']).map(x => String(x).slice(0, 2).toLowerCase());
  for (const n of nav) if (LANGS.some(l => l[0] === n)) return n;
  return 'en';
};
TZ.lang = pick();
let dict = null, tpl = null, rev = new Set();
const NUM = /-?\d+(?:[.,]\d+)?/g;
function build() {
  dict = TZ.lang === 'ru' ? null : (TZ.L[TZ.lang] || null); tpl = new Map(); rev = new Set();
  if (!dict) return;
  for (const k in dict) { rev.add(dict[k]); if (k.includes('{n}')) tpl.set(k, dict[k]); }
}
// translate one phrase (exact, or with numbers as {n})
function tr(s) {
  if (!dict || !s) return s;
  const d = dict[s]; if (d != null) return d;
  const trimmed = s.trim(); if (trimmed !== s) { const t = tr(trimmed); return t === trimmed ? s : s.replace(trimmed, t); }
  if (!/[А-Яа-яЁё]/.test(s)) return s;
  const nums = []; const key = s.replace(NUM, (m) => { nums.push(m); return '{n}'; });
  if (nums.length) { const t = dict[key]; if (t != null) { let i = 0; return t.replace(/\{n\}/g, () => nums[i++] ?? ''); } }
  // compound text: "Осенний лес · 70, 74", "День 1", "Вес 2.7 / 40"
  if (s.includes(' · ')) { const parts = s.split(' · '); const tp = parts.map(tr); if (tp.some((x, i) => x !== parts[i])) return tp.join(' · '); }
  const m = /^(.*?[А-Яа-яЁё.!?»)])([\s\d.,:/%+×xX()-]+)$/.exec(s);
  if (m) { const h = dict[m[1]]; if (h != null) return h + m[2]; }
  return s;
}
TZ.t = (s, vars) => { let r = tr(String(s)); if (vars) for (const k in vars) r = r.split('{' + k + '}').join(vars[k]); return r; };
TZ.tn = (s) => tr(s);

// ---------------------------------------------------------------- DOM auto-translation
const orig = new WeakMap();           // text node / element -> original Russian
const ATTRS = ['placeholder', 'title', 'aria-label'];
function trNode(n) {
  if (n.nodeType === 3) {
    const v = n.data; if (!v || !/[А-Яа-яЁё]/.test(v)) { if (!dict && orig.has(n)) { n.data = orig.get(n); orig.delete(n); } return; }
    if (rev.has(v.trim())) return;
    const t = tr(v); if (t !== v) { orig.set(n, v); n.data = t; }
    return;
  }
  if (n.nodeType !== 1) return;
  const tag = n.tagName; if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || n.isContentEditable || n.hasAttribute('data-noi18n')) return;
  for (const a of ATTRS) { const v = n.getAttribute(a); if (v && /[А-Яа-яЁё]/.test(v)) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } }
  if (tag === 'INPUT' && (n.type === 'button' || n.type === 'submit') && /[А-Яа-яЁё]/.test(n.value)) n.value = tr(n.value);
  for (let c = n.firstChild; c; c = c.nextSibling) trNode(c);
}
let mo = null;
function observe() {
  if (mo) mo.disconnect();
  if (!dict) return;
  mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') trNode(m.target);
      else if (m.type === 'attributes') trNode(m.target);
      else for (const n of m.addedNodes) trNode(n);
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
function restoreAll(root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (orig.has(n)) { n.data = orig.get(n); orig.delete(n); } }
TZ.applyLang = () => {
  build();
  document.documentElement.lang = TZ.lang;
  if (!dict) { if (mo) mo.disconnect(); restoreAll(document.body); return; }
  trNode(document.body); observe();
};
TZ.setLang = (code) => {
  if (!LANGS.some(l => l[0] === code)) return;
  const load = () => { TZ.lang = code; TZ.store.set('lang', code); restoreAll(document.body); TZ.applyLang(); if (TZ.onLang) TZ.onLang(code); };
  if (code === 'ru' || TZ.L[code]) return load();
  const s = document.createElement('script'); s.src = 'js/lang/' + code + '.js'; s.onload = load; s.onerror = load; document.head.append(s);
};
TZ.langReady = () => new Promise((res) => {
  if (TZ.lang === 'ru' || TZ.L[TZ.lang]) { build(); return res(); }
  const s = document.createElement('script'); s.src = 'js/lang/' + TZ.lang + '.js'; s.onload = () => { build(); res(); }; s.onerror = () => { TZ.lang = 'ru'; build(); res(); }; document.head.append(s);
});
build();
})();
