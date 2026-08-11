#!/usr/bin/env bash
# Nexusora Workforce - Phase 0 backend bootstrap (auto-generated, boot-tested).
# Run ONCE from the project root:  bash phase0_backend.sh
set -e
mkdir -p server/config server/i18n server/compliance server/compliance/packs server/models server/models/master server/models/tenant server/middleware server/.

echo "  writing server/config/env.js"
cat > server/config/env.js << 'NEXUSORA_EOF'
require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5002,
  DEFAULT_LOCALE: process.env.DEFAULT_LOCALE || 'en',
  MASTER_DB_URI: process.env.MASTER_DB_URI || '',
  MONGO_CLUSTER_URI: process.env.MONGO_CLUSTER_URI || '',
  TENANT_DB_PREFIX: process.env.TENANT_DB_PREFIX || 'nexusora_wf_',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_me',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',
  PLATFORM_ADMIN_SECRET: process.env.PLATFORM_ADMIN_SECRET || 'dev_platform_secret_change_me',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
};

module.exports = env;
NEXUSORA_EOF

echo "  writing server/config/currencies.js"
cat > server/config/currencies.js << 'NEXUSORA_EOF'
// Pan-African currency catalogue (ISO 4217) + common international settlement currencies.
// The multi-currency engine (reused from Nexusora Books) is currency-agnostic; this is the
// seed list a tenant chooses its base currency from. Adding one = one line here.
// decimals: minor-unit digits (0 for XOF/XAF/etc.), default 2.

const CURRENCIES = [
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'دج', decimals: 2 },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz', decimals: 2 },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', decimals: 0 },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', decimals: 0 },
  { code: 'BWP', name: 'Botswana Pula', symbol: 'P', decimals: 2 },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', decimals: 0 },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$', decimals: 2 },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF', decimals: 0 },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC', decimals: 2 },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', decimals: 0 },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', decimals: 2 },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk', decimals: 2 },
  { code: 'SZL', name: 'Eswatini Lilangeni', symbol: 'E', decimals: 2 },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', decimals: 2 },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D', decimals: 2 },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', decimals: 2 },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG', decimals: 0 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2 },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L', decimals: 2 },
  { code: 'LRD', name: 'Liberian Dollar', symbol: 'L$', decimals: 2 },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د', decimals: 3 },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', decimals: 2 },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', decimals: 2 },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM', decimals: 2 },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨', decimals: 2 },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH', decimals: 2 },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT', decimals: 2 },
  { code: 'NAD', name: 'Namibian Dollar', symbol: 'N$', decimals: 2 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', decimals: 0 },
  { code: 'STN', name: 'São Tomé & Príncipe Dobra', symbol: 'Db', decimals: 2 },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨', decimals: 2 },
  { code: 'SLE', name: 'Sierra Leonean Leone', symbol: 'Le', decimals: 2 },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'Sh', decimals: 2 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimals: 2 },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: '£', decimals: 2 },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س', decimals: 2 },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', decimals: 2 },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', decimals: 3 },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', decimals: 0 },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', decimals: 2 },
  { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: 'Z$', decimals: 2 },
  // International settlement currencies commonly used across Africa
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', decimals: 2 },
];

const byCode = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));
const listCurrencies = () => CURRENCIES;
const getCurrency = (code) => byCode[code] || null;
const isSupportedCurrency = (code) => Boolean(byCode[code]);

module.exports = { CURRENCIES, listCurrencies, getCurrency, isSupportedCurrency };
NEXUSORA_EOF

echo "  writing server/config/db.js"
cat > server/config/db.js << 'NEXUSORA_EOF'
// Multi-tenant connection factory.
// - ONE master/registry connection (tenants, platform users).
// - ONE cached Mongoose connection PER tenant DB (nexusora_wf_<subdomain>).
// - Every new tenant connection has ALL tenant models registered on it immediately
//   (registerAllModels) to prevent MissingSchemaError on .populate().
const mongoose = require('mongoose');
const env = require('./env');
const { registerAllModels } = require('../models/registerModels');

let masterConn = null;
const tenantConns = new Map();

