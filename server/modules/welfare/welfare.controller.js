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
const fullName = (e) => [e && e.firstName, e && e.lastName].filter(Boolean).join(' ') || '—';
async function seq(Model, field, prefix) {
  const year = new Date().getFullYear();
  const n = await Model.countDocuments({ [field]: new RegExp(`^${prefix}-${year}-`) });
  return `${prefix}-${year}-${String(n + 1).padStart(4, '0')}`;
}

/* =============================== LOANS & ADVANCES =============================== */
const listLoans = asyncHandler(async (req, res) => {
  const StaffLoan = req.tenantConn.model('StaffLoan');
  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
  if (req.query.employee) filter.employee = req.query.employee;
  const items = await StaffLoan.find(filter).populate('employee', 'firstName lastName staffId employment.department').sort({ createdAt: -1 }).lean();
  res.json({ items, total: items.length });
});

const getLoan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('StaffLoan').findById(req.params.id).populate('employee', 'firstName lastName staffId employment.department');
  if (!doc) return res.status(404).json({ message: 'Loan not found' });
  res.json(doc);
});

const createLoan = asyncHandler(async (req, res) => {
  const StaffLoan = req.tenantConn.model('StaffLoan');
  if (!req.body.employee || !req.body.principal) return res.status(400).json({ message: 'Employee and principal amount are required.' });
  const doc = await StaffLoan.create({
    ...req.body, loanNumber: await seq(StaffLoan, 'loanNumber', 'LN'),
    principal: Number(req.body.principal), interestRatePct: Number(req.body.interestRatePct) || 0,
    termMonths: Math.max(1, Number(req.body.termMonths) || 1), status: 'requested', createdBy: req.auth.userId,
  });
  res.status(201).json(doc);
});

// PATCH /loans/:id/decision  { decision: 'approve'|'reject', startDate, decisionNote }
const decideLoan = asyncHandler(async (req, res) => {
  const StaffLoan = req.tenantConn.model('StaffLoan');
  const doc = await StaffLoan.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Loan not found' });
  const { decision } = req.body;
  if (decision === 'reject') {
    doc.status = 'rejected'; doc.decisionNote = req.body.decisionNote || '';
    doc.approvedBy = req.auth.userId; doc.approvedDate = new Date();
    await doc.save(); return res.json(doc);
  }
  // approve → compute repayable, monthly deduction, opening balance, go active
  const total = Math.round(doc.principal * (1 + (doc.interestRatePct || 0) / 100));
  doc.totalRepayable = total;
  doc.monthlyDeduction = Math.ceil(total / Math.max(1, doc.termMonths));
  doc.balance = total;
  doc.startDate = req.body.startDate || new Date();
  doc.status = 'active';
  doc.decisionNote = req.body.decisionNote || '';
  doc.approvedBy = req.auth.userId; doc.approvedDate = new Date();
  await doc.save();
  res.json(doc);
});

// POST /loans/:id/repayment  { amount, method, reference, note, date }
const addRepayment = asyncHandler(async (req, res) => {
  const StaffLoan = req.tenantConn.model('StaffLoan');
  const doc = await StaffLoan.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Loan not found' });
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ message: 'A positive repayment amount is required.' });
  if (!['active', 'approved'].includes(doc.status)) return res.status(409).json({ message: 'Only an active loan can take repayments.' });
  const balanceAfter = Math.max(0, Math.round((doc.balance - amount) * 100) / 100);
  doc.repayments.push({ date: req.body.date || new Date(), amount, method: req.body.method || 'payroll_deduction', reference: req.body.reference || '', note: req.body.note || '', balanceAfter, recordedBy: req.auth.userId });
  doc.balance = balanceAfter;
  if (balanceAfter <= 0) doc.status = 'completed';
  await doc.save();
  res.json(doc);
});

const updateLoan = asyncHandler(async (req, res) => {
  const StaffLoan = req.tenantConn.model('StaffLoan');
  const body = { ...req.body };
  ['repayments', 'balance', 'status', 'totalRepayable', 'monthlyDeduction', 'approvedBy', 'loanNumber', 'createdBy'].forEach((k) => delete body[k]);
  const doc = await StaffLoan.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Loan not found' });
  res.json(doc);
});

const deleteLoan = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('StaffLoan').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Loan not found' });
  res.json({ message: 'Loan deleted' });
});

/* =============================== WELFARE CLAIMS =============================== */
const listClaims = asyncHandler(async (req, res) => {
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.category && req.query.category !== 'all') filter.category = req.query.category;
  if (req.query.employee) filter.employee = req.query.employee;
  const items = await WelfareClaim.find(filter).populate('employee', 'firstName lastName staffId employment.department').populate('scheme', 'name').sort({ createdAt: -1 }).lean();
  res.json({ items, total: items.length });
});

