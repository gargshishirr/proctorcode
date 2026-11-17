import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { startServer, Client, loginAs, openDb, newDbPath, OWNER, SECRET } from './helpers.js';

const PROD = { NODE_ENV: 'production', JWT_SECRET: SECRET, ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password };
const removeDb = (p) => ['', '-wal', '-shm'].forEach((s) => rmSync(p + s, { force: true }));

describe('upgrading a database from the old version', () => {
  test('old public accounts are disabled, old rows get migrated', async () => {
    const dbPath = newDbPath();
    // The schema and seed data of the previous release.
    const old = new DatabaseSync(dbPath);
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')), created_at TEXT NOT NULL);
      CREATE TABLE tests (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        language TEXT NOT NULL DEFAULT 'javascript', duration_minutes INTEGER NOT NULL DEFAULT 30, starter_code TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
      CREATE TABLE attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, code TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','terminated')),
        integrity_score INTEGER NOT NULL DEFAULT 100, started_at TEXT NOT NULL, submitted_at TEXT);
      CREATE TABLE violations (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'medium', details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    `);
    const t = new Date().toISOString();
    const add = old.prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)');
    add.run('Platform Admin', 'admin@proctorcode.dev', bcrypt.hashSync('admin123', 10), 'admin', t);
    add.run('Demo Candidate', 'candidate@proctorcode.dev', bcrypt.hashSync('test123', 10), 'user', t);
    add.run('Old Candidate', 'old@example.com', bcrypt.hashSync('old-password-1', 10), 'user', t);
    old.prepare("INSERT INTO tests (title, created_by, created_at) VALUES ('Old test', 1, ?)").run(t);
    old.prepare("INSERT INTO attempts (test_id, user_id, status, started_at) VALUES (1, 3, 'submitted', ?)").run(t);
    old.close();

    const srv = await startServer(PROD, { dbPath, keepDb: true });
    try {
      assert.match(srv.output(), /Disabled old account admin@proctorcode\.dev/);
      const c = new Client(srv.baseUrl);
      assert.equal((await c.post('/api/auth/login', { email: 'admin@proctorcode.dev', password: 'admin123' })).status, 401);
      assert.equal((await c.post('/api/auth/login', { email: 'candidate@proctorcode.dev', password: 'test123' })).status, 401);

      // Real accounts keep working, and their bcrypt cost is raised to 12 on sign-in.
      await loginAs(srv.baseUrl, 'old@example.com', 'old-password-1');
      const db = openDb(dbPath);
      const { password_hash } = db.prepare("SELECT password_hash FROM users WHERE email = 'old@example.com'").get();
      const attempt = db.prepare('SELECT deadline_at FROM attempts WHERE id = 1').get();
      db.close();
      assert.match(password_hash, /^\$2[aby]\$12\$/);
      assert.ok(attempt.deadline_at, 'old attempts get a deadline');

      const owner = await loginAs(srv.baseUrl, OWNER.email, OWNER.password);
      assert.equal((await owner.get('/api/admin/attempts')).data.attempts.length, 1);
    } finally {
      await srv.stop();
      removeDb(dbPath);
    }
  });
});

describe('admin password from ADMIN_PASSWORD', () => {
  test('a password changed in the app is kept until ADMIN_PASSWORD itself changes', async () => {
    const dbPath = newDbPath();
    const inApp = 'Changed-In-The-App-42';
    const rotated = 'Brand-New-Env-Secret-77';
    try {
      let srv = await startServer(PROD, { dbPath, keepDb: true });
      const owner = await loginAs(srv.baseUrl, OWNER.email, OWNER.password);
      const changed = await owner.post('/api/auth/password', { current_password: OWNER.password, new_password: inApp });
      assert.equal(changed.status, 200);
      await srv.stop();

      // Restart with the same ADMIN_PASSWORD: the in-app password still works.
      srv = await startServer(PROD, { dbPath, keepDb: true });
      await loginAs(srv.baseUrl, OWNER.email, inApp);
      const stale = await loginAs(srv.baseUrl, OWNER.email, inApp);
      await srv.stop();

      // Restart with a new ADMIN_PASSWORD: it resets the password and signs out old sessions.
      srv = await startServer({ ...PROD, ADMIN_PASSWORD: rotated }, { dbPath, keepDb: true });
      stale.baseUrl = srv.baseUrl;
      stale.origin = srv.baseUrl;
      assert.equal((await stale.get('/api/auth/me')).status, 401);
      assert.equal((await new Client(srv.baseUrl).post('/api/auth/login', { email: OWNER.email, password: inApp })).status, 401);
      await loginAs(srv.baseUrl, OWNER.email, rotated);
      await srv.stop();
    } finally {
      removeDb(dbPath);
    }
  });

  test('ADMIN_EMAIL of an existing candidate makes it admin with the env password', async () => {
    const dbPath = newDbPath();
    try {
      let srv = await startServer({ ...PROD, ADMIN_EMAIL: 'first-admin@example.com' }, { dbPath, keepDb: true });
      const admin = await loginAs(srv.baseUrl, 'first-admin@example.com', OWNER.password);
      await admin.put('/api/admin/settings', { open_signup: true });
      const squatter = new Client(srv.baseUrl);
      const r = await squatter.post('/api/auth/register', { name: 'Squatter', email: 'new-owner@example.com', password: 'squatter-pass-1' });
      assert.equal(r.status, 201);
      await srv.stop();

      srv = await startServer({ ...PROD, ADMIN_EMAIL: 'new-owner@example.com' }, { dbPath, keepDb: true });
      squatter.baseUrl = srv.baseUrl;
      squatter.origin = srv.baseUrl;
      assert.equal((await squatter.get('/api/auth/me')).status, 401, "the squatter's session is revoked");
      const bad = await new Client(srv.baseUrl).post('/api/auth/login', { email: 'new-owner@example.com', password: 'squatter-pass-1' });
      assert.equal(bad.status, 401, "the squatter's password no longer works");
      const owner = await loginAs(srv.baseUrl, 'new-owner@example.com', OWNER.password);
      assert.equal((await owner.get('/api/auth/me')).data.user.role, 'admin');
      await srv.stop();
    } finally {
      removeDb(dbPath);
    }
  });
});
