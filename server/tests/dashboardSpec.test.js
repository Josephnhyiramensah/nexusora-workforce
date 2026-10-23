// Phase 4 dashboard-spec tests: gauges, funnel, pyramid, KPI icons.
// Covers both sanitizeSpec (JS validation + sensible defaults) and the Python
// engine (build_dashboard.py) handling the new spec keys end-to-end.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { sanitizeSpec } = require('../services/excelDashboard.service');

const SCHEMA = [
  { name: 'Department', type: 'category', distinct: 8, samples: ['Sales', 'HR', 'Finance'] },
  { name: 'Status', type: 'category', distinct: 2, samples: ['Active', 'Terminated'] },
  { name: 'JobLevel', type: 'category', distinct: 6, samples: ['Junior', 'Senior', 'Lead'] },
  { name: 'Stage', type: 'category', distinct: 4, samples: ['Applied', 'Screened', 'Hired'] },
  { name: 'Salary', type: 'number', distinct: 200, samples: ['4200', '6800'] },
];

/* -------------------------- sanitizeSpec: gauges -------------------------- */
test('gauges default to attrition + active when a status column exists', () => {
  const out = sanitizeSpec({}, SCHEMA, {});
  assert.equal(out.gauges.length, 2);
  assert.equal(out.gauges[0].title, 'Attrition %');
  assert.equal(out.gauges[0].agg, 'ratio');
  assert.equal(out.gauges[0].field, 'Status');
  assert.equal(out.gauges[0].match, 'terminated');
  // attrition bands rise green -> amber -> red (low attrition is good)
  assert.deepEqual(out.gauges[0].bands.map((b) => b.color), ['#1F9D57', '#C77700', '#E5484D']);
  assert.equal(out.gauges[1].title, 'Active share');
});

test('no gauges invented when there is no status column', () => {
  const schema = SCHEMA.filter((c) => c.name !== 'Status');
  const out = sanitizeSpec({}, schema, {});
  assert.equal(out.gauges.length, 0);
});

test('model gauges are validated: bad bands and missing fields are dropped', () => {
  const out = sanitizeSpec({
    gauges: [
      { title: 'Attr', agg: 'ratio', field: 'Status', match: 'Terminated',
        bands: [{ upto: 0.2, color: '#E5484D' }, { upto: 1, color: 'not-a-hex' }] },
      { title: 'orphan', agg: 'mean', field: 'DoesNotExist' },
    ],
  }, SCHEMA, {});
  assert.equal(out.gauges.length, 1);               // orphan dropped
  assert.equal(out.gauges[0].bands.length, 1);      // bad-colour band dropped
  assert.equal(out.gauges[0].bands[0].color, '#E5484D');
});

test('gauge max is kept only when numeric', () => {
  const out = sanitizeSpec({
    gauges: [
      { title: 'A', agg: 'mean', field: 'Salary', max: 12000, format: 'money' },
      { title: 'B', agg: 'mean', field: 'Salary', max: 'lots', format: 'money' },
    ],
  }, SCHEMA, {});
  assert.equal(out.gauges[0].max, 12000);
  assert.equal('max' in out.gauges[1], false);
});

test('at most 4 gauges', () => {
  const g = (i) => ({ title: `g${i}`, agg: 'ratio', field: 'Status', match: 'Terminated' });
  const out = sanitizeSpec({ gauges: [g(1), g(2), g(3), g(4), g(5), g(6)] }, SCHEMA, {});
  assert.equal(out.gauges.length, 4);
});

/* -------------------------- sanitizeSpec: funnel -------------------------- */
test('funnel passes through when grounded in a real category', () => {
  const out = sanitizeSpec({ funnel: { title: 'HC funnel', by: 'JobLevel', agg: 'count', top: 6 } }, SCHEMA, {});
  assert.deepEqual(out.funnel, { title: 'HC funnel', by: 'JobLevel', agg: 'count', field: undefined, top: 6 });
});

test('funnel sum without a valid field falls back to count', () => {
  const out = sanitizeSpec({ funnel: { by: 'JobLevel', agg: 'sum', field: 'NotReal' } }, SCHEMA, {});
  assert.equal(out.funnel.agg, 'count');
  assert.equal(out.funnel.field, undefined);
});

test('funnel auto-defaults only from a genuine stage/pipeline column', () => {
  const withStage = sanitizeSpec({}, SCHEMA, {});
  assert.equal(withStage.funnel.by, 'Stage');
  const noStage = sanitizeSpec({}, SCHEMA.filter((c) => c.name !== 'Stage'), {});
  assert.equal(noStage.funnel, undefined);          // never duplicates the pyramid
});

