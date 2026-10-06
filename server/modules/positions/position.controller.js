const asyncHandler = require('express-async-handler');
const cloudinary = require('../../config/cloudinary');

function uploadBuffer(buffer, { folder, resourceType = 'auto', publicId }) {
  return new Promise((resolve, reject) => {
    const opts = { folder, resource_type: resourceType };
    if (publicId) opts.public_id = publicId;   // keep the original extension in the URL
    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });
}

// GET /positions?active=true&q=...  — includes filled/vacant counts per position.
const list = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const Employee = req.tenantConn.model('Employee');
  const { active, q } = req.query;
  const filter = {};
  if (active === 'true') filter.active = true;
  if (active === 'false') filter.active = false;
  if (q) {
    const rx = new RegExp(String(q).trim(), 'i');
    filter.$or = [{ title: rx }, { code: rx }];
  }
  const positions = await Position.find(filter)
    .populate('department', 'name code')
    .populate('reportsTo', 'title code')
    .sort({ title: 1 })
    .lean();

  // Count assigned employees per position in one aggregation.
  const counts = await Employee.aggregate([
    { $match: { 'employment.positionId': { $ne: null } } },
    { $group: { _id: '$employment.positionId', filled: { $sum: 1 } } },
  ]);
  const filledBy = {};
  counts.forEach((c) => { if (c._id) filledBy[String(c._id)] = c.filled; });

  const items = positions.map((p) => {
    const filled = filledBy[String(p._id)] || 0;
    const headcount = p.headcount ?? 1;
    return { ...p, filled, vacant: Math.max(0, headcount - filled) };
  });
  res.json({ items, total: items.length });
});

const getById = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const pos = await Position.findById(req.params.id)
    .populate('department', 'name code')
    .populate('reportsTo', 'title code');
  if (!pos) return res.status(404).json({ message: 'Position not found' });
  res.json(pos);
});

const create = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const body = { ...req.body };
  if (!body.title) return res.status(400).json({ message: 'title is required' });
  if (body.code === '') delete body.code;
  if (body.department === '' || body.department === null) body.department = null;
  if (body.reportsTo === '' || body.reportsTo === null) body.reportsTo = null;
  if (body.headcount === '' || body.headcount == null) body.headcount = 1;
  try {
    const pos = await Position.create(body);
    res.status(201).json(pos);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: `A position with code "${body.code}" already exists.` });
    }
    throw err;
  }
});

const update = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const body = { ...req.body, updatedAt: new Date() };
  if (body.code === '') body.code = undefined;
  if (body.department === '') body.department = null;
  if (body.reportsTo === '') body.reportsTo = null;
  if (body.reportsTo && String(body.reportsTo) === String(req.params.id)) {
    return res.status(400).json({ message: 'A position cannot report to itself.' });
  }
  try {
    const pos = await Position.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
      .populate('department', 'name code')
      .populate('reportsTo', 'title code');
    if (!pos) return res.status(404).json({ message: 'Position not found' });
    res.json(pos);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'That code is already in use.' });
    }
    throw err;
  }
});

// DELETE /positions/:id — soft-deactivate; hard-delete only if ?hard=true and no employee holds it.
const remove = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const Employee = req.tenantConn.model('Employee');
  if (req.query.hard === 'true') {
    const inUse = await Employee.countDocuments({ 'employment.positionId': req.params.id });
    if (inUse > 0) {
      return res.status(409).json({ message: `Cannot delete: ${inUse} employee(s) hold this position. Deactivate instead.` });
    }
    const del = await Position.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Position not found' });
    return res.json({ message: 'Position deleted' });
  }
  const pos = await Position.findByIdAndUpdate(req.params.id, { active: false, updatedAt: new Date() }, { new: true });
  if (!pos) return res.status(404).json({ message: 'Position not found' });
  res.json({ message: 'Position deactivated', position: pos });
});

// POST /positions/:id/jd-file — attach an existing job-description soft copy (PDF/DOC/image).
const uploadJobDescriptionFile = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  const Position = req.tenantConn.model('Position');
  const pos = await Position.findById(req.params.id);
  if (!pos) return res.status(404).json({ message: 'Position not found' });

  const folder = `workforce/${req.auth.tenant}/positions/${pos._id}/jd`;
  // Preserve the original extension in the stored public_id so downloads and viewers work.
  const orig = req.file.originalname || 'job-description';
  const dot = orig.lastIndexOf('.');
  const ext = dot > -1 ? orig.slice(dot).toLowerCase() : '';
  const base = (dot > -1 ? orig.slice(0, dot) : orig).replace(/[^\w-]+/g, '_').slice(0, 50) || 'file';
  const publicId = `${base}_${Date.now().toString(36)}${ext}`;
  const result = await uploadBuffer(req.file.buffer, { folder, resourceType: 'auto', publicId });

  const jd = pos.jobDescription ? pos.jobDescription.toObject() : {};
  jd.file = {
    name: req.body.name || req.file.originalname || 'Job description',
    url: result.secure_url,
    publicId: result.public_id,
    format: result.format || (req.file.mimetype || '').split('/')[1] || '',
    bytes: result.bytes || req.file.size || 0,
    uploadedAt: new Date(),
  };
  jd.updatedAt = new Date();
  pos.jobDescription = jd;
  pos.updatedAt = new Date();
  await pos.save();
  res.status(201).json({ message: 'File uploaded', jobDescription: pos.jobDescription });
});

// DELETE /positions/:id/jd-file — remove the uploaded soft copy.
const deleteJobDescriptionFile = asyncHandler(async (req, res) => {
  const Position = req.tenantConn.model('Position');
  const pos = await Position.findById(req.params.id);
  if (!pos) return res.status(404).json({ message: 'Position not found' });
  const jd = pos.jobDescription ? pos.jobDescription.toObject() : {};
  const publicId = jd.file && jd.file.publicId;
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (e) { /* ignore — record removal is the source of truth */ }
  }
  jd.file = undefined;
  jd.updatedAt = new Date();
  pos.jobDescription = jd;
  pos.updatedAt = new Date();
  await pos.save();
  res.json({ message: 'File removed', jobDescription: pos.jobDescription });
});

module.exports = { list, getById, create, update, remove, uploadJobDescriptionFile, deleteJobDescriptionFile };