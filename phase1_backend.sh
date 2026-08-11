#!/usr/bin/env bash
# Nexusora Workforce - Phase 1 backend (provisioning + auth + employees + seed).
# Adds to the Phase 0 server. Run ONCE from the project root:  bash phase1_backend.sh
set -e
mkdir -p server/models server/models/tenant server/utils server/middleware server/modules/platform server/modules/auth server/modules/employees server/scripts

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
    // ...more tenant models added here as modules are built
  ];
  for (const def of defs) {
    if (!conn.models[def.modelName]) conn.model(def.modelName, def.schema);
  }
  return conn;
}
module.exports = { registerAllModels };
NEXUSORA_EOF

echo "  writing server/models/tenant/User.js"
cat > server/models/tenant/User.js << 'NEXUSORA_EOF'
// Per-tenant user (login identity). Registered ONLY on tenant connections.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { DEFAULT_LOCALE } = require('../../i18n/locales');

const ROLES = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'employee' },
  permissions: { type: [String], default: [] },     // granular grants on top of role
  locale: { type: String, default: DEFAULT_LOCALE }, // user's preferred UI language
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'users' });

schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
schema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = { schema, modelName: 'User', ROLES };
NEXUSORA_EOF

echo "  writing server/utils/generateToken.js"
cat > server/utils/generateToken.js << 'NEXUSORA_EOF'
const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Sign a JWT. Tenant tokens use JWT_SECRET; platform tokens pass the platform secret.
function signToken(payload, { secret = env.JWT_SECRET, expiresIn = env.JWT_EXPIRE } = {}) {
  return jwt.sign(payload, secret, { expiresIn });
}
module.exports = { signToken };
NEXUSORA_EOF

echo "  writing server/middleware/platformAuth.js"
cat > server/middleware/platformAuth.js << 'NEXUSORA_EOF'
// Platform-admin auth — SEPARATE secret from tenant auth (defence in depth).
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function platformProtect(req, res, next) {
  const h = req.headers.authorization;
  const token = (h && h.startsWith('Bearer ')) ? h.slice(7) : (req.cookies && req.cookies.token);
  if (!token) return res.status(401).json({ message: 'Platform authentication required' });
  try {
    const payload = jwt.verify(token, env.PLATFORM_ADMIN_SECRET);
    if (payload.scope !== 'platform') return res.status(401).json({ message: 'Not a platform token' });
    req.platform = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid platform token' });
  }
}
module.exports = { platformProtect };
NEXUSORA_EOF

echo "  writing server/models/tenant/Employee.js"
cat > server/models/tenant/Employee.js << 'NEXUSORA_EOF'
// Per-tenant Employee record (Core HR). Registered only on tenant connections.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  staffId: { type: String, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  dateOfBirth: Date,
  nationalId: String,
  socialSecurityNumber: String,   // SSNIT / NASSCORP / CNPS number
  taxId: String,
  email: { type: String, lowercase: true, trim: true },
  phone: String,

  employment: {
    jobTitle: String,
    department: String,
    costCentre: String,           // maps to Nexusora Books cost centre
    grade: String,
    employmentType: { type: String, enum: ['permanent', 'contract', 'casual', 'seasonal', 'probation'], default: 'permanent' },
    workerClass: { type: String, enum: ['staff', 'field_worker', 'tapper', 'operator'], default: 'staff' },
    lineManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    startDate: Date,
    confirmationStatus: { type: String, enum: ['probation', 'confirmed', 'exited'], default: 'probation' },
    contractType: String,
    contractEnd: Date,
  },

  compensation: {
    baseSalary: Number,
    currency: String,             // defaults to tenant baseCurrency at creation
    payBasis: { type: String, enum: ['salary', 'hourly', 'piece_rate', 'task'], default: 'salary' },
  },

  status: { type: String, enum: ['active', 'suspended', 'terminated'], default: 'active' },
  custom: { type: mongoose.Schema.Types.Mixed, default: {} },  // per-tenant custom fields
  createdAt: { type: Date, default: Date.now },
}, { collection: 'employees', minimize: false });

schema.index({ lastName: 1, firstName: 1 });

module.exports = { schema, modelName: 'Employee' };
NEXUSORA_EOF

echo "  writing server/modules/platform/platform.controller.js"
cat > server/modules/platform/platform.controller.js << 'NEXUSORA_EOF'
const asyncHandler = require('express-async-handler');
const env = require('../../config/env');
const { getMasterConnection, getTenantConnection } = require('../../config/db');
const { signToken } = require('../../utils/generateToken');
const { isSupportedCountry } = require('../../compliance/registry');
const { isSupportedCurrency } = require('../../config/currencies');
const { isSupportedLocale } = require('../../i18n/locales');

// POST /api/platform/login
const platformLogin = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { email, password } = req.body;
  const PlatformUser = master.model('PlatformUser');
  const user = await PlatformUser.findOne({ email: (email || '').toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password || ''))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken({ id: user._id, scope: 'platform', role: 'platform_admin' }, { secret: env.PLATFORM_ADMIN_SECRET });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
});

