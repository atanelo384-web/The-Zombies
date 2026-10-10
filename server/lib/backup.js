'use strict';
// Keeps the database safe on free hosting where the disk is wiped on every restart (Render Free).
// The working database is a normal local SQLite file (fast). A compressed snapshot of it is stored
// in a free Turso database (turso.tech, 5 GB free, no card) every few minutes and on shutdown,
// and restored on start. Turso is used through its plain HTTP API — no extra packages.
const fs = require('fs');
const zlib = require('zlib');

const CHUNK = 700 * 1024;
function client(cfg) {
  const base = cfg.url.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
  const val = (v) => v === null || v === undefined ? { type: 'null' } : Buffer.isBuffer(v) ? { type: 'blob', base64: v.toString('base64') } : typeof v === 'number' ? (Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }) : { type: 'text', value: String(v) };
  const out = (c) => c.type === 'null' ? null : c.type === 'integer' ? Number(c.value) : c.type === 'float' ? c.value : c.type === 'blob' ? Buffer.from(c.base64 || '', 'base64') : c.value;
  async function pipeline(stmts) {
    const body = { requests: stmts.map(([sql, args]) => ({ type: 'execute', stmt: { sql, args: (args || []).map(val) } })).concat([{ type: 'close' }]) };
    const r = await fetch(base + '/v2/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Turso HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    return j.results.slice(0, stmts.length).map((x) => { if (x.type === 'error') throw new Error('Turso: ' + (x.error && x.error.message)); const res = x.response.result; return (res.rows || []).map(row => row.map(out)); });
  }
  return { pipeline };
}

// ---------------------------------------------------------------- Google Drive (through your Google Apps Script)
async function gs(g, body) {
  const r = await fetch(g.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ secret: g.secret }, body)), redirect: 'follow' });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Google Script ответил не JSON: ' + txt.slice(0, 120)); }
  if (!j.ok) throw new Error('Google Script: ' + (j.error || 'ошибка'));
  return j;
}
async function restoreDrive(g, file) {
  const j = await gs(g, { action: 'load' });
  if (!j.data) { console.log('Резервная копия: на Google Диске пока пусто — начинаем с новой базы'); return false; }
  const buf = zlib.gunzipSync(Buffer.from(j.data, 'base64'));
  fs.writeFileSync(file, buf);
  for (const ext of ['-wal', '-shm']) try { fs.unlinkSync(file + ext); } catch (e) { }
  console.log(`Резервная копия восстановлена с Google Диска: ${(buf.length / 1024).toFixed(0)} КБ (${j.name || ''})`);
  return true;
}

async function restore(cfg, file) {
  if (cfg.gdrive && cfg.gdrive.url && !(cfg.turso && cfg.turso.url)) return restoreDrive(cfg.gdrive, file);
  if (!cfg.turso || !cfg.turso.url) return false;
  const T = client(cfg.turso);
  await T.pipeline([['CREATE TABLE IF NOT EXISTS snap (seq INTEGER, i INTEGER, data BLOB, PRIMARY KEY (seq, i))'], ['CREATE TABLE IF NOT EXISTS snap_meta (seq INTEGER PRIMARY KEY, parts INTEGER, size INTEGER, at INTEGER)']]);
  const [meta] = await T.pipeline([['SELECT seq, parts FROM snap_meta ORDER BY seq DESC LIMIT 1']]);
  if (!meta.length) { console.log('Резервная копия: в Turso пока пусто — начинаем с новой базы'); return false; }
  const [seq, parts] = meta[0];
  const chunks = [];
  for (let i = 0; i < parts; i += 8) {
    const res = await T.pipeline(Array.from({ length: Math.min(8, parts - i) }, (_, k) => ['SELECT data FROM snap WHERE seq = ? AND i = ?', [seq, i + k]]));
    for (const rows of res) chunks.push(rows[0][0]);
  }
  const buf = zlib.gunzipSync(Buffer.concat(chunks));
  fs.writeFileSync(file, buf);
  for (const ext of ['-wal', '-shm']) try { fs.unlinkSync(file + ext); } catch (e) { }
  console.log(`Резервная копия восстановлена из Turso: ${(buf.length / 1024).toFixed(0)} КБ (снимок ${seq})`);
  return true;
}

function start(cfg, db, file) {
  const drive = cfg.gdrive && cfg.gdrive.url && !(cfg.turso && cfg.turso.url) ? cfg.gdrive : null;
  if (!drive && (!cfg.turso || !cfg.turso.url)) return { dirty() { }, now: async () => { } };
  const T = drive ? null : client(cfg.turso);
  let dirty = true, busy = false, last = 0;
  async function save(reason) {
    if (busy || !dirty) return; busy = true; dirty = false;
    try {
      const tmp = file + '.snap';
      try { fs.unlinkSync(tmp); } catch (e) { }
      db.raw.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      const gz = zlib.gzipSync(fs.readFileSync(tmp), { level: 6 }); fs.unlinkSync(tmp);
      if (drive) { await gs(drive, { action: 'save', data: gz.toString('base64') }); last = Date.now(); if (reason) console.log(`Резервная копия на Google Диск: ${(gz.length / 1024).toFixed(0)} КБ (${reason})`); return; }
      const seq = Date.now(), parts = Math.ceil(gz.length / CHUNK);
      for (let i = 0; i < parts; i += 4) await T.pipeline(Array.from({ length: Math.min(4, parts - i) }, (_, k) => ['INSERT INTO snap (seq, i, data) VALUES (?,?,?)', [seq, i + k, gz.subarray((i + k) * CHUNK, (i + k + 1) * CHUNK)]]));
      await T.pipeline([['INSERT INTO snap_meta (seq, parts, size, at) VALUES (?,?,?,?)', [seq, parts, gz.length, Date.now()]], ['DELETE FROM snap WHERE seq < (SELECT MIN(seq) FROM (SELECT seq FROM snap_meta ORDER BY seq DESC LIMIT 3))'], ['DELETE FROM snap_meta WHERE seq < (SELECT MIN(seq) FROM (SELECT seq FROM snap_meta ORDER BY seq DESC LIMIT 3))']]);
      last = Date.now();
      if (reason) console.log(`Резервная копия в Turso: ${(gz.length / 1024).toFixed(0)} КБ (${reason})`);
    } catch (e) { dirty = true; console.error('Резервная копия не удалась:', e.message); }
    finally { busy = false; }
  }
  setInterval(() => save(), (drive ? 2 : 3) * 60e3).unref();
  return { dirty() { dirty = true; }, now: (reason) => { dirty = true; return save(reason || 'сейчас'); }, lastAt: () => last };
}
module.exports = { restore, start };
