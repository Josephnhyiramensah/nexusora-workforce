// Excel dashboard orchestration.
//
// Pipeline: gather tabular rows (from the system or an upload) → profile the
// columns → ask Claude for a build_dashboard SPEC grounded in those columns →
// run the Python engine (server/python/build_dashboard.py) → return the .xlsx
// buffer. The AI only picks WHAT to analyse; Python computes the real numbers.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const ai = require('./ai.service');

const SCRIPT = path.join(__dirname, '..', 'python', 'build_dashboard.py');
const PYTHON = process.env.PYTHON_BIN || 'python3';
const GEN_TIMEOUT_MS = Number(process.env.XLSX_TIMEOUT_MS || 120000);

const AGGS = ['count', 'sum', 'mean', 'ratio', 'distinct'];
const CHARTS = ['column', 'bar', 'pie', 'line'];
const FORMATS = ['int', 'float', 'money', 'pct'];

// Turn a raw Python failure into a clean, actionable message instead of dumping
// a multi-line traceback into the UI. A missing dependency is the common one
// (the server's Python hasn't had requirements.txt installed).
function friendlyPyError(stderr, code) {
  const raw = String(stderr || '').trim();
  const miss = raw.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/);
  if (miss) {
    return `The analytics engine is missing a Python dependency ("${miss[1]}"). On the server, install the engine's requirements into the interpreter Node runs (PYTHON_BIN, currently "${PYTHON}"):  "${PYTHON}" -m pip install -r server/python/requirements.txt`;
  }
  if (/No such file or directory|ENOENT|not found/i.test(raw) && /python/i.test(raw)) {
    return `Python 3 was not found on the server. Install Python 3 and its dependencies, or set PYTHON_BIN to the correct interpreter (currently "${PYTHON}").`;
  }
  // Fall back to the last meaningful line of the traceback, not the whole dump.
  const lastLine = raw.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  if (lastLine) return `The analytics engine failed: ${lastLine}`;
  return `The analytics engine exited with code ${code}.`;
}

/* ----------------------------- data shaping ----------------------------- */
const yrs = (d) => { if (!d) return null; const y = (Date.now() - new Date(d)) / (365.25 * 864e5); return y >= 0 ? +y.toFixed(1) : null; };
const hireOf = (e) => e?.employment?.hireDate || e?.hireDate || e?.employment?.dateEmployed || e?.employment?.startDate || null;
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

// Flatten raw Employee docs into clean, analysis-ready rows.
function rowsFromEmployees(emps) {
  return (emps || []).map((e) => ({
    staffId: e.staffId || '',
    name: [e.firstName, e.lastName].filter(Boolean).join(' '),
    department: e?.employment?.department || 'Unspecified',
    grade: e?.employment?.grade || '',
    employmentType: e?.employment?.employmentType || '',
    workerClass: e?.employment?.workerClass || '',
    gender: cap(e.gender),
    nationality: e.nationality || '',
    status: e.status || (e?.employment?.confirmationStatus) || '',
    salary: (e?.compensation?.baseSalary != null && e.compensation.baseSalary !== '') ? Number(e.compensation.baseSalary) : null,
    age: (() => { const a = yrs(e.dateOfBirth || e?.employment?.dateOfBirth); return a != null ? Math.round(a) : null; })(),
    tenureYears: yrs(hireOf(e)),
  }));
}

const asNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

// Compact column schema the AI sees (names, type, distinct, samples) — never raw values en masse.
function profileRows(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return headers.map((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => v !== '' && v != null);
    const nums = vals.map(asNum).filter((n) => n != null);
    const numeric = vals.length > 0 && nums.length >= vals.length * 0.8;
    return {
      name: h,
      type: numeric ? 'number' : 'category',
      distinct: new Set(vals.map((v) => String(v))).size,
      samples: vals.slice(0, 5).map((v) => String(v)).slice(0, 5),
    };
  });
}

