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
const HR = ['super_admin', 'hr_manager', 'hr_officer'];
const isHR = (req) => HR.includes(req.auth?.role);

// Resolve the acting user's identity (name + linked employee) for stamping acks/versions.
async function actor(req) {
  try {
    const u = await req.tenantConn.model('User').findById(req.auth.userId).select('name role employee').lean();
    return { userId: req.auth.userId, name: u?.name || '', role: u?.role || req.auth?.role || '', employee: u?.employee || null };
  } catch { return { userId: req.auth?.userId || null, name: '', role: req.auth?.role || '', employee: null }; }
}

// Next version label: bump the numeric part of the current version, else count+1.
function nextVersion(doc) {
  const cur = String(doc.version || '').trim();
  const n = parseInt(cur, 10);
  if (!Number.isNaN(n)) return String(n + 1);
  return String((doc.versions?.length || 0) + 1);
}

// Compact a document for lists: strip the heavy acks array, add ack summary for the caller.
function summarise(doc, me) {
  const d = doc.toObject ? doc.toObject() : doc;
  const acks = d.acknowledgements || [];
  const currentAcks = acks.filter((a) => a.version === d.version);
  const mine = me?.employee
    ? acks.find((a) => String(a.employee) === String(me.employee))
    : acks.find((a) => String(a.user) === String(me?.userId));
  d.ackSummary = {
    total: acks.length,
    currentVersion: currentAcks.length,
    acknowledgedByMe: !!mine,
    myVersion: mine?.version || null,
    myAckStale: !!mine && mine.version !== d.version,
  };
  d.versionCount = (d.versions || []).length;
  delete d.acknowledgements;   // don't ship the full roster in list responses
  return d;
}

/* ============================ COMPANY DOCUMENTS ============================ */

// GET /documents/company?category=&q=&status=
const listCompany = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const { category, q, status } = req.query;
  const filter = {};
  if (category && category !== 'all') filter.category = category;
  if (q) { const rx = new RegExp(q, 'i'); filter.$or = [{ title: rx }, { description: rx }, { tags: rx }]; }

  if (isHR(req)) {
    if (status && status !== 'all') filter.status = status;
  } else {
    // Staff only ever see published documents visible to everyone or to their role.
    filter.status = 'published';
    filter.visibility = { $in: ['all', req.auth?.role] };
  }

  const me = await actor(req);
  const docs = await CompanyDocument.find(filter).sort({ status: 1, createdAt: -1 }).populate('uploadedBy', 'name').populate('owner', 'firstName lastName staffId');
  const items = docs.map((d) => summarise(d, me));
  res.json({ items, total: items.length });
});

// GET /documents/company/:id — full document incl. version history (ack roster stays HR-only).
const getCompany = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const doc = await CompanyDocument.findById(req.params.id).populate('owner', 'firstName lastName staffId').populate('uploadedBy', 'name');
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const me = await actor(req);
  const out = summarise(doc, me);
  if (isHR(req)) out.acknowledgements = (doc.toObject().acknowledgements || []);
  res.json(out);
});

// GET /documents/company/expiring?days=30 — expiring/overdue-for-review or already expired.
const expiring = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const until = new Date(); until.setDate(until.getDate() + days);
  const items = await CompanyDocument.find({
    status: { $ne: 'archived' },
    $or: [{ expiryDate: { $ne: null, $lte: until } }, { reviewDate: { $ne: null, $lte: until } }],
  }).sort({ expiryDate: 1, reviewDate: 1 });
  res.json({ items, total: items.length, windowDays: days });
});

// POST /documents/company
const createCompany = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  if (!req.body.title) return res.status(400).json({ message: 'A title is required.' });
  const body = { ...req.body, uploadedBy: req.auth.userId };
  if (!Array.isArray(body.visibility) || !body.visibility.length) body.visibility = ['all'];
  if (!body.status) body.status = 'published';
  if (body.status === 'published') body.publishedAt = new Date();
  const doc = await CompanyDocument.create(body);
  res.status(201).json(doc);
});

// PUT /documents/company/:id — metadata only (file & versions & acks handled by their own routes).
const updateCompany = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const body = { ...req.body };
  ['uploadedBy', 'file', 'versions', 'acknowledgements', 'publishedAt'].forEach((k) => delete body[k]);
  if (body.visibility && (!Array.isArray(body.visibility) || !body.visibility.length)) body.visibility = ['all'];
  const doc = await CompanyDocument.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const wasPublished = doc.status === 'published';
  Object.assign(doc, body);
  if (body.status === 'published' && !wasPublished) doc.publishedAt = new Date();
  await doc.save();
  res.json(doc);
});

// PATCH /documents/company/:id/status  { status: 'draft'|'published'|'archived' }
const setStatus = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const { status } = req.body;
  if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });
  const doc = await CompanyDocument.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (status === 'published' && doc.status !== 'published') doc.publishedAt = new Date();
  doc.status = status;
  await doc.save();
  res.json(doc);
});

// DELETE /documents/company/:id — removes the doc and every stored version file.
const deleteCompany = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('CompanyDocument').findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  const ids = new Set();
  if (doc.file?.publicId) ids.add(doc.file.publicId);
  (doc.versions || []).forEach((v) => { if (v.file?.publicId) ids.add(v.file.publicId); });
  for (const pid of ids) {
    try { await cloudinary.uploader.destroy(pid, { resource_type: 'raw' }); } catch { /* ignore */ }
    try { await cloudinary.uploader.destroy(pid, { resource_type: 'image' }); } catch { /* ignore */ }
  }
  await doc.deleteOne();
  res.json({ message: 'Document deleted' });
});

