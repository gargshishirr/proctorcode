import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';

const router = Router();

router.use(authRequired, adminOnly);

// ---- Dashboard stats ----
router.get('/stats', (req, res) => {
  const stats = {
    tests: db.prepare('SELECT COUNT(*) AS c FROM tests').get().c,
    activeTests: db.prepare('SELECT COUNT(*) AS c FROM tests WHERE is_active = 1').get().c,
    candidates: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").get().c,
    attempts: db.prepare('SELECT COUNT(*) AS c FROM attempts').get().c,
    submitted: db.prepare("SELECT COUNT(*) AS c FROM attempts WHERE status = 'submitted'").get().c,
    flagged: db.prepare('SELECT COUNT(DISTINCT attempt_id) AS c FROM violations').get().c,
    violations: db.prepare('SELECT COUNT(*) AS c FROM violations').get().c,
  };
  res.json({ stats });
});

// ---- All attempts with integrity summary ----
router.get('/attempts', (req, res) => {
  const attempts = db
    .prepare(
      `SELECT a.id, a.status, a.integrity_score, a.started_at, a.submitted_at,
              u.name AS candidate, u.email AS candidate_email,
              t.title AS test_title, t.language AS language,
              (SELECT COUNT(*) FROM violations v WHERE v.attempt_id = a.id) AS violation_count
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       JOIN tests t ON t.id = a.test_id
       ORDER BY a.started_at DESC`
    )
    .all();
  res.json({ attempts });
});

// ---- Single attempt full integrity report ----
router.get('/attempts/:id', (req, res) => {
  const id = Number(req.params.id);
  const attempt = db
    .prepare(
      `SELECT a.*, u.name AS candidate, u.email AS candidate_email,
              t.title AS test_title, t.language AS language, t.description AS test_description
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       JOIN tests t ON t.id = a.test_id
       WHERE a.id = ?`
    )
    .get(id);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const violations = db
    .prepare('SELECT * FROM violations WHERE attempt_id = ? ORDER BY created_at ASC')
    .all(id);

  const breakdown = db
    .prepare('SELECT type, COUNT(*) AS count FROM violations WHERE attempt_id = ? GROUP BY type ORDER BY count DESC')
    .all(id);

  res.json({ attempt, violations, breakdown });
});

// ---- List users ----
router.get('/users', (req, res) => {
  const users = db
    .prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC')
    .all();
  res.json({ users });
});

export default router;
