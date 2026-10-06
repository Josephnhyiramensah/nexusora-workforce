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
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + Number(n || 0)); return d; }

const PHASES = ['pre_boarding', 'first_day', 'first_week', 'first_month', 'probation', 'other'];

// Phased default program, with due dates relative to the start date (negative = before day 1).
const DEFAULT_TASKS = [
  { title: 'Send welcome pack & confirm start date', category: 'hr', phase: 'pre_boarding', owner: 'HR', dueOffsetDays: -3 },
  { title: 'Prepare & sign employment contract', category: 'hr', phase: 'pre_boarding', owner: 'HR', dueOffsetDays: -1 },
  { title: 'Set up email & system accounts', category: 'it', phase: 'pre_boarding', owner: 'IT', dueOffsetDays: -1 },
  { title: 'Workspace, tools & ID card ready', category: 'facilities', phase: 'first_day', owner: 'Facilities', dueOffsetDays: 0 },
  { title: 'Team introduction & role orientation', category: 'manager', phase: 'first_day', owner: 'Line Manager', dueOffsetDays: 0 },
  { title: 'Collect statutory IDs (social security, tax, national ID)', category: 'hr', phase: 'first_week', owner: 'HR', dueOffsetDays: 5 },
  { title: 'Health, safety & policy briefing', category: 'hr', phase: 'first_week', owner: 'HR', dueOffsetDays: 5 },
  { title: 'Capture bank / mobile-money details for payroll', category: 'finance', phase: 'first_week', owner: 'Finance', dueOffsetDays: 5 },
  { title: 'Role objectives & 30-day plan agreed', category: 'manager', phase: 'first_month', owner: 'Line Manager', dueOffsetDays: 30 },
  { title: 'Probation review & confirmation decision', category: 'hr', phase: 'probation', owner: 'HR', dueOffsetDays: null },
];
const DEFAULT_DOCS = [
  { name: 'Signed employment contract', required: true },
  { name: 'National ID / passport', required: true },
  { name: 'Passport photograph', required: true },
  { name: 'Academic & professional certificates', required: false },
  { name: 'Bank / mobile-money details', required: true },
];

function progressOf(o) {
  const now = new Date();
  const tasks = (o.tasks || []).filter((t) => t.status !== 'na');
  const done = tasks.filter((t) => t.status === 'done').length;
  const overdue = (o.tasks || []).filter((t) => t.status === 'pending' && t.dueDate && new Date(t.dueDate) < now).length;
  const docs = o.documents || [];
  const docsReceived = docs.filter((d) => d.received).length;
  const phases = {};
  (o.tasks || []).forEach((t) => { const p = t.phase || 'other'; phases[p] = phases[p] || { total: 0, done: 0 }; if (t.status !== 'na') { phases[p].total += 1; if (t.status === 'done') phases[p].done += 1; } });
  return { tasksDone: done, tasksTotal: tasks.length, docsReceived, docsTotal: docs.length, overdue, phases, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/* ------------------------------ onboarding: list / create ------------------------------ */
const list = asyncHandler(async (req, res) => {
  const Onboarding = req.tenantConn.model('Onboarding');
  req.tenantConn.model('Employee');
  const filter = {}; if (req.query.status) filter.status = req.query.status;
  const rows = await Onboarding.find(filter).populate('employee', 'firstName lastName staffId employment.jobTitle photo').sort({ createdAt: -1 }).lean();
  res.json({ items: rows.map((o) => ({ ...o, progress: progressOf(o) })), total: rows.length });
});

// POST /onboarding { employee, startDate?, template?, buddy?, seedDefaults? }
const create = asyncHandler(async (req, res) => {
  const Onboarding = req.tenantConn.model('Onboarding');
  const Employee = req.tenantConn.model('Employee');
  const { employee, startDate, application, template, buddy, seedDefaults = true } = req.body;
  if (!employee) return res.status(400).json({ message: 'An employee is required.' });
  const emp = await Employee.findById(employee).select('firstName lastName employment.startDate employment.probationEndDate');
  if (!emp) return res.status(404).json({ message: 'Employee not found.' });
  if (await Onboarding.findOne({ employee })) return res.status(409).json({ message: 'This employee already has an onboarding record.' });

  const start = startDate || emp.employment?.startDate || new Date();
  let tasks = []; let documents = []; let program = '';

  if (template) {
    const tpl = await req.tenantConn.model('OnboardingTemplate').findById(template);
    if (!tpl) return res.status(404).json({ message: 'Template not found.' });
    program = tpl.name;
    tasks = (tpl.tasks || []).map((t, i) => ({ title: t.title, description: t.description || '', category: t.category || 'hr', phase: t.phase || 'first_week', owner: t.owner || '', dueDate: t.dueOffsetDays != null ? addDays(start, t.dueOffsetDays) : null, order: i }));
    documents = (tpl.documents || []).map((d, i) => ({ name: d.name, required: !!d.required, order: i }));
  } else if (seedDefaults) {
    tasks = DEFAULT_TASKS.map((t, i) => ({ title: t.title, category: t.category, phase: t.phase, owner: t.owner, dueDate: t.dueOffsetDays != null ? addDays(start, t.dueOffsetDays) : (t.phase === 'probation' ? (emp.employment?.probationEndDate || null) : null), order: i }));
    documents = DEFAULT_DOCS.map((d, i) => ({ ...d, order: i }));
  }

  const o = await Onboarding.create({
    employee, application: application || null, template: template || null, program, buddy: buddy || null,
    startDate: start, status: 'in_progress', tasks, documents,
    probation: { endDate: emp.employment?.probationEndDate || null, review: 'pending' }, createdBy: req.auth.userId,
  });
  res.status(201).json(o);
});

const getOne = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id)
    .populate('employee', 'firstName lastName staffId employment.jobTitle photo email')
    .populate('buddy', 'firstName lastName')
    .populate('tasks.assignee', 'firstName lastName').lean();
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  o.progress = progressOf(o);
  res.json(o);
});

