const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { resolveEffectivePack } = require('../../compliance/resolve');
const { computePayslip } = require('./payroll.engine');
const { buildJournal } = require('./payroll.journal');

function monthRange(period) {
  const [y, m] = String(period).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start, end };
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// POST /api/payroll/runs  { period:'YYYY-MM', label? }
const createRun = asyncHandler(async (req, res) => {
  const { period, label } = req.body;
  if (!/^\d{4}-\d{2}$/.test(period || '')) return res.status(400).json({ message: 'period must be YYYY-MM' });

  const pack = await resolveEffectivePack(req.tenantConn, req.tenant.countryCode);
  if (!pack) return res.status(400).json({ message: `No compliance pack for ${req.tenant.countryCode}` });

  // Refuse to run payroll on a country whose statutory rates have never been entered.
  const hasTax = (pack.incomeTax?.brackets || []).some((b) => Number(b.rate) > 0);
  const hasSocial = (pack.socialSecurity?.contributions || []).length > 0;
  if (pack.isTemplate && !hasTax && !hasSocial) {
    return res.status(409).json({
      message: `Statutory rates for ${pack.countryName} have not been configured. `
        + 'Open Compliance & Statutory and enter the PAYE bands and social-security rates before running payroll.',
    });
  }

  const { start, end } = monthRange(period);
  const Employee = req.tenantConn.model('Employee');
  const Attendance = req.tenantConn.model('Attendance');
  const LeaveType = req.tenantConn.model('LeaveType');
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const PayrollRun = req.tenantConn.model('PayrollRun');

  const unpaidType = await LeaveType.findOne({ code: 'unpaid' });
  const employees = await Employee.find({ status: 'active' });

  const payslips = [];
  const totals = { headcount: 0, gross: 0, deductions: 0, net: 0, employerCost: 0 };

  for (const emp of employees) {
    const [att] = await Attendance.aggregate([
      { $match: { employee: emp._id, date: { $gte: start, $lte: end } } },
      { $group: { _id: null,
        daysWorked: { $sum: { $switch: { branches: [
          { case: { $in: ['$status', ['present', 'late']] }, then: 1 },
          { case: { $eq: ['$status', 'half_day'] }, then: 0.5 },
        ], default: 0 } } },
        output: { $sum: { $ifNull: ['$output.quantity', 0] } },
        hours: { $sum: { $ifNull: ['$hoursWorked', 0] } },
      } },
    ]);

    let unpaidDays = 0;
    if (unpaidType) {
      const [ul] = await LeaveRequest.aggregate([
        { $match: { employee: emp._id, status: 'approved', leaveType: unpaidType._id, startDate: { $lte: end }, endDate: { $gte: start } } },
        { $group: { _id: null, days: { $sum: { $ifNull: ['$days', 0] } } } },
      ]);
      unpaidDays = ul ? ul.days : 0;
    }

    const slip = computePayslip(pack, emp, {
      daysWorked: att ? att.daysWorked : 0,
      output: att ? att.output : 0,
      hoursWorked: att ? att.hours : 0,
      unpaidDays,
    });
    payslips.push(slip);
    totals.headcount += 1;
    totals.gross = round2(totals.gross + slip.earnings.grossEarnings);
    totals.deductions = round2(totals.deductions + slip.deductions.total);
    totals.net = round2(totals.net + slip.netPay);
    totals.employerCost = round2(totals.employerCost + slip.employerCost);
  }

  const run = await PayrollRun.create({
    period, label: label || period, status: 'draft',
    currency: pack.currency, totals, payslips, runBy: req.auth.userId,
  });
  res.status(201).json(run);
});

// GET /api/payroll/runs
const listRuns = asyncHandler(async (req, res) => {
  const runs = await req.tenantConn.model('PayrollRun').find().sort({ createdAt: -1 }).select('-payslips');
  res.json(runs);
});

// GET /api/payroll/runs/:id
const getRun = asyncHandler(async (req, res) => {
  const run = await req.tenantConn.model('PayrollRun').findById(req.params.id);
  if (!run) return res.status(404).json({ message: 'Run not found' });
  res.json(run);
});

// POST /api/payroll/runs/:id/approve
const approveRun = asyncHandler(async (req, res) => {
  const PayrollRun = req.tenantConn.model('PayrollRun');
  const run = await PayrollRun.findById(req.params.id);
  if (!run) return res.status(404).json({ message: 'Run not found' });
  if (run.status !== 'draft') return res.status(409).json({ message: `Run already ${run.status}` });
  run.status = 'approved';
  run.approvedBy = req.auth.userId;
  run.approvedAt = new Date();
  await run.save();
  res.json({ message: 'Run approved', run: { id: run._id, status: run.status } });
});

// GET /api/payroll/runs/:id/journal — the Books journal for an approved run.
const getJournal = asyncHandler(async (req, res) => {
  const run = await req.tenantConn.model('PayrollRun').findById(req.params.id);
  if (!run) return res.status(404).json({ message: 'Run not found' });
  if (run.status === 'draft') {
    return res.status(409).json({ message: 'Approve the payroll run before posting it to the ledger.' });
  }
  const accounts = (req.tenant.branding && req.tenant.branding.payrollAccounts) || {};
  const journal = buildJournal(run.toObject(), accounts);
  if (!journal.balanced) {
    return res.status(500).json({ message: 'Journal does not balance — please report this run.', journal });
  }
  res.json(journal);
});

/* ------------------------------------------------------------------ *
 *  Reconciliation — POST /payroll/runs/:id/reconcile (xlsx/csv).
 *  Compares an Accounts department payment sheet against the run's
 *  computed payslips. Currency-agnostic (uses the run's own currency);
 *  matches by Staff ID first, then by Name.
 * ------------------------------------------------------------------ */
