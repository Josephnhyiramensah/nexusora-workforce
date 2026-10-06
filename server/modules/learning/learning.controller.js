const asyncHandler = require('express-async-handler');
const path = require('path');
const cloudinary = require('../../config/cloudinary');

/* ------------------------------- helpers ------------------------------- */
function uploadBuffer(buffer, { folder, resourceType = 'auto', publicId }) {
  return new Promise((resolve, reject) => {
    const opts = { folder, resource_type: resourceType };
    if (publicId) opts.public_id = publicId;
    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });
}
function addMonths(date, months) {
  const d = new Date(date); d.setMonth(d.getMonth() + Number(months || 0)); return d;
}
const fullName = (e) => [e?.firstName, e?.lastName].filter(Boolean).join(' ') || '—';
async function actor(req) {
  try {
    const u = await req.tenantConn.model('User').findById(req.auth.userId).select('name role employee').lean();
    return { userId: req.auth.userId, name: u?.name || '', role: u?.role || req.auth?.role || '', employee: u?.employee || null };
  } catch { return { userId: req.auth?.userId || null, name: '', role: req.auth?.role || '', employee: null }; }
}
// Required competency level for an employee: best match by position, then grade, else default.
function requiredLevelFor(comp, emp) {
  const reqs = comp.requirements || [];
  const posId = emp?.employment?.positionId ? String(emp.employment.positionId) : null;
  const grade = emp?.employment?.grade || '';
  const byPos = posId && reqs.find((r) => r.position && String(r.position) === posId);
  if (byPos) return byPos.requiredLevel;
  const byGrade = grade && reqs.find((r) => r.grade && r.grade.toLowerCase() === String(grade).toLowerCase());
  if (byGrade) return byGrade.requiredLevel;
  return comp.defaultRequiredLevel ?? 3;
}