/* ------------------------------ AI spec ------------------------------ */
async function specFromPrompt({ prompt, schema, title, brand, currency }) {
  const categories = schema.filter((c) => c.type === 'category').map((c) => c.name);
  const numbers = schema.filter((c) => c.type === 'number').map((c) => c.name);
  const system = [
    'You design a professional, interactive Excel HR analytics dashboard. You choose WHAT to analyse; a Python engine computes the real numbers and builds the workbook. Never invent numbers.',
    'You are given the dataset COLUMN SCHEMA (names, type, distinct, samples). Use ONLY these exact column names.',
    'Return STRICT JSON ONLY in this shape (no prose):',
    '{',
    '  "title": string,',
    '  "subtitle": string,',
    '  "selector": <a category column to use as the interactive filter, or omit>,',
    '  "derived": [ { "name": string, "from": <number column>, "type": "bucket", "bins": [numbers], "labels": [strings] } ],',
    '  "kpis": [ { "label": string, "agg": "count"|"sum"|"mean"|"ratio"|"distinct", "field": <number or category column, if needed>, "match": <value, only for ratio>, "format": "int"|"float"|"money"|"pct" } ],',
    '  "breakdowns": [ { "title": string, "by": <category column>, "agg": "count"|"sum"|"mean", "field": <number column, for sum/mean>, "chart": "column"|"bar"|"pie"|"line", "format": "int"|"money"|"float", "top": number } ]',
    '}',
    'Guidance: 3–5 KPIs (headcount/count, averages, totals, and a ratio like attrition if a status column exists). 3–6 breakdowns across the most insightful dimensions. Pick a sensible selector (e.g. department). Use "money" format for salary/pay fields. Add a derived age/tenure band if an age or tenure number column exists. Keep titles short and human.',
    '',
    `CATEGORY columns: ${JSON.stringify(categories)}`,
    `NUMBER columns: ${JSON.stringify(numbers)}`,
    `FULL SCHEMA: ${JSON.stringify(schema)}`,
  ].join('\n');
  const user = prompt && prompt.trim()
    ? prompt.trim()
    : 'Design the most insightful professional HR analytics dashboard for this dataset.';
  let spec = {};
  try { spec = await ai.completeJSON({ system, messages: [{ role: 'user', content: user }], maxTokens: 1600 }); }
  catch (e) { spec = {}; }
  return sanitizeSpec(spec, schema, { title, brand, currency });
}

