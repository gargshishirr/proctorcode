import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { startServer, Client, loginAs, inviteCandidate, openDb, OWNER, SECRET } from './helpers.js';

const SIGNUP_FAILED =
  "We couldn't create this account. Check your invite code. If you already have an account, sign in instead.";

let srv;
let admin;

before(async () => {
  srv = await startServer({ ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password });
  admin = await loginAs(srv.baseUrl, OWNER.email, OWNER.password);
});
after(() => srv?.stop());

describe('invite-only registration', () => {
  test('sign-up needs an invite by default', async () => {
    const cfg = await new Client(srv.baseUrl).get('/api/config');
    assert.equal(cfg.data.signup, 'invite');
    const r = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'No Invite',
      email: 'noinvite@example.com',
      password: 'long-enough-pw',
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, SIGNUP_FAILED);
  });

  test('a valid invite works once, and "role: admin" is ignored', async () => {
    const inv = await admin.post('/api/admin/invites', { note: 'Batch A' });
    assert.equal(inv.status, 201);
    assert.ok(inv.data.code.length >= 20);
    assert.equal(inv.data.invite.code_hash, undefined, 'hash must not be sent');

    const c = new Client(srv.baseUrl);
    const r = await c.post('/api/auth/register', {
      name: 'Ada',
      email: '  Ada@Example.COM ',
      password: 'ada-password-1',
      invite: inv.data.code,
      role: 'admin',
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.user.role, 'user');
    assert.equal(r.data.user.email, 'ada@example.com', 'email is normalised');
    assert.equal((await c.get('/api/admin/stats')).status, 403);

    const again = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'Eve',
      email: 'eve@example.com',
      password: 'eve-password-1',
      invite: inv.data.code,
    });
    assert.equal(again.status, 400);
    assert.equal(again.data.error, SIGNUP_FAILED);

    const list = await admin.get('/api/admin/invites');
    const row = list.data.invites.find((i) => i.id === inv.data.invite.id);
    assert.equal(row.uses, 1);
    assert.equal(row.code_hash, undefined);
  });

  test('an email-bound invite only works for that email', async () => {
    const inv = await admin.post('/api/admin/invites', { email: 'bound@example.com' });
    const wrong = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'Mallory',
      email: 'mallory@example.com',
      password: 'mallory-pass-1',
      invite: inv.data.code,
    });
    assert.equal(wrong.status, 400);
    const right = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'Bound',
      email: 'BOUND@example.com',
      password: 'bound-pass-123',
      invite: inv.data.code,
    });
    assert.equal(right.status, 201);
  });

  test('revoked and expired invites are refused', async () => {
    const revoked = await admin.post('/api/admin/invites', {});
    assert.equal((await admin.del(`/api/admin/invites/${revoked.data.invite.id}`)).status, 200);
    const r1 = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'R',
      email: 'revoked@example.com',
      password: 'revoked-pass-1',
      invite: revoked.data.code,
    });
    assert.equal(r1.status, 400);

    const expired = await admin.post('/api/admin/invites', { max_uses: 5 });
    const db = openDb(srv.dbPath);
    db.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', expired.data.invite.id);
    db.close();
    const r2 = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'X',
      email: 'expired@example.com',
      password: 'expired-pass-1',
      invite: expired.data.code,
    });
    assert.equal(r2.status, 400);
  });

  test('an existing email gets the same reply as a bad invite (no account enumeration)', async () => {
    const inv = await admin.post('/api/admin/invites', {});
    const dup = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'Dup',
      email: 'ada@example.com',
      password: 'whatever-pass-1',
      invite: inv.data.code,
    });
    assert.equal(dup.status, 400);
    assert.equal(dup.data.error, SIGNUP_FAILED);
    // The invite was not used up by the failed attempt.
    const ok = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'Fresh',
      email: 'fresh@example.com',
      password: 'fresh-pass-123',
      invite: inv.data.code,
    });
    assert.equal(ok.status, 201);
  });

  test('password rules and input validation', async () => {
    const inv = await admin.post('/api/admin/invites', { max_uses: 10 });
    const c = new Client(srv.baseUrl);
    const short = await c.post('/api/auth/register', { name: 'S', email: 's@example.com', password: 'short', invite: inv.data.code });
    assert.equal(short.status, 400);
    assert.match(short.data.error, /at least 8/);
    const badEmail = await c.post('/api/auth/register', { name: 'S', email: 'nope', password: 'long-enough-1', invite: inv.data.code });
    assert.equal(badEmail.status, 400);
    const objName = await c.post('/api/auth/register', { name: { $gt: '' }, email: 's@example.com', password: 'long-enough-1', invite: inv.data.code });
    assert.equal(objName.status, 400);
    const tooLong = await c.post('/api/auth/register', { name: 'S', email: 's@example.com', password: 'é'.repeat(40), invite: inv.data.code });
    assert.equal(tooLong.status, 400);
  });

  test('admins can switch on open sign-up', async () => {
    assert.equal((await admin.put('/api/admin/settings', { open_signup: true })).status, 200);
    assert.equal((await new Client(srv.baseUrl).get('/api/config')).data.signup, 'open');
    const r = await new Client(srv.baseUrl).post('/api/auth/register', {
      name: 'Open',
      email: 'open@example.com',
      password: 'open-pass-123',
    });
    assert.equal(r.status, 201);
    assert.equal((await admin.put('/api/admin/settings', { open_signup: false })).status, 200);
    assert.equal((await new Client(srv.baseUrl).get('/api/config')).data.signup, 'invite');
  });

  test('the demo endpoints do not exist outside demo mode', async () => {
    const r = await new Client(srv.baseUrl).post('/api/demo/candidate', {});
    assert.equal(r.status, 404);
  });
});

