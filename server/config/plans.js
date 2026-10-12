// server/config/plans.js
// Subscription plans, the modules/features each unlocks, and seat limits.
// Pure config, no imports, no DB — the single source of truth for plan-based
// feature gating (C2) and the price basis for billing (A2).
//
// Entitlement resolution (resolveEntitlements) layers per-tenant overrides on
// top of the plan so the admin console (A3) can grant/revoke a module for one
// tenant without changing their plan:
//     effective = plan set  ∪  tenant.featureFlags.enable  −  tenant.featureFlags.disable
//
// NOTE ON PRICES: the `price`/`seatPrice` numbers below are PLACEHOLDERS pending
// Joseph's confirmation (see the A2 billing step). Gating does not depend on
// them; they are read only when invoices are raised.

// ---- Canonical module keys (must match the API route mounts in app.js) ------
const MODULES = {
  employees:   'Employees',
  org:         'Org structure',
  positions:   'Positions',
  picklists:   'Picklists',
  attendance:  'Attendance',
  leave:       'Leave',
  payroll:     'Payroll',
  settings:    'Settings',
  recruitment: 'Recruitment',
  onboarding:  'Onboarding',
  performance: 'Performance',
  analytics:   'Analytics',
  documents:   'Documents',
  workforce:   'Workforce planning',
  learning:    'Learning',
  compliance:  'Compliance',
  succession:  'Succession',
  welfare:     'Welfare & social',
  engagement:  'Engagement',
  ai:          'Workforce Intelligence',
};

// ---- Canonical capability keys (non-module features, gate-able per plan) -----
const FEATURES = {
  workforce_intelligence: 'AI Insights, Ask HR, Dashboard Builder, Data Scientist',
  external_api:           'External REST API + API keys + webhooks',
  advanced_analytics:     'Trend/forecast, cohort & retention analytics',
  engagement_surveys:     'Pulse surveys, eNPS, driver analysis',
  multi_currency:         'Multi-currency payroll & reporting',
  sso:                    'SSO / SAML / OAuth sign-in',
  audit_log:              'Full audit trail',
};

// Always available regardless of plan — the product is unusable without these.
const CORE_MODULES = ['employees', 'org', 'positions', 'picklists', 'settings', 'documents', 'notifications'];

// ---- Plans ------------------------------------------------------------------
// seatLimit: null = unlimited. interval: billing cadence. price/seatPrice in the
// plan's billing currency (default GHS) — PLACEHOLDER values.
const PLANS = {
  starter: {
    key: 'starter',
    label: 'Starter',
    order: 1,
    seatLimit: 25,
    price: 0,                 // PLACEHOLDER
    seatPrice: 0,             // PLACEHOLDER
    interval: 'month',
    modules: [...CORE_MODULES, 'attendance', 'leave', 'recruitment', 'onboarding'],
    features: [],
  },
  professional: {
    key: 'professional',
    label: 'Professional',
    order: 2,
    seatLimit: 200,
    price: 0,                 // PLACEHOLDER
    seatPrice: 0,             // PLACEHOLDER
    interval: 'month',
    modules: [...CORE_MODULES, 'attendance', 'leave', 'recruitment', 'onboarding',
      'payroll', 'performance', 'analytics', 'workforce', 'learning', 'compliance',
      'succession', 'welfare', 'engagement'],
    features: ['advanced_analytics', 'engagement_surveys', 'multi_currency', 'audit_log'],
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    order: 3,
    seatLimit: null,          // unlimited
    price: 0,                 // PLACEHOLDER
    seatPrice: 0,             // PLACEHOLDER
    interval: 'month',
    modules: Object.keys(MODULES),   // every module
    features: Object.keys(FEATURES), // every feature
  },
};

const PLAN_KEYS = Object.keys(PLANS);
const isValidPlan = (p) => PLAN_KEYS.includes(String(p));
const getPlan = (p) => PLANS[isValidPlan(p) ? p : 'starter'];

// ---- Entitlement resolution -------------------------------------------------
// Merge a plan's grant with a tenant's per-tenant overrides. `tenant` may be a
// lean record or plain object; missing/garbage overrides are ignored safely.
function resolveEntitlements(tenant) {
  const plan = getPlan(tenant && tenant.plan);
  const ff = (tenant && tenant.featureFlags) || {};
  const enable = Array.isArray(ff.enable) ? ff.enable : [];
  const disable = Array.isArray(ff.disable) ? ff.disable : [];

  const modSet = new Set(plan.modules);
  const featSet = new Set(plan.features);
  for (const k of enable) { if (MODULES[k]) modSet.add(k); if (FEATURES[k]) featSet.add(k); }
  for (const k of disable) { modSet.delete(k); featSet.delete(k); }
  // Core modules can never be disabled.
  for (const k of CORE_MODULES) modSet.add(k);

  return {
    plan: plan.key,
    planLabel: plan.label,
    seatLimit: plan.seatLimit,
    modules: [...modSet],
    features: [...featSet],
  };
}

function planHasModule(tenant, moduleKey) {
  return resolveEntitlements(tenant).modules.includes(moduleKey);
}
function planHasFeature(tenant, featureKey) {
  return resolveEntitlements(tenant).features.includes(featureKey);
}

module.exports = {
  MODULES, FEATURES, CORE_MODULES, PLANS, PLAN_KEYS,
  isValidPlan, getPlan, resolveEntitlements, planHasModule, planHasFeature,
};
