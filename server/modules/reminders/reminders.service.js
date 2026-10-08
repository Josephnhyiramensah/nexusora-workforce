// Overdue reminders engine.
//
// Scans a tenant for overdue work (currently: onboarding tasks past their due
// date) and alerts the people in charge, both ways:
//   • in-app  — a Notification addressed to the HR roles (shows in the bell
//               and on the notifications page)
//   • email   — a digest to those users (only if SMTP is configured)
//
// De-duplicated per day via the Notification.broadcastId key, so running the
// sweep repeatedly in a day never spams. Runs on a daily schedule (see
// startReminderScheduler) and can be triggered on demand for one tenant via
// POST /notifications/run-reminders.
const env = require('../../config/env');
const { getMasterConnection, getTenantConnection } = require('../../config/db');
const { sendMail, isConfigured: mailConfigured } = require('../../utils/mailer');

// Roles that own onboarding / HR follow-up.
const HR_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];

const ymd = (d = new Date()) => d.toISOString().slice(0, 10);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const empName = (e) => e ? [e.firstName, e.lastName].filter(Boolean).join(' ') || e.staffId || 'Employee' : 'Employee';

// Collect overdue onboarding tasks for a tenant connection.
async function collectOnboardingOverdue(conn) {
  const Onboarding = conn.model('Onboarding');
  conn.model('Employee'); // ensure registered for populate
  const now = new Date();
  const docs = await Onboarding.find({ status: { $in: ['not_started', 'in_progress'] } })
    .populate('employee', 'firstName lastName staffId')
    .lean();

  const items = [];
  const hires = new Set();
  for (const d of docs) {
    for (const t of (d.tasks || [])) {
      if (t.status === 'pending' && t.dueDate && new Date(t.dueDate) < now) {
        items.push({
          employee: empName(d.employee),
          staffId: d.employee?.staffId || '',
          title: t.title,
          category: t.category || 'hr',
          dueDate: t.dueDate,
        });
        hires.add(String(d.employee?._id || d._id));
      }
    }
  }
  items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); // most overdue first
  return { count: items.length, hires: hires.size, items };
}

// Active HR users with an email address, for the email digest.
async function hrRecipients(conn) {
  const User = conn.model('User');
  const users = await User.find({ role: { $in: HR_ROLES }, isActive: true, email: { $nin: [null, ''] } })
    .select('name email role').lean();
  return users;
}

function buildMessage(summary) {
  const top = summary.items.slice(0, 5)
    .map((i) => `• ${i.title} — ${i.employee} (due ${fmtDate(i.dueDate)})`)
    .join('\n');
  const more = summary.count > 5 ? `\n…and ${summary.count - 5} more.` : '';
  return `${summary.count} onboarding task(s) are overdue across ${summary.hires} hire(s):\n${top}${more}`;
}

