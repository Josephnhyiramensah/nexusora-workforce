#!/usr/bin/env bash
# Nexusora Workforce - Phase 2b backend: class-aware Employee model + editable records.
# Run ONCE from project root:  bash phase2b_backend.sh
set -e
mkdir -p server/models/tenant server/modules/employees

echo "  writing server/models/tenant/Employee.js"
cat > server/models/tenant/Employee.js << 'NEXUSORA_EOF'
// Per-tenant Employee record (Core HR) — class-aware superset.
// The schema holds every field any worker class might need; the client form shows only
// the sections relevant to the selected employmentType + workerClass. All sections optional
// except name, so casual/tapper records aren't forced to carry staff-only fields.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  staffId: { type: String, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  dateOfBirth: Date,
  nationalId: String,
  photo: String,
  email: { type: String, lowercase: true, trim: true },
  phone: String,
  address: String,
  nextOfKin: { name: String, relationship: String, phone: String },
  emergencyContact: { name: String, relationship: String, phone: String },

  employment: {
    jobTitle: String,
    department: String,
    section: String,          // plantation section / estate
    costCentre: String,       // maps to Nexusora Books cost centre
    grade: String,
    employmentType: { type: String, enum: ['permanent', 'contract', 'casual', 'seasonal', 'probation'], default: 'permanent' },
    workerClass: { type: String, enum: ['staff', 'field_worker', 'tapper', 'operator'], default: 'staff' },
    lineManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    crew: String,             // gang / crew for field workers
    startDate: Date,
    confirmationStatus: { type: String, enum: ['probation', 'confirmed', 'exited'], default: 'probation' },
    contractType: String,
    contractStart: Date,
    contractEnd: Date,
  },

  // Statutory identifiers (staff / operator / contract; optional for casual).
  statutory: { socialSecurityNumber: String, socialSecurityScheme: String, taxId: String },

  compensation: {
    payBasis: { type: String, enum: ['salary', 'daily', 'hourly', 'piece_rate', 'task'], default: 'salary' },
    currency: String,
    baseSalary: Number,       // monthly (salary)
    dailyRate: Number,
    hourlyRate: Number,
    pieceRate: { amount: Number, unit: String },   // e.g. amount per kg of latex/cuplump
    grade: String,
  },

  payment: {
    method: { type: String, enum: ['bank', 'mobile_money', 'cash'], default: 'bank' },
    bank: { bankName: String, accountNumber: String, accountName: String },
    mobileMoney: { provider: String, number: String },
  },

  // Plantation field-work details (tapper / field_worker).
  fieldWork: {
    taskType: String,         // tapping, weeding, harvesting…
    quota: Number,
    quotaUnit: String,
    medicalClearance: { status: { type: String, enum: ['pending', 'cleared', 'expired'], default: 'pending' }, date: Date, note: String },
  },

  education: { level: String, field: String, institution: String, year: Number },

  status: { type: String, enum: ['active', 'suspended', 'terminated'], default: 'active' },
  custom: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
}, { collection: 'employees', minimize: false });

schema.index({ lastName: 1, firstName: 1 });

module.exports = { schema, modelName: 'Employee' };
NEXUSORA_EOF

echo "  writing server/modules/employees/employee.controller.js"
cat > server/modules/employees/employee.controller.js << 'NEXUSORA_EOF'
const asyncHandler = require('express-async-handler');

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
  if (body.compensation && !body.compensation.currency) body.compensation.currency = req.tenant.baseCurrency;
  const e = await Employee.create(body);
  res.status(201).json(e);
});

const update = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedAt: new Date() },
    { new: true, runValidators: true },
  );
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json(e);
});

const deactivate = asyncHandler(async (req, res) => {
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(req.params.id, { status: 'terminated', updatedAt: new Date() }, { new: true });
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json({ message: 'Employee deactivated', employee: e });
});

module.exports = { list, getById, create, update, deactivate };
NEXUSORA_EOF

echo
echo "Phase 2b backend written. Restart: cd server && npm run dev"
