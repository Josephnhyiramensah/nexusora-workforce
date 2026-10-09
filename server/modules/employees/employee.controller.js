const asyncHandler = require('express-async-handler');
const cloudinary = require('../../config/cloudinary');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const ai = require('../../services/ai.service');
const fieldMap = require('../../services/fieldMapping.service');

/* ------------------------------------------------------------------ *
 *  Effective-dated history helpers.
 *  On every employee update we diff the old vs new job/compensation
 *  fields and write an EmployeeChange record per changed category.
 *  The live Employee doc keeps its current values (unchanged behaviour).
 * ------------------------------------------------------------------ */
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

const normVal = (v, type) => {
  if (v === undefined || v === null || v === '') return '';
  if (type === 'date') { const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); }
  if (type === 'number') { const n = Number(v); return isNaN(n) ? '' : String(n); }
  return String(v).trim();
};

const JOB_FIELDS = [
  ['employment.jobTitle', 'Job title', 'text'],
  ['employment.department', 'Department', 'text'],
  ['employment.section', 'Section', 'text'],
  ['employment.grade', 'Grade', 'text'],
  ['employment.workerClass', 'Worker class', 'text'],
  ['employment.employmentType', 'Employment type', 'text'],
  ['employment.costCentre', 'Cost centre', 'text'],
  ['employment.crew', 'Crew', 'text'],
  ['employment.confirmationStatus', 'Confirmation status', 'text'],
  ['employment.startDate', 'Start date', 'date'],
];
const COMP_FIELDS = [
  ['compensation.payBasis', 'Pay basis', 'text'],
  ['compensation.currency', 'Currency', 'text'],
  ['compensation.baseSalary', 'Base salary', 'number'],
  ['compensation.dailyRate', 'Daily rate', 'number'],
  ['compensation.hourlyRate', 'Hourly rate', 'number'],
  ['compensation.pieceRate.amount', 'Piece rate amount', 'number'],
  ['compensation.pieceRate.unit', 'Piece rate unit', 'text'],
];

function diffFields(prev, next, specs) {
  const changes = [];
  for (const [field, label, type] of specs) {
    const from = normVal(getPath(prev, field), type);
    const to = normVal(getPath(next, field), type);
    if (from !== to) changes.push({ field, label, from, to });
  }
  return changes;
}

function buildChangeEvents(prev, next, employee, effectiveDate, changedBy, note) {
  const events = [];
  const job = diffFields(prev, next, JOB_FIELDS);
  if (job.length) events.push({ employee, category: 'job', effectiveDate, changes: job, snapshot: next.employment || {}, note, changedBy });
  const comp = diffFields(prev, next, COMP_FIELDS);
  if (comp.length) events.push({ employee, category: 'compensation', effectiveDate, changes: comp, snapshot: next.compensation || {}, note, changedBy });
  return events;
}

/* ------------------------------------------------------------------ */

const list = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const { q, department, status, manager, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (department) filter['employment.department'] = department;
  // Direct-reports lookup for the org chart: GET /employees?manager=<employeeId>
  if (manager) filter['employment.lineManager'] = manager;
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
  const Employee = req.tenantConn.model('Employee');
  // Ensure referenced models are registered on this connection before populate.
  req.tenantConn.model('Position');
  req.tenantConn.model('OrgUnit');
  const e = await Employee.findById(req.params.id)
    .populate('employment.positionId', 'title code')
    // Widened so the org chart's manager node can show an avatar + title.
    .populate('employment.lineManager', 'firstName lastName photo employment.jobTitle')
    .populate('employment.departmentId', 'name code')
    .populate('employment.sectionId', 'name code');
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
  const Employee = req.tenantConn.model('Employee');
  const EmployeeChange = req.tenantConn.model('EmployeeChange');

  // Snapshot BEFORE for the diff.
  const before = await Employee.findById(req.params.id);
  if (!before) return res.status(404).json({ message: 'Employee not found' });
  const prev = before.toObject();

  // effectiveDate / changeNote are history metadata — never written to the Employee doc.
  const { effectiveDate, changeNote, ...body } = req.body;

  const updated = await Employee.findByIdAndUpdate(
    req.params.id,
    { ...body, updatedAt: new Date() },
    { new: true, runValidators: true },
  );
  const next = updated.toObject();

  // Effective-dated history — must never block the actual save.
  try {
    const effDate = effectiveDate ? new Date(effectiveDate) : new Date();
    const who = req.auth?.userId || '';
    const events = buildChangeEvents(prev, next, req.params.id, effDate, who, changeNote || '');
    if (events.length) await EmployeeChange.insertMany(events);
  } catch (e) { /* history logging is best-effort; a save must still succeed */ }

  res.json(updated);
});