async function connectMaster() {
  if (masterConn) return masterConn;
  if (!env.MASTER_DB_URI) {
    console.warn('[db] MASTER_DB_URI not set — running without master DB (dev bootstrap).');
    return null;
  }
  masterConn = await mongoose.createConnection(env.MASTER_DB_URI).asPromise();
  registerMasterModels(masterConn);
  console.log('[db] Master DB connected.');
  return masterConn;
}

function getMasterConnection() { return masterConn; }

function registerMasterModels(conn) {
  const Tenant = require('../models/master/Tenant');
  const PlatformUser = require('../models/master/PlatformUser');
  conn.models.Tenant || conn.model('Tenant', Tenant.schema);
  conn.models.PlatformUser || conn.model('PlatformUser', PlatformUser.schema);
}

// Build a tenant DB URI by appending the tenant DB name to the cluster URI.
function tenantUri(dbName) {
  const base = env.MONGO_CLUSTER_URI.replace(/\/+$/, '');
  return `${base}/${dbName}?retryWrites=true&w=majority`;
}

async function getTenantConnection(dbName) {
  if (!dbName) throw new Error('getTenantConnection: dbName required');
  if (tenantConns.has(dbName)) return tenantConns.get(dbName);
  if (!env.MONGO_CLUSTER_URI) throw new Error('MONGO_CLUSTER_URI not set');
  const conn = await mongoose.createConnection(tenantUri(dbName)).asPromise();
  registerAllModels(conn);              // <-- critical: register before any populate
  tenantConns.set(dbName, conn);
  console.log(`[db] Tenant connection opened: ${dbName}`);
  return conn;
}

module.exports = { connectMaster, getMasterConnection, getTenantConnection };
NEXUSORA_EOF

echo "  writing server/i18n/locales.js"
cat > server/i18n/locales.js << 'NEXUSORA_EOF'
// Locale registry for Nexusora Workforce.
// English is the DEFAULT and the only fully-translated locale at launch.
// Every other locale is registered here and becomes selectable in the language switcher;
// its UI strings are supplied by dropping in a translation JSON file (no code change).
// `dir` drives layout direction — 'rtl' for Arabic enables right-to-left rendering.
// `status`: 'ready' = strings shipped, 'registered' = selectable, translations pending.

const LOCALES = [
  { code: 'en', name: 'English',    nativeName: 'English',    dir: 'ltr', status: 'ready' },
  { code: 'fr', name: 'French',     nativeName: 'Français',   dir: 'ltr', status: 'registered' },
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',     dir: 'rtl', status: 'registered' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',  dir: 'ltr', status: 'registered' },
  { code: 'sw', name: 'Swahili',    nativeName: 'Kiswahili',  dir: 'ltr', status: 'registered' },
  // Indigenous languages — activate by shipping a translation file, then flip status to 'ready'.
  { code: 'ha', name: 'Hausa',      nativeName: 'Hausa',      dir: 'ltr', status: 'registered' },
  { code: 'yo', name: 'Yoruba',     nativeName: 'Yorùbá',     dir: 'ltr', status: 'registered' },
  { code: 'am', name: 'Amharic',    nativeName: 'አማርኛ',       dir: 'ltr', status: 'registered' },
  { code: 'zu', name: 'Zulu',       nativeName: 'isiZulu',    dir: 'ltr', status: 'registered' },
];

const DEFAULT_LOCALE = 'en';
const byCode = Object.fromEntries(LOCALES.map((l) => [l.code, l]));
const listLocales = () => LOCALES;
const getLocale = (code) => byCode[code] || null;
const isSupportedLocale = (code) => Boolean(byCode[code]);
const resolveDir = (code) => (byCode[code] ? byCode[code].dir : 'ltr');

module.exports = { LOCALES, DEFAULT_LOCALE, listLocales, getLocale, isSupportedLocale, resolveDir };
NEXUSORA_EOF