// POST /api/platform/tenants  (create + provision a tenant)
const createTenant = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const { name, subdomain, countryCode, baseCurrency, defaultLocale, enabledLocales, plan, admin } = req.body;

  if (!name || !subdomain || !countryCode || !baseCurrency || !admin || !admin.email || !admin.password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  const sub = String(subdomain).toLowerCase().trim();
  if (!/^[a-z0-9-]+$/.test(sub)) return res.status(400).json({ message: 'Invalid subdomain (a-z, 0-9, - only)' });
  const cc = String(countryCode).toUpperCase();
  if (!isSupportedCountry(cc)) return res.status(400).json({ message: `No compliance pack for ${cc}` });
  const cur = String(baseCurrency).toUpperCase();
  if (!isSupportedCurrency(cur)) return res.status(400).json({ message: `Unsupported currency ${cur}` });
  const dloc = defaultLocale || 'en';
  const locales = (enabledLocales && enabledLocales.length) ? enabledLocales : [dloc];
  for (const l of locales) if (!isSupportedLocale(l)) return res.status(400).json({ message: `Unsupported locale ${l}` });

  const Tenant = master.model('Tenant');
  if (await Tenant.findOne({ subdomain: sub })) return res.status(409).json({ message: 'Subdomain already exists' });

  const dbName = `${env.TENANT_DB_PREFIX}${sub}`;
  const tenant = await Tenant.create({
    name, subdomain: sub, dbName, countryCode: cc, baseCurrency: cur,
    defaultLocale: dloc, enabledLocales: locales, plan: plan || 'starter', status: 'active',
  });

  // Provision the tenant DB: create its super_admin.
  const conn = await getTenantConnection(dbName);
  const User = conn.model('User');
  await User.create({
    name: admin.name || 'Administrator', email: admin.email.toLowerCase(),
    password: admin.password, role: 'super_admin', locale: dloc,
  });

  res.status(201).json({
    tenant: { id: tenant._id, name: tenant.name, subdomain: tenant.subdomain, countryCode: tenant.countryCode, baseCurrency: tenant.baseCurrency, plan: tenant.plan },
    adminEmail: admin.email.toLowerCase(),
  });
});

// GET /api/platform/tenants
const listTenants = asyncHandler(async (req, res) => {
  const master = getMasterConnection();
  if (!master) return res.status(503).json({ message: 'Registry unavailable' });
  const Tenant = master.model('Tenant');
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  res.json(tenants.map((t) => ({
    id: t._id, name: t.name, subdomain: t.subdomain, countryCode: t.countryCode,
    baseCurrency: t.baseCurrency, plan: t.plan, status: t.status, createdAt: t.createdAt,
  })));
});

module.exports = { platformLogin, createTenant, listTenants };
NEXUSORA_EOF

echo "  writing server/modules/platform/platform.routes.js"
cat > server/modules/platform/platform.routes.js << 'NEXUSORA_EOF'
const express = require('express');
const router = express.Router();
const { platformProtect } = require('../../middleware/platformAuth');
const { platformLogin, createTenant, listTenants } = require('./platform.controller');

router.post('/login', platformLogin);
router.post('/tenants', platformProtect, createTenant);
router.get('/tenants', platformProtect, listTenants);

module.exports = router;
NEXUSORA_EOF

echo "  writing server/modules/auth/auth.controller.js"
cat > server/modules/auth/auth.controller.js << 'NEXUSORA_EOF'
const asyncHandler = require('express-async-handler');
const { signToken } = require('../../utils/generateToken');

function safeUser(u) {
  return { id: u._id, name: u.name, email: u.email, role: u.role, permissions: u.permissions, locale: u.locale, isActive: u.isActive };
}
function tenantInfo(t) {
  return { name: t.name, subdomain: t.subdomain, countryCode: t.countryCode, baseCurrency: t.baseCurrency, defaultLocale: t.defaultLocale, enabledLocales: t.enabledLocales, plan: t.plan, modules: t.modules };
}

// POST /api/auth/login  (resolveTenant has set req.tenant + req.tenantConn)
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const User = req.tenantConn.model('User');
  const user = await User.findOne({ email: (email || '').toLowerCase(), isActive: true }).select('+password');
  if (!user || !(await user.matchPassword(password || ''))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken({ userId: user._id, tenant: req.tenant.subdomain, role: user.role, permissions: user.permissions || [] });
  res.json({ token, user: safeUser(user), tenant: tenantInfo(req.tenant) });
});

// GET /api/auth/me  (protect + resolveTenant)
const me = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: safeUser(user), tenant: tenantInfo(req.tenant) });
});

// POST /api/auth/users  (admin creates a user; gated in routes)
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, permissions, locale } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
  const User = req.tenantConn.model('User');
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already exists' });
  const user = await User.create({
    name, email: email.toLowerCase(), password, role: role || 'employee',
    permissions: permissions || [], locale: locale || req.tenant.defaultLocale,
  });
  res.status(201).json({ user: safeUser(user) });
});

