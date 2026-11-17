import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { config, EMAIL_RE } from './config.js';
import { db, now, transaction, getSetting, setSetting } from './db.js';
import { hashPassword, revokeAllSessions, UNUSABLE_PASSWORD } from './middleware/auth.js';
import { sampleTests } from './sampleTests.js';

export { sampleTests };

const DEMO_ADMIN_EMAIL = 'demo-admin@demo.invalid';

// ---- Shared helpers ----

function insertUser({ name, email, passwordHash, role, isDemo = false }) {
  const info = db
    .prepare(
      'INSERT INTO users (name, email, password_hash, role, is_demo, token_version, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
    )
    .run(name, email, passwordHash, role, isDemo ? 1 : 0, now());
  return Number(info.lastInsertRowid);
}

export function insertSampleTests(createdBy) {
  const ids = {};
  for (const t of sampleTests) {
    const existing = db.prepare('SELECT id FROM tests WHERE title = ? AND created_by IS ?').get(t.title, createdBy);
    if (existing) {
      ids[t.title] = existing.id;
      continue;
    }
    const info = db
      .prepare(
        `INSERT INTO tests (title, description, language, duration_minutes, starter_code, is_active, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(t.title, t.description, t.language, t.duration_minutes, t.starter_code, createdBy, now());
    ids[t.title] = Number(info.lastInsertRowid);
  }
  return ids;
}

// ---- Owner admin from ADMIN_EMAIL / ADMIN_PASSWORD ----

/**
 * Creates the owner admin, or updates it when ADMIN_PASSWORD changed since it was last applied.
 * A password changed in the app is kept until ADMIN_PASSWORD itself changes.
 */
export async function ensureOwnerAdmin(log = () => {}) {
  const { adminEmail: email, adminPassword: password, adminName } = config;
  if (!email || !password || !EMAIL_RE.test(email)) return null;

  const markerKey = `owner_admin_password:${email}`;
  const marker = getSetting(markerKey);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    const hash = await hashPassword(password);
    const id = insertUser({ name: adminName, email, passwordHash: hash, role: 'admin' });
    setSetting(markerKey, hash);
    log(`  ✓ Admin account ready: ${email}`);
    return id;
  }

  const envChanged = !marker || !(await bcrypt.compare(password, marker));
  if (user.role !== 'admin' || user.is_demo) {
    // Someone else may have chosen this account's password, so always reset it.
    const hash = await hashPassword(password);
    db.prepare("UPDATE users SET role = 'admin', is_demo = 0, password_hash = ? WHERE id = ?").run(hash, user.id);
    revokeAllSessions(user.id);
    setSetting(markerKey, hash);
    log(`  ✓ ${email} is now an admin; its password was set from ADMIN_PASSWORD.`);
  } else if (envChanged) {
    const hash = await hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    revokeAllSessions(user.id);
    setSetting(markerKey, hash);
    log(`  ✓ Admin password for ${email} was set from ADMIN_PASSWORD (old sessions signed out).`);
  } else {
    log(`  ✓ Admin account ready: ${email}`);
  }
  return user.id;
}

/** Older versions shipped accounts with public passwords. Disable them if they still use them. */
export async function disableLegacyAccounts(log = () => {}) {
  const legacy = [
    ['admin@proctorcode.dev', 'admin123'],
    ['candidate@proctorcode.dev', 'test123'],
  ];
  for (const [email, password] of legacy) {
    const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (row && row.password_hash.startsWith('$2') && (await bcrypt.compare(password, row.password_hash))) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(UNUSABLE_PASSWORD, row.id);
      revokeAllSessions(row.id);
      log(`  ! Disabled old account ${email}: its password was published.`);
    }
  }
}

// ---- Public demo ----

const SAMPLE_PEOPLE = [
  {
    name: 'Priya Sharma (sample)',
    email: 'priya.sample@demo.invalid',
    test: 'Two Sum',
    status: 'submitted',
    startedMinutesAgo: 190,
    minutesTaken: 22,
    events: [['window_switch', 'Application window lost focus', 9]],
    code: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
`,
  },
  {
    name: 'Alex Chen (sample)',
    email: 'alex.sample@demo.invalid',
    test: 'Valid Palindrome',
    status: 'submitted',
    startedMinutesAgo: 120,
    minutesTaken: 24,
    events: [
      ['tab_switch', 'Switched away from the test tab', 3],
      ['looking_away', 'Candidate looking left', 5],
      ['copy', 'Copy action detected', 8],
      ['paste', 'Paste action detected', 8],
      ['looking_away', 'Candidate looking down', 14],
      ['window_switch', 'Application window lost focus', 19],
    ],
    code: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        cleaned = [c.lower() for c in s if c.isalnum()]
        return cleaned == cleaned[::-1]
`,
  },
  {
    name: 'Sam Rivera (sample)',
    email: 'sam.sample@demo.invalid',
    test: 'FizzBuzz',
    status: 'terminated',
    startedMinutesAgo: 45,
    minutesTaken: 9,
    events: [
      ['no_face', 'No face detected in frame', 1],
      ['multiple_faces', '2 faces detected in frame', 2],
      ['tab_switch', 'Switched away from the test tab', 3],
      ['no_face', 'No face detected in frame', 4],
      ['multiple_faces', '2 faces detected in frame', 5],
      ['fullscreen_exit', 'Exited fullscreen mode', 6],
      ['no_face', 'No face detected in frame', 7],
      ['tab_switch', 'Switched away from the test tab', 8],
      ['multiple_faces', '2 faces detected in frame', 8],
      ['no_face', 'No face detected in frame', 9],
    ],
    code: `function fizzBuzz(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
`,
  },
];

const SEVERITY = { window_switch: 'medium', looking_away: 'medium', copy: 'medium', tab_switch: 'high', paste: 'high', no_face: 'high', multiple_faces: 'high', fullscreen_exit: 'high' };
const PENALTY = { low: 2, medium: 5, high: 10 };

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

function insertSampleSessions(testIds) {
  for (const p of SAMPLE_PEOPLE) {
    const userId = insertUser({ name: p.name, email: p.email, passwordHash: UNUSABLE_PASSWORD, role: 'user', isDemo: true });
    const testId = testIds[p.test];
    const test = db.prepare('SELECT duration_minutes FROM tests WHERE id = ?').get(testId);
    let score = 100;
    for (const [type] of p.events) score = Math.max(0, score - PENALTY[SEVERITY[type]]);
    const info = db
      .prepare(
        `INSERT INTO attempts (test_id, user_id, code, status, integrity_score, started_at, deadline_at, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        testId,
        userId,
        p.code,
        p.status,
        score,
        minutesAgo(p.startedMinutesAgo),
        minutesAgo(p.startedMinutesAgo - test.duration_minutes),
        minutesAgo(p.startedMinutesAgo - p.minutesTaken)
      );
    const attemptId = Number(info.lastInsertRowid);
    for (const [type, details, minute] of p.events) {
      db.prepare('INSERT INTO violations (attempt_id, type, severity, details, created_at) VALUES (?, ?, ?, ?, ?)').run(
        attemptId,
        type,
        SEVERITY[type],
        details,
        minutesAgo(p.startedMinutesAgo - minute)
      );
    }
  }
}

export function demoAdmin() {
  return db.prepare('SELECT * FROM users WHERE email = ? AND is_demo = 1').get(DEMO_ADMIN_EMAIL);
}

/** Wipes every demo account (and what they created) and puts fresh sample data back. */
export function resetDemoData(log = () => {}) {
  transaction(() => {
    db.prepare('DELETE FROM tests WHERE created_by IN (SELECT id FROM users WHERE is_demo = 1)').run();
    db.prepare('DELETE FROM invites WHERE created_by IN (SELECT id FROM users WHERE is_demo = 1)').run();
    db.prepare('DELETE FROM users WHERE is_demo = 1').run();
    const adminId = insertUser({
      name: 'Demo Admin (read-only)',
      email: DEMO_ADMIN_EMAIL,
      passwordHash: UNUSABLE_PASSWORD,
      role: 'admin',
      isDemo: true,
    });
    insertSampleSessions(insertSampleTests(adminId));
    setSetting('demo_last_reset', now());
  });
  log('  ✓ Demo data reset');
}

/** Resets demo data when it is older than DEMO_RESET_HOURS (or missing). */
export function resetDemoIfDue(log = () => {}) {
  const last = getSetting('demo_last_reset');
  const due = !last || !demoAdmin() || Date.now() - new Date(last).getTime() >= config.demoResetHours * 3_600_000;
  if (due) resetDemoData(log);
  return due;
}

const MAX_VISITORS = 1000;

/** Creates a throwaway candidate for a demo visitor. */
export function createDemoCandidate() {
  const tag = randomBytes(6).toString('hex');
  const number = 1000 + (parseInt(tag.slice(0, 4), 16) % 9000);
  const id = insertUser({
    name: `Demo candidate ${number}`,
    email: `visitor-${tag}@demo.invalid`,
    passwordHash: UNUSABLE_PASSWORD,
    role: 'user',
    isDemo: true,
  });
  // Keep the demo small: drop the oldest visitors beyond the cap.
  db.prepare(
    `DELETE FROM users WHERE id IN (
       SELECT id FROM users WHERE is_demo = 1 AND email LIKE 'visitor-%' ORDER BY id DESC LIMIT -1 OFFSET ?
     )`
  ).run(MAX_VISITORS);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ---- Local development seed (npm run seed) ----

const randomPassword = () => randomBytes(12).toString('base64url');

export async function seedDevelopment(log = () => {}) {
  const accounts = [
    { name: 'Dev Admin', email: 'admin@proctorcode.test', role: 'admin' },
    { name: 'Dev Candidate', email: 'candidate@proctorcode.test', role: 'user' },
  ];
  const result = [];
  let adminId = null;
  for (const a of accounts) {
    const password = randomPassword();
    const hash = await hashPassword(password);
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(a.email);
    let id;
    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, role = ?, is_demo = 0 WHERE id = ?').run(hash, a.role, existing.id);
      revokeAllSessions(existing.id);
      id = existing.id;
    } else {
      id = insertUser({ name: a.name, email: a.email, passwordHash: hash, role: a.role });
    }
    if (a.role === 'admin') adminId = id;
    result.push({ ...a, password });
  }
  insertSampleTests(adminId);
  log('  ✓ Sample tests ready');
  return result;
}
