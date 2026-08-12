const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { masterReady } = require('./config/db');
const { listLocales, DEFAULT_LOCALE } = require('./i18n/locales');
const { listCurrencies } = require('./config/currencies');
const { listPacks } = require('./compliance/registry');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Progressive lockout on auth endpoints (brute-force protection)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);

// Health + platform capability probe. `db.master` shows whether Atlas is connected.
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

// Public config for the client (language switcher, currency picker, country packs).
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
app.use('/api/attendance', require('./modules/attendance/attendance.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
