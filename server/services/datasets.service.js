// Analysis-ready datasets for Workforce Intelligence (Data Scientist + builders).
//
// Each builder flattens a tenant collection into clean, denormalised rows with
// employee name / department / grade joined in, numbers as numbers and dates as
// ISO strings — the shape pandas analyses cleanly. These are the selectable
// "data sources" the analyst can point Claude at, beyond the employee roster.
const xlsxDash = require('./excelDashboard.service');

const num = (v) => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const isoDate = (d) => { if (!d) return null; const t = new Date(d); return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10); };
const periodOf = (d) => { const s = isoDate(d); return s ? s.slice(0, 7) : null; };
const avg = (arr) => { const a = arr.filter((n) => n != null && Number.isFinite(Number(n))).map(Number); return a.length ? round2(a.reduce((x, y) => x + y, 0) / a.length) : null; };

// The catalogue the UI shows. `ai` flags datasets that only make sense with AI
// analysis (all of them here); `always` is for the picker ordering.
const CATALOGUE = [
  { key: 'employees', label: 'Employees', hint: 'Roster, pay, tenure, demographics' },
  { key: 'payroll', label: 'Payroll', hint: 'Payslips by period — gross, net, PAYE, SSNIT' },
  { key: 'leave', label: 'Leave', hint: 'Leave requests, days, types, status' },
  { key: 'attendance', label: 'Attendance', hint: 'Daily muster, absence, overtime, output' },
  { key: 'performance', label: 'Performance', hint: 'Appraisal reviews and ratings' },
];
const KEYS = CATALOGUE.map((c) => c.key);

// Map Employee _id -> compact identity for joining onto other collections.
function empIndex(employees) {
  const idx = {};
  for (const e of employees || []) {
    idx[String(e._id)] = {
      name: [e.firstName, e.lastName].filter(Boolean).join(' ') || e.name || '',
      staffId: e.staffId || '',
      department: e?.employment?.department || 'Unspecified',
      grade: e?.employment?.grade || '',
      gender: e.gender || '',
    };
  }
  return idx;
}

async function buildEmployees(conn, employees) {
  return xlsxDash.rowsFromEmployees(employees);
}

async function buildPayroll(conn, emap) {
  const runs = await conn.model('PayrollRun').find({}).lean();
  const rows = [];
  for (const run of runs) {
    for (const s of (run.payslips || [])) {
      const eid = String(s?.employee?.id || s?.employee || '');
      const e = emap[eid] || {};
      rows.push({
        period: run.period || periodOf(run.createdAt),
        runStatus: run.status || '',
        currency: run.currency || s.currency || '',
        staffId: e.staffId || s.staffId || '',
        name: (s?.employee?.name) || e.name || s.name || '',
        department: e.department || 'Unspecified',
        grade: e.grade || '',
        gross: round2(num(s?.earnings?.grossEarnings ?? s.gross ?? s.grossPay)),
        net: round2(num(s?.netPay ?? s.net ?? s.netPay)),
        paye: round2(num(s?.paye ?? s?.deductions?.paye)),
        socialSecurity: round2(num(s?.deductions?.socialSecurity ?? s?.socialSecurity?.employeeTotal)),
        deductions: round2(num(s?.deductions?.total)),
        employerCost: round2(num(s?.employerCost)),
        daysWorked: num(s?.inputs?.daysWorked),
        unpaidDays: num(s?.inputs?.unpaidDays),
        payBasis: s?.employee?.payBasis || '',
      });
    }
  }
  return rows;
}

async function buildLeave(conn, emap) {
  const [reqs, types] = await Promise.all([
    conn.model('LeaveRequest').find({}).lean(),
    conn.model('LeaveType').find({}).lean(),
  ]);
  const tmap = Object.fromEntries(types.map((t) => [String(t._id), t.name || t.code || '']));
  return (reqs || []).map((r) => {
    const e = emap[String(r.employee)] || {};
    return {
      staffId: e.staffId || '',
      name: e.name || '',
      department: e.department || 'Unspecified',
      leaveType: tmap[String(r.leaveType)] || '',
      status: r.status || '',
      days: num(r.days),
      startDate: isoDate(r.startDate),
      endDate: isoDate(r.endDate),
      month: periodOf(r.startDate),
    };
  });
}

async function buildAttendance(conn, emap) {
  // Attendance can be large — cap to the most recent slice for responsiveness.
  const recs = await conn.model('Attendance').find({}).sort({ date: -1 }).limit(20000).lean();
  return (recs || []).map((a) => {
    const e = emap[String(a.employee)] || {};
    return {
      date: isoDate(a.date),
      month: periodOf(a.date),
      status: a.status || '',
      department: a.department || e.department || 'Unspecified',
      section: a.section || '',
      shift: a.shift || '',
      hoursWorked: num(a.hoursWorked),
      overtimeHours: num(a.overtimeHours),
      lostManDay: num(a.lostManDay),
      excused: !!a.excused,
      absenceReason: a.absenceReason || '',
      outputQty: num(a?.output?.quantity),
      outputUnit: a?.output?.unit || '',
      staffId: e.staffId || '',
      name: e.name || '',
    };
  });
}

async function buildPerformance(conn, emap) {
  const [reviews, cycles] = await Promise.all([
    conn.model('Review').find({}).lean(),
    conn.model('AppraisalCycle').find({}).lean(),
  ]);
  const cmap = Object.fromEntries(cycles.map((c) => [String(c._id), c.name || c.title || '']));
  return (reviews || []).map((r) => {
    const e = emap[String(r.employee)] || {};
    const goalRatings = (r.goals || []).map((g) => g.managerRating);
    const compRatings = (r.competencies || []).map((c) => c.managerRating);
    return {
      staffId: e.staffId || '',
      name: e.name || '',
      department: e.department || 'Unspecified',
      cycle: cmap[String(r.cycle)] || '',
      status: r.status || '',
      overallSelf: r?.overall?.selfRating ?? null,
      overallManager: r?.overall?.managerRating ?? null,
      goalCount: (r.goals || []).length,
      avgGoalRating: avg(goalRatings),
      competencyCount: (r.competencies || []).length,
      avgCompetencyRating: avg(compRatings),
    };
  });
}

// Build analysis rows for `key` on a tenant connection. Falls back to the
// employee roster for an unknown key.
async function buildDataset(conn, key) {
  const employees = await conn.model('Employee').find({}).lean();
  const emap = empIndex(employees);
  switch (key) {
    case 'payroll': return buildPayroll(conn, emap);
    case 'leave': return buildLeave(conn, emap);
    case 'attendance': return buildAttendance(conn, emap);
    case 'performance': return buildPerformance(conn, emap);
    case 'employees':
    default: return buildEmployees(conn, employees);
  }
}

function labelFor(key) {
  const c = CATALOGUE.find((x) => x.key === key);
  return c ? c.label : 'Employees';
}

module.exports = { CATALOGUE, KEYS, buildDataset, labelFor };
