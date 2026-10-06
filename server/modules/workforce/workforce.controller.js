const asyncHandler = require('express-async-handler');

async function headcountMaps(tenantConn) {
  const Employee = tenantConn.model('Employee');
  const byDept = await Employee.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: { $ifNull: ['$employment.department', ''] }, n: { $sum: 1 } } },
  ]);
  const byDeptTitle = await Employee.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: { d: { $ifNull: ['$employment.department', ''] }, t: { $ifNull: ['$employment.jobTitle', ''] } }, n: { $sum: 1 } } },
  ]);
  const deptMap = {}; byDept.forEach((r) => { deptMap[r._id || ''] = r.n; });
  const dtMap = {}; byDeptTitle.forEach((r) => { dtMap[`${r._id.d || ''}||${r._id.t || ''}`] = r.n; });
  return { deptMap, dtMap };
}
function currentFor(line, maps) {
  if (line.positionTitle) return maps.dtMap[`${line.department || ''}||${line.positionTitle}`] || 0;
  return maps.deptMap[line.department || ''] || 0;
}

async function suggestedAttrition(tenantConn) {
  const Employee = tenantConn.model('Employee');
  const since = new Date(); since.setMonth(since.getMonth() - 12);
  const active = await Employee.countDocuments({ status: 'active' });
  const leaversAgg = await Employee.aggregate([
    { $match: { status: 'terminated' } },
    { $addFields: { leftAt: { $ifNull: ['$employment.terminationDate', '$updatedAt'] } } },
    { $match: { leftAt: { $gte: since } } },
    { $count: 'n' },
  ]);
  const leavers = leaversAgg[0]?.n || 0;
  return active ? Math.round((leavers / active) * 1000) / 10 : 0;
}

// End-of-horizon snapshot per line (used by the KPI tiles / dashboard).
function computeLine(l, maps, plan) {
  const line = l.toObject ? l.toObject() : l;
  const current = currentFor(line, maps);
  const attrition = line.attritionRatePct != null ? line.attritionRatePct : (plan.defaultAttritionPct != null ? plan.defaultAttritionPct : 0);
  const years = plan.horizonYears || 1;
  const projAttrition = Math.round(current * (attrition / 100) * years);
  const projSupply = Math.max(0, current - projAttrition);
  const target = Number(line.targetHeadcount || 0);
  const hiringNeed = Math.max(0, target - projSupply);
  const surplus = Math.max(0, projSupply - target);
  const cph = line.costPerHead != null ? Number(line.costPerHead) : null;
  return { ...line, current, attritionRatePct: attrition, projAttrition, projSupply, target, hiringNeed, surplus, vacancyNow: Math.max(0, target - current), costPerHead: cph, projCost: cph != null ? target * cph : null, hiringCost: cph != null ? hiringNeed * cph : null };
}
function analyse(plan, maps) {
  const lines = (plan.lines || []).map((l) => computeLine(l, maps, plan));
  const totals = lines.reduce((a, l) => ({ current: a.current + l.current, projAttrition: a.projAttrition + l.projAttrition, projSupply: a.projSupply + l.projSupply, target: a.target + l.target, hiringNeed: a.hiringNeed + l.hiringNeed, surplus: a.surplus + l.surplus, projCost: a.projCost + (l.projCost || 0), hiringCost: a.hiringCost + (l.hiringCost || 0) }), { current: 0, projAttrition: 0, projSupply: 0, target: 0, hiringNeed: 0, surplus: 0, projCost: 0, hiringCost: 0 });
  return { lines, totals };
}

