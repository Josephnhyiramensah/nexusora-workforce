const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const ai = require('../../services/ai.service');
const { METRICS, metricCatalogue, computeMetric, contextPack, loadEmployees } = require('../../services/aiMetrics');
const { identityPrompt, COMPANY } = require('../../config/company');
const xlsxDash = require('../../services/excelDashboard.service');

/* ============================ STATUS ============================ */
// GET /ai/status — lets the UI show a clear "not configured" state instead of failing.
const status = asyncHandler(async (req, res) => {
  // Never expose the underlying model/provider to the browser — show the white-label name.
  res.json({ configured: ai.isConfigured(), name: COMPANY.uiName || COMPANY.assistantName });
});

/* ============================ INSIGHTS ============================ */
// POST /ai/insights — AI writes an executive brief grounded in REAL figures (code computes).
const insights = asyncHandler(async (req, res) => {
  const pack = await contextPack(req.tenantConn);
  const system = [
    'You are a sharp, experienced HR and people-analytics advisor briefing an executive team. Think like a seasoned CHRO, not a report generator.',
    'You are given this organisation\'s REAL figures as JSON. Ground every number you cite in this data and never invent figures — but do NOT merely restate the numbers. INTERPRET them: read between the lines, connect different metrics (e.g. how attrition, tenure bands and the department mix relate), benchmark against what "healthy" looks like for an organisation this size, and surface the two or three things that genuinely matter — including non-obvious risks and opportunities a good HR director would raise unprompted.',
    'Be specific and confident. Every recommendation must be concrete and actionable this quarter, not generic advice. Where the data is too thin to conclude, say what to measure next rather than padding.',
    'Return STRICT JSON only, matching this shape (no prose outside the JSON):',
    '{ "headline": string, "summary": string, "sections": [{ "title": string, "points": [string] }], "risks": [{ "title": string, "detail": string }], "recommendations": [{ "action": string, "rationale": string }] }',
  ].join('\n');
  const userMsg = `Organisation workforce figures (JSON):\n${JSON.stringify(pack)}\n\nWrite the executive brief as JSON — analyse, don't just describe.`;
  const insight = await ai.completeJSON({ system, messages: [{ role: 'user', content: userMsg }], maxTokens: 4000 });
  res.json({ metrics: pack, insight });
});

/* ============================ CHAT ============================ */
// POST /ai/chat  { messages: [{role:'user'|'assistant', content}] }
const chat = asyncHandler(async (req, res) => {
  const history = Array.isArray(req.body.messages) ? req.body.messages.slice(-12) : [];
  if (!history.length) return res.status(400).json({ message: 'No message provided.' });
  const pack = await contextPack(req.tenantConn);
  const system = [
    identityPrompt(),
    '',
    'Your role: an expert HR & people-analytics assistant embedded in the Nexusora Workforce HR system.',
    'You have this organisation\'s current REAL figures as JSON below. For any question about its data, answer using ONLY these figures and cite the actual numbers. Never fabricate data that is not present; if a figure is not in the data, say what you do have and suggest where in the system to find the rest.',
    'For general HR questions (policy, best practice, labour matters, process), give clear, practical, professional guidance suitable for an HR professional in an African / multinational context.',
    'Be concise and specific. Use short paragraphs or tight bullet lists. Do not repeat the whole dataset back.',
    '',
    `ORGANISATION FIGURES (JSON): ${JSON.stringify(pack)}`,
  ].join('\n');
  const messages = history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) }));
  const reply = await ai.complete({ system, messages, maxTokens: 1200, temperature: 0.5 });
  res.json({ reply });
});

