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
