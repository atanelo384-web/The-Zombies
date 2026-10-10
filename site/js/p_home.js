// =====================================================================
//  THE ZOMBIES — website: home (hero, downloads, live stats, features),
//  iPhone install guide, 404.
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;

// ---------------------------------------------------------------- the logo (pixel canvas + glitch layers)
let logoUrls = null;
async function logoImages() {
  if (logoUrls) return logoUrls;
  try { await document.fonts.load('16px "Press Start 2P"', 'ZOMBIES'); } catch (e) { /* fallback */ }
  const c = PX.logo('ZOMBIES', 16, 11); if (!c) return null;
  logoUrls = { main: c.toDataURL(), r: PX.tint(c, '#ff2a3a').toDataURL(), b: PX.tint(c, '#2ae0ff').toDataURL(), w: c.width, h: c.height };
  return logoUrls;
}
function logo(big) {
  const el = h('div.logo' + (big ? '.big' : ''), { role: 'img', 'aria-label': 'The Zombies' },
    h('div.the', 'THE'),
    h('div.zwrap', h('div.zfallback', 'ZOMBIES')));
  logoImages().then((L) => {
    if (!L) return; const w = el.querySelector('.zwrap'); S.clear(w);
    w.style.setProperty('--ar', L.w + ' / ' + L.h);
    w.appendChild(h('img.zg.zr', { src: L.r, alt: '' })); w.appendChild(h('img.zg.zb', { src: L.b, alt: '' }));
    w.appendChild(h('img.zmain', { src: L.main, alt: '' }));
    w.classList.add('ready');
  });
  return el;
}
S.logo = logo;

// ---------------------------------------------------------------- home
const FEATURES = [
  ['servers', ['star', '#5fd0ff', 'globe']], ['social', ['circle', '#ff8aa0', 'people']], ['classes', ['star', '#d8b050', 'shield']],
  ['skins', ['shield', '#c080ff', 'shirt']], ['vehicles', ['circle', '#9ad8ff', 'heli']], ['houses', ['shield', '#c87a4a', 'house']],
  ['voice', ['circle', '#8fd86a', 'mic']], ['langs', ['circle', '#e8b030', 'chat']], ['anticheat', ['shield', '#d2322a', 'eye']],
];

function dlButton(kind, info, ver) {
  const icon = S.img(PX.platform(kind, 3), 'dlico');
  const label = t('dl.' + kind);
  const base = S.base();
  if (kind === 'web') return h('a.dl.web', { href: base + (info || '/play/') }, icon, h('span.dlt', h('b', label), h('small', t('dl.websub'))), h('span.dlgo', '▶'));
  if (kind === 'ios') return h('a.dl', { href: '#/ios' }, icon, h('span.dlt', h('b', label), h('small', info ? ['v' + ver, ' · ', S.size(info.size)] : t('dl.soon'))));
  if (!info) return h('div.dl.off', { 'aria-disabled': 'true' }, icon, h('span.dlt', h('b', label), h('small', t('dl.soon'))));
  return h('a.dl', { href: info.url || base + '/dl/' + encodeURIComponent(info.file), download: '' }, icon, h('span.dlt', h('b', label), h('small', info.size ? ['v' + ver, ' · ', S.size(info.size)] : ['v' + ver])));
}