/* ============================ NL → DASHBOARD ============================ */
// POST /ai/dashboard  { prompt }  → AI picks metrics from the whitelist; code computes them.
const buildDashboard = asyncHandler(async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  if (!prompt) return res.status(400).json({ message: 'Describe the dashboard you want.' });
  const catalogue = metricCatalogue();
  const system = [
    'You design HR dashboards for the Nexusora Workforce system.',
    'You may ONLY use metrics from the AVAILABLE METRICS list (by their exact "key"). Never invent a metric key or a number.',
    'If the user\'s request IS about workforce data, choose the 3–8 most relevant metrics and arrange them into a dashboard.',
    'If the request is NOT a data-dashboard request — for example a greeting, small talk, or a question about yourself or the company — do not force a dashboard: return { "title": "", "widgets": [] }.',
    'Return STRICT JSON only: { "title": string, "widgets": [ { "metric": <one of the available keys>, "title": string, "chart": "bar"|"line"|"line2"|"donut"|"kpi" } ] }',
    'Prefer the metric\'s natural chart unless the user asks otherwise. Keep titles short and human.',
    '',
    `AVAILABLE METRICS: ${JSON.stringify(catalogue)}`,
  ].join('\n');
  const spec = await ai.completeJSON({ system, messages: [{ role: 'user', content: prompt }], maxTokens: 1200 });

  const employees = await loadEmployees(req.tenantConn);
  const widgets = [];
  for (const w of (spec.widgets || [])) {
    if (!METRICS[w.metric]) continue;                 // hard whitelist — ignore anything invented
    const m = await computeMetric(w.metric, employees, req.tenantConn);
    if (!m) continue;
    widgets.push({ metric: w.metric, title: w.title || m.label, chart: w.chart || m.chart, series: m.series });
  }
  if (!widgets.length) {
    // Not a data-dashboard request — respond gracefully with guidance, not an error.
    return res.json({
      title: '', prompt, widgets: [],
      guidance: 'This is the Dashboard Builder — it turns your workforce data into clean, professional charts. Try something like “headcount by department and gender split”, “attrition and starters vs leavers”, or “age and tenure of active staff”. If you’d like to chat, ask about me, or ask a general HR question, the Ask HR Assistant tab is the place for that.',
    });
  }
  res.json({ title: spec.title || 'Workforce Dashboard', prompt, widgets });
});

/* ============================ UPLOAD → DASHBOARD ============================ */
// naive-but-safe CSV parser (handles quoted fields and commas within quotes)
function parseCSV(text) {
  const rows = []; let row = [], field = '', inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inStr = false; } else field += ch; }
    else if (ch === '"') inStr = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}
async function parseUpload(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const grid = parseCSV(file.buffer.toString('utf8'));
    const headers = (grid[0] || []).map((h) => String(h).trim());
    const rows = grid.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] != null ? String(r[i]).trim() : ''])));
    return { headers, rows };
  }
  // xlsx / xls via ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const grid = [];
  ws.eachRow({ includeEmpty: false }, (r) => { grid.push((r.values || []).slice(1).map((v) => (v && v.text) ? v.text : (v == null ? '' : v))); });
  const headers = (grid[0] || []).map((h) => String(h).trim());
  const rows = grid.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] != null ? r[i] : ''])));
  return { headers, rows };
}
const asNum = (v) => { const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

// Profile columns: type + distinct + samples — a compact schema for the AI.
function profile(headers, rows) {
  return headers.map((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => v !== '' && v != null);
    const nums = vals.map(asNum).filter((n) => n != null);
    const numeric = vals.length > 0 && nums.length >= vals.length * 0.8;
    const distinct = new Set(vals.map((v) => String(v))).size;
    return { name: h, type: numeric ? 'number' : 'category', distinct, samples: vals.slice(0, 4).map((v) => String(v)) };
  });
}
// Deterministic aggregation from the real uploaded rows.
function aggregate(rows, { groupBy, measure, agg }) {
  if (!groupBy) return [];
  const m = new Map();
  rows.forEach((r) => {
    const k = String(r[groupBy] ?? 'Unspecified') || 'Unspecified';
    const cur = m.get(k) || { sum: 0, count: 0 };
    cur.count += 1;
    if (measure && measure !== 'count') { const n = asNum(r[measure]); if (n != null) cur.sum += n; }
    m.set(k, cur);
  });
  let arr = Array.from(m, ([label, v]) => ({ label, value: agg === 'avg' ? (v.count ? +(v.sum / v.count).toFixed(1) : 0) : agg === 'sum' ? v.sum : v.count }));
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, 20);
}

