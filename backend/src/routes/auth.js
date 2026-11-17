import { Router } from 'express';
import { createHash } from 'node:crypto';
import { config, normalizeEmail, EMAIL_RE } from '../config.js';
import { db, now, transaction, getSetting } from '../db.js';
import { authLimiter, loginLockout } from '../security.js';
import {
  checkNewPassword,
  hashPassword,
  verifyPassword,
  needsRehash,
  startSession,
  endCurrentSession,
  clearSessionCookie,
  revokeAllSessions,
  publicUser,
  requireAuth,
} from '../middleware/auth.js';
import { HttpError, badRequest, text, body } from '../validate.js';

const router = Router();

const SIGNUP_FAILED =
  "We couldn't create this account. Check your invite code. If you already have an account, sign in instead.";
const LOGIN_FAILED = 'Invalid email or password';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function signupMode() {
  if (config.demoMode) return 'off';
  return getSetting('open_signup', '0') === '1' ? 'open' : 'invite';
}

function readEmail(value) {
  const email = normalizeEmail(text(value, { field: 'Email', min: 3, max: 254 }));
  if (!EMAIL_RE.test(email)) throw badRequest('Please enter a valid email address');
  return email;
}

function lockedResponse(res, ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  res.setHeader('Retry-After', String(Math.ceil(ms / 1000)));
  return res.status(429).json({
    error: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
  });
}

// ---- Register (candidates only; invite code required unless open sign-up is on) ----
router.post('/register', authLimiter, async (req, res) => {
  const mode = signupMode();
  if (mode === 'off') {
    return res.status(403).json({ error: 'Sign-up is off in the public demo. Use "Try as candidate" instead.' });
  }
  const b = body(req);
  const name = text(b.name, { field: 'Name', min: 1, max: 80 });
  const email = readEmail(b.email);
  const password = b.password;
  checkNewPassword(password, { email, name });
  const inviteCode = text(b.invite, { field: 'Invite code', max: 200, required: false }) || '';

  // Hash first so success and failure take about the same time.
  const hash = await hashPassword(password);

  const user = transaction(() => {
    let invite = null;
    if (mode === 'invite' || inviteCode) {
      invite = inviteCode ? db.prepare('SELECT * FROM invites WHERE code_hash = ?').get(sha256(inviteCode)) : null;
      const usable =
        invite &&
        !invite.revoked &&
        invite.expires_at > now() &&
        invite.uses < invite.max_uses &&
        (!invite.email || invite.email === email);
      if (!usable) {
        if (mode === 'invite') return null;
        invite = null; // open sign-up: a bad optional code is simply ignored
      }
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return null;

    const info = db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role, is_demo, token_version, created_at) VALUES (?, ?, ?, 'user', 0, 0, ?)"
      )
      .run(name, email, hash, now());
    if (invite) db.prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?').run(invite.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  });

  if (!user) return res.status(400).json({ error: SIGNUP_FAILED });
  endCurrentSession(req);
  startSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

// ---- Login ----
router.post('/login', authLimiter, async (req, res) => {
  const b = body(req);
  if (typeof b.email !== 'string' || typeof b.password !== 'string' || !b.email.trim() || !b.password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const email = normalizeEmail(b.email).slice(0, 254);

  const locked = loginLockout.lockedFor(req, email);
  if (locked) return lockedResponse(res, locked);

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const usable = row && !row.is_demo;
  const ok = await verifyPassword(b.password, usable ? row.password_hash : null);
  if (!ok) {
    loginLockout.fail(req, email);
    const nowLocked = loginLockout.lockedFor(req, email);
    if (nowLocked) return lockedResponse(res, nowLocked);
    return res.status(401).json({ error: LOGIN_FAILED });
  }

  loginLockout.succeed(req, email);
  if (needsRehash(row.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(b.password), row.id);
  }
  endCurrentSession(req); // a fresh session id on every sign-in
  startSession(res, row);
  res.json({ user: publicUser(row) });
});

// ---- Logout (this device) ----
router.post('/logout', (req, res) => {
  endCurrentSession(req);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- Logout everywhere ----
router.post('/logout-all', requireAuth, (req, res) => {
  revokeAllSessions(req.user.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Like /me, but answers 200 with { user: null } when signed out (used when the app loads).
router.get('/session', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// ---- Change password (signs out every other session) ----
router.post('/password', requireAuth, authLimiter, async (req, res) => {
  if (req.user.is_demo) {
    throw new HttpError(403, 'Demo accounts cannot change passwords.');
  }
  const b = body(req);
  const email = req.user.email;
  const locked = loginLockout.lockedFor(req, email);
  if (locked) return lockedResponse(res, locked);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await verifyPassword(b.current_password, row.password_hash))) {
    loginLockout.fail(req, email);
    return res.status(400).json({ error: 'Your current password is not correct' });
  }
  checkNewPassword(b.new_password, { email, name: row.name });
  if (b.new_password === b.current_password) throw badRequest('Choose a password you have not used here before');

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(b.new_password), row.id);
  revokeAllSessions(row.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
  startSession(res, fresh);
  res.json({ ok: true, user: publicUser(fresh) });
});

export default router;
