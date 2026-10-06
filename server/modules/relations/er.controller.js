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
const fullName = (e) => [e?.firstName, e?.lastName].filter(Boolean).join(' ') || '—';
async function actor(req) {
  try {
    const u = await req.tenantConn.model('User').findById(req.auth.userId).select('name role employee').lean();
    return { userId: req.auth.userId, name: u?.name || '', role: u?.role || req.auth?.role || '', employee: u?.employee || null };
  } catch { return { userId: req.auth?.userId || null, name: '', role: req.auth?.role || '', employee: null }; }
}
async function nextCaseNumber(ERCase) {
  const year = new Date().getFullYear();
  const count = await ERCase.countDocuments({ caseNumber: new RegExp(`^ER-${year}-`) });
  return `ER-${year}-${String(count + 1).padStart(4, '0')}`;
}
function logEvent(doc, me, action, note = '') {
  doc.timeline.push({ at: new Date(), by: me.userId, byName: me.name, action, note });
}

/* ================================ CASES ================================ */

// GET /relations/cases?type=&status=&severity=&q=&assignedTo=
const listCases = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const { type, status, severity, q, assignedTo } = req.query;
  const filter = {};
  if (type && type !== 'all') filter.type = type;
  if (status && status !== 'all') filter.status = status;
  if (severity && severity !== 'all') filter.severity = severity;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (q) filter.$or = [{ caseNumber: new RegExp(q, 'i') }, { category: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') }];

  const items = await ERCase.find(filter)
    .populate('employee', 'firstName lastName staffId employment.department')
    .populate('against', 'firstName lastName staffId')
    .populate('assignedTo', 'firstName lastName')
    .sort({ createdAt: -1 }).lean();
  // strip heavy sub-docs for the list
  const light = items.map((c) => ({ ...c, timeline: undefined, documents: undefined, timelineCount: (c.timeline || []).length, docCount: (c.documents || []).length }));
  res.json({ items: light, total: light.length });
});

const getCase = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id)
    .populate('employee', 'firstName lastName staffId employment.department employment.jobTitle')
    .populate('against', 'firstName lastName staffId')
    .populate('assignedTo', 'firstName lastName')
    .populate('reportedBy', 'name');
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  res.json(doc);
});

const createCase = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  if (!req.body.employee) return res.status(400).json({ message: 'The employee involved is required.' });
  if (!req.body.category) return res.status(400).json({ message: 'A category / offence is required.' });
  const me = await actor(req);
  const body = { ...req.body, caseNumber: await nextCaseNumber(ERCase), reportedBy: me.userId, createdBy: me.userId };
  const doc = new ERCase(body);
  logEvent(doc, me, 'Case opened', `${doc.type} · ${doc.category}`);
  await doc.save();
  res.status(201).json(doc);
});

const updateCase = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  const me = await actor(req);
  const prevStatus = doc.status;

  const editable = ['type', 'employee', 'against', 'category', 'severity', 'priority', 'status', 'dateOfIncident', 'dateReported', 'location', 'description', 'assignedTo', 'confidential', 'outcomeSummary'];
  editable.forEach((k) => { if (req.body[k] !== undefined) doc[k] = req.body[k]; });

  if (req.body.status && req.body.status !== prevStatus) {
    logEvent(doc, me, `Status → ${req.body.status.replace(/_/g, ' ')}`);
    if (req.body.status === 'closed' && !doc.closedDate) doc.closedDate = new Date();
    if (req.body.status !== 'closed') doc.closedDate = null;
  }
  await doc.save();
  res.json(doc);
});

const deleteCase = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  for (const d of doc.documents || []) {
    if (d.publicId) { try { await cloudinary.uploader.destroy(d.publicId, { resource_type: 'raw' }); } catch { /* */ } try { await cloudinary.uploader.destroy(d.publicId, { resource_type: 'image' }); } catch { /* */ } }
  }
  await doc.deleteOne();
  res.json({ message: 'Case deleted' });
});

// POST /relations/cases/:id/timeline  { action, note }
const addTimeline = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  if (!req.body.action && !req.body.note) return res.status(400).json({ message: 'An action or note is required.' });
  const me = await actor(req);
  logEvent(doc, me, req.body.action || 'Note', req.body.note || '');
  await doc.save();
  res.json(doc);
});

// PUT /relations/cases/:id/hearing
const setHearing = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  const me = await actor(req);
  const h = req.body || {};
  doc.hearing = {
    scheduled: h.scheduled || doc.hearing?.scheduled || null, venue: h.venue ?? doc.hearing?.venue ?? '',
    panel: Array.isArray(h.panel) ? h.panel : (typeof h.panel === 'string' ? h.panel.split(',').map((s) => s.trim()).filter(Boolean) : doc.hearing?.panel || []),
    heldOn: h.heldOn || doc.hearing?.heldOn || null, minutes: h.minutes ?? doc.hearing?.minutes ?? '', outcome: h.outcome ?? doc.hearing?.outcome ?? '',
  };
  if (h.scheduled && doc.status === 'investigation') { doc.status = 'hearing'; logEvent(doc, me, 'Hearing scheduled', new Date(h.scheduled).toDateString()); }
  else if (h.heldOn) { logEvent(doc, me, 'Hearing held', h.outcome || ''); if (doc.status === 'hearing') doc.status = 'awaiting_decision'; }
  await doc.save();
  res.json(doc);
});

