import { useEffect, useState, createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import ExcelJS from 'exceljs';
import api from '../api/client';
import { ModuleShell } from '../ui/kit';
import { LayoutDashboard, Table2, TrendingDown, UserPlus, Wallet, CalendarClock, BarChart3 } from 'lucide-react';

// Lets any KPI tile or chart segment open a drill-down drawer without prop-drilling.
const DrillCtx = createContext(null);

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Analytics';
const PALETTE = ['#012158', '#3485E9', '#FD9C09', '#17a2b8', '#7c5cdf', '#1f9d57', '#e5484d', '#8a94a6'];
// Builds a drill spec that lists the employees behind a chart segment (by an employee field).
const dimDrill = (field, title) => (d) => ({ type: 'dim', field, value: d.label, title: `${title}: ${String(d.label).replace(/_/g, ' ')}` });
const nfmt = (n) => Number(n || 0).toLocaleString();
const money = (n, c) => `${c || ''} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`.trim();
const TABS = ['Overview', 'Cross-Tab', 'Turnover', 'Recruitment', 'Payroll', 'Absence'];
const PERIODS = [[3, '3 mo'], [6, '6 mo'], [12, '12 mo'], [24, '24 mo']];

const RAIL_GROUPS = [
  { title: 'Workforce', items: [
    { key: 'Overview', label: 'Overview', Icon: LayoutDashboard },
    { key: 'Cross-Tab', label: 'Cross-Tab', Icon: Table2 },
  ] },
  { title: 'Movement', items: [
    { key: 'Turnover', label: 'Turnover', Icon: TrendingDown },
    { key: 'Recruitment', label: 'Recruitment', Icon: UserPlus },
  ] },
  { title: 'Cost & Time', items: [
    { key: 'Payroll', label: 'Payroll', Icon: Wallet },
    { key: 'Absence', label: 'Absence', Icon: CalendarClock },
  ] },
];
const SUBTITLE = {
};

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function addSection(ws, heading, columns, rows) {
  const t = ws.addRow([heading]); t.font = { bold: true, size: 12, color: { argb: 'FF012158' } };
  const h = ws.addRow(columns); h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF012158' } }; });
  rows.forEach((r) => ws.addRow(r)); ws.addRow([]);
}
async function exportTab(name, d, currency) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Nexusora Workforce';
  const ws = wb.addWorksheet(name); ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const kv = (obj) => Object.entries(obj).map(([k, v]) => [k, v]);
  if (name === 'Overview') {
    addSection(ws, 'Key figures', ['Metric', 'Value'], kv(d.kpis || {}));
    (['byDept', 'byGender', 'byType', 'byClass', 'byStatus', 'newHires']).forEach((key) => { if (d.charts?.[key]?.length) addSection(ws, key, ['Label', 'Value'], d.charts[key].map((x) => [x.label, x.value])); });
    if (d.charts?.payrollTrend?.length) addSection(ws, 'payrollTrend', ['Period', 'Gross', 'Net', 'Headcount'], d.charts.payrollTrend.map((x) => [x.label, x.gross, x.net, x.headcount]));
  } else if (name === 'Turnover') {
    addSection(ws, 'Summary', ['Metric', 'Value'], [['Annual attrition %', d.attritionAnnualPct], ['Avg tenure (yr)', d.avgTenureYears], ['Hires (12mo)', d.hires12], ['Leavers (12mo)', d.leavers12], ['Active headcount', d.activeHeadcount]]);
    addSection(ws, 'Starters vs leavers', ['Month', 'Starters', 'Leavers', 'Net'], (d.monthly || []).map((m) => [m.label, m.starters, m.leavers, m.net]));
    addSection(ws, 'Tenure bands', ['Band', 'Count'], (d.tenureBands || []).map((b) => [b.label, b.value]));
  } else if (name === 'Recruitment') {
    addSection(ws, 'Summary', ['Metric', 'Value'], [['Total applicants', d.totalApplicants], ['Open vacancies', d.openVacancies], ['Filled vacancies', d.filledVacancies], ['Offer acceptance %', d.offerAcceptancePct], ['Avg time to hire (d)', d.avgTimeToHireDays]]);
    addSection(ws, 'Funnel', ['Stage', 'Reached'], (d.funnel || []).map((f) => [f.label, f.value]));
    addSection(ws, 'Source effectiveness', ['Source', 'Applied', 'Hired'], (d.bySource || []).map((s) => [s.label, s.applied, s.hired]));
  } else if (name === 'Payroll') {
    addSection(ws, 'Cost trend', ['Period', 'Gross', 'Net', 'Employer cost', 'Cost/head', 'Headcount'], (d.trend || []).map((t) => [t.label, t.gross, t.net, t.employerCost, t.costPerHead, t.headcount]));
    addSection(ws, 'Net cost by department (latest)', ['Department', `Net (${currency})`], (d.costByDept || []).map((x) => [x.label, x.value]));
    addSection(ws, 'Salary distribution', ['Band', 'Count'], (d.salaryBands || []).map((x) => [x.label, x.value]));
  } else if (name === 'Absence') {
    addSection(ws, `Attendance status (last ${d.windowDays} days)`, ['Status', 'Count'], (d.statusBreakdown || []).map((x) => [x.label, x.value]));
    addSection(ws, 'Summary', ['Metric', 'Value'], [['Absence rate %', d.absenceRatePct]]);
    addSection(ws, 'Absence trend', ['Month', 'Absent'], (d.monthlyAbsence || []).map((x) => [x.label, x.value]));
    addSection(ws, 'Approved leave days by type', ['Type', 'Days'], (d.leaveByType || []).map((x) => [x.label, x.value]));
  }
  await downloadWorkbook(wb, `Analytics_${name}.xlsx`);
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState('Overview');
  const [months, setMonths] = useState(12);
  const [dept, setDept] = useState('all');
  const [deptOptions, setDeptOptions] = useState([]);
  const [drill, setDrill] = useState(null);
  const q = `months=${months}&dept=${encodeURIComponent(dept)}`;
  const usesDept = tab === 'Overview' || tab === 'Turnover';
  const showControls = tab !== 'Cross-Tab';

  const controls = showControls ? (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={heroCtrl()}>{PERIODS.map(([v, l]) => <option key={v} value={v}>Last {l}</option>)}</select>
      <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={!usesDept} title={usesDept ? '' : 'Department filter applies to Overview & Turnover'} style={{ ...heroCtrl(), opacity: usesDept ? 1 : 0.5 }}>
        <option value="all">All departments</option>{deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  ) : null;

  return (
    <ModuleShell brand={{ title: 'Analytics', subtitle: 'Workforce intelligence', Icon: BarChart3 }} groups={RAIL_GROUPS} active={tab} onSelect={setTab}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        <Hero crumbs={tab} title={tab === 'Cross-Tab' ? 'Cross-Tab & Diversity' : tab} subtitle={SUBTITLE[tab]} action={controls} />
        <DrillCtx.Provider value={setDrill}>
          {tab === 'Overview' && <OverviewTab q={q} onDepts={setDeptOptions} />}
          {tab === 'Cross-Tab' && <CrossTab />}
          {tab === 'Turnover' && <TurnoverTab q={q} />}
          {tab === 'Recruitment' && <RecruitmentTab q={q} />}
          {tab === 'Payroll' && <PayrollTab q={q} />}
          {tab === 'Absence' && <AbsenceTab q={q} />}
        </DrillCtx.Provider>
        {drill && <DrillDrawer spec={drill} dept={dept} onClose={() => setDrill(null)} />}
      </div>
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function Hero({ crumbs, title, subtitle, action }) {
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '24px 30px 26px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8 }}>{MODULE} <span style={{ opacity: .6 }}>›</span> <span>{crumbs}</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '.9rem', color: '#28466f', marginTop: 6 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </section>
  );
}
function heroCtrl() { return { padding: '8px 12px', border: '1px solid rgba(255,255,255,.9)', borderRadius: 9, background: 'rgba(255,255,255,.72)', color: C.navy, fontSize: '.84rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }

/* ============================ DRILL-DOWN DRAWER ============================ */
function DrillDrawer({ spec, dept, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, err: '' });
  useEffect(() => {
    let alive = true; setState({ loading: true, data: null, err: '' });
    (async () => {
      const params = new URLSearchParams();
      Object.entries(spec).forEach(([k, v]) => { if (v != null) params.set(k, v); });
      if (dept && dept !== 'all') params.set('dept', dept);
      try { const { data } = await api.get(`/analytics/drill?${params.toString()}`); if (alive) setState({ loading: false, data, err: '' }); }
      catch (e) { if (alive) setState({ loading: false, data: null, err: e?.response?.data?.message || 'Could not load details.' }); }
    })();
    return () => { alive = false; };
  }, [JSON.stringify(spec), dept]);
  const d = state.data;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, height: '100%', background: '#fff', boxShadow: '-14px 0 40px rgba(1,33,88,.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.02rem' }}>{spec.title || 'Details'}</div>
            {d && <div style={{ color: C.muted, fontSize: '.76rem', marginTop: 2 }}>{d.count} record{d.count === 1 ? '' : 's'}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {d?.link && <Link to={d.link} onClick={onClose} style={{ padding: '6px 12px', border: `1px solid ${C.navy}`, borderRadius: 8, color: C.navy, fontWeight: 700, fontSize: '.78rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>Open module ›</Link>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {state.loading && <div style={{ color: C.muted, padding: 24 }}>Loading…</div>}
          {state.err && <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '10px 13px', borderRadius: 9, fontSize: '.85rem' }}>{state.err}</div>}
          {d && d.rows.length === 0 && <div style={{ color: C.muted, padding: 24, textAlign: 'center' }}>No records.</div>}
          {d && d.rows.length > 0 && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{d.columns.map((h, i) => <th key={i} style={{ textAlign: i ? 'left' : 'left', padding: '9px 12px', background: '#f4f7fc', color: C.navy, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>{d.rows.map((r, ri) => <tr key={ri} style={{ borderTop: `1px solid ${C.line}`, background: ri % 2 ? '#fafbfe' : '#fff' }}>{r.map((cell, ci) => <td key={ci} style={{ padding: '8px 12px', fontSize: '.83rem', color: ci === 0 ? C.navy : C.ink, fontWeight: ci === 0 ? 700 : 400 }}>{String(cell)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useFetch(url) {
  const [state, setState] = useState({ data: null, loading: true, err: '' });
  useEffect(() => {
    let alive = true; setState((s) => ({ ...s, loading: true }));
    (async () => {
      try { const { data } = await api.get(url); if (alive) setState({ data, loading: false, err: '' }); }
      catch (e) { if (alive) setState({ data: null, loading: false, err: e?.response?.data?.message || 'Could not load data.' }); }
    })();
    return () => { alive = false; };
  }, [url]);
  return state;
}
function Frame({ state, children }) {
  if (state.loading) return <div style={{ color: C.muted, padding: 40 }}>Loading…</div>;
  if (state.err) return <div style={{ color: C.red, padding: 40 }}>{state.err}</div>;
  return children(state.data);
}
function ExportBar({ onExport }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button onClick={onExport} style={{ padding: '8px 14px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>⭳ Export Excel</button></div>; }

/* ============================ CROSS-TAB / DIVERSITY ============================ */
const DIMS = [['businessUnit', 'Business Unit'], ['country', 'Country'], ['employmentType', 'Employment Type'], ['workerClass', 'Worker Class'], ['gender', 'Gender'], ['grade', 'Grade'], ['confirmation', 'Confirmation']];
const MEASURES = [['headcount', 'Headcount'], ['femalePct', 'Female %']];
const dimLabel = (k) => (DIMS.find((d) => d[0] === k) || [k, k])[1];

function pctColor(v) { if (v == null) return { bg: '#f0f3f7', fg: C.muted }; const d = Math.abs(v - 50); const ratio = Math.min(1, d / 50); const hue = Math.round(130 * (1 - ratio)); return { bg: `hsl(${hue} 72% 60%)`, fg: '#0a1f12' }; }
function seqColor(v, max) { if (!v) return { bg: '#f0f3f7', fg: C.muted }; const t = Math.min(1, v / (max || 1)); return { bg: `hsl(214 68% ${90 - 42 * t}%)`, fg: t > 0.5 ? '#fff' : C.navy }; }
// HSL -> ARGB hex, so the Excel export can carry the same heatmap colours as the screen.
function hslToRgb(h, s, l) { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]; }
function argbHSL(h, s, l) { const [r, g, b] = hslToRgb(h, s, l); const hx = (x) => x.toString(16).padStart(2, '0'); return `FF${hx(r)}${hx(g)}${hx(b)}`; }
function pctArgb(v) { if (v == null) return 'FFF0F3F7'; const ratio = Math.min(1, Math.abs(v - 50) / 50); return argbHSL(Math.round(130 * (1 - ratio)), 72, 60); }
function seqArgb(v, max) { if (!v) return 'FFF0F3F7'; const t = Math.min(1, v / (max || 1)); return argbHSL(214, 68, 90 - 42 * t); }

function CrossTab() {
  const openDrill = useContext(DrillCtx);
  const [rows, setRows] = useState('businessUnit');
  const [cols, setCols] = useState('employmentType');
  const [measure, setMeasure] = useState('femalePct');
  const [filters, setFilters] = useState({ businessUnit: [], country: [], employmentType: [], workerClass: [] });
  const [data, setData] = useState(null);
  const [opts, setOpts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true; setLoading(true); setErr('');
    const params = new URLSearchParams({ rows, cols, measure });
    Object.entries(filters).forEach(([k, v]) => { if (v.length) params.set(k, v.join(',')); });
    const t = setTimeout(async () => {
      try { const { data } = await api.get(`/analytics/pivot?${params.toString()}`); if (alive) { setData(data); if (!opts) setOpts(data.filterOptions); } }
      catch (e) { if (alive) setErr(e?.response?.data?.message || 'Could not load.'); }
      finally { if (alive) setLoading(false); }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line
  }, [rows, cols, measure, filters]);

  const toggle = (dim, val) => setFilters((f) => ({ ...f, [dim]: f[dim].includes(val) ? f[dim].filter((x) => x !== val) : [...f[dim], val] }));
  const clearAll = () => setFilters({ businessUnit: [], country: [], employmentType: [], workerClass: [] });

  const max = data ? Math.max(...Object.values(data.cells).map((c) => c.value), 1) : 1;
  const isPct = measure === 'femalePct';

  async function exportPivot() {
    if (!data) return;
    const wb = new ExcelJS.Workbook(); wb.creator = 'Nexusora Workforce';
    const ws = wb.addWorksheet('Cross-Tab');
    const thin = { style: 'thin', color: { argb: 'FFD8E0EC' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    // Title band
    const title = ws.addRow([`${dimLabel(rows)} by ${dimLabel(cols)} — ${isPct ? '% Female' : 'Headcount'}`]);
    ws.mergeCells(1, 1, 1, data.cols.length + 1);
    title.getCell(1).font = { bold: true, size: 13, color: { argb: 'FF012158' } };
    title.getCell(1).alignment = { vertical: 'middle' };
    title.height = 24;
    ws.addRow([]);

    // Header row
    const head = ws.addRow([dimLabel(rows), ...data.cols]);
    head.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF012158' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = border;
    });
    head.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    head.height = 22;

    // Data rows — coloured to match the on-screen heatmap
    data.rows.forEach((r) => {
      const row = ws.addRow([r, ...data.cols.map((c) => {
        const cell = data.cells[`${r}|||${c}`];
        if (!cell) return null;
        return isPct ? cell.value / 100 : cell.value;
      })]);
      // row label
      const lbl = row.getCell(1);
      lbl.font = { bold: true, color: { argb: 'FF23324A' }, size: 10.5 };
      lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F3F7' } };
      lbl.alignment = { horizontal: 'left', vertical: 'middle' };
      lbl.border = border;
      // value cells
      data.cols.forEach((c, i) => {
        const xl = row.getCell(i + 2);
        const cell = data.cells[`${r}|||${c}`];
        const raw = cell ? cell.value : null;
        const argb = raw == null ? 'FFF7F9FC' : (isPct ? pctArgb(raw) : seqArgb(raw, max));
        xl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
        // dark text on dark fills for readability
        const dark = !isPct && raw != null && raw / (max || 1) > 0.55;
        xl.font = { color: { argb: dark ? 'FFFFFFFF' : 'FF23324A' }, size: 10.5, bold: raw != null };
        xl.alignment = { horizontal: 'center', vertical: 'middle' };
        xl.numFmt = isPct ? '0.0%' : '0';
        xl.border = border;
      });
      row.height = 20;
    });

    // Column widths
    ws.getColumn(1).width = 28;
    for (let i = 2; i <= data.cols.length + 1; i++) ws.getColumn(i).width = 14;

    await downloadWorkbook(wb, `CrossTab_${rows}_by_${cols}.xlsx`);
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* filter panel */}
      <div style={{ width: 220, flexShrink: 0, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 800, color: C.navy, fontSize: '.85rem' }}>Filters</span>
          <button onClick={clearAll} style={{ background: 'none', border: 'none', color: C.blue, fontSize: '.74rem', fontWeight: 700, cursor: 'pointer' }}>Clear</button>
        </div>
        {opts ? [['businessUnit', 'Business Unit'], ['country', 'Country'], ['employmentType', 'Emp. Type'], ['workerClass', 'Worker Class']].map(([dim, label]) => (
          <CheckGroup key={dim} label={label} options={opts[dim] || []} selected={filters[dim]} onToggle={(v) => toggle(dim, v)} />
        )) : <div style={{ color: C.muted, fontSize: '.8rem' }}>Loading…</div>}
      </div>

      {/* main */}
      <div style={{ flex: 1, minWidth: 320 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <Picker label="Rows" value={rows} onChange={setRows} options={DIMS} />
          <Picker label="Columns" value={cols} onChange={setCols} options={DIMS} />
          <Picker label="Measure" value={measure} onChange={setMeasure} options={MEASURES} />
          <div style={{ flex: 1 }} />
          <button onClick={exportPivot} style={{ padding: '8px 14px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>⭳ Export</button>
        </div>

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
            <MiniKpi label="Headcount" value={nfmt(data.kpis.total)} />
            <MiniKpi label="Female" value={nfmt(data.kpis.female)} />
            <MiniKpi label="Female %" value={`${data.kpis.femalePct}%`} accent={C.purple} />
            <MiniKpi label="Managers" value={nfmt(data.kpis.managers)} />
            <MiniKpi label="On leave" value={nfmt(data.kpis.onLeave)} accent={C.orange} />
          </div>
        )}

        {loading ? <div style={{ color: C.muted, padding: 30 }}>Loading…</div>
          : err ? <div style={{ color: C.red, padding: 30 }}>{err}</div>
            : !data || !data.rows.length ? <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 40, textAlign: 'center', color: C.muted }}>No data for this combination.</div>
              : (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', marginBottom: 12 }}>{MEASURES.find((m) => m[0] === measure)[1]} — {dimLabel(rows)} × {dimLabel(cols)}</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 3, minWidth: 480 }}>
                      <thead>
                        <tr>
                          <th style={{ position: 'sticky', left: 0, background: '#fff', textAlign: 'left', padding: '6px 10px', color: C.muted, fontSize: '.7rem', textTransform: 'uppercase', fontWeight: 700 }}>{dimLabel(rows)}</th>
                          {data.cols.map((c) => <th key={c} style={{ padding: '6px 10px', color: C.navy, fontSize: '.74rem', fontWeight: 700, textAlign: 'center', minWidth: 88 }}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r) => (
                          <tr key={r}>
                            <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '8px 10px', color: C.ink, fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{r}</td>
                            {data.cols.map((c) => {
                              const cell = data.cells[`${r}|||${c}`];
                              if (!cell) return <td key={c} style={{ background: '#f6f8fb', borderRadius: 6 }} />;
                              const { bg, fg } = isPct ? pctColor(cell.value) : seqColor(cell.value, max);
                              const drill = () => openDrill && openDrill({ type: 'pivot', rowsDim: rows, rowVal: r, colsDim: cols, colVal: c, title: `${r} × ${c}` });
                              return <td key={c} onClick={openDrill ? drill : undefined} title={`${cell.total} staff${isPct ? ` · ${cell.female} female` : ''}${openDrill ? ' — click to see the people' : ''}`} style={{ background: bg, color: fg, borderRadius: 6, padding: '10px 8px', textAlign: 'center', fontWeight: 800, fontSize: '.86rem', minWidth: 88, cursor: openDrill ? 'pointer' : 'default' }}>{isPct ? `${cell.value}%` : cell.value}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 12, fontSize: '.74rem', color: C.muted }}>
                    {isPct ? 'Colour shows balance: green ≈ 50/50, red = heavily skewed one way. Hover a cell for the counts.' : 'Colour scales with headcount (darker = more staff). Hover a cell for detail.'}
                  </div>
                </div>
              )}
      </div>
    </div>
  );
}
function CheckGroup({ label, options, selected, onToggle }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 10, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6 }}>
        <span style={{ fontSize: '.72rem', color: C.navy, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</span>
        <span style={{ color: C.muted, fontSize: '.7rem' }}>{selected.length ? `(${selected.length})` : ''} {open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ maxHeight: 150, overflowY: 'auto' }}>{options.map((o) => (
        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.79rem', color: C.ink, padding: '2px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
        </label>
      ))}</div>}
    </div>
  );
}
function Picker({ label, value, onChange, options }) {
  return <label><div style={{ fontSize: '.66rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
    <select value={value} onChange={(e) => onChange(e.target.value)} style={ctrl()}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
}
function MiniKpi({ label, value, accent }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 13px', boxShadow: '0 1px 2px rgba(1,33,88,.05)', borderTop: `3px solid ${accent || '#d8e0ec'}` }}><div style={{ fontSize: '1.3rem', fontWeight: 800, color: C.navy, lineHeight: 1 }}>{value}</div><div style={{ fontSize: '.64rem', color: C.muted, textTransform: 'uppercase', fontWeight: 700, marginTop: 4 }}>{label}</div></div>; }

/* ============================ TABS ============================ */
function OverviewTab({ q, onDepts }) {
  const s = useFetch(`/analytics/overview?${q}`);
  useEffect(() => { if (s.data?.deptOptions) onDepts(s.data.deptOptions); }, [s.data, onDepts]);
  return <Frame state={s}>{(d) => { const k = d.kpis || {}; const ch = d.charts || {}; return (<>
    <ExportBar onExport={() => exportTab('Overview', d, d.currency)} />
    <KpiRow items={[
      ['Active staff', nfmt(k.active), C.navy, { type: 'kpi', key: 'active', title: 'Active staff' }],
      ['Total on file', nfmt(k.total), undefined, { type: 'kpi', key: 'total', title: 'All employees on file' }],
      ['Confirmed', nfmt(k.confirmed), C.green, { type: 'kpi', key: 'confirmed', title: 'Confirmed staff' }],
      ['On probation', nfmt(k.onProbation), C.orange, { type: 'kpi', key: 'onProbation', title: 'Staff on probation' }],
      ['Open vacancies', nfmt(k.openVacancies), C.blue, { type: 'kpi', key: 'openVacancies', title: 'Open vacancies' }],
      ['Onboarding', nfmt(k.activeOnboarding), C.teal, { type: 'kpi', key: 'activeOnboarding', title: 'Active onboarding' }],
      ['Pending leave', nfmt(k.pendingLeave), C.purple, { type: 'kpi', key: 'pendingLeave', title: 'Pending leave requests' }],
      ['Terminated', nfmt(k.terminated), C.red, { type: 'kpi', key: 'terminated', title: 'Terminated staff' }],
    ]} />
    <Grid>
      <Card title="Headcount by department">{ch.byDept?.length ? <HBars data={ch.byDept} drillOf={dimDrill('employment.department', 'Department')} /> : <Empty />}</Card>
      <Card title="Gender split">{ch.byGender?.length ? <DonutLegend data={ch.byGender} drillOf={dimDrill('gender', 'Gender')} /> : <Empty />}</Card>
      <Card title="Employment type">{ch.byType?.length ? <HBars data={ch.byType} color={C.teal} drillOf={dimDrill('employment.employmentType', 'Employment type')} /> : <Empty />}</Card>
      <Card title="Worker class">{ch.byClass?.length ? <HBars data={ch.byClass} color={C.purple} drillOf={dimDrill('employment.workerClass', 'Worker class')} /> : <Empty />}</Card>
      <Card title="New hires">{ch.newHires?.some((x) => x.value) ? <VBars data={ch.newHires} color={C.blue} drillOf={(d) => d.key ? { type: 'movement', kind: 'starters', month: d.key, title: `New hires · ${d.label}` } : null} /> : <Empty msg="No hires in window." />}</Card>
      <Card title="Payroll net cost (recent)">{ch.payrollTrend?.length ? <VBars data={ch.payrollTrend.map((p) => ({ label: p.label, value: p.net }))} color={C.green} money cur={d.currency} /> : <Empty msg="No payroll runs yet." />}</Card>
    </Grid>
  </>); }}</Frame>;
}
function TurnoverTab({ q }) {
  const s = useFetch(`/analytics/turnover?${q}`);
  return <Frame state={s}>{(d) => (<>
    <ExportBar onExport={() => exportTab('Turnover', d)} />
    <KpiRow items={[['Annual attrition', `${d.attritionAnnualPct}%`, d.attritionAnnualPct > 15 ? C.red : C.green], ['Avg tenure', `${d.avgTenureYears} yr`, C.navy], ['Hires (12 mo)', nfmt(d.hires12), C.blue, { type: 'kpi', key: 'hires12', title: 'Hires (last 12 months)' }], ['Leavers (12 mo)', nfmt(d.leavers12), C.orange, { type: 'kpi', key: 'leavers12', title: 'Leavers (last 12 months)' }], ['Active headcount', nfmt(d.activeHeadcount), C.teal, { type: 'kpi', key: 'activeHeadcount', title: 'Active headcount' }]]} />
    <Grid>
      <Card title="Starters vs leavers" wide>{d.monthly?.some((m) => m.starters || m.leavers) ? <GroupedBars data={d.monthly} series={[['starters', 'Starters', C.green], ['leavers', 'Leavers', C.red]]} drillOf={(k, m) => m.key ? { type: 'movement', kind: k, month: m.key, title: `${k === 'starters' ? 'Starters' : 'Leavers'} · ${m.label}` } : null} /> : <Empty msg="No movement recorded yet." />}</Card>
      <Card title="Tenure distribution">{d.tenureBands?.some((b) => b.value) ? <HBars data={d.tenureBands} color={C.navy} drillOf={(b) => ({ type: 'tenure', band: b.label, title: `Tenure: ${b.label}` })} /> : <Empty />}</Card>
    </Grid>
    <div style={{ color: C.muted, fontSize: '.76rem', marginTop: 10 }}>Attrition = leavers in period ÷ active headcount.</div>
  </>)}</Frame>;
}
function RecruitmentTab({ q }) {
  const s = useFetch(`/analytics/recruitment?${q}`);
  return <Frame state={s}>{(d) => (<>
    <ExportBar onExport={() => exportTab('Recruitment', d)} />
    <KpiRow items={[['Total applicants', nfmt(d.totalApplicants), C.navy, { type: 'kpi', key: 'totalApplicants', title: 'All applicants' }], ['Open vacancies', nfmt(d.openVacancies), C.blue, { type: 'kpi', key: 'openVacancies', title: 'Open vacancies' }], ['Filled vacancies', nfmt(d.filledVacancies), C.green, { type: 'kpi', key: 'filledVacancies', title: 'Filled vacancies' }], ['Offer acceptance', `${d.offerAcceptancePct}%`, C.teal], ['Avg time to hire', `${d.avgTimeToHireDays} d`, C.orange]]} />
    <Grid>
      <Card title="Hiring funnel" wide>{d.funnel?.some((f) => f.value) ? <Funnel data={d.funnel} drillOf={(f) => ({ type: 'applications', stage: String(f.label).toLowerCase(), title: `Applicants — ${f.label}` })} /> : <Empty msg="No applicants yet." />}</Card>
      <Card title="Source effectiveness">{d.bySource?.length ? <SourceTable rows={d.bySource} drillOf={(r) => ({ type: 'applications', source: r.label, title: `Applicants — ${r.label}` })} /> : <Empty msg="No applicant sources recorded." />}</Card>
    </Grid>
  </>)}</Frame>;
}
function PayrollTab({ q }) {
  const s = useFetch(`/analytics/payroll?${q}`);
  return <Frame state={s}>{(d) => { const latest = d.trend?.[d.trend.length - 1]; return (<>
    <ExportBar onExport={() => exportTab('Payroll', d, d.currency)} />
    <KpiRow items={[['Latest gross', money(latest?.gross, d.currency), C.navy], ['Latest net', money(latest?.net, d.currency), C.green], ['Employer cost', money(latest?.employerCost, d.currency), C.orange], ['Cost / head', money(latest?.costPerHead, d.currency), C.teal], ['Headcount', nfmt(latest?.headcount), C.blue, { type: 'kpi', key: 'active', title: 'Active staff' }]]} />
    <Grid>
      <Card title="Cost trend — gross vs net" wide>{d.trend?.length ? <GroupedBars data={d.trend} money cur={d.currency} series={[['gross', 'Gross', C.navy], ['net', 'Net', C.green]]} /> : <Empty msg="No payroll runs yet." />}</Card>
      <Card title="Cost per head (recent runs)">{d.trend?.length ? <VBars data={d.trend.map((t) => ({ label: t.label, value: t.costPerHead }))} color={C.teal} money cur={d.currency} /> : <Empty />}</Card>
      <Card title="Net cost by department (latest run)">{d.costByDept?.length ? <HBars data={d.costByDept} color={C.blue} money cur={d.currency} drillOf={dimDrill('employment.department', 'Department')} /> : <Empty msg="No department cost data." />}</Card>
      <Card title="Salary distribution (salaried staff)">{d.salaryBands?.some((b) => b.value) ? <VBars data={d.salaryBands} color={C.purple} drillOf={(b) => ({ type: 'salaryBand', band: b.label, title: `Salary band: ${b.label}` })} /> : <Empty msg="No salaried staff on record." />}</Card>
    </Grid>
  </>); }}</Frame>;
}
function AbsenceTab({ q }) {
  const s = useFetch(`/analytics/absence?${q}`);
  return <Frame state={s}>{(d) => (<>
    <ExportBar onExport={() => exportTab('Absence', d)} />
    <KpiRow items={[['Absence rate', `${d.absenceRatePct}%`, d.absenceRatePct > 5 ? C.red : C.green], ['Absence records', nfmt((d.statusBreakdown?.find((x) => x.label === 'absent') || {}).value || 0), C.orange], ['Leave types used', nfmt(d.leaveByType?.length || 0), C.blue]]} />
    <Grid>
      <Card title={`Attendance status (last ${d.windowDays} days)`}>{d.statusBreakdown?.length ? <HBars data={d.statusBreakdown} color={C.blue} drillOf={(s) => ({ type: 'attendance', status: s.label, days: d.windowDays, title: `Attendance — ${String(s.label).replace(/_/g, ' ')} (last ${d.windowDays} days)` })} /> : <Empty msg="No attendance recorded." />}</Card>
      <Card title="Absence trend">{d.monthlyAbsence?.some((m) => m.value) ? <VBars data={d.monthlyAbsence} color={C.red} drillOf={(m) => m.key ? { type: 'attendance', status: 'absent', month: m.key, title: `Absences · ${m.label}` } : null} /> : <Empty msg="No absences recorded." />}</Card>
      <Card title="Approved leave days by type" wide>{d.leaveByType?.length ? <HBars data={d.leaveByType} color={C.teal} drillOf={(t) => ({ type: 'leaveByType', name: t.label, title: `Approved leave — ${t.label}` })} /> : <Empty msg="No approved leave yet." />}</Card>
    </Grid>
  </>)}</Frame>;
}

/* ============================ charts ============================ */
function HBars({ data, color, money: isMoney, cur, empty, drillOf }) {
  const openDrill = useContext(DrillCtx);
  if (!data.length) return <Empty msg={empty} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const go = (d) => { if (drillOf && openDrill) { const spec = drillOf(d); if (spec) openDrill(spec); } };
  const canDrill = !!(drillOf && openDrill);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{data.map((d, i) => (
    <div key={i} onClick={canDrill ? () => go(d) : undefined}
      style={{ cursor: canDrill ? 'pointer' : 'default', borderRadius: 6 }}
      title={canDrill ? 'Click to see the people' : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 3 }}><span style={{ color: canDrill ? C.blue : C.ink, textTransform: 'capitalize', fontWeight: canDrill ? 600 : 400 }}>{String(d.label).replace(/_/g, ' ')}</span><span style={{ color: C.muted, fontWeight: 700 }}>{isMoney ? money(d.value, cur) : d.value}</span></div>
      <div style={{ height: 9, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: color || PALETTE[i % PALETTE.length], borderRadius: 999 }} /></div></div>))}</div>;
}
function VBars({ data, color, money: isMoney, cur, drillOf }) {
  const openDrill = useContext(DrillCtx);
  const canDrill = !!(drillOf && openDrill);
  const go = (d) => { if (canDrill) { const spec = drillOf(d); if (spec) openDrill(spec); } };
  const max = Math.max(...data.map((d) => d.value), 1); const H = 150;
  return <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: H + 40, paddingTop: 6 }}>{data.map((d, i) => (
    <div key={i} onClick={canDrill ? () => go(d) : undefined} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', cursor: canDrill ? 'pointer' : 'default' }} title={canDrill ? 'Click to see the people' : undefined}>
      <div style={{ fontSize: '.66rem', color: C.muted, marginBottom: 4, fontWeight: 700 }}>{isMoney ? (d.value ? Math.round(d.value / 1000) + 'k' : 0) : d.value}</div>
      <div style={{ width: '78%', height: Math.max(Math.round((d.value / max) * H), 2), background: color, borderRadius: '5px 5px 0 0' }} />
      <div style={{ fontSize: '.62rem', color: canDrill ? C.blue : C.muted, marginTop: 6, textAlign: 'center', fontWeight: canDrill ? 600 : 400 }}>{d.label}</div></div>))}</div>;
}
function GroupedBars({ data, series, money: isMoney, cur, drillOf }) {
  const openDrill = useContext(DrillCtx);
  const canDrill = !!(drillOf && openDrill);
  const go = (k, d) => { if (canDrill) { const spec = drillOf(k, d); if (spec) openDrill(spec); } };
  const max = Math.max(...data.flatMap((d) => series.map(([k]) => d[k] || 0)), 1); const H = 150;
  return <div><div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>{series.map(([, label, color]) => <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', color: C.ink }}><span style={{ width: 11, height: 11, borderRadius: 3, background: color }} />{label}</span>)}</div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: H + 34, overflowX: 'auto' }}>{data.map((d, i) => (
      <div key={i} style={{ flex: '1 0 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: H }}>{series.map(([k, label, color]) => <div key={k} onClick={canDrill ? () => go(k, d) : undefined} title={`${label}: ${isMoney ? money(d[k], cur) : (d[k] || 0)}${canDrill ? ' — click to see' : ''}`} style={{ width: 12, height: Math.max(Math.round(((d[k] || 0) / max) * H), 2), background: color, borderRadius: '4px 4px 0 0', cursor: canDrill ? 'pointer' : 'default' }} />)}</div>
        <div style={{ fontSize: '.6rem', color: C.muted, marginTop: 6 }}>{d.label}</div></div>))}</div></div>;
}
function Funnel({ data, drillOf }) {
  const openDrill = useContext(DrillCtx);
  const canDrill = !!(drillOf && openDrill);
  const go = (d) => { if (canDrill) { const spec = drillOf(d); if (spec) openDrill(spec); } };
  const max = Math.max(...data.map((d) => d.value), 1);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{data.map((d, i) => { const pct = (d.value / max) * 100; const conv = i > 0 && data[i - 1].value ? Math.round((d.value / data[i - 1].value) * 100) : null; return (
    <div key={i} onClick={canDrill ? () => go(d) : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: canDrill ? 'pointer' : 'default' }} title={canDrill ? 'Click to see applicants' : undefined}>
      <div style={{ width: 92, fontSize: '.8rem', color: canDrill ? C.blue : C.ink, textAlign: 'right', fontWeight: canDrill ? 600 : 400 }}>{d.label}</div>
      <div style={{ flex: 1, background: '#eef2f8', borderRadius: 6, overflow: 'hidden', height: 26, display: 'flex', alignItems: 'center' }}><div style={{ width: `${Math.max(pct, 4)}%`, height: '100%', background: PALETTE[i % PALETTE.length], display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontWeight: 700, fontSize: '.78rem' }}>{d.value}</div></div>
      <div style={{ width: 54, fontSize: '.72rem', color: C.muted, textAlign: 'right' }}>{conv != null ? `${conv}%` : ''}</div></div>); })}</div>;
}
function SourceTable({ rows, drillOf }) {
  const openDrill = useContext(DrillCtx);
  const canDrill = !!(drillOf && openDrill);
  const go = (r) => { if (canDrill) { const spec = drillOf(r); if (spec) openDrill(spec); } };
  return <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
    <thead><tr>{['Source', 'Applied', 'Hired', 'Rate'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '6px 8px', color: C.muted, fontSize: '.72rem', textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => (<tr key={i} onClick={canDrill ? () => go(r) : undefined} style={{ borderTop: `1px solid ${C.line}`, cursor: canDrill ? 'pointer' : 'default' }} title={canDrill ? 'Click to see applicants' : undefined}><td style={{ padding: '8px', textTransform: 'capitalize', color: canDrill ? C.blue : C.ink, fontWeight: canDrill ? 600 : 400 }}>{r.label}</td><td style={{ padding: '8px', textAlign: 'right' }}>{r.applied}</td><td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: C.green }}>{r.hired}</td><td style={{ padding: '8px', textAlign: 'right', color: C.muted }}>{r.applied ? Math.round((r.hired / r.applied) * 100) : 0}%</td></tr>))}</tbody>
  </table>;
}
function arcPath(cx, cy, r, a0, a1) { const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const [x0, y0] = p(a0); const [x1, y1] = p(a1); return `M ${x0} ${y0} A ${r} ${r} 0 ${(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`; }
function DonutLegend({ data, drillOf }) {
  const openDrill = useContext(DrillCtx);
  const canDrill = !!(drillOf && openDrill);
  const total = data.reduce((a, d) => a + d.value, 0) || 1; const size = 150, thickness = 22, r = (size - thickness) / 2, cx = size / 2, cy = size / 2; let ang = -Math.PI / 2;
  const segs = data.map((d, i) => { const frac = d.value / total; const end = ang + frac * 2 * Math.PI; const seg = { frac, color: PALETTE[i % PALETTE.length], label: d.label, value: d.value, a0: ang, a1: end }; ang = end; return seg; });
  const go = (label) => { if (canDrill) { const spec = drillOf({ label }); if (spec) openDrill(spec); } };
  return <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
    <svg width={size} height={size}>{segs.map((s, i) => s.frac >= 0.999 ? <circle key={i} cx={cx} cy={cy} r={r} stroke={s.color} strokeWidth={thickness} fill="none" onClick={() => go(s.label)} style={{ cursor: canDrill ? 'pointer' : 'default' }} /> : s.frac > 0 ? <path key={i} d={arcPath(cx, cy, r, s.a0, s.a1)} stroke={s.color} strokeWidth={thickness} fill="none" onClick={() => go(s.label)} style={{ cursor: canDrill ? 'pointer' : 'default' }} /> : null)}<text x={cx} y={cy - 4} textAnchor="middle" fontSize="1.5rem" fontWeight="800" fill={C.navy}>{total}</text><text x={cx} y={cy + 14} textAnchor="middle" fontSize=".62rem" fill={C.muted}>Active</text></svg>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{segs.map((s, i) => (<div key={i} onClick={() => go(s.label)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', cursor: canDrill ? 'pointer' : 'default' }}><span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} /><span style={{ color: canDrill ? C.blue : C.ink, textTransform: 'capitalize', fontWeight: canDrill ? 600 : 400 }}>{String(s.label).replace(/_/g, ' ')}</span><span style={{ color: C.muted, fontWeight: 700 }}>{s.value} · {Math.round(s.frac * 100)}%</span></div>))}</div>
  </div>;
}

/* ============================ shared ============================ */
function KpiRow({ items }) {
  const openDrill = useContext(DrillCtx);
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 }}>{items.map(([label, value, accent, drill], i) => {
    const clickable = drill && openDrill;
    return (
      <div key={i} onClick={clickable ? () => openDrill(drill) : undefined}
        onMouseEnter={clickable ? (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(1,33,88,.10)'; e.currentTarget.style.borderColor = '#cfdaea'; } : undefined}
        onMouseLeave={clickable ? (e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(1,33,88,.05)'; e.currentTarget.style.borderColor = C.line; } : undefined}
        style={{ position: 'relative', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 2px rgba(1,33,88,.05)', borderTop: `3px solid ${accent || '#d8e0ec'}`, cursor: clickable ? 'pointer' : 'default', transition: 'transform .14s, box-shadow .14s, border-color .14s' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.navy, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '.68rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginTop: 4 }}>{label}</div>
        {clickable && <span style={{ position: 'absolute', top: 12, right: 12, fontSize: '.66rem', color: C.blue, fontWeight: 700 }}>View ›</span>}
      </div>
    );
  })}</div>;
}
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>{children}</div>; }
function Card({ title, children, wide }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, boxShadow: '0 1px 2px rgba(1,33,88,.05)', gridColumn: wide ? '1 / -1' : 'auto' }}><div style={{ fontWeight: 800, color: C.navy, fontSize: '.95rem', marginBottom: 16 }}>{title}</div>{children}</div>; }
function Empty({ msg }) { return <div style={{ color: C.muted, fontSize: '.85rem', padding: '18px 0' }}>{msg || 'No data yet.'}</div>; }
function ctrl() { return { padding: '8px 12px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.84rem', fontWeight: 600, cursor: 'pointer' }; }