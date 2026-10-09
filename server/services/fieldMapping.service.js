// Intelligent column → Employee-field mapping for bulk import.
//
// Takes the header names from an arbitrary HR export and proposes how each one
// maps onto our Employee schema, with a confidence and a human reason. Pure and
// deterministic (synonyms + normalisation + token overlap + fuzzy distance) —
// no AI, no DB, no network. The AI layer (in the controller) only *refines* the
// columns this leaves unmapped, so the whole thing still works with AI off.
//
// Also coerces raw cell values to the right type (number / date / enum) and
// builds a validation preview, so nothing is written to the database blind.

/* ----------------------------- the catalogue ----------------------------- */
// field: dotted path on the Employee doc. type drives coercion. required rows
// must be present for an import row to be valid. synonyms are the human header
// names we expect to see in the wild (normalised before matching).
const CATALOGUE = [
  { field: 'staffId', label: 'Staff ID', type: 'string',
    synonyms: ['staff id', 'staff no', 'staff number', 'employee id', 'emp id', 'emp no', 'employee number', 'employee no', 'personnel number', 'personnel no', 'badge', 'badge no', 'payroll number', 'payroll no'] },
  { field: 'firstName', label: 'First name', type: 'string', required: true,
    synonyms: ['first name', 'firstname', 'first', 'given name', 'givenname', 'forename', 'other names', 'othernames'] },
  { field: 'lastName', label: 'Last name', type: 'string', required: true,
    synonyms: ['last name', 'lastname', 'last', 'surname', 'family name', 'familyname'] },
  { field: 'preferredName', label: 'Preferred name', type: 'string',
    synonyms: ['preferred name', 'known as', 'nickname', 'short name'] },
  { field: 'gender', label: 'Gender', type: 'enum', enumKey: 'gender',
    synonyms: ['gender', 'sex'] },
  { field: 'maritalStatus', label: 'Marital status', type: 'enum', enumKey: 'maritalStatus',
    synonyms: ['marital status', 'marital', 'marriage status'] },
  { field: 'nationality', label: 'Nationality', type: 'string',
    synonyms: ['nationality', 'citizenship', 'country'] },
  { field: 'dateOfBirth', label: 'Date of birth', type: 'date',
    synonyms: ['date of birth', 'dob', 'd.o.b', 'birth date', 'birthdate', 'birthday'] },
  { field: 'nationalId', label: 'National ID', type: 'string',
    synonyms: ['national id', 'national identification', 'ghana card', 'ghana card number', 'id number', 'nid', 'voter id'] },
  { field: 'email', label: 'Email', type: 'string',
    synonyms: ['email', 'e-mail', 'email address', 'work email', 'mail'] },
  { field: 'phone', label: 'Phone', type: 'string',
    synonyms: ['phone', 'mobile', 'telephone', 'contact', 'phone number', 'mobile number', 'mobile no', 'cell', 'cellphone', 'tel'] },
  { field: 'address', label: 'Address', type: 'string',
    synonyms: ['address', 'residential address', 'home address', 'postal address', 'location'] },
  { field: 'employment.jobTitle', label: 'Job title', type: 'string',
    synonyms: ['job title', 'jobtitle', 'position', 'designation', 'role', 'title', 'job role'] },
  { field: 'employment.department', label: 'Department', type: 'string',
    synonyms: ['department', 'dept', 'division', 'directorate'] },
  { field: 'employment.section', label: 'Section', type: 'string',
    synonyms: ['section', 'estate', 'subunit', 'sub unit', 'team'] },
  { field: 'employment.grade', label: 'Grade', type: 'string',
    synonyms: ['grade', 'job grade', 'salary grade', 'level', 'band'] },
  { field: 'employment.employmentType', label: 'Employment type', type: 'string',
    synonyms: ['employment type', 'emp type', 'engagement type', 'employmenttype'] },
  { field: 'employment.workerClass', label: 'Worker class', type: 'string',
    synonyms: ['worker class', 'class', 'staff category', 'category', 'staff class', 'worker category'] },
  { field: 'employment.startDate', label: 'Start / hire date', type: 'date',
    synonyms: ['start date', 'startdate', 'date joined', 'joining date', 'join date', 'hire date', 'date employed', 'employment date', 'date of appointment', 'appointment date', 'doj', 'engagement date'] },
  { field: 'employment.confirmationStatus', label: 'Confirmation status', type: 'enum', enumKey: 'confirmationStatus',
    synonyms: ['confirmation status', 'confirmation', 'confirmed'] },
  { field: 'compensation.payBasis', label: 'Pay basis', type: 'enum', enumKey: 'payBasis',
    synonyms: ['pay basis', 'payment basis', 'pay type'] },
  { field: 'compensation.currency', label: 'Currency', type: 'string',
    synonyms: ['currency', 'pay currency', 'salary currency'] },
  { field: 'compensation.baseSalary', label: 'Base salary', type: 'number',
    synonyms: ['base salary', 'basic salary', 'basic pay', 'basic', 'salary', 'monthly salary', 'gross salary', 'gross pay', 'basic monthly salary'] },
  { field: 'compensation.dailyRate', label: 'Daily rate', type: 'number',
    synonyms: ['daily rate', 'rate per day', 'day rate'] },
  { field: 'compensation.hourlyRate', label: 'Hourly rate', type: 'number',
    synonyms: ['hourly rate', 'rate per hour', 'hour rate'] },
  { field: 'statutory.socialSecurityNumber', label: 'SSNIT / social security no.', type: 'string',
    synonyms: ['ssnit', 'ssnit number', 'ssnit no', 'social security number', 'social security no', 'ssn'] },
  { field: 'statutory.taxId', label: 'Tax ID / TIN', type: 'string',
    synonyms: ['tax id', 'tin', 'tax identification number', 'tax number'] },
  { field: 'education.level', label: 'Education level', type: 'string',
    synonyms: ['education level', 'highest qualification', 'qualification', 'education'] },
  { field: 'status', label: 'Status', type: 'enum', enumKey: 'status',
    synonyms: ['status', 'employee status', 'employment status', 'staff status'] },
];

