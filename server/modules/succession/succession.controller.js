const asyncHandler = require('express-async-handler');

/* ------------------------------- helpers ------------------------------- */
const fullName = (e) => [e?.firstName, e?.lastName].filter(Boolean).join(' ') || '—';
const READINESS = { ready_now: 'Ready now', '1_2_years': '1–2 years', '3_5_years': '3–5 years' };

// Bench strength from a plan's successors: strong if a ready-now exists, etc.
function benchStrength(successors = []) {
  if (!successors.length) return { level: 'none', label: 'No successors', score: 0 };
  const readyNow = successors.filter((s) => s.readiness === 'ready_now').length;
  const near = successors.filter((s) => s.readiness === '1_2_years').length;
  if (readyNow >= 1) return { level: 'strong', label: 'Strong', score: 3 };
  if (near >= 1) return { level: 'moderate', label: 'Developing', score: 2 };
  return { level: 'weak', label: 'Long-term only', score: 1 };
}

/* =============================== TALENT PROFILES / 9-BOX =============================== */

// GET /succession/talent  — all talent profiles (with employee info).
const listTalent = asyncHandler(async (req, res) => {
  const TalentProfile = req.tenantConn.model('TalentProfile');
  const filter = {};
  if (req.query.keyTalent === 'true') filter.keyTalent = true;
  if (req.query.flightRisk && req.query.flightRisk !== 'all') filter.flightRisk = req.query.flightRisk;
  const items = await TalentProfile.find(filter)
    .populate('employee', 'firstName lastName staffId employment.department employment.grade employment.jobTitle')
    .sort({ box: -1 }).lean();
  res.json({ items, total: items.length });
});

// GET /succession/talent/employee/:employeeId — one profile (creates a blank shell if none).
const getTalent = asyncHandler(async (req, res) => {
  const TalentProfile = req.tenantConn.model('TalentProfile');
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.params.employeeId, 'firstName lastName staffId employment').lean();
  if (!emp) return res.status(404).json({ message: 'Employee not found' });
  const profile = await TalentProfile.findOne({ employee: emp._id }).lean();
  res.json({ employee: { id: emp._id, name: fullName(emp), staffId: emp.staffId, grade: emp.employment?.grade || '', department: emp.employment?.department || '' }, profile: profile || null });
});

// PUT /succession/talent/:employeeId — upsert a talent profile.
const saveTalent = asyncHandler(async (req, res) => {
  const TalentProfile = req.tenantConn.model('TalentProfile');
  const fields = ['performanceRating', 'potentialRating', 'flightRisk', 'impactOfLoss', 'promotionReadiness', 'mobility', 'keyTalent', 'aspirations', 'strengths', 'developmentAreas', 'cycle'];
  let doc = await TalentProfile.findOne({ employee: req.params.employeeId });
  if (!doc) doc = new TalentProfile({ employee: req.params.employeeId });
  fields.forEach((k) => { if (req.body[k] !== undefined) doc[k] = req.body[k]; });
  doc.reviewedDate = new Date(); doc.reviewedBy = req.auth.userId;
  await doc.save();   // pre-save computes box
  res.json(doc);
});

const deleteTalent = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('TalentProfile').findOneAndDelete({ employee: req.params.employeeId });
  if (!doc) return res.status(404).json({ message: 'Talent profile not found' });
  res.json({ message: 'Talent profile removed' });
});

// GET /succession/ninebox?department= — the 9-box matrix, employees grouped by box.
const nineBox = asyncHandler(async (req, res) => {
  const TalentProfile = req.tenantConn.model('TalentProfile');
  const profiles = await TalentProfile.find({ box: { $ne: null } })
    .populate('employee', 'firstName lastName staffId employment.department employment.grade').lean();

  const dept = req.query.department;
  const boxes = {}; for (let i = 1; i <= 9; i++) boxes[i] = [];
  let placed = 0;
  profiles.forEach((p) => {
    if (!p.employee) return;
    if (dept && dept !== 'all' && (p.employee.employment?.department || '') !== dept) return;
    boxes[p.box].push({
      profileId: p._id, employeeId: p.employee._id, name: fullName(p.employee), staffId: p.employee.staffId || '',
      department: p.employee.employment?.department || '', grade: p.employee.employment?.grade || '',
      performance: p.performanceRating, potential: p.potentialRating, flightRisk: p.flightRisk, keyTalent: p.keyTalent,
    });
    placed += 1;
  });
  res.json({ boxes, placed });
});