// GET /employees/:id/history?category=job|compensation
const history = asyncHandler(async (req, res) => {
  const EmployeeChange = req.tenantConn.model('EmployeeChange');
  const filter = { employee: req.params.id };
  if (req.query.category) filter.category = req.query.category;
  const items = await EmployeeChange.find(filter).sort({ effectiveDate: -1, changedAt: -1 });
  res.json({ items, total: items.length });
});

/* ------------------------------------------------------------------ *
 *  Self-service: resolve the CALLER's own employee record.
 *  Linked via User.employee; falls back to email match. These endpoints
 *  return only the signed-in user's own data, so they are safe for the
 *  'employee' role that cannot read the general /employees list.
 * ------------------------------------------------------------------ */
async function resolveMyEmployeeId(req) {
  const User = req.tenantConn.model('User');
  const Employee = req.tenantConn.model('Employee');
  const u = await User.findById(req.auth.userId).select('employee email');
  if (u?.employee) return u.employee;
  if (u?.email) {
    const doc = await Employee.findOne({ email: u.email }).select('_id');
    if (doc) return doc._id;
  }
  return null;
}

// GET /employees/me — the signed-in user's own employee record (populated).
const getMe = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  req.tenantConn.model('Position');
  req.tenantConn.model('OrgUnit');
  const myId = await resolveMyEmployeeId(req);
  if (!myId) return res.status(404).json({ message: 'No employee record is linked to your account.' });
  const e = await Employee.findById(myId)
    .populate('employment.positionId', 'title code')
    .populate('employment.lineManager', 'firstName lastName photo employment.jobTitle')
    .populate('employment.departmentId', 'name code')
    .populate('employment.sectionId', 'name code');
  if (!e) return res.status(404).json({ message: 'No employee record is linked to your account.' });
  res.json(e);
});

// GET /employees/me/team — the signed-in user's direct reports.
const myTeam = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const myId = await resolveMyEmployeeId(req);
  if (!myId) return res.json({ items: [], total: 0 });
  const items = await Employee.find({ 'employment.lineManager': myId }).sort({ firstName: 1, lastName: 1 });
  res.json({ items, total: items.length });
});

// GET /employees/me/leave — my leave types (for the request form), my requests,
// and days taken by type this year. Full entitlement/remaining balance is wired
// to the leave engine separately.
const getMyLeave = asyncHandler(async (req, res) => {
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const LeaveType = req.tenantConn.model('LeaveType');
  const myId = await resolveMyEmployeeId(req);
  if (!myId) return res.status(404).json({ message: 'No employee record is linked to your account.' });

  const [types, requests] = await Promise.all([
    LeaveType.find({ active: true }).sort({ name: 1 }),
    LeaveRequest.find({ employee: myId }).populate('leaveType', 'name code color paid').sort({ startDate: -1 }),
  ]);

  const year = new Date().getFullYear();
  const tally = {};
  for (const r of requests) {
    if (r.status !== 'approved') continue;
    if (new Date(r.startDate).getFullYear() !== year) continue;
    const key = r.leaveType?.name || 'Other';
    tally[key] = (tally[key] || 0) + (r.days || 0);
  }
  const takenByType = Object.entries(tally).map(([type, days]) => ({ type, days }));
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  res.json({ types, requests, takenByType, pendingCount });
});