// PUT /relations/cases/:id/sanction
const setSanction = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  const me = await actor(req);
  const s = req.body || {};
  doc.sanction = {
    outcome: s.outcome || 'none', issuedDate: s.issuedDate || new Date(),
    effectiveDate: s.effectiveDate || s.issuedDate || new Date(), expiryDate: s.expiryDate || null,
    suspensionDays: Number(s.suspensionDays) || 0, details: s.details || '',
  };
  logEvent(doc, me, `Sanction: ${String(doc.sanction.outcome).replace(/_/g, ' ')}`, doc.sanction.details);
  if (['closed', 'withdrawn', 'appealed'].indexOf(doc.status) === -1) { doc.status = 'closed'; doc.closedDate = new Date(); }
  await doc.save();
  res.json(doc);
});

// PUT /relations/cases/:id/appeal
const setAppeal = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  const me = await actor(req);
  const a = req.body || {};
  doc.appeal = {
    lodged: a.lodged !== undefined ? !!a.lodged : true, lodgedDate: a.lodgedDate || doc.appeal?.lodgedDate || new Date(),
    grounds: a.grounds ?? doc.appeal?.grounds ?? '', outcome: a.outcome ?? doc.appeal?.outcome ?? '',
    decidedDate: a.decidedDate || doc.appeal?.decidedDate || null, notes: a.notes ?? doc.appeal?.notes ?? '',
  };
  if (doc.appeal.outcome) { logEvent(doc, me, `Appeal ${doc.appeal.outcome}`, doc.appeal.notes || ''); }
  else { logEvent(doc, me, 'Appeal lodged', doc.appeal.grounds || ''); doc.status = 'appealed'; }
  await doc.save();
  res.json(doc);
});

// POST /relations/cases/:id/documents  (multipart "file", body.kind)
const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field "file").' });
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  const folder = `nexusora_wf/${req.tenant.subdomain}/er_cases`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'document', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
  const result = await uploadBuffer(req.file.buffer, { folder, publicId: `${base}_${Date.now().toString(36)}${ext}` });
  const me = await actor(req);
  doc.documents.push({ name: req.file.originalname, url: result.secure_url, publicId: result.public_id, format: result.format || ext.replace('.', ''), bytes: result.bytes, kind: req.body.kind || '', uploadedAt: new Date() });
  logEvent(doc, me, 'Document added', req.file.originalname);
  await doc.save();
  res.json(doc);
});

const deleteDocument = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const doc = await ERCase.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Case not found' });
  const d = (doc.documents || []).id(req.params.did);
  if (d && d.publicId) { try { await cloudinary.uploader.destroy(d.publicId, { resource_type: 'raw' }); } catch { /* */ } try { await cloudinary.uploader.destroy(d.publicId, { resource_type: 'image' }); } catch { /* */ } }
  doc.documents.pull(req.params.did);
  await doc.save();
  res.json(doc);
});

/* ============================ WARNINGS REGISTER ============================ */
// GET /relations/warnings — active (non-expired) disciplinary sanctions.
const warningsRegister = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const now = new Date();
  const cases = await ERCase.find({ 'sanction.outcome': { $in: ['verbal_warning', 'written_warning', 'final_written_warning', 'suspension'] } })
    .populate('employee', 'firstName lastName staffId employment.department').sort({ 'sanction.issuedDate': -1 }).lean();

  const items = cases.map((c) => {
    const s = c.sanction || {};
    const expired = s.expiryDate ? new Date(s.expiryDate) < now : false;
    return {
      caseId: c._id, caseNumber: c.caseNumber, employee: fullName(c.employee), staffId: c.employee?.staffId || '',
      department: c.employee?.department || c.employee?.employment?.department || '', category: c.category,
      outcome: s.outcome, issuedDate: s.issuedDate, effectiveDate: s.effectiveDate, expiryDate: s.expiryDate,
      active: !expired, expired,
    };
  });
  const active = req.query.active === 'false' ? items : items.filter((i) => i.active);
  res.json({ items: req.query.showAll === 'true' ? items : active, total: active.length });
});

/* ============================ OVERVIEW ============================ */
const overview = asyncHandler(async (req, res) => {
  const ERCase = req.tenantConn.model('ERCase');
  const now = new Date();
  const OPEN = ['open', 'investigation', 'hearing', 'awaiting_decision', 'appealed'];

  const [all, open, disciplinary, grievance, appealed] = await Promise.all([
    ERCase.countDocuments({}),
    ERCase.countDocuments({ status: { $in: OPEN } }),
    ERCase.countDocuments({ type: 'disciplinary' }),
    ERCase.countDocuments({ type: 'grievance' }),
    ERCase.countDocuments({ status: 'appealed' }),
  ]);

  // Active warnings (issued, non-expired)
  const warnCases = await ERCase.find({ 'sanction.outcome': { $in: ['verbal_warning', 'written_warning', 'final_written_warning'] } }, 'sanction').lean();
  const activeWarnings = warnCases.filter((c) => !c.sanction?.expiryDate || new Date(c.sanction.expiryDate) >= now).length;

  // Ageing: open cases older than 30 days
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
  const ageingOpen = await ERCase.countDocuments({ status: { $in: OPEN }, createdAt: { $lt: cutoff } });

  // Breakdown by status & by category (open cases)
  const byStatus = await ERCase.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const byCategory = await ERCase.aggregate([{ $match: { type: 'disciplinary' } }, { $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]);

  res.json({
    totals: { all, open, disciplinary, grievance, appealed, activeWarnings, ageingOpen },
    byStatus: byStatus.map((x) => ({ label: x._id, value: x.n })),
    byCategory: byCategory.map((x) => ({ label: x._id || 'Uncategorised', value: x.n })),
  });
});

module.exports = {
  listCases, getCase, createCase, updateCase, deleteCase,
  addTimeline, setHearing, setSanction, setAppeal, uploadDocument, deleteDocument,
  warningsRegister, overview,
};