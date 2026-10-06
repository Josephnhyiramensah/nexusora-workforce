import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import { exportSections, openPrintable } from '../utils/exporter';
import { ModuleShell } from '../ui/kit';
import {
  Sparkles, MessageSquare, Wand2, Upload, Send, RefreshCw,
  Download, TrendingUp, ShieldAlert, Lightbulb,
} from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Nexusora HR Assistant';
const PALETTE = ['#012158', '#3485E9', '#FD9C09', '#17a2b8', '#7c5cdf', '#1f9d57', '#e5484d', '#0f766e', '#b45309', '#0369a1'];

/* ============================ ROOT ============================ */
export default function AIAdvisorPage() {
  const [section, setSection] = useState('insights');
  const [cfg, setCfg] = useState(null); // { configured, name }

  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/ai/status'); if (a) setCfg(data); } catch { if (a) setCfg({ configured: false }); } })(); return () => { a = false; }; }, []);

  const groups = [
    { title: 'Advisor', items: [
      { key: 'insights', label: 'Insights', Icon: TrendingUp },
      { key: 'ask', label: 'Ask HR Advisor', Icon: MessageSquare },
    ] },
    { title: 'Dashboards', items: [
      { key: 'builder', label: 'Dashboard Builder', Icon: Wand2 },
      { key: 'upload', label: 'Analyze Upload', Icon: Upload },
    ] },
  ];

  return (
    <ModuleShell brand={{ title: 'Nexusora HR Assistant', subtitle: 'Data-grounded AI', Icon: Sparkles }} groups={groups} active={section} onSelect={setSection}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {cfg && !cfg.configured && <NotConfigured />}
        {cfg && cfg.configured && <>
          {section === 'insights' && <Insights />}
          {section === 'ask' && <Ask />}
          {section === 'builder' && <DashboardBuilder />}
          {section === 'upload' && <AnalyzeUpload />}
        </>}
        {!cfg && <div style={{ color: C.muted, padding: 40 }}>Loading…</div>}
      </div>
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function PageHead({ title, subtitle, action }) {
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '24px 30px 26px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8 }}>{MODULE} <span style={{ opacity: .6 }}>›</span> <span>{title}</span></div>
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
function NotConfigured() {
  return (
    <div>
      <PageHead title="Nexusora HR Assistant" subtitle="Intelligent, data-grounded HR insights" />
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '44px 34px', maxWidth: 720, margin: '18px auto 0', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#012158,#3485E9)', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}><Sparkles size={30} color="#fff" /></div>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.15rem', marginBottom: 10 }}>Your assistant is being activated</div>
        <p style={{ color: C.ink, fontSize: '.92rem', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 16px' }}>
          Once activation is complete, the Nexusora HR Assistant will give you AI-written workforce insights, a build-a-dashboard-in-words tool, upload-to-dashboard analysis, and an HR chat assistant — all grounded in your organisation’s live data.
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: '8px 16px', color: C.muted, fontSize: '.82rem' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: C.orange, display: 'inline-block' }} /> Please contact your system administrator to complete activation.
        </div>
      </div>
    </div>
  );
}

/* ============================ INSIGHTS ============================ */
function Insights() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function generate() {
    setBusy(true); setErr('');
    try { const { data } = await api.post('/ai/insights'); setData(data); }
    catch (e) { setErr(e?.response?.data?.message || e?.response?.data?.detail || 'Could not generate insights.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { let alive = true; (async () => { if (alive) await generate(); })(); return () => { alive = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const m = data?.metrics; const ins = data?.insight;
  return (
    <div>
      <PageHead title="Workforce Insights" subtitle="" action={<button onClick={generate} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: `1px solid rgba(255,255,255,.9)`, borderRadius: 10, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}><RefreshCw size={15} /> {busy ? 'Analysing…' : 'Regenerate'}</button>} />
      {err && <ErrBox>{err}</ErrBox>}
      {m && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <MiniKpi label="Active headcount" value={m.headcount.active} />
          <MiniKpi label="Female %" value={`${m.headcount.femalePct}%`} />
          <MiniKpi label="Attrition (12m)" value={`${m.movement.attritionPct}%`} />
          <MiniKpi label="Avg tenure" value={`${m.movement.avgTenureYears} yr`} />
          <MiniKpi label="New hires (12m)" value={m.movement.newHires12m} />
          <MiniKpi label="Leavers (12m)" value={m.movement.leavers12m} />
        </div>
      )}
      {busy && !ins && <div style={{ color: C.muted, padding: 20 }}>Analysing your workforce…</div>}
      {ins && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ background: 'linear-gradient(135deg,#012158,#0c2f6b)', color: '#fff', borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 6 }}>{ins.headline}</div>
              <div style={{ fontSize: '.9rem', lineHeight: 1.6, opacity: 0.92 }}>{ins.summary}</div>
            </div>
            {(ins.sections || []).map((s, i) => (
              <Card key={i} title={s.title}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{(s.points || []).map((p, j) => <li key={j} style={{ fontSize: '.88rem', color: C.ink, lineHeight: 1.6, marginBottom: 4 }}>{p}</li>)}</ul>
              </Card>
            ))}
          </div>
          <div>
            {(ins.risks || []).length > 0 && <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: C.red, fontSize: '.88rem', marginBottom: 10 }}><ShieldAlert size={16} /> Risks</div>
              {(ins.risks).map((r, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontWeight: 700, color: C.navy, fontSize: '.82rem' }}>{r.title}</div><div style={{ fontSize: '.8rem', color: C.muted, lineHeight: 1.5 }}>{r.detail}</div></div>)}
            </div>}
            {(ins.recommendations || []).length > 0 && <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: C.green, fontSize: '.88rem', marginBottom: 10 }}><Lightbulb size={16} /> Recommendations</div>
              {(ins.recommendations).map((r, i) => <div key={i} style={{ marginBottom: 10 }}><div style={{ fontWeight: 700, color: C.navy, fontSize: '.82rem' }}>{r.action}</div><div style={{ fontSize: '.8rem', color: C.muted, lineHeight: 1.5 }}>{r.rationale}</div></div>)}
            </div>}
          </div>
        </div>
      )}
    </div>
  );
}
function MiniKpi({ label, value }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}><div style={{ fontSize: '.66rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.navy, marginTop: 2 }}>{value}</div></div>; }

/* ============================ ASK (chat) ============================ */
function Ask() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false);
  const scroller = useRef(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages, busy]);
  async function send() {
    const text = input.trim(); if (!text || busy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true);
    try { const { data } = await api.post('/ai/chat', { messages: next }); setMessages([...next, { role: 'assistant', content: data.reply }]); }
    catch (e) { setMessages([...next, { role: 'assistant', content: `⚠ ${e?.response?.data?.message || 'The advisor could not respond.'}` }]); }
    finally { setBusy(false); }
  }
  const SUGGEST = ['What are our biggest workforce risks right now?', 'Summarise attrition and what to do about it', 'Which departments are over- or under-staffed?', 'Draft a progressive discipline policy outline'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 190px)' }}>
      <PageHead title="Ask the HR Advisor" subtitle="" />
      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
        {messages.length === 0 && (
          <div style={{ color: C.muted }}>
            <p style={{ fontSize: '.9rem' }}>Ask about your workforce, or for HR guidance. Try:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{SUGGEST.map((s) => <button key={s} onClick={() => setInput(s)} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, padding: '7px 13px', fontSize: '.8rem', color: C.navy, cursor: 'pointer' }}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div style={{ maxWidth: '76%', padding: '11px 14px', borderRadius: 14, fontSize: '.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: m.role === 'user' ? C.navy : '#fff', color: m.role === 'user' ? '#fff' : C.ink, border: m.role === 'user' ? 'none' : `1px solid ${C.line}` }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ color: C.muted, fontSize: '.85rem', padding: '4px 2px' }}>Nexusora HR is thinking…</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Ask a question…" style={{ flex: 1, padding: '12px 14px', border: `1px solid #d8e0ec`, borderRadius: 12, fontSize: '.9rem', color: C.ink }} />
        <button onClick={send} disabled={busy || !input.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 18px', border: 'none', borderRadius: 12, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy || !input.trim() ? 0.6 : 1 }}><Send size={16} /> Send</button>
      </div>
    </div>
  );
}

/* ============================ DASHBOARD BUILDER ============================ */
function DashboardBuilder() {
  const [prompt, setPrompt] = useState('');
  const [dash, setDash] = useState(null);
  const [guide, setGuide] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const gridRef = useRef(null);
  async function build() {
    if (!prompt.trim()) return;
    setBusy(true); setErr(''); setGuide(''); setDash(null);
    try {
      const { data } = await api.post('/ai/dashboard', { prompt });
      if (data.widgets && data.widgets.length) setDash(data);
      else setGuide(data.guidance || 'This tool builds dashboards from your workforce data. Try describing the charts you want, e.g. “headcount by department and attrition”.');
    }
    catch (e) { setErr(e?.response?.data?.message || 'Could not build the dashboard.'); }
    finally { setBusy(false); }
  }
  const SUGGEST = ['Headcount by department and gender split', 'Attrition and starters vs leavers over the last year', 'Age and tenure distribution of active staff', 'Payroll trend and headcount by grade'];
  function exportExcel() {
    if (!dash) return;
    exportSections({ filename: 'AI_Dashboard.xlsx', title: dash.title, subtitle: `Generated from: "${dash.prompt}"`,
      sections: dash.widgets.map((w) => ({ heading: w.title, columns: seriesColumns(w), rows: seriesRows(w) })) });
  }
  function exportPdf() { if (dash && gridRef.current) openPrintable({ title: dash.title, subtitle: dash.prompt, html: gridRef.current.innerHTML }); }
  return (
    <div>
      <PageHead title="Dashboard Builder" subtitle="" action={dash && <div style={{ display: 'flex', gap: 8 }}><button onClick={exportExcel} style={outBtn()}><Download size={15} /> Excel</button><button onClick={exportPdf} style={outBtn()}><Download size={15} /> PDF</button></div>} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') build(); }} placeholder="e.g. Show attrition, headcount by department, and gender split" style={{ flex: 1, padding: '12px 14px', border: `1px solid #d8e0ec`, borderRadius: 12, fontSize: '.9rem', color: C.ink }} />
        <button onClick={build} disabled={busy || !prompt.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 18px', border: 'none', borderRadius: 12, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy || !prompt.trim() ? 0.6 : 1 }}><Wand2 size={16} /> Build</button>
      </div>
      {!dash && !busy && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>{SUGGEST.map((s) => <button key={s} onClick={() => setPrompt(s)} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 999, padding: '7px 13px', fontSize: '.8rem', color: C.navy, cursor: 'pointer' }}>{s}</button>)}</div>}
      {err && <ErrBox>{err}</ErrBox>}
      {guide && <GuideNote onClose={() => setGuide('')}>{guide}</GuideNote>}
      {busy && <div style={{ color: C.muted, padding: 20 }}>Designing your dashboard…</div>}
      {dash && <>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.05rem', marginBottom: 12 }}>{dash.title}</div>
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {dash.widgets.map((w, i) => <WidgetCard key={i} w={w} />)}
        </div>
      </>}
    </div>
  );
}

/* ============================ ANALYZE UPLOAD ============================ */
function AnalyzeUpload() {
  const [file, setFile] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const gridRef = useRef(null);
  async function run() {
    if (!file) return; setBusy(true); setErr(''); setRes(null);
    try { const fd = new FormData(); fd.append('file', file); const { data } = await api.post('/ai/analyze-upload', fd); setRes(data); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not analyse that file.'); }
    finally { setBusy(false); }
  }
  function exportExcel() { if (!res) return; exportSections({ filename: 'AI_Analysis.xlsx', title: res.title, subtitle: `${res.file} · ${res.rowCount} rows`, sections: res.widgets.map((w) => ({ heading: w.title, columns: seriesColumns(w), rows: seriesRows(w) })) }); }
  function exportPdf() { if (res && gridRef.current) openPrintable({ title: res.title, subtitle: `${res.file} · ${res.rowCount} rows`, html: gridRef.current.innerHTML }); }
  return (
    <div>
      <PageHead title="Analyze Upload" subtitle="" action={res && <div style={{ display: 'flex', gap: 8 }}><button onClick={exportExcel} style={outBtn()}><Download size={15} /> Excel</button><button onClick={exportPdf} style={outBtn()}><Download size={15} /> PDF</button></div>} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: '.85rem' }} />
        <button onClick={run} disabled={busy || !file} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy || !file ? 0.6 : 1 }}><Sparkles size={16} /> {busy ? 'Analysing…' : 'Analyze'}</button>
      </div>
      {err && <ErrBox>{err}</ErrBox>}
      {busy && <div style={{ color: C.muted, padding: 20 }}>Reading the data and designing your dashboard…</div>}
      {res && <>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.05rem', marginBottom: 4 }}>{res.title}</div>
        <div style={{ color: C.muted, fontSize: '.8rem', marginBottom: 14 }}>{res.file} · {res.rowCount} rows · {res.columns.length} columns</div>
        <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
          {res.widgets.map((w, i) => <WidgetCard key={i} w={w} />)}
        </div>
        <Card title="Data preview">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{res.columns.map((c) => <th key={c.name} style={th()}>{c.name}<div style={{ fontWeight: 400, color: C.muted, fontSize: '.62rem', textTransform: 'none' }}>{c.type}</div></th>)}</tr></thead>
              <tbody>{res.preview.map((r, i) => <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>{res.columns.map((c) => <td key={c.name} style={td()}>{String(r[c.name] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>
      </>}
    </div>
  );
}

/* ============================ WIDGET + CHARTS ============================ */
function WidgetCard({ w }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', marginBottom: 12 }}>{w.title}</div>
      {(!w.series || w.series.length === 0) ? <div style={{ color: C.muted, fontSize: '.82rem', padding: 12 }}>No data.</div>
        : w.chart === 'donut' ? <Donut data={w.series} />
          : w.chart === 'line' ? <LineChart data={w.series} />
            : w.chart === 'line2' ? <LineChart2 data={w.series} />
              : w.chart === 'kpi' ? <div style={{ fontSize: '2rem', fontWeight: 800, color: C.navy }}>{w.series[0]?.value}</div>
                : <BarList data={w.series} />}
    </div>
  );
}
function BarList({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return <div>{data.map((d, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <span style={{ width: 120, fontSize: '.78rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
      <div style={{ flex: 1, height: 16, background: '#eef2f8', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: PALETTE[i % PALETTE.length] }} /></div>
      <span style={{ width: 44, textAlign: 'right', fontWeight: 700, color: C.navy, fontSize: '.8rem' }}>{d.value.toLocaleString()}</span>
    </div>
  ))}</div>;
}
function Donut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0; const R = 54, sw = 22, cx = 70, cy = 70, cir = 2 * Math.PI * R;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#eef2f8" strokeWidth={sw} />
        {data.map((d, i) => { const frac = d.value / total; const dash = frac * cir; const el = <circle key={i} cx={cx} cy={cy} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={sw} strokeDasharray={`${dash} ${cir - dash}`} strokeDashoffset={-acc * cir} transform={`rotate(-90 ${cx} ${cy})`} />; acc += frac; return el; })}
        <text x={cx} y={cy + 5} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: C.navy }}>{total.toLocaleString()}</text>
      </svg>
      <div>{data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, fontSize: '.78rem', color: C.ink }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length] }} />{d.label}<span style={{ color: C.muted }}>· {d.value} ({Math.round((d.value / total) * 100)}%)</span>
        </div>
      ))}</div>
    </div>
  );
}
function LineChart({ data }) {
  const w = 300, h = 130, pad = 24;
  const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, data.length - 1), h - pad - ((d.value / max) * (h - 2 * pad))]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={C.line} />
      <path d={path} fill="none" stroke={C.blue} strokeWidth="2.5" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={C.navy} />)}
      {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0) && <text key={i} x={pts[i][0]} y={h - 8} textAnchor="middle" style={{ fontSize: 8, fill: C.muted }}>{d.label}</text>)}
    </svg>
  );
}
function LineChart2({ data }) {
  const w = 300, h = 130, pad = 24;
  const max = Math.max(...data.map((d) => Math.max(d.starters || 0, d.leavers || 0)), 1);
  const line = (key, color) => { const pts = data.map((d, i) => [pad + (i * (w - 2 * pad)) / Math.max(1, data.length - 1), h - pad - (((d[key] || 0) / max) * (h - 2 * pad))]); return <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" />; };
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke={C.line} />
        {line('starters', C.green)}{line('leavers', C.red)}
        {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0) && <text key={i} x={pad + (i * (w - 2 * pad)) / Math.max(1, data.length - 1)} y={h - 8} textAnchor="middle" style={{ fontSize: 8, fill: C.muted }}>{d.label}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: '.74rem', color: C.ink, marginTop: 4 }}><span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.green, borderRadius: 2, marginRight: 4 }} />Starters</span><span><span style={{ display: 'inline-block', width: 9, height: 9, background: C.red, borderRadius: 2, marginRight: 4 }} />Leavers</span></div>
    </div>
  );
}

