import { Router } from 'express';
import { db, now } from '../db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';

const router = Router();

// ---- Admin: list all tests (active + inactive) ----
router.get('/', authRequired, (req, res) => {
  if (req.user.role === 'admin') {
    const tests = db
      .prepare(
        `SELECT t.*, u.name AS author,
                (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id) AS attempt_count
         FROM tests t LEFT JOIN users u ON u.id = t.created_by
         ORDER BY t.created_at DESC`
      )
      .all();
    return res.json({ tests });
  }
  // Regular users only see active tests
  const tests = db
    .prepare('SELECT id, title, description, language, duration_minutes, is_active FROM tests WHERE is_active = 1 ORDER BY created_at DESC')
    .all();
  res.json({ tests });
});

// ---- Get a single test ----
router.get('/:id', authRequired, (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(Number(req.params.id));
  if (!test) return res.status(404).json({ error: 'Test not found' });
  if (req.user.role !== 'admin' && !test.is_active) {
    return res.status(403).json({ error: 'This test is not available' });
  }
  res.json({ test });
});

// ---- Admin: create test ----
router.post('/', authRequired, adminOnly, (req, res) => {
  const { title, description, language, duration_minutes, starter_code, is_active } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });

  const info = db
    .prepare(
      `INSERT INTO tests (title, description, language, duration_minutes, starter_code, is_active, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(title).trim(),
      String(description || ''),
      String(language || 'javascript'),
      Number(duration_minutes) || 30,
      String(starter_code || ''),
      is_active === false ? 0 : 1,
      req.user.id,
      now()
    );
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ test });
});

// ---- Admin: update test ----
router.put('/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const { title, description, language, duration_minutes, starter_code, is_active } = req.body || {};
  db.prepare(
    `UPDATE tests SET title = ?, description = ?, language = ?, duration_minutes = ?, starter_code = ?, is_active = ?
     WHERE id = ?`
  ).run(
    title !== undefined ? String(title).trim() : test.title,
    description !== undefined ? String(description) : test.description,
    language !== undefined ? String(language) : test.language,
    duration_minutes !== undefined ? Number(duration_minutes) : test.duration_minutes,
    starter_code !== undefined ? String(starter_code) : test.starter_code,
    is_active !== undefined ? (is_active ? 1 : 0) : test.is_active,
    id
  );
  const updated = db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
  res.json({ test: updated });
});

// ---- Admin: delete test ----
router.delete('/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const test = db.prepare('SELECT id FROM tests WHERE id = ?').get(id);
  if (!test) return res.status(404).json({ error: 'Test not found' });
  db.prepare('DELETE FROM tests WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