/* =============================== COURSES =============================== */
const listCourses = asyncHandler(async (req, res) => {
  const Course = req.tenantConn.model('Course');
  const { category, q, active } = req.query;
  const filter = {};
  if (category && category !== 'all') filter.category = category;
  if (active === 'true') filter.active = true;
  if (active === 'false') filter.active = false;
  if (q) { const rx = new RegExp(String(q).trim(), 'i'); filter.$or = [{ title: rx }, { code: rx }, { provider: rx }]; }
  const items = await Course.find(filter).populate('competencies', 'name code').sort({ title: 1 }).lean();

  // Attach enrollment counts per course.
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const counts = await CourseEnrollment.aggregate([
    { $group: { _id: '$course', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
  ]);
  const map = {}; counts.forEach((c) => { map[String(c._id)] = c; });
  items.forEach((c) => { const m = map[String(c._id)] || {}; c.enrolledCount = m.enrolled || 0; c.completedCount = m.completed || 0; });
  res.json({ items, total: items.length });
});

const createCourse = asyncHandler(async (req, res) => {
  const Course = req.tenantConn.model('Course');
  if (!req.body.title) return res.status(400).json({ message: 'A title is required.' });
  const doc = await Course.create({ ...req.body, createdBy: req.auth.userId });
  res.status(201).json(doc);
});
const updateCourse = asyncHandler(async (req, res) => {
  const Course = req.tenantConn.model('Course');
  const body = { ...req.body }; delete body.createdBy;
  const doc = await Course.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Course not found' });
  res.json(doc);
});
const deleteCourse = asyncHandler(async (req, res) => {
  const Course = req.tenantConn.model('Course');
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const inUse = await CourseEnrollment.countDocuments({ course: req.params.id });
  if (inUse > 0 && req.query.hard !== 'true') {
    await Course.findByIdAndUpdate(req.params.id, { active: false });
    return res.json({ message: `Course has ${inUse} enrollment(s); it was archived (deactivated) instead of deleted.` });
  }
  const doc = await Course.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Course not found' });
  res.json({ message: 'Course deleted' });
});

/* ============================ ENROLLMENTS ============================ */
// GET /learning/enrollments?course=&employee=&status=&mine=true
const listEnrollments = asyncHandler(async (req, res) => {
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const filter = {};
  if (req.query.course) filter.course = req.query.course;
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.mine === 'true') { const me = await actor(req); if (me.employee) filter.employee = me.employee; else return res.json({ items: [], total: 0 }); }
  const items = await CourseEnrollment.find(filter)
    .populate('employee', 'firstName lastName staffId employment.department')
    .populate('course', 'title category deliveryMode durationHours validForMonths')
    .sort({ enrolledDate: -1 }).lean();
  res.json({ items, total: items.length });
});

// POST /learning/enrollments  { course, employee | employees:[], startDate }
const enrol = asyncHandler(async (req, res) => {
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const Course = req.tenantConn.model('Course');
  const course = await Course.findById(req.body.course).lean();
  if (!course) return res.status(400).json({ message: 'Course not found.' });

  const employees = Array.isArray(req.body.employees) && req.body.employees.length ? req.body.employees : [req.body.employee];
  if (!employees[0]) return res.status(400).json({ message: 'Select at least one employee.' });

  const created = [];
  for (const empId of employees) {
    const exists = await CourseEnrollment.findOne({ course: course._id, employee: empId, status: { $in: ['enrolled', 'in_progress'] } });
    if (exists) continue;      // don't double-enrol into an active attempt
    created.push(await CourseEnrollment.create({
      course: course._id, employee: empId, status: 'enrolled',
      startDate: req.body.startDate || null, cost: course.cost || 0,
      courseTitle: course.title, category: course.category, enrolledBy: req.auth.userId,
    }));
  }
  res.status(201).json({ created: created.length, items: created });
});

// PUT /learning/enrollments/:id  — progress/complete; completing computes expiry.
const updateEnrollment = asyncHandler(async (req, res) => {
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const Course = req.tenantConn.model('Course');
  const doc = await CourseEnrollment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Enrollment not found' });

  const b = req.body;
  ['status', 'startDate', 'completionDate', 'score', 'result', 'cost', 'notes'].forEach((k) => { if (b[k] !== undefined) doc[k] = b[k]; });

  if (b.status === 'completed') {
    doc.completionDate = doc.completionDate || b.completionDate || new Date();
    const course = await Course.findById(doc.course).lean();
    if (course?.validForMonths) doc.expiryDate = addMonths(doc.completionDate, course.validForMonths);
    if (course?.passMark && doc.score != null) doc.result = Number(doc.score) >= Number(course.passMark) ? 'pass' : 'fail';
  }
  await doc.save();
  res.json(doc);
});
const deleteEnrollment = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('CourseEnrollment').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Enrollment not found' });
  res.json({ message: 'Enrollment removed' });
});

// POST /learning/enrollments/:id/certificate (multipart "file")
const uploadCertificate = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field "file").' });
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const doc = await CourseEnrollment.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Enrollment not found' });
  const folder = `nexusora_wf/${req.tenant.subdomain}/certificates`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'certificate', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'certificate';
  const result = await uploadBuffer(req.file.buffer, { folder, publicId: `${base}_${Date.now().toString(36)}${ext}` });
  doc.certificate = { name: req.file.originalname, url: result.secure_url, publicId: result.public_id, format: result.format || ext.replace('.', ''), bytes: result.bytes, uploadedAt: new Date() };
  await doc.save();
  res.json(doc);
});

/* ============================ COMPETENCIES ============================ */
const listCompetencies = asyncHandler(async (req, res) => {
  const Competency = req.tenantConn.model('Competency');
  const filter = {};
  if (req.query.category && req.query.category !== 'all') filter.category = req.query.category;
  if (req.query.active === 'true') filter.active = true;
  const items = await Competency.find(filter).populate('requirements.position', 'title code').sort({ category: 1, name: 1 }).lean();
  res.json({ items, total: items.length });
});
const createCompetency = asyncHandler(async (req, res) => {
  const Competency = req.tenantConn.model('Competency');
  if (!req.body.name) return res.status(400).json({ message: 'A name is required.' });
  const doc = await Competency.create({ ...req.body, createdBy: req.auth.userId });
  res.status(201).json(doc);
});
const updateCompetency = asyncHandler(async (req, res) => {
  const Competency = req.tenantConn.model('Competency');
  const body = { ...req.body }; delete body.createdBy;
  const doc = await Competency.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Competency not found' });
  res.json(doc);
});
const deleteCompetency = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('Competency').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Competency not found' });
  await req.tenantConn.model('CompetencyRating').deleteMany({ competency: req.params.id });
  res.json({ message: 'Competency deleted' });
});