function buildEmailHtml(summary, tenantName) {
  const rows = summary.items.slice(0, 20).map((i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eef1f6;">${i.title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef1f6;">${i.employee}${i.staffId ? ` <span style="color:#8b96a9">· ${i.staffId}</span>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eef1f6;color:#D97706;white-space:nowrap;">due ${fmtDate(i.dueDate)}</td>
    </tr>`).join('');
  const link = `${env.APP_URL.replace(/\/$/, '')}/onboarding`;
  return `
  <div style="font-family:Inter,Arial,sans-serif;color:#16233b;max-width:640px;margin:0 auto;">
    <div style="background:linear-gradient(120deg,#012158,#0b3f96);color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
      <div style="font-weight:800;font-size:16px;">Nexusora Workforce</div>
      <div style="opacity:.85;font-size:13px;margin-top:2px;">${tenantName || 'Your workspace'} · Onboarding reminder</div>
    </div>
    <div style="border:1px solid #e6ebf3;border-top:none;border-radius:0 0 12px 12px;padding:20px 22px;">
      <p style="margin:0 0 14px;font-size:15px;"><strong>${summary.count} onboarding task(s)</strong> are overdue across <strong>${summary.hires} hire(s)</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>
      <a href="${link}" style="display:inline-block;margin-top:18px;background:#012158;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:9px;font-size:14px;">Open onboarding</a>
      <p style="margin:18px 0 0;color:#8b96a9;font-size:12px;">You're receiving this because you hold an HR role in this workspace.</p>
    </div>
  </div>`;
}

// Run the sweep for ONE tenant connection. Creates the notification (deduped
// per day) and emails HR. Returns a summary of what happened.
async function runForTenant(conn, { tenantName } = {}) {
  const summary = await collectOnboardingOverdue(conn);
  const result = { ...summary, notified: false, emailed: 0, emailSkipped: false, deduped: false };
  if (summary.count === 0) return result;

  const Notification = conn.model('Notification');
  const broadcastId = `reminder:onboarding-overdue:${ymd()}`;

  // Dedup: one reminder per day.
  const existing = await Notification.findOne({ broadcastId }).lean();
  if (existing) { result.deduped = true; }
  else {
    await Notification.create({
      title: `${summary.count} onboarding task${summary.count === 1 ? '' : 's'} overdue`,
      message: buildMessage(summary),
      type: 'warning',
      source: 'tenant',
      audience: 'roles',
      roles: HR_ROLES,
      link: '/onboarding',
      createdByLabel: 'Reminders',
      broadcastId,
      // Auto-expire the alert after 3 days so stale ones clear themselves.
      expiresAt: new Date(Date.now() + 3 * 86400000),
    });
    result.notified = true;

    // Email digest (best-effort). Only once per day too (tied to the same dedup).
    if (mailConfigured()) {
      const recips = await hrRecipients(conn);
      if (recips.length) {
        const r = await sendMail({
          to: recips.map((u) => u.email),
          subject: `[Nexusora] ${summary.count} onboarding task(s) overdue`,
          html: buildEmailHtml(summary, tenantName),
        });
        result.emailed = r.sent ? recips.length : 0;
      }
    } else {
      result.emailSkipped = true;
    }
  }
  return result;
}

// Run across every active tenant (used by the scheduler).
async function runAllTenants() {
  const master = getMasterConnection();
  if (!master) { console.warn('[reminders] master DB not connected — sweep skipped'); return; }
  let tenants = [];
  try { tenants = await master.model('Tenant').find({ status: { $in: ['active', 'trial'] } }).select('subdomain dbName name').lean(); }
  catch (e) { console.error('[reminders] could not list tenants:', e.message); return; }

  let totalNotified = 0;
  for (const t of tenants) {
    try {
      const conn = await getTenantConnection(t.dbName);
      const r = await runForTenant(conn, { tenantName: t.name || t.subdomain });
      if (r.notified) totalNotified += 1;
    } catch (e) {
      console.error(`[reminders] tenant ${t.subdomain} failed:`, e.message);
    }
  }
  console.log(`[reminders] sweep complete — ${tenants.length} tenant(s), ${totalNotified} alert(s) raised`);
}

// Daily scheduler: fire once at REMINDER_HOUR local time, then every 24h.
// Dependency-free (no node-cron). De-dup guarantees at-most-one alert per day
// even if the process restarts and the sweep runs more than once.
function startReminderScheduler() {
  if (!env.REMINDERS_ENABLED) { console.log('[reminders] disabled (REMINDERS_ENABLED=false)'); return; }
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date();
  const next = new Date(now);
  next.setHours(env.REMINDER_HOUR, 0, 0, 0);
  if (next <= now) next.setTime(next.getTime() + DAY);
  const delay = next.getTime() - now.getTime();
  console.log(`[reminders] scheduled — first sweep ${next.toISOString()} (in ${Math.round(delay / 60000)} min), then daily`);
  setTimeout(function fire() {
    runAllTenants().catch((e) => console.error('[reminders] sweep error:', e.message));
    setInterval(() => runAllTenants().catch((e) => console.error('[reminders] sweep error:', e.message)), DAY);
  }, delay);
}

module.exports = { runForTenant, runAllTenants, startReminderScheduler, collectOnboardingOverdue, HR_ROLES };