/* ------------------------- sanitizeSpec: pyramid ------------------------- */
test('pyramid defaults from a level/grade column as a share mix', () => {
  const out = sanitizeSpec({}, SCHEMA, {});
  assert.equal(out.pyramid.by, 'JobLevel');
  assert.equal(out.pyramid.agg, 'count');
});

test('pyramid sum keeps a valid field, else falls back to count', () => {
  const ok = sanitizeSpec({ pyramid: { by: 'JobLevel', agg: 'sum', field: 'Salary' } }, SCHEMA, {});
  assert.equal(ok.pyramid.agg, 'sum');
  assert.equal(ok.pyramid.field, 'Salary');
  const bad = sanitizeSpec({ pyramid: { by: 'JobLevel', agg: 'sum', field: 'Nope' } }, SCHEMA, {});
  assert.equal(bad.pyramid.agg, 'count');
  assert.equal(bad.pyramid.field, undefined);
});

/* --------------------------- KPI icons --------------------------- */
test('KPI icons pass through only for the known glyph set', () => {
  const out = sanitizeSpec({
    kpis: [
      { label: 'HC', agg: 'count', icon: 'people' },
      { label: 'Pay', agg: 'mean', field: 'Salary', icon: 'money' },
      { label: 'Bad', agg: 'count', icon: 'not-a-glyph' },
    ],
  }, SCHEMA, {});
  assert.equal(out.kpis[0].icon, 'people');
  assert.equal(out.kpis[1].icon, 'money');
  assert.equal('icon' in out.kpis[2], false);
});

/* ------------------ Python engine: new keys end-to-end ------------------ */
// Skipped automatically if python3 (or the engine deps) aren't available, so
// the suite stays green on a bare CI box; it runs wherever the engine runs.
test('build_dashboard.py renders gauges, funnel and pyramid without warnings', () => {
  const py = process.env.PYTHON_BIN || 'python3';
  const script = path.join(__dirname, '..', 'python', 'build_dashboard.py');
  const probe = spawnSync(py, ['-c', 'import pandas, xlsxwriter'], { encoding: 'utf8' });
  if (probe.status !== 0) { return; }  // engine deps absent → skip, don't fail

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nxw-p4-'));
  const out = path.join(tmp, 'out.xlsx');
  const data = [];
  const depts = ['Engineering', 'Sales', 'Finance'];
  const levels = ['Junior', 'Mid', 'Senior', 'Lead'];
  for (let i = 0; i < 60; i++) {
    data.push({
      Department: depts[i % depts.length],
      JobLevel: levels[i % levels.length],
      Status: i % 5 === 0 ? 'Terminated' : 'Active',
      Salary: 3000 + (i % 7) * 900,
    });
  }
  const spec = {
    title: 'Phase 4 test', currency: 'GHS', selectors: ['Department'],
    kpis: [{ label: 'Headcount', agg: 'count', icon: 'people' },
      { label: 'Attrition', agg: 'ratio', field: 'Status', match: 'Terminated', format: 'pct', icon: 'percent' }],
    gauges: [{ title: 'Attrition %', agg: 'ratio', field: 'Status', match: 'Terminated', format: 'pct',
      bands: [{ upto: 0.1, color: '#1F9D57' }, { upto: 1, color: '#E5484D' }] },
      { title: 'HC vs 100', agg: 'count', max: 100, format: 'int' }],
    funnel: { title: 'Level funnel', by: 'JobLevel', agg: 'count', top: 6 },
    pyramid: { title: 'Level mix', by: 'JobLevel', agg: 'count', top: 6 },
  };
  const job = path.join(tmp, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ output: out, spec, data }));
  const res = spawnSync(py, [script, job], { encoding: 'utf8' });
  assert.equal(res.status, 0, `engine exited ${res.status}: ${res.stderr}`);
  const summary = JSON.parse(res.stdout);
  assert.equal(summary.ok, true);
  assert.ok(fs.existsSync(out), 'workbook file written');
  // gauges (2) + funnel + pyramid + breakdowns/combo all render as charts.
  assert.ok(summary.charts >= 4, `expected >=4 charts, got ${summary.charts}`);
  assert.deepEqual(summary.warnings, [], `unexpected warnings: ${JSON.stringify(summary.warnings)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
});
