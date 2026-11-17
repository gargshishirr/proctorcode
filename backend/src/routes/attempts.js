import { Router } from 'express';
import { config } from '../config.js';
import { db, now, transaction } from '../db.js';
import { requireAuth, requireCandidate } from '../middleware/auth.js';
import { text, integer, idParam, body, notFound, HttpError } from '../validate.js';

const router = Router();

export const MAX_CODE_CHARS = 100_000;
const MAX_VIOLATIONS_PER_ATTEMPT = 500;
// A little slack for slow networks: the browser submits at 00:00, the server accepts until +2 min.
export const DEADLINE_GRACE_MS = 2 * 60_000;

// The server decides how serious each event is; the browser only reports what happened.
export const VIOLATION_SEVERITY = {
  tab_switch: 'high',
  window_switch: 'medium',
  looking_away: 'medium',
  no_face: 'high',
  multiple_faces: 'high',
  copy: 'medium',
  cut: 'medium',
  paste: 'high',
  right_click: 'low',
  fullscreen_exit: 'high',
  devtools: 'high',
  print: 'medium',
  camera_blocked: 'high',
};
const PENALTY = { low: 2, medium: 5, high: 10 };

// Columns a candidate gets back for their own attempt.
const ATTEMPT_FIELDS = 'id, test_id, code, status, integrity_score, started_at, deadline_at, submitted_at';
const TEST_FIELDS = 'id, title, description, language, duration_minutes, starter_code';

/** Marks attempts whose time (plus grace) ran out as submitted, keeping the last saved code. */
export function closeOverdueAttempts() {
  const cutoff = new Date(Date.now() - DEADLINE_GRACE_MS).toISOString();
  db.prepare(
    "UPDATE attempts SET status = 'submitted', submitted_at = deadline_at WHERE status = 'in_progress' AND deadline_at < ?"
  ).run(cutoff);
}

const pastDeadline = (attempt) => Date.now() > new Date(attempt.deadline_at).getTime() + DEADLINE_GRACE_MS;

/** Loads an attempt only if it belongs to the signed-in candidate (404 otherwise, no hints). */
function ownAttempt(req) {
  const id = idParam(req.params.id);
  const attempt = id && db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!attempt) throw notFound('Attempt not found');
  return attempt;
}

function requireOpen(attempt) {
  if (attempt.status !== 'in_progress') throw new HttpError(409, 'This test has already been submitted');
  if (pastDeadline(attempt)) {
    closeOverdueAttempts();
    throw new HttpError(409, 'Time is up. Your last saved code was submitted.');
  }
}

const publicAttempt = (id) => db.prepare(`SELECT ${ATTEMPT_FIELDS} FROM attempts WHERE id = ?`).get(id);

// ---- Start (or resume) an attempt ----
router.post('/', requireCandidate, (req, res) => {
  closeOverdueAttempts();
  const testId = integer(body(req).test_id, { field: 'test_id', min: 1 });
  const test = db.prepare(`SELECT ${TEST_FIELDS} FROM tests WHERE id = ? AND is_active = 1`).get(testId);
  if (!test) throw notFound('This test is not available');

  const result = transaction(() => {
    const open = db
      .prepare("SELECT id FROM attempts WHERE test_id = ? AND user_id = ? AND status = 'in_progress'")
      .get(testId, req.user.id);
    if (open) return { attempt: publicAttempt(open.id), resumed: true };

    // One attempt per test for real candidates; the public demo allows retakes.
    if (!config.demoMode) {
      const done = db.prepare('SELECT id FROM attempts WHERE test_id = ? AND user_id = ?').get(testId, req.user.id);
      if (done) throw new HttpError(409, 'You have already taken this test.');
    }
    const started = new Date();
    const deadline = new Date(started.getTime() + test.duration_minutes * 60_000);
    const info = db
      .prepare(
        "INSERT INTO attempts (test_id, user_id, code, status, started_at, deadline_at) VALUES (?, ?, ?, 'in_progress', ?, ?)"
      )
      .run(testId, req.user.id, test.starter_code || '', started.toISOString(), deadline.toISOString());
    return { attempt: publicAttempt(Number(info.lastInsertRowid)), resumed: false };
  });
  res.status(result.resumed ? 200 : 201).json({ ...result, test });
});

