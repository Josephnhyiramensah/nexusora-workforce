const asyncHandler = require('express-async-handler');
const path = require('path');
const cloudinary = require('../../config/cloudinary');

function uploadBuffer(buffer, { folder, resourceType = 'auto', publicId }) {
  return new Promise((resolve, reject) => {
    const opts = { folder, resource_type: resourceType };
    if (publicId) opts.public_id = publicId;
    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });
}

const STAGES = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];

/* ============================ VACANCIES ============================ */

// GET /recruitment/vacancies?status=open&q=...
const listVacancies = asyncHandler(async (req, res) => {
  const Vacancy = req.tenantConn.model('Vacancy');
  const Application = req.tenantConn.model('Application');
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) filter.$or = [{ title: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }];

  const vacancies = await Vacancy.find(filter)
    .populate('department', 'name code')
    .populate('position', 'title code')
    .populate('hiringManager', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  // Attach applicant counts so the list can show a pipeline summary.
  const counts = await Application.aggregate([
    { $group: { _id: { vacancy: '$vacancy', stage: '$stage' }, n: { $sum: 1 } } },
  ]);
  const byVac = {};
  counts.forEach((c) => {
    const v = String(c._id.vacancy);
    byVac[v] = byVac[v] || { total: 0 };
    byVac[v][c._id.stage] = c.n;
    byVac[v].total += c.n;
  });
  const items = vacancies.map((v) => ({ ...v, applicants: byVac[String(v._id)] || { total: 0 } }));
  res.json({ items, total: items.length });
});

// POST /recruitment/vacancies
const createVacancy = asyncHandler(async (req, res) => {
  const Vacancy = req.tenantConn.model('Vacancy');
  const body = { ...req.body, createdBy: req.auth.userId };
  if (!body.code) {
    const year = new Date().getFullYear();
    const n = (await Vacancy.countDocuments({})) + 1;
    body.code = `VAC-${year}-${String(n).padStart(4, '0')}`;
  }
  if (body.status === 'open' && !body.openDate) body.openDate = new Date();
  const v = await Vacancy.create(body);
  res.status(201).json(v);
});

// GET /recruitment/vacancies/:id — with per-stage counts.
const getVacancy = asyncHandler(async (req, res) => {
  const Vacancy = req.tenantConn.model('Vacancy');
  const Application = req.tenantConn.model('Application');
  const v = await Vacancy.findById(req.params.id)
    .populate('department', 'name code')
    .populate('position', 'title code')
    .populate('hiringManager', 'firstName lastName');
  if (!v) return res.status(404).json({ message: 'Vacancy not found' });
  const agg = await Application.aggregate([
    { $match: { vacancy: v._id } },
    { $group: { _id: '$stage', n: { $sum: 1 } } },
  ]);
  const stageCounts = {}; agg.forEach((a) => { stageCounts[a._id] = a.n; });
  res.json({ vacancy: v, stageCounts });
});

// PUT /recruitment/vacancies/:id
const updateVacancy = asyncHandler(async (req, res) => {
  const Vacancy = req.tenantConn.model('Vacancy');
  const body = { ...req.body };
  delete body.createdBy;
  if (body.status === 'open' && !body.openDate) body.openDate = new Date();
  if (body.status === 'closed' && !body.closeDate) body.closeDate = new Date();
  const v = await Vacancy.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!v) return res.status(404).json({ message: 'Vacancy not found' });
  res.json(v);
});

// DELETE /recruitment/vacancies/:id — refuses if it still has applications.
const deleteVacancy = asyncHandler(async (req, res) => {
  const Application = req.tenantConn.model('Application');
  const n = await Application.countDocuments({ vacancy: req.params.id });
  if (n > 0) return res.status(409).json({ message: `This vacancy has ${n} applicant(s). Close it instead of deleting.` });
  const v = await req.tenantConn.model('Vacancy').findByIdAndDelete(req.params.id);
  if (!v) return res.status(404).json({ message: 'Vacancy not found' });
  res.json({ message: 'Vacancy deleted' });
});

/* ========================== APPLICATIONS ========================== */