// POST /employees/me/leave — submit a leave request for myself (goes to 'pending').
const submitMyLeave = asyncHandler(async (req, res) => {
  const LeaveRequest = req.tenantConn.model('LeaveRequest');
  const myId = await resolveMyEmployeeId(req);
  if (!myId) return res.status(404).json({ message: 'No employee record is linked to your account.' });

  const { leaveType, startDate, endDate, reason } = req.body;
  if (!leaveType || !startDate || !endDate) {
    return res.status(400).json({ message: 'Leave type, start date and end date are required.' });
  }
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) {
    return res.status(400).json({ message: 'Please provide a valid date range.' });
  }
  // Working-days count (Mon–Fri, inclusive). The leave engine may refine this on approval.
  let days = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days += 1;
  }

  const doc = await LeaveRequest.create({
    employee: myId, leaveType, startDate: s, endDate: e, days,
    reason: reason || '', status: 'pending', createdBy: req.auth.userId,
  });
  await doc.populate('leaveType', 'name code color paid');
  res.status(201).json(doc);
});

// GET /employees/me/payslips — my payslips from approved/paid runs.
// payslips[] is engine output (Mixed), so we match on the common identity keys.
const getMyPayslips = asyncHandler(async (req, res) => {
  const PayrollRun = req.tenantConn.model('PayrollRun');
  const Employee = req.tenantConn.model('Employee');
  const myId = await resolveMyEmployeeId(req);
  if (!myId) return res.status(404).json({ message: 'No employee record is linked to your account.' });

  const meDoc = await Employee.findById(myId).select('staffId');
  const myStr = String(myId);
  const staffId = meDoc?.staffId;

  const matchesMe = (p) => {
    if (!p || typeof p !== 'object') return false;
    const ids = [p.employee, p.employeeId, p.empId, p.id, p.employee && p.employee._id]
      .filter((x) => x != null).map((x) => String(x));
    if (ids.includes(myStr)) return true;
    if (staffId && (p.staffId === staffId || p.staffNo === staffId || p.staff_id === staffId)) return true;
    return false;
  };

  const runs = await PayrollRun.find({ status: { $in: ['approved', 'paid'] } }).sort({ period: -1 });
  const items = [];
  for (const run of runs) {
    const slip = (run.payslips || []).find(matchesMe);
    if (slip) items.push({ runId: run._id, period: run.period, label: run.label, status: run.status, currency: run.currency, payslip: slip });
  }
  res.json({ items, total: items.length });
});

// GET /employees/me/attendance — my recent attendance rows.
const getMyAttendance = asyncHandler(async (req, res) => {
  const Attendance = req.tenantConn.model('Attendance');
  const myId = await resolveMyEmployeeId(req);
  if (!myId) return res.status(404).json({ message: 'No employee record is linked to your account.' });
  const items = await Attendance.find({ employee: myId }).sort({ date: -1 }).limit(60);
  res.json({ items, total: items.length });
});

const deactivate = asyncHandler(async (req, res) => {
  const { terminationDate, terminationReason } = req.body || {};
  const patch = {
    status: 'terminated',
    updatedAt: new Date(),
    'employment.confirmationStatus': 'exited',
    'employment.terminationDate': terminationDate ? new Date(terminationDate) : new Date(),
  };
  if (terminationReason) patch['employment.terminationReason'] = terminationReason;
  const e = await req.tenantConn.model('Employee').findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!e) return res.status(404).json({ message: 'Employee not found' });
  res.json({ message: 'Employee offboarded', employee: e });
});

/* Bulk import lives in importAnalyze + importCommit (smart mapping, dedupe,
 * validation). These helpers are shared with that pipeline. */
function setPath(obj, path, val) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = o[keys[i]] || {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = val;
}
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text).trim();       // rich text / hyperlink
    if (v.result != null) return v.result;                  // formula result
    return String(v).trim();
  }
  return String(v).trim();
}


