import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { db } from './db.js';
import { securityHeaders, sameOriginOnly, apiLimiter } from './security.js';
import { loadSession, demoAdminReadOnly } from './middleware/auth.js';
import { HttpError } from './validate.js';
import authRoutes, { signupMode } from './routes/auth.js';
import testRoutes from './routes/tests.js';
import attemptRoutes from './routes/attempts.js';
import adminRoutes from './routes/admin.js';
import demoRoutes from './routes/demo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const distDir = join(__dirname, '..', '..', 'frontend', 'dist');

function publicConfig() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin' AND is_demo = 0 LIMIT 1").get();
  return {
    demo: config.demoMode,
    signup: signupMode(),
    demoResetHours: config.demoMode ? config.demoResetHours : null,
    needsSetup: !config.demoMode && !hasAdmin,
  };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 404 ? 'Not found' : 'Bad request' });
  }
  // Details go to the server log only; the client never sees stack traces.
  console.error(`[error] ${req.method} ${req.originalUrl.split('?')[0]}`, err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders);

  // Render's health check: cheap, no session, no rate limit.
  app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(sameOriginOnly);
  api.use(express.json({ limit: '256kb', strict: true }));
  api.use(loadSession);
  api.use(apiLimiter);
  api.use(demoAdminReadOnly);

  api.get('/config', (req, res) => res.json(publicConfig()));
  api.use('/auth', authRoutes);
  api.use('/tests', testRoutes);
  api.use('/attempts', attemptRoutes);
  api.use('/admin', adminRoutes);
  api.use('/demo', demoRoutes);
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  // ---- The built React app (single service in production) ----
  if (existsSync(join(distDir, 'index.html'))) {
    app.use(
      '/assets',
      express.static(join(distDir, 'assets'), { index: false, immutable: true, maxAge: '1y', fallthrough: false })
    );
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    // Client-side routes get index.html; missing files get a real 404.
    app.get('/{*path}', (req, res) => {
      if (extname(req.path)) return res.status(404).type('text/plain').send('Not found');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (req, res) =>
      res.json({ service: 'proctorcode-api', note: 'Frontend build not found. Run the Vite dev server, or build the frontend.' })
    );
  }

  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));
  app.use(errorHandler);
  return app;
}