const FIELD_BY_PATH = Object.fromEntries(CATALOGUE.map((c) => [c.field, c]));

// Enum value normalisation — maps the many ways people write a value to our
// schema's allowed value. Unknowns fall through to a sensible default or null.
const ENUMS = {
  gender: { map: { m: 'male', male: 'male', man: 'male', boy: 'male', f: 'female', female: 'female', woman: 'female', girl: 'female' }, allowed: ['male', 'female', 'other'], fallback: 'other' },
  maritalStatus: { map: { single: 'single', unmarried: 'single', married: 'married', divorced: 'divorced', widow: 'widowed', widowed: 'widowed', widower: 'widowed', separated: 'separated' }, allowed: ['single', 'married', 'divorced', 'widowed', 'separated'], fallback: null },
  confirmationStatus: { map: { probation: 'probation', probationary: 'probation', confirmed: 'confirmed', permanent: 'confirmed', exited: 'exited', left: 'exited' }, allowed: ['probation', 'confirmed', 'exited'], fallback: null },
  payBasis: { map: { salary: 'salary', salaried: 'salary', monthly: 'salary', daily: 'daily', day: 'daily', hourly: 'hourly', hour: 'hourly', piece: 'piece_rate', piece_rate: 'piece_rate', piecerate: 'piece_rate', task: 'task' }, allowed: ['salary', 'daily', 'hourly', 'piece_rate', 'task'], fallback: null },
  status: { map: { active: 'active', working: 'active', current: 'active', suspended: 'suspended', suspend: 'suspended', terminated: 'terminated', exited: 'terminated', left: 'terminated', resigned: 'terminated', inactive: 'terminated', separated: 'terminated' }, allowed: ['active', 'suspended', 'terminated'], fallback: null },
};

/* ------------------------------ text utils ------------------------------ */
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const compact = (s) => norm(s).replace(/ /g, '');
const tokens = (s) => norm(s).split(' ').filter(Boolean);

// Levenshtein distance → similarity ratio 0..1 (for typo tolerance).
function ratio(a, b) {
  a = compact(a); b = compact(b);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}
