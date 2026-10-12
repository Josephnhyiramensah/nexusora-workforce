// Subscription lifecycle (A2). Pure date/status logic — no DB, no provider.
// Lifecycle: trial → (purchase) → active → past_due → grace → expired.
// suspended is a manual admin state and is never auto-changed here.
const billing = require('../config/billing');
const { resolveEntitlements } = require('../config/plans');

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Fields to set when a brand-new tenant starts its free trial.
function startTrial(now = new Date()) {
  return { status: 'trial', trialEndsAt: addDays(now, billing.TRIAL_DAYS) };
}

// Fields to set when a payment succeeds and a paid period begins.
function beginPaidPeriod(now = new Date(), months = 1) {
  const end = new Date(now);
  end.setMonth(end.getMonth() + months);
  return {
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: end,
    graceEndsAt: addDays(end, billing.GRACE_DAYS),
    trialEndsAt: undefined,
  };
}

// What the status SHOULD be given the dates — used by a sweep/transition job to
// move tenants between states. Returns the status string (never writes).
function deriveStatus(tenant, now = new Date()) {
  const t = tenant || {};
  if (t.status === 'suspended') return 'suspended';
  if (t.status === 'trial') {
    if (t.trialEndsAt && now > new Date(t.trialEndsAt)) return 'expired';
    return 'trial';
  }
  if (t.currentPeriodEnd && now > new Date(t.currentPeriodEnd)) {
    if (t.graceEndsAt && now <= new Date(t.graceEndsAt)) return 'grace';
    return 'expired';
  }
  return t.status || 'active';
}

// Can this tenant use the product right now? Grace keeps read-write access so a
// late payment doesn't lock anyone out mid-cycle; expired/suspended cannot.
function isUsable(tenant) {
  return ['trial', 'active', 'grace', 'past_due'].includes((tenant && tenant.status) || 'active');
}

// Effective seat cap: a purchased seat count overrides the plan default.
function seatLimit(tenant) {
  const purchased = Number(tenant && tenant.seatsPurchased) || 0;
  if (purchased > 0) return purchased;
  return resolveEntitlements(tenant).seatLimit; // null = unlimited
}

// Whole days remaining on a trial (0 if none/over).
function trialDaysLeft(tenant, now = new Date()) {
  if (!tenant || !tenant.trialEndsAt) return 0;
  const ms = new Date(tenant.trialEndsAt) - now;
  return ms > 0 ? Math.ceil(ms / 86400000) : 0;
}

module.exports = { addDays, startTrial, beginPaidPeriod, deriveStatus, isUsable, seatLimit, trialDaysLeft };