// POST /ai/analyze-upload  (multipart "file")  → AI designs a dashboard over the uploaded data.
const analyzeUpload = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Upload a CSV or Excel file (field "file").' });
  const { headers, rows } = await parseUpload(req.file);
  if (!headers.length || !rows.length) return res.status(422).json({ message: 'Could not read any rows from that file.' });

  const schema = profile(headers, rows);
  const system = [
    'You are a data analyst designing a dashboard over an uploaded HR dataset.',
    'You are given the column SCHEMA only (names, types, distinct counts, samples) — you never see the raw values and must not invent any.',
    'Design 3–6 widgets. Each widget groups the data by a CATEGORY column and aggregates a MEASURE.',
    'Return STRICT JSON only: { "title": string, "widgets": [ { "title": string, "chart": "bar"|"line"|"donut"|"kpi", "groupBy": <category column name>, "measure": <number column name or "count">, "agg": "count"|"sum"|"avg" } ] }',
    'Use only column names that appear in the schema. For counts use measure "count" and agg "count".',
    '',
    `SCHEMA: ${JSON.stringify(schema)}`,
  ].join('\n');
  const spec = await ai.completeJSON({ system, messages: [{ role: 'user', content: 'Design the dashboard.' }], maxTokens: 900 });

  const cols = new Set(headers);
  const widgets = [];
  for (const w of (spec.widgets || [])) {
    if (!cols.has(w.groupBy)) continue;
    if (w.measure && w.measure !== 'count' && !cols.has(w.measure)) w.measure = 'count';
    const series = aggregate(rows, { groupBy: w.groupBy, measure: w.measure, agg: w.agg || 'count' });
    if (series.length) widgets.push({ title: w.title || `${w.groupBy}`, chart: w.chart || 'bar', groupBy: w.groupBy, measure: w.measure || 'count', agg: w.agg || 'count', series });
  }
  if (!widgets.length) return res.status(422).json({ message: 'The AI could not design a dashboard from those columns. Ensure the file has clear category and number columns with a header row.' });
  res.json({
    title: spec.title || `Analysis of ${req.file.originalname}`,
    file: req.file.originalname, rowCount: rows.length, columns: schema,
    preview: rows.slice(0, 8), widgets,
  });
});

/* ==================== AI → INTERACTIVE EXCEL DASHBOARD ==================== */
function brandOf(tenant) {
  const b = tenant?.branding || {};
  return { primary: b.primaryColor || '#012158', accent: b.accentColor || '#168eff' };
}
function streamWorkbook(res, buffer, title) {
  const safe = String(title || 'HR_Dashboard').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'HR_Dashboard';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
  res.setHeader('X-Dashboard-Title', encodeURIComponent(title || ''));
  res.send(buffer);
}

// POST /ai/excel/system  { prompt }  → interactive Excel dashboard from live system data.
const excelFromSystem = asyncHandler(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ message: 'AI is not configured on the server.' });
  const prompt = String(req.body.prompt || '').trim();
  const employees = await loadEmployees(req.tenantConn);
  const rows = xlsxDash.rowsFromEmployees(employees);
  if (!rows.length) return res.status(422).json({ message: 'No employee records to analyse yet.' });
  const schema = xlsxDash.profileRows(rows);
  const spec = await xlsxDash.specFromPrompt({
    prompt, schema,
    title: req.tenant?.name ? `${req.tenant.name} — Workforce Analytics` : 'Workforce Analytics Dashboard',
    brand: brandOf(req.tenant), currency: req.tenant?.baseCurrency,
  });
  const { buffer } = await xlsxDash.generate({ rows, spec });
  streamWorkbook(res, buffer, spec.title);
});

// POST /ai/excel/upload  (multipart "file", field "prompt")  → dashboard from uploaded data.
const excelFromUpload = asyncHandler(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ message: 'AI is not configured on the server.' });
  if (!req.file) return res.status(400).json({ message: 'Upload a CSV or Excel file (field "file").' });
  const { headers, rows } = await parseUpload(req.file);
  if (!headers.length || !rows.length) return res.status(422).json({ message: 'Could not read any rows from that file.' });
  const prompt = String(req.body.prompt || '').trim();
  const schema = xlsxDash.profileRows(rows);
  const spec = await xlsxDash.specFromPrompt({
    prompt, schema,
    title: `Analysis — ${req.file.originalname.replace(/\.[^.]+$/, '')}`,
    brand: brandOf(req.tenant), currency: req.tenant?.baseCurrency,
  });
  const { buffer } = await xlsxDash.generate({ rows, spec });
  streamWorkbook(res, buffer, spec.title);
});

/* ---- In-web dashboard builder: dataset → (AI suggest) → live preview → export ---- */

// GET /ai/dataset/system → flattened employee rows + column profile for the builder.
const datasetSystem = asyncHandler(async (req, res) => {
  const rows = xlsxDash.rowsFromEmployees(await loadEmployees(req.tenantConn));
  res.json({ columns: xlsxDash.profileRows(rows), rows, source: 'system', count: rows.length });
});

// POST /ai/dataset/upload (multipart "file") → parsed rows + column profile.
const datasetUpload = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Upload a CSV or Excel file (field "file").' });
  const { headers, rows } = await parseUpload(req.file);
  if (!headers.length || !rows.length) return res.status(422).json({ message: 'Could not read any rows from that file.' });
  res.json({ columns: xlsxDash.profileRows(rows), rows, source: 'upload', file: req.file.originalname, count: rows.length });
});