// GET /learning/competencies/employee/:employeeId — this employee's ratings vs requirements.
const employeeCompetencies = asyncHandler(async (req, res) => {
  const Competency = req.tenantConn.model('Competency');
  const CompetencyRating = req.tenantConn.model('CompetencyRating');
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.params.employeeId).lean();
  if (!emp) return res.status(404).json({ message: 'Employee not found' });

  const comps = await Competency.find({ active: true }).lean();
  const ratings = await CompetencyRating.find({ employee: emp._id }).lean();
  const rmap = {}; ratings.forEach((r) => { rmap[String(r.competency)] = r; });

  const rows = comps.map((c) => {
    const r = rmap[String(c._id)];
    const required = requiredLevelFor(c, emp);
    const final = r?.finalRating ?? null;
    return {
      competency: c._id, name: c.name, category: c.category, scaleMax: c.scaleMax,
      required, selfRating: r?.selfRating ?? null, managerRating: r?.managerRating ?? null,
      finalRating: final, gap: final != null ? Math.max(0, required - final) : null,
      assessedDate: r?.assessedDate || null, notes: r?.notes || '',
    };
  });
  const assessed = rows.filter((x) => x.finalRating != null);
  const gaps = assessed.filter((x) => x.gap > 0);
  res.json({
    employee: { id: emp._id, name: fullName(emp), staffId: emp.staffId, grade: emp.employment?.grade || '', department: emp.employment?.department || '' },
    rows,
    summary: { total: rows.length, assessed: assessed.length, gaps: gaps.length, avgGap: gaps.length ? +(gaps.reduce((s, x) => s + x.gap, 0) / gaps.length).toFixed(1) : 0 },
  });
});

// POST /learning/competencies/assess  { employee, ratings:[{competency, selfRating, managerRating, finalRating, notes}], cycle }
const assess = asyncHandler(async (req, res) => {
  const Competency = req.tenantConn.model('Competency');
  const CompetencyRating = req.tenantConn.model('CompetencyRating');
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.body.employee).lean();
  if (!emp) return res.status(400).json({ message: 'Employee not found.' });
  const ratings = Array.isArray(req.body.ratings) ? req.body.ratings : [];
  const out = [];
  for (const r of ratings) {
    const comp = await Competency.findById(r.competency).lean();
    if (!comp) continue;
    const required = requiredLevelFor(comp, emp);
    const finalRating = r.finalRating ?? r.managerRating ?? r.selfRating ?? null;
    const gap = finalRating != null ? Math.max(0, required - finalRating) : null;
    const doc = await CompetencyRating.findOneAndUpdate(
      { employee: emp._id, competency: comp._id },
      { $set: { selfRating: r.selfRating ?? null, managerRating: r.managerRating ?? null, finalRating, requiredLevel: required, gap, assessedDate: new Date(), assessedBy: req.auth.userId, cycle: req.body.cycle || '', notes: r.notes || '' } },
      { new: true, upsert: true },
    );
    out.push(doc);
  }
  res.json({ updated: out.length, items: out });
});

// GET /learning/competencies/gaps — organisation-wide gap analysis (by competency).
const gapAnalysis = asyncHandler(async (req, res) => {
  const CompetencyRating = req.tenantConn.model('CompetencyRating');
  const Competency = req.tenantConn.model('Competency');
  const comps = await Competency.find({ active: true }).lean();
  const cmap = {}; comps.forEach((c) => { cmap[String(c._id)] = c; });
  const ratings = await CompetencyRating.find({ finalRating: { $ne: null } }).lean();

  const agg = {};
  ratings.forEach((r) => {
    const id = String(r.competency); if (!cmap[id]) return;
    const a = agg[id] || (agg[id] = { competency: id, name: cmap[id].name, category: cmap[id].category, assessed: 0, sumFinal: 0, sumReq: 0, gapCount: 0, sumGap: 0 });
    a.assessed += 1; a.sumFinal += r.finalRating || 0; a.sumReq += r.requiredLevel || 0;
    if ((r.gap || 0) > 0) { a.gapCount += 1; a.sumGap += r.gap; }
  });
  const rows = Object.values(agg).map((a) => ({
    competency: a.competency, name: a.name, category: a.category, assessed: a.assessed,
    avgLevel: +(a.sumFinal / a.assessed).toFixed(1), avgRequired: +(a.sumReq / a.assessed).toFixed(1),
    withGap: a.gapCount, gapPct: Math.round((a.gapCount / a.assessed) * 100), avgGap: a.gapCount ? +(a.sumGap / a.gapCount).toFixed(1) : 0,
  })).sort((x, y) => y.gapPct - x.gapPct);
  res.json({ items: rows, total: rows.length });
});