const update = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const { startDate, note, status, probationEndDate, buddy } = req.body;
  if (startDate !== undefined) o.startDate = startDate || null;
  if (note !== undefined) o.note = note;
  if (status !== undefined) o.status = status;
  if (buddy !== undefined) o.buddy = buddy || null;
  if (probationEndDate !== undefined) o.probation.endDate = probationEndDate || null;
  await o.save();
  res.json(o);
});

const remove = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findByIdAndDelete(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  res.json({ message: 'Onboarding removed' });
});

/* ------------------------------ tasks ------------------------------ */
const addTask = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const { title, description, category, phase, owner, dueDate, assignee } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ message: 'Task title is required.' });
  o.tasks.push({ title: title.trim(), description: description || '', category: category || 'other', phase: PHASES.includes(phase) ? phase : 'other', owner: owner || '', dueDate: dueDate || null, assignee: assignee || null, order: o.tasks.length });
  await o.save();
  res.status(201).json(o);
});
const updateTask = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const t = o.tasks.id(req.params.tid);
  if (!t) return res.status(404).json({ message: 'Task not found' });
  ['title', 'description', 'category', 'phase', 'owner', 'dueDate'].forEach((k) => { if (req.body[k] !== undefined) t[k] = req.body[k]; });
  if (req.body.assignee !== undefined) t.assignee = req.body.assignee || null;
  if (req.body.status !== undefined) { t.status = req.body.status; t.completedAt = req.body.status === 'done' ? new Date() : null; t.completedBy = req.body.status === 'done' ? req.auth.userId : null; }
  await o.save();
  res.json(o);
});
const deleteTask = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const t = o.tasks.id(req.params.tid); if (!t) return res.status(404).json({ message: 'Task not found' });
  t.deleteOne(); await o.save(); res.json(o);
});