// POST /documents/company/:id/file  (multipart "file", optional body.note & body.version)
// Each upload is recorded as a new version; the previous file is retained in history.
const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  const doc = await req.tenantConn.model('CompanyDocument').findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const folder = `nexusora_wf/${req.tenant.subdomain}/company_docs`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'document', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
  const publicId = `${base}_${Date.now().toString(36)}${ext}`;
  const result = await uploadBuffer(req.file.buffer, { folder, resourceType: 'auto', publicId });

  const me = await actor(req);
  const newFile = { name: req.file.originalname, url: result.secure_url, publicId: result.public_id, format: result.format || ext.replace('.', ''), bytes: result.bytes };
  const version = String(req.body.version || '').trim() || nextVersion(doc);

  doc.versions.push({ version, file: newFile, note: req.body.note || '', uploadedBy: me.userId, uploadedByName: me.name, uploadedAt: new Date() });
  doc.file = { ...newFile, uploadedAt: new Date() };
  doc.version = version;
  await doc.save();
  res.json(doc);
});

/* ============================ ACKNOWLEDGEMENTS ============================ */

// POST /documents/company/:id/acknowledge — the current user confirms they read it.
const acknowledge = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const doc = await CompanyDocument.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  if (doc.status !== 'published') return res.status(409).json({ message: 'This document is not published.' });

  const me = await actor(req);
  const matches = (a) => (me.employee ? String(a.employee) === String(me.employee) : String(a.user) === String(me.userId));
  const existing = doc.acknowledgements.find(matches);
  if (existing && existing.version === doc.version) {
    return res.json({ message: 'Already acknowledged.', acknowledgedAt: existing.acknowledgedAt, version: existing.version });
  }
  if (existing) {
    // Re-acknowledging a new version: update the stamp in place.
    existing.version = doc.version; existing.acknowledgedAt = new Date(); existing.name = me.name || existing.name; existing.role = me.role || existing.role;
  } else {
    doc.acknowledgements.push({ user: me.userId, employee: me.employee, name: me.name, role: me.role, version: doc.version, acknowledgedAt: new Date() });
  }
  await doc.save();
  res.json({ message: 'Acknowledged.', version: doc.version, acknowledgedAt: new Date() });
});

// GET /documents/company/:id/acknowledgements — HR compliance matrix against active staff.
const ackReport = asyncHandler(async (req, res) => {
  const CompanyDocument = req.tenantConn.model('CompanyDocument');
  const Employee = req.tenantConn.model('Employee');
  const doc = await CompanyDocument.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const acks = doc.acknowledgements || [];
  const byEmp = new Map();
  acks.forEach((a) => { if (a.employee) byEmp.set(String(a.employee), a); });

  // Audience = active employees (the people a policy applies to).
  const staff = await Employee.find({ 'employment.confirmationStatus': { $ne: 'exited' } }, 'firstName lastName staffId employment.department').lean();
  const roster = staff.map((e) => {
    const a = byEmp.get(String(e._id));
    return {
      employeeId: e._id,
      name: [e.firstName, e.lastName].filter(Boolean).join(' ') || '—',
      staffId: e.staffId || '',
      department: e.employment?.department || '',
      acknowledged: !!a,
      version: a?.version || null,
      acknowledgedAt: a?.acknowledgedAt || null,
      stale: !!a && a.version !== doc.version,   // read an older version
    };
  });
  // Acks by people with no matching active employee (e.g. admins) — still list them.
  const extra = acks.filter((a) => !a.employee || !staff.some((e) => String(e._id) === String(a.employee)))
    .map((a) => ({ employeeId: null, name: a.name || '—', staffId: '', department: '', acknowledged: true, version: a.version, acknowledgedAt: a.acknowledgedAt, stale: a.version !== doc.version }));

  const all = [...roster, ...extra];
  const done = all.filter((r) => r.acknowledged && !r.stale).length;
  const total = roster.length;   // denominator = active staff
  res.json({
    title: doc.title, currentVersion: doc.version, requireAcknowledgement: !!doc.requireAcknowledgement,
    summary: { total, acknowledged: done, pending: Math.max(0, total - done), pct: total ? Math.round((done / total) * 100) : 0, stale: all.filter((r) => r.stale).length },
    roster: all.sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || a.name.localeCompare(b.name)),
  });
});

/* ============================ EMPLOYEE DOCUMENTS (read-only aggregate) ============================ */

// GET /documents/employees?q= — every file attached to an employee record, flattened.
const employeeDocs = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const rows = await Employee.aggregate([
    { $match: { 'documents.0': { $exists: true } } },
    { $unwind: '$documents' },
    { $project: {
      _id: 0, employeeId: '$_id', staffId: '$staffId',
      employeeName: { $trim: { input: { $concat: [{ $ifNull: ['$firstName', ''] }, ' ', { $ifNull: ['$lastName', ''] }] } } },
      name: '$documents.name', type: '$documents.type', url: '$documents.url',
      format: '$documents.format', bytes: '$documents.bytes', uploadedAt: '$documents.uploadedAt',
    } },
    { $sort: { uploadedAt: -1 } },
  ]);
  let items = rows;
  if (req.query.q) {
    const rx = new RegExp(req.query.q, 'i');
    items = rows.filter((r) => rx.test(r.employeeName || '') || rx.test(r.name || '') || rx.test(r.type || '') || rx.test(r.staffId || ''));
  }
  res.json({ items, total: items.length });
});

module.exports = { listCompany, getCompany, expiring, createCompany, updateCompany, setStatus, deleteCompany, uploadFile, acknowledge, ackReport, employeeDocs };