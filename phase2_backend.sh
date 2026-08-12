#!/usr/bin/env bash
# Nexusora Workforce - Phase 2 backend: Attendance & Absenteeism (lost-man-day tracking).
# Adds to Phase 0/1 server. Run ONCE from project root:  bash phase2_backend.sh
set -e
mkdir -p server/models server/models/tenant server/modules/attendance

echo "  writing server/app.js"
cat > server/app.js << 'NEXUSORA_EOF'
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
NEXUSORA_EOF

echo "  writing server/models/registerModels.js"
cat > server/models/registerModels.js << 'NEXUSORA_EOF'
// Registers ALL per-tenant models on a given tenant connection. Idempotent.
function registerAllModels(conn) {
  const defs = [
    require('./tenant/User'),
    require('./tenant/CompliancePack'),
    require('./tenant/Employee'),
    require('./tenant/Attendance'),
    // ...more tenant models added here as modules are built
  ];
  for (const def of defs) {
    if (!conn.models[def.modelName]) conn.model(def.modelName, def.schema);
  }
  return conn;
}
module.exports = { registerAllModels };
NEXUSORA_EOF

echo "  writing server/models/tenant/Attendance.js"
cat > server/models/tenant/Attendance.js << 'NEXUSORA_EOF'
// Per-tenant daily attendance / field-muster record. One row per employee per day.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true },   // normalised to day start (UTC)
  status: { type: String, enum: ['present', 'absent', 'late', 'half_day', 'leave', 'rest_day', 'holiday'], required: true },

  department: String,   // denormalised for analytics grouping
  section: String,      // plantation section / estate
  shift: String,
  clockIn: String,
  clockOut: String,
  hoursWorked: Number,
  overtimeHours: Number,

  // Plantation output capture (for piece-rate tappers): e.g. kg of latex/cuplump.
  output: { quantity: Number, unit: String },

  // Absenteeism handling
  absenceReason: String,           // sick, unauthorised, etc.
  excused: { type: Boolean, default: false },
  lostManDay: { type: Number, default: 0 },   // computed server-side (1 absent, 0.5 half_day)
  returnToWork: { completed: { type: Boolean, default: false }, date: Date, note: String },

  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'attendance', minimize: false });

schema.index({ employee: 1, date: 1 }, { unique: true });   // one record per employee per day
schema.index({ date: 1, department: 1 });

module.exports = { schema, modelName: 'Attendance' };
NEXUSORA_EOF

echo "  writing server/modules/attendance/attendance.util.js"
cat > server/modules/attendance/attendance.util.js << 'NEXUSORA_EOF'
// Attendance helpers — the lost-man-day rule lives here so it is testable and never client-set.
const STATUSES = ['present', 'absent', 'late', 'half_day', 'leave', 'rest_day', 'holiday'];
// "Scheduled" = a day the worker was expected to work (excludes planned rest days & holidays).
const SCHEDULED = ['present', 'absent', 'late', 'half_day', 'leave'];

// Lost man-day: a full day lost to unplanned absence = 1; half day = 0.5; everything else = 0.
// (Planned 'leave' is NOT a lost man-day — only unplanned absence hurts output.)
function lostManDay(status) {
  if (status === 'absent') return 1;
  if (status === 'half_day') return 0.5;
  return 0;
}
function isScheduled(status) { return SCHEDULED.includes(status); }
function dayStart(d) { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; }

module.exports = { STATUSES, SCHEDULED, lostManDay, isScheduled, dayStart };
NEXUSORA_EOF

echo "  writing server/modules/attendance/attendance.controller.js"
cat > server/modules/attendance/attendance.controller.js << 'NEXUSORA_EOF'
const asyncHandler = require('express-async-handler');
const { STATUSES, SCHEDULED, lostManDay, dayStart } = require('./attendance.util');

