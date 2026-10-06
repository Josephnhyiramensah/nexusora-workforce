const asyncHandler = require('express-async-handler');

// Default seeds. Worker classes carry the behavior that used to be hardcoded in employeeProfiles.js.
const SEED = {
  worker_class: [
    { name: 'Staff',        code: 'staff',        defaultPayBasis: 'salary',     defaultPaymentMethod: 'bank',         showsFieldWork: false, order: 1 },
    { name: 'Field Worker', code: 'field_worker', defaultPayBasis: 'daily',      defaultPaymentMethod: 'mobile_money', showsFieldWork: true,  order: 2 },
    { name: 'Tapper',       code: 'tapper',       defaultPayBasis: 'piece_rate', defaultPaymentMethod: 'mobile_money', showsFieldWork: true,  order: 3 },
    { name: 'Operator',     code: 'operator',     defaultPayBasis: 'hourly',     defaultPaymentMethod: 'bank',         showsFieldWork: false, order: 4 },
  ],
  employment_type: [
    { name: 'Permanent', code: 'permanent', order: 1 },
    { name: 'Contract',  code: 'contract',  order: 2 },
    { name: 'Casual',    code: 'casual',    order: 3 },
    { name: 'Seasonal',  code: 'seasonal',  order: 4 },
    { name: 'Probation', code: 'probation', order: 5 },
  ],
  grade: [
    { name: 'Grade 1', code: 'G1', order: 1 },
    { name: 'Grade 2', code: 'G2', order: 2 },
    { name: 'Grade 3', code: 'G3', order: 3 },
    { name: 'Management', code: 'MGT', order: 4 },
  ],
};

// GET /picklists?type=worker_class&active=true
const list = asyncHandler(async (req, res) => {
  const Picklist = req.tenantConn.model('Picklist');
  const { type, active } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (active === 'true') filter.active = true;
  if (active === 'false') filter.active = false;
  const items = await Picklist.find(filter).sort({ type: 1, order: 1, name: 1 });
  res.json({ items, total: items.length });
});

const create = asyncHandler(async (req, res) => {
  const Picklist = req.tenantConn.model('Picklist');
  const body = { ...req.body };
  if (!body.type || !body.name) return res.status(400).json({ message: 'type and name are required' });
  if (body.code === '') delete body.code;
  try {
    const item = await Picklist.create(body);
    res.status(201).json(item);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: `A ${body.type.replace('_', ' ')} with code "${body.code}" already exists.` });
    }
    throw err;
  }
});

const update = asyncHandler(async (req, res) => {
  const Picklist = req.tenantConn.model('Picklist');
  const body = { ...req.body, updatedAt: new Date() };
  if (body.code === '') body.code = undefined;
  try {
    const item = await Picklist.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'Picklist item not found' });
    res.json(item);
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'That code is already in use for this type.' });
    throw err;
  }
});

// DELETE /picklists/:id — soft-deactivate by default; hard-delete only if ?hard=true and unused.
const remove = asyncHandler(async (req, res) => {
  const Picklist = req.tenantConn.model('Picklist');
  const Employee = req.tenantConn.model('Employee');
  const item = await Picklist.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Picklist item not found' });

  if (req.query.hard === 'true') {
    // Block hard-delete if any employee uses this value (by the matching employment field).
    const field = item.type === 'worker_class' ? 'employment.workerClass'
      : item.type === 'employment_type' ? 'employment.employmentType'
      : 'employment.grade';
    const inUse = await Employee.countDocuments({ [field]: item.code });
    if (inUse > 0) {
      return res.status(409).json({ message: `Cannot delete: ${inUse} employee(s) use this value. Deactivate instead.` });
    }
    await Picklist.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Picklist item deleted' });
  }

  item.active = false; item.updatedAt = new Date();
  await item.save();
  res.json({ message: 'Picklist item deactivated', item });
});

// POST /picklists/seed — plant sensible defaults per type. Idempotent: only inserts
// a type's defaults if that type is currently EMPTY, so it never duplicates or overwrites.
const seed = asyncHandler(async (req, res) => {
  const Picklist = req.tenantConn.model('Picklist');
  const report = {};
  for (const [type, rows] of Object.entries(SEED)) {
    const existing = await Picklist.countDocuments({ type });
    if (existing > 0) { report[type] = `skipped (${existing} already present)`; continue; }
    await Picklist.insertMany(rows.map((r) => ({ ...r, type })));
    report[type] = `seeded ${rows.length}`;
  }
  res.json({ message: 'Seed complete', report });
});

module.exports = { list, create, update, remove, seed };