echo "  writing server/compliance/engine.js"
cat > server/compliance/engine.js << 'NEXUSORA_EOF'
// Country-AGNOSTIC compliance engine.
// It knows HOW to compute; it holds NO country values. All numbers come from a Compliance
// Pack (see compliance/packs/*). Adding a country never touches this file.
//
// A pack supplies:
//   incomeTax.brackets: [{ upTo: Number|null, rate: Number }]  (null upTo = top bracket)
//   incomeTax.standardDeductionRate: Number (0..1)             (e.g. Côte d'Ivoire 0.20)
//   socialSecurity.contributions: [{ name, base:'basic'|'gross', employeeRate, employerRate, ceiling:Number|null }]
//   leave.annual: [{ minMonths, days }]                        (tenure-banded entitlement)
//   minimumWage: { amount, period:'day'|'month', currency }

// Progressive income tax on an already-taxable amount, after any standard deduction.
function computeIncomeTax(pack, grossTaxable) {
  const t = (pack.incomeTax) || {};
  const deduction = (t.standardDeductionRate || 0) * grossTaxable;
  let taxable = Math.max(0, grossTaxable - deduction);
  let tax = 0;
  let lastCap = 0;
  for (const b of (t.brackets || [])) {
    const cap = (b.upTo == null) ? Infinity : b.upTo;
    if (taxable <= lastCap) break;
    const slice = Math.min(taxable, cap) - lastCap;
    if (slice > 0) tax += slice * b.rate;
    lastCap = cap;
    if (cap === Infinity) break;
  }
  return round2(tax);
}

// Social-security contributions for a period. Returns per-scheme + totals.
function computeSocialSecurity(pack, { basic = 0, gross = 0 } = {}) {
  const ss = (pack.socialSecurity) || {};
  const lines = [];
  let employeeTotal = 0;
  let employerTotal = 0;
  for (const c of (ss.contributions || [])) {
    let base = c.base === 'gross' ? gross : basic;
    if (c.ceiling != null) base = Math.min(base, c.ceiling);
    const employee = round2(base * (c.employeeRate || 0));
    const employer = round2(base * (c.employerRate || 0));
    employeeTotal += employee;
    employerTotal += employer;
    lines.push({ name: c.name, base: round2(base), employee, employer });
  }
  return { lines, employeeTotal: round2(employeeTotal), employerTotal: round2(employerTotal) };
}

// Tenure-banded annual-leave entitlement (days) from months of service.
function getAnnualLeaveEntitlement(pack, tenureMonths = 0) {
  const bands = ((pack.leave || {}).annual || []).slice().sort((a, b) => a.minMonths - b.minMonths);
  let days = 0;
  for (const band of bands) {
    if (tenureMonths >= band.minMonths) days = band.days;
  }
  return days;
}

// Minimum-wage floor for a number of days worked (used by the piece-rate safety gate).
function minimumWageFloor(pack, daysWorked = 0) {
  const mw = pack.minimumWage;
  if (!mw) return null;
  const perDay = mw.period === 'month' ? (mw.amount / 26) : mw.amount;
  return { amount: round2(perDay * daysWorked), currency: mw.currency };
}

