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
