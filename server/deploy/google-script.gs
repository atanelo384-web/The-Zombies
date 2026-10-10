// =====================================================================
//  The Zombies — Google Apps Script for your server (free):
//   • sends e-mail codes from your Gmail (≈100 letters a day)
//   • keeps the server database on your Google Drive (folder "TheZombies-backup",
//     the last 10 copies are kept)
//  1) script.google.com → New project → paste this file → change SECRET.
//  2) Deploy → New deployment → type "Web app" → Execute as: Me, Who has access: Anyone
//     → Deploy → allow access to Gmail and Drive.
//  3) Copy the Web app URL (…/exec) into GOOGLE_SCRIPT_URL and SECRET into GOOGLE_SCRIPT_SECRET.
// =====================================================================
var SECRET = 'ПРИДУМАЙТЕ-ДЛИННЫЙ-СЕКРЕТ';
var FOLDER = 'TheZombies-backup', KEEP = 10;

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function folder() { var it = DriveApp.getFoldersByName(FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); }

function doPost(e) {
  var d; try { d = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  if (d.secret !== SECRET) return out({ ok: false, error: 'forbidden' });
  if (d.action === 'save') {
    var f = folder();
    var name = 'tz-db-' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss') + '.gz.b64';
    f.createFile(name, d.data, 'text/plain');
    var files = [], it = f.getFiles(); while (it.hasNext()) files.push(it.next());
    files.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
    for (var i = KEEP; i < files.length; i++) files[i].setTrashed(true);
    return out({ ok: true, name: name });
  }
  if (d.action === 'load') {
    var f2 = folder(), best = null, it2 = f2.getFiles();
    while (it2.hasNext()) { var x = it2.next(); if (x.getName().indexOf('tz-db-') === 0 && (!best || x.getName() > best.getName())) best = x; }
    return out({ ok: true, name: best ? best.getName() : null, data: best ? best.getBlob().getDataAsString() : null });
  }
  // default: e-mail
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.to || '')) return out({ ok: false, error: 'bad address' });
  MailApp.sendEmail({ to: d.to, subject: String(d.subject).slice(0, 200), htmlBody: d.html, body: d.text, name: 'The Zombies' });
  return out({ ok: true });
}
