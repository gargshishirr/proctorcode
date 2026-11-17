// Local development only: creates a dev admin + dev candidate with fresh random passwords.
import { config } from './config.js';

if (config.production) {
  console.error('npm run seed is for local development only. It is disabled when NODE_ENV=production.');
  process.exit(1);
}

const { seedDevelopment } = await import('./seedData.js');

console.log('\nSeeding ProctorCode (development)…\n');
const accounts = await seedDevelopment((m) => console.log(m));
console.log('\n  Sign in with these generated passwords (new ones every time you run the seed):\n');
for (const a of accounts) {
  console.log(`  ${a.role === 'admin' ? 'Admin    ' : 'Candidate'}  ${a.email}  /  ${a.password}`);
}
console.log(`\n  Database: ${config.dbPath}\n`);
