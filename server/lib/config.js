'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DEF = {
  port: 8080,                 // HTTP port (put nginx/Beget proxy with HTTPS in front)
  publicUrl: 'http://localhost:8080', // address players use, e.g. https://thezombies.ru
  trustProxy: false,          // true behind nginx (reads X-Forwarded-For)
  dataDir: 'data',
  adminEmails: [],            // these accounts get the support / admin panel
  googleClientId: '',         // OAuth client id (Web) from console.cloud.google.com
  appleClientId: '',          // Services ID from developer.apple.com (needs paid Apple Developer)
  smtp: { host: '', port: 465, secure: true, user: '', pass: '', from: '' },
  yoomoney: { wallet: '', secret: '' }, // wallet number 41001... and HTTP-notification secret
  devShowCodes: false,        // only for local tests: return e-mail codes in API responses
  serverPrice: 400,
};
function load(dir) {
  const file = path.join(dir, 'config.json');
  let c = {};
  if (fs.existsSync(file)) c = JSON.parse(fs.readFileSync(file, 'utf8'));
  else if (!process.env.RENDER && !process.env.PUBLIC_URL) { try { fs.writeFileSync(file, JSON.stringify(DEF, null, 2)); console.log('Создан config.json — заполните его и перезапустите сервер.'); } catch (e) { } }
  const cfg = Object.assign({}, DEF, c, { smtp: Object.assign({}, DEF.smtp, c.smtp), yoomoney: Object.assign({}, DEF.yoomoney, c.yoomoney) });
  // environment variables override the file (free hosting like Render has no config file)
  const E = process.env, list = (v) => String(v).split(/[,\s]+/).filter(Boolean);
  if (E.PORT) cfg.port = +E.PORT;
  if (E.PUBLIC_URL) cfg.publicUrl = E.PUBLIC_URL; else if (E.RENDER_EXTERNAL_URL) cfg.publicUrl = E.RENDER_EXTERNAL_URL;
  if (E.RENDER || E.TRUST_PROXY) cfg.trustProxy = true;
  if (E.ADMIN_EMAILS) cfg.adminEmails = list(E.ADMIN_EMAILS);
  if (E.GOOGLE_CLIENT_ID) cfg.googleClientId = E.GOOGLE_CLIENT_ID;
  if (E.APPLE_CLIENT_ID) cfg.appleClientId = E.APPLE_CLIENT_ID;
  if (E.YOOMONEY_WALLET) cfg.yoomoney.wallet = E.YOOMONEY_WALLET;
  if (E.YOOMONEY_SECRET) cfg.yoomoney.secret = E.YOOMONEY_SECRET;
  if (E.SMTP_HOST) Object.assign(cfg.smtp, { host: E.SMTP_HOST, port: +(E.SMTP_PORT || 465), user: E.SMTP_USER || '', pass: E.SMTP_PASS || '', from: E.SMTP_FROM || E.SMTP_USER || '' });
  const gsUrl = E.GOOGLE_SCRIPT_URL || E.MAIL_WEBHOOK_URL, gsSecret = E.GOOGLE_SCRIPT_SECRET || E.MAIL_WEBHOOK_SECRET || '';
  if (gsUrl) { cfg.mailWebhook = { url: gsUrl, secret: gsSecret }; if (!E.TURSO_URL && E.BACKUP !== 'off') cfg.gdrive = { url: gsUrl, secret: gsSecret }; }
  if (E.TURSO_URL) cfg.turso = { url: E.TURSO_URL, token: E.TURSO_TOKEN || '' };
  if (E.SERVER_PRICE) cfg.serverPrice = +E.SERVER_PRICE;
  cfg.downloads = Object.assign({}, cfg.downloads || {}, E.DOWNLOAD_PC ? { pc: E.DOWNLOAD_PC } : {}, E.DOWNLOAD_ANDROID ? { android: E.DOWNLOAD_ANDROID } : {}, E.DOWNLOAD_IOS ? { ios: E.DOWNLOAD_IOS } : {});
  cfg.dataDir = path.resolve(dir, cfg.dataDir);
  cfg.adminEmails = (cfg.adminEmails || []).map(e => String(e).toLowerCase());
  return cfg;
}
module.exports = { load };
