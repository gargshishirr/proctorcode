import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'app.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at    TEXT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_violations_attempt ON violations(attempt_id);
`);

export const now = () => new Date().toISOString();
