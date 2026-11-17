import { config, checkConfig } from './config.js';

const { errors, warnings } = checkConfig(config);
for (const w of warnings) console.warn(`  ! ${w}`);
if (errors.length) {
  console.error(`\nProctorCode will not start (NODE_ENV=${config.nodeEnv}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

// Loaded after the check so a bad configuration never touches the database.
const { db, now } = await import('./db.js');
const { createApp, distDir } = await import('./app.js');
const { ensureOwnerAdmin, disableLegacyAccounts, resetDemoIfDue } = await import('./seedData.js');
const { closeOverdueAttempts } = await import('./routes/attempts.js');
const { existsSync } = await import('node:fs');
const { join } = await import('node:path');

const log = (m) => console.log(m);

await disableLegacyAccounts(log);
await ensureOwnerAdmin(log);
if (config.demoMode) {
  resetDemoIfDue(log);
  console.log(`  ✓ Public demo mode is ON (demo data resets every ${config.demoResetHours} h)`);
}
const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_demo = 0").get().c;
if (!admins) {
  console.warn('  ! No admin account yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (on Render: Environment tab), then redeploy.');
}

// Housekeeping: close timed-out attempts and drop expired sessions.
setInterval(() => {
  try {
    closeOverdueAttempts();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  } catch (e) {
    console.error('Housekeeping failed:', e.message);
  }
}, 60_000).unref();

if (config.demoMode) {
  setInterval(() => {
    try {
      resetDemoIfDue(log);
    } catch (e) {
      console.error('Demo reset failed:', e.message);
    }
  }, 10 * 60_000).unref();
}

const app = createApp();
const server = app.listen(config.port, config.host, (err) => {
  if (err) {
    console.error(`Could not start the server: ${err.message}`);
    process.exit(1);
  }
  const { port } = server.address();
  console.log(`\n  ProctorCode running on http://localhost:${port}`);
  console.log(`  Database: ${config.dbPath}`);
  console.log(`  Frontend build served: ${existsSync(join(distDir, 'index.html')) ? 'yes' : 'no (dev mode)'}\n`);
});

function shutdown(signal) {
  console.log(`  ${signal} received, shutting down…`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
