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
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);
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
app.use('/api/notifications', require('./modules/notifications/notification.routes'));
app.use(notFound);
app.use(errorHandler);
module.exports = app;