// Enforce the statutory floor on output/piece-rate pay (plantation tappers etc.).
function applyMinimumWageGate(pack, { computedPay = 0, daysWorked = 0 } = {}) {
  const floor = minimumWageFloor(pack, daysWorked);
  if (!floor) return { pay: round2(computedPay), toppedUp: false, floor: null };
  if (computedPay < floor.amount) {
    return { pay: floor.amount, toppedUp: true, floor: floor.amount, shortfall: round2(floor.amount - computedPay) };
  }
  return { pay: round2(computedPay), toppedUp: false, floor: floor.amount };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

module.exports = {
  computeIncomeTax,
  computeSocialSecurity,
  getAnnualLeaveEntitlement,
  minimumWageFloor,
  applyMinimumWageGate,
};
NEXUSORA_EOF

echo "  writing server/compliance/registry.js"
cat > server/compliance/registry.js << 'NEXUSORA_EOF'
// Compliance pack registry — the single place countries are activated.
// To add a country: create compliance/packs/<country>.js from _template.js, then add it here.
const { isSupportedCurrency } = require('../config/currencies');
const { isSupportedLocale } = require('../i18n/locales');

const packs = [
  require('./packs/ghana'),
  require('./packs/liberia'),
  require('./packs/coteIvoire'),
];

const byCode = {};
for (const p of packs) {
  // Fail fast if a pack references a currency/locale the platform doesn't know.
  if (!isSupportedCurrency(p.currency)) {
    throw new Error(`Compliance pack ${p.countryCode}: unknown currency ${p.currency}`);
  }
  for (const loc of (p.officialLocales || [])) {
    if (!isSupportedLocale(loc)) {
      throw new Error(`Compliance pack ${p.countryCode}: unknown locale ${loc}`);
    }
  }
  byCode[p.countryCode] = p;
}

const getPack = (countryCode) => byCode[countryCode] || null;
const listPacks = () => Object.values(byCode).map((p) => ({
  countryCode: p.countryCode, countryName: p.countryName, currency: p.currency, officialLocales: p.officialLocales,
}));
const isSupportedCountry = (countryCode) => Boolean(byCode[countryCode]);

module.exports = { getPack, listPacks, isSupportedCountry };
NEXUSORA_EOF

echo "  writing server/compliance/packs/_template.js"
cat > server/compliance/packs/_template.js << 'NEXUSORA_EOF'
// COMPLIANCE PACK TEMPLATE — copy this file to add any African country.
// Fill the values from the country's revenue & social-security authorities, then register
// it in compliance/registry.js. All amounts are in the country's own currency.
// IMPORTANT: every figure below is CONFIRMED DATA to verify against the authority before
// go-live, and is effective-dated so historic pay runs stay correct.

module.exports = {
  countryCode: 'XX',                 // ISO 3166-1 alpha-2
  countryName: 'Country Name',
  currency: 'XXX',                   // ISO 4217, must exist in config/currencies.js
  officialLocales: ['en'],           // must exist in i18n/locales.js
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Revenue Authority', social: 'Social Security Body' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,        // 0..1 (e.g. 0.20 = 20% standard deduction)
    brackets: [                      // ordered; final bracket upTo: null
      { upTo: 0, rate: 0 },
    ],
  },

  socialSecurity: {
    contributions: [
      // { name: 'Scheme', base: 'basic'|'gross', employeeRate: 0, employerRate: 0, ceiling: null },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 0 } ],   // tenure-banded
    maternityWeeks: 0,
  },

  minimumWage: { amount: 0, period: 'day', currency: 'XXX' },

  statutoryReports: [],              // e.g. ['income-tax-return', 'social-security-schedule']

  notes: 'Source & verification notes here.',
};
NEXUSORA_EOF

echo "  writing server/compliance/packs/ghana.js"
cat > server/compliance/packs/ghana.js << 'NEXUSORA_EOF'
// GHANA compliance pack — INDICATIVE seed values. Verify against GRA (tax) & SSNIT (social)
// before go-live; keep effective-dated. Amounts in GHS (monthly basis).
module.exports = {
  countryCode: 'GH',
  countryName: 'Ghana',
  currency: 'GHS',
  officialLocales: ['en'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Ghana Revenue Authority (GRA)', social: 'SSNIT' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,
    // Monthly PAYE bands (indicative — confirm current GRA schedule).
    brackets: [
      { upTo: 490, rate: 0.00 },
      { upTo: 600, rate: 0.05 },
      { upTo: 730, rate: 0.10 },
      { upTo: 3896.67, rate: 0.175 },
      { upTo: 19896.67, rate: 0.25 },
      { upTo: 50416.67, rate: 0.30 },
      { upTo: null, rate: 0.35 },
    ],
  },

  socialSecurity: {
    contributions: [
      // SSNIT: employee 5.5% + employer 13% of basic (Tier 1 + Tier 2). Tier 3 voluntary.
      { name: 'SSNIT', base: 'basic', employeeRate: 0.055, employerRate: 0.13, ceiling: null },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 15 } ],   // Labour Act 651: min 15 working days
    maternityWeeks: 12,
  },

  minimumWage: { amount: 19.97, period: 'day', currency: 'GHS' }, // indicative daily NDMW

  statutoryReports: ['paye-return', 'ssnit-contribution-schedule'],
  notes: 'Bands/rates indicative; confirm with GRA & SSNIT and set effectiveFrom per change.',
};
NEXUSORA_EOF

