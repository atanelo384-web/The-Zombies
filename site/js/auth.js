// =====================================================================
//  THE ZOMBIES — website: sign in / sign up / e-mail code / password reset,
//  Google and Apple sign-in (shown only when the server has them configured).
// =====================================================================
'use strict';
(function () {
const S = window.TZS, { h, t } = S, PX = window.PX;

const scripts = {};
function loadScript(src) {
  if (!scripts[src]) scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => { delete scripts[src]; rej(new Error('script')); };
    document.head.appendChild(s);
  });
  return scripts[src];
}

function afterLogin(res) {
  S.login(res);
  S.toast(t('auth.welcome', { name: (res.me && res.me.name) || '' }), 'ok');
  const next = S.store.get('tz_site_next'); S.store.set('tz_site_next', null);
  if (next && next !== location.hash && /^#\/[\w/#-]*$/.test(next)) location.hash = next; else S.route(true);
}
S.afterLogin = afterLogin;

function pwInput(attrs) {
  const inp = S.input(Object.assign({ type: 'password', minlength: 8, maxlength: 128, required: true }, attrs));
  const eye = h('button.eye', { type: 'button', 'aria-label': t('auth.showpw'), title: t('auth.showpw') }, S.img(PX.glyph('eye', '#9a9888', 2)));
  eye.addEventListener('click', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.classList.toggle('on', inp.type === 'text'); });
  return h('div.pwrap', inp, eye);
}
const val = (form, name) => (form.elements[name] && form.elements[name].value || '').trim();