// GET /recruitment/applications?vacancy=<id>&stage=shortlisted
const listApplications = asyncHandler(async (req, res) => {
  const Application = req.tenantConn.model('Application');
  const { vacancy, stage, q } = req.query;
  const filter = {};
  if (vacancy) filter.vacancy = vacancy;
  if (stage) filter.stage = stage;
  if (q) filter.$or = [{ firstName: new RegExp(q, 'i') }, { lastName: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
  const items = await Application.find(filter)
    .populate('vacancy', 'title code')
    .sort({ createdAt: -1 });
  res.json({ items, total: items.length });
});

// POST /recruitment/applications  { vacancy, firstName, ... }
const createApplication = asyncHandler(async (req, res) => {
  const Application = req.tenantConn.model('Application');
  if (!req.body.vacancy) return res.status(400).json({ message: 'A vacancy is required.' });
  if (!req.body.firstName) return res.status(400).json({ message: 'Candidate first name is required.' });
  const body = { ...req.body, stage: req.body.stage || 'applied' };
  body.timeline = [{ stage: body.stage, note: 'Application received', by: req.auth.userId, at: new Date() }];
  const a = await Application.create(body);
  res.status(201).json(a);
});

// GET /recruitment/applications/:id
const getApplication = asyncHandler(async (req, res) => {
  const a = await req.tenantConn.model('Application').findById(req.params.id)
    .populate('vacancy', 'title code department position grade employmentType workerClass')
    .populate('hiredEmployee', 'firstName lastName staffId');
  if (!a) return res.status(404).json({ message: 'Application not found' });
  res.json(a);
});

// PUT /recruitment/applications/:id — edit candidate details (not stage/offer/hire).
const updateApplication = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  ['stage', 'timeline', 'hiredEmployee', 'offer', 'interviews', 'notes'].forEach((k) => delete body[k]);
  const a = await req.tenantConn.model('Application').findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!a) return res.status(404).json({ message: 'Application not found' });
  res.json(a);
});

// DELETE /recruitment/applications/:id
const deleteApplication = asyncHandler(async (req, res) => {
  const a = await req.tenantConn.model('Application').findByIdAndDelete(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  res.json({ message: 'Application removed' });
});

// POST /recruitment/applications/:id/stage  { stage, note }
const moveStage = asyncHandler(async (req, res) => {
  const { stage, note } = req.body;
  if (!STAGES.includes(stage)) return res.status(400).json({ message: 'Unknown stage' });
  const a = await req.tenantConn.model('Application').findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  if (stage === 'hired') return res.status(400).json({ message: 'Use the Hire action to move a candidate to hired.' });
  a.stage = stage;
  if (stage === 'rejected' && note) a.rejectionReason = note;
  a.timeline.push({ stage, note: note || '', by: req.auth.userId, at: new Date() });
  await a.save();
  res.json(a);
});

// POST /recruitment/applications/:id/notes  { text }
const addNote = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Note text is required.' });
  const a = await req.tenantConn.model('Application').findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  a.notes.push({ text: text.trim(), by: req.auth.userId, at: new Date() });
  await a.save();
  res.json(a);
});

// POST /recruitment/applications/:id/interviews  { round, date, mode, panel, location, notes }
const addInterview = asyncHandler(async (req, res) => {
  const a = await req.tenantConn.model('Application').findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  const { round, date, mode, panel, location, notes, outcome } = req.body;
  a.interviews.push({
    round: round || 'Interview', date: date || null, mode: mode || 'in_person',
    panel: Array.isArray(panel) ? panel : (panel ? String(panel).split(',').map((s) => s.trim()).filter(Boolean) : []),
    location: location || '', notes: notes || '', outcome: outcome || 'pending', by: req.auth.userId, at: new Date(),
  });
  if (a.stage === 'shortlisted' || a.stage === 'screening' || a.stage === 'applied') {
    a.stage = 'interview';
    a.timeline.push({ stage: 'interview', note: 'Interview scheduled', by: req.auth.userId, at: new Date() });
  }
  await a.save();
  res.json(a);
});

// PUT /recruitment/applications/:id/interviews/:iid  { outcome, notes }
const updateInterview = asyncHandler(async (req, res) => {
  const a = await req.tenantConn.model('Application').findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  const iv = a.interviews.id(req.params.iid);
  if (!iv) return res.status(404).json({ message: 'Interview not found' });
  if (req.body.outcome !== undefined) iv.outcome = req.body.outcome;
  if (req.body.notes !== undefined) iv.notes = req.body.notes;
  await a.save();
  res.json(a);
});

