// Daily billing maintenance (A2): subscription lifecycle transitions, scheduled
// downgrades, and dunning for overdue invoices. Runs from the daily scheduler.
const { getMasterConnection } = require('../config/db');
const { deriveStatus } = require('./subscription.service');
const { clearTenantCache } = require('../middleware/tenant');
const emailSvc = require('./email.service');

const DUNNING_MAX = 3;         // up to 3 reminders per invoice
const DUNNING_SPACING_MS = 3 * 86400000;   // at least 3 days apart

// Move tenants between states as dates pass, and apply any scheduled downgrade
// once the paid period has ended.
async function runStatusSweep(master) {
  const Tenant = master.model('Tenant');
  let tenants = [];
  try {
    tenants = await Tenant.find({ status: { $in: ['trial', 'active', 'past_due', 'grace'] } });
  } catch (e) {
    console.error('[billing] sweep could not list tenants:', e.message);
    return 0;
  }
  const now = new Date();
  let updated = 0;
  for (const t of tenants) {
    let changed = false;
    // Apply a scheduled downgrade at/after period end.
    if (t.pendingPlan && t.currentPeriodEnd && now > new Date(t.currentPeriodEnd) && t.pendingPlan !== t.plan) {
      t.plan = t.pendingPlan; t.pendingPlan = undefined; changed = true;
    }
    const next = deriveStatus(t, now);
    if (next && next !== t.status) { t.status = next; changed = true; }
    if (changed) {
      try { await t.save(); clearTenantCache(t.subdomain); updated += 1; console.log(`[billing] ${t.subdomain}: ${t.status}${t.plan ? ' / ' + t.plan : ''}`); }
      catch (e) { console.error(`[billing] sweep ${t.subdomain} failed:`, e.message); }
    }
  }
  if (updated) console.log(`[billing] subscription sweep — ${updated} change(s)`);
  return updated;
}

// Email reminders for open invoices past their due date (spaced, capped).
async function runDunning(master) {
  const Invoice = master.model('Invoice');
  const Tenant = master.model('Tenant');
  const now = new Date();
  let overdue = [];
  try {
    overdue = await Invoice.find({ status: 'open', dueDate: { $lt: now } });
  } catch (e) {
    console.error('[billing] dunning could not list invoices:', e.message);
    return 0;
  }
  let reminded = 0;
  for (const inv of overdue) {
    if ((inv.remindersSent || 0) >= DUNNING_MAX) continue;
    if (inv.lastReminderAt && (now - new Date(inv.lastReminderAt)) < DUNNING_SPACING_MS) continue;
    const tenant = await Tenant.findById(inv.tenant);
    if (!tenant) continue;
    inv.remindersSent = (inv.remindersSent || 0) + 1;
    inv.lastReminderAt = now;
    try { await inv.save(); } catch (e) { console.error('[billing] dunning save failed:', e.message); continue; }
    emailSvc.sendPaymentReminder({
      to: tenant.billingEmail, tenant,
      invoice: { number: inv.number, total: inv.total, currency: inv.currency, dueDate: new Date(inv.dueDate).toLocaleDateString() },
      attempt: inv.remindersSent,
    }).catch((e) => console.error('[email] dunning failed:', e && e.message));
    reminded += 1;
  }
  if (reminded) console.log(`[billing] dunning — ${reminded} reminder(s) sent`);
  return reminded;
}

async function runSubscriptionSweep() {
  const master = getMasterConnection();
  if (!master) return { updated: 0, reminded: 0 };
  const updated = await runStatusSweep(master);
  const reminded = await runDunning(master);
  return { updated, reminded };
}

module.exports = { runSubscriptionSweep, runStatusSweep, runDunning };