function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/* --------------------------- the matcher core --------------------------- */
// Score one header against one catalogue entry. Returns {score, reason}.
function scoreField(header, entry) {
  const h = norm(header), hc = compact(header);
  let best = { score: 0, reason: '' };
  const consider = (score, reason) => { if (score > best.score) best = { score, reason }; };

  const names = [entry.label, ...entry.synonyms];
  for (const name of names) {
    const n = norm(name);
    if (h === n) return { score: 1, reason: `matches “${name}”` };           // exact synonym — unbeatable
    if (hc === compact(name)) consider(0.97, `matches “${name}”`);            // exact ignoring spacing
    // whole-synonym contained as a phrase (e.g. header "basic pay (ghs)" ⊃ "basic pay")
    if (n.length >= 3 && (h.includes(n) || n.includes(h))) consider(0.86, `contains “${name}”`);
    const j = jaccard(h, name);
    if (j > 0) consider(0.6 + 0.3 * j, `word overlap with “${name}”`);
    const r = ratio(h, name);
    if (r >= 0.82) consider(0.55 + 0.4 * (r - 0.82) / 0.18, `close spelling to “${name}”`);
  }
  return best;
}

// Map an array of header strings → a proposal.
// Returns { mapping:[{source,field,label,confidence,score,reason}], unmapped:[...],
//           byField:{field:source} }. One source per field (best score wins;
//           losers are reported as unmapped with a duplicate reason).
function mapColumns(headers, { threshold = 0.6 } = {}) {
  const cols = (headers || []).map((h) => String(h == null ? '' : h).trim()).filter((h) => h !== '');
  const candidates = [];
  for (const source of cols) {
    let top = { field: null, label: null, score: 0, reason: '' };
    for (const entry of CATALOGUE) {
      const s = scoreField(source, entry);
      if (s.score > top.score) top = { field: entry.field, label: entry.label, score: s.score, reason: s.reason };
    }
    candidates.push({ source, ...top });
  }
  // Resolve one-source-per-field by best score.
  candidates.sort((a, b) => b.score - a.score);
  const takenField = {}, mapping = [], unmapped = [];
  for (const c of candidates) {
    if (c.score < threshold || !c.field) { unmapped.push({ source: c.source, reason: 'no confident match' }); continue; }
    if (takenField[c.field]) { unmapped.push({ source: c.source, reason: `“${takenField[c.field]}” already maps to ${FIELD_BY_PATH[c.field].label}` }); continue; }
    takenField[c.field] = c.source;
    mapping.push({
      source: c.source, field: c.field, label: c.label,
      confidence: c.score >= 0.9 ? 'high' : (c.score >= 0.72 ? 'medium' : 'low'),
      score: Math.round(c.score * 100) / 100, reason: c.reason,
    });
  }
  // Restore natural column order for display.
  mapping.sort((a, b) => cols.indexOf(a.source) - cols.indexOf(b.source));
  const byField = Object.fromEntries(mapping.map((m) => [m.field, m.source]));
  return { mapping, unmapped, byField };
}

/* --------------------------- value coercion ----------------------------- */
function coerceDate(raw) {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  // DD/MM/YYYY or DD-MM-YYYY (common outside the US) → ISO.
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}
function coerceNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function coerceEnum(key, raw) {
  const spec = ENUMS[key];
  if (!spec) return { value: String(raw).trim(), ok: true };
  const n = norm(raw);
  if (!n) return { value: null, ok: true };
  if (spec.map[n]) return { value: spec.map[n], ok: true };
  if (spec.allowed.includes(n)) return { value: n, ok: true };
  if (spec.fallback) return { value: spec.fallback, ok: true, note: `“${raw}” → ${spec.fallback}` };
  return { value: null, ok: false, note: `unrecognised value “${raw}”` };
}

// Coerce one raw cell for a target field. Returns {value, ok, issue?}.
function coerceValue(field, raw) {
  const entry = FIELD_BY_PATH[field];
  if (entry == null) return { value: raw, ok: true };
  if (raw == null || String(raw).trim() === '') return { value: null, ok: true };
  if (entry.type === 'number') {
    const v = coerceNumber(raw);
    return v == null ? { value: null, ok: false, issue: `“${raw}” is not a number` } : { value: v, ok: true };
  }
  if (entry.type === 'date') {
    const v = coerceDate(raw);
    return v == null ? { value: null, ok: false, issue: `“${raw}” is not a date` } : { value: v, ok: true };
  }
  if (entry.type === 'enum') {
    const r = coerceEnum(entry.enumKey, raw);
    return r.ok ? { value: r.value, ok: true, issue: r.note } : { value: null, ok: false, issue: r.note };
  }
  return { value: String(raw).trim(), ok: true };
}