/* ------------------------------------------------------------------ *
 *  Bulk import — ANALYSE (dry run) — POST /employees/import/analyze.
 *  Reads the file, proposes a column→field mapping (deterministic, with
 *  an optional AI refine for leftovers), and returns a validation preview.
 *  Writes NOTHING to the database — this is the "understand it first" step.
 * ------------------------------------------------------------------ */
async function parseSheet(file) {
  const wb = new ExcelJS.Workbook();
  const fname = (file.originalname || '').toLowerCase();
  if (fname.endsWith('.csv')) await wb.csv.read(Readable.from(file.buffer.toString('utf8')));
  else await wb.xlsx.load(file.buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers = [];
  ws.getRow(1).eachCell((cell, col) => { headers[col - 1] = String(cellText(cell) || '').trim(); });
  const width = headers.length;
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row || row.actualCellCount === 0) continue;
    const arr = [];
    for (let c = 1; c <= width; c++) arr[c - 1] = cellText(row.getCell(c));
    if (arr.every((v) => v === '' || v == null)) continue;
    rows.push(arr);
  }
  return { headers: headers.map((h) => h || ''), rows };
}

// Ask the AI to map the columns the deterministic matcher left over. Optional:
// if AI is off or errors, we simply return nothing and the columns stay unmapped.
async function aiRefineMapping(unmapped, headers, rows, taken) {
  if (!ai.isConfigured() || !unmapped.length) return { added: [], used: false };
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const samples = unmapped.slice(0, 25).map((u) => ({
    header: u.source,
    samples: rows.slice(0, 6).map((r) => r[idx[u.source]]).filter((v) => v != null && v !== '').map(String).slice(0, 3),
  }));
  const fields = fieldMap.catalogueForUI().filter((f) => !taken[f.field]).map((f) => ({ field: f.field, label: f.label, type: f.type }));
  if (!fields.length) return { added: [], used: false };
  const system = 'You map messy spreadsheet column headers to a FIXED set of HR employee fields. Return STRICT JSON only: an object {"<header>": "<field key or null>"} using ONLY the provided field keys. Use the sample values as evidence (e.g. values that look like money → a salary/rate field; dates → a date field). Return null for a header that fits none. Never invent field keys.';
  const user = `FIELD KEYS:\n${JSON.stringify(fields)}\n\nUNMAPPED COLUMNS (with sample values):\n${JSON.stringify(samples)}\n\nReturn the JSON map.`;
  let out;
  try { out = await ai.completeJSON({ system, messages: [{ role: 'user', content: user }], maxTokens: 900 }); }
  catch (e) { return { added: [], used: false }; }
  const valid = new Set(fields.map((f) => f.field));
  const added = [];
  for (const [header, field] of Object.entries(out || {})) {
    if (!field || !valid.has(field) || taken[field] || !headers.includes(header)) continue;
    taken[field] = header;
    const entry = fieldMap.CATALOGUE.find((c) => c.field === field) || {};
    added.push({ source: header, field, label: entry.label || field, confidence: 'ai', score: null, reason: 'suggested by AI from sample values' });
  }
  return { added, used: true };
}

const importAnalyze = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  let parsed;
  try { parsed = await parseSheet(req.file); }
  catch (e) { return res.status(400).json({ message: 'Could not read the file. Upload a valid .xlsx or .csv.' }); }
  const { headers, rows } = parsed;
  if (!headers.length) return res.status(400).json({ message: 'The file has no header row.' });
  if (!rows.length) return res.status(400).json({ message: 'The file has a header row but no data rows.' });

  // Re-preview with an edited mapping (from the wizard's Review step) — no re-map.
  if (req.body.mapping) {
    let m; try { m = JSON.parse(req.body.mapping); } catch { m = null; }
    if (Array.isArray(m)) {
      const fullMapping = fieldMap.augmentFullName(headers, m);
      const preview = fieldMap.buildPreview(headers, rows, fullMapping, { limit: 20 });
      return res.json({ file: req.file.originalname, rowCount: rows.length, columns: headers, mapping: fullMapping, unmapped: [], aiRefined: false, aiAdded: 0, catalogue: fieldMap.catalogueForUI(), preview });
    }
  }

  const { mapping, unmapped, byField } = fieldMap.mapColumns(headers);
  const taken = { ...byField };
  const { added, used } = await aiRefineMapping(unmapped, headers, rows, taken);
  let fullMapping = [...mapping, ...added].sort((a, b) => headers.indexOf(a.source) - headers.indexOf(b.source));
  fullMapping = fieldMap.augmentFullName(headers, fullMapping);   // single "Name" column → split into first/last
  const usedSources = new Set(fullMapping.map((m) => m.source));
  const stillUnmapped = unmapped.filter((u) => !usedSources.has(u.source));
  const preview = fieldMap.buildPreview(headers, rows, fullMapping, { limit: 20 });

  res.json({
    file: req.file.originalname,
    rowCount: rows.length,
    columns: headers,
    mapping: fullMapping,
    unmapped: stillUnmapped,
    aiRefined: used,
    aiAdded: added.length,
    catalogue: fieldMap.catalogueForUI(),
    preview,
  });
});

