// Workforce Intelligence — "Claude as a data scientist".
//
// HR asks a question in plain English; Claude WRITES Python analysis code; that
// code runs in a LOCKED-DOWN sandbox (server/python/sandbox_runner.py, launched
// with `python3 -I`) against the real rows. The numbers come from actual
// computation on the data — Claude never invents them. Claude's generated code
// is UNTRUSTED and is defended in depth by the sandbox: AST guard (no imports,
// dunders, eval/exec/open, file/network I/O), restricted builtins, filtered
// importer, and OS resource limits (address space, CPU, no file writes).
//
// This is an AI-only feature. When AI is off it is simply unavailable; it shares
// nothing with — and cannot weaken — the deterministic no-AI analytics path
// (analyze.py / build_dashboard.py).
const path = require('path');
const { spawn } = require('child_process');
const ai = require('./ai.service');

const SANDBOX = path.join(__dirname, '..', 'python', 'sandbox_runner.py');
const RUN_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS || 20000);
const MAX_ROWS = Number(process.env.SANDBOX_MAX_ROWS || 50000);
const MAX_CODE_CHARS = 24000;

/* ----------------------- Python interpreter resolution -------------------- */
// Node may be launched where "python3" isn't the interpreter that has the
// scientific stack (common on Windows: libs live in "python" / C:\PythonXX,
// while "python3" is a Store shim). And `-I` (isolated) ignores user-site
// packages. So we PROBE: try each candidate interpreter with each flag set and
// pick the first combination where `import pandas, numpy` actually succeeds.
// Preferring `-I` (most isolated); falling back to `-E -B` (still ignores
// PYTHON* env vars, no cwd-shadowing risk here) only if that's the only way the
// libraries load. Result is cached for the process.
const PY_FLAGSETS = [['-I'], ['-E', '-B']];

function pyCandidates() {
  const seen = new Set();
  const out = [];
  const add = (cmd, pre) => { const k = cmd + '|' + pre.join(' '); if (cmd && !seen.has(k)) { seen.add(k); out.push({ cmd, pre }); } };
  if (process.env.PYTHON_BIN) add(process.env.PYTHON_BIN, []);
  add('python3', []);
  add('python', []);
  add('py', ['-3']);
  return out;
}

function probe(cmd, args) {
  return new Promise((resolve) => {
    let done = false;
    let p;
    const fin = (v) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => { try { p && p.kill('SIGKILL'); } catch { /* */ } fin(false); }, 15000);
    try { p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'ignore'] }); }
    catch { return fin(false); }
    p.on('error', () => fin(false));
    p.on('close', (code) => fin(code === 0));
  });
}

let _py = null;        // { cmd, flags:[...] }
let _pyProbe = null;
async function resolvePython() {
  if (_py) return _py;
  if (!_pyProbe) {
    _pyProbe = (async () => {
      for (const flags of PY_FLAGSETS) {
        for (const c of pyCandidates()) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await probe(c.cmd, [...c.pre, ...flags, '-c', 'import pandas, numpy']);
          if (ok) { _py = { cmd: c.cmd, flags: [...c.pre, ...flags] }; return _py; }
        }
      }
      // Nothing worked — fall back so the error surfaced is actionable.
      _py = { cmd: process.env.PYTHON_BIN || 'python3', flags: ['-I'] };
      return _py;
    })();
  }
  return _pyProbe;
}

/* --------------------------- friendly py errors --------------------------- */
function friendlyPyError(stderr, code, pyCmd) {
  const raw = String(stderr || '').trim();
  const miss = raw.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/);
  if (miss) {
    return `The analytics engine is missing a Python dependency ("${miss[1]}"). Install the engine's requirements into the interpreter Node runs ("${pyCmd || 'python3'}"), e.g.  "${pyCmd || 'python3'}" -m pip install -r server/python/requirements.txt  — or set PYTHON_BIN to a Python that has them.`;
  }
  if (/No such file or directory|ENOENT|not found/i.test(raw) && /python/i.test(raw)) {
    return `Python 3 was not found on the server. Install Python 3, or set PYTHON_BIN to the correct interpreter.`;
  }
  const last = raw.split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return last ? `The analytics engine failed: ${last}` : `The analytics engine exited with code ${code}.`;
}

