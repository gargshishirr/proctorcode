import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, loginAs, inviteCandidate, openDb, OWNER } from './helpers.js';

let srv;
let admin;
let alice;
let bob;
let testId;

before(async () => {
  srv = await startServer({ ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password });
  admin = await loginAs(srv.baseUrl, OWNER.email, OWNER.password);
  alice = await inviteCandidate(srv.baseUrl, admin, { name: 'Alice', email: 'alice@example.com' });
  bob = await inviteCandidate(srv.baseUrl, admin, { name: 'Bob', email: 'bob@example.com' });
  const t = await admin.post('/api/tests', {
    title: 'Reverse a string',
    description: '## Reverse\nReturn the reversed string.',
    language: 'javascript',
    duration_minutes: 20,
    starter_code: 'function reverse(s) {}\n',
  });
  assert.equal(t.status, 201);
  testId = t.data.test.id;
});
after(() => srv?.stop());

describe('role checks on the server', () => {
  const adminOnly = [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/attempts'],
    ['GET', '/api/admin/attempts/1'],
    ['DELETE', '/api/admin/attempts/1'],
    ['GET', '/api/admin/users'],
    ['DELETE', '/api/admin/users/1'],
    ['GET', '/api/admin/invites'],
    ['POST', '/api/admin/invites'],
    ['DELETE', '/api/admin/invites/1'],
    ['GET', '/api/admin/settings'],
    ['PUT', '/api/admin/settings'],
    ['POST', '/api/tests'],
    ['PUT', '/api/tests/1'],
    ['DELETE', '/api/tests/1'],
  ];

  test('signed-out requests get 401', async () => {
    const anon = new Client(srv.baseUrl);
    for (const [method, path] of adminOnly) {
      const r = await anon.request(method, path, { body: method === 'GET' ? undefined : {} });
      assert.equal(r.status, 401, `${method} ${path}`);
    }
    assert.equal((await anon.get('/api/tests')).status, 401);
    assert.equal((await anon.get('/api/attempts/mine')).status, 401);
  });

  test('candidates get 403 on every admin route', async () => {
    for (const [method, path] of adminOnly) {
      const r = await alice.request(method, path, { body: method === 'GET' ? undefined : { open_signup: true, title: 'x' } });
      assert.equal(r.status, 403, `${method} ${path}`);
    }
    const tests = await admin.get('/api/tests');
    assert.equal(tests.data.tests.length, 1, 'nothing was created or deleted');
  });

  test('admins cannot take tests', async () => {
    const r = await admin.post('/api/attempts', { test_id: testId });
    assert.equal(r.status, 403);
  });

  test('candidates only see safe test fields and only active tests', async () => {
    const list = await alice.get('/api/tests');
    assert.equal(list.status, 200);
    assert.deepEqual(Object.keys(list.data.tests[0]).sort(), ['description', 'duration_minutes', 'id', 'language', 'starter_code', 'title']);

    const hidden = await admin.post('/api/tests', { title: 'Hidden draft', is_active: false });
    assert.equal((await alice.get(`/api/tests/${hidden.data.test.id}`)).status, 404);
    assert.ok(!(await alice.get('/api/tests')).data.tests.some((t) => t.id === hidden.data.test.id));
    assert.equal((await alice.post('/api/attempts', { test_id: hidden.data.test.id })).status, 404);
    await admin.del(`/api/tests/${hidden.data.test.id}`);
  });
});

