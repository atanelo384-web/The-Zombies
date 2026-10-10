// The Zombies — free mail relay (Google Apps Script). Sends verification and password-reset codes
// from your Gmail, up to ~100 letters a day, free, no card.
// 1) script.google.com → New project → paste this file → change SECRET below.
// 2) Deploy → New deployment → type "Web app" → Execute as: Me, Who has access: Anyone → Deploy → allow access.
// 3) Copy the Web app URL (…/exec) into MAIL_WEBHOOK_URL and SECRET into MAIL_WEBHOOK_SECRET on the server.
var SECRET = 'ПРИДУМАЙТЕ-ДЛИННЫЙ-СЕКРЕТ';
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.secret !== SECRET) return ContentService.createTextOutput('forbidden');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.to)) return ContentService.createTextOutput('bad');
  MailApp.sendEmail({ to: d.to, subject: String(d.subject).slice(0, 200), htmlBody: d.html, body: d.text, name: 'The Zombies' });
  return ContentService.createTextOutput('ok');
}