/* =============================== SUCCESSION PLANS =============================== */

// GET /succession/plans?risk=&critical=true
const listPlans = asyncHandler(async (req, res) => {
  const SuccessionPlan = req.tenantConn.model('SuccessionPlan');
  const filter = {};
  if (req.query.critical === 'true') filter.businessCritical = true;
  if (req.query.risk && req.query.risk !== 'all') filter.riskOfLoss = req.query.risk;
  const docs = await SuccessionPlan.find(filter)
    .populate('position', 'title code')
    .populate('incumbent', 'firstName lastName staffId')
    .populate('successors.employee', 'firstName lastName staffId employment.grade')
    .sort({ businessCritical: -1, riskOfLoss: -1 }).lean();
  const items = docs.map((p) => ({ ...p, bench: benchStrength(p.successors) }));
  res.json({ items, total: items.length });
});

const getPlan = asyncHandler(async (req, res) => {
  const SuccessionPlan = req.tenantConn.model('SuccessionPlan');
  const doc = await SuccessionPlan.findById(req.params.id)
    .populate('position', 'title code')
    .populate('incumbent', 'firstName lastName staffId')
    .populate('successors.employee', 'firstName lastName staffId employment.grade employment.department').lean();
  if (!doc) return res.status(404).json({ message: 'Plan not found' });
  doc.bench = benchStrength(doc.successors);
  res.json(doc);
});

// POST /succession/plans  — create for a key position (one plan per position).
const createPlan = asyncHandler(async (req, res) => {
  const SuccessionPlan = req.tenantConn.model('SuccessionPlan');
  const Position = req.tenantConn.model('Position');
  const Employee = req.tenantConn.model('Employee');
  if (!req.body.position) return res.status(400).json({ message: 'A position is required.' });
  const exists = await SuccessionPlan.findOne({ position: req.body.position });
  if (exists) return res.status(409).json({ message: 'A succession plan already exists for this position.' });

  // Auto-detect the incumbent (first active employee assigned to the position) if not given.
  let incumbent = req.body.incumbent || null;
  if (!incumbent) {
    const holder = await Employee.findOne({ 'employment.positionId': req.body.position, 'employment.confirmationStatus': { $ne: 'exited' } }, '_id').lean();
    incumbent = holder?._id || null;
  }
  const doc = await SuccessionPlan.create({ ...req.body, incumbent, reviewedBy: req.auth.userId });
  const pos = await Position.findById(doc.position, 'title code').lean();
  res.status(201).json({ ...doc.toObject(), position: pos });
});

const updatePlan = asyncHandler(async (req, res) => {
  const SuccessionPlan = req.tenantConn.model('SuccessionPlan');
  const body = { ...req.body }; delete body.position;
  body.reviewedDate = new Date(); body.reviewedBy = req.auth.userId;
  const doc = await SuccessionPlan.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Plan not found' });
  res.json(doc);
});

const deletePlan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('SuccessionPlan').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Plan not found' });
  res.json({ message: 'Plan deleted' });
});

// Positions that could be made key positions but have no plan yet (for the "add plan" picker).
const uncoveredPositions = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const SuccessionPlan = req.tenantConn.model('SuccessionPlan');
  const planned = await SuccessionPlan.find({}, 'position').lean();
  const plannedIds = new Set(planned.map((p) => String(p.position)));
  const positions = await Position.find({ active: true }, 'title code').sort({ title: 1 }).lean();
  res.json({ items: positions.filter((p) => !plannedIds.has(String(p._id))) });
});

/* =============================== TALENT POOL =============================== */

// GET /succession/pool — the key-talent register + retention watchlist.
const talentPool = asyncHandler(async (req, res) => {
  const TalentProfile = req.tenantConn.model('TalentProfile');
  const profiles = await TalentProfile.find({ $or: [{ keyTalent: true }, { flightRisk: 'high' }, { box: { $in: [6, 8, 9] } }] })
    .populate('employee', 'firstName lastName staffId employment.department employment.grade').lean();
  const items = profiles.filter((p) => p.employee).map((p) => ({
    employeeId: p.employee._id, name: fullName(p.employee), staffId: p.employee.staffId || '',
    department: p.employee.employment?.department || '', grade: p.employee.employment?.grade || '',
    box: p.box, keyTalent: p.keyTalent, flightRisk: p.flightRisk, impactOfLoss: p.impactOfLoss,
    promotionReadiness: p.promotionReadiness, mobility: p.mobility, aspirations: p.aspirations,
  }));
  // Retention watchlist = high flight risk AND (key talent or high impact of loss)
  const watchlist = items.filter((i) => i.flightRisk === 'high' && (i.keyTalent || i.impactOfLoss === 'high'));
  res.json({ items, watchlist, total: items.length });
});