echo "  writing server/compliance/packs/liberia.js"
cat > server/compliance/packs/liberia.js << 'NEXUSORA_EOF'
// LIBERIA compliance pack — INDICATIVE seed values. Verify against LRA (tax) & NASSCORP
// (social) before go-live. Liberia runs dual-currency (LRD/USD); base currency per tenant.
module.exports = {
  countryCode: 'LR',
  countryName: 'Liberia',
  currency: 'LRD',
  officialLocales: ['en'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Liberia Revenue Authority (LRA)', social: 'NASSCORP' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0,
    // PAYE 0%–25% (indicative annual bands — confirm current LRA schedule).
    brackets: [
      { upTo: 70000, rate: 0.00 },
      { upTo: 200000, rate: 0.05 },
      { upTo: 800000, rate: 0.15 },
      { upTo: null, rate: 0.25 },
    ],
  },

  socialSecurity: {
    contributions: [
      // NASSCORP national pension + employment-injury (indicative split — confirm).
      { name: 'NASSCORP Pension', base: 'gross', employeeRate: 0.03, employerRate: 0.03, ceiling: null },
      { name: 'NASSCORP Injury ( EII )', base: 'gross', employeeRate: 0.00, employerRate: 0.0175, ceiling: null },
    ],
  },

  leave: {
    // Decent Work Act: tenure-banded annual leave (indicative).
    annual: [ { minMonths: 12, days: 14 }, { minMonths: 36, days: 28 } ],
    maternityWeeks: 14,
  },

  minimumWage: { amount: 5.50, period: 'day', currency: 'USD' }, // indicative; verify

  statutoryReports: ['paye-return', 'nasscorp-schedule'],
  notes: 'Dual-currency (LRD/USD). Rates indicative; confirm with LRA & NASSCORP.',
};
NEXUSORA_EOF

echo "  writing server/compliance/packs/coteIvoire.js"
cat > server/compliance/packs/coteIvoire.js << 'NEXUSORA_EOF'
// CÔTE D'IVOIRE compliance pack — INDICATIVE seed values. Verify against DGI (ITS) & CNPS
// (social) before go-live. Amounts in XOF (monthly). Official UI locale: French.
module.exports = {
  countryCode: 'CI',
  countryName: "Côte d'Ivoire",
  currency: 'XOF',
  officialLocales: ['fr'],
  effectiveFrom: '2026-01-01',
  authority: { tax: 'Direction Générale des Impôts (DGI)', social: 'CNPS' },

  incomeTax: {
    method: 'progressive',
    standardDeductionRate: 0.20,   // 20% standard deduction before ITS brackets
    // ITS reformed schedule, 0%–32% (indicative — confirm current DGI brackets).
    brackets: [
      { upTo: 75000, rate: 0.00 },
      { upTo: 240000, rate: 0.16 },
      { upTo: 800000, rate: 0.21 },
      { upTo: 2400000, rate: 0.24 },
      { upTo: 8000000, rate: 0.28 },
      { upTo: null, rate: 0.32 },
    ],
  },

  socialSecurity: {
    contributions: [
      // CNPS retirement (indicative 6.3% employee / 7.7% employer) + employer-only branches.
      { name: 'CNPS Retirement', base: 'gross', employeeRate: 0.063, employerRate: 0.077, ceiling: 3375000 },
      { name: 'CNPS Family Allowances', base: 'gross', employeeRate: 0.00, employerRate: 0.0575, ceiling: 70000 },
      { name: 'CNPS Work Injury', base: 'gross', employeeRate: 0.00, employerRate: 0.02, ceiling: 70000 },
    ],
  },

  leave: {
    annual: [ { minMonths: 12, days: 26 } ],  // ~2.2 working days/month (indicative)
    maternityWeeks: 14,
  },

  minimumWage: { amount: 75000, period: 'month', currency: 'XOF' }, // SMIG (indicative)

  statutoryReports: ['its-declaration', 'cnps-declaration'],
  notes: 'Francophone (fr). Rates indicative; confirm with DGI & CNPS.',
};
NEXUSORA_EOF

