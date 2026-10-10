'use strict';
// E-mail with codes (registration / password reset). SMTP from config.json;
// without SMTP the code is printed in the server console (for testing).
let transport = null, cfg = null, hook = null;
function init(config) {
  cfg = config;
  if (config.mailWebhook && config.mailWebhook.url) hook = config.mailWebhook;
  if (config.smtp && config.smtp.host) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port || 465, secure: config.smtp.secure !== false, auth: { user: config.smtp.user, pass: config.smtp.pass } });
  }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function html(title, lines, code) {
  return `<div style="background:#14110c;padding:28px;font-family:Verdana,Arial,sans-serif;color:#e8dcc0">
  <div style="max-width:460px;margin:auto;background:#221c14;border:4px solid #4a3a26;padding:24px">
  <div style="font-size:22px;color:#ff5a4a;font-weight:bold;letter-spacing:2px">THE ZOMBIES</div>
  <div style="font-size:16px;margin:14px 0 8px">${esc(title)}</div>
  ${lines.map(l => `<p style="font-size:14px;line-height:1.5;margin:6px 0">${esc(l)}</p>`).join('')}
  ${code ? `<div style="font-size:34px;letter-spacing:10px;background:#0d0b08;color:#f0c040;text-align:center;padding:14px;margin:16px 0;border:3px solid #6a5434">${esc(code)}</div>` : ''}
  <p style="font-size:12px;color:#9a8a70">Если это были не вы — просто проигнорируйте письмо. Никому не сообщайте код, даже «поддержке».</p></div></div>`;
}
async function send(to, subject, title, lines, code) {
  if (hook) { // free mail relay: a Google Apps Script web app sends the letter from your Gmail
    try { const r = await fetch(hook.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: hook.secret, to, subject, html: html(title, lines, code), text: lines.join('\n') + (code ? '\n\nКод: ' + code : '') }), redirect: 'follow' }); return r.ok; }
    catch (e) { console.error('mail webhook error', e.message); return false; }
  }
  if (!transport) { console.log(`[mail → ${to}] ${subject}: ${lines.join(' ')} ${code ? 'КОД: ' + code : ''}`); return true; }
  try { await transport.sendMail({ from: cfg.smtp.from || cfg.smtp.user, to, subject, text: lines.join('\n') + (code ? '\n\nКод: ' + code : ''), html: html(title, lines, code) }); return true; }
  catch (e) { console.error('mail error', e.message); return false; }
}
module.exports = { init, send, enabled: () => !!(transport || hook) };