/* ============================ TRAINING PLANS ============================ */
const listPlans = asyncHandler(async (req, res) => {
  const TrainingPlan = req.tenantConn.model('TrainingPlan');
  const filter = {};
  if (req.query.year) filter.year = Number(req.query.year);
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  const items = await TrainingPlan.find(filter).sort({ year: -1, createdAt: -1 }).lean();
  items.forEach((p) => {
    p.itemCount = (p.items || []).length;
    p.plannedCost = (p.items || []).reduce((s, i) => s + (i.estimatedCost || 0), 0);
    p.actualCost = (p.items || []).reduce((s, i) => s + (i.actualCost || 0), 0);
    p.completedItems = (p.items || []).filter((i) => i.status === 'completed').length;
  });
  res.json({ items, total: items.length });
});
const getPlan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('TrainingPlan').findById(req.params.id)
    .populate('items.employee', 'firstName lastName staffId').populate('items.course', 'title').populate('items.competency', 'name');
  if (!doc) return res.status(404).json({ message: 'Plan not found' });
  res.json(doc);
});
const createPlan = asyncHandler(async (req, res) => {
  const TrainingPlan = req.tenantConn.model('TrainingPlan');
  if (!req.body.year) return res.status(400).json({ message: 'A year is required.' });
  const doc = await TrainingPlan.create({ ...req.body, createdBy: req.auth.userId });
  res.status(201).json(doc);
});
const updatePlan = asyncHandler(async (req, res) => {
  const TrainingPlan = req.tenantConn.model('TrainingPlan');
  const body = { ...req.body }; delete body.createdBy;
  if (body.status === 'approved') { body.approvedBy = req.auth.userId; body.approvedDate = new Date(); }
  const doc = await TrainingPlan.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Plan not found' });
  res.json(doc);
});
const deletePlan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('TrainingPlan').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Plan not found' });
  res.json({ message: 'Plan deleted' });
});

/* ============================ CERTIFICATIONS ============================ */
const listCertifications = asyncHandler(async (req, res) => {
  const Certification = req.tenantConn.model('Certification');
  const filter = {};
  if (req.query.employee) filter.employee = req.query.employee;
  if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
  const docs = await Certification.find(filter).populate('employee', 'firstName lastName staffId employment.department').sort({ expiryDate: 1 });
  const soonDays = Math.min(365, Math.max(7, parseInt(req.query.soonDays, 10) || 60));
  let items = docs.map((d) => ({ ...d.toObject(), status: d.computedStatus(soonDays) }));
  if (req.query.status && req.query.status !== 'all') items = items.filter((i) => i.status === req.query.status);
  res.json({ items, total: items.length, soonDays });
});
const createCertification = asyncHandler(async (req, res) => {
  const Certification = req.tenantConn.model('Certification');
  if (!req.body.employee || !req.body.name) return res.status(400).json({ message: 'Employee and name are required.' });
  const doc = await Certification.create({ ...req.body });
  res.status(201).json(doc);
});
const updateCertification = asyncHandler(async (req, res) => {
  const Certification = req.tenantConn.model('Certification');
  const body = { ...req.body };
  if (body.verified === true && !body.verifiedDate) { body.verifiedBy = req.auth.userId; body.verifiedDate = new Date(); }
  const doc = await Certification.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Certification not found' });
  res.json(doc);
});
const deleteCertification = asyncHandler(async (req, res) => {
  const Certification = req.tenantConn.model('Certification');
  const doc = await Certification.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Certification not found' });
  if (doc.file?.publicId) { try { await cloudinary.uploader.destroy(doc.file.publicId, { resource_type: 'raw' }); } catch { /* */ } try { await cloudinary.uploader.destroy(doc.file.publicId, { resource_type: 'image' }); } catch { /* */ } }
  await doc.deleteOne();
  res.json({ message: 'Certification deleted' });
});
const uploadCertFile = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field "file").' });
  const Certification = req.tenantConn.model('Certification');
  const doc = await Certification.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Certification not found' });
  const folder = `nexusora_wf/${req.tenant.subdomain}/certifications`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'cert', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'cert';
  const result = await uploadBuffer(req.file.buffer, { folder, publicId: `${base}_${Date.now().toString(36)}${ext}` });
  doc.file = { name: req.file.originalname, url: result.secure_url, publicId: result.public_id, format: result.format || ext.replace('.', ''), bytes: result.bytes, uploadedAt: new Date() };
  await doc.save();
  res.json(doc);
});