// Keep only what references real columns; fill sensible defaults so we ALWAYS
// produce a useful dashboard even if the model is terse or unavailable.
function sanitizeSpec(spec, schema, { title, brand, currency }) {
  spec = spec && typeof spec === 'object' ? spec : {};
  const byName = Object.fromEntries(schema.map((c) => [c.name, c]));
  const cats = schema.filter((c) => c.type === 'category' && c.distinct > 1 && c.distinct <= 60).map((c) => c.name);
  const nums = schema.filter((c) => c.type === 'number').map((c) => c.name);
  const isCat = (n) => byName[n] && byName[n].type === 'category';
  const isNum = (n) => byName[n] && byName[n].type === 'number';

  const out = {
    title: spec.title || title || 'Workforce Analytics Dashboard',
    subtitle: spec.subtitle || '',
    brand: brand || {},
    currency: currency || '',
  };
  // Pass through an AI narrative (adds the "AI Insights" sheet) when present.
  if (spec.narrative && typeof spec.narrative === 'object') out.narrative = spec.narrative;

  // selector
  out.selector = (spec.selector && isCat(spec.selector)) ? spec.selector : (cats[0] || undefined);

  // derived (only bucket over a number column)
  out.derived = Array.isArray(spec.derived) ? spec.derived.filter((d) => d && d.name && isNum(d.from) && Array.isArray(d.bins)) : [];
  const derivedNames = out.derived.map((d) => d.name);
  const catOrDerived = (n) => isCat(n) || derivedNames.includes(n);

  // kpis
  let kpis = Array.isArray(spec.kpis) ? spec.kpis : [];
  kpis = kpis.filter((k) => k && AGGS.includes(k.agg) && (k.agg === 'count' || isNum(k.field) || (k.agg === 'ratio' && byName[k.field]) || (k.agg === 'distinct' && byName[k.field])))
    .map((k) => ({ label: String(k.label || k.agg), agg: k.agg, field: k.field, match: k.match,
      format: FORMATS.includes(k.format) ? k.format : (k.agg === 'ratio' ? 'pct' : (/salary|pay|wage|cost|amount/i.test(k.field || '') ? 'money' : 'int')) }))
    .slice(0, 4);
  if (!kpis.length) {
    kpis = [{ label: 'Headcount', agg: 'count', format: 'int' }];
    const sal = nums.find((n) => /salary|pay|wage|net|gross/i.test(n));
    if (sal) { kpis.push({ label: `Average ${sal}`, agg: 'mean', field: sal, format: 'money' }); kpis.push({ label: `Total ${sal}`, agg: 'sum', field: sal, format: 'money' }); }
    const statusCol = schema.find((c) => /status/i.test(c.name));
    if (statusCol) kpis.push({ label: 'Attrition', agg: 'ratio', field: statusCol.name, match: 'terminated', format: 'pct' });
  }
  out.kpis = kpis;

  // breakdowns
  let bds = Array.isArray(spec.breakdowns) ? spec.breakdowns : [];
  bds = bds.filter((b) => b && catOrDerived(b.by) && ['count', 'sum', 'mean'].includes(b.agg || 'count'))
    .map((b) => ({ title: String(b.title || `${b.by}`), by: b.by, agg: b.agg || 'count',
      field: (b.agg === 'sum' || b.agg === 'mean') && isNum(b.field) ? b.field : undefined,
      chart: CHARTS.includes(b.chart) ? b.chart : 'column',
      format: FORMATS.includes(b.format) ? b.format : (/salary|pay|wage/i.test(b.field || '') ? 'money' : 'int'),
      top: Number.isInteger(b.top) ? b.top : 12 }))
    .filter((b) => b.agg === 'count' || b.field)
    .slice(0, 6);
  if (!bds.length) {
    bds = cats.slice(0, 3).map((c) => ({ title: `Headcount by ${c}`, by: c, agg: 'count', chart: cats.indexOf(c) === 2 ? 'pie' : 'column', format: 'int', top: 12 }));
    const sal = nums.find((n) => /salary|pay|wage/i.test(n));
    if (sal && cats[0]) bds.push({ title: `Average ${sal} by ${cats[0]}`, by: cats[0], agg: 'mean', field: sal, chart: 'bar', format: 'money', top: 12 });
  }
  out.breakdowns = bds;

  return out;
}

/* --------------------------- run the engine --------------------------- */
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ } }

function generate({ rows, spec }) {
  return new Promise((resolve, reject) => {
    let tmp;
    try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nxw-xlsx-')); }
    catch (e) { return reject(new Error('Could not create temp dir: ' + e.message)); }
    const jobPath = path.join(tmp, 'job.json');
    const outPath = path.join(tmp, 'dashboard.xlsx');
    try { fs.writeFileSync(jobPath, JSON.stringify({ output: outPath, spec, data: rows })); }
    catch (e) { rmrf(tmp); return reject(new Error('Could not stage job: ' + e.message)); }

    const proc = spawn(PYTHON, [SCRIPT, jobPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; proc.kill('SIGKILL'); rmrf(tmp); reject(new Error('Dashboard generation timed out.')); } }, GEN_TIMEOUT_MS);

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (e) => {
      if (done) return; done = true; clearTimeout(timer); rmrf(tmp);
      reject(new Error(`Could not start the analytics engine with "${PYTHON}". Install Python 3 and its requirements, or set PYTHON_BIN. (${e.message})`));
    });
    proc.on('close', (code) => {
      if (done) return; done = true; clearTimeout(timer);
      let summary = {};
      try { summary = JSON.parse(stdout || '{}'); } catch { /* keep {} */ }
      if (code !== 0 || !summary.ok) {
        rmrf(tmp);
        return reject(new Error(summary.error || friendlyPyError(stderr, code)));
      }
      let buffer;
      try { buffer = fs.readFileSync(outPath); } catch (e) { rmrf(tmp); return reject(new Error('Engine produced no file: ' + e.message)); }
      rmrf(tmp);
      resolve({ buffer, summary });
    });
  });
}

module.exports = { rowsFromEmployees, profileRows, specFromPrompt, sanitizeSpec, generate };