/* --------------------------- full-name split ---------------------------- */
const FULLNAME = '__fullName__';
const FULLNAME_SYNS = ['full name', 'fullname', 'name', 'employee name', 'staff name', 'full names', 'names'];

// "Mensah, Ama" → first Ama / last Mensah; "Ama Yaa Mensah" → first Ama / last "Yaa Mensah".
function splitFullName(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  if (!s) return { firstName: '', lastName: '' };
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((x) => x.trim());
    return { firstName: first || '', lastName: last || '' };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// Decide whether a single "name" column should be split into first + last.
// An explicit full-name header (exactly "Name" / "Full Name" / …) wins unless a
// real first OR last name is mapped from a DIFFERENT column. Otherwise, only when
// no first/last is mapped at all, fall back to any unmapped name-ish column.
function detectFullNameColumn(headers, mapping) {
  const mp = mapping || [];
  const explicit = (headers || []).find((h) => FULLNAME_SYNS.includes(norm(h)));
  if (explicit) {
    const otherFirst = mp.some((m) => m.field === 'firstName' && m.source !== explicit);
    const otherLast = mp.some((m) => m.field === 'lastName' && m.source !== explicit);
    return (otherFirst || otherLast) ? null : explicit;
  }
  if (mp.some((m) => m.field === 'firstName' || m.field === 'lastName')) return null;
  const used = new Set(mp.map((m) => m.source));
  return (headers || []).find((h) => !used.has(h) && norm(h).includes('name') && !norm(h).includes('user') && !norm(h).includes('file')) || null;
}

// Replace any weak mapping on the chosen name column with a "split into
// first/last" instruction.
function augmentFullName(headers, mapping) {
  const col = detectFullNameColumn(headers, mapping);
  if (!col) return mapping || [];
  const cleaned = (mapping || []).filter((m) => m.source !== col);
  return [...cleaned, { source: col, field: FULLNAME, label: 'Full name → first/last', confidence: 'high', score: null, reason: 'split into first & last name' }];
}

/* ----------------------- row → Employee document ------------------------ */
function setPath(obj, path, val) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { o[keys[i]] = o[keys[i]] || {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = val;
}

// Turn one raw row into a nested Employee doc + a flat field map, collecting
// coercion/validation issues. Shared by the preview AND the commit, so what HR
// sees is exactly what gets written. required = first + last name present.
function rowToDoc(headers, row, mapping) {
  const getCell = (header) => (Array.isArray(row) ? row[headers.indexOf(header)] : row[header]);
  const doc = {}; const flat = {}; const issues = [];
  for (const m of (mapping || [])) {
    const raw = getCell(m.source);
    if (m.field === FULLNAME) {
      const { firstName, lastName } = splitFullName(raw);
      if (firstName) { setPath(doc, 'firstName', firstName); flat.firstName = firstName; }
      if (lastName) { setPath(doc, 'lastName', lastName); flat.lastName = lastName; }
      continue;
    }
    const { value, ok, issue } = coerceValue(m.field, raw);
    if (!ok && issue) { issues.push(`${m.label}: ${issue}`); continue; }
    if (value != null && value !== '') { setPath(doc, m.field, value); flat[m.field] = value; }
  }
  const requiredFields = CATALOGUE.filter((c) => c.required).map((c) => c.field);
  const missingReq = requiredFields.filter((f) => flat[f] == null || flat[f] === '');
  missingReq.forEach((f) => issues.unshift(`${FIELD_BY_PATH[f].label} is missing (required)`));
  const valid = missingReq.length === 0;
  return { doc, flat, issues, valid, staffId: flat.staffId ? String(flat.staffId).trim() : '' };
}

// Build a doc from an object already keyed by our field paths (e.g. corrected
// rows coming back from the wizard's rejected-rows editor). Coerces + validates
// the same way as a mapped row, so the fix-and-re-import path is consistent.
function docFromFields(obj) {
  const doc = {}; const flat = {}; const issues = [];
  for (const [field, raw] of Object.entries(obj || {})) {
    if (field === 'row' || field === '__row') continue;
    if (!FIELD_BY_PATH[field]) { if (raw != null && raw !== '') { setPath(doc, field, raw); flat[field] = raw; } continue; }
    const { value, ok, issue } = coerceValue(field, raw);
    if (!ok && issue) { issues.push(`${FIELD_BY_PATH[field].label}: ${issue}`); continue; }
    if (value != null && value !== '') { setPath(doc, field, value); flat[field] = value; }
  }
  const requiredFields = CATALOGUE.filter((c) => c.required).map((c) => c.field);
  const missingReq = requiredFields.filter((f) => flat[f] == null || flat[f] === '');
  missingReq.forEach((f) => issues.unshift(`${FIELD_BY_PATH[f].label} is missing (required)`));
  return { doc, flat, issues, valid: missingReq.length === 0, staffId: flat.staffId ? String(flat.staffId).trim() : '' };
}

/* ---------------------------- preview build ----------------------------- */
// Returns a sample + summary with NO database writes, using rowToDoc so it
// mirrors the commit exactly (full-name split included).
function buildPreview(headers, rows, mapping, { limit = 20 } = {}) {
  const requiredFields = CATALOGUE.filter((c) => c.required).map((c) => c.field);
  const issueTally = {}; const fillCount = {};
  let validRows = 0; const sample = [];
  const n = rows.length;

  for (let i = 0; i < n; i++) {
    const { flat, issues, valid } = rowToDoc(headers, rows[i], mapping);
    for (const f of Object.keys(flat)) fillCount[f] = (fillCount[f] || 0) + 1;
    if (valid) validRows++;
    for (const msg of issues) {
      const key = msg.includes('(required)') ? 'missing required' : (/not a (number|date)/.test(msg) ? 'bad value' : 'unrecognised value');
      issueTally[key] = (issueTally[key] || 0) + 1;
    }
    if (i < limit) sample.push({ row: i + 2, valid, data: flat, issues });  // +2: header is row 1
  }

  const fillRate = {};
  for (const m of (mapping || [])) {
    const f = m.field === FULLNAME ? 'firstName' : m.field;
    fillRate[m.field] = n ? Math.round(((fillCount[f] || 0) / n) * 100) : 0;
  }

  return {
    summary: { rows: n, validRows, invalidRows: n - validRows, issueTally, mappedFields: (mapping || []).length, requiredFields },
    fillRate,
    sample,
  };
}

/* --------------------------- import planning ---------------------------- */
// Decide insert / update / skip for already-coerced rows, deduping on staffId.
// existingStaffIds: a Set of staffIds already in the tenant. Pure — the caller
// does the actual DB writes. Rows with no staffId are always inserted (no key).
function planImport(builtRows, existingStaffIds, { updateExisting = false } = {}) {
  const toInsert = []; const toUpdate = []; const toSkip = []; const rejected = [];
  const seenInBatch = new Set();
  for (const r of builtRows) {
    if (!r.valid) { rejected.push(r); continue; }
    const sid = r.staffId;
    if (sid) {
      const existsInDb = existingStaffIds.has(sid);
      const dupInBatch = seenInBatch.has(sid);
      seenInBatch.add(sid);
      if (existsInDb || dupInBatch) {
        if (updateExisting && existsInDb && !dupInBatch) toUpdate.push(r);
        else toSkip.push(r);
        continue;
      }
    }
    toInsert.push(r);
  }
  return { toInsert, toUpdate, toSkip, rejected };
}

// For the UI: the list of fields a human can map to (for manual override).
function catalogueForUI() {
  return CATALOGUE.map((c) => ({ field: c.field, label: c.label, type: c.type, required: !!c.required }));
}

module.exports = {
  CATALOGUE, mapColumns, coerceValue, buildPreview, catalogueForUI, norm,
  splitFullName, detectFullNameColumn, augmentFullName, rowToDoc, docFromFields, planImport, FULLNAME,
};