// POST /recruitment/applications/:id/offer  { salary, currency, startDate, note, status }
const setOffer = asyncHandler(async (req, res) => {
  const a = await req.tenantConn.model('Application').findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  const { salary, currency, startDate, note, status } = req.body;
  a.offer = {
    ...(a.offer || {}),
    salary: salary != null ? Number(salary) : a.offer?.salary ?? null,
    currency: currency || a.offer?.currency || req.tenant.baseCurrency || '',
    startDate: startDate || a.offer?.startDate || null,
    note: note != null ? note : (a.offer?.note || ''),
    status: status || a.offer?.status || 'extended',
    extendedAt: a.offer?.extendedAt || new Date(),
  };
  if (a.stage !== 'offer' && a.stage !== 'hired') {
    a.stage = 'offer';
    a.timeline.push({ stage: 'offer', note: 'Offer extended', by: req.auth.userId, at: new Date() });
  }
  await a.save();
  res.json(a);
});

// POST /recruitment/applications/:id/hire  { staffId, positionId?, startDate?, salary? }
// Creates a real Employee from the candidate and links it back to the application.
const hire = asyncHandler(async (req, res) => {
  const Application = req.tenantConn.model('Application');
  const Employee = req.tenantConn.model('Employee');
  const Vacancy = req.tenantConn.model('Vacancy');

  const a = await Application.findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });
  if (a.hiredEmployee) return res.status(409).json({ message: 'This candidate has already been hired.' });

  const { staffId } = req.body;
  if (!staffId || !String(staffId).trim()) return res.status(400).json({ message: 'A staff ID is required to hire.' });
  if (await Employee.findOne({ staffId: String(staffId).trim() })) {
    return res.status(409).json({ message: `Staff ID "${staffId}" is already in use.` });
  }

  const v = await Vacancy.findById(a.vacancy);
  const startDate = req.body.startDate || a.offer?.startDate || new Date();
  const salary = req.body.salary != null ? Number(req.body.salary) : (a.offer?.salary ?? null);

  const empBody = {
    staffId: String(staffId).trim(),
    firstName: a.firstName,
    lastName: a.lastName || '',
    email: a.email || undefined,
    phone: a.phone || undefined,
    gender: a.gender || undefined,
    status: 'active',
    employment: {
      jobTitle: v?.title || a.currentTitle || '',
      positionId: req.body.positionId || v?.position || undefined,
      departmentId: v?.department || undefined,
      grade: v?.grade || undefined,
      workerClass: v?.workerClass || undefined,
      employmentType: v?.employmentType || undefined,
      startDate,
      confirmationStatus: 'probation',
    },
  };
  if (salary != null) {
    empBody.compensation = { payBasis: 'salary', baseSalary: salary, currency: a.offer?.currency || req.tenant.baseCurrency };
  }

  const emp = await Employee.create(empBody);

  a.stage = 'hired';
  a.hiredEmployee = emp._id;
  if (a.offer) a.offer.status = 'accepted';
  a.timeline.push({ stage: 'hired', note: `Hired as ${emp.staffId}`, by: req.auth.userId, at: new Date() });
  await a.save();

  // If the vacancy's openings are all filled, mark it filled.
  if (v) {
    const hiredCount = await Application.countDocuments({ vacancy: v._id, stage: 'hired' });
    if (hiredCount >= (v.openings || 1) && v.status !== 'filled') {
      v.status = 'filled'; v.closeDate = v.closeDate || new Date(); await v.save();
    }
  }

  res.status(201).json({ message: 'Candidate hired and added to employee records.', application: a, employee: { id: emp._id, staffId: emp.staffId, name: `${emp.firstName} ${emp.lastName}`.trim() } });
});

// POST /recruitment/applications/:id/resume  (multipart field "file")
const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  const a = await req.tenantConn.model('Application').findById(req.params.id);
  if (!a) return res.status(404).json({ message: 'Application not found' });

  const folder = `nexusora_wf/${req.tenant.subdomain}/resumes`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'resume', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'resume';
  const publicId = `${base}_${Date.now().toString(36)}${ext}`;
  const result = await uploadBuffer(req.file.buffer, { folder, resourceType: 'auto', publicId });

  a.resume = {
    name: req.file.originalname, url: result.secure_url, publicId: result.public_id,
    format: result.format || ext.replace('.', ''), bytes: result.bytes, uploadedAt: new Date(),
  };
  await a.save();
  res.json(a);
});

module.exports = {
  listVacancies, createVacancy, getVacancy, updateVacancy, deleteVacancy,
  listApplications, createApplication, getApplication, updateApplication, deleteApplication,
  moveStage, addNote, addInterview, updateInterview, setOffer, hire, uploadResume,
};