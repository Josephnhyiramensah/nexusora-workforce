// Per-tenant Employee record (Core HR). Registered only on tenant connections.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  staffId: { type: String, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  dateOfBirth: Date,
  nationalId: String,
  socialSecurityNumber: String,   // SSNIT / NASSCORP / CNPS number
  taxId: String,
  email: { type: String, lowercase: true, trim: true },
  phone: String,

  employment: {
    jobTitle: String,
    department: String,
    costCentre: String,           // maps to Nexusora Books cost centre
    grade: String,
    employmentType: { type: String, enum: ['permanent', 'contract', 'casual', 'seasonal', 'probation'], default: 'permanent' },
    workerClass: { type: String, enum: ['staff', 'field_worker', 'tapper', 'operator'], default: 'staff' },
    lineManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    startDate: Date,
    confirmationStatus: { type: String, enum: ['probation', 'confirmed', 'exited'], default: 'probation' },
    contractType: String,
    contractEnd: Date,
  },

  compensation: {
    baseSalary: Number,
    currency: String,             // defaults to tenant baseCurrency at creation
    payBasis: { type: String, enum: ['salary', 'hourly', 'piece_rate', 'task'], default: 'salary' },
  },

  status: { type: String, enum: ['active', 'suspended', 'terminated'], default: 'active' },
  custom: { type: mongoose.Schema.Types.Mixed, default: {} },  // per-tenant custom fields
  createdAt: { type: Date, default: Date.now },
}, { collection: 'employees', minimize: false });

schema.index({ lastName: 1, firstName: 1 });

module.exports = { schema, modelName: 'Employee' };
