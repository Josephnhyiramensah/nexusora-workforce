const asyncHandler = require('express-async-handler');
const { workingDays, monthsBetween } = require('./leave.util');
const { getPack } = require('../../compliance/registry');
const { getAnnualLeaveEntitlement } = require('../../compliance/engine');

// ---- Leave types ----
const listTypes = asyncHandler(async (req, res) => {
  const types = await req.tenantConn.model('LeaveType').find({ active: true }).sort({ name: 1 });
  res.json(types);
});

const createType = asyncHandler(async (req, res) => {
  const LeaveType = req.tenantConn.model('LeaveType');
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'name and code are required' });
  if (await LeaveType.findOne({ code })) return res.status(409).json({ message: 'Type code already exists' });
  const type = await LeaveType.create(req.body);
  res.status(201).json(type);
});

// Seed a sensible default set (annual pulls from the tenant's compliance pack).
const seedTypes = asyncHandler(async (req, res) => {
  const LeaveType = req.tenantConn.model('LeaveType');
  const pack = getPack(req.tenant.countryCode);
  const maternityDays = pack && pack.leave && pack.leave.maternityWeeks ? pack.leave.maternityWeeks * 7 : 84;
  const defaults = [
    { name: 'Annual Leave', code: 'annual', paid: true, entitlementSource: 'compliance_pack', color: '#1A6B3C' },
    { name: 'Sick Leave', code: 'sick', paid: true, entitlementSource: 'fixed', daysPerYear: 12, color: '#B42318' },
    { name: 'Maternity Leave', code: 'maternity', paid: true, entitlementSource: 'fixed', daysPerYear: maternityDays, color: '#9A6B00' },
    { name: 'Paternity Leave', code: 'paternity', paid: true, entitlementSource: 'fixed', daysPerYear: 5, color: '#2E75B6' },
    { name: 'Compassionate Leave', code: 'compassionate', paid: true, entitlementSource: 'fixed', daysPerYear: 5, color: '#6b7280' },
    { name: 'Unpaid Leave', code: 'unpaid', paid: false, entitlementSource: 'unlimited', color: '#9ca3af' },
  ];
  let created = 0;
  for (const d of defaults) { if (!(await LeaveType.findOne({ code: d.code }))) { await LeaveType.create(d); created += 1; } }
  res.json({ message: 'Default leave types ready', created });
});

// ---- Requests ----
const createRequest = asyncHandler(async (req, res) => {
  const { employee, leaveType, startDate, endDate, reason } = req.body;
  if (!employee || !leaveType || !startDate || !endDate) {
    return res.status(400).json({ message: 'employee, leaveType, startDate, endDate are required' });
  }
  if (new Date(endDate) < new Date(startDate)) return res.status(400).json({ message: 'endDate is before startDate' });
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const LeaveType = req.tenantConn.model('LeaveType');
  const type = await LeaveType.findById(leaveType);
  if (!type) return res.status(400).json({ message: 'Unknown leave type' });
  const days = workingDays(startDate, endDate);
  const status = type.requiresApproval ? 'pending' : 'approved';
  const doc = await LeaveRequest.create({
    employee, leaveType, startDate, endDate, days, reason, status,
    createdBy: req.auth.userId,
    ...(status === 'approved' ? { decidedBy: req.auth.userId, decidedAt: new Date() } : {}),
  });
  const populated = await doc.populate([{ path: 'employee', select: 'firstName lastName' }, { path: 'leaveType', select: 'name code color' }]);
  res.status(201).json(populated);
});

const listRequests = asyncHandler(async (req, res) => {
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const { status, employee } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (employee) filter.employee = employee;
  const requests = await LeaveRequest.find(filter)
    .populate('employee', 'firstName lastName')
    .populate('leaveType', 'name code color')
    .sort({ createdAt: -1 }).limit(200);
  res.json(requests);
});

async function decide(req, res, decision) {
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const doc = await LeaveRequest.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Request not found' });
  if (doc.status !== 'pending') return res.status(409).json({ message: `Cannot ${decision} a ${doc.status} request` });
  doc.status = decision === 'approve' ? 'approved' : 'rejected';
  doc.decidedBy = req.auth.userId;
  doc.decisionNote = req.body.note;
  doc.decidedAt = new Date();
  await doc.save();
  const populated = await doc.populate([{ path: 'employee', select: 'firstName lastName' }, { path: 'leaveType', select: 'name code color' }]);
  res.json(populated);
}
const approve = asyncHandler((req, res) => decide(req, res, 'approve'));
const reject = asyncHandler((req, res) => decide(req, res, 'reject'));

const cancel = asyncHandler(async (req, res) => {
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const doc = await LeaveRequest.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Request not found' });
  if (!['pending', 'approved'].includes(doc.status)) return res.status(409).json({ message: `Cannot cancel a ${doc.status} request` });
  doc.status = 'cancelled';
  await doc.save();
  res.json({ message: 'Request cancelled', request: doc });
});

// ---- Balance ----
const balance = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const emp = await Employee.findById(req.params.employeeId);
  if (!emp) return res.status(404).json({ message: 'Employee not found' });

  const startDate = emp.employment && emp.employment.startDate;
  const tenureMonths = startDate ? monthsBetween(startDate, new Date()) : 0;
  const pack = getPack(req.tenant.countryCode);
  const annualEntitlement = pack ? getAnnualLeaveEntitlement(pack, tenureMonths) : 0;

  const year = new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const approved = await LeaveRequest.find({ employee: emp._id, status: 'approved', startDate: { $gte: yearStart, $lte: yearEnd } })
    .populate('leaveType', 'name code');

  let annualTaken = 0; const byType = {};
  for (const r of approved) {
    const name = (r.leaveType && r.leaveType.name) || '—';
    byType[name] = (byType[name] || 0) + (r.days || 0);
    if (r.leaveType && r.leaveType.code === 'annual') annualTaken += (r.days || 0);
  }

  res.json({
    employee: { id: emp._id, name: `${emp.firstName} ${emp.lastName}` },
    tenureMonths,
    annual: { entitlement: annualEntitlement, taken: annualTaken, remaining: Math.max(0, annualEntitlement - annualTaken) },
    byType: Object.entries(byType).map(([type, days]) => ({ type, days })),
  });
});

module.exports = { listTypes, createType, seedTypes, createRequest, listRequests, approve, reject, cancel, balance };
