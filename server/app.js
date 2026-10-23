const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { masterReady } = require('./config/db');
const { listLocales, DEFAULT_LOCALE } = require('./i18n/locales');
const { listCurrencies } = require('./config/currencies');
const { listPacks } = require('./compliance/registry');
const app = express();
app.use(helmet());
// gzip/deflate the API — the biggest single win on a slow link. Compresses any
// response over ~1KB; clients that send `x-no-compression` opt out. (Brotli is
// best terminated at the reverse proxy / CDN in production.)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => (req.headers['x-no-compression'] ? false : compression.filter(req, res)),
}));
// CORS: allow the configured client origin, and — when a base domain is set —
// any https tenant subdomain of it (acme.nexusoraworkforce.com), so per-tenant
// origins work even in a split client/API host setup. Same-origin requests (the
// SPA's relative /api calls) and server-to-server calls (no Origin) pass through.
const corsOrigin = (origin, cb) => {
  if (!origin) return cb(null, true);
  if (origin === env.CLIENT_URL) return cb(null, true);
  const base = env.APP_BASE_DOMAIN;
  if (base) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host === base || host.endsWith('.' + base)) return cb(null, true);
    } catch { /* malformed origin → reject below */ }
  }
  return cb(new Error('Not allowed by CORS'));
};
app.use(cors({ origin: corsOrigin, credentials: true }));
// Capture the raw body so webhook handlers (e.g. Paystack) can verify HMAC
// signatures against the exact bytes received.
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(cookieParser());
// Strip Mongo operator/dotted keys from all inputs (NoSQL-injection guard, E1).
app.use(require('./middleware/sanitize').sanitize);
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Lightweight perf logger: flags slow requests and shows how much of the time
// was tenant resolution (a DB round-trip) vs the handler. Watch the server
// console: "[perf] 200 GET /api/employees 31240ms (tenant 15010ms)" tells you
// the time is in the database/network, not the app code. Threshold via SLOW_MS.
const SLOW_MS = Number(process.env.SLOW_MS || 1500);
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    if (ms >= SLOW_MS) {
      const tn = req._tenantMs != null ? ` (tenant ${req._tenantMs}ms)` : '';
      // eslint-disable-next-line no-console
      console.warn(`[perf] ${res.statusCode} ${req.method} ${req.originalUrl} ${ms}ms${tn}`);
    }
  });
  next();
});

// Audit trail (C1): record authenticated mutations across all modules. Logs on
// response finish, so it reads req.auth/req.tenantConn after the routes set them.
app.use(require('./middleware/auditTrail').auditTrail);

// Brute-force protection on the CREDENTIAL endpoints only. Applying a tight limit
// to the whole /api/auth surface throttled high-frequency authenticated calls —
// /api/auth/me (hit on every page load), profile saves, user admin — surfacing as
// spurious 429s ("Sign in failed", "Could not save profile", vanishing role-gated
// UI). Scope it to the public credential routes, and don't count SUCCESSFUL
// logins — only failed attempts burn the budget, so real users are never locked out.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});
for (const p of ['/api/auth/login', '/api/auth/2fa/login', '/api/auth/forgot-password',
  '/api/auth/reset-password', '/api/auth/verify-email', '/api/auth/resend-verification']) {
  app.use(p, credentialLimiter);
}

// Rate-limit the public, API-key-authenticated surface (/api/v1) to curb abuse
// and key brute-forcing. Keyed per API key (hashed, so raw keys never sit in the
// limiter store) and per IP otherwise.
const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => {
    const h = req.headers.authorization || '';
    const key = h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-api-key'] || '');
    return key ? 'k:' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 24) : ipKeyGenerator(req.ip || '');
  },
  message: { success: false, message: 'Rate limit exceeded — slow down and try again shortly.' },
});
app.use('/api/v1', apiKeyLimiter);
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'nexusora-workforce-api',
    env: env.NODE_ENV,
    db: { master: masterReady() ? 'connected' : 'down' },
    defaultLocale: DEFAULT_LOCALE,
    locales: listLocales().map((l) => ({ code: l.code, name: l.name, dir: l.dir, status: l.status })),
    currencies: listCurrencies().length,
    compliancePacks: listPacks(),
  });
});
app.get('/api/config', (req, res) => {
  res.json({
    defaultLocale: DEFAULT_LOCALE,
    locales: listLocales(),
    currencies: listCurrencies(),
    countries: listPacks(),
  });
});
// Module routers
app.use('/api/platform', require('./modules/platform/platform.routes'));
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/employees', require('./modules/employees/employee.routes'));
app.use('/api/org', require('./modules/org/org.routes'));
app.use('/api/positions', require('./modules/positions/position.routes'));
app.use('/api/picklists', require('./modules/picklists/picklist.routes'));
app.use('/api/attendance', require('./modules/attendance/attendance.routes'));
app.use('/api/leave', require('./modules/leave/leave.routes'));
app.use('/api/payroll', require('./modules/payroll/payroll.routes'));
app.use('/api/settings', require('./modules/settings/settings.routes'));
app.use('/api/recruitment', require('./modules/recruitment/recruitment.routes'));
app.use('/api/onboarding', require('./modules/onboarding/onboarding.routes'));
app.use('/api/performance', require('./modules/performance/performance.routes'));
app.use('/api/analytics', require('./modules/analytics/analytics.routes'));
app.use('/api/documents', require('./modules/documents/documents.routes'));
app.use('/api/workforce', require('./modules/workforce/workforce.routes'));
app.use('/api/learning', require('./modules/learning/learning.routes'));
app.use('/api/compliance', require('./modules/compliance/compliance.routes'));
app.use('/api/succession', require('./modules/succession/succession.routes'));
app.use('/api/ai', require('./modules/ai/ai.routes'));
app.use('/api/welfare', require('./modules/welfare/welfare.routes'));
app.use('/api/engagement', require('./modules/engagement/engagement.routes'));
app.use('/api/notifications', require('./modules/notifications/notification.routes'));
app.use('/api/fx', require('./modules/fx/fx.routes'));
app.use('/api/billing', require('./modules/billing/billing.routes'));
app.use('/api/audit', require('./modules/audit/audit.routes'));
app.use('/api/v1', require('./modules/apikeys/externalApi.routes'));
app.use(notFound);
app.use(errorHandler);
module.exports = app;