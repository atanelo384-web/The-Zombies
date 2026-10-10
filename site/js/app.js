// =====================================================================
//  THE ZOMBIES — website boot: language switcher, burger menu, router.
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S;
S.base = () => String(window.TZ_API || '').replace(/\/+$/, '');

function boot() {
  // language switcher
  const sel = document.getElementById('langsel');
  for (const [code, name] of window.TZ_I18N.langs) sel.appendChild(h('option', { value: code }, name));
  sel.addEventListener('change', () => S.setLang(sel.value));
  S.applyLang();
  // links to the game when the site lives on another host
  if (S.base()) for (const a of document.querySelectorAll('a[href="/play/"]')) a.href = S.base() + '/play/';
  // burger
  const burger = document.getElementById('burger');
  burger.addEventListener('click', () => { const open = !document.body.classList.contains('navopen'); document.body.classList.toggle('navopen', open); burger.setAttribute('aria-expanded', String(open)); });
  document.getElementById('nav').addEventListener('click', (e) => { if (e.target.closest('a')) { document.body.classList.remove('navopen'); burger.setAttribute('aria-expanded', 'false'); } });
  // header shadow on scroll
  const top = document.getElementById('top');
  const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  window.addEventListener('hashchange', () => S.route());
  S.renderUser();
  // Apple sign-in with a redirect (non-popup) comes back as a form POST — nothing to do here; popups resolve in auth.js
  const done = () => S.route();
  if (S.token()) Promise.race([S.loadMe(), new Promise(r => setTimeout(r, 4000))]).then(done, done); else done();
  S.config().then(c => { const v = document.getElementById('fver'); if (v && c && c.version) v.textContent = 'v' + c.version; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
void t;
})();