// dashboard export helpers — flatten a widget's series into table columns/rows
function seriesColumns(w) {
  if (w.chart === 'line2') return [{ label: 'Period', key: 'label', width: 16 }, { label: 'Starters', key: 'starters', width: 12 }, { label: 'Leavers', key: 'leavers', width: 12 }];
  return [{ label: 'Label', key: 'label', width: 26 }, { label: 'Value', key: 'value', width: 14 }];
}
function seriesRows(w) { return w.series || []; }

/* ============================ shared UI ============================ */
function Card({ title, children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)', marginBottom: 14 }}>{title && <div style={{ fontWeight: 800, color: C.navy, fontSize: '.88rem', marginBottom: 10 }}>{title}</div>}{children}</div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '10px 13px', borderRadius: 9, fontSize: '.85rem', marginBottom: 14 }}>{children}</div>; }
function GuideNote({ children, onClose }) {
  return (
    <div style={{ display: 'flex', gap: 12, background: '#eef4ff', border: '1px solid #d5e3fb', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#012158,#3485E9)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Sparkles size={17} color="#fff" /></div>
      <div style={{ flex: 1, color: '#173a6b', fontSize: '.88rem', lineHeight: 1.6 }}>{children}</div>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#173a6b', cursor: 'pointer', fontWeight: 800, fontSize: 16, lineHeight: 1 }}>×</button>}
    </div>
  );
}
function outBtn() { return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: `1px solid rgba(255,255,255,.9)`, borderRadius: 10, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }; }
function th() { return { textAlign: 'left', padding: '9px 12px', background: '#f4f7fc', color: C.navy, fontWeight: 700, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }; }
function td() { return { padding: '8px 12px', fontSize: '.82rem', color: C.ink, whiteSpace: 'nowrap' }; }