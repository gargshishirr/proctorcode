import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, loginAs, openDb, newDbPath, OWNER } from './helpers.js';

const DEMO_ENV = { DEMO_MODE: 'true', ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password };
const dbPath = newDbPath();
let srv;

before(async () => {
  srv = await startServer(DEMO_ENV, { dbPath, keepDb: true });
});
after(async () => {
  await srv?.stop();
});

describe('public demo', () => {
  test('config says demo, and normal sign-up is off', async () => {
    const c = new Client(srv.baseUrl);
    const cfg = await c.get('/api/config');
    assert.equal(cfg.data.demo, true);
    assert.equal(cfg.data.signup, 'off');
    const r = await c.post('/api/auth/register', { name: 'N', email: 'n@example.com', password: 'long-enough-1' });
    assert.equal(r.status, 403);
    assert.match(r.data.error, /Try as candidate/);
  });

  test('"Try as candidate" makes a throwaway candidate who can take a test', async () => {
    const c = new Client(srv.baseUrl);
    const r = await c.post('/api/demo/candidate', {});
    assert.equal(r.status, 201);
    assert.equal(r.data.user.role, 'user');
    assert.equal(r.data.user.demo, true);
    assert.match(r.data.user.email, /@demo\.invalid$/);

    const tests = await c.get('/api/tests');
    assert.ok(tests.data.tests.length >= 3);
    const start = await c.post('/api/attempts', { test_id: tests.data.tests[0].id });
    assert.equal(start.status, 201);
    const id = start.data.attempt.id;
    assert.equal((await c.post(`/api/attempts/${id}/violations`, { type: 'no_face' })).status, 201);
    assert.equal((await c.post(`/api/attempts/${id}/submit`, { code: 'console.log(1)' })).status, 200);
    // Retakes are fine in the demo.
    assert.equal((await c.post('/api/attempts', { test_id: tests.data.tests[0].id })).status, 201);
    // Demo accounts can't set a password.
    const pw = await c.post('/api/auth/password', { current_password: 'x', new_password: 'new-password-1' });
    assert.equal(pw.status, 403);
    // Two visitors never share an account.
    const other = await new Client(srv.baseUrl).post('/api/demo/candidate', {});
    assert.notEqual(other.data.user.id, r.data.user.id);
  });

  test('"Try as admin (read-only)" can view everything', async () => {
    const c = new Client(srv.baseUrl);
    const r = await c.post('/api/demo/admin', {});
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'admin');
    assert.equal(r.data.user.demo, true);

    const stats = await c.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    const sessions = await c.get('/api/admin/attempts');
    assert.ok(sessions.data.attempts.length >= 4, 'sample sessions plus the visitor one');
    const report = await c.get(`/api/admin/attempts/${sessions.data.attempts.at(-1).id}`);
    assert.equal(report.status, 200);
    assert.equal((await c.get('/api/tests')).status, 200);
    assert.equal((await c.get('/api/admin/invites')).status, 200);

    const users = await c.get('/api/admin/users');
    assert.ok(!JSON.stringify(users.data).includes(OWNER.email), "the owner's email is not shown");
  });

  test('…but every admin write returns 403 with a friendly message', async () => {
    const c = new Client(srv.baseUrl);
    await c.post('/api/demo/admin', {});
    const tests = (await c.get('/api/tests')).data.tests;
    const attempts = (await c.get('/api/admin/attempts')).data.attempts;
    const users = (await c.get('/api/admin/users')).data.users;
    const writes = [
      ['POST', '/api/tests', { title: 'Hacked' }],
      ['PUT', `/api/tests/${tests[0].id}`, { title: 'Hacked' }],
      ['PUT', `/api/tests/${tests[0].id}`, { is_active: false }],
      ['DELETE', `/api/tests/${tests[0].id}`],
      ['DELETE', `/api/admin/attempts/${attempts[0].id}`],
      ['DELETE', `/api/admin/users/${users[0].id}`],
      ['POST', '/api/admin/invites', {}],
      ['DELETE', '/api/admin/invites/1'],
      ['PUT', '/api/admin/settings', { open_signup: true }],
      ['POST', '/api/auth/password', { current_password: 'x', new_password: 'new-password-1' }],
      ['POST', '/api/auth/logout-all', {}],
      ['POST', '/api/attempts', { test_id: tests[0].id }],
    ];
    for (const [method, path, body] of writes) {
      const r = await c.request(method, path, { body });
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.match(r.data.error, /read-only demo admin/, `${method} ${path}`);
      assert.equal(r.data.readOnly, true);
    }
    const after = (await c.get('/api/tests')).data.tests;
    assert.deepEqual(after.map((t) => [t.id, t.title, t.is_active]), tests.map((t) => [t.id, t.title, t.is_active]));
    assert.equal((await c.get('/api/admin/attempts')).data.attempts.length, attempts.length);
    // Signing out still works.
    assert.equal((await c.post('/api/auth/logout', {})).status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('demo accounts cannot be used with a password', async () => {
    const r = await new Client(srv.baseUrl).post('/api/auth/login', { email: 'demo-admin@demo.invalid', password: '!' });
    assert.equal(r.status, 401);
  });

  test("the owner's real admin keeps full rights in demo mode", async () => {
    const owner = await loginAs(srv.baseUrl, OWNER.email, OWNER.password);
    const t = await owner.post('/api/tests', { title: 'Owner test', duration_minutes: 10 });
    assert.equal(t.status, 201);
  });

  test('demo data is reset on schedule (owner data kept)', async () => {
    const visitor = new Client(srv.baseUrl);
    await visitor.post('/api/demo/candidate', {});
    assert.equal((await visitor.get('/api/auth/me')).status, 200);
    await srv.stop();

    const db = openDb(dbPath);
    db.prepare("UPDATE settings SET value = '2000-01-01T00:00:00.000Z' WHERE key = 'demo_last_reset'").run();
    db.close();

    srv = await startServer(DEMO_ENV, { dbPath });
    assert.match(srv.output(), /Demo data reset/);
    visitor.baseUrl = srv.baseUrl;
    visitor.origin = srv.baseUrl;
    assert.equal((await visitor.get('/api/auth/me')).status, 401, 'visitor accounts are wiped');
    const owner = await loginAs(srv.baseUrl, OWNER.email, OWNER.password);
    const titles = (await owner.get('/api/tests')).data.tests.map((t) => t.title);
    assert.ok(titles.includes('Owner test'));
    assert.equal(titles.filter((t) => t === 'Two Sum').length, 1, 'samples are recreated once, not duplicated');
    const sessions = (await owner.get('/api/admin/attempts')).data.attempts;
    assert.equal(sessions.length, 3, 'only the three sample sessions remain');
  });
});