describe('sign-in', () => {
  test('wrong password and unknown email get the same reply', async () => {
    const a = await new Client(srv.baseUrl).post('/api/auth/login', { email: 'ada@example.com', password: 'nope-nope-nope' });
    const b = await new Client(srv.baseUrl).post('/api/auth/login', { email: 'ghost@example.com', password: 'nope-nope-nope' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.data, b.data);
  });

  test('email is case-insensitive and passwords are bcrypt cost 12', async () => {
    const c = await loginAs(srv.baseUrl, 'ADA@example.com ', 'ada-password-1');
    assert.equal((await c.get('/api/auth/me')).data.user.email, 'ada@example.com');
    const db = openDb(srv.dbPath);
    const { password_hash } = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('ada@example.com');
    db.close();
    assert.match(password_hash, /^\$2[aby]\$12\$/);
  });

  test('locks after 5 bad passwords, even for the right password, same for unknown emails', async () => {
    const ip = '10.99.0.1';
    for (const email of ['fresh@example.com', 'nobody-here@example.com']) {
      const c = new Client(srv.baseUrl, { ip });
      const statuses = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await c.post('/api/auth/login', { email, password: `wrong-${i}-password` })).status);
      }
      assert.deepEqual(statuses, [401, 401, 401, 401, 429], email);
      const locked = await c.post('/api/auth/login', { email, password: 'fresh-pass-123' });
      assert.equal(locked.status, 429);
      assert.match(locked.data.error, /Too many failed sign-in attempts/);
      assert.ok(Number(locked.headers.get('retry-after')) > 0);
    }
    // Someone else (another IP) can still sign in to the same account.
    const other = new Client(srv.baseUrl, { ip: '10.99.0.2' });
    assert.equal((await other.post('/api/auth/login', { email: 'fresh@example.com', password: 'fresh-pass-123' })).status, 200);
  });

  test('missing fields', async () => {
    const r = await new Client(srv.baseUrl).post('/api/auth/login', { email: 'ada@example.com' });
    assert.equal(r.status, 400);
  });
});

