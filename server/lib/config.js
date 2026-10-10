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
  else { fs.writeFileSync(file, JSON.stringify(DEF, null, 2)); console.log('Создан config.json — заполните его и перезапустите сервер.'); }
  const cfg = Object.assign({}, DEF, c, { smtp: Object.assign({}, DEF.smtp, c.smtp), yoomoney: Object.assign({}, DEF.yoomoney, c.yoomoney) });
  if (process.env.PORT) cfg.port = +process.env.PORT;
  cfg.dataDir = path.resolve(dir, cfg.dataDir);
  cfg.adminEmails = (cfg.adminEmails || []).map(e => String(e).toLowerCase());
  return cfg;
}
module.exports = { load };
