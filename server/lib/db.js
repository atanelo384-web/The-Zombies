// SQLite database (built into Node 22+, no install, one file: data/tz.db)
'use strict';
process.removeAllListeners('warning'); // hide "SQLite is experimental"
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pubid TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      pass_hash TEXT,
      google_sub TEXT UNIQUE,
      apple_sub TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created INTEGER NOT NULL,
      last_seen INTEGER NOT NULL DEFAULT 0,
      banned_until INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      sus REAL NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      ac TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS users_name ON users(name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL, expires INTEGER NOT NULL, ip TEXT, ua TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS codes (
      email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL,
      expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL,
      PRIMARY KEY (email, purpose)
    );
    CREATE TABLE IF NOT EXISTS friends (
      a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL, created INTEGER NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE INDEX IF NOT EXISTS friends_b ON friends(b);
    CREATE TABLE IF NOT EXISTS blocks (a INTEGER NOT NULL, b INTEGER NOT NULL, PRIMARY KEY (a, b));
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL, created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, id);
    CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, read);
    CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, tag TEXT NOT NULL, color TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
      pvp INTEGER NOT NULL DEFAULT 0, markers INTEGER NOT NULL DEFAULT 1, open INTEGER NOT NULL DEFAULT 0,
      owner INTEGER NOT NULL, created INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS clans_name ON clans(name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS clan_members (
      clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL, joined INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS clan_members_clan ON clan_members(clan_id);
    CREATE TABLE IF NOT EXISTS clan_invites (
      clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_id INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (clan_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS clan_msgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_id INTEGER NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS clan_msgs_clan ON clan_msgs(clan_id, id);
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
      max INTEGER NOT NULL DEFAULT 16, pvp INTEGER NOT NULL DEFAULT 0, diff TEXT NOT NULL DEFAULT 'normal',
      seed INTEGER NOT NULL, created INTEGER NOT NULL, paid_until INTEGER NOT NULL,
      bans TEXT NOT NULL DEFAULT '[]', peak INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      label TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      product TEXT NOT NULL, price INTEGER NOT NULL, meta TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new', created INTEGER NOT NULL, paid_at INTEGER, op_id TEXT UNIQUE, paid_sum REAL
    );
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
    CREATE TABLE IF NOT EXISTS skins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, png BLOB NOT NULL, status TEXT NOT NULL DEFAULT 'ok', created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS skins_user ON skins(user_id);
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL, updated INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_msgs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, staff INTEGER NOT NULL DEFAULT 0, text TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worlds (sid INTEGER PRIMARY KEY, data BLOB NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, by_id INTEGER, kind TEXT NOT NULL, detail TEXT, created INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reports_user ON reports(user_id);
  `);
  // tiny helpers
  const cache = new Map();
  const st = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const api = {
    raw: db,
    get: (sql, ...a) => st(sql).get(...a),
    all: (sql, ...a) => st(sql).all(...a),
    run: (sql, ...a) => { const r = st(sql).run(...a); if (api.onWrite) api.onWrite(); return r; },
    tx(fn) { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { } throw e; } },
  };
  return api;
}
module.exports = { open };
