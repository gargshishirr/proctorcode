import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { config, normalizeEmail, EMAIL_RE } from '../config.js';
import { db, now, getSetting, setSetting } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { closeOverdueAttempts } from './attempts.js';
import { sha256, signupMode } from './auth.js';
import { text, integer, boolean, idParam, body, notFound, badRequest } from '../validate.js';

const router = Router();

router.use(requireAdmin);

// ---- Dashboard stats ----
router.get('/stats', (req, res) => {
  closeOverdueAttempts();
  const count = (sql) => db.prepare(sql).get().c;
  res.json({
    stats: {
      tests: count('SELECT COUNT(*) AS c FROM tests'),
      activeTests: count('SELECT COUNT(*) AS c FROM tests WHERE is_active = 1'),
      candidates: count("SELECT COUNT(*) AS c FROM users WHERE role = 'user'"),
      attempts: count('SELECT COUNT(*) AS c FROM attempts'),
      submitted: count("SELECT COUNT(*) AS c FROM attempts WHERE status = 'submitted'"),
      flagged: count('SELECT COUNT(DISTINCT attempt_id) AS c FROM violations'),
      violations: count('SELECT COUNT(*) AS c FROM violations'),
    },
  });
});

// ---- All sessions with an integrity summary ----
router.get('/attempts', (req, res) => {
  closeOverdueAttempts();
  const attempts = db
    .prepare(
      `SELECT a.id, a.status, a.integrity_score, a.started_at, a.submitted_at,
              u.name AS candidate, u.email AS candidate_email,
              t.title AS test_title, t.language AS language,
              (SELECT COUNT(*) FROM violations v WHERE v.attempt_id = a.id) AS violation_count
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       JOIN tests t ON t.id = a.test_id
       ORDER BY a.started_at DESC, a.id DESC`
    )
    .all();
  res.json({ attempts });
});

// ---- One session: full integrity report ----
router.get('/attempts/:id', (req, res) => {
  closeOverdueAttempts();
  const id = idParam(req.params.id);
  const attempt =
    id &&
    db
      .prepare(
        `SELECT a.id, a.test_id, a.user_id, a.code, a.status, a.integrity_score, a.started_at, a.deadline_at, a.submitted_at,
                u.name AS candidate, u.email AS candidate_email,
                t.title AS test_title, t.language AS language, t.description AS test_description
         FROM attempts a
         JOIN users u ON u.id = a.user_id
         JOIN tests t ON t.id = a.test_id
         WHERE a.id = ?`
      )
      .get(id);
  if (!attempt) throw notFound('Attempt not found');
  const violations = db
    .prepare('SELECT id, type, severity, details, created_at FROM violations WHERE attempt_id = ? ORDER BY created_at ASC, id ASC')
    .all(id);
  const breakdown = db
    .prepare('SELECT type, COUNT(*) AS count FROM violations WHERE attempt_id = ? GROUP BY type ORDER BY count DESC')
    .all(id);
  res.json({ attempt, violations, breakdown });
});

// ---- Delete a session (lets the candidate retake the test, or removes their data) ----
router.delete('/attempts/:id', (req, res) => {
  const id = idParam(req.params.id);
  if (!id || !db.prepare('SELECT id FROM attempts WHERE id = ?').get(id)) throw notFound('Attempt not found');
  db.prepare('DELETE FROM attempts WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Candidates ----
router.get('/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.is_demo, u.created_at,
              (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS attempt_count
       FROM users u WHERE u.role = 'user'
       ORDER BY u.created_at DESC, u.id DESC`
    )
    .all();
  res.json({ users });
});

// Removes a candidate and all of their sessions (e.g. on a data deletion request).
router.delete('/users/:id', (req, res) => {
  const id = idParam(req.params.id);
  const user = id && db.prepare("SELECT id FROM users WHERE id = ? AND role = 'user'").get(id);
  if (!user) throw notFound('Candidate not found');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Sign-up settings ----
router.get('/settings', (req, res) => {
  res.json({ settings: { open_signup: getSetting('open_signup', '0') === '1', signup: signupMode(), demo: config.demoMode } });
});

router.put('/settings', (req, res) => {
  const open = boolean(body(req).open_signup, { field: 'open_signup' });
  setSetting('open_signup', open ? '1' : '0');
  res.json({ settings: { open_signup: open, signup: signupMode(), demo: config.demoMode } });
});

// ---- Invites ----
const INVITE_FIELDS = 'id, hint, note, email, max_uses, uses, expires_at, revoked, created_at';

router.get('/invites', (req, res) => {
  const invites = db.prepare(`SELECT ${INVITE_FIELDS} FROM invites ORDER BY created_at DESC, id DESC`).all();
  res.json({ invites });
});

router.post('/invites', (req, res) => {
  const b = body(req);
  const note = text(b.note, { field: 'Note', max: 120, required: false }) ?? '';
  const rawEmail = text(b.email, { field: 'Email', max: 254, required: false });
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (email && !EMAIL_RE.test(email)) throw badRequest('Please enter a valid email address');
  const maxUses = integer(b.max_uses, { field: 'Uses', min: 1, max: 1000, required: false }) ?? 1;
  const days = integer(b.expires_in_days, { field: 'Days valid', min: 1, max: 90, required: false }) ?? 7;
  if (email && maxUses !== 1) throw badRequest('An invite for one email can be used once');

  const code = randomBytes(18).toString('base64url');
  const info = db
    .prepare(
      `INSERT INTO invites (code_hash, hint, note, email, max_uses, uses, expires_at, revoked, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`
    )
    .run(sha256(code), code.slice(-4), note, email, maxUses, new Date(Date.now() + days * 86_400_000).toISOString(), req.user.id, now());
  const invite = db.prepare(`SELECT ${INVITE_FIELDS} FROM invites WHERE id = ?`).get(Number(info.lastInsertRowid));
  // The code is shown once. Only its hash is stored.
  res.status(201).json({ invite, code });
});

router.delete('/invites/:id', (req, res) => {
  const id = idParam(req.params.id);
  if (!id || !db.prepare('SELECT id FROM invites WHERE id = ?').get(id)) throw notFound('Invite not found');
  db.prepare('UPDATE invites SET revoked = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});


export default router;
