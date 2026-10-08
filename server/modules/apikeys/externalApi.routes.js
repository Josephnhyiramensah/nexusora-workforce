// Public, API-key-authenticated surface for external integrations.
// Mounted at /api/v1. Tenant is resolved from the request host (the tenant
// subdomain) or, in non-production, the x-tenant-subdomain header — exactly
// like the rest of the app — then the API key is verified against that tenant.
//
// Example:
//   curl https://acme.nexusora-workforce.app/api/v1/employees \
//        -H "Authorization: Bearer nxw_live_xxx"
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { resolveTenant } = require('../../middleware/tenant');
const { authenticateApiKey, requireScope } = require('./apikey.controller');

router.use(resolveTenant);
router.use(authenticateApiKey);

const empProjection = 'staffId firstName lastName email employment.department employment.grade employment.employmentType status createdAt';

// GET /api/v1/employees?limit=&page=&status=&q=
router.get('/employees', requireScope('employees'), asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).trim(), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { staffId: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    Employee.find(filter).select(empProjection).sort({ lastName: 1, firstName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Employee.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, count: items.length, total, page, limit });
}));

// GET /api/v1/employees/:id
router.get('/employees/:id', requireScope('employees'), asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.params.id).select(empProjection + ' compensation employment gender nationality').lean();
  if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });
  res.json({ success: true, data: emp });
}));

// GET /api/v1/leave/requests?status=&limit=
router.get('/leave/requests', requireScope('leave'), asyncHandler(async (req, res) => {
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  req.tenantConn.model('Employee'); // ensure registered for populate
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  const items = await LeaveRequest.find(filter)
    .populate('employee', 'firstName lastName staffId')
    .sort({ startDate: -1 }).limit(limit).lean();
  res.json({ success: true, data: items, count: items.length });
}));

// GET /api/v1/ping — simple authenticated health check for integrators.
router.get('/ping', asyncHandler(async (req, res) => {
  res.json({ success: true, tenant: req.tenant?.subdomain, key: req.apiKey?.name, scopes: req.apiPermissions, serverTime: new Date().toISOString() });
}));

module.exports = router;
