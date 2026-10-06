const asyncHandler = require('express-async-handler');

async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// ---- query helpers: date-range (months) + department filter ----
function nMonths(req, def = 12) { const n = parseInt(req.query.months, 10); return Math.min(24, Math.max(3, isNaN(n) ? def : n)); }
function nDays(req, def = 30) { const n = parseInt(req.query.days, 10); return Math.min(365, Math.max(7, isNaN(n) ? def : n)); }
function empMatch(req, base = {}) {
  const m = { ...base };
  if (req.query.dept && req.query.dept !== 'all' && req.query.dept !== '') m['employment.department'] = req.query.dept;
  return m;
}

function monthsBack(n) {
  const now = new Date(); const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }), start: d });
  }
  return out;
}
const keyOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/* ============================ OVERVIEW ============================ */
const overview = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const [total, active] = await Promise.all([
    safe(() => Employee.countDocuments(empMatch(req, {})), 0),
    safe(() => Employee.countDocuments(empMatch(req, { status: 'active' })), 0),
  ]);
  const groupCount = (field, base = { status: 'active' }) => safe(() => Employee.aggregate([
    { $match: empMatch(req, base) },
    { $group: { _id: { $ifNull: [`$${field}`, 'Unspecified'] }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).then((rows) => rows.map((r) => ({ label: String(r._id || 'Unspecified'), value: r.n }))), []);

  const [byGender, byType, byClass, byDept, byStatus] = await Promise.all([
    groupCount('gender'), groupCount('employment.employmentType'),
    groupCount('employment.workerClass'), groupCount('employment.department'), groupCount('status', {}),
  ]);

  const months = monthsBack(nMonths(req, 6));
  const hiresAgg = await safe(() => Employee.aggregate([
    { $match: empMatch(req, { 'employment.startDate': { $gte: months[0].start } }) },
    { $group: { _id: { y: { $year: '$employment.startDate' }, m: { $month: '$employment.startDate' } }, n: { $sum: 1 } } },
  ]), []);
  const hireMap = {}; hiresAgg.forEach((h) => { hireMap[keyOf(h._id.y, h._id.m)] = h.n; });
  const newHires = months.map((mo) => ({ label: mo.label, key: mo.key, value: hireMap[mo.key] || 0 }));

  const terminated = await safe(() => Employee.countDocuments(empMatch(req, { status: 'terminated' })), 0);
  const confirmed = await safe(() => Employee.countDocuments(empMatch(req, { status: 'active', 'employment.confirmationStatus': 'confirmed' })), 0);
  const onProbation = await safe(() => Employee.countDocuments(empMatch(req, { status: 'active', 'employment.confirmationStatus': 'probation' })), 0);

  let payrollTrend = []; let latestRun = null; let currency = req.tenant.baseCurrency || '';
  await safe(async () => {
    const runs = await req.tenantConn.model('PayrollRun').find().sort({ period: -1 }).limit(nMonths(req, 6)).select('period label totals currency');
    if (runs.length) { currency = runs[0].currency || currency; latestRun = runs[0]; }
    payrollTrend = runs.slice().reverse().map((r) => ({ label: r.label || r.period, gross: r.totals?.gross || 0, net: r.totals?.net || 0, headcount: r.totals?.headcount || 0 }));
  });

  const pendingLeave = await safe(async () => req.tenantConn.model('LeaveRequest').countDocuments({ status: 'pending' }), 0);
  const openVacancies = await safe(async () => req.tenantConn.model('Vacancy').countDocuments({ status: 'open' }), 0);
  const activeOnboarding = await safe(async () => req.tenantConn.model('Onboarding').countDocuments({ status: 'in_progress' }), 0);

  res.json({
    currency, deptOptions: byDept.map((d) => d.label),
    kpis: { total, active, terminated, confirmed, onProbation, openVacancies, activeOnboarding, pendingLeave },
    charts: { byGender, byType, byClass, byDept, byStatus, newHires, payrollTrend },
    latestRun: latestRun ? { period: latestRun.period, label: latestRun.label, totals: latestRun.totals, currency: latestRun.currency } : null,
    generatedAt: new Date(),
  });
});

/* ============================ TURNOVER & RETENTION ============================ */
const turnover = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const months = monthsBack(nMonths(req, 12));

  const startersAgg = await safe(() => Employee.aggregate([
    { $match: empMatch(req, { 'employment.startDate': { $gte: months[0].start } }) },
    { $group: { _id: { y: { $year: '$employment.startDate' }, m: { $month: '$employment.startDate' } }, n: { $sum: 1 } } },
  ]), []);
  const leaversAgg = await safe(() => Employee.aggregate([
    { $match: empMatch(req, { status: 'terminated' }) },
    { $addFields: { leftAt: { $ifNull: ['$employment.terminationDate', '$updatedAt'] } } },
    { $match: { leftAt: { $gte: months[0].start } } },
    { $group: { _id: { y: { $year: '$leftAt' }, m: { $month: '$leftAt' } }, n: { $sum: 1 } } },
  ]), []);
  const sMap = {}; startersAgg.forEach((r) => { sMap[keyOf(r._id.y, r._id.m)] = r.n; });
  const lMap = {}; leaversAgg.forEach((r) => { lMap[keyOf(r._id.y, r._id.m)] = r.n; });
  const monthly = months.map((mo) => ({ label: mo.label, key: mo.key, starters: sMap[mo.key] || 0, leavers: lMap[mo.key] || 0, net: (sMap[mo.key] || 0) - (lMap[mo.key] || 0) }));

  const active = await safe(() => Employee.countDocuments(empMatch(req, { status: 'active' })), 0);
  const leavers12 = monthly.reduce((a, m) => a + m.leavers, 0);
  const attritionAnnualPct = active ? round1((leavers12 / active) * 100) : 0;

  const activeEmps = await safe(() => Employee.find(empMatch(req, { status: 'active' })).select('employment.startDate'), []);
  const now = new Date();
  const tenures = activeEmps.map((e) => e.employment?.startDate ? (now - new Date(e.employment.startDate)) / (365.25 * 24 * 3600 * 1000) : null).filter((t) => t != null && t >= 0);
  const avgTenureYears = tenures.length ? round1(tenures.reduce((a, b) => a + b, 0) / tenures.length) : 0;
  const bands = [['< 1 yr', 0, 1], ['1–3 yrs', 1, 3], ['3–5 yrs', 3, 5], ['5–10 yrs', 5, 10], ['10+ yrs', 10, Infinity]];
  const tenureBands = bands.map(([label, lo, hi]) => ({ label, value: tenures.filter((t) => t >= lo && t < hi).length }));

  res.json({ monthly, attritionAnnualPct, avgTenureYears, tenureBands, activeHeadcount: active, leavers12, hires12: monthly.reduce((a, m) => a + m.starters, 0), generatedAt: new Date() });
});

