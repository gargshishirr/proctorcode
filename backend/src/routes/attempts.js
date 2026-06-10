import { Router } from 'express';
import { db, now } from '../db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

const SEVERITY_PENALTY = { low: 2, medium: 5, high: 10 };

function loadAttemptForUser(attemptId, user) {
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt) return { error: 404 };
  if (user.role !== 'admin' && attempt.user_id !== user.id) return { error: 403 };
  return { attempt };
}

// ---- Start (or resume) an attempt for a test ----
router.post('/', authRequired, (req, res) => {
  const testId = Number(req.body?.test_id);
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(testId);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  if (!test.is_active) return res.status(403).json({ error: 'This test is not currently available' });

  const existing = db
    .prepare("SELECT * FROM attempts WHERE test_id = ? AND user_id = ? AND status = 'in_progress'")
    .get(testId, req.user.id);
  if (existing) return res.json({ attempt: existing, test, resumed: true });

  const info = db
    .prepare('INSERT INTO attempts (test_id, user_id, code, status, started_at) VALUES (?, ?, ?, ?, ?)')
    .run(testId, req.user.id, test.starter_code || '', 'in_progress', now());
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ attempt, test, resumed: false });
});

// ---- Current user's attempts (results) ----
router.get('/mine', authRequired, (req, res) => {
  const attempts = db
    .prepare(
      `SELECT a.*, t.title AS test_title, t.language AS language,
              (SELECT COUNT(*) FROM violations v WHERE v.attempt_id = a.id) AS violation_count
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE a.user_id = ?
       ORDER BY a.started_at DESC`
    )
    .all(req.user.id);
  res.json({ attempts });
});

// ---- Get one attempt (with test + violations) ----
router.get('/:id', authRequired, (req, res) => {
  const { attempt, error } = loadAttemptForUser(Number(req.params.id), req.user);
  if (error) return res.status(error).json({ error: error === 404 ? 'Attempt not found' : 'Forbidden' });
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(attempt.test_id);
  const violations = db
    .prepare('SELECT * FROM violations WHERE attempt_id = ? ORDER BY created_at ASC')
    .all(attempt.id);
  res.json({ attempt, test, violations });
});

// ---- Autosave code ----
router.put('/:id/code', authRequired, (req, res) => {
  const { attempt, error } = loadAttemptForUser(Number(req.params.id), req.user);
  if (error) return res.status(error).json({ error: error === 404 ? 'Attempt not found' : 'Forbidden' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'Attempt already finished' });
  db.prepare('UPDATE attempts SET code = ? WHERE id = ?').run(String(req.body?.code ?? ''), attempt.id);
  res.json({ ok: true });
});

// ---- Log a proctoring violation ----
router.post('/:id/violations', authRequired, (req, res) => {
  const { attempt, error } = loadAttemptForUser(Number(req.params.id), req.user);
  if (error) return res.status(error).json({ error: error === 404 ? 'Attempt not found' : 'Forbidden' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'Attempt already finished' });

  const type = String(req.body?.type || '').trim();
  if (!type) return res.status(400).json({ error: 'Violation type is required' });
  const severity = ['low', 'medium', 'high'].includes(req.body?.severity) ? req.body.severity : 'medium';
  const details = String(req.body?.details || '');

  db.prepare('INSERT INTO violations (attempt_id, type, severity, details, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(attempt.id, type, severity, details, now());

  const penalty = SEVERITY_PENALTY[severity] || 5;
  const newScore = Math.max(0, attempt.integrity_score - penalty);
  db.prepare('UPDATE attempts SET integrity_score = ? WHERE id = ?').run(newScore, attempt.id);

  res.status(201).json({ integrity_score: newScore });
});

// ---- Submit (or auto-terminate) an attempt ----
router.post('/:id/submit', authRequired, (req, res) => {
  const { attempt, error } = loadAttemptForUser(Number(req.params.id), req.user);
  if (error) return res.status(error).json({ error: error === 404 ? 'Attempt not found' : 'Forbidden' });
  if (attempt.status !== 'in_progress') return res.status(409).json({ error: 'Attempt already finished' });

  const code = req.body?.code !== undefined ? String(req.body.code) : attempt.code;
  const status = req.body?.terminated ? 'terminated' : 'submitted';
  db.prepare('UPDATE attempts SET code = ?, status = ?, submitted_at = ? WHERE id = ?')
    .run(code, status, now(), attempt.id);
  const updated = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
  res.json({ attempt: updated });
});

export default router;