const RECON_HDR = {
  'staffid': 'staffId', 'staff id': 'staffId', 'staff no': 'staffId', 'staff number': 'staffId', 'employee id': 'staffId', 'id': 'staffId',
  'name': 'name', 'employee': 'name', 'employee name': 'name', 'full name': 'name', 'staff name': 'name',
  'amount': 'amount', 'net': 'amount', 'net pay': 'amount', 'netpay': 'amount', 'net amount': 'amount',
  'net salary': 'amount', 'paid': 'amount', 'amount paid': 'amount', 'payment': 'amount', 'take home': 'amount',
};
function reconCell(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') { if (v.text != null) return String(v.text).trim(); if (v.result != null) return v.result; return String(v).trim(); }
  return String(v).trim();
}
function reconNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

const reconcile = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  const run = await req.tenantConn.model('PayrollRun').findById(req.params.id);
  if (!run) return res.status(404).json({ message: 'Run not found' });

  const wb = new ExcelJS.Workbook();
  const fn = (req.file.originalname || '').toLowerCase();
  try {
    if (fn.endsWith('.csv')) await wb.csv.read(Readable.from(req.file.buffer.toString('utf8')));
    else await wb.xlsx.load(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ message: 'Could not read the file. Upload a valid .xlsx or .csv.' });
  }
  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ message: 'The file has no sheet or rows.' });

  const colField = {};
  ws.getRow(1).eachCell((cell, col) => {
    const k = String(reconCell(cell) || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const f = RECON_HDR[k] || RECON_HDR[k.replace(/ /g, '')];
    if (f) colField[col] = f;
  });
  const fields = Object.values(colField);
  if (!fields.includes('amount')) {
    return res.status(400).json({ message: 'The sheet needs an amount column (e.g. "Net Pay" or "Amount").' });
  }
  if (!fields.includes('staffId') && !fields.includes('name')) {
    return res.status(400).json({ message: 'Add a "Staff ID" or "Name" column so rows can be matched to payroll.' });
  }

  const sheetRows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row || row.actualCellCount === 0) continue;
    const rec = {};
    for (const [col, field] of Object.entries(colField)) {
      const v = reconCell(row.getCell(Number(col)));
      if (field === 'amount') rec.amount = reconNum(v);
      else rec[field] = String(v || '').trim();
    }
    if ((rec.staffId || rec.name) && rec.amount != null) sheetRows.push(rec);
  }

  const slips = (run.payslips || []).map((s) => ({
    empId: String((s.employee && (s.employee.id || s.employee._id)) || '').trim(),
    staffId: String(s.staffId || (s.employee && s.employee.staffId) || '').trim(),
    name: String((s.employee && s.employee.name) || s.name || s.employeeName || [s.firstName, s.lastName].filter(Boolean).join(' ') || '').trim(),
    net: Number(s.netPay ?? s.net ?? s.netpay ?? (s.totals && s.totals.net) ?? 0),
    matched: false,
  }));
  // Payslips store only the employee id + name — enrich with Staff ID from the records so
  // an Accounts sheet keyed by Staff ID can match.
  const empIds = slips.map((s) => s.empId).filter(Boolean);
  if (empIds.length) {
    try {
      const emps = await req.tenantConn.model('Employee').find({ _id: { $in: empIds } }).select('staffId');
      const staffById = {};
      emps.forEach((e) => { staffById[String(e._id)] = e.staffId || ''; });
      slips.forEach((s) => { if (!s.staffId && s.empId) s.staffId = staffById[s.empId] || ''; });
    } catch (e) { /* fall back to name matching */ }
  }
  const byStaff = {}; const byName = {};
  slips.forEach((s, i) => { if (s.staffId) byStaff[s.staffId.toLowerCase()] = i; if (s.name) byName[s.name.toLowerCase()] = i; });

  const mismatches = []; const onlyInSheet = [];
  let sheetTotal = 0;
  for (const row of sheetRows) {
    sheetTotal += row.amount;
    let idx = (row.staffId && byStaff[row.staffId.toLowerCase()] != null) ? byStaff[row.staffId.toLowerCase()]
      : (row.name && byName[row.name.toLowerCase()] != null) ? byName[row.name.toLowerCase()] : null;
    if (idx == null) { onlyInSheet.push({ staffId: row.staffId || '', name: row.name || '', amount: round2(row.amount) }); continue; }
    const slip = slips[idx];
    slip.matched = true;
    const diff = round2(row.amount - slip.net);
    if (Math.abs(diff) >= 0.01) mismatches.push({ staffId: slip.staffId, name: slip.name, payroll: round2(slip.net), sheet: round2(row.amount), diff });
  }
  const onlyInPayroll = slips.filter((s) => !s.matched).map((s) => ({ staffId: s.staffId, name: s.name, payroll: round2(s.net) }));
  const payrollTotal = round2(slips.reduce((a, s) => a + s.net, 0));
  const matched = slips.filter((s) => s.matched).length - mismatches.length;

  res.json({
    currency: run.currency, period: run.period, label: run.label,
    summary: {
      sheetRows: sheetRows.length, payrollRows: slips.length,
      matched, mismatched: mismatches.length, onlyInSheet: onlyInSheet.length, onlyInPayroll: onlyInPayroll.length,
      sheetTotal: round2(sheetTotal), payrollTotal, diffTotal: round2(sheetTotal - payrollTotal),
    },
    mismatches, onlyInSheet, onlyInPayroll,
  });
});

module.exports = { createRun, listRuns, getRun, approveRun, getJournal, reconcile };