const mongoose = require('mongoose');

const dependentSchema = new mongoose.Schema({
  name: String,
  relationship: String,
  dateOfBirth: Date,
}, { _id: true });

const documentSchema = new mongoose.Schema({
  name: String,
  type: String,
  url: String,
  publicId: String,
  format: String,
  bytes: Number,
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: String,
}, { _id: true });

const payComponentSchema = new mongoose.Schema({
  type: String,
  amount: Number,
  currency: String,
  frequency: { type: String, enum: ['monthly', 'annual', 'weekly', 'daily', 'biweekly', 'one_time'], default: 'monthly' },
}, { _id: true });

const schema = new mongoose.Schema({
  staffId: { type: String, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  preferredName: { type: String, trim: true },
  gender: { type: String, enum: ['male', 'female', 'other'] },
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed', 'separated'] },
  nationality: String,
  dateOfBirth: Date,
  nationalId: String,
  photo: String,
  email: { type: String, lowercase: true, trim: true },
  phone: String,
  address: String,
  nextOfKin: { name: String, relationship: String, phone: String },
  emergencyContact: { name: String, relationship: String, phone: String },

  dependents: [dependentSchema],
  documents: [documentSchema],

  employment: {
    jobTitle: String,
    department: String,
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgUnit', default: null },
    section: String,
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrgUnit', default: null },
    positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', default: null },
    costCentre: String,
    grade: String,
    // employmentType and workerClass are now customer-managed picklists (see Picklist model),
    // so they accept any code the tenant defines — NOT a fixed enum.
    employmentType: { type: String, default: 'permanent' },
    workerClass: { type: String, default: 'staff' },
    lineManager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    crew: String,
    startDate: Date,
    confirmationStatus: { type: String, enum: ['probation', 'confirmed', 'exited'], default: 'probation' },
    probationEndDate: Date,
    contractType: String,
    contractStart: Date,
    contractEnd: Date,
    terminationDate: Date,
    terminationReason: String,
  },

  statutory: { socialSecurityNumber: String, socialSecurityScheme: String, taxId: String },

  compensation: {
    payBasis: { type: String, enum: ['salary', 'daily', 'hourly', 'piece_rate', 'task'], default: 'salary' },
    currency: String,
    baseSalary: Number,
    dailyRate: Number,
    hourlyRate: Number,
    pieceRate: { amount: Number, unit: String },
    grade: String,
    payComponents: [payComponentSchema],
  },

  payment: {
    method: { type: String, enum: ['bank', 'mobile_money', 'cash'], default: 'bank' },
    bank: { bankName: String, accountNumber: String, accountName: String },
    mobileMoney: { provider: String, number: String },
  },

  fieldWork: {
    taskType: String,
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