/* ============================ PAYROLL & COST ============================ */
const payroll = asyncHandler(async (req, res) => {
  const PayrollRun = req.tenantConn.model('PayrollRun');
  let currency = req.tenant.baseCurrency || '';
  const runs = await safe(() => PayrollRun.find().sort({ period: -1 }).limit(nMonths(req, 12)), []);
  if (runs.length) currency = runs[0].currency || currency;
  const trend = runs.slice().reverse().map((r) => {
    const hc = r.totals?.headcount || 0;
    return { label: r.label || r.period, gross: r.totals?.gross || 0, net: r.totals?.net || 0, deductions: r.totals?.deductions || 0,
      employerCost: r.totals?.employerCost || 0, headcount: hc, costPerHead: hc ? Math.round((r.totals?.employerCost || r.totals?.gross || 0) / hc) : 0 };
  });

  let costByDept = [];
  await safe(async () => {
    const latest = runs[0]; if (!latest || !latest.payslips?.length) return;
    const ids = latest.payslips.map((s) => s.employee && (s.employee.id || s.employee._id)).filter(Boolean);
    const emps = await req.tenantConn.model('Employee').find({ _id: { $in: ids } }).select('employment.department');
    const deptOf = {}; emps.forEach((e) => { deptOf[String(e._id)] = e.employment?.department || 'Unassigned'; });
    const acc = {};
    latest.payslips.forEach((s) => { const dep = deptOf[String(s.employee?.id || s.employee?._id)] || 'Unassigned'; acc[dep] = (acc[dep] || 0) + Number(s.netPay || 0); });
    costByDept = Object.entries(acc).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  });

  let salaryBands = [];
  await safe(async () => {
    const emps = await req.tenantConn.model('Employee').find({ status: 'active', 'compensation.payBasis': 'salary' }).select('compensation.baseSalary');
    const vals = emps.map((e) => Number(e.compensation?.baseSalary || 0)).filter((v) => v > 0).sort((a, b) => a - b);
    if (!vals.length) return;
    const maxV = vals[vals.length - 1]; const step = Math.max(1, Math.ceil(maxV / 5));
    const bands = Array.from({ length: 5 }, (_, i) => ({ lo: i * step, hi: (i + 1) * step, value: 0 }));
    vals.forEach((v) => { const idx = Math.min(4, Math.floor(v / step)); bands[idx].value += 1; });
    salaryBands = bands.map((b) => ({ label: `${Math.round(b.lo / 1000)}k–${Math.round(b.hi / 1000)}k`, value: b.value }));
  });

  const latest = runs[0];
  res.json({ currency, trend, costByDept, salaryBands, latest: latest ? { period: latest.period, label: latest.label, totals: latest.totals } : null, generatedAt: new Date() });
});