// POST /ai/spec/suggest { schema, prompt, title } → an AI-designed spec to pre-fill the builder.
const specSuggest = asyncHandler(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ message: 'AI is not configured on the server.' });
  const schema = Array.isArray(req.body.schema) ? req.body.schema : [];
  if (!schema.length) return res.status(400).json({ message: 'No column schema provided.' });
  const spec = await xlsxDash.specFromPrompt({
    prompt: String(req.body.prompt || ''), schema, title: req.body.title,
    brand: brandOf(req.tenant), currency: req.tenant?.baseCurrency,
  });
  res.json({ spec });
});

// POST /ai/excel/build { spec, source, rows? } → build the workbook from a finished spec.
// No AI needed — this is the user's own design. For system source we re-load rows
// server-side; for an upload the client sends back the rows it is previewing.
const excelBuild = asyncHandler(async (req, res) => {
  const spec = req.body.spec || {};
  let rows;
  if (req.body.source === 'system') {
    rows = xlsxDash.rowsFromEmployees(await loadEmployees(req.tenantConn));
  } else {
    rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  }
  if (!rows.length) return res.status(422).json({ message: 'No data to build from.' });
  const schema = xlsxDash.profileRows(rows);
  const clean = xlsxDash.sanitizeSpec(spec, schema, {
    title: spec.title, brand: brandOf(req.tenant), currency: req.tenant?.baseCurrency,
  });
  const { buffer } = await xlsxDash.generate({ rows, spec: clean });
  streamWorkbook(res, buffer, clean.title);
});

// POST /ai/analyze/narrative { title, prompt, kpis, breakdowns, meta } → Claude
// interprets the EXACT computed figures and returns a structured analysis that
// the builder shows on screen and the engine embeds as an "AI Insights" sheet.
const analyzeNarrative = asyncHandler(async (req, res) => {
  if (!ai.isConfigured()) return res.status(503).json({ message: 'AI is not configured on the server.' });
  const { title, prompt, kpis, breakdowns, meta } = req.body;
  const facts = {
    title: title || '', rows: meta?.rows, currency: meta?.currency,
    kpis: Array.isArray(kpis) ? kpis.slice(0, 12) : [],
    breakdowns: Array.isArray(breakdowns) ? breakdowns.slice(0, 8).map((b) => ({ title: b.title, by: b.by, agg: b.agg, series: (b.series || []).slice(0, 25) })) : [],
  };
  const system = [
    'You are a seasoned CHRO and people-analytics advisor. You are given the EXACT computed figures of an HR dashboard (KPIs and breakdown series). Ground EVERY statement in these numbers — never invent figures. Interpret rather than restate: connect metrics to each other, benchmark against what is healthy for an organisation this size, and surface the few things that genuinely matter, including non-obvious risks and opportunities.',
    'Return STRICT JSON only (no prose outside the JSON): { "headline": string, "summary": string, "findings": [string], "risks": [{"title":string,"detail":string}], "recommendations": [{"action":string,"rationale":string}] }',
    'Keep it tight and concrete: 3–6 findings, up to 3 risks, 3–5 recommendations — each specific to these figures and actionable this quarter.',
  ].join('\n');
  const user = `Dashboard: ${title || 'Workforce Analytics'}\nUser focus: ${prompt || '(none given)'}\nFIGURES (JSON):\n${JSON.stringify(facts)}\n\nWrite the analysis as JSON — analyse, don't just describe.`;
  const narrative = await ai.completeJSON({ system, messages: [{ role: 'user', content: user }], maxTokens: 2200 });
  res.json({ narrative });
});

// POST /ai/analyze/auto { rows?, source?, spec } → DETERMINISTIC statistical
// analysis in Python (NO AI, no API key). Returns the same narrative shape so
// the builder and the Excel "AI Insights" sheet work identically offline.
const analyzeAuto = asyncHandler(async (req, res) => {
  let rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length && req.body.source === 'system') {
    rows = xlsxDash.rowsFromEmployees(await loadEmployees(req.tenantConn));
  }
  if (!rows.length) return res.status(422).json({ message: 'No data to analyse.' });
  const spec = { selector: req.body.spec?.selector, currency: req.tenant?.baseCurrency };
  const out = await xlsxDash.runAnalyze({ rows, spec });
  res.json({ narrative: out.narrative, stats: out.stats });
});

module.exports = {
  status, insights, chat, buildDashboard, analyzeUpload,
  excelFromSystem, excelFromUpload,
  datasetSystem, datasetUpload, specSuggest, excelBuild, analyzeNarrative, analyzeAuto,
};