describe('sessions and token revocation', () => {
  test('logout revokes the token on the server', async () => {
    const c = await loginAs(srv.baseUrl, 'ada@example.com', 'ada-password-1');
    const stolen = c.cookieHeader();
    assert.equal((await c.get('/api/auth/me')).status, 200);
    assert.equal((await c.post('/api/auth/logout', {})).status, 200);
    const replay = await new Client(srv.baseUrl).get('/api/auth/me', { headers: { cookie: stolen } });
    assert.equal(replay.status, 401);
  });

  test('changing the password signs out every other session', async () => {
    const a = await loginAs(srv.baseUrl, 'bound@example.com', 'bound-pass-123');
    const b = await loginAs(srv.baseUrl, 'bound@example.com', 'bound-pass-123');
    const oldA = a.cookieHeader();

    const wrong = await a.post('/api/auth/password', { current_password: 'not-it-at-all', new_password: 'brand-new-pass-1' });
    assert.equal(wrong.status, 400);
    const weak = await a.post('/api/auth/password', { current_password: 'bound-pass-123', new_password: 'short' });
    assert.equal(weak.status, 400);

    const ok = await a.post('/api/auth/password', { current_password: 'bound-pass-123', new_password: 'brand-new-pass-1' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal((await a.get('/api/auth/me')).status, 200, 'the device that changed it stays signed in');
    assert.equal((await b.get('/api/auth/me')).status, 401, 'other sessions are revoked');
    assert.equal((await new Client(srv.baseUrl).get('/api/auth/me', { headers: { cookie: oldA } })).status, 401);

    const oldPw = await new Client(srv.baseUrl).post('/api/auth/login', { email: 'bound@example.com', password: 'bound-pass-123' });
    assert.equal(oldPw.status, 401);
    await loginAs(srv.baseUrl, 'bound@example.com', 'brand-new-pass-1');
  });

  test('signing in again replaces the old session', async () => {
    const c = await loginAs(srv.baseUrl, 'ada@example.com', 'ada-password-1');
    const first = c.cookieHeader();
    assert.equal((await c.post('/api/auth/login', { email: 'ada@example.com', password: 'ada-password-1' })).status, 200);
    assert.notEqual(c.cookieHeader(), first);
    assert.equal((await new Client(srv.baseUrl).get('/api/auth/me', { headers: { cookie: first } })).status, 401);
    assert.equal((await c.get('/api/auth/me')).status, 200);
  });

  test('the app can check the session without a 401 when signed out', async () => {
    const anon = await new Client(srv.baseUrl).get('/api/auth/session');
    assert.equal(anon.status, 200);
    assert.deepEqual(anon.data, { user: null });
    const c = await loginAs(srv.baseUrl, 'ada@example.com', 'ada-password-1');
    assert.equal((await c.get('/api/auth/session')).data.user.email, 'ada@example.com');
  });

  test('sign out everywhere', async () => {
    const a = await loginAs(srv.baseUrl, 'open@example.com', 'open-pass-123');
    const b = await loginAs(srv.baseUrl, 'open@example.com', 'open-pass-123');
    assert.equal((await a.post('/api/auth/logout-all', {})).status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 401);
    assert.equal((await b.get('/api/auth/me')).status, 401);
  });

  test('forged or altered tokens are rejected', async () => {
    const c = await loginAs(srv.baseUrl, 'ada@example.com', 'ada-password-1');
    const [name, token] = c.cookieHeader().split('=');
    const claims = jwt.decode(token);
    const me = (t) => new Client(srv.baseUrl).get('/api/auth/me', { headers: { cookie: `${name}=${t}` } });

    const asAdmin = jwt.sign({ ...claims, role: 'admin', sub: '1' }, 'wrong-secret-'.repeat(4), { algorithm: 'HS256' });
    assert.equal((await me(asAdmin)).status, 401);

    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ ...claims, sub: '1' })
    ).toString('base64url')}.`;
    assert.equal((await me(none)).status, 401);

    const { iat, exp, aud, ...rest } = claims;
    const wrongAud = jwt.sign({ ...rest, aud: 'other' }, SECRET, { algorithm: 'HS256', expiresIn: 600 });
    assert.equal((await me(wrongAud)).status, 401);

    const hs512 = jwt.sign({ ...rest, aud }, SECRET, { algorithm: 'HS512', expiresIn: 600 });
    assert.equal((await me(hs512)).status, 401, 'only HS256 is accepted');

    // Right secret but a made-up session id: still rejected because sessions live on the server.
    const fakeSid = jwt.sign({ ...rest, aud, sid: 'made-up' }, SECRET, { algorithm: 'HS256', expiresIn: 600 });
    assert.equal((await me(fakeSid)).status, 401);
    assert.ok(iat && exp);
  });
});

describe('CSRF protection', () => {
  test('writes from another origin are blocked', async () => {
    const c = await loginAs(srv.baseUrl, 'ada@example.com', 'ada-password-1');
    const evil = await c.post('/api/auth/logout-all', {}, { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    const nullOrigin = await c.post('/api/auth/logout-all', {}, { headers: { origin: 'null' } });
    assert.equal(nullOrigin.status, 403);
    const fetchMeta = await c.post('/api/auth/logout-all', {}, { headers: { origin: undefined, 'sec-fetch-site': 'cross-site' } });
    assert.equal(fetchMeta.status, 403);
    const form = await c.request('POST', '/api/auth/logout-all', {
      raw: 'a=b',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(form.status, 415);
    assert.equal((await c.get('/api/auth/me')).status, 200, 'still signed in');
  });
});
