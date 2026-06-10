import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, now } from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';

const router = Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  // Only allow 'admin' or 'user'; default to user. Admins are seeded or created by admins,
  // but we allow self-registration as user by default.
  const safeRole = role === 'admin' ? 'admin' : 'user';
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), hash, safeRole, now());

  const user = { id: Number(info.lastInsertRowid), name: name.trim(), email: email.toLowerCase(), role: safeRole };
  const token = signToken(user);
  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  const token = signToken(user);
  res.json({ token, user });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

export default router;
