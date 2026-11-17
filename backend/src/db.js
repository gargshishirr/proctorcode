import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { config } from './config.js';

// The database holds password hashes and candidate data: keep new files private to this OS user.
try {
  process.umask(0o077);
} catch {
  /* not supported here */
}
mkdirSync(dirname(config.dbPath), { recursive: true, mode: 0o700 });

export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// Files from older versions may have been created world-readable.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    if (existsSync(config.dbPath + suffix)) chmodSync(config.dbPath + suffix, 0o600);
  } catch {
    /* not supported on this file system */
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  is_demo       INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,           -- SHA-256 of the random session id inside the token
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,              -- absolute end of the session
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash   TEXT NOT NULL UNIQUE,         -- SHA-256 of the invite code; the code itself is shown once
  hint        TEXT NOT NULL,                -- last characters, so admins can recognise a code
  note        TEXT NOT NULL DEFAULT '',
  email       TEXT,                         -- optional: only this email may use the invite
  max_uses    INTEGER NOT NULL DEFAULT 1,
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  language         TEXT NOT NULL DEFAULT 'javascript',
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  starter_code     TEXT NOT NULL DEFAULT '',
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id         INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','terminated')),
  integrity_score INTEGER NOT NULL DEFAULT 100,
  started_at      TEXT NOT NULL,
  deadline_at     TEXT,
  submitted_at    TEXT
);

CREATE TABLE IF NOT EXISTS violations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  details    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

// ---- Upgrade databases created by older versions ----
function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
if (!hasColumn('users', 'is_demo')) db.exec('ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
if (!hasColumn('users', 'token_version')) db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
if (!hasColumn('attempts', 'deadline_at')) db.exec('ALTER TABLE attempts ADD COLUMN deadline_at TEXT');

// Older attempts have no stored deadline: derive it from the test duration.
for (const row of db
  .prepare(
    `SELECT a.id, a.started_at, t.duration_minutes FROM attempts a JOIN tests t ON t.id = a.test_id
     WHERE a.deadline_at IS NULL`
  )
  .all()) {
  const deadline = new Date(new Date(row.started_at).getTime() + row.duration_minutes * 60_000).toISOString();
  db.prepare('UPDATE attempts SET deadline_at = ? WHERE id = ?').run(deadline, row.id);
}

db.exec(`
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_violations_attempt ON violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status, deadline_at);
`);

export const now = () => new Date().toISOString();

/** Runs fn inside a transaction (node:sqlite has no helper for this). */
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}