/* ============================ RECRUITMENT FUNNEL ============================ */
const LINEAR = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired'];
const recruitment = asyncHandler(async (req, res) => {
  const out = { funnel: [], offerAcceptancePct: 0, avgTimeToHireDays: 0, bySource: [], openVacancies: 0, filledVacancies: 0, totalApplicants: 0, generatedAt: new Date() };
  await safe(async () => {
    const Vacancy = req.tenantConn.model('Vacancy');
    out.openVacancies = await Vacancy.countDocuments({ status: 'open' });
    out.filledVacancies = await Vacancy.countDocuments({ status: 'filled' });
  });
  await safe(async () => {
    const Application = req.tenantConn.model('Application');
    const apps = await Application.find().select('stage timeline offer source createdAt');
    out.totalApplicants = apps.length;
    const reached = Object.fromEntries(LINEAR.map((s) => [s, 0]));
    let offersExtended = 0, offersAccepted = 0; const hireDurations = []; const sourceMap = {};
    apps.forEach((a) => {
      const stagesSeen = new Set([a.stage, ...(a.timeline || []).map((t) => t.stage)]);
      const maxIdx = Math.max(-1, ...[...stagesSeen].map((s) => LINEAR.indexOf(s)));
      LINEAR.forEach((s, i) => { if (i <= maxIdx) reached[s] += 1; });
      if (a.offer && a.offer.status && a.offer.status !== 'none') offersExtended += 1;
      if (a.offer && a.offer.status === 'accepted') offersAccepted += 1;
      if (stagesSeen.has('hired')) {
        const hiredAt = (a.timeline || []).find((t) => t.stage === 'hired')?.at;
        if (hiredAt && a.createdAt) hireDurations.push((new Date(hiredAt) - new Date(a.createdAt)) / (24 * 3600 * 1000));
      }
      const src = a.source || 'Unspecified'; sourceMap[src] = sourceMap[src] || { applied: 0, hired: 0 };
      sourceMap[src].applied += 1; if (stagesSeen.has('hired')) sourceMap[src].hired += 1;
    });
    const labelFor = { applied: 'Applied', screening: 'Screening', shortlisted: 'Shortlisted', interview: 'Interview', offer: 'Offer', hired: 'Hired' };
    out.funnel = LINEAR.map((s) => ({ label: labelFor[s], value: reached[s] }));
    out.offerAcceptancePct = offersExtended ? round1((offersAccepted / offersExtended) * 100) : 0;
    out.avgTimeToHireDays = hireDurations.length ? round1(hireDurations.reduce((a, b) => a + b, 0) / hireDurations.length) : 0;
    out.bySource = Object.entries(sourceMap).map(([label, v]) => ({ label, applied: v.applied, hired: v.hired })).sort((a, b) => b.applied - a.applied);
  });
  res.json(out);
});

