// Daily subscription lifecycle sweep (A2). Moves tenants between states as their
// dates pass: trial → expired (no purchase), active → grace → expired. Runs from
// the same daily scheduler as the reminders sweep. Idempotent and cheap.
const { getMasterConnection } = require('../config/db');
const { deriveStatus } = require('./subscription.service');
const { clearTenantCache } = require('../middleware/tenant');

async function runSubscriptionSweep() {
  const master = getMasterConnection();
  if (!master) return { updated: 0 };
  const Tenant = master.model('Tenant');
  let tenants = [];
  try {
    tenants = await Tenant.find({ status: { $in: ['trial', 'active', 'past_due', 'grace'] } });
  } catch (e) {
    console.error('[billing] sweep could not list tenants:', e.message);
    return { updated: 0 };
  }
  const now = new Date();
  let updated = 0;
  for (const t of tenants) {
    const next = deriveStatus(t, now);
    if (next && next !== t.status) {
      t.status = next;
      try {
        await t.save();
        clearTenantCache(t.subdomain);
        updated += 1;
        console.log(`[billing] ${t.subdomain}: ${next}`);
      } catch (e) {
        console.error(`[billing] sweep ${t.subdomain} failed:`, e.message);
      }
    }
  }
  if (updated) console.log(`[billing] subscription sweep — ${updated} status change(s)`);
  return { updated };
}

module.exports = { runSubscriptionSweep };