/* ------------------------------ documents ------------------------------ */
const addDocument = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const { name, required } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Document name is required.' });
  o.documents.push({ name: name.trim(), required: !!required, order: o.documents.length });
  await o.save(); res.status(201).json(o);
});
const updateDocument = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const d = o.documents.id(req.params.did); if (!d) return res.status(404).json({ message: 'Document not found' });
  if (req.body.received !== undefined) d.received = !!req.body.received;
  if (req.body.note !== undefined) d.note = req.body.note;
  if (req.body.required !== undefined) d.required = !!req.body.required;
  await o.save(); res.json(o);
});
const deleteDocument = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const d = o.documents.id(req.params.did); if (!d) return res.status(404).json({ message: 'Document not found' });
  d.deleteOne(); await o.save(); res.json(o);
});
const uploadDocumentFile = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const d = o.documents.id(req.params.did); if (!d) return res.status(404).json({ message: 'Document not found' });
  const folder = `nexusora_wf/${req.tenant.subdomain}/onboarding`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'doc', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'doc';
  const result = await uploadBuffer(req.file.buffer, { folder, resourceType: 'auto', publicId: `${base}_${Date.now().toString(36)}${ext}` });
  d.file = { name: req.file.originalname, url: result.secure_url, publicId: result.public_id, format: result.format || ext.replace('.', ''), bytes: result.bytes, uploadedAt: new Date() };
  d.received = true; await o.save(); res.json(o);
});

/* ------------------------------ probation / complete ------------------------------ */
const setProbation = asyncHandler(async (req, res) => {
  const Onboarding = req.tenantConn.model('Onboarding');
  const o = await Onboarding.findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const { review, note, endDate } = req.body;
  if (review !== undefined) o.probation.review = review;
  if (note !== undefined) o.probation.note = note;
  if (endDate !== undefined) o.probation.endDate = endDate || null;
  o.probation.decidedAt = new Date(); o.probation.decidedBy = req.auth.userId;
  await o.save();
  if (review === 'passed') await req.tenantConn.model('Employee').findByIdAndUpdate(o.employee, { 'employment.confirmationStatus': 'confirmed' });
  res.json(o);
});
const complete = asyncHandler(async (req, res) => {
  const o = await req.tenantConn.model('Onboarding').findById(req.params.id);
  if (!o) return res.status(404).json({ message: 'Onboarding not found' });
  const pendingTasks = (o.tasks || []).filter((t) => t.status === 'pending').length;
  const missingReqDocs = (o.documents || []).filter((d) => d.required && !d.received).length;
  if (!req.body.force && (pendingTasks > 0 || missingReqDocs > 0)) {
    const bits = [];
    if (pendingTasks) bits.push(`${pendingTasks} task${pendingTasks === 1 ? '' : 's'} still pending`);
    if (missingReqDocs) bits.push(`${missingReqDocs} required document${missingReqDocs === 1 ? '' : 's'} not received`);
    return res.status(409).json({ message: `Can’t complete yet — ${bits.join(' and ')}. Tick them off (or mark tasks “N/A”) first.`, pendingTasks, missingReqDocs });
  }
  o.status = 'completed'; o.completedAt = new Date(); await o.save(); res.json(o);
});

/* ------------------------------ templates (programs) ------------------------------ */
const listTemplates = asyncHandler(async (req, res) => {
  const items = await req.tenantConn.model('OnboardingTemplate').find().sort({ createdAt: -1 }).lean();
  res.json({ items: items.map((t) => ({ ...t, taskCount: (t.tasks || []).length, docCount: (t.documents || []).length })), total: items.length });
});
const createTemplate = asyncHandler(async (req, res) => {
  if (!req.body.name) return res.status(400).json({ message: 'A template name is required.' });
  const t = await req.tenantConn.model('OnboardingTemplate').create({ ...req.body, createdBy: req.auth.userId });
  res.status(201).json(t);
});
const getTemplate = asyncHandler(async (req, res) => {
  const t = await req.tenantConn.model('OnboardingTemplate').findById(req.params.id);
  if (!t) return res.status(404).json({ message: 'Template not found' });
  res.json(t);
});
const updateTemplate = asyncHandler(async (req, res) => {
  const body = { ...req.body }; delete body.createdBy;
  const t = await req.tenantConn.model('OnboardingTemplate').findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!t) return res.status(404).json({ message: 'Template not found' });
  res.json(t);
});
const deleteTemplate = asyncHandler(async (req, res) => {
  const t = await req.tenantConn.model('OnboardingTemplate').findByIdAndDelete(req.params.id);
  if (!t) return res.status(404).json({ message: 'Template not found' });
  res.json({ message: 'Template deleted' });
});

module.exports = {
  list, create, getOne, update, remove,
  addTask, updateTask, deleteTask,
  addDocument, updateDocument, deleteDocument, uploadDocumentFile,
  setProbation, complete,
  listTemplates, createTemplate, getTemplate, updateTemplate, deleteTemplate,
};