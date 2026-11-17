import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');

// Minimal .env loader for local development. Real environment variables always win.
// Tests (NODE_ENV=test) never read backend/.env so a developer's file can't change results.
function loadDotEnv(env) {
  if (env.NODE_ENV === 'test') return;
  const envPath = join(backendDir, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(key in env)) env[key] = value;
  }
}

const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v ?? '').trim());

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Placeholder secrets that must never be used for real.
const KNOWN_BAD_SECRETS = new Set([
  'dev-secret-change-me',
  'change-this-secret-in-production-please',
  'changeme',
  'secret',
]);

const COMMON_PASSWORDS = new Set([
  'admin123', 'admin1234', 'administrator', 'password', 'password1', 'password123', 'passw0rd',
  'qwerty123', 'qwertyuiop', '123456789012', '1234567890', 'letmein123', 'welcome123',
  'changeme123', 'proctorcode', 'proctorcode123', 'iloveyou123',
]);

// Passwords that are just one of these words plus digits/symbols (e.g. "Password1234!") are rejected.
const WEAK_WORDS = new Set([
  '', 'password', 'passw', 'admin', 'administrator', 'qwerty', 'qwertyuiop', 'letmein', 'welcome',
  'proctorcode', 'iloveyou', 'abc', 'abcdef', 'changeme', 'secret', 'test', 'demo', 'login',
]);

/** Returns a reason string when an admin password is too weak, otherwise null. */
export function adminPasswordProblem(password, email = '') {
  const pw = String(password || '');
  if (pw.length < 12) return 'must be at least 12 characters';
  if (Buffer.byteLength(pw, 'utf8') > 72) return 'must be at most 72 bytes';
  const letters = pw.toLowerCase().replace(/[^a-z]/g, '');
  if (COMMON_PASSWORDS.has(pw.toLowerCase()) || WEAK_WORDS.has(letters)) return 'is a well-known password';
  if (new Set(pw).size < 6) return 'needs more variety (at least 6 different characters)';
  const local = normalizeEmail(email).split('@')[0];
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return 'must not contain the email name';
  return null;
}

function parseTrustProxy(value, onRender) {
  if (value === undefined || value === '') {
    // Render: one proxy hop in front of the app sets X-Forwarded-Proto. Client IPs come from
    // Cloudflare's CF-Connecting-IP header instead (see clientIp() in security.js).
    return onRender ? 1 : false;
  }
  if (/^\d+$/.test(value)) return Number(value);
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  return value; // e.g. "loopback" or a comma separated list of subnets
}

export function buildConfig(env = process.env) {
  loadDotEnv(env);
  const nodeEnv = env.NODE_ENV || 'development';
  const production = nodeEnv === 'production';
  const dataDir = env.DATA_DIR ? resolve(env.DATA_DIR) : join(backendDir, 'data');
  const dbPath = env.DB_PATH ? resolve(env.DB_PATH) : join(dataDir, 'app.db');
  const onRender = Boolean(env.RENDER);

  let jwtSecret = env.JWT_SECRET || '';
  let ephemeralSecret = false;
  if (!jwtSecret && !production) {
    jwtSecret = randomBytes(48).toString('base64url');
    ephemeralSecret = true;
  }

  return {
    nodeEnv,
    production,
    port: env.PORT === undefined || env.PORT === '' ? 4000 : Number(env.PORT),
    host: env.HOST || undefined,
    jwtSecret,
    ephemeralSecret,
    adminEmail: normalizeEmail(env.ADMIN_EMAIL),
    adminPassword: env.ADMIN_PASSWORD || '',
    adminName: (env.ADMIN_NAME || 'Admin').trim().slice(0, 80) || 'Admin',
    demoMode: truthy(env.DEMO_MODE),
    demoResetHours: Math.min(Math.max(Number(env.DEMO_RESET_HOURS) || 6, 1), 168),
    dataDir,
    dbPath,
    // Extra allowed browser origin for state-changing requests (same-origin is always allowed).
    appOrigin: String(env.APP_ORIGIN || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
    trustProxy: parseTrustProxy(env.TRUST_PROXY, onRender),
    useCfConnectingIp: env.TRUST_CF_CONNECTING_IP !== undefined ? truthy(env.TRUST_CF_CONNECTING_IP) : onRender,
    cookieSecure: env.COOKIE_SECURE !== undefined ? truthy(env.COOKIE_SECURE) : production,
    hsts: production,
  };
}

/** Checks the config. Errors stop the server in production; in development they are warnings. */
export function checkConfig(cfg) {
  const errors = [];
  const warnings = [];
  const problem = (msg) => (cfg.production ? errors : warnings).push(msg);

  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) errors.push('PORT must be a number between 0 and 65535.');

  if (!cfg.jwtSecret) {
    errors.push('JWT_SECRET is missing. Set a random value of 32+ characters.');
  } else if (cfg.jwtSecret.length < 32 || KNOWN_BAD_SECRETS.has(cfg.jwtSecret)) {
    problem('JWT_SECRET is too short or a placeholder. Use a random value of 32+ characters.');
  }
  if (cfg.ephemeralSecret) warnings.push('JWT_SECRET not set: using a random secret. Everyone is signed out on restart.');

  const hasEmail = Boolean(cfg.adminEmail);
  const hasPassword = Boolean(cfg.adminPassword);
  if (hasEmail !== hasPassword) {
    problem('Set both ADMIN_EMAIL and ADMIN_PASSWORD (only one of them is set).');
  } else if (hasEmail) {
    if (!EMAIL_RE.test(cfg.adminEmail) || cfg.adminEmail.length > 254) problem('ADMIN_EMAIL is not a valid email address.');
    const weak = adminPasswordProblem(cfg.adminPassword, cfg.adminEmail);
    if (weak) problem(`ADMIN_PASSWORD ${weak}.`);
  }
  return { errors, warnings };
}

export const config = buildConfig(process.env);