const getClaim = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('WelfareClaim').findById(req.params.id).populate('employee', 'firstName lastName staffId').populate('scheme', 'name');
  if (!doc) return res.status(404).json({ message: 'Claim not found' });
  res.json(doc);
});

const createClaim = asyncHandler(async (req, res) => {
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  if (!req.body.employee || !req.body.category) return res.status(400).json({ message: 'Employee and category are required.' });
  const doc = await WelfareClaim.create({
    ...req.body, claimNumber: await seq(WelfareClaim, 'claimNumber', 'CLM'),
    amountRequested: Number(req.body.amountRequested) || 0, scheme: req.body.scheme || null,
    status: 'submitted', createdBy: req.auth.userId,
  });
  res.status(201).json(doc);
});

// PATCH /claims/:id/decision  { decision:'approve'|'reject'|'review', amountApproved, decisionNote }
const decideClaim = asyncHandler(async (req, res) => {
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  const doc = await WelfareClaim.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Claim not found' });
  const { decision } = req.body;
  doc.reviewedBy = req.auth.userId; doc.reviewedDate = new Date(); doc.decisionNote = req.body.decisionNote ?? doc.decisionNote;
  if (decision === 'review') doc.status = 'under_review';
  else if (decision === 'reject') { doc.status = 'rejected'; doc.amountApproved = 0; }
  else if (decision === 'approve') { doc.status = 'approved'; doc.amountApproved = Number(req.body.amountApproved) || doc.amountRequested; }
  await doc.save();
  res.json(doc);
});

// PATCH /claims/:id/pay  { paymentReference, paidDate }
const payClaim = asyncHandler(async (req, res) => {
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  const doc = await WelfareClaim.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Claim not found' });
  if (doc.status !== 'approved') return res.status(409).json({ message: 'Only an approved claim can be paid.' });
  doc.status = 'paid'; doc.paidDate = req.body.paidDate || new Date(); doc.paymentReference = req.body.paymentReference || '';
  await doc.save();
  res.json(doc);
});

const uploadClaimDoc = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field "file").' });
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  const doc = await WelfareClaim.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Claim not found' });
  const folder = `nexusora_wf/${req.tenant.subdomain}/welfare_claims`;
  const ext = path.extname(req.file.originalname || '') || '';
  const base = path.basename(req.file.originalname || 'document', ext).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
  const result = await uploadBuffer(req.file.buffer, { folder, publicId: `${base}_${Date.now().toString(36)}${ext}` });
  doc.documents.push({ name: req.file.originalname, url: result.secure_url, publicId: result.public_id, format: result.format || ext.replace('.', ''), bytes: result.bytes, uploadedAt: new Date() });
  await doc.save();
  res.json(doc);
});

const deleteClaim = asyncHandler(async (req, res) => {
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  const doc = await WelfareClaim.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Claim not found' });
  for (const d of doc.documents || []) { if (d.publicId) { try { await cloudinary.uploader.destroy(d.publicId, { resource_type: 'raw' }); } catch { /* */ } try { await cloudinary.uploader.destroy(d.publicId, { resource_type: 'image' }); } catch { /* */ } } }
  await doc.deleteOne();
  res.json({ message: 'Claim deleted' });
});

/* =============================== SCHEMES & CONTRIBUTIONS =============================== */
async function schemeBalance(req, scheme) {
  const contrib = (scheme.contributions || []).reduce((s, c) => s + (c.amount || 0), 0);
  let paidOut = 0;
  try {
    const claims = await req.tenantConn.model('WelfareClaim').find({ scheme: scheme._id, status: 'paid' }, 'amountApproved').lean();
    paidOut = claims.reduce((s, c) => s + (c.amountApproved || 0), 0);
  } catch { /* */ }
  return { contributions: contrib, paidOut, balance: (scheme.openingBalance || 0) + contrib - paidOut };
}

const listSchemes = asyncHandler(async (req, res) => {
  const WelfareScheme = req.tenantConn.model('WelfareScheme');
  const docs = await WelfareScheme.find(req.query.active === 'true' ? { active: true } : {}).sort({ name: 1 }).lean();
  const items = await Promise.all(docs.map(async (s) => {
    const b = await schemeBalance(req, s);
    return { ...s, contributions: undefined, contributionCount: (s.contributions || []).length, memberCount: new Set((s.contributions || []).map((c) => String(c.employee))).size, ...b };
  }));
  res.json({ items, total: items.length });
});

