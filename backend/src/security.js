import { isIP } from 'node:net';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from './config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The real client IP, used for rate limits and lockouts.
 * On Render every request passes through Cloudflare, which overwrites CF-Connecting-IP with the
 * connecting address, so it cannot be spoofed there. Elsewhere we rely on Express' "trust proxy".
 */
export function clientIp(req) {
  if (config.useCfConnectingIp) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && isIP(cf.trim())) return cf.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ---- Security headers ----
function cspDirectives({ upgrade }) {
  return {
    defaultSrc: ["'self'"],
    // TensorFlow.js (used by face-api) compiles a tiny WebAssembly helper; 'wasm-unsafe-eval'
    // allows WebAssembly only. JavaScript eval stays blocked.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    // The Monaco editor injects <style> tags and style attributes at runtime (themes, decorations).
    styleSrc: ["'self'", "'unsafe-inline'"],
    // Monaco draws error squiggles with data: SVG images.
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    // Monaco's workers come from 'self'; the candidate's "Run" sandbox is a blob: worker.
    workerSrc: ["'self'", 'blob:'],
    // The webcam preview uses a MediaStream (srcObject), which needs no URL source.
    mediaSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: upgrade ? [] : null,
  };
}

function helmetFor(upgrade) {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives({ upgrade }) },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.hsts ? { maxAge: 15552000, includeSubDomains: true } : false,
    xPoweredBy: false,
  });
}

const helmetHttps = helmetFor(true);
const helmetHttp = helmetFor(false);

export function securityHeaders(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), fullscreen=(self)'
  );
  // Only ask browsers to upgrade sub-requests when the page itself came over HTTPS.
  return (req.secure ? helmetHttps : helmetHttp)(req, res, next);
}

// ---- CSRF: state-changing API calls must come from our own pages ----
function originAllowed(origin, req) {
  if (config.appOrigin && origin === config.appOrigin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function sameOriginOnly(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  // Bodies must be JSON: plain HTML forms can't send that cross-site without a CORS preflight.
  const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'Send JSON (Content-Type: application/json)' });
  }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (originAllowed(origin, req)) return next();
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  // Browsers send Origin on these requests. Without it, fall back to Fetch Metadata if present.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  return next(); // non-browser client (no ambient cookies to abuse)
}

// ---- Rate limits ----
const ipKey = (req) => ipKeyGenerator(clientIp(req));
const tooMany = (message) => (req, res, next, options) => {
  res.status(options.statusCode).json({ error: message });
};

/** Failed sign-in / sign-up attempts per IP (successful ones don't count). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: tooMany('Too many attempts from your network. Please wait 15 minutes and try again.'),
});

/** "Try the demo" buttons create accounts, so keep them modest per IP. */
export const demoLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: tooMany('Too many demo sessions from your network. Please try again later.'),
});

/** General API budget, per signed-in user (or per IP when signed out). */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  // Signed-out traffic is per IP, so allow more: a class behind one school IP loads the app together.
  limit: (req) => (req.user ? 300 : 600),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKey(req)}`),
  handler: tooMany('Too many requests. Please slow down.'),
});

// ---- Sign-in lockout ----
// Counts failed sign-ins per (IP + email) and per email. Unknown emails are tracked exactly like
// real ones, so the response never reveals whether an account exists.
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const PER_IP_ACCOUNT = 5;
const PER_ACCOUNT = 50;
const MAX_ENTRIES = 50_000;

class FailureCounter {
  constructor() {
    this.entries = new Map();
  }

  #get(key, now) {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.lockedUntil <= now && now - e.firstAt > WINDOW_MS) {
      this.entries.delete(key);
      return null;
    }
    return e;
  }

  lockedFor(key, now = Date.now()) {
    const e = this.#get(key, now);
    return e && e.lockedUntil > now ? e.lockedUntil - now : 0;
  }

  fail(key, threshold, now = Date.now()) {
    let e = this.#get(key, now);
    if (!e || e.lockedUntil > 0) {
      if (e && e.lockedUntil > now) return; // already locked
      e = { count: 0, firstAt: now, lockedUntil: 0 };
    }
    e.count += 1;
    if (e.count >= threshold) e.lockedUntil = now + LOCK_MS;
    this.entries.delete(key);
    this.entries.set(key, e);
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value);
  }

  reset(key) {
    this.entries.delete(key);
  }
}

const failures = new FailureCounter();

export const loginLockout = {
  keys(req, email) {
    return { pair: `${ipKey(req)}|${email}`, account: `acct|${email}` };
  },
  /** Milliseconds until sign-in is allowed again (0 when not locked). */
  lockedFor(req, email) {
    const k = this.keys(req, email);
    return Math.max(failures.lockedFor(k.pair), failures.lockedFor(k.account));
  },
  fail(req, email) {
    const k = this.keys(req, email);
    failures.fail(k.pair, PER_IP_ACCOUNT);
    failures.fail(k.account, PER_ACCOUNT);
  },
  succeed(req, email) {
    failures.reset(this.keys(req, email).pair);
  },
};
