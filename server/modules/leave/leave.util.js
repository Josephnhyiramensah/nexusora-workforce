// Leave helpers.
function dayStart(d) { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; }

// Working days between two dates INCLUSIVE, excluding Sat/Sun.
// (Plantations that work Saturdays can adjust later; Mon–Fri is the safe default.)
function workingDays(start, end) {
  let d = dayStart(start); const e = dayStart(end);
  if (e < d) return 0;
  let n = 0;
  while (d <= e) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
    d = new Date(d); d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

function monthsBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

module.exports = { dayStart, workingDays, monthsBetween };
