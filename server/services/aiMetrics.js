// server/services/aiMetrics.js
// The "code computes" half of the AI Advisor. Every figure the AI ever sees or shows comes
// from here — computed deterministically from the tenant's real data. The AI only decides
// WHICH metrics to show and how to lay them out; it never produces numbers itself.
//
//   METRICS      — a whitelist registry the NL-dashboard builder chooses from.
//   contextPack  — a compact snapshot of real figures used to ground insights & chat.

/* ------------------------------- helpers ------------------------------- */
const isActive = (e) => (e?.employment?.confirmationStatus || e?.status) !== 'exited';
const hireDateOf = (e) => e?.employment?.hireDate || e?.hireDate || e?.employment?.dateEmployed || e?.dateOfEmployment || e?.employment?.startDate || null;
const termDateOf = (e) => e?.employment?.terminationDate || e?.terminationDate || null;
const dobOf = (e) => e?.dateOfBirth || e?.employment?.dateOfBirth || e?.dob || null;
const val = (e, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), e);

function yearsBetween(a, b) { if (!a) return null; const d = (new Date(b || Date.now()) - new Date(a)) / (365.25 * 864e5); return d >= 0 ? d : null; }
function monthsAgo(n) { const d = new Date(); d.setMonth(d.getMonth() - n); return d; }

// Group a list into {label,value} counts by a key function.
function countBy(list, keyFn, { top = 0, sortDesc = true } = {}) {
  const m = new Map();
  list.forEach((x) => { const k = keyFn(x) || 'Unspecified'; m.set(k, (m.get(k) || 0) + 1); });
  let arr = Array.from(m, ([label, value]) => ({ label: String(label), value }));
  if (sortDesc) arr.sort((a, b) => b.value - a.value);
  if (top) arr = arr.slice(0, top);
  return arr;
}

async function loadEmployees(conn) {
  return conn.model('Employee').find({}).lean();
}

/* ---------------------- attrition / movement (shared) ---------------------- */
function movement(employees) {
  const active = employees.filter(isActive);
  const since = monthsAgo(12);
  const newHires12 = employees.filter((e) => { const h = hireDateOf(e); return h && new Date(h) >= since; }).length;
  const leavers12 = employees.filter((e) => { const t = termDateOf(e); return t && new Date(t) >= since; }).length;
  const avgHead = Math.max(1, active.length + leavers12 / 2);
  const attritionPct = Math.round((leavers12 / avgHead) * 100);
  const tenures = active.map((e) => yearsBetween(hireDateOf(e))).filter((x) => x != null);
  const avgTenure = tenures.length ? +(tenures.reduce((s, x) => s + x, 0) / tenures.length).toFixed(1) : 0;
  return { active: active.length, newHires12, leavers12, attritionPct, avgTenure };
}

// Approximate 12-month headcount trend from hire/termination dates.
function headcountTrend(employees) {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const end = new Date(); end.setMonth(end.getMonth() - i); end.setDate(28);
    const n = employees.filter((e) => {
      const h = hireDateOf(e); if (!h || new Date(h) > end) return false;
      const t = termDateOf(e); return !t || new Date(t) > end;
    }).length;
    out.push({ label: end.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), value: n });
  }
  return out;
}
function monthlyStartersLeavers(employees) {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const s = new Date(); s.setMonth(s.getMonth() - i, 1); s.setHours(0, 0, 0, 0);
    const e = new Date(s); e.setMonth(e.getMonth() + 1);
    const inMonth = (d) => d && new Date(d) >= s && new Date(d) < e;
    out.push({ label: s.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      starters: employees.filter((x) => inMonth(hireDateOf(x))).length,
      leavers: employees.filter((x) => inMonth(termDateOf(x))).length });
  }
  return out;
}

function ageBands(employees) {
  const bands = [['<25', 0], ['25–34', 0], ['35–44', 0], ['45–54', 0], ['55+', 0]];
  employees.filter(isActive).forEach((e) => { const a = yearsBetween(dobOf(e)); if (a == null) return; const i = a < 25 ? 0 : a < 35 ? 1 : a < 45 ? 2 : a < 55 ? 3 : 4; bands[i][1] += 1; });
  return bands.map(([label, value]) => ({ label, value }));
}
function tenureBands(employees) {
  const bands = [['<1 yr', 0], ['1–3 yrs', 0], ['3–5 yrs', 0], ['5–10 yrs', 0], ['10+ yrs', 0]];
  employees.filter(isActive).forEach((e) => { const t = yearsBetween(hireDateOf(e)); if (t == null) return; const i = t < 1 ? 0 : t < 3 ? 1 : t < 5 ? 2 : t < 10 ? 3 : 4; bands[i][1] += 1; });
  return bands.map(([label, value]) => ({ label, value }));
}

