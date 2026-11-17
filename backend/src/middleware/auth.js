import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db, now } from '../db.js';
import { badRequest } from '../validate.js';

export const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD = 8;

const ISSUER = 'proctorcode';
const AUDIENCE = 'proctorcode-web';
const TOKEN_TTL_SEC = 60 * 60; // a token lives 1 hour…
const REFRESH_AFTER_SEC = 5 * 60; // …and is renewed while the user stays active
const SESSION_MAX_MS = 12 * 60 * 60_000; // hard limit: sign in again after 12 hours

export const COOKIE_NAME = config.cookieSecure ? '__Host-pc_session' : 'pc_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---- Passwords ----

/** Throws a 400 error when a new password doesn't meet the rules. */
export function checkNewPassword(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string') throw badRequest('Password is required');
  if (password.length < MIN_PASSWORD) throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
  if (Buffer.byteLength(password, 'utf8') > 72) throw badRequest('Password is too long (max 72 bytes)');
  const lower = password.toLowerCase();
  if (email && lower === email.toLowerCase()) throw badRequest('Password must not be your email');
  if (name && lower === name.toLowerCase()) throw badRequest('Password must not be your name');
}

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

// Used when the account doesn't exist, so a failed sign-in always costs the same time.
const dummyHash = bcrypt.hash(randomBytes(18).toString('base64'), BCRYPT_ROUNDS);

/** Compares a password with a stored hash. Unknown users still pay for one bcrypt check. */
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
    await bcrypt.compare('x', await dummyHash);
    return false;
  }
  if (!hash || !hash.startsWith('$2')) {
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}

export function needsRehash(hash) {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}

/** A password hash that never matches anything (demo and disabled accounts). */
export const UNUSABLE_PASSWORD = '!';

// ---- Sessions ----

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeMs,
  };
}

function signToken(user, sid) {
  return jwt.sign({ sid, ver: user.token_version, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL_SEC,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(user.id),
  });
}

function setTokenCookie(res, user, sid) {
  res.cookie(COOKIE_NAME, signToken(user, sid), cookieOptions(TOKEN_TTL_SEC * 1000));
}

/** Starts a new server-side session and sets the HttpOnly cookie. */
export function startSession(res, user) {
  const sid = randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(
    sha256(sid),
    user.id,
    t,
    new Date(Date.now() + SESSION_MAX_MS).toISOString(),
    t
  );
  setTokenCookie(res, user, sid);
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(undefined), maxAge: undefined });
}

/** Ends every session of a user (logout everywhere, password change). */
export function revokeAllSessions(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Reads the session cookie (if any) and sets req.user / req.sessionId.
 * Never rejects the request by itself; use requireAuth for that.
 */
export function loadSession(req, res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  } catch {
    clearSessionCookie(res);
    return next();
  }
  const userId = Number(payload.sub);
  const sidHash = typeof payload.sid === 'string' ? sha256(payload.sid) : null;
  const session = sidHash
    ? db.prepare('SELECT id, user_id, expires_at FROM sessions WHERE id = ?').get(sidHash)
    : null;
  const user = session
    ? db.prepare('SELECT id, name, email, role, is_demo, token_version FROM users WHERE id = ?').get(userId)
    : null;

  if (!session || session.user_id !== userId || session.expires_at <= now() || !user || user.token_version !== payload.ver) {
    if (session && session.expires_at <= now()) db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    clearSessionCookie(res);
    return next();
  }

  req.user = user;
  req.sessionId = session.id;

  // Sliding renewal: keep active users signed in, up to the session's hard limit.
  if (Date.now() / 1000 - payload.iat > REFRESH_AFTER_SEC) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), session.id);
    const left = new Date(session.expires_at).getTime() - Date.now();
    if (left > 0) {
      res.cookie(COOKIE_NAME, signToken(user, payload.sid), cookieOptions(Math.min(TOKEN_TTL_SEC * 1000, left)));
    }
  }
  next();
}

export function endCurrentSession(req) {
  if (req.sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
}

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, demo: Boolean(u.is_demo) };
}

// ---- Guards ----

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

export function requireCandidate(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  if (req.user.role !== 'user') return res.status(403).json({ error: 'Only candidates can take tests' });
  next();
}

export const READ_ONLY_MESSAGE =
  'This is the read-only demo admin, so changes are turned off. Run your own copy to create and edit tests.';

/** Demo admins may look at everything but change nothing (sign-out excepted). */
export function demoAdminReadOnly(req, res, next) {
  if (
    req.user?.is_demo &&
    req.user.role === 'admin' &&
    !SAFE_METHODS.has(req.method) &&
    req.path !== '/auth/logout'
  ) {
    return res.status(403).json({ error: READ_ONLY_MESSAGE, readOnly: true });
  }
  next();
}