S.pages.authBlock = (opts = {}) => {
  const box = h('div.auth');
  let mode = opts.mode || 'login', email = '', dev = '';
  const go = (m) => { mode = m; render(); const f = box.querySelector('input'); if (f) f.focus(); };
  const msg = h('p.formerr', { role: 'alert' });
  const setErr = (e) => { msg.textContent = e ? S.errText(e) : ''; msg.classList.toggle('show', !!e); };
  const submitWith = (form, fn) => form.addEventListener('submit', async (e) => {
    e.preventDefault(); setErr(null);
    const btn = form.querySelector('button[type=submit]');
    if (btn.disabled) return; btn.disabled = true; btn.classList.add('wait');
    try { await fn(); } catch (err) { setErr(err); } finally { btn.disabled = false; btn.classList.remove('wait'); }
  });

  function loginForm() {
    const f = h('form.form', { autocomplete: 'on', novalidate: true },
      S.field(t('auth.email'), S.input({ type: 'email', name: 'email', autocomplete: 'email', required: true, value: email, maxlength: 254, inputmode: 'email' })),
      S.field(t('auth.password'), pwInput({ name: 'password', autocomplete: 'current-password' })),
      msg,
      h('button.btn.red.wide', { type: 'submit' }, t('auth.login')),
      h('div.row.between.links',
        h('button.linkbtn', { type: 'button', onclick: () => { email = val(f, 'email'); go('forgot'); } }, t('auth.forgot')),
        h('button.linkbtn', { type: 'button', onclick: () => { email = val(f, 'email'); go('register'); } }, t('auth.noacc'))));
    submitWith(f, async () => {
      email = val(f, 'email');
      const r = await S.post('/api/auth/login', { email, password: f.elements.password.value });
      if (r.needVerify) { email = r.email || email; dev = r.devCode || ''; S.toast(t('auth.codesent', { email }), 'ok'); go('verify'); return; }
      afterLogin(r);
    });
    return f;
  }
  function registerForm() {
    const f = h('form.form', { autocomplete: 'on', novalidate: true },
      S.field(t('auth.name'), S.input({ name: 'name', autocomplete: 'nickname', required: true, minlength: 3, maxlength: 16 }), t('auth.namehint')),
      S.field(t('auth.email'), S.input({ type: 'email', name: 'email', autocomplete: 'email', required: true, value: email, maxlength: 254, inputmode: 'email' })),
      S.field(t('auth.password'), pwInput({ name: 'password', autocomplete: 'new-password' }), t('auth.pwhint')),
      msg,
      h('button.btn.green.wide', { type: 'submit' }, t('auth.register')),
      h('div.row.center.links', h('button.linkbtn', { type: 'button', onclick: () => { email = val(f, 'email'); go('login'); } }, t('auth.haveacc'))));
    submitWith(f, async () => {
      email = val(f, 'email');
      const r = await S.post('/api/auth/register', { email, password: f.elements.password.value, name: val(f, 'name') });
      email = r.email || email; dev = r.devCode || ''; S.toast(t('auth.codesent', { email }), 'ok'); go('verify');
    });
    return f;
  }
  function codeInput(name) { return S.input({ name, inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*', maxlength: 6, required: true, class: 'inp code', value: dev || '' }); }
  function verifyForm() {
    let left = 0, timer = 0;
    const resend = h('button.linkbtn', { type: 'button' }, t('auth.resend'));
    const tick = () => { if (!resend.isConnected) { clearInterval(timer); return; } left--; resend.disabled = left > 0; resend.textContent = left > 0 ? t('auth.resendin', { s: left }) : t('auth.resend'); if (left <= 0) clearInterval(timer); };
    resend.addEventListener('click', async () => {
      if (left > 0) return;
      try { const r = await S.post('/api/auth/resend', { email }); if (r.devCode) f.elements.code.value = r.devCode; S.toast(t('auth.codesent', { email }), 'ok'); left = 60; tick(); timer = setInterval(tick, 1000); } catch (e) { setErr(e); }
    });
    const f = h('form.form', { novalidate: true },
      h('p.note', t('auth.verifytext', { email })),
      S.field(t('auth.code'), codeInput('code')),
      msg,
      h('button.btn.green.wide', { type: 'submit' }, t('auth.confirm')),
      h('div.row.between.links', h('button.linkbtn', { type: 'button', onclick: () => go('login') }, '← ' + t('ui.back')), resend));
    submitWith(f, async () => afterLogin(await S.post('/api/auth/verify', { email, code: val(f, 'code') })));
    return f;
  }
  function forgotForm() {
    const f = h('form.form', { novalidate: true },
      h('p.note', t('auth.forgottext')),
      S.field(t('auth.email'), S.input({ type: 'email', name: 'email', autocomplete: 'email', required: true, value: email, inputmode: 'email' })),
      msg,
      h('button.btn.red.wide', { type: 'submit' }, t('auth.sendcode')),
      h('div.row.center.links', h('button.linkbtn', { type: 'button', onclick: () => go('login') }, '← ' + t('ui.back'))));
    submitWith(f, async () => { email = val(f, 'email'); const r = await S.post('/api/auth/forgot', { email }); dev = r.devCode || ''; S.toast(t('auth.codesent', { email }), 'ok'); go('reset'); });
    return f;
  }
  function resetForm() {
    const f = h('form.form', { novalidate: true },
      h('p.note', t('auth.resettext', { email })),
      S.field(t('auth.code'), codeInput('code')),
      S.field(t('auth.newpw'), pwInput({ name: 'password', autocomplete: 'new-password' }), t('auth.pwhint')),
      msg,
      h('button.btn.green.wide', { type: 'submit' }, t('auth.setpw')),
      h('div.row.center.links', h('button.linkbtn', { type: 'button', onclick: () => go('forgot') }, '← ' + t('ui.back'))));
    submitWith(f, async () => afterLogin(await S.post('/api/auth/reset', { email, code: val(f, 'code'), password: f.elements.password.value })));
    return f;
  }
  const social = h('div.social');
  async function renderSocial() {
    S.clear(social);
    const c = await S.config(); if (!c || (!c.google && !c.apple)) return;
    social.appendChild(h('div.or', h('span', t('auth.or'))));
    if (c.google) {
      const g = h('div.gbtn');
      social.appendChild(g);
      loadScript('https://accounts.google.com/gsi/client').then(() => {
        const G = window.google && window.google.accounts && window.google.accounts.id; if (!G) return;
        G.initialize({ client_id: c.google, callback: async (r) => { try { afterLogin(await S.post('/api/auth/google', { idToken: r.credential })); } catch (e) { setErr(e); } } });
        G.renderButton(g, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', locale: S.lang, width: Math.min(320, Math.max(200, g.clientWidth || 300)) });
      }).catch(() => { g.remove(); });
    }
    if (c.apple) {
      const b = h('button.btn.apple.wide', { type: 'button' }, h('span.aplogo', { 'aria-hidden': 'true' }), t('auth.apple'));
      social.appendChild(b);
      b.addEventListener('click', () => S.busy(b, async () => {
        await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
        const A = window.AppleID; if (!A) throw new Error('Apple');
        A.auth.init({ clientId: c.apple, scope: 'name email', redirectURI: location.origin + '/', usePopup: true });
        let r; try { r = await A.auth.signIn(); } catch (e) { if (e && e.error === 'popup_closed_by_user') return; throw e; }
        const n = r.user && r.user.name ? [r.user.name.firstName, r.user.name.lastName].filter(Boolean).join(' ') : undefined;
        afterLogin(await S.post('/api/auth/apple', { idToken: r.authorization && r.authorization.id_token, name: n }));
      }));
    }
  }
  function render() {
    S.clear(box); setErr(null);
    if (mode === 'login' || mode === 'register') {
      box.appendChild(h('div.tabs.two', { role: 'tablist' },
        h('button.tab' + (mode === 'login' ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(mode === 'login'), onclick: () => go('login') }, t('auth.login')),
        h('button.tab' + (mode === 'register' ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(mode === 'register'), onclick: () => go('register') }, t('auth.register'))));
    } else box.appendChild(h('h3.ftitle', t({ verify: 'auth.verify', forgot: 'auth.forgottitle', reset: 'auth.resettitle' }[mode])));
    box.appendChild({ login: loginForm, register: registerForm, verify: verifyForm, forgot: forgotForm, reset: resetForm }[mode]());
    if (mode === 'login' || mode === 'register') { box.appendChild(social); renderSocial(); }
  }
  render();
  return box;
};
})();