echo "  writing server/models/registerModels.js"
cat > server/models/registerModels.js << 'NEXUSORA_EOF'
// Registers ALL per-tenant models on a given tenant connection.
// Called once when a tenant connection is created (config/db.js). Idempotent.
function registerAllModels(conn) {
  const defs = [
    require('./tenant/User'),
    require('./tenant/CompliancePack'),
    // ...more tenant models added here as modules are built (Employee, Attendance, ...)
  ];
  for (const def of defs) {
    if (!conn.models[def.modelName]) {
      conn.model(def.modelName, def.schema);
    }
  }
  return conn;
}
module.exports = { registerAllModels };
NEXUSORA_EOF

echo "  writing server/models/master/Tenant.js"
cat > server/models/master/Tenant.js << 'NEXUSORA_EOF'
// Master/registry model: one document per client organisation (tenant).
// Exports schema + modelName only — registered on the MASTER connection (never default).
const mongoose = require('mongoose');
const { isSupportedCurrency } = require('../../config/currencies');
const { isSupportedLocale, DEFAULT_LOCALE } = require('../../i18n/locales');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  dbName: { type: String, required: true, unique: true },   // nexusora_wf_<subdomain>
  countryCode: { type: String, required: true, uppercase: true },  // drives Compliance Pack
  baseCurrency: { type: String, required: true, uppercase: true, validate: { validator: isSupportedCurrency, message: 'Unsupported currency' } },
  defaultLocale: { type: String, default: DEFAULT_LOCALE, validate: { validator: isSupportedLocale, message: 'Unsupported locale' } },
  enabledLocales: { type: [String], default: [DEFAULT_LOCALE] },
  plan: { type: String, enum: ['starter', 'professional', 'enterprise'], default: 'starter' },
  status: { type: String, enum: ['active', 'suspended', 'trial', 'expired'], default: 'trial' },
  modules: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
}, { minimize: false, collection: 'tenants' });

module.exports = { schema, modelName: 'Tenant' };
NEXUSORA_EOF

echo "  writing server/models/master/PlatformUser.js"
cat > server/models/master/PlatformUser.js << 'NEXUSORA_EOF'
// Master model: Nexusora-side platform administrators (separate from tenant users).
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const schema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['platform_admin'], default: 'platform_admin' },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'platform_users' });

schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
schema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = { schema, modelName: 'PlatformUser' };
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
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
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

schema.index({ email: 1 }, { unique: true });
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

echo "  writing server/models/tenant/CompliancePack.js"
cat > server/models/tenant/CompliancePack.js << 'NEXUSORA_EOF'
// Per-tenant effective-dated compliance OVERRIDES (optional).
// The base rules live in code (compliance/packs/*). A tenant may store overrides here
// (e.g. a negotiated rate, or a rate change effective a certain date) which the engine
// merges over the code pack. Keeps statutory values as data, never hard-coded.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  countryCode: { type: String, required: true, uppercase: true },
  effectiveFrom: { type: Date, required: true },
  overrides: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'compliance_packs' });

module.exports = { schema, modelName: 'CompliancePack' };
NEXUSORA_EOF

echo "  writing server/middleware/auth.js"
cat > server/middleware/auth.js << 'NEXUSORA_EOF'
// Auth middleware. Token payload = { userId, tenant: <subdomain>, role }.
// protect: require a valid token. optionalProtect: attach if present, else continue.
// authorise(...roles): role gate (default-deny). Granular permission check also provided.
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function readToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

function protect(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Not authorised: no token' });
  try {
    req.auth = jwt.verify(token, env.JWT_SECRET);   // { userId, tenant, role }
    return next();
  } catch (e) {
    return res.status(401).json({ message: 'Not authorised: invalid token' });
  }
}

function optionalProtect(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try { req.auth = jwt.verify(token, env.JWT_SECRET); } catch (e) { /* ignore */ }
  return next();
}