// GET /api/auth/users
const listUsers = asyncHandler(async (req, res) => {
  const User = req.tenantConn.model('User');
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map(safeUser));
});

module.exports = { login, me, createUser, listUsers };
NEXUSORA_EOF

echo "  writing server/modules/auth/auth.routes.js"
cat > server/modules/auth/auth.routes.js << 'NEXUSORA_EOF'
const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../../middleware/tenant');
const { protect, authorise } = require('../../middleware/auth');
const { login, me, createUser, listUsers } = require('./auth.controller');

router.post('/login', resolveTenant, login);
router.get('/me', protect, resolveTenant, me);
router.post('/users', protect, resolveTenant, authorise('super_admin', 'hr_manager'), createUser);
router.get('/users', protect, resolveTenant, authorise('super_admin', 'hr_manager', 'hr_officer'), listUsers);

module.exports = router;
NEXUSORA_EOF

echo "  writing server/modules/employees/employee.controller.js"
cat > server/modules/employees/employee.controller.js << 'NEXUSORA_EOF'
const asyncHandler = require('express-async-handler');

// GET /api/employees  (list with search + pagination)
const list = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const { q, department, status, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (department) filter['employment.department'] = department;
  if (q) {
    const rx = new RegExp(String(q).trim(), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { staffId: rx }, { email: rx }];
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
    Employee.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
});

const getById = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findById(req.params.id);
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json(e);
});

const create = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const body = { ...req.body };
  // default currency to tenant base if not supplied
  if (body.compensation && !body.compensation.currency) body.compensation.currency = req.tenant.baseCurrency;
  const e = await Employee.create(body);
  res.status(201).json(e);
});

const update = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json(e);
});

const deactivate = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(req.params.id, { status: 'terminated' }, { new: true });
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json({ message: 'Employee deactivated', employee: e });
});

module.exports = { list, getById, create, update, deactivate };
NEXUSORA_EOF

echo "  writing server/modules/employees/employee.routes.js"
cat > server/modules/employees/employee.routes.js << 'NEXUSORA_EOF'
const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./employee.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);
router.get('/', authorise(...READ), c.list);
router.get('/:id', authorise(...READ), c.getById);
router.post('/', authorise(...WRITE), c.create);
router.put('/:id', authorise(...WRITE), c.update);
router.delete('/:id', authorise(...WRITE), c.deactivate);

module.exports = router;
NEXUSORA_EOF

echo "  writing server/scripts/seedDemo.js"
cat > server/scripts/seedDemo.js << 'NEXUSORA_EOF'
// One-off seed: platform admin + a demo tenant + its super_admin.
// Run from server/:  node scripts/seedDemo.js
require('dotenv').config();
const { connectMaster, getMasterConnection, getTenantConnection } = require('../config/db');
const env = require('../config/env');

async function run() {
  await connectMaster();
  const master = getMasterConnection();
  if (!master) { console.error('No master DB — set MONGO_CLUSTER_URI in server/.env'); process.exit(1); }

  const PlatformUser = master.model('PlatformUser');
  const Tenant = master.model('Tenant');

  const padminEmail = 'admin@nexusora.tech';
  if (!(await PlatformUser.findOne({ email: padminEmail }))) {
    await PlatformUser.create({ name: 'Platform Admin', email: padminEmail, password: 'ChangeMe123!' });
    console.log('Created platform admin:', padminEmail, '/ ChangeMe123!');
  } else console.log('Platform admin exists:', padminEmail);

  const sub = 'demo';
  const dbName = `${env.TENANT_DB_PREFIX}${sub}`;
  if (!(await Tenant.findOne({ subdomain: sub }))) {
    await Tenant.create({
      name: 'Demo Plantation Ltd', subdomain: sub, dbName,
      countryCode: 'GH', baseCurrency: 'GHS', defaultLocale: 'en', enabledLocales: ['en', 'fr'],
      plan: 'enterprise', status: 'active', modules: [],
    });
    console.log('Created tenant: demo (GH / GHS / en+fr)');
  } else console.log('Tenant "demo" exists');

  const conn = await getTenantConnection(dbName);
  const User = conn.model('User');
  const adminEmail = 'admin@demo.local';
  if (!(await User.findOne({ email: adminEmail }))) {
    await User.create({ name: 'Demo Admin', email: adminEmail, password: 'Demo123!', role: 'super_admin', locale: 'en' });
    console.log('Created tenant super_admin:', adminEmail, '/ Demo123!');
  } else console.log('Tenant admin exists:', adminEmail);

  console.log('\nSeed complete. Test tenant login:');
  console.log(`  curl -s -X POST http://localhost:5002/api/auth/login -H "Content-Type: application/json" -H "x-tenant-subdomain: demo" -d '{"email":"admin@demo.local","password":"Demo123!"}'`);
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
NEXUSORA_EOF

echo
echo "Phase 1 backend written (13 files)."
echo "Next: cd server && node scripts/seedDemo.js   then   npm run dev"
