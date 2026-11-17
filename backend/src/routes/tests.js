import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { text, integer, boolean, idParam, body, notFound, badRequest } from '../validate.js';

const router = Router();

export const LANGUAGES = ['javascript', 'python', 'typescript', 'java', 'cpp', 'c', 'csharp', 'go', 'ruby', 'rust'];

// Fields a candidate may see. There is no answer key stored anywhere.
const CANDIDATE_FIELDS = 'id, title, description, language, duration_minutes, starter_code';

function readTest(b, { partial }) {
  const required = !partial;
  const out = {
    title: text(b.title, { field: 'Title', min: 1, max: 200, required }),
    description: text(b.description, { field: 'Description', max: 20_000, required: false, multiline: true, trim: false }),
    language: text(b.language, { field: 'Language', max: 20, required: false }),
    duration_minutes: integer(b.duration_minutes, { field: 'Duration', min: 1, max: 480, required: false }),
    starter_code: text(b.starter_code, { field: 'Starter code', max: 50_000, required: false, multiline: true, trim: false }),
    is_active: boolean(b.is_active, { field: 'Active', required: false }),
  };
  if (out.language !== undefined && !LANGUAGES.includes(out.language)) throw badRequest('Unknown language');
  return out;
}

// ---- List tests (admins: all; candidates: active only, safe fields) ----
router.get('/', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    const tests = db
      .prepare(
        `SELECT t.*, u.name AS author,
                (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id) AS attempt_count
         FROM tests t LEFT JOIN users u ON u.id = t.created_by
         ORDER BY t.created_at DESC, t.id DESC`
      )
      .all();
    return res.json({ tests });
  }
  const tests = db
    .prepare(`SELECT ${CANDIDATE_FIELDS} FROM tests WHERE is_active = 1 ORDER BY created_at DESC, id DESC`)
    .all();
  res.json({ tests });
});

// ---- One test ----
router.get('/:id', requireAuth, (req, res) => {
  const id = idParam(req.params.id);
  if (req.user.role === 'admin') {
    const test = id && db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
    if (!test) throw notFound('Test not found');
    return res.json({ test });
  }
  const test = id && db.prepare(`SELECT ${CANDIDATE_FIELDS} FROM tests WHERE id = ? AND is_active = 1`).get(id);
  if (!test) throw notFound('Test not found');
  res.json({ test });
});

// ---- Admin: create ----
router.post('/', requireAdmin, (req, res) => {
  const t = readTest(body(req), { partial: false });
  const info = db
    .prepare(
      `INSERT INTO tests (title, description, language, duration_minutes, starter_code, is_active, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      t.title,
      t.description ?? '',
      t.language ?? 'javascript',
      t.duration_minutes ?? 30,
      t.starter_code ?? '',
      t.is_active === false ? 0 : 1,
      req.user.id,
      now()
    );
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ test });
});

// ---- Admin: update ----
router.put('/:id', requireAdmin, (req, res) => {
  const id = idParam(req.params.id);
  const test = id && db.prepare('SELECT * FROM tests WHERE id = ?').get(id);
  if (!test) throw notFound('Test not found');
  const t = readTest(body(req), { partial: true });
  db.prepare(
    `UPDATE tests SET title = ?, description = ?, language = ?, duration_minutes = ?, starter_code = ?, is_active = ?
     WHERE id = ?`
  ).run(
    t.title ?? test.title,
    t.description ?? test.description,
    t.language ?? test.language,
    t.duration_minutes ?? test.duration_minutes,
    t.starter_code ?? test.starter_code,
    t.is_active === undefined ? test.is_active : t.is_active ? 1 : 0,
    id
  );
  res.json({ test: db.prepare('SELECT * FROM tests WHERE id = ?').get(id) });
});

// ---- Admin: delete (also removes its sessions) ----
router.delete('/:id', requireAdmin, (req, res) => {
  const id = idParam(req.params.id);
  const test = id && db.prepare('SELECT id FROM tests WHERE id = ?').get(id);
  if (!test) throw notFound('Test not found');
  db.prepare('DELETE FROM tests WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
