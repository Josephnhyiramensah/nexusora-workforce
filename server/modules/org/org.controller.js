const asyncHandler = require('express-async-handler');
const { checkUnit } = require('../../utils/orgUnitGuard');

// GET /org?type=department&active=true&q=...
const list = asyncHandler(async (req, res) => {
  const OrgUnit = req.tenantConn.model('OrgUnit');
  const { type, active, q } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (active === 'true') filter.active = true;
  if (active === 'false') filter.active = false;
  if (q) {
    const rx = new RegExp(String(q).trim(), 'i');
    filter.$or = [{ name: rx }, { code: rx }];
  }
  const items = await OrgUnit.find(filter)
    .populate('parent', 'name code type')
    .sort({ type: 1, name: 1 });
  res.json({ items, total: items.length });
});

// GET /org/:id
const getById = asyncHandler(async (req, res) => {
  const OrgUnit = req.tenantConn.model('OrgUnit');
  const unit = await OrgUnit.findById(req.params.id).populate('parent', 'name code type');
  if (!unit) return res.status(404).json({ message: 'Org unit not found' });
  res.json(unit);
});

// POST /org
const create = asyncHandler(async (req, res) => {
  const OrgUnit = req.tenantConn.model('OrgUnit');
  const body = { ...req.body };
  if (!body.type || !body.name) {
    return res.status(400).json({ message: 'type and name are required' });
  }

  // Strict de-duplication: refuse a name that means the same as an existing unit
  // of the same type ("IT" when "Information Technology" already exists), and
  // store the clean canonical spelling.
  const check = await checkUnit(OrgUnit, body.name, { extraFilter: { type: body.type } });
  if (!check.ok) {
    if (check.reason === 'empty') return res.status(400).json({ message: 'A name is required.' });
    return res.status(409).json({ message: `“${check.existing}” already exists as a ${body.type}. Use it instead of creating a duplicate (${check.canonical}).` });
  }
  body.name = check.canonical;

  if (body.code === '') delete body.code;
  if (body.parent === '' || body.parent === null) body.parent = null;
  if (body.head === '' || body.head === null) body.head = null;
  try {
    const unit = await OrgUnit.create(body);
    res.status(201).json(unit);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: `A ${body.type} with code "${body.code}" already exists.` });
    }
    throw err;
  }
});

// PUT /org/:id
const update = asyncHandler(async (req, res) => {
  const OrgUnit = req.tenantConn.model('OrgUnit');
  const body = { ...req.body, updatedAt: new Date() };
  if (body.code === '') body.code = undefined;
  if (body.parent === '') body.parent = null;
  if (body.head === '') body.head = null;
  if (body.parent && String(body.parent) === String(req.params.id)) {
    return res.status(400).json({ message: 'A unit cannot be its own parent.' });
  }

  // If the name is being changed, run the same de-duplication (scoped to this
  // unit's type, excluding itself) and canonicalise it.
  if (body.name !== undefined) {
    const current = await OrgUnit.findById(req.params.id, 'type').lean();
    if (!current) return res.status(404).json({ message: 'Org unit not found' });
    const unitType = body.type || current.type;
    const check = await checkUnit(OrgUnit, body.name, { excludeId: req.params.id, extraFilter: { type: unitType } });
    if (!check.ok) {
      if (check.reason === 'empty') return res.status(400).json({ message: 'A name is required.' });
      return res.status(409).json({ message: `“${check.existing}” already exists as a ${unitType}.` });
    }
    body.name = check.canonical;
  }

  try {
    const unit = await OrgUnit.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
      .populate('parent', 'name code type');
    if (!unit) return res.status(404).json({ message: 'Org unit not found' });
    res.json(unit);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'That code is already in use for this type.' });
    }
    throw err;
  }
});

// DELETE /org/:id — soft-deactivate by default; hard-delete only if ?hard=true and no employees reference it.
const remove = asyncHandler(async (req, res) => {
  const OrgUnit = req.tenantConn.model('OrgUnit');
  const Employee = req.tenantConn.model('Employee');

  if (req.query.hard === 'true') {
    const inUse = await Employee.countDocuments({
      $or: [{ 'employment.departmentId': req.params.id }, { 'employment.sectionId': req.params.id }],
    });
    if (inUse > 0) {
      return res.status(409).json({ message: `Cannot delete: ${inUse} employee(s) still assigned. Deactivate instead.` });
    }
    const del = await OrgUnit.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ message: 'Org unit not found' });
    return res.json({ message: 'Org unit deleted' });
  }

  const unit = await OrgUnit.findByIdAndUpdate(req.params.id, { active: false, updatedAt: new Date() }, { new: true });
  if (!unit) return res.status(404).json({ message: 'Org unit not found' });
  res.json({ message: 'Org unit deactivated', unit });
});

// POST /org/backfill-links  — ONE-OFF migration. Links existing employees' free-text
// department/section strings to OrgUnit ids, by exact (case-insensitive) name OR code match.
// Non-destructive: only SETS departmentId/sectionId; never clears the existing label strings.
// Idempotent: skips employees already linked. Reports every unmatched string so you can
// create the missing unit and re-run. Remove this route after running once.
const backfillLinks = asyncHandler(async (req, res) => {
  const OrgUnit = req.tenantConn.model('OrgUnit');
  const Employee = req.tenantConn.model('Employee');

  const norm = (s) => String(s || '').trim().toLowerCase();
  const depts = await OrgUnit.find({ type: 'department' });
  const secs = await OrgUnit.find({ type: 'section' });

  const findUnit = (units, label) => {
    const n = norm(label);
    if (!n) return null;
    return units.find((u) => norm(u.name) === n || norm(u.code) === n) || null;
  };

  const employees = await Employee.find({});
  const report = { totalEmployees: employees.length, linkedDepartment: 0, linkedSection: 0, alreadyLinked: 0, unmatched: [] };

  for (const emp of employees) {
    const em = emp.employment || {};
    let changed = false;

    // Department
    if (em.department && !em.departmentId) {
      const unit = findUnit(depts, em.department);
      if (unit) { emp.employment.departmentId = unit._id; report.linkedDepartment += 1; changed = true; }
      else report.unmatched.push({ employee: `${emp.firstName} ${emp.lastName}`, field: 'department', value: em.department });
    } else if (em.departmentId) {
      report.alreadyLinked += 1;
    }

    // Section
    if (em.section && !em.sectionId) {
      const unit = findUnit(secs, em.section);
      if (unit) { emp.employment.sectionId = unit._id; report.linkedSection += 1; changed = true; }
      else report.unmatched.push({ employee: `${emp.firstName} ${emp.lastName}`, field: 'section', value: em.section });
    }

    if (changed) { emp.updatedAt = new Date(); await emp.save(); }
  }

  res.json({ message: 'Backfill complete', report });
});

module.exports = { list, getById, create, update, remove, backfillLinks };