// Test helpers: start the real server in a child process on a random port with its own
// temporary database inside the repo (backend/test/.tmp), and talk to it with fetch.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const tmpDir = join(backendDir, 'test', '.tmp');

export const SECRET = randomBytes(32).toString('hex');
export const OWNER = { email: 'owner@example.com', password: 'Grape-Orbit-Lantern-71' };

export function newDbPath() {
  mkdirSync(tmpDir, { recursive: true });
  return join(tmpDir, `t-${process.pid}-${randomBytes(4).toString('hex')}.db`);
}

/**
 * Starts src/server.js. Resolves with { baseUrl } once it listens, or { exitCode, output }
 * when it exits first (used for "refuses to start" tests).
 */
export async function startServer(env = {}, { dbPath = newDbPath(), keepDb = false } = {}) {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], {
    cwd: backendDir,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      PORT: '0',
      HOST: '127.0.0.1',
      DB_PATH: dbPath,
      JWT_SECRET: SECRET,
      TRUST_PROXY: 'loopback',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const ready = new Promise((resolve) => {
    const onData = (d) => {
      output += d;
      const m = output.match(/running on http:\/\/localhost:(\d+)/);
      if (m) resolve({ port: Number(m[1]) });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => (output += d));
  });
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`server did not start:\n${output}`)), 20_000).unref()
  );
  const first = await Promise.race([ready, exited.then((code) => ({ exitCode: code })), timeout]);

  const cleanup = () => {
    if (keepDb) return;
    for (const s of ['', '-wal', '-shm']) rmSync(dbPath + s, { force: true });
  };
  if ('exitCode' in first) {
    cleanup();
    return { exitCode: first.exitCode, output };
  }
  return {
    baseUrl: `http://127.0.0.1:${first.port}`,
    dbPath,
    output: () => output,
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await exited;
      }
      cleanup();
    },
  };
}

/** Opens the server's database directly (for setting up edge cases like expired deadlines). */
export function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

let ipCounter = 10;
/** A unique fake client IP (the test servers trust X-Forwarded-For from loopback). */
export const nextIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

/** A tiny browser-like client: keeps cookies and sends Origin on writes. */
export class Client {
  constructor(baseUrl, { ip = nextIp(), origin = baseUrl } = {}) {
    this.baseUrl = baseUrl;
    this.ip = ip;
    this.origin = origin;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, path, { body, headers = {}, raw } = {}) {
    const h = { 'x-forwarded-for': this.ip, ...headers };
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    if (method !== 'GET' && this.origin && !('origin' in h)) h.origin = this.origin;
    const cookie = this.cookieHeader();
    if (cookie && !('cookie' in h)) h.cookie = cookie;
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: h,
      body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expires = attrs.find((a) => /^\s*expires=/i.test(a));
      const expired = expires && new Date(expires.split('=')[1]).getTime() < Date.now();
      if (!value || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, data, headers: res.headers, setCookies: res.headers.getSetCookie() };
  }

  get(path, opts) {
    return this.request('GET', path, opts);
  }
  post(path, body, opts = {}) {
    return this.request('POST', path, { ...opts, body });
  }
  put(path, body, opts = {}) {
    return this.request('PUT', path, { ...opts, body });
  }
  del(path, opts) {
    return this.request('DELETE', path, opts);
  }
}

export async function loginAs(baseUrl, email, password, opts) {
  const c = new Client(baseUrl, opts);
  const r = await c.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}

/** Admin creates an invite, a new candidate registers with it. Returns the signed-in client. */
export async function inviteCandidate(baseUrl, admin, { name = 'Candidate', email, password = 'candidate-pass-1' } = {}) {
  const inv = await admin.post('/api/admin/invites', {});
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.data)}`);
  const c = new Client(baseUrl);
  const r = await c.post('/api/auth/register', { name, email, password, invite: inv.data.code });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}