// Translate the runner's own "engine not available: No module named X" (emitted
// as JSON when the trusted imports fail) into the same actionable guidance.
function translateEngineError(res, pyCmd) {
  const e = String(res && res.error || '');
  const m = e.match(/engine not available:.*No module named ['"]?([\w.]+)/i);
  if (m) return friendlyPyError(`ModuleNotFoundError: No module named '${m[1]}'`, 0, pyCmd);
  return res && res.error;
}

/* ------------------------------ run sandbox ------------------------------- */
// Spawn the locked runner, feed {code, data} on stdin, read the JSON verdict.
// Always resolves with a structured object (ok / blocked / error) unless the
// engine itself cannot be launched.
async function runSandbox({ code, data }) {
  const py = await resolvePython();
  return new Promise((resolve, reject) => {
    let proc;
    try { proc = spawn(py.cmd, [...py.flags, SANDBOX], { stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { return reject(new Error(`Could not start the analytics engine with "${py.cmd}". Install Python 3 and its requirements, or set PYTHON_BIN. (${e.message})`)); }
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (fn, arg) => { if (!done) { done = true; clearTimeout(timer); fn(arg); } };
    const timer = setTimeout(() => {
      if (done) return;
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      finish(resolve, { ok: false, error: 'The analysis took too long and was stopped (sandbox time limit).', timedOut: true });
    }, RUN_TIMEOUT_MS);

    proc.stdout.on('data', (d) => { stdout += d; if (stdout.length > 8e6) { try { proc.kill('SIGKILL'); } catch { /* */ } } });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (e) => finish(reject, new Error(`Could not start the analytics engine with "${py.cmd}". Install Python 3 and its requirements, or set PYTHON_BIN. (${e.message})`)));
    proc.on('close', (codeNum) => {
      let res = null;
      try { res = JSON.parse((stdout || '').trim().split('\n').pop() || '{}'); } catch { /* keep null */ }
      if (!res || typeof res !== 'object') {
        return finish(resolve, { ok: false, error: friendlyPyError(stderr, codeNum, py.cmd) });
      }
      if (!res.ok && res.error) res.error = translateEngineError(res, py.cmd) || res.error;
      finish(resolve, res);
    });

    try {
      proc.stdin.write(JSON.stringify({ code: String(code || ''), data: Array.isArray(data) ? data : [] }));
      proc.stdin.end();
    } catch (e) {
      finish(resolve, { ok: false, error: 'Could not send data to the analytics engine: ' + e.message });
    }
  });
}

/* ------------------------------- profiling -------------------------------- */
const asNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

// Compact column schema Claude sees — names, inferred type, distinct count, a
// few sample values. Never the full dataset: Claude plans WHAT to compute; the
// sandbox computes it on the real rows.
function profile(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const headers = list.length ? Object.keys(list[0]) : [];
  return headers.map((h) => {
    const vals = list.map((r) => r[h]).filter((v) => v !== '' && v != null);
    const nums = vals.map(asNum).filter((n) => n != null);
    const numeric = vals.length > 0 && nums.length >= vals.length * 0.8;
    const distinct = Array.from(new Set(vals.map((v) => String(v))));
    return {
      name: h,
      type: numeric ? 'number' : 'category',
      distinct: distinct.length,
      samples: (numeric ? vals.slice(0, 4) : distinct.slice(0, 6)),
    };
  });
}

/* ------------------------------- prompts ---------------------------------- */
const CODER_SYSTEM = [
  'You are a senior people-analytics data scientist for an HR platform.',
  'Write Python that analyses the pandas DataFrame `df` to answer the user question.',
  'The code runs in a LOCKED sandbox and is REJECTED (never executed) if it breaks any rule:',
  '',
  'ALLOWED (all pre-imported — do NOT import anything):',
  '  pd (pandas), np (numpy), df (the data), and when present sklearn, stats (scipy.stats), plt (matplotlib.pyplot, Agg backend).',
  '',
  'HARD RULES:',
  '  - No import statements of any kind. No open/eval/exec/compile/getattr/globals/__import__.',
  '  - No dunder (double-underscore) attribute access, e.g. no .__class__, .__dict__.',
  '  - No file or network access. Do NOT use pd.read_*, to_csv/to_sql, np.load, .format(), .query(), .eval().',
  '  - Use f-strings for text and boolean masks (df[df[col] > x]) for filtering.',
  '  - Put EVERY answer into the dict `result` using JSON-friendly values',
  '    (floats/ints/strings/lists/dicts). Round numbers sensibly.',
  '  - Compute real values from df. NEVER hard-code or guess numbers.',
  '  - Optional: build up to 4 charts with plt / df.plot(...). Give them titles.',
  '  - Guard for empty groups / missing columns so the code cannot crash.',
  '',
  'Return ONLY the Python code. No prose, no explanation, no markdown fences.',
].join('\n');

const NARRATE_SYSTEM = [
  'You are a people-analytics advisor. You are given an HR question and the REAL',
  'computed results of an analysis (already calculated from the data — trust them).',
  'Write a concise, professional interpretation: 2-4 short sentences, then up to 3',
  'bullet insights or recommendations. Use ONLY the numbers provided — never invent',
  'figures. Plain business English, no code, no markdown headers.',
].join('\n');

function stripFences(text) {
  let t = String(text || '').trim();
  const m = t.match(/```(?:python|py)?\s*([\s\S]*?)```/i);
  if (m) t = m[1].trim();
  return t.slice(0, MAX_CODE_CHARS);
}

// Compact transcript of earlier steps so a follow-up can build on them. The df
// is the SAME dataset each time (the sandbox is stateless), so prior code is
// context, not state — Claude re-derives what it needs.
function priorContext(history) {
  const steps = (Array.isArray(history) ? history : []).slice(-4);
  if (!steps.length) return '';
  const parts = steps.map((s, i) => [
    `Step ${i + 1} — Question: ${String(s.question || '').slice(0, 300)}`,
    s.code ? `Code:\n${String(s.code).slice(0, 1500)}` : '',
    s.result != null ? `Result: ${JSON.stringify(s.result).slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n'));
  return `\n\nEARLIER STEPS in this analysis (same df each time — use as context, re-derive what you need):\n${parts.join('\n\n')}`;
}

/* --------------------------------- main ----------------------------------- */
// Ask Claude to answer `question` by writing + running analysis code on `rows`.
// `dataset`/`datasetLabel` name the data source; `history` carries earlier steps
// for conversational follow-ups.
// Returns { ok, question, code, result, charts, stdout, narrative, error }.
async function analyse({ question, rows, dataset, datasetLabel, history }) {
  if (!ai.isConfigured()) {
    const err = new Error('Workforce Intelligence AI is not configured on this server.');
    err.status = 503;
    throw err;
  }
  const q = String(question || '').trim();
  if (!q) { const e = new Error('Ask a question about your workforce data.'); e.status = 400; throw e; }

  const data = (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS);
  if (!data.length) { const e = new Error('No data available to analyse.'); e.status = 400; throw e; }

  const cols = profile(data);
  const label = datasetLabel || dataset || 'Employees';
  const prior = priorContext(history);
  const ask = (extra) => ai.complete({
    system: CODER_SYSTEM,
    messages: [{
      role: 'user',
      content: `Dataset: ${label}\nColumns (schema only):\n${JSON.stringify(cols, null, 0)}\n\nTotal rows: ${data.length}${prior}\n\nQuestion: ${q}${extra || ''}\n\nWrite the analysis code now.`,
    }],
    maxTokens: 4000,  // enough for a full multi-step analysis without truncation
    temperature: 0,
  });

  // 1st attempt
  let code = stripFences(await ask());
  let run = await runSandbox({ code, data });

  // If the sandbox REJECTED the code (it never ran), give Claude one chance to
  // fix it with the exact reason. A blocked attempt has zero security cost. A
  // syntax error usually means truncation, so we also tell it to stay complete.
  if (run && run.blocked) {
    const truncated = /syntax error|unterminated|unexpected EOF|EOL/i.test(run.error || '');
    const fix = truncated
      ? `\n\nYour previous code was REJECTED (likely truncated): "${run.error}". Write COMPLETE, self-contained code — close every string, bracket and block — and keep it focused and concise so it finishes well within the limit.`
      : `\n\nYour previous code was REJECTED by the sandbox: "${run.error}". Rewrite it to obey every rule.`;
    code = stripFences(await ask(fix));
    run = await runSandbox({ code, data });
  }

  let narrative = '';
  if (run && run.ok) {
    try {
      narrative = String(await ai.complete({
        system: NARRATE_SYSTEM,
        messages: [{ role: 'user', content: `Question: ${q}\n\nComputed results:\n${JSON.stringify(run.result).slice(0, 6000)}` }],
        maxTokens: 600,
        temperature: 0.2,
      })).trim();
    } catch { /* narrative is optional */ }
  }

  return {
    ok: !!(run && run.ok),
    question: q,
    dataset: dataset || 'employees',
    datasetLabel: label,
    rowsAnalyzed: data.length,
    code,
    result: (run && run.result) || {},
    charts: (run && run.charts) || [],
    stdout: (run && run.stdout) || '',
    narrative,
    error: run && !run.ok ? (run.error || 'The analysis could not be completed.') : undefined,
    blocked: !!(run && run.blocked),
  };
}

module.exports = { analyse, runSandbox, profile, friendlyPyError };
