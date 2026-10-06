const asyncHandler = require('express-async-handler');

function avg(nums) {
  const vals = nums.filter((n) => n != null && !isNaN(n));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 100) / 100;
}

/* ============================ CYCLES ============================ */

// GET /performance/cycles
const listCycles = asyncHandler(async (req, res) => {
  const Cycle = req.tenantConn.model('AppraisalCycle');
  const Review = req.tenantConn.model('Review');
  const cycles = await Cycle.find().sort({ createdAt: -1 }).lean();
  const agg = await Review.aggregate([
    { $group: { _id: { cycle: '$cycle', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const byCycle = {};
  agg.forEach((a) => {
    const c = String(a._id.cycle);
    byCycle[c] = byCycle[c] || { total: 0 };
    byCycle[c][a._id.status] = a.n; byCycle[c].total += a.n;
  });
  const items = cycles.map((c) => ({ ...c, reviews: byCycle[String(c._id)] || { total: 0 } }));
  res.json({ items, total: items.length });
});

// POST /performance/cycles
const createCycle = asyncHandler(async (req, res) => {
  const Cycle = req.tenantConn.model('AppraisalCycle');
  const body = { ...req.body, createdBy: req.auth.userId };
  if (!body.name) return res.status(400).json({ message: 'A cycle name is required.' });
  const c = await Cycle.create(body);
  res.status(201).json(c);
});

// GET /performance/cycles/:id
const getCycle = asyncHandler(async (req, res) => {
  const c = await req.tenantConn.model('AppraisalCycle').findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Cycle not found' });
  res.json(c);
});

// PUT /performance/cycles/:id
const updateCycle = asyncHandler(async (req, res) => {
  const body = { ...req.body }; delete body.createdBy;
  const c = await req.tenantConn.model('AppraisalCycle').findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!c) return res.status(404).json({ message: 'Cycle not found' });
  res.json(c);
});

// DELETE /performance/cycles/:id  (refuses if reviews exist)
const deleteCycle = asyncHandler(async (req, res) => {
  const n = await req.tenantConn.model('Review').countDocuments({ cycle: req.params.id });
  if (n > 0) return res.status(409).json({ message: `This cycle has ${n} review(s). Close it instead of deleting.` });
  const c = await req.tenantConn.model('AppraisalCycle').findByIdAndDelete(req.params.id);
  if (!c) return res.status(404).json({ message: 'Cycle not found' });
  res.json({ message: 'Cycle deleted' });
});

// POST /performance/cycles/:id/generate  { employeeIds? }
// Creates a Review for each active employee (or the given ids) that doesn't have one yet.
const generateReviews = asyncHandler(async (req, res) => {
  const Cycle = req.tenantConn.model('AppraisalCycle');
  const Employee = req.tenantConn.model('Employee');
  const Review = req.tenantConn.model('Review');

  const cycle = await Cycle.findById(req.params.id);
  if (!cycle) return res.status(404).json({ message: 'Cycle not found' });

  const filter = { status: 'active' };
  if (Array.isArray(req.body.employeeIds) && req.body.employeeIds.length) filter._id = { $in: req.body.employeeIds };
  const employees = await Employee.find(filter).select('employment.lineManager');

  const existing = await Review.find({ cycle: cycle._id }).select('employee');
  const have = new Set(existing.map((r) => String(r.employee)));

  const toMake = employees.filter((e) => !have.has(String(e._id)));
  const comps = (cycle.competencies || []).map((name) => ({ name }));
  let created = 0;
  for (const e of toMake) {
    try {
      await Review.create({
        cycle: cycle._id, employee: e._id, manager: e.employment?.lineManager || null,
        competencies: comps.map((c) => ({ ...c })), createdBy: req.auth.userId,
      });
      created += 1;
    } catch (err) { /* unique index guards against a duplicate race — skip */ }
  }
  if (cycle.status === 'draft') { cycle.status = 'active'; await cycle.save(); }
  res.json({ message: `${created} review(s) generated.`, created, skipped: employees.length - created });
});

/* ============================ REVIEWS ============================ */

// GET /performance/reviews?cycle=&employee=&manager=&status=
const listReviews = asyncHandler(async (req, res) => {
  const Review = req.tenantConn.model('Review');
  req.tenantConn.model('Employee');
  const { cycle, employee, manager, status } = req.query;
  const filter = {};
  if (cycle) filter.cycle = cycle;
  if (employee) filter.employee = employee;
  if (manager) filter.manager = manager;
  if (status) filter.status = status;
  const items = await Review.find(filter)
    .populate('employee', 'firstName lastName staffId employment.jobTitle')
    .populate('manager', 'firstName lastName')
    .populate('cycle', 'name type ratingMax')
    .sort({ createdAt: -1 });
  res.json({ items, total: items.length });
});

// GET /performance/reviews/:id
const getReview = asyncHandler(async (req, res) => {
  const r = await req.tenantConn.model('Review').findById(req.params.id)
    .populate('employee', 'firstName lastName staffId employment.jobTitle photo')
    .populate('manager', 'firstName lastName')
    .populate('cycle', 'name type ratingMax ratingLabels competencies instructions status');
  if (!r) return res.status(404).json({ message: 'Review not found' });
  res.json(r);
});

// PUT /performance/reviews/:id — patch goals, competencies, comments, overall.
const updateReview = asyncHandler(async (req, res) => {
  const r = await req.tenantConn.model('Review').findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Review not found' });
  if (r.status === 'acknowledged') return res.status(409).json({ message: 'This review is closed and acknowledged.' });
  const { goals, competencies, selfComments, managerComments, overall } = req.body;
  if (goals !== undefined) r.goals = goals;
  if (competencies !== undefined) r.competencies = competencies;
  if (selfComments !== undefined) r.selfComments = selfComments;
  if (managerComments !== undefined) r.managerComments = managerComments;
  if (overall !== undefined) r.overall = { ...(r.overall || {}), ...overall };
  await r.save();
  res.json(r);
});

// POST /performance/reviews/:id/self-submit  { goals?, competencies?, selfComments?, overallSelf? }
const selfSubmit = asyncHandler(async (req, res) => {
  const r = await req.tenantConn.model('Review').findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Review not found' });
  const { goals, competencies, selfComments, overallSelf } = req.body;
  if (goals !== undefined) r.goals = goals;
  if (competencies !== undefined) r.competencies = competencies;
  if (selfComments !== undefined) r.selfComments = selfComments;
  r.overall.selfRating = overallSelf != null ? overallSelf
    : avg([...(r.goals || []).map((g) => g.selfRating), ...(r.competencies || []).map((c) => c.selfRating)]);
  r.status = 'self_submitted';
  r.selfSubmittedAt = new Date();
  await r.save();
  res.json(r);
});

// POST /performance/reviews/:id/manager-submit  { goals?, competencies?, managerComments?, overallManager? }
const managerSubmit = asyncHandler(async (req, res) => {
  const r = await req.tenantConn.model('Review').findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Review not found' });
  const { goals, competencies, managerComments, overallManager } = req.body;
  if (goals !== undefined) r.goals = goals;
  if (competencies !== undefined) r.competencies = competencies;
  if (managerComments !== undefined) r.managerComments = managerComments;
  r.overall.managerRating = overallManager != null ? overallManager
    : avg([...(r.goals || []).map((g) => g.managerRating), ...(r.competencies || []).map((c) => c.managerRating)]);
  r.status = 'completed';
  r.managerSubmittedAt = new Date();
  await r.save();
  res.json(r);
});

// POST /performance/reviews/:id/acknowledge
const acknowledge = asyncHandler(async (req, res) => {
  const r = await req.tenantConn.model('Review').findById(req.params.id);
  if (!r) return res.status(404).json({ message: 'Review not found' });
  if (r.status !== 'completed') return res.status(409).json({ message: 'The manager review must be completed before it can be acknowledged.' });
  r.status = 'acknowledged';
  r.acknowledgedAt = new Date();
  await r.save();
  res.json(r);
});

// DELETE /performance/reviews/:id
const deleteReview = asyncHandler(async (req, res) => {
  const r = await req.tenantConn.model('Review').findByIdAndDelete(req.params.id);
  if (!r) return res.status(404).json({ message: 'Review not found' });
  res.json({ message: 'Review removed' });
});

module.exports = {
  listCycles, createCycle, getCycle, updateCycle, deleteCycle, generateReviews,
  listReviews, getReview, updateReview, selfSubmit, managerSubmit, acknowledge, deleteReview,
};