// ---- My attempts ----
router.get('/mine', requireAuth, (req, res) => {
  closeOverdueAttempts();
  const attempts = db
    .prepare(
      `SELECT a.id, a.test_id, a.status, a.integrity_score, a.started_at, a.deadline_at, a.submitted_at,
              t.title AS test_title, t.language AS language,
              (SELECT COUNT(*) FROM violations v WHERE v.attempt_id = a.id) AS violation_count
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE a.user_id = ?
       ORDER BY a.started_at DESC, a.id DESC`
    )
    .all(req.user.id);
  res.json({ attempts });
});

// ---- One of my attempts (with test + flags) ----
router.get('/:id', requireAuth, (req, res) => {
  closeOverdueAttempts();
  const attempt = ownAttempt(req);
  const test = db.prepare(`SELECT ${TEST_FIELDS} FROM tests WHERE id = ?`).get(attempt.test_id);
  const violations = db
    .prepare('SELECT id, type, severity, details, created_at FROM violations WHERE attempt_id = ? ORDER BY created_at ASC, id ASC')
    .all(attempt.id);
  res.json({ attempt: publicAttempt(attempt.id), test, violations, server_time: now() });
});

// ---- Autosave code ----
router.put('/:id/code', requireCandidate, (req, res) => {
  const attempt = ownAttempt(req);
  requireOpen(attempt);
  const code = text(body(req).code ?? '', { field: 'Code', max: MAX_CODE_CHARS, multiline: true, trim: false });
  db.prepare('UPDATE attempts SET code = ? WHERE id = ?').run(code, attempt.id);
  res.json({ ok: true });
});

// ---- Record a proctoring event ----
router.post('/:id/violations', requireCandidate, (req, res) => {
  const attempt = ownAttempt(req);
  requireOpen(attempt);
  const b = body(req);
  const type = text(b.type, { field: 'Type', min: 1, max: 40 });
  const severity = VIOLATION_SEVERITY[type];
  if (!severity) throw new HttpError(400, 'Unknown event type');
  const details = text(b.details ?? '', { field: 'Details', max: 200 }) ?? '';

  const result = transaction(() => {
    const current = db.prepare('SELECT status, integrity_score FROM attempts WHERE id = ?').get(attempt.id);
    if (current.status !== 'in_progress') throw new HttpError(409, 'This test has already been submitted');
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM violations WHERE attempt_id = ?').get(attempt.id);
    if (c >= MAX_VIOLATIONS_PER_ATTEMPT) return { integrity_score: current.integrity_score, status: current.status };

    db.prepare('INSERT INTO violations (attempt_id, type, severity, details, created_at) VALUES (?, ?, ?, ?, ?)').run(
      attempt.id,
      type,
      severity,
      details,
      now()
    );
    const score = Math.max(0, current.integrity_score - PENALTY[severity]);
    if (score <= 0) {
      db.prepare("UPDATE attempts SET integrity_score = 0, status = 'terminated', submitted_at = ? WHERE id = ?").run(
        now(),
        attempt.id
      );
      return { integrity_score: 0, status: 'terminated' };
    }
    db.prepare('UPDATE attempts SET integrity_score = ? WHERE id = ?').run(score, attempt.id);
    return { integrity_score: score, status: 'in_progress' };
  });
  res.status(201).json(result);
});

// ---- Submit (or give up) ----
router.post('/:id/submit', requireCandidate, (req, res) => {
  const attempt = ownAttempt(req);
  if (attempt.status !== 'in_progress') throw new HttpError(409, 'This test has already been submitted');
  if (pastDeadline(attempt)) {
    closeOverdueAttempts();
    return res.json({ attempt: publicAttempt(attempt.id), late: true });
  }
  const b = body(req);
  const code =
    b.code === undefined
      ? attempt.code
      : text(b.code, { field: 'Code', max: MAX_CODE_CHARS, multiline: true, trim: false });
  const status = b.terminated === true ? 'terminated' : 'submitted';
  db.prepare("UPDATE attempts SET code = ?, status = ?, submitted_at = ? WHERE id = ? AND status = 'in_progress'").run(
    code,
    status,
    now(),
    attempt.id
  );
  res.json({ attempt: publicAttempt(attempt.id) });
});

export default router;