/* ============================ OVERVIEW ============================ */
const overview = asyncHandler(async (req, res) => {
  const Course = req.tenantConn.model('Course');
  const CourseEnrollment = req.tenantConn.model('CourseEnrollment');
  const Certification = req.tenantConn.model('Certification');
  const CompetencyRating = req.tenantConn.model('CompetencyRating');
  const Employee = req.tenantConn.model('Employee');

  const now = new Date();
  const soon = new Date(); soon.setDate(soon.getDate() + 60);

  const [activeCourses, totalEnrol, completedEnrol, mandatoryCourses] = await Promise.all([
    Course.countDocuments({ active: true }),
    CourseEnrollment.countDocuments({}),
    CourseEnrollment.countDocuments({ status: 'completed' }),
    Course.find({ mandatory: true, active: true }, '_id').lean(),
  ]);

  // Mandatory completion rate = completed mandatory enrollments / active-staff × mandatory-courses (capped).
  const activeStaff = await Employee.countDocuments({ 'employment.confirmationStatus': { $ne: 'exited' } });
  const mandatoryIds = mandatoryCourses.map((c) => c._id);
  const mandatoryCompleted = mandatoryIds.length ? await CourseEnrollment.countDocuments({ course: { $in: mandatoryIds }, status: 'completed', $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }] }) : 0;
  const mandatoryTarget = mandatoryIds.length * Math.max(1, activeStaff);
  const mandatoryPct = mandatoryTarget ? Math.round((mandatoryCompleted / mandatoryTarget) * 100) : 0;

  const [expiringCerts, expiredCerts, refreshersDue, gapRatings] = await Promise.all([
    Certification.countDocuments({ expiryDate: { $ne: null, $gt: now, $lte: soon } }),
    Certification.countDocuments({ expiryDate: { $ne: null, $lte: now } }),
    CourseEnrollment.countDocuments({ status: 'completed', expiryDate: { $ne: null, $lte: soon } }),
    CompetencyRating.countDocuments({ gap: { $gt: 0 } }),
  ]);

  res.json({
    courses: { active: activeCourses, mandatory: mandatoryIds.length },
    enrollments: { total: totalEnrol, completed: completedEnrol, completionPct: totalEnrol ? Math.round((completedEnrol / totalEnrol) * 100) : 0 },
    mandatory: { completedValid: mandatoryCompleted, target: mandatoryTarget, pct: Math.min(100, mandatoryPct) },
    certifications: { expiringSoon: expiringCerts, expired: expiredCerts },
    refreshersDue,
    competencyGaps: gapRatings,
  });
});

module.exports = {
  listCourses, createCourse, updateCourse, deleteCourse,
  listEnrollments, enrol, updateEnrollment, deleteEnrollment, uploadCertificate,
  listCompetencies, createCompetency, updateCompetency, deleteCompetency, employeeCompetencies, assess, gapAnalysis,
  listPlans, getPlan, createPlan, updatePlan, deletePlan,
  listCertifications, createCertification, updateCertification, deleteCertification, uploadCertFile,
  overview,
};