describe('attempts: ownership (IDOR) and immutability', () => {
  let attemptId;

  test('a candidate can start, save and read their own attempt', async () => {
    const r = await alice.post('/api/attempts', { test_id: testId });
    assert.equal(r.status, 201);
    attemptId = r.data.attempt.id;
    assert.equal(r.data.attempt.code, 'function reverse(s) {}\n');
    assert.ok(r.data.attempt.deadline_at);
    assert.equal(r.data.attempt.user_id, undefined);

    const resumed = await alice.post('/api/attempts', { test_id: testId });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.attempt.id, attemptId);

    assert.equal((await alice.put(`/api/attempts/${attemptId}/code`, { code: 'alice v1' })).status, 200);
    const mine = await alice.get(`/api/attempts/${attemptId}`);
    assert.equal(mine.data.attempt.code, 'alice v1');
  });

  test("another candidate can't read or change it (404, no hints)", async () => {
    assert.equal((await bob.get(`/api/attempts/${attemptId}`)).status, 404);
    assert.equal((await bob.put(`/api/attempts/${attemptId}/code`, { code: 'bob was here' })).status, 404);
    assert.equal((await bob.post(`/api/attempts/${attemptId}/violations`, { type: 'paste' })).status, 404);
    assert.equal((await bob.post(`/api/attempts/${attemptId}/submit`, { code: 'bob' })).status, 404);
    assert.ok(!(await bob.get('/api/attempts/mine')).data.attempts.some((a) => a.id === attemptId));
    assert.equal((await bob.get('/api/attempts/999999')).status, 404);
    assert.equal((await bob.get('/api/attempts/abc')).status, 404);

    const mine = await alice.get(`/api/attempts/${attemptId}`);
    assert.equal(mine.data.attempt.code, 'alice v1');
    assert.equal(mine.data.violations.length, 0);
    assert.equal(mine.data.attempt.status, 'in_progress');
  });

  test('admins review through admin routes but cannot write to candidate attempts', async () => {
    const report = await admin.get(`/api/admin/attempts/${attemptId}`);
    assert.equal(report.status, 200);
    assert.equal(report.data.attempt.candidate_email, 'alice@example.com');
    assert.equal((await admin.put(`/api/attempts/${attemptId}/code`, { code: 'admin edit' })).status, 403);
  });

  test('the server decides severity and only known event types are accepted', async () => {
    const unknown = await alice.post(`/api/attempts/${attemptId}/violations`, { type: '<img src=x onerror=alert(1)>' });
    assert.equal(unknown.status, 400);
    const paste = await alice.post(`/api/attempts/${attemptId}/violations`, { type: 'paste', severity: 'low', details: 'Paste action detected' });
    assert.equal(paste.status, 201);
    assert.equal(paste.data.integrity_score, 90, 'paste is high severity whatever the client says');
    const long = await alice.post(`/api/attempts/${attemptId}/violations`, { type: 'copy', details: 'x'.repeat(500) });
    assert.equal(long.status, 400);
  });

  test('a submitted attempt can no longer be changed', async () => {
    const sub = await alice.post(`/api/attempts/${attemptId}/submit`, { code: 'final answer' });
    assert.equal(sub.status, 200);
    assert.equal(sub.data.attempt.status, 'submitted');
    assert.equal((await alice.put(`/api/attempts/${attemptId}/code`, { code: 'sneaky edit' })).status, 409);
    assert.equal((await alice.post(`/api/attempts/${attemptId}/violations`, { type: 'copy' })).status, 409);
    assert.equal((await alice.post(`/api/attempts/${attemptId}/submit`, { code: 'sneaky edit' })).status, 409);
    assert.equal((await alice.get(`/api/attempts/${attemptId}`)).data.attempt.code, 'final answer');
  });

  test('one attempt per test for real candidates', async () => {
    const again = await alice.post('/api/attempts', { test_id: testId });
    assert.equal(again.status, 409);
  });

  test('time limits are enforced by the server', async () => {
    const start = await bob.post('/api/attempts', { test_id: testId });
    const id = start.data.attempt.id;
    await bob.put(`/api/attempts/${id}/code`, { code: 'saved in time' });
    const db = openDb(srv.dbPath);
    db.prepare('UPDATE attempts SET deadline_at = ? WHERE id = ?').run(new Date(Date.now() - 10 * 60_000).toISOString(), id);
    db.close();
    const late = await bob.put(`/api/attempts/${id}/code`, { code: 'written after time' });
    assert.equal(late.status, 409);
    const after = await bob.get(`/api/attempts/${id}`);
    assert.equal(after.data.attempt.status, 'submitted');
    assert.equal(after.data.attempt.code, 'saved in time');
  });

  test('reaching zero integrity ends the attempt on the server', async () => {
    const carol = await inviteCandidate(srv.baseUrl, admin, { name: 'Carol', email: 'carol@example.com' });
    const id = (await carol.post('/api/attempts', { test_id: testId })).data.attempt.id;
    let last;
    for (let i = 0; i < 10; i++) last = await carol.post(`/api/attempts/${id}/violations`, { type: 'tab_switch' });
    assert.equal(last.data.integrity_score, 0);
    assert.equal(last.data.status, 'terminated');
    assert.equal((await carol.put(`/api/attempts/${id}/code`, { code: 'more' })).status, 409);
  });

  test('admins can delete a session so the candidate may retake it', async () => {
    const report = await admin.get('/api/admin/attempts');
    const aliceSession = report.data.attempts.find((a) => a.candidate_email === 'alice@example.com');
    assert.equal((await admin.del(`/api/admin/attempts/${aliceSession.id}`)).status, 200);
    assert.equal((await alice.post('/api/attempts', { test_id: testId })).status, 201);
  });
});