function authorise(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Not authorised' });
    if (roles.length && !roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

// Passes if the user has the role OR an explicit granular permission grant.
function requirePermission(permission, ...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Not authorised' });
    const hasRole = allowedRoles.includes(req.auth.role);
    const hasGrant = Array.isArray(req.auth.permissions) && req.auth.permissions.includes(permission);
    if (hasRole || hasGrant) return next();
    return res.status(403).json({ message: 'Forbidden: missing permission' });
  };
}

module.exports = { protect, optionalProtect, authorise, requirePermission };
NEXUSORA_EOF

echo "  writing server/middleware/tenant.js"
cat > server/middleware/tenant.js << 'NEXUSORA_EOF'
// Resolve the tenant for this request and attach its DB connection + record.
// SECURITY: tenant identity comes from the verified token (req.auth.tenant) or the request
// host subdomain — NEVER from a client-supplied body/query value. No hard-coded fallback.
const env = require('../config/env');
const { getMasterConnection, getTenantConnection } = require('../config/db');

function subdomainFromHost(host) {
  if (!host) return null;
  const name = host.split(':')[0];
  const parts = name.split('.');
  // e.g. acme.nexusora-workforce.app -> 'acme'; ignore localhost / bare hosts
  if (parts.length < 3) return null;
  const sub = parts[0].toLowerCase();
  if (['www', 'api', 'app'].includes(sub)) return null;
  return sub;
}

async function resolveTenant(req, res, next) {
  try {
    // 1) trusted sources only
    let subdomain = (req.auth && req.auth.tenant) || subdomainFromHost(req.headers.host);
    // dev convenience: allow an explicit header ONLY in non-production
    if (!subdomain && env.NODE_ENV !== 'production') {
      subdomain = req.headers['x-tenant-subdomain'];
    }
    if (!subdomain) return res.status(400).json({ message: 'Tenant could not be resolved' });

    const master = getMasterConnection();
    if (!master) return res.status(503).json({ message: 'Registry unavailable' });

    const Tenant = master.model('Tenant');
    const tenant = await Tenant.findOne({ subdomain });
    if (!tenant) return res.status(404).json({ message: 'Unknown tenant' });
    if (tenant.status === 'suspended') return res.status(403).json({ message: 'Tenant suspended' });

    req.tenant = tenant;
    req.tenantConn = await getTenantConnection(tenant.dbName);
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { resolveTenant, subdomainFromHost };
NEXUSORA_EOF

echo "  writing server/middleware/errorHandler.js"
cat > server/middleware/errorHandler.js << 'NEXUSORA_EOF'
function notFound(req, res, next) {
  res.status(404).json({ message: `Not found: ${req.originalUrl}` });
}
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  if (process.env.NODE_ENV !== 'test') console.error('[error]', err.message);
  res.status(status).json({
    message: err.message || 'Server error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
}
module.exports = { notFound, errorHandler };
NEXUSORA_EOF

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
const { listLocales, DEFAULT_LOCALE } = require('./i18n/locales');
const { listCurrencies } = require('./config/currencies');
const { listPacks } = require('./compliance/registry');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Progressive lockout on auth endpoints (rule: brute-force protection)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);

// Health + platform capability probe (proves the pan-African registries are wired).
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'nexusora-workforce-api',
    env: env.NODE_ENV,
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

// TODO: mount module routers here as they are built
// app.use('/api/auth', require('./modules/auth/auth.routes'));
// app.use('/api/employees', require('./modules/employees/employee.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
NEXUSORA_EOF

echo "  writing server/server.js"
cat > server/server.js << 'NEXUSORA_EOF'
const app = require('./app');
const env = require('./config/env');
const { connectMaster } = require('./config/db');

async function start() {
  try {
    await connectMaster();               // non-fatal in dev if URI absent
  } catch (e) {
    console.error('[startup] Master DB connection failed:', e.message);
  }
  app.listen(env.PORT, () => {
    console.log(`Nexusora Workforce API listening on :${env.PORT} (${env.NODE_ENV})`);
  });
}
start();
NEXUSORA_EOF

echo
echo "Phase 0 backend files written (20 files)."