/* ------------------------------------------------------------------ *
 *  Bulk import — COMMIT — POST /employees/import/commit.
 *  Multipart: file + mapping (JSON, the confirmed/edited mapping) +
 *  updateExisting ("true"/"false"). Dedupes on staffId: new → insert;
 *  existing → skip, or update when the toggle is on. Rows that can't
 *  resolve (missing first/last after a full-name split, bad values) are
 *  NOT written — they come back in rejectedRows for HR to fix and re-import.
 * ------------------------------------------------------------------ */
const importCommit = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const updateExisting = String(req.body.updateExisting) === 'true';

  // Two entry modes: a raw file (first import), or corrected field-keyed rows
  // coming back from the wizard's rejected-rows editor (fix & re-import).
  let built;
  if (req.file) {
    let parsed;
    try { parsed = await parseSheet(req.file); }
    catch (e) { return res.status(400).json({ message: 'Could not read the file. Upload a valid .xlsx or .csv.' }); }
    const { headers, rows } = parsed;
    if (!headers.length || !rows.length) return res.status(400).json({ message: 'The file has no header row or no data rows.' });

    let mapping;
    if (req.body.mapping) {
      try { mapping = JSON.parse(req.body.mapping); } catch { return res.status(400).json({ message: 'Invalid mapping payload.' }); }
      if (!Array.isArray(mapping)) return res.status(400).json({ message: 'Mapping must be an array of {source, field}.' });
    } else {
      mapping = fieldMap.mapColumns(headers).mapping;
    }
    mapping = fieldMap.augmentFullName(headers, mapping);
    built = rows.map((r, i) => ({ i, row: i + 2, ...fieldMap.rowToDoc(headers, r, mapping) }));
  } else if (req.body.rows) {
    let rowsJson;
    try { rowsJson = JSON.parse(req.body.rows); } catch { return res.status(400).json({ message: 'Invalid rows payload.' }); }
    if (!Array.isArray(rowsJson) || !rowsJson.length) return res.status(400).json({ message: 'No rows to import.' });
    built = rowsJson.map((obj, i) => ({ i, row: obj.row || (i + 1), ...fieldMap.docFromFields(obj) }));
  } else {
    return res.status(400).json({ message: 'Provide a file, or corrected rows to re-import.' });
  }
  const existingIds = new Set();
  const wantIds = [...new Set(built.filter((b) => b.valid && b.staffId).map((b) => b.staffId))];
  if (wantIds.length) {
    const found = await Employee.find({ staffId: { $in: wantIds } }).select('staffId').lean();
    found.forEach((e) => existingIds.add(String(e.staffId)));
  }

  const { toInsert, toUpdate, toSkip, rejected } = fieldMap.planImport(built, existingIds, { updateExisting });
  const baseCurrency = req.tenant && req.tenant.baseCurrency;
  const errors = [];

  // Inserts (nested docs). ordered:false so one bad row doesn't abort the rest.
  let inserted = 0;
  if (toInsert.length) {
    const docs = toInsert.map((r) => {
      const d = r.doc;
      if (d.compensation && !d.compensation.currency && baseCurrency) d.compensation.currency = baseCurrency;
      d.createdAt = new Date();
      return d;
    });
    try {
      const ins = await Employee.insertMany(docs, { ordered: false });
      inserted = ins.length;
    } catch (e) {
      inserted = (e && Array.isArray(e.insertedDocs)) ? e.insertedDocs.length : 0;
      if (e && Array.isArray(e.writeErrors)) {
        e.writeErrors.slice(0, 50).forEach((we) => errors.push({ row: '—', error: (we.err && we.err.errmsg) || we.errmsg || 'insert failed' }));
      }
    }
  }

  // Updates (partial $set via dotted flat paths, so we only touch mapped fields).
  let updated = 0;
  if (toUpdate.length) {
    const ops = toUpdate.map((r) => {
      const set = { ...r.flat, updatedAt: new Date() };
      delete set.staffId;  // never rewrite the match key
      return { updateOne: { filter: { staffId: r.staffId }, update: { $set: set } } };
    });
    try {
      const bw = await Employee.bulkWrite(ops, { ordered: false });
      updated = (bw && (bw.modifiedCount != null ? bw.modifiedCount : bw.nModified)) || 0;
    } catch (e) {
      if (e && Array.isArray(e.writeErrors)) e.writeErrors.slice(0, 50).forEach((we) => errors.push({ row: '—', error: we.errmsg || 'update failed' }));
    }
  }

  res.json({
    file: req.file.originalname,
    total: built.length,
    inserted,
    updated,
    skipped: toSkip.length,
    rejected: rejected.length,
    updateExisting,
    errors: errors.slice(0, 100),
    // Rejected rows come back so HR can correct and re-import just these.
    rejectedRows: rejected.slice(0, 300).map((r) => ({ row: r.row, data: r.flat, issues: r.issues })),
  });
});