describe('input validation', () => {
  test('test fields are checked', async () => {
    assert.equal((await admin.post('/api/tests', {})).status, 400);
    assert.equal((await admin.post('/api/tests', { title: '   ' })).status, 400);
    assert.equal((await admin.post('/api/tests', { title: 'X', language: 'brainfuck' })).status, 400);
    assert.equal((await admin.post('/api/tests', { title: 'X', duration_minutes: 0 })).status, 400);
    assert.equal((await admin.post('/api/tests', { title: 'X', duration_minutes: 99999 })).status, 400);
    assert.equal((await admin.post('/api/tests', { title: 'X', is_active: 'yes' })).status, 400);
    assert.equal((await admin.post('/api/tests', { title: ['X'] })).status, 400);
    assert.equal((await admin.put('/api/tests/999999', { title: 'X' })).status, 404);
  });

  test('code size is limited', async () => {
    const dave = await inviteCandidate(srv.baseUrl, admin, { name: 'Dave', email: 'dave@example.com' });
    const id = (await dave.post('/api/attempts', { test_id: testId })).data.attempt.id;
    const big = await dave.put(`/api/attempts/${id}/code`, { code: 'x'.repeat(100_001) });
    assert.equal(big.status, 400);
    const huge = await dave.put(`/api/attempts/${id}/code`, { code: 'x'.repeat(400_000) });
    assert.equal(huge.status, 413);
  });

  test('candidate names are stored and returned as plain text', async () => {
    const evil = await inviteCandidate(srv.baseUrl, admin, {
      name: '<img src=x onerror=alert(1)>',
      email: 'xss@example.com',
    });
    const me = await evil.get('/api/auth/me');
    assert.equal(me.data.user.name, '<img src=x onerror=alert(1)>');
    assert.match(me.headers.get('content-type'), /application\/json/);
  });

  test('admins can remove a candidate and their data', async () => {
    const users = await admin.get('/api/admin/users');
    assert.ok(users.data.users.every((u) => u.role === 'user'), 'admin accounts are not listed');
    const dave = users.data.users.find((u) => u.email === 'dave@example.com');
    assert.equal((await admin.del(`/api/admin/users/${dave.id}`)).status, 200);
    const sessions = await admin.get('/api/admin/attempts');
    assert.ok(!sessions.data.attempts.some((a) => a.candidate_email === 'dave@example.com'));
    const ownerRow = (await admin.get('/api/auth/me')).data.user;
    assert.equal((await admin.del(`/api/admin/users/${ownerRow.id}`)).status, 404, 'admins cannot be deleted here');
  });
});