/* =============================== DEVELOPMENT PLANS (IDP) =============================== */

const listDevPlans = asyncHandler(async (req, res) => {
  const DevelopmentPlan = req.tenantConn.model('DevelopmentPlan');
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  const docs = await DevelopmentPlan.find(filter)
    .populate('employee', 'firstName lastName staffId employment.grade')
    .populate('mentor', 'firstName lastName').sort({ createdAt: -1 }).lean();
  const items = docs.map((p) => {
    const goals = p.goals || [];
    const done = goals.filter((g) => g.status === 'completed').length;
    const progress = goals.length ? Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length) : 0;
    return { ...p, goalCount: goals.length, completedGoals: done, progress };
  });
  res.json({ items, total: items.length });
});

const getDevPlan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('DevelopmentPlan').findById(req.params.id)
    .populate('employee', 'firstName lastName staffId employment.grade employment.department')
    .populate('mentor', 'firstName lastName')
    .populate('goals.competency', 'name').populate('goals.course', 'title');
  if (!doc) return res.status(404).json({ message: 'Development plan not found' });
  res.json(doc);
});

const createDevPlan = asyncHandler(async (req, res) => {
  const DevelopmentPlan = req.tenantConn.model('DevelopmentPlan');
  if (!req.body.employee) return res.status(400).json({ message: 'An employee is required.' });
  const doc = await DevelopmentPlan.create({ ...req.body, createdBy: req.auth.userId });
  res.status(201).json(doc);
});

const updateDevPlan = asyncHandler(async (req, res) => {
  const DevelopmentPlan = req.tenantConn.model('DevelopmentPlan');
  const body = { ...req.body }; delete body.createdBy;
  const doc = await DevelopmentPlan.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Development plan not found' });
  res.json(doc);
});

const deleteDevPlan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('DevelopmentPlan').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Development plan not found' });
  res.json({ message: 'Development plan deleted' });
});

/* =============================== OVERVIEW =============================== */

const overview = asyncHandler(async (req, res) => {
  const TalentProfile = req.tenantConn.model('TalentProfile');
  const SuccessionPlan = req.tenantConn.model('SuccessionPlan');
  const DevelopmentPlan = req.tenantConn.model('DevelopmentPlan');

  const [assessed, keyTalent, highRisk, plans, activeIdp] = await Promise.all([
    TalentProfile.countDocuments({ box: { $ne: null } }),
    TalentProfile.countDocuments({ keyTalent: true }),
    TalentProfile.countDocuments({ flightRisk: 'high' }),
    SuccessionPlan.find({}, 'successors businessCritical').lean(),
    DevelopmentPlan.countDocuments({ status: 'active' }),
  ]);

  const keyPositions = plans.length;
  const critical = plans.filter((p) => p.businessCritical).length;
  const atRisk = plans.filter((p) => !(p.successors || []).length).length;            // no successor named
  const readyNow = plans.filter((p) => (p.successors || []).some((s) => s.readiness === 'ready_now')).length;
  const coverage = keyPositions ? Math.round(((keyPositions - atRisk) / keyPositions) * 100) : 0;

  // Retention watchlist size
  const watch = await TalentProfile.countDocuments({ flightRisk: 'high', $or: [{ keyTalent: true }, { impactOfLoss: 'high' }] });

  res.json({
    talent: { assessed, keyTalent, highRisk },
    succession: { keyPositions, critical, atRisk, readyNow, coveragePct: coverage },
    watchlist: watch,
    developmentPlans: activeIdp,
  });
});

module.exports = {
  listTalent, getTalent, saveTalent, deleteTalent, nineBox,
  listPlans, getPlan, createPlan, updatePlan, deletePlan, uncoveredPositions,
  talentPool,
  listDevPlans, getDevPlan, createDevPlan, updateDevPlan, deleteDevPlan,
  overview,
};