S.pages.home = (main, p, ctx) => {
  const cv = h('canvas.herobg', { 'aria-hidden': 'true' });
  const dl = h('div.dlgrid', ['pc', 'android', 'ios', 'web'].map(k => h('div.dl.skel', S.img(PX.platform(k, 3), 'dlico'), h('span.dlt', h('b', t('dl.' + k)), h('small', '…')))));
  const ver = h('span.vchip', 'v…');
  const hero = h('section.hero',
    cv, h('div.herofx', { 'aria-hidden': 'true' }),
    h('div.heroin.wrap',
      logo(true),
      h('p.tagline', t('hero.tag')),
      h('p.lead', t('hero.lead')),
      dl,
      h('div.vline', ver, h('span.vsep'), h('span', t('hero.free')), h('span.vsep'), h('span', t('hero.cross')))),
    h('a.scrollhint', { href: '#/', 'aria-label': t('hero.more'), onclick: (e) => { e.preventDefault(); const s = document.querySelector('.stats'); if (s) s.scrollIntoView({ behavior: S.reduced() ? 'auto' : 'smooth' }); } }, h('span', t('hero.more')), h('i')));
  main.appendChild(hero);
  const stop = window.TZBG(cv); ctx.onLeave(stop);

  // downloads
  S.get('/api/downloads').then((d) => {
    if (!ctx.alive()) return;
    S.clear(dl); dl.append(dlButton('pc', d.pc, d.version), dlButton('android', d.android, d.version), dlButton('ios', d.ios, d.version));
    ver.textContent = t('hero.version', { v: d.version });
  }).catch(() => { if (!ctx.alive()) return; S.clear(dl); dl.append(dlButton('pc', null), dlButton('android', null), dlButton('ios', null)); ver.textContent = 'v5'; });

  // live stats
  const keys = ['online', 'playing', 'servers', 'players', 'clans'];
  const nums = {}; const tiles = keys.map(k => { nums[k] = h('b.snum', { 'data-v': '0' }, '0'); return h('div.stat.reveal' + (k === 'online' ? '.live' : ''), h('div.sval', k === 'online' ? h('span.pulse') : null, nums[k]), h('div.slab', t('stats.' + k))); });
  main.appendChild(h('section.stats', h('div.wrap', h('div.statgrid', tiles))));
  const loadStats = () => S.get('/api/stats').then((s) => { if (ctx.alive()) for (const k of keys) S.countUp(nums[k], s[k]); }).catch(() => { /* keep zeros */ });
  loadStats(); ctx.every(30000, loadStats);

  // features
  main.appendChild(h('section.sec', h('div.wrap',
    S.sectionHead(t('feat.title'), t('feat.sub')),
    h('div.fgrid', FEATURES.map(([k, m]) => h('article.fcard.panel.reveal',
      h('div.fico', S.img(PX.badge(m, 60))),
      h('h3', t('feat.' + k)), h('p', t('feat.' + k + '.d'))))))));

  // calls to action
  main.appendChild(h('section.sec.cta', h('div.wrap', h('div.ctagrid',
    h('a.ctacard.panel.reveal', { href: '#/servers' }, S.img(PX.badge(['star', '#5fd0ff', 'globe'], 72), 'ctaico'), h('div', h('h3', t('cta.server')), h('p', t('cta.server.d')), h('span.btn.gold.small', t('cta.server.b')))),
    h('a.ctacard.panel.reveal', { href: '#/clans' }, S.img(PX.badge(['shield', '#d2322a', 'people'], 72), 'ctaico'), h('div', h('h3', t('cta.clans')), h('p', t('cta.clans.d')), h('span.btn.ghost.small', t('cta.clans.b')))),
    h('a.ctacard.panel.reveal', { href: '#/donate' }, S.img(PX.badge(['circle', '#f0c040', 'coin'], 72), 'ctaico'), h('div', h('h3', t('cta.shop')), h('p', t('cta.shop.d')), h('span.btn.ghost.small', t('cta.shop.b'))))))));
};

// ---------------------------------------------------------------- iPhone install guide
S.pages.ios = (main, p, ctx) => {
  const dlBox = h('div.iosdl', S.loading());
  const steps = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
  main.appendChild(h('section.sec.first', h('div.wrap.mid',
    h('a.back', { href: '#/' }, '← ' + t('ui.home')),
    h('div.pagehead', S.img(PX.platform('ios', 4), 'phico'), h('div', h('h1.ttl', t('ios.title')), h('p.sub', t('ios.sub')))),
    dlBox,
    h('ol.steps', steps.map((k, i) => h('li.step.panel.reveal', h('span.stepn', String(i + 1)), h('div', h('h3', t('ios.' + k)), h('p', t('ios.' + k + '.d')),
      k === 's2' ? h('a.ext', { href: 'https://www.apple.com/itunes/', target: '_blank', rel: 'noopener noreferrer' }, 'apple.com/itunes ↗') : null,
      k === 's3' ? h('a.ext', { href: 'https://sideloadly.io/', target: '_blank', rel: 'noopener noreferrer' }, 'sideloadly.io ↗') : null)))))));
  S.get('/api/downloads').then((d) => {
    if (!ctx.alive()) return; S.clear(dlBox);
    dlBox.appendChild(d.ios
      ? h('a.btn.gold.big', { href: d.ios.url || S.base() + '/dl/' + encodeURIComponent(d.ios.file), download: '' }, t('ios.get'), h('small', ' v' + d.version + (d.ios.size ? ' · ' + S.size(d.ios.size) : '')))
      : h('div.notice', t('ios.none')));
  }).catch((e) => { if (ctx.alive()) S.clear(dlBox).appendChild(S.errorBox(e)); });
};

S.pages.notfound = (main) => {
  main.appendChild(h('section.sec.first', h('div.wrap.narrow.c', S.empty(t('nf.text'), 'skull'), h('a.btn.red', { href: '#/' }, t('ui.home')))));
};
})();
