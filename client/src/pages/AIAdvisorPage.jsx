import { useEffect, useState, useRef, useMemo } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ModuleShell } from '../ui/kit';
import { applyDerived, filterRows, uniqueValues, kpiValue, breakdownSeries, fmtValue } from '../utils/dashboardCompute';
import {
  Sparkles, MessageSquare, Wand2, Upload, Send, RefreshCw,
  Download, TrendingUp, ShieldAlert, Lightbulb, Plus, Trash2, Filter, Database, Table2,
  FlaskConical, Code2, ChevronDown,
} from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Workforce Intelligence';
const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const PALETTE = ['#012158', '#3485E9', '#FD9C09', '#17a2b8', '#7c5cdf', '#1f9d57', '#e5484d', '#0f766e', '#b45309', '#0369a1'];

/* ============================ ROOT ============================ */
export default function AIAdvisorPage() {
  const initial = (() => { try { return new URLSearchParams(window.location.search).get('section') || 'insights'; } catch { return 'insights'; } })();
  const [section, setSection] = useState(initial);
  const [cfg, setCfg] = useState(null); // { configured, name }

  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/ai/status'); if (a) setCfg(data); } catch { if (a) setCfg({ configured: false }); } })(); return () => { a = false; }; }, []);

  const groups = [
    { title: 'Insights', items: [
      { key: 'insights', label: 'Insights', Icon: TrendingUp },
      { key: 'ask', label: 'Ask HR', Icon: MessageSquare },
    ] },
    { title: 'Build & analyze', items: [
      { key: 'excel', label: 'Dashboard Builder', Icon: Table2 },
      { key: 'science', label: 'Data Scientist', Icon: FlaskConical },
    ] },
    { title: 'Data', items: [
      { key: 'import', label: 'Import employees', Icon: Upload },
    ] },
  ];

  // Insights & Ask need the AI; the builder and import run without it.
  const aiReady = cfg && cfg.configured;
  return (
    <ModuleShell brand={{ title: 'Workforce Intelligence', subtitle: 'Data-grounded AI', Icon: Sparkles }} groups={groups} active={section} onSelect={setSection}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {!cfg && <div style={{ color: C.muted, padding: 40 }}>Loading…</div>}
        {cfg && <>
          {section === 'insights' && (aiReady ? <Insights /> : <NotConfigured />)}
          {section === 'ask' && (aiReady ? <Ask /> : <NotConfigured />)}
          {section === 'excel' && <ExcelStudio />}
          {section === 'science' && (aiReady ? <DataScientist /> : <NotConfigured />)}
          {section === 'import' && <ImportWizard />}
        </>}
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

/* ============================ DATA SCIENTIST ============================ */
const DS_SUGGEST = [
  'Which departments are overpaying relative to tenure?',
  'Is there a gender pay gap after controlling for grade?',
  'Model what predicts attrition and rank the drivers',
  'Cluster employees into pay-and-tenure segments',
];

function DataScientist() {
  const [question, setQuestion] = useState('');
  const [source, setSource] = useState('system'); // 'system' | 'upload'
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const [showCode, setShowCode] = useState(false);

  async function run() {
    const q = question.trim();
    if (!q || busy) return;
    if (source === 'upload' && !file) { setErr('Choose a CSV or Excel file to analyse.'); return; }
    setBusy(true); setErr(''); setOut(null); setShowCode(false);
    try {
      let data;
      if (source === 'upload') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('question', q);
        ({ data } = await api.post('/ai/data-science/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }));
      } else {
        ({ data } = await api.post('/ai/data-science', { question: q, source: 'system' }));
      }
      setOut(data);
      if (!data.ok && data.error) setErr(data.error);
    } catch (e) {
      setErr(e?.response?.data?.message || 'The analysis could not be completed.');
    } finally { setBusy(false); }
  }

  const result = out?.result || {};
  const hasResult = result && Object.keys(result).length > 0;

  return (
    <div>
      <PageHead title="Data Scientist" subtitle="" />
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <SrcTab active={source === 'system'} onClick={() => setSource('system')} Icon={Database} label="Company data" />
          <SrcTab active={source === 'upload'} onClick={() => setSource('upload')} Icon={Upload} label="Upload a file" />
        </div>
        {source === 'upload' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px dashed #c6d2e4`, borderRadius: 10, marginBottom: 12, cursor: 'pointer', color: C.ink, fontSize: '.85rem' }}>
            <Upload size={15} color={C.blue} />
            <span>{file ? file.name : 'Choose CSV or Excel'}</span>
            <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          </label>
        )}
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
          rows={2}
          placeholder="Ask an analytical question about your workforce…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: `1px solid #d8e0ec`, borderRadius: 12, fontSize: '.9rem', color: C.ink, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DS_SUGGEST.map((s) => <button key={s} onClick={() => setQuestion(s)} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: '6px 11px', fontSize: '.76rem', color: C.navy, cursor: 'pointer' }}>{s}</button>)}
          </div>
          <button onClick={run} disabled={busy || !question.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', borderRadius: 12, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', opacity: busy || !question.trim() ? 0.6 : 1 }}>
            <FlaskConical size={16} /> {busy ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
      </div>

      {err && <ErrBox>{err}</ErrBox>}
      {busy && <div style={{ color: C.muted, padding: '18px 2px', fontSize: '.88rem' }}>Writing and running the analysis on your data…</div>}

      {out && out.ok && (
        <div>
          {out.narrative && (
            <div style={{ background: 'linear-gradient(135deg,#012158,#0c2f6b)', color: '#fff', borderRadius: 14, padding: 20, marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: '.9rem', lineHeight: 1.65 }}>{out.narrative}</div>
          )}
          {hasResult && <ResultView result={result} />}
          {(out.charts || []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginTop: 4 }}>
              {out.charts.map((c, i) => (
                <div key={i} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
                  <img alt={`Chart ${i + 1}`} src={`data:image/png;base64,${c}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
                </div>
              ))}
            </div>
          )}
          {out.code && (
            <div style={{ marginTop: 16 }}>
              <button onClick={() => setShowCode((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 13px', fontSize: '.8rem', fontWeight: 700, color: C.navy, cursor: 'pointer' }}>
                <Code2 size={15} /> {showCode ? 'Hide analysis code' : 'View analysis code'} <ChevronDown size={14} style={{ transform: showCode ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {showCode && (
                <pre style={{ marginTop: 10, background: '#0c1627', color: '#dbe7ff', borderRadius: 12, padding: 16, overflowX: 'auto', fontSize: '.78rem', lineHeight: 1.55, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{out.code}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Render an arbitrary result dict: scalars as KPI tiles, structured values as
// tables or labelled blocks. Numbers are already computed server-side.
function ResultView({ result }) {
  const entries = Object.entries(result);
  const scalars = entries.filter(([, v]) => v == null || typeof v !== 'object');
  const complex = entries.filter(([, v]) => v && typeof v === 'object');
  return (
    <div style={{ marginBottom: 16 }}>
      {scalars.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: complex.length ? 14 : 0 }}>
          {scalars.map(([k, v]) => <MiniKpi key={k} label={prettyKey(k)} value={fmtScalar(v)} />)}
        </div>
      )}
      {complex.map(([k, v]) => (
        <Card key={k} title={prettyKey(k)}><ValueBlock value={v} /></Card>
      ))}
    </div>
  );
}

function ValueBlock({ value }) {
  // Object of scalars → two-column table. Array of objects → a grid table.
  if (Array.isArray(value)) {
    if (value.length && value.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      const cols = Array.from(value.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set()));
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead><tr>{cols.map((c) => <th key={c} style={thCell}>{prettyKey(c)}</th>)}</tr></thead>
            <tbody>{value.slice(0, 200).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} style={tdCell}>{fmtScalar(r[c])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    return <div style={{ fontSize: '.85rem', color: C.ink }}>{value.map((v) => fmtScalar(v)).join(', ')}</div>;
  }
  const rows = Object.entries(value);
  const allScalar = rows.every(([, v]) => v == null || typeof v !== 'object');
  if (allScalar) {
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
        <tbody>{rows.map(([k, v]) => <tr key={k}><td style={{ ...tdCell, fontWeight: 700, color: C.navy, width: '45%' }}>{prettyKey(k)}</td><td style={tdCell}>{fmtScalar(v)}</td></tr>)}</tbody>
      </table>
    );
  }
  return <div>{rows.map(([k, v]) => <div key={k} style={{ marginBottom: 10 }}><div style={{ fontWeight: 700, color: C.navy, fontSize: '.82rem', marginBottom: 4 }}>{prettyKey(k)}</div><ValueBlock value={v} /></div>)}</div>;
}

const thCell = { textAlign: 'left', padding: '7px 10px', borderBottom: `2px solid ${C.line}`, color: C.muted, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em', whiteSpace: 'nowrap' };
const tdCell = { padding: '7px 10px', borderBottom: `1px solid ${C.line}`, color: C.ink };
function prettyKey(k) { return String(k).replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }
function fmtScalar(v) {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') { if (!Number.isFinite(v)) return '—'; const r = Math.round(v * 100) / 100; return r.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  return String(v);
}

/* ============================ CHART PRIMITIVES ============================ */
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
/* ============================ shared UI ============================ */
/* ==================== IN-WEB DASHBOARD BUILDER + EXCEL EXPORT ==================== */
const AGG_OPTS = [['count', 'Count'], ['sum', 'Sum'], ['mean', 'Average'], ['ratio', 'Ratio %'], ['distinct', 'Distinct']];
const BD_AGG_OPTS = [['count', 'Count'], ['sum', 'Sum'], ['mean', 'Average']];
const CHART_OPTS = [['column', 'Column'], ['bar', 'Bar'], ['pie', 'Pie'], ['line', 'Line']];
const FMT_OPTS = [['int', 'Number'], ['float', 'Decimal'], ['money', 'Money'], ['pct', 'Percent']];

function defaultSpec(cols) {
  const cs = cols.filter((c) => c.type === 'category' && c.distinct > 1 && c.distinct <= 60).map((c) => c.name);
  const ns = cols.filter((c) => c.type === 'number').map((c) => c.name);
  const sal = ns.find((n) => /salary|pay|wage|net|gross/i.test(n));
  const statusCol = cols.find((c) => /status/i.test(c.name));
  const kpis = [{ label: 'Headcount', agg: 'count', format: 'int' }];
  if (sal) { kpis.push({ label: `Average ${sal}`, agg: 'mean', field: sal, format: 'money' }); kpis.push({ label: `Total ${sal}`, agg: 'sum', field: sal, format: 'money' }); }
  if (statusCol) kpis.push({ label: 'Attrition', agg: 'ratio', field: statusCol.name, match: 'terminated', format: 'pct' });
  const bds = cs.slice(0, 3).map((c, i) => ({ title: `Headcount by ${c}`, by: c, agg: 'count', chart: i === 2 ? 'pie' : 'column', format: 'int', top: 12 }));
  if (sal && cs[0]) bds.push({ title: `Average ${sal} by ${cs[0]}`, by: cs[0], agg: 'mean', field: sal, chart: 'bar', format: 'money', top: 12 });
  const ageCol = ns.find((n) => /age/i.test(n));
  const derived = ageCol ? [{ name: 'ageBand', from: ageCol, type: 'bucket', bins: [25, 30, 40, 50], labels: ['<25', '25-29', '30-39', '40-49', '50+'] }] : [];
  return { title: 'Workforce Analytics Dashboard', selector: cs[0] || '', kpis: kpis.slice(0, 4), breakdowns: bds.slice(0, 6), derived };
}
const normalizeSpec = (s) => ({ title: s.title || 'Workforce Analytics Dashboard', selector: s.selector || '', kpis: Array.isArray(s.kpis) ? s.kpis : [], breakdowns: Array.isArray(s.breakdowns) ? s.breakdowns : [], derived: Array.isArray(s.derived) ? s.derived : [] });
const errMsg = async (e) => { let m = e?.response?.data?.message; try { const t = await e?.response?.data?.text?.(); if (t) m = JSON.parse(t).message || m; } catch { /* */ } return m || 'Something went wrong.'; };

function ExcelStudio() {
  const { tenant } = useAuth();
  const currency = tenant?.baseCurrency || '';
  const [step, setStep] = useState('source');       // 'source' | 'build'
  const [source, setSource] = useState('system');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [spec, setSpec] = useState(null);
  const [filterVal, setFilterVal] = useState('(All)');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [narrBusy, setNarrBusy] = useState(false);
  const [narrEngine, setNarrEngine] = useState('');
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const cats = columns.filter((c) => c.type === 'category' && c.distinct > 1 && c.distinct <= 60).map((c) => c.name);
  const nums = columns.filter((c) => c.type === 'number').map((c) => c.name);
  const derivedNames = (spec?.derived || []).map((d) => d.name);
  const byOpts = [...cats, ...derivedNames];

  function apply(data) {
    setRows(data.rows || []); setColumns(data.columns || []);
    setSpec(defaultSpec(data.columns || [])); setFilterVal('(All)'); setStep('build'); setDone('');
  }
  async function loadSystem() { setErr(''); setLoading(true); try { const { data } = await api.get('/ai/dataset/system'); if (!data.rows?.length) { setErr('No employee records to analyse yet.'); } else apply(data); } catch (e) { setErr(await errMsg(e)); } finally { setLoading(false); } }
  async function loadUpload() { if (!file) { setErr('Choose a CSV or Excel file first.'); return; } setErr(''); setLoading(true); try { const fd = new FormData(); fd.append('file', file); const { data } = await api.post('/ai/dataset/upload', fd); apply(data); } catch (e) { setErr(await errMsg(e)); } finally { setLoading(false); } }

  async function suggest() { setAiBusy(true); setErr(''); try { const { data } = await api.post('/ai/spec/suggest', { schema: columns, prompt: aiPrompt, title: spec?.title }); if (data.spec) { setSpec((s) => ({ ...normalizeSpec(data.spec), narrative: s?.narrative })); setFilterVal('(All)'); } } catch (e) { setErr(await errMsg(e)); } finally { setAiBusy(false); } }

  async function analyzeAI() {
    setNarrBusy(true); setErr('');
    try {
      const kpis = spec.kpis.map((k) => ({ label: k.label, value: kpiValue(frows, k), format: k.format }));
      const breakdowns = spec.breakdowns.map((b) => ({ title: b.title, by: b.by, agg: b.agg, series: breakdownSeries(frows, b) }));
      // Send rows + selector too: if AI is off, the server runs the deterministic
      // Python engine (analyze.py) on these exact previewed rows — no Claude needed.
      const { data } = await api.post('/ai/analyze/narrative', {
        title: spec.title, prompt: aiPrompt, kpis, breakdowns,
        rows: frows, selector: spec.selector, source,
        meta: { rows: frows.length, currency },
      });
      if (data.narrative) { setSpec((s) => ({ ...s, narrative: data.narrative })); setNarrEngine(data.engine || ''); }
    } catch (e) { setErr(await errMsg(e)); } finally { setNarrBusy(false); }
  }

  async function download() {
    setExporting(true); setErr(''); setDone('');
    try {
      const body = { spec, source }; if (source !== 'system') body.rows = rows;
      const resp = await api.post('/ai/excel/build', body, { responseType: 'blob' });
      const cd = resp.headers?.['content-disposition'] || ''; const m = /filename="?([^"]+)"?/.exec(cd);
      const fname = (m && m[1]) || 'HR_Dashboard.xlsx';
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setDone(`Downloaded “${fname}”.`);
    } catch (e) { setErr(await errMsg(e)); } finally { setExporting(false); }
  }

  // ---- live preview compute (mirrors the engine) ----
  const drows = useMemo(() => applyDerived(rows, spec?.derived), [rows, spec]);
  const selVals = spec?.selector ? ['(All)', ...uniqueValues(drows, spec.selector)] : [];
  const frows = useMemo(() => filterRows(drows, spec?.selector, filterVal), [drows, spec, filterVal]);

  // ---- spec mutators ----
  const setSpecField = (k, v) => setSpec((s) => ({ ...s, [k]: v }));
  const updKpi = (i, patch) => setSpec((s) => ({ ...s, kpis: s.kpis.map((k, j) => j === i ? { ...k, ...patch } : k) }));
  const updBd = (i, patch) => setSpec((s) => ({ ...s, breakdowns: s.breakdowns.map((b, j) => j === i ? { ...b, ...patch } : b) }));
  const addKpi = () => setSpec((s) => ({ ...s, kpis: [...s.kpis, { label: 'New KPI', agg: 'count', format: 'int' }].slice(0, 4) }));
  const addBd = () => setSpec((s) => ({ ...s, breakdowns: [...s.breakdowns, { title: 'New breakdown', by: byOpts[0] || '', agg: 'count', chart: 'column', format: 'int', top: 12 }].slice(0, 6) }));
  const delKpi = (i) => setSpec((s) => ({ ...s, kpis: s.kpis.filter((_, j) => j !== i) }));
  const delBd = (i) => setSpec((s) => ({ ...s, breakdowns: s.breakdowns.filter((_, j) => j !== i) }));

  if (step === 'source') {
    return (
      <>
        <PageHead title="Dashboard Builder" subtitle="" />
        <Card>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <SrcTab active={source === 'system'} onClick={() => setSource('system')} Icon={Database} label="From system data" />
            <SrcTab active={source === 'upload'} onClick={() => setSource('upload')} Icon={Upload} label="Upload a file" />
          </div>
          {source === 'upload' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '.78rem', color: C.muted, fontWeight: 700, marginBottom: 6 }}>Data file (CSV or Excel)</div>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: '.86rem' }} />
              {file && <span style={{ marginLeft: 10, fontSize: '.82rem', color: C.ink }}>{file.name}</span>}
            </div>
          )}
          {err && <ErrBox>{err}</ErrBox>}
          <button onClick={source === 'system' ? loadSystem : loadUpload} disabled={loading}
            style={primaryBtnStyle(loading)}>
            {loading ? <RefreshCw size={16} /> : <Table2 size={16} />} {loading ? 'Loading data…' : 'Load data & start building'}
          </button>
        </Card>
      </>
    );
  }

  // BUILD step
  return (
    <>
      <PageHead title="Dashboard Builder"
        subtitle={`${rows.length.toLocaleString()} rows · ${columns.length} columns`}
        action={<button onClick={() => { setStep('source'); setErr(''); setDone(''); }} style={ghostBtnStyle}>← Change data</button>} />

      {/* AI: design the dashboard, or analyse the current figures */}
      <Card title="Work with AI (optional)">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. attrition and avg salary by department and grade, with a gender split"
            style={{ flex: 1, minWidth: 220, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: '.88rem', fontFamily: 'inherit', color: C.ink }} />
          <button onClick={suggest} disabled={aiBusy} style={primaryBtnStyle(aiBusy, true)}>{aiBusy ? <RefreshCw size={15} /> : <Wand2 size={15} />} {aiBusy ? 'Designing…' : 'Design it'}</button>
          <button onClick={analyzeAI} disabled={narrBusy} style={{ ...primaryBtnStyle(narrBusy, true), background: '#fff', color: C.navy, border: `1px solid ${C.navy}` }}>{narrBusy ? <RefreshCw size={15} /> : <Sparkles size={15} />} {narrBusy ? 'Analysing…' : 'Analyse figures'}</button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }} className="nx-builder-grid">
        {/* -------- LEFT: controls -------- */}
        <div>
          <Card title="Dashboard">
            <Lbl2>Title</Lbl2>
            <input value={spec.title} onChange={(e) => setSpecField('title', e.target.value)} style={inp2} />
            <Lbl2>Interactive filter</Lbl2>
            <select value={spec.selector || ''} onChange={(e) => { setSpecField('selector', e.target.value); setFilterVal('(All)'); }} style={inp2}>
              <option value="">— none —</option>
              {byOpts.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Card>

          <Card title="KPIs">
            {spec.kpis.map((k, i) => (
              <div key={i} style={editRow}>
                <input value={k.label} onChange={(e) => updKpi(i, { label: e.target.value })} placeholder="Label" style={{ ...inpXs, flex: '1 1 100%' }} />
                <select value={k.agg} onChange={(e) => updKpi(i, { agg: e.target.value })} style={inpXs}>{AGG_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                {k.agg !== 'count' && (
                  <select value={k.field || ''} onChange={(e) => updKpi(i, { field: e.target.value })} style={inpXs}>
                    <option value="">field…</option>
                    {(k.agg === 'sum' || k.agg === 'mean' ? nums : columns.map((c) => c.name)).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                {k.agg === 'ratio' && <input value={k.match || ''} onChange={(e) => updKpi(i, { match: e.target.value })} placeholder="match" style={{ ...inpXs, width: 90 }} />}
                <select value={k.format || 'int'} onChange={(e) => updKpi(i, { format: e.target.value })} style={inpXs}>{FMT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button onClick={() => delKpi(i)} title="Remove" style={delBtn}><Trash2 size={13} /></button>
              </div>
            ))}
            {spec.kpis.length < 4 && <button onClick={addKpi} style={addBtn}><Plus size={14} /> Add KPI</button>}
          </Card>

          <Card title="Breakdowns & charts">
            {spec.breakdowns.map((b, i) => (
              <div key={i} style={{ ...editRow, flexWrap: 'wrap' }}>
                <input value={b.title} onChange={(e) => updBd(i, { title: e.target.value })} placeholder="Title" style={{ ...inpXs, flex: '1 1 100%' }} />
                <select value={b.by} onChange={(e) => updBd(i, { by: e.target.value })} style={inpXs}>{byOpts.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                <select value={b.agg} onChange={(e) => updBd(i, { agg: e.target.value })} style={inpXs}>{BD_AGG_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                {(b.agg === 'sum' || b.agg === 'mean') && (
                  <select value={b.field || ''} onChange={(e) => updBd(i, { field: e.target.value })} style={inpXs}><option value="">field…</option>{nums.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                )}
                <select value={b.chart} onChange={(e) => updBd(i, { chart: e.target.value })} style={inpXs}>{CHART_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button onClick={() => delBd(i)} title="Remove" style={delBtn}><Trash2 size={13} /></button>
              </div>
            ))}
            {spec.breakdowns.length < 6 && <button onClick={addBd} style={addBtn}><Plus size={14} /> Add breakdown</button>}
          </Card>

          {err && <ErrBox>{err}</ErrBox>}
          {done && <div style={{ background: '#eafaf0', border: '1px solid #bfe6cd', color: '#12703f', padding: '10px 13px', borderRadius: 9, fontSize: '.85rem', marginBottom: 12 }}>{done}</div>}
          <button onClick={download} disabled={exporting} style={{ ...primaryBtnStyle(exporting), width: '100%', justifyContent: 'center' }}>
            {exporting ? <RefreshCw size={16} /> : <Download size={16} />} {exporting ? 'Building Excel…' : 'Download interactive Excel'}
          </button>
        </div>

        {/* -------- RIGHT: live preview -------- */}
        <div>
          <Card>
            <div style={{ background: 'linear-gradient(120deg,#012158,#0b3f96)', margin: -16, marginBottom: 14, padding: '16px 18px', borderRadius: '14px 14px 0 0' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>{spec.title || 'Dashboard'}</div>
              <div style={{ color: '#cfe0f6', fontSize: '.76rem', marginTop: 2 }}>Live preview · {frows.length.toLocaleString()} of {rows.length.toLocaleString()} rows</div>
            </div>
            {spec.selector && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Filter size={15} color={C.blue} />
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: C.muted }}>{spec.selector}:</span>
                <select value={filterVal} onChange={(e) => setFilterVal(e.target.value)} style={{ ...inpXs, minWidth: 160 }}>
                  {selVals.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, spec.kpis.length))}, 1fr)`, gap: 10, marginBottom: 16 }}>
              {spec.kpis.map((k, i) => (
                <div key={i} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 13px' }}>
                  <div style={{ fontSize: '.64rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: C.navy, marginTop: 3 }}>{fmtValue(kpiValue(frows, k), k.format, currency)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {spec.breakdowns.map((b, i) => {
                const series = breakdownSeries(frows, b);
                return (
                  <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: '.82rem', marginBottom: 8 }}>{b.title}</div>
                    {series.length === 0 ? <div style={{ color: C.muted, fontSize: '.8rem' }}>No data.</div>
                      : b.chart === 'pie' ? <Donut data={series} />
                      : b.chart === 'line' ? <LineChart data={series} />
                      : <BarList data={series} />}
                  </div>
                );
              })}
            </div>
            {spec.narrative && (spec.narrative.summary || (spec.narrative.findings || []).length > 0) && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <Sparkles size={15} color={C.blue} />
                  <span style={{ fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>{spec.narrative.headline || 'Analysis'}</span>
                  {narrEngine && <span style={{ fontSize: '.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: narrEngine === 'ai' ? C.blue : '#12703f', background: narrEngine === 'ai' ? '#eaf3ff' : '#eafaf0', border: `1px solid ${narrEngine === 'ai' ? '#bcdcff' : '#bfe6cd'}`, borderRadius: 999, padding: '2px 8px' }}>{narrEngine === 'ai' ? 'AI' : 'Local · no AI'}</span>}
                </div>
                {spec.narrative.summary && <div style={{ fontSize: '.84rem', color: C.ink, lineHeight: 1.6, marginBottom: 10 }}>{spec.narrative.summary}</div>}
                {(spec.narrative.findings || []).length > 0 && <NarrBlock title="Key findings" items={spec.narrative.findings.map((f) => ({ t: String(f) }))} />}
                {(spec.narrative.risks || []).length > 0 && <NarrBlock title="Risks" items={spec.narrative.risks.map((r) => ({ t: r.title, d: r.detail }))} />}
                {(spec.narrative.recommendations || []).length > 0 && <NarrBlock title="Recommendations" items={spec.narrative.recommendations.map((r) => ({ t: r.action, d: r.rationale }))} />}
                <div style={{ fontSize: '.72rem', color: C.muted, marginTop: 8 }}>Generated from the current view{spec.selector && filterVal !== '(All)' ? ` (filtered: ${filterVal})` : ''}. Included as an “AI Insights” sheet on export.</div>
              </div>
            )}
          </Card>
        </div>
      </div>
      <style>{`@media (max-width: 920px){ .nx-builder-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

function NarrBlock({ title, items }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#0b6fd6', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{title}</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 7, fontSize: '.82rem', color: '#16233b', marginBottom: 5, lineHeight: 1.5 }}>
          <span style={{ color: '#3485E9', fontWeight: 800 }}>•</span>
          <span>{it.d ? <><strong>{it.t}</strong> — {it.d}</> : it.t}</span>
        </div>
      ))}
    </div>
  );
}
function SrcTab({ active, onClick, Icon, label }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 11, cursor: 'pointer', fontWeight: 700, fontSize: '.88rem', fontFamily: 'inherit',
      border: `1px solid ${active ? C.navy : C.line}`, background: active ? '#eef4ff' : '#fff', color: active ? C.navy : C.ink }}><Icon size={17} /> {label}</button>
  );
}
const primaryBtnStyle = (busy, small) => ({ display: 'inline-flex', alignItems: 'center', gap: 8, padding: small ? '10px 16px' : '12px 20px', border: 'none', borderRadius: 11, background: '#012158', color: '#fff', fontWeight: 700, fontSize: small ? '.85rem' : '.92rem', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.65 : 1, fontFamily: 'inherit' });
const ghostBtnStyle = { padding: '8px 14px', border: '1px solid #e5e8ec', borderRadius: 9, background: '#fff', color: '#16233b', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', fontFamily: 'inherit' };
const inp2 = { width: '100%', padding: '9px 11px', border: '1px solid #e5e8ec', borderRadius: 9, fontSize: '.86rem', fontFamily: 'inherit', color: '#16233b', marginBottom: 10 };
const inpXs = { padding: '7px 9px', border: '1px solid #e5e8ec', borderRadius: 8, fontSize: '.8rem', fontFamily: 'inherit', color: '#16233b', background: '#fff', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' };
const editRow = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 };
const addBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px dashed #cfe3fb', background: '#f7fbff', color: '#0b6fd6', borderRadius: 9, padding: '7px 12px', fontSize: '.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const delBtn = { display: 'grid', placeItems: 'center', width: 28, height: 28, border: '1px solid #f6c9cb', background: '#fff', color: '#e5484d', borderRadius: 8, cursor: 'pointer', flexShrink: 0 };
function Lbl2({ children }) { return <div style={{ fontSize: '.72rem', color: '#8a94a6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{children}</div>; }

function Card({ title, children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)', marginBottom: 14 }}>{title && <div style={{ fontWeight: 800, color: C.navy, fontSize: '.88rem', marginBottom: 10 }}>{title}</div>}{children}</div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '10px 13px', borderRadius: 9, fontSize: '.85rem', marginBottom: 14 }}>{children}</div>; }
function outBtn() { return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: `1px solid rgba(255,255,255,.9)`, borderRadius: 10, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }; }
function th() { return { textAlign: 'left', padding: '9px 12px', background: '#f4f7fc', color: C.navy, fontWeight: 700, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }; }
function td() { return { padding: '8px 12px', fontSize: '.82rem', color: C.ink, whiteSpace: 'nowrap' }; }
/* ============================ IMPORT EMPLOYEES (wizard) ============================ */
function ImportWizard() {
  const { user } = useAuth();
  const canImport = WRITE_ROLES.includes(user?.role);
  const [step, setStep] = useState('upload');        // upload | review | done
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [an, setAn] = useState(null);                // /import/analyze result
  const [map, setMap] = useState([]);                // editable [{source, field}]
  const [updateExisting, setUpdateExisting] = useState(false);
  const [report, setReport] = useState(null);
  const [fixRows, setFixRows] = useState([]);        // editable rejected rows
  const [fixBusy, setFixBusy] = useState(false);

  const catalogue = an?.catalogue || [];
  const fieldOptions = useMemo(() => ([
    ['', '— skip —'],
    ['__fullName__', 'Full name → split'],
    ...catalogue.map((c) => [c.field, c.label + (c.required ? ' *' : '')]),
  ]), [catalogue]);
  const fieldOf = (source) => (map.find((m) => m.source === source)?.field) || '';
  const setFieldFor = (source, field) => setMap((prev) => {
    const others = prev.filter((m) => m.source !== source);
    return field ? [...others, { source, field }] : others;
  });

  async function analyze() {
    if (!file) { setErr('Choose a .xlsx or .csv file first.'); return; }
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/employees/import/analyze', fd);
      setAn(data);
      setMap((data.mapping || []).map((m) => ({ source: m.source, field: m.field })));
      setStep('review');
    } catch (e) { setErr(e?.response?.data?.message || 'Could not read that file.'); }
    finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(map));
      fd.append('updateExisting', String(updateExisting));
      const { data } = await api.post('/employees/import/commit', fd);
      setReport(data);
      setFixRows((data.rejectedRows || []).map((r) => ({ ...r.data, row: r.row, _issues: r.issues || [] })));
      setStep('done');
    } catch (e) { setErr(e?.response?.data?.message || 'Import failed.'); }
    finally { setBusy(false); }
  }

  async function reimportFixed() {
    const rows = fixRows.map((r) => { const o = { ...r }; delete o._issues; return o; });
    setFixBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('rows', JSON.stringify(rows));
      fd.append('updateExisting', String(updateExisting));
      const { data } = await api.post('/employees/import/commit', fd);
      setReport((prev) => ({ ...prev,
        inserted: (prev.inserted || 0) + (data.inserted || 0),
        updated: (prev.updated || 0) + (data.updated || 0),
        skipped: (prev.skipped || 0) + (data.skipped || 0),
        rejected: data.rejected || 0 }));
      setFixRows((data.rejectedRows || []).map((r) => ({ ...r.data, row: r.row, _issues: r.issues || [] })));
    } catch (e) { setErr(e?.response?.data?.message || 'Re-import failed.'); }
    finally { setFixBusy(false); }
  }

  function reset() { setStep('upload'); setFile(null); setAn(null); setMap([]); setReport(null); setFixRows([]); setErr(''); }

  // Recompute the validation preview whenever the mapping is edited (debounced).
  useEffect(() => {
    if (step !== 'review' || !file) return;
    const t = setTimeout(async () => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('mapping', JSON.stringify(map));
        const { data } = await api.post('/employees/import/analyze', fd);
        setAn((prev) => (prev ? { ...prev, preview: data.preview } : prev));
      } catch { /* keep the last preview */ }
    }, 350);
    return () => clearTimeout(t);
  }, [map, step, file]);

  if (!canImport) {
    return <div><PageHead title="Import employees" subtitle="" />
      <Card><div style={{ color: C.muted, fontSize: '.88rem' }}>You don’t have permission to import employees. Ask an HR manager or administrator.</div></Card></div>;
  }

  const confColor = (c) => c === 'high' ? C.green : (c === 'medium' ? C.orange : (c === 'ai' ? C.purple : C.muted));
  const fixCols = (() => {
    const base = ['staffId', 'firstName', 'lastName'];
    const extra = [];
    fixRows.forEach((r) => Object.keys(r).forEach((k) => { if (!base.includes(k) && k !== 'row' && k !== '_issues' && !extra.includes(k)) extra.push(k); }));
    return [...base, ...extra].slice(0, 8);
  })();

  return (
    <div>
      <PageHead title="Import employees" subtitle="" />
      <Stepper step={step} />
      {err && <ErrBox>{err}</ErrBox>}

      {step === 'upload' && (
        <Card>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setErr(''); }} style={{ fontSize: '.85rem' }} />
            <button onClick={analyze} disabled={busy || !file} style={primaryBtnStyle(busy || !file, true)}>
              {busy ? <RefreshCw size={15} /> : <Sparkles size={15} />} {busy ? 'Reading…' : 'Analyze file'}
            </button>
          </div>
        </Card>
      )}

      {step === 'review' && an && (
        <>
          <div style={{ fontSize: '.8rem', color: C.muted, marginBottom: 12 }}>
            <strong style={{ color: C.navy }}>{an.file}</strong> · {an.rowCount} rows · {an.columns.length} columns
            {an.aiRefined ? <span style={{ marginLeft: 8, color: C.purple, fontWeight: 700 }}>· AI helped map {an.aiAdded}</span> : null}
          </div>

          <Card title="Column mapping — review & adjust">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th()}>Your column</th><th style={th()}>Maps to</th><th style={th()}>Match</th><th style={th()}>Why</th></tr></thead>
                <tbody>
                  {an.columns.map((col) => {
                    const orig = (an.mapping || []).find((m) => m.source === col);
                    return (
                      <tr key={col} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={td()}><strong>{col}</strong></td>
                        <td style={td()}>
                          <select value={fieldOf(col)} onChange={(e) => setFieldFor(col, e.target.value)} style={{ ...inpXs, minWidth: 180 }}>
                            {fieldOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td style={td()}>{orig && <span style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', color: '#fff', background: confColor(orig.confidence), borderRadius: 999, padding: '2px 8px' }}>{orig.confidence}</span>}</td>
                        <td style={{ ...td(), color: C.muted, whiteSpace: 'normal' }}>{orig ? orig.reason : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Validation preview">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <Stat label="Rows" value={an.preview.summary.rows} color={C.navy} />
              <Stat label="Ready" value={an.preview.summary.validRows} color={C.green} />
              <Stat label="Need a fix" value={an.preview.summary.invalidRows} color={an.preview.summary.invalidRows ? C.red : C.muted} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th()}>Row</th><th style={th()}></th><th style={th()}>Name</th><th style={th()}>Staff ID</th><th style={th()}>Issues</th></tr></thead>
                <tbody>
                  {an.preview.sample.map((r) => (
                    <tr key={r.row} style={{ borderTop: `1px solid ${C.line}`, background: r.valid ? 'transparent' : '#fff7f7' }}>
                      <td style={td()}>{r.row}</td>
                      <td style={td()}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 999, background: r.valid ? C.green : C.red }} /></td>
                      <td style={td()}>{[r.data.firstName, r.data.lastName].filter(Boolean).join(' ') || '—'}</td>
                      <td style={td()}>{r.data.staffId || '—'}</td>
                      <td style={{ ...td(), color: C.red, whiteSpace: 'normal' }}>{(r.issues || []).join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <label style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '4px 2px 14px', fontSize: '.86rem', color: C.ink, cursor: 'pointer' }}>
            <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
            Update existing employees when the <strong>Staff ID</strong> already exists (otherwise they’re skipped)
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{ ...primaryBtnStyle(false, true), background: '#fff', color: C.navy, border: `1px solid ${C.line}` }}>Back</button>
            <button onClick={commit} disabled={busy} style={primaryBtnStyle(busy, false)}>
              {busy ? <RefreshCw size={16} /> : <Database size={16} />} {busy ? 'Importing…' : `Import ${an.preview.summary.validRows} employee(s)`}
            </button>
          </div>
        </>
      )}

      {step === 'done' && report && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Inserted" value={report.inserted || 0} color={C.green} />
            <Stat label="Updated" value={report.updated || 0} color={C.blue} />
            <Stat label="Skipped" value={report.skipped || 0} color={C.muted} />
            <Stat label="Rejected" value={report.rejected || 0} color={report.rejected ? C.red : C.muted} />
          </div>

          {fixRows.length > 0 ? (
            <Card title={`Fix ${fixRows.length} rejected row(s) and re-import`}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th()}>Row</th>{fixCols.map((c) => <th key={c} style={th()}>{c}</th>)}<th style={th()}>Issues</th></tr></thead>
                  <tbody>
                    {fixRows.map((r, ri) => (
                      <tr key={ri} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={td()}>{r.row}</td>
                        {fixCols.map((c) => (
                          <td key={c} style={{ padding: '4px 6px' }}>
                            <input value={r[c] ?? ''} onChange={(e) => setFixRows((prev) => prev.map((x, i) => i === ri ? { ...x, [c]: e.target.value } : x))} style={{ ...inpXs, width: 120 }} />
                          </td>
                        ))}
                        <td style={{ ...td(), color: C.red, whiteSpace: 'normal' }}>{(r._issues || []).join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={reimportFixed} disabled={fixBusy} style={primaryBtnStyle(fixBusy, true)}>
                  {fixBusy ? <RefreshCw size={15} /> : <Database size={15} />} {fixBusy ? 'Re-importing…' : 'Re-import fixed rows'}
                </button>
              </div>
            </Card>
          ) : (
            <Card><div style={{ color: C.green, fontWeight: 700 }}>All rows imported. Nothing left to fix.</div></Card>
          )}

          <button onClick={reset} style={{ ...primaryBtnStyle(false, true), background: '#fff', color: C.navy, border: `1px solid ${C.line}` }}>
            <Upload size={15} /> Import another file
          </button>
        </>
      )}
    </div>
  );
}

function Stepper({ step }) {
  const steps = [['upload', 'Upload'], ['review', 'Review'], ['done', 'Import']];
  const idx = steps.findIndex(([k]) => k === step);
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      {steps.map(([k, label], i) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: '.72rem', fontWeight: 800,
            background: i <= idx ? C.navy : '#e7ecf3', color: i <= idx ? '#fff' : C.muted }}>{i + 1}</span>
          <span style={{ fontSize: '.82rem', fontWeight: 700, color: i <= idx ? C.navy : C.muted }}>{label}</span>
          {i < steps.length - 1 && <span style={{ width: 24, height: 2, background: i < idx ? C.navy : '#e7ecf3' }} />}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px', minWidth: 110 }}>
      <div style={{ fontSize: '.64rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || C.navy, marginTop: 2 }}>{Number(value).toLocaleString()}</div>
    </div>
  );
}
