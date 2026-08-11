const asyncHandler = require('express-async-handler');

// GET /api/employees  (list with search + pagination)
const list = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const { q, department, status, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (department) filter['employment.department'] = department;
  if (q) {
    const rx = new RegExp(String(q).trim(), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { staffId: rx }, { email: rx }];
  }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [items, total] = await Promise.all([
    Employee.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
    Employee.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
});

const getById = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findById(req.params.id);
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json(e);
});

const create = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const body = { ...req.body };
  // default currency to tenant base if not supplied
  if (body.compensation && !body.compensation.currency) body.compensation.currency = req.tenant.baseCurrency;
  const e = await Employee.create(body);
  res.status(201).json(e);
});

const update = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json(e);
});

const deactivate = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(req.params.id, { status: 'terminated' }, { new: true });
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json({ message: 'Employee deactivated', employee: e });
});

module.exports = { list, getById, create, update, deactivate };