/* -------- TIME-PHASED, MULTI-SCENARIO FORECAST (the operational engine) -------- */
// For each scenario, walk every line forward year by year:
//   demand phases linearly from current -> scaled target;
//   each year supply loses attrition, then hires up to that year's demand;
//   cost = end-of-year supply x cost-per-head.
function forecast(plan, computedLines) {
  const N = plan.horizonYears || 1;
  const baseYear = plan.year || new Date().getFullYear();
  const scenarios = (plan.scenarios && plan.scenarios.length)
    ? plan.scenarios.map((s) => (s.toObject ? s.toObject() : s))
    : [{ name: 'Baseline', demandFactorPct: 100, attritionPctOverride: null, isBaseline: true }];

  const out = scenarios.map((s) => {
    const yearAgg = Array.from({ length: N }, () => ({ demand: 0, attrition: 0, hires: 0, supply: 0, surplus: 0, cost: 0 }));
    computedLines.forEach((l) => {
      const attrition = s.attritionPctOverride != null ? Number(s.attritionPctOverride)
        : (l.attritionRatePct != null ? Number(l.attritionRatePct) : (plan.defaultAttritionPct != null ? Number(plan.defaultAttritionPct) : 0));
      const scaledTarget = Math.round(Number(l.target || 0) * (Number(s.demandFactorPct || 100) / 100));
      const current = l.current;
      const cph = l.costPerHead;
      let supplyPrev = current;
      for (let t = 1; t <= N; t++) {
        const demand = Math.round(current + (scaledTarget - current) * (t / N));
        const loss = Math.round(supplyPrev * (attrition / 100));
        const afterAttr = Math.max(0, supplyPrev - loss);
        const hires = Math.max(0, demand - afterAttr);
        const endSupply = afterAttr + hires;                 // reach demand (or stay if over-staffed)
        const surplus = Math.max(0, afterAttr - demand);
        const a = yearAgg[t - 1];
        a.demand += demand; a.attrition += loss; a.hires += hires; a.supply += endSupply; a.surplus += surplus;
        a.cost += cph != null ? endSupply * cph : 0;
        supplyPrev = endSupply;
      }
    });
    const series = yearAgg.map((a, i) => ({ year: baseYear + i + 1, label: `Y${i + 1}`, demand: a.demand, attrition: a.attrition, hires: a.hires, supply: a.supply, surplus: a.surplus, cost: Math.round(a.cost) }));
    const totals = {
      cumulativeHires: series.reduce((x, y) => x + y.hires, 0),
      totalAttrition: series.reduce((x, y) => x + y.attrition, 0),
      finalDemand: series[N - 1] ? series[N - 1].demand : 0,
      finalSupply: series[N - 1] ? series[N - 1].supply : 0,
      finalCost: series[N - 1] ? series[N - 1].cost : 0,
    };
    return { name: s.name, demandFactorPct: s.demandFactorPct != null ? s.demandFactorPct : 100, attritionPctOverride: s.attritionPctOverride != null ? s.attritionPctOverride : null, isBaseline: !!s.isBaseline, series, totals };
  });
  return { years: N, baseYear, scenarios: out };
}

function planShape(p) {
  return { _id: p._id, name: p.name, year: p.year, horizonYears: p.horizonYears, defaultAttritionPct: p.defaultAttritionPct, status: p.status, assumptions: p.assumptions, scenarios: (p.scenarios || []).map((s) => (s.toObject ? s.toObject() : s)) };
}

// GET /workforce/plans
const listPlans = asyncHandler(async (req, res) => {
  const plans = await req.tenantConn.model('WorkforcePlan').find().sort({ year: -1, createdAt: -1 }).lean();
  const items = plans.map((p) => ({ _id: p._id, name: p.name, year: p.year, horizonYears: p.horizonYears, status: p.status, lineCount: (p.lines || []).length, scenarioCount: (p.scenarios || []).length, targetTotal: (p.lines || []).reduce((a, l) => a + Number(l.targetHeadcount || 0), 0) }));
  res.json({ items, total: items.length });
});

const createPlan = asyncHandler(async (req, res) => {
  if (!req.body.name) return res.status(400).json({ message: 'A plan name is required.' });
  const body = { ...req.body, createdBy: req.auth.userId };
  if (!Array.isArray(body.scenarios) || !body.scenarios.length) body.scenarios = [{ name: 'Baseline', demandFactorPct: 100, attritionPctOverride: null, isBaseline: true }];
  const plan = await req.tenantConn.model('WorkforcePlan').create(body);
  res.status(201).json(plan);
});

async function fullPayload(req, plan) {
  const maps = await headcountMaps(req.tenantConn);
  const { lines, totals } = analyse(plan, maps);
  const [orgHeadcount, suggested] = await Promise.all([
    req.tenantConn.model('Employee').countDocuments({ status: 'active' }),
    suggestedAttrition(req.tenantConn),
  ]);
  return { plan: planShape(plan), lines, totals, forecast: forecast(plan, lines), orgHeadcount, suggestedAttritionPct: suggested };
}

// GET /workforce/plans/:id
const getPlan = asyncHandler(async (req, res) => {
  const plan = await req.tenantConn.model('WorkforcePlan').findById(req.params.id);
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  res.json(await fullPayload(req, plan));
});

// PUT /workforce/plans/:id  (lines, scenarios, settings)
const updatePlan = asyncHandler(async (req, res) => {
  const body = { ...req.body }; delete body.createdBy;
  const plan = await req.tenantConn.model('WorkforcePlan').findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  res.json(await fullPayload(req, plan));
});

const deletePlan = asyncHandler(async (req, res) => {
  const plan = await req.tenantConn.model('WorkforcePlan').findByIdAndDelete(req.params.id);
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  res.json({ message: 'Plan deleted' });
});

module.exports = { listPlans, createPlan, getPlan, updatePlan, deletePlan };