/* ---------------------- optional cross-module metrics ---------------------- */
async function payrollTrend(conn) {
  try {
    const runs = await conn.model('PayrollRun').find({ status: { $in: ['approved', 'paid'] } }).sort({ period: 1 }).limit(12).lean();
    return runs.map((r) => ({ label: r.label || r.period, value: Math.round((r.totals?.gross) || 0) }));
  } catch { return []; }
}
async function competencyGaps(conn) {
  try {
    const rows = await conn.model('CompetencyRating').find({ gap: { $gt: 0 } }).populate('competency', 'name').lean();
    return countBy(rows, (r) => r.competency?.name || 'Unknown', { top: 8 });
  } catch { return []; }
}
async function openCasesByType(conn) {
  try {
    const OPEN = ['open', 'investigation', 'hearing', 'awaiting_decision', 'appealed'];
    const rows = await conn.model('ERCase').find({ status: { $in: OPEN } }, 'type').lean();
    return countBy(rows, (r) => r.type);
  } catch { return []; }
}

/* ============================ METRIC REGISTRY ============================ */
// Each metric: { label, chart (default), compute(employees, conn) -> [{label,value}...] }
const METRICS = {
  headcount_by_department: { label: 'Headcount by department', chart: 'bar', compute: (emp) => countBy(emp.filter(isActive), (e) => val(e, 'employment.department'), { top: 15 }) },
  headcount_by_grade: { label: 'Headcount by grade', chart: 'bar', compute: (emp) => countBy(emp.filter(isActive), (e) => val(e, 'employment.grade'), { top: 15 }) },
  gender_split: { label: 'Gender split', chart: 'donut', compute: (emp) => countBy(emp.filter(isActive), (e) => e.gender) },
  nationality_split: { label: 'Nationality split', chart: 'bar', compute: (emp) => countBy(emp.filter(isActive), (e) => e.nationality, { top: 12 }) },
  employment_type_split: { label: 'Employment type', chart: 'donut', compute: (emp) => countBy(emp.filter(isActive), (e) => val(e, 'employment.employmentType')) },
  worker_class_split: { label: 'Worker class', chart: 'donut', compute: (emp) => countBy(emp.filter(isActive), (e) => val(e, 'employment.workerClass')) },
  age_distribution: { label: 'Age distribution', chart: 'bar', compute: (emp) => ageBands(emp) },
  tenure_distribution: { label: 'Tenure distribution', chart: 'bar', compute: (emp) => tenureBands(emp) },
  headcount_trend_12m: { label: 'Headcount trend (12 months)', chart: 'line', compute: (emp) => headcountTrend(emp) },
  starters_vs_leavers_12m: { label: 'Starters vs leavers (12 months)', chart: 'line2', compute: (emp) => monthlyStartersLeavers(emp) },
  payroll_trend_12m: { label: 'Payroll gross trend', chart: 'line', compute: async (emp, conn) => payrollTrend(conn) },
  competency_gaps: { label: 'Top competency gaps', chart: 'bar', compute: async (emp, conn) => competencyGaps(conn) },
  open_er_cases_by_type: { label: 'Open ER cases by type', chart: 'donut', compute: async (emp, conn) => openCasesByType(conn) },
};

function metricCatalogue() {
  return Object.entries(METRICS).map(([key, m]) => ({ key, label: m.label, chart: m.chart }));
}

async function computeMetric(key, employees, conn) {
  const m = METRICS[key];
  if (!m) return null;
  const series = await m.compute(employees, conn);
  return { key, label: m.label, chart: m.chart, series: series || [] };
}

/* ============================ CONTEXT PACK ============================ */
// A compact, real-number snapshot used to ground the AI's insights and chat answers.
async function contextPack(conn) {
  const employees = await loadEmployees(conn);
  const mv = movement(employees);
  const active = employees.filter(isActive);
  const female = active.filter((e) => String(e.gender || '').toLowerCase().startsWith('f')).length;

  const pack = {
    asOf: new Date().toISOString().slice(0, 10),
    headcount: { total: employees.length, active: active.length, female, femalePct: active.length ? Math.round((female / active.length) * 100) : 0 },
    movement: { newHires12m: mv.newHires12, leavers12m: mv.leavers12, attritionPct: mv.attritionPct, avgTenureYears: mv.avgTenure },
    byDepartment: countBy(active, (e) => val(e, 'employment.department'), { top: 10 }),
    byGrade: countBy(active, (e) => val(e, 'employment.grade'), { top: 10 }),
    ageBands: ageBands(employees),
    tenureBands: tenureBands(employees),
  };
  // optional cross-module signals
  const gaps = await competencyGaps(conn); if (gaps.length) pack.topCompetencyGaps = gaps.slice(0, 5);
  const cases = await openCasesByType(conn); if (cases.length) pack.openERCases = cases;
  const pay = await payrollTrend(conn); if (pay.length) pack.payrollGrossLatest = pay[pay.length - 1];
  return pack;
}

module.exports = { METRICS, metricCatalogue, computeMetric, contextPack, loadEmployees };