// POST /api/attendance/muster — bulk upsert a crew's attendance for one date.
const muster = asyncHandler(async (req, res) => {
  const { date, department, section, entries } = req.body;
  if (!date || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: 'date and a non-empty entries[] are required' });
  }
  const day = dayStart(date);
  const Attendance = req.tenantConn.model('Attendance');
  const ops = entries.map((e) => {
    const status = STATUSES.includes(e.status) ? e.status : 'present';
    return {
      updateOne: {
        filter: { employee: e.employee, date: day },
        update: { $set: {
          employee: e.employee, date: day, status,
          department: e.department || department, section: e.section || section,
          hoursWorked: e.hoursWorked, overtimeHours: e.overtimeHours,
          output: e.output, absenceReason: e.absenceReason, excused: !!e.excused,
          lostManDay: lostManDay(status), recordedBy: req.auth.userId,
        } },
        upsert: true,
      },
    };
  });
  const result = await Attendance.bulkWrite(ops);
  res.json({ message: 'Muster saved', date: day, count: entries.length, upserted: result.upsertedCount, modified: result.modifiedCount });
});

// GET /api/attendance — list with filters + pagination.
const list = asyncHandler(async (req, res) => {
  const Attendance = req.tenantConn.model('Attendance');
  const { from, to, employee, department, status, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (employee) filter.employee = employee;
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (from || to) { filter.date = {}; if (from) filter.date.$gte = dayStart(from); if (to) filter.date.$lte = dayStart(to); }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const [items, total] = await Promise.all([
    Attendance.find(filter).populate('employee', 'firstName lastName staffId').sort({ date: -1 }).skip((pg - 1) * lim).limit(lim),
    Attendance.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
});

// GET /api/attendance/absenteeism — the plantation KPI: lost man-days, rate, breakdowns.
const absenteeism = asyncHandler(async (req, res) => {
  const Attendance = req.tenantConn.model('Attendance');
  const { from, to, department } = req.query;
  const match = {};
  if (department) match.department = department;
  if (from || to) { match.date = {}; if (from) match.date.$gte = dayStart(from); if (to) match.date.$lte = dayStart(to); }

  const schedCond = { $cond: [{ $in: ['$status', SCHEDULED] }, 1, 0] };

  const [totals] = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: null,
      records: { $sum: 1 },
      scheduled: { $sum: schedCond },
      lostManDays: { $sum: '$lostManDay' },
      absentCount: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
      presentCount: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
    } },
  ]);
  const scheduled = totals ? totals.scheduled : 0;
  const lostManDays = totals ? totals.lostManDays : 0;
  const absenteeismRate = scheduled ? Number(((lostManDays / scheduled) * 100).toFixed(2)) : 0;

  const byDepartment = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: '$department', scheduled: { $sum: schedCond }, lostManDays: { $sum: '$lostManDay' } } },
    { $project: { _id: 0, department: { $ifNull: ['$_id', '—'] }, scheduled: 1, lostManDays: 1,
      rate: { $cond: [{ $gt: ['$scheduled', 0] }, { $multiply: [{ $divide: ['$lostManDays', '$scheduled'] }, 100] }, 0] } } },
    { $sort: { lostManDays: -1 } },
  ]);

  const trend = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: '$date', lostManDays: { $sum: '$lostManDay' } } },
    { $project: { _id: 0, date: '$_id', lostManDays: 1 } },
    { $sort: { date: 1 } },
  ]);

  const chronic = await Attendance.aggregate([
    { $match: { ...match, status: 'absent' } },
    { $group: { _id: '$employee', absences: { $sum: 1 } } },
    { $sort: { absences: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'emp' } },
    { $project: { _id: 0, employee: '$_id', absences: 1,
      name: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$emp.firstName', 0] }, '?'] }, ' ', { $ifNull: [{ $arrayElemAt: ['$emp.lastName', 0] }, ''] }] } } },
  ]);

  res.json({
    range: { from: from || null, to: to || null, department: department || null },
    summary: { scheduledManDays: scheduled, lostManDays, absenteeismRate, absentCount: totals ? totals.absentCount : 0, presentCount: totals ? totals.presentCount : 0 },
    byDepartment, trend, chronic,
  });
});

module.exports = { muster, list, absenteeism };
NEXUSORA_EOF

echo "  writing server/modules/attendance/attendance.routes.js"
cat > server/modules/attendance/attendance.routes.js << 'NEXUSORA_EOF'
const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./attendance.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager'];

router.use(protect, resolveTenant);
router.get('/absenteeism', authorise(...READ), c.absenteeism);
router.get('/', authorise(...READ), c.list);
router.post('/muster', authorise(...WRITE), c.muster);

module.exports = router;
NEXUSORA_EOF

echo
echo "Phase 2 backend written (6 files). Restart: cd server && npm run dev"
