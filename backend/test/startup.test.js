import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, SECRET, OWNER } from './helpers.js';

const PROD = { NODE_ENV: 'production', JWT_SECRET: SECRET };

describe('production startup refuses unsafe settings', () => {
  const refuses = async (env, pattern) => {
    const r = await startServer(env);
    if (r.stop) await r.stop();
    assert.equal(r.exitCode, 1, `expected exit code 1, got ${r.exitCode}\n${r.output}`);
    assert.match(r.output, pattern);
  };

  test('missing JWT_SECRET', () => refuses({ ...PROD, JWT_SECRET: '' }, /JWT_SECRET is missing/));
  test('short JWT_SECRET', () => refuses({ ...PROD, JWT_SECRET: 'x'.repeat(31) }, /JWT_SECRET is too short/));
  test('placeholder JWT_SECRET', () =>
    refuses({ ...PROD, JWT_SECRET: 'change-this-secret-in-production-please' }, /JWT_SECRET is too short or a placeholder/));
  test('weak ADMIN_PASSWORD (published demo password)', () =>
    refuses({ ...PROD, ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: 'admin123' }, /ADMIN_PASSWORD must be at least 12/));
  test('well-known ADMIN_PASSWORD', () =>
    refuses({ ...PROD, ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: 'password1234' }, /ADMIN_PASSWORD|well-known/));
  test('ADMIN_PASSWORD containing the email name', () =>
    refuses({ ...PROD, ADMIN_EMAIL: 'shishir@example.com', ADMIN_PASSWORD: 'shishir-2026-xyz' }, /must not contain the email name/));
  test('ADMIN_EMAIL without ADMIN_PASSWORD', () =>
    refuses({ ...PROD, ADMIN_EMAIL: OWNER.email }, /Set both ADMIN_EMAIL and ADMIN_PASSWORD/));
  test('invalid ADMIN_EMAIL', () =>
    refuses({ ...PROD, ADMIN_EMAIL: 'not-an-email', ADMIN_PASSWORD: OWNER.password }, /ADMIN_EMAIL is not a valid/));
});

describe('production startup without ADMIN_* (existing Render service) stays up safely', () => {
  let srv;
  after(() => srv?.stop());

  test('starts, creates no admin and says what to do', async () => {
    srv = await startServer(PROD);
    assert.ok(srv.baseUrl, srv.output);
    assert.match(srv.output(), /No admin account yet/);
    const c = new Client(srv.baseUrl);
    const cfg = await c.get('/api/config');
    assert.deepEqual(cfg.data, { demo: false, signup: 'invite', demoResetHours: null, needsSetup: true });
    // The old published admin does not exist and cannot sign in.
    const r = await c.post('/api/auth/login', { email: 'admin@proctorcode.dev', password: 'admin123' });
    assert.equal(r.status, 401);
  });
});

describe('production mode with a proper admin', () => {
  let srv;
  after(() => srv?.stop());

  test('admin signs in and gets a hardened session cookie', async () => {
    srv = await startServer({ ...PROD, ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password });
    assert.ok(srv.baseUrl, srv.output);
    const c = new Client(srv.baseUrl);
    const r = await c.post('/api/auth/login', { email: OWNER.email, password: OWNER.password });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'admin');
    assert.equal(r.data.token, undefined, 'token must not be exposed to JavaScript');
    const cookie = r.setCookies.find((s) => s.startsWith('__Host-pc_session='));
    assert.ok(cookie, `expected __Host- cookie, got ${r.setCookies}`);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\//i);
    assert.doesNotMatch(cookie, /Domain=/i);
  });

  test('security headers', async () => {
    const res = await fetch(`${srv.baseUrl}/api/health`, { headers: { 'x-forwarded-proto': 'https' } });
    const h = res.headers;
    const csp = h.get('content-security-policy');
    assert.ok(csp, 'CSP header missing');
    for (const part of [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "connect-src 'self'",
    ]) {
      assert.ok(csp.includes(part), `CSP lacks ${part}: ${csp}`);
    }
    assert.ok(!/'unsafe-eval'/.test(csp), 'CSP must not allow unsafe-eval');
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'CSP must not allow inline scripts');
    assert.match(h.get('strict-transport-security') || '', /max-age=\d+/);
    assert.equal(h.get('x-content-type-options'), 'nosniff');
    assert.equal(h.get('x-frame-options'), 'DENY');
    assert.equal(h.get('referrer-policy'), 'no-referrer');
    assert.match(h.get('permissions-policy') || '', /camera=\(self\)/);
    assert.match(h.get('permissions-policy') || '', /microphone=\(\)/);
    assert.equal(h.get('x-powered-by'), null);
    assert.equal(h.get('access-control-allow-origin'), null, 'no CORS in production');
  });

  test('API responses are not cached and errors carry no stack traces', async () => {
    const c = new Client(srv.baseUrl);
    const bad = await c.post('/api/auth/login', undefined, { raw: '{"email": ', headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.data, { error: 'Invalid JSON' });
    assert.equal(bad.headers.get('cache-control'), 'no-store');
    const big = await c.post('/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(300_000) });
    assert.equal(big.status, 413);
    assert.doesNotMatch(JSON.stringify(big.data), /at .*\.js/);
    const missing = await c.get('/api/nope');
    assert.equal(missing.status, 404);
  });

  test('CORS: other sites get no CORS headers', async () => {
    const res = await fetch(`${srv.baseUrl}/api/config`, { headers: { origin: 'https://evil.example' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(`${srv.baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    assert.equal(pre.headers.get('access-control-allow-origin'), null);
  });
});

describe('development mode', () => {
  let srv;
  after(() => srv?.stop());

  test('no HSTS, plain cookie name, still all other headers', async () => {
    srv = await startServer({ ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password });
    const res = await fetch(`${srv.baseUrl}/api/health`);
    assert.equal(res.headers.get('strict-transport-security'), null);
    assert.ok(res.headers.get('content-security-policy'));
    const c = new Client(srv.baseUrl);
    const r = await c.post('/api/auth/login', { email: OWNER.email, password: OWNER.password });
    assert.equal(r.status, 200);
    assert.ok(r.setCookies.some((s) => s.startsWith('pc_session=') && /HttpOnly/i.test(s) && !/Secure/i.test(s)));
  });
});