function uploadBuffer(buffer, { folder, resourceType = 'auto' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found' });

  const folder = `workforce/${req.auth.tenant}/employees/${emp._id}/documents`;
  const result = await uploadBuffer(req.file.buffer, { folder, resourceType: 'auto' });

  const doc = {
    name: req.body.name || req.file.originalname || 'Document',
    type: req.body.type || 'other',
    url: result.secure_url,
    publicId: result.public_id,
    format: result.format || (req.file.mimetype || '').split('/')[1] || '',
    bytes: result.bytes || req.file.size || 0,
    uploadedAt: new Date(),
    uploadedBy: req.auth.userId || '',
  };
  emp.documents.push(doc);
  emp.updatedAt = new Date();
  await emp.save();
  res.status(201).json({ message: 'Document uploaded', documents: emp.documents });
});

const deleteDocument = asyncHandler(async (req, res) => {
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found' });

  const doc = emp.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  if (doc.publicId) {
    try {
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'raw' });
      await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'image' });
    } catch (e) { /* ignore — record removal is the source of truth */ }
  }
  doc.deleteOne();
  emp.updatedAt = new Date();
  await emp.save();
  res.json({ message: 'Document removed', documents: emp.documents });
});

const uploadPhoto = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file").' });
  if (!(req.file.mimetype || '').startsWith('image/')) {
    return res.status(400).json({ message: 'Photo must be an image file.' });
  }
  const Employee = req.tenantConn.model('Employee');
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ message: 'Employee not found' });

  const folder = `workforce/${req.auth.tenant}/employees/${emp._id}/photo`;
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
      },
      (err, r) => (err ? reject(err) : resolve(r)),
    );
    stream.end(req.file.buffer);
  });

  emp.photo = result.secure_url;
  emp.updatedAt = new Date();
  await emp.save();
  res.json({ message: 'Photo updated', photo: emp.photo });
});

module.exports = { list, getById, getMe, myTeam, getMyLeave, submitMyLeave, getMyPayslips, getMyAttendance, create, update, history, deactivate, importAnalyze, importCommit, uploadDocument, deleteDocument, uploadPhoto };