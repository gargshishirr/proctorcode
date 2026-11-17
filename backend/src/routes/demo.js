import { Router } from 'express';
import { config } from '../config.js';
import { demoLimiter } from '../security.js';
import { startSession, endCurrentSession, publicUser } from '../middleware/auth.js';
import { createDemoCandidate, demoAdmin, resetDemoIfDue } from '../seedData.js';

const router = Router();

// The demo endpoints only exist when DEMO_MODE is on.
router.use((req, res, next) => {
  if (!config.demoMode) return res.status(404).json({ error: 'Not found' });
  next();
});

// "Try as candidate": a fresh throwaway account per visitor.
router.post('/candidate', demoLimiter, (req, res) => {
  const user = createDemoCandidate();
  endCurrentSession(req);
  startSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

// "Try as admin (read-only)": the shared demo admin, which cannot change anything.
router.post('/admin', demoLimiter, (req, res) => {
  resetDemoIfDue();
  const user = demoAdmin();
  if (!user) return res.status(503).json({ error: 'The demo is restarting. Please try again in a moment.' });
  endCurrentSession(req);
  startSession(res, user);
  res.json({ user: publicUser(user) });
});

export default router;