const getScheme = asyncHandler(async (req, res) => {
  const WelfareScheme = req.tenantConn.model('WelfareScheme');
  const doc = await WelfareScheme.findById(req.params.id).populate('contributions.employee', 'firstName lastName staffId').lean();
  if (!doc) return res.status(404).json({ message: 'Scheme not found' });
  const b = await schemeBalance(req, doc);
  res.json({ ...doc, ...b });
});

const createScheme = asyncHandler(async (req, res) => {
  const WelfareScheme = req.tenantConn.model('WelfareScheme');
  if (!req.body.name) return res.status(400).json({ message: 'A scheme name is required.' });
  const doc = await WelfareScheme.create({ ...req.body, createdBy: req.auth.userId });
  res.status(201).json(doc);
});

const updateScheme = asyncHandler(async (req, res) => {
  const WelfareScheme = req.tenantConn.model('WelfareScheme');
  const body = { ...req.body }; delete body.contributions; delete body.createdBy;
  const doc = await WelfareScheme.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!doc) return res.status(404).json({ message: 'Scheme not found' });
  res.json(doc);
});

const deleteScheme = asyncHandler(async (req, res) => {
  const doc = await req.tenantConn.model('WelfareScheme').findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Scheme not found' });
  res.json({ message: 'Scheme deleted' });
});

// POST /schemes/:id/contributions  { employee, amount, period, method, note, date }  (or contributions:[...] for bulk)
const addContribution = asyncHandler(async (req, res) => {
  const WelfareScheme = req.tenantConn.model('WelfareScheme');
  const Employee = req.tenantConn.model('Employee');
  const doc = await WelfareScheme.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Scheme not found' });
  const list = Array.isArray(req.body.contributions) ? req.body.contributions : [req.body];
  let added = 0;
  for (const c of list) {
    if (!c.employee || !c.amount) continue;
    const emp = await Employee.findById(c.employee, 'firstName lastName').lean();
    doc.contributions.push({ employee: c.employee, name: fullName(emp), amount: Number(c.amount), period: c.period || '', date: c.date || new Date(), method: c.method || 'payroll_deduction', note: c.note || '', recordedBy: req.auth.userId });
    added += 1;
  }
  await doc.save();
  res.json({ added, scheme: doc._id });
});

const deleteContribution = asyncHandler(async (req, res) => {
  const WelfareScheme = req.tenantConn.model('WelfareScheme');
  const doc = await WelfareScheme.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Scheme not found' });
  doc.contributions.pull(req.params.cid);
  await doc.save();
  res.json({ message: 'Contribution removed' });
});

/* =============================== OVERVIEW =============================== */
const overview = asyncHandler(async (req, res) => {
  const StaffLoan = req.tenantConn.model('StaffLoan');
  const WelfareClaim = req.tenantConn.model('WelfareClaim');
  const WelfareScheme = req.tenantConn.model('WelfareScheme');

  const [activeLoans, loansAgg, pendingClaims, paidAgg, schemes] = await Promise.all([
    StaffLoan.countDocuments({ status: 'active' }),
    StaffLoan.aggregate([{ $match: { status: 'active' } }, { $group: { _id: null, outstanding: { $sum: '$balance' } } }]),
    WelfareClaim.countDocuments({ status: { $in: ['submitted', 'under_review', 'approved'] } }),
    WelfareClaim.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amountApproved' }, n: { $sum: 1 } } }]),
    WelfareScheme.find({}, 'openingBalance contributions').lean(),
  ]);

  let fundBalance = 0;
  for (const s of schemes) {
    const contrib = (s.contributions || []).reduce((a, c) => a + (c.amount || 0), 0);
    fundBalance += (s.openingBalance || 0) + contrib;
  }
  const paidTotal = paidAgg[0]?.total || 0;
  fundBalance -= paidTotal;

  const byCategory = await WelfareClaim.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);

  res.json({
    loans: { active: activeLoans, outstanding: Math.round(loansAgg[0]?.outstanding || 0) },
    claims: { pending: pendingClaims, paid: paidAgg[0]?.n || 0, paidTotal: Math.round(paidTotal) },
    funds: { schemes: schemes.length, balance: Math.round(fundBalance) },
    byCategory: byCategory.map((c) => ({ label: c._id || 'other', value: c.n })),
  });
});

module.exports = {
  listLoans, getLoan, createLoan, decideLoan, addRepayment, updateLoan, deleteLoan,
  listClaims, getClaim, createClaim, decideClaim, payClaim, uploadClaimDoc, deleteClaim,
  listSchemes, getScheme, createScheme, updateScheme, deleteScheme, addContribution, deleteContribution,
  overview,
};