/* ============================ ABSENCE & LEAVE ============================ */
const absence = asyncHandler(async (req, res) => {
  const days = nDays(req, 30);
  const out = { windowDays: days, statusBreakdown: [], absenceRatePct: 0, monthlyAbsence: [], leaveByType: [], generatedAt: new Date() };
  const since = new Date(); since.setDate(since.getDate() - days);

  await safe(async () => {
    const Attendance = req.tenantConn.model('Attendance');
    const rows = await Attendance.aggregate([{ $match: { date: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const map = {}; rows.forEach((r) => { map[r._id || 'unknown'] = r.n; });
    out.statusBreakdown = Object.entries(map).map(([label, value]) => ({ label, value }));
    const counted = ['present', 'late', 'half_day', 'absent'].reduce((a, s) => a + (map[s] || 0), 0);
    out.absenceRatePct = counted ? round1(((map.absent || 0) / counted) * 100) : 0;
    const months = monthsBack(nMonths(req, 6));
    const abs = await Attendance.aggregate([
      { $match: { status: 'absent', date: { $gte: months[0].start } } },
      { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' } }, n: { $sum: 1 } } },
    ]);
    const am = {}; abs.forEach((r) => { am[keyOf(r._id.y, r._id.m)] = r.n; });
    out.monthlyAbsence = months.map((mo) => ({ label: mo.label, key: mo.key, value: am[mo.key] || 0 }));
  });
  await safe(async () => {
    const LeaveRequest = req.tenantConn.model('LeaveRequest');
    const LeaveType = req.tenantConn.model('LeaveType');
    const rows = await LeaveRequest.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$leaveType', days: { $sum: { $ifNull: ['$days', 0] } } } }]);
    const types = await LeaveType.find().select('name code'); const nameOf = {}; types.forEach((t) => { nameOf[String(t._id)] = t.name || t.code; });
    out.leaveByType = rows.map((r) => ({ label: nameOf[String(r._id)] || 'Leave', value: r.days })).sort((a, b) => b.value - a.value);
  });
  res.json(out);
});

/* ============================ CROSS-TAB / DIVERSITY PIVOT ============================ */
// Live pivot: group active staff by two chosen dimensions and compute a measure per cell,
// with multi-select filters — the engine behind the SAP-style cross-tab heatmap.
const DIM_FIELD = {
  businessUnit: 'employment.department', country: 'nationality',
  employmentType: 'employment.employmentType', workerClass: 'employment.workerClass',
  gender: 'gender', status: 'status', grade: 'employment.grade', confirmation: 'employment.confirmationStatus',
};
const dimField = (k) => DIM_FIELD[k] || 'employment.department';
const csv = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const pivot = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const rows = req.query.rows || 'businessUnit';
  const cols = req.query.cols || 'employmentType';
  const measure = req.query.measure || 'headcount';
  const rowF = dimField(rows); const colF = dimField(cols);

  // filters (multi-select, comma-separated) — only over active staff
  const match = { status: 'active' };
  const FILTERS = { businessUnit: 'employment.department', country: 'nationality', employmentType: 'employment.employmentType', workerClass: 'employment.workerClass' };
  Object.entries(FILTERS).forEach(([q, f]) => { const vals = csv(req.query[q]); if (vals.length) match[f] = { $in: vals }; });

  const agg = await safe(() => Employee.aggregate([
    { $match: match },
    { $group: {
      _id: { r: { $ifNull: [`$${rowF}`, '(Unassigned)'] }, c: { $ifNull: [`$${colF}`, '(Unassigned)'] } },
      total: { $sum: 1 },
      female: { $sum: { $cond: [{ $eq: ['$gender', 'female'] }, 1, 0] } },
    } },
  ]), []);
  const rowSet = new Set(); const colSet = new Set(); const cells = {};
  agg.forEach((a) => {
    const r = String(a._id.r); const c = String(a._id.c);
    rowSet.add(r); colSet.add(c);
    const value = measure === 'femalePct' ? (a.total ? Math.round((a.female / a.total) * 1000) / 10 : 0) : a.total;
    cells[`${r}|||${c}`] = { total: a.total, female: a.female, value };
  });

  const total = await safe(() => Employee.countDocuments(match), 0);
  const female = await safe(() => Employee.countDocuments({ ...match, gender: 'female' }), 0);
  const mgrAgg = await safe(() => Employee.aggregate([{ $match: { ...match, 'employment.lineManager': { $ne: null } } }, { $group: { _id: '$employment.lineManager' } }, { $count: 'n' }]), []);
  const managers = mgrAgg[0]?.n || 0;
  const onLeave = await safe(async () => { const now = new Date(); return req.tenantConn.model('LeaveRequest').countDocuments({ status: 'approved', startDate: { $lte: now }, endDate: { $gte: now } }); }, 0);

  const distinct = (f) => safe(() => Employee.aggregate([{ $match: { status: 'active' } }, { $group: { _id: { $ifNull: [`$${f}`, '(Unassigned)'] } } }, { $sort: { _id: 1 } }]).then((r) => r.map((x) => String(x._id))), []);
  const filterOptions = {
    businessUnit: await distinct('employment.department'), country: await distinct('nationality'),
    employmentType: await distinct('employment.employmentType'), workerClass: await distinct('employment.workerClass'),
  };

  res.json({
    rowDim: rows, colDim: cols, measure,
    rows: Array.from(rowSet).sort(), cols: Array.from(colSet).sort(), cells,
    kpis: { total, female, femalePct: total ? Math.round((female / total) * 1000) / 10 : 0, managers, onLeave },
    filterOptions, generatedAt: new Date(),
  });
});

/* ============================ DRILL-DOWN ============================ */
// Returns the underlying records behind a KPI tile or a chart segment, as a simple
// { title, columns, rows, link, count } table the UI renders in a drawer.
const drill = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '—');
  const nm = (e) => [e && e.firstName, e && e.lastName].filter(Boolean).join(' ') || '—';
  const empList = async (match, applyDept) => {
    const filter = applyDept ? empMatch(req, match) : match;
    const rows = await Employee.find(filter)
      .select('firstName lastName staffId employment.department employment.jobTitle status employment.confirmationStatus')
      .sort({ firstName: 1, lastName: 1 }).limit(500).lean();
    return {
      columns: ['Name', 'Staff ID', 'Department', 'Job title', 'Status'], link: '/employees',
      rows: rows.map((e) => [nm(e), e.staffId || '—', e.employment?.department || '—', e.employment?.jobTitle || '—', cap(e.status)]),
    };
  };

  const monthRange = (k) => { const [y, m] = String(k).split('-').map(Number); return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }; };
  const yearsAgo = (n) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000);
  const vacancyList = async (status) => {
    const rows = await safe(() => req.tenantConn.model('Vacancy').find({ status }).populate('department', 'name').select('title department openings').sort({ createdAt: -1 }).limit(500).lean(), []);
    return { columns: ['Vacancy', 'Department', 'Openings'], link: '/recruitment', rows: rows.map((v) => [v.title || '—', v.department?.name || '—', v.openings || 1]) };
  };

  const type = req.query.type;
  let out = { columns: [], rows: [], link: '' };

  if (type === 'kpi') {
    const key = req.query.key;
    if (key === 'total') out = await empList({}, true);
    else if (key === 'active' || key === 'activeHeadcount') out = await empList({ status: 'active' }, true);
    else if (key === 'terminated') out = await empList({ status: 'terminated' }, true);
    else if (key === 'confirmed') out = await empList({ status: 'active', 'employment.confirmationStatus': 'confirmed' }, true);
    else if (key === 'onProbation') out = await empList({ status: 'active', 'employment.confirmationStatus': 'probation' }, true);
    else if (key === 'hires12') out = await empList({ 'employment.startDate': { $gte: yearsAgo(1) } }, true);
    else if (key === 'leavers12') out = await empList({ status: 'terminated', 'employment.terminationDate': { $gte: yearsAgo(1) } }, true);
    else if (key === 'openVacancies') out = await vacancyList('open');
    else if (key === 'filledVacancies') out = await vacancyList('filled');
    else if (key === 'activeOnboarding') {
      const rows = await safe(() => req.tenantConn.model('Onboarding').find({ status: 'in_progress' }).populate('employee', 'firstName lastName staffId').sort({ createdAt: -1 }).limit(500).lean(), []);
      out = { columns: ['Employee', 'Started', 'Status'], link: '/onboarding', rows: rows.map((o) => [nm(o.employee), o.startDate ? new Date(o.startDate).toLocaleDateString() : '—', cap(o.status)]) };
    } else if (key === 'pendingLeave') {
      const rows = await safe(() => req.tenantConn.model('LeaveRequest').find({ status: 'pending' }).populate('employee', 'firstName lastName staffId').populate('leaveType', 'name').sort({ createdAt: -1 }).limit(500).lean(), []);
      out = { columns: ['Employee', 'Type', 'From', 'To'], link: '/leave', rows: rows.map((l) => [nm(l.employee), l.leaveType?.name || '—', l.startDate ? new Date(l.startDate).toLocaleDateString() : '—', l.endDate ? new Date(l.endDate).toLocaleDateString() : '—']) };
    } else if (key === 'totalApplicants') {
      const rows = await safe(() => req.tenantConn.model('Application').find().populate('vacancy', 'title').select('firstName lastName stage source vacancy').sort({ createdAt: -1 }).limit(500).lean(), []);
      out = { columns: ['Candidate', 'Vacancy', 'Stage', 'Source'], link: '/recruitment', rows: rows.map((a) => [[a.firstName, a.lastName].filter(Boolean).join(' ') || '—', a.vacancy?.title || '—', cap(a.stage), a.source || '—']) };
    }
  } else if (type === 'dim') {
    const field = req.query.field; const value = req.query.value;
    const isStatus = field === 'status';
    const match = isStatus ? {} : { status: 'active' };
    if (value === 'Unspecified') match[field] = { $in: [null, ''] };
    else if (isStatus) match.status = String(value).toLowerCase();
    else if (field) match[field] = value;
    out = await empList(match, false);
  } else if (type === 'movement') {
    const { start, end } = monthRange(req.query.month);
    if (req.query.kind === 'starters') out = await empList({ 'employment.startDate': { $gte: start, $lt: end } }, true);
    else out = await empList({ status: 'terminated', 'employment.terminationDate': { $gte: start, $lt: end } }, true);
  } else if (type === 'tenure') {
    const ranges = { '< 1 yr': [0, 1], '1–3 yrs': [1, 3], '3–5 yrs': [3, 5], '5–10 yrs': [5, 10], '10+ yrs': [10, 999] };
    const [lo, hi] = ranges[req.query.band] || [0, 999];
    out = await empList({ status: 'active', 'employment.startDate': { $gt: yearsAgo(hi), $lte: yearsAgo(lo) } }, true);
  } else if (type === 'applications') {
    const Application = req.tenantConn.model('Application');
    let apps = await safe(() => Application.find().populate('vacancy', 'title').select('firstName lastName stage source timeline vacancy createdAt').sort({ createdAt: -1 }).limit(1000).lean(), []);
    if (req.query.source) apps = apps.filter((a) => (a.source || 'Unspecified') === req.query.source);
    if (req.query.stage) {
      const LINEAR = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired'];
      const target = LINEAR.indexOf(String(req.query.stage).toLowerCase());
      if (target >= 0) apps = apps.filter((a) => { const seen = new Set([a.stage, ...(a.timeline || []).map((t) => t.stage)]); const maxIdx = Math.max(-1, ...[...seen].map((s) => LINEAR.indexOf(s))); return maxIdx >= target; });
    }
    out = { columns: ['Candidate', 'Vacancy', 'Stage', 'Source'], link: '/recruitment', rows: apps.slice(0, 500).map((a) => [[a.firstName, a.lastName].filter(Boolean).join(' ') || '—', a.vacancy?.title || '—', cap(a.stage), a.source || '—']) };
  } else if (type === 'salaryBand') {
    const m = String(req.query.band || '').match(/(\d+)k.*?(\d+)k/);
    const lo = m ? Number(m[1]) * 1000 : 0; const hi = m ? Number(m[2]) * 1000 : 1e12;
    const rows = await safe(() => Employee.find({ status: 'active', 'compensation.payBasis': 'salary', 'compensation.baseSalary': { $gte: lo, $lt: hi } }).select('firstName lastName staffId employment.department compensation.baseSalary compensation.currency').sort({ 'compensation.baseSalary': -1 }).limit(500).lean(), []);
    out = { columns: ['Name', 'Staff ID', 'Department', 'Salary'], link: '/employees', rows: rows.map((e) => [nm(e), e.staffId || '—', e.employment?.department || '—', `${e.compensation?.currency || ''} ${Number(e.compensation?.baseSalary || 0).toLocaleString()}`.trim()]) };
  } else if (type === 'attendance') {
    const Attendance = req.tenantConn.model('Attendance');
    const q = { status: req.query.status };
    if (req.query.month) { const { start, end } = monthRange(req.query.month); q.date = { $gte: start, $lt: end }; }
    else { const days = Number(req.query.days) || 30; const since = new Date(); since.setDate(since.getDate() - days); q.date = { $gte: since }; }
    const rows = await safe(() => Attendance.find(q).populate('employee', 'firstName lastName staffId').sort({ date: -1 }).limit(500).lean(), []);
    out = { columns: ['Employee', 'Date', 'Status'], link: '/attendance', rows: rows.map((r) => [nm(r.employee), r.date ? new Date(r.date).toLocaleDateString() : '—', cap(r.status)]) };
  } else if (type === 'leaveByType') {
    const LeaveRequest = req.tenantConn.model('LeaveRequest'); const LeaveType = req.tenantConn.model('LeaveType');
    const lt = await safe(() => LeaveType.findOne({ $or: [{ name: req.query.name }, { code: req.query.name }] }).select('_id').lean(), null);
    const q = { status: 'approved' }; if (lt) q.leaveType = lt._id;
    const rows = await safe(() => LeaveRequest.find(q).populate('employee', 'firstName lastName staffId').sort({ startDate: -1 }).limit(500).lean(), []);
    out = { columns: ['Employee', 'From', 'To', 'Days'], link: '/leave', rows: rows.map((l) => [nm(l.employee), l.startDate ? new Date(l.startDate).toLocaleDateString() : '—', l.endDate ? new Date(l.endDate).toLocaleDateString() : '—', l.days ?? '—']) };
  } else if (type === 'pivot') {
    const f1 = DIM_FIELD[req.query.rowsDim]; const f2 = DIM_FIELD[req.query.colsDim];
    const match = (f1 !== 'status' && f2 !== 'status') ? { status: 'active' } : {};
    const setF = (f, v) => { if (!f) return; if (v === 'Unspecified' || v === '—') match[f] = { $in: [null, ''] }; else match[f] = v; };
    setF(f1, req.query.rowVal); setF(f2, req.query.colVal);
    out = await empList(match, false);
  }

  out.title = req.query.title || 'Details';
  out.count = out.rows.length;
  res.json(out);
});

module.exports = { overview, turnover, payroll, recruitment, absence, pivot, drill };