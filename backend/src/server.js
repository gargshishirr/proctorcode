import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import './db.js';
import { seedIfEmpty } from './seedData.js';
import authRoutes from './routes/auth.js';
import testRoutes from './routes/tests.js';
import attemptRoutes from './routes/attempts.js';
import adminRoutes from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', '..', 'frontend', 'dist');

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser tools (no origin) and configured origins.
      if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
      return cb(null, true); // permissive in dev; tighten for production
    },
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'proctorcode-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/admin', adminRoutes);

// Unmatched API routes -> JSON 404
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Serve the built React app (single-service production deploy) ----
const hasBuild = existsSync(join(distDir, 'index.html'));
if (hasBuild) {
  app.use(express.static(distDir));
  // SPA fallback: send index.html for any non-API route so client routing works.
  app.get('*', (req, res) => res.sendFile(join(distDir, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res.json({ service: 'proctorcode-api', note: 'Frontend build not found. Run the Vite dev server, or build the frontend.' })
  );
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Auto-seed demo data on first boot (e.g. on ephemeral cloud disks).
try {
  const seeded = seedIfEmpty((m) => console.log(m));
  if (seeded) console.log('  Demo accounts ready (admin@proctorcode.dev / candidate@proctorcode.dev).');
} catch (e) {
  console.error('Seed-on-start failed:', e.message);
}

app.listen(config.port, () => {
  console.log(`\n  ProctorCode running on http://localhost:${config.port}`);
  console.log(`  API health: http://localhost:${config.port}/api/health`);
  console.log(`  Frontend build served: ${hasBuild ? 'yes' : 'no (dev mode)'}\n`);
});
