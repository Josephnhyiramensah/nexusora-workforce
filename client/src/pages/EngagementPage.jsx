import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  ModuleShell, Hero, KpiBand, Kpi, Body, Card, TableWrap, StatusPill, Pill,
  HeroBtn, Overlay, Field, Sel, Empty, ErrBox, Banner, Lbl,
} from '../ui/kit';
import { C, NUM, cap, rowStyle, td, primaryBtn, ghostBtn } from '../ui/tokens';
import {
  Smile, ClipboardList, BarChart3, MessageSquare, Plus, Trash2, Play, Square,
  Send, RefreshCw, Users, PieChart, Inbox, TrendingUp,
} from 'lucide-react';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const KINDS = [['scale', 'Scale 1–5'], ['nps', 'Recommend 0–10 (eNPS)'], ['choice', 'Multiple choice'], ['text', 'Free text']];
const STATUS_MAP = { draft: ['Draft', 'grey'], scheduled: ['Scheduled', 'blue'], open: ['Open', 'green'], closed: ['Closed', 'red'] };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const TYPE_LABEL = { pulse: 'Pulse', enps: 'eNPS', custom: 'Custom' };

/* ================================ ROOT ================================ */
export default function EngagementPage() {
  const { user } = useAuth();
  const isHR = WRITE_ROLES.includes(user?.role);
  const [section, setSection] = useState(isHR ? 'overview' : 'answer');

  const groups = [{
    title: 'Engagement',
    items: [
      ...(isHR ? [
        { key: 'overview', label: 'Overview', Icon: TrendingUp },
        { key: 'surveys', label: 'Surveys', Icon: ClipboardList },
        { key: 'results', label: 'Results', Icon: BarChart3 },
      ] : []),
      { key: 'answer', label: 'My surveys', Icon: MessageSquare },
    ],
  }];

  return (
    <ModuleShell brand={{ title: 'Engagement', subtitle: 'Listen & act', Icon: Smile }} groups={groups} active={section} onSelect={setSection}>
      {section === 'overview' && isHR && <Overview />}
      {section === 'surveys' && isHR && <Surveys />}
      {section === 'results' && isHR && <Results />}
      {section === 'answer' && <AnswerSurveys />}
    </ModuleShell>
  );
}

const hcell = { padding: '8px 10px', fontSize: '.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.muted, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' };
const dcell = { padding: '7px 10px', fontSize: '.82rem', borderBottom: `1px solid ${C.lineSoft}` };
const trimTxt = (t) => (t && t.length > 16 ? t.slice(0, 14) + '…' : t);
function heatColor(kind, v) {
  if (v == null) return { bg: '#f2f4f8', fg: C.muted2 };
  if (kind === 'nps') {
    if (v >= 30) return { bg: '#d6f0e0', fg: '#12703f' };
    if (v >= 0) return { bg: '#eaf7ef', fg: '#1f7a4d' };
    if (v >= -30) return { bg: '#fdeaea', fg: '#a8262a' };
    return { bg: '#f8d4d6', fg: '#8f1d20' };
  }
  if (v >= 4) return { bg: '#d6f0e0', fg: '#12703f' };
  if (v >= 3) return { bg: '#fdf3df', fg: '#8a5a00' };
  return { bg: '#fdeaea', fg: '#a8262a' };
}
function SegmentHeatmap({ segments }) {
  if (!segments || !segments.columns.length || !segments.rows.length) return null;
  const cols = segments.columns;
  return (
    <Card title="By department" sub={`anonymity floor ${segments.minN}`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead><tr>
            <th style={{ ...hcell, textAlign: 'left' }}>Department</th>
            <th style={{ ...hcell, textAlign: 'right' }}>n</th>
            {cols.map((c) => <th key={c.questionId} style={{ ...hcell, textAlign: 'center', minWidth: 86 }} title={c.text}>{c.kind === 'nps' ? 'eNPS' : trimTxt(c.text)}</th>)}
          </tr></thead>
          <tbody>
            {segments.rows.map((r) => (
              <tr key={r.segment}>
                <td style={{ ...dcell, fontWeight: 700, color: C.navy }}>{r.segment}</td>
                <td style={{ ...dcell, textAlign: 'right', ...NUM, color: C.muted2 }}>{r.count}</td>
                {cols.map((c) => {
                  if (r.suppressed) return <td key={c.questionId} style={{ ...dcell, textAlign: 'center', color: C.muted2, background: '#f6f7fa' }}>—</td>;
                  const v = r.scores[c.questionId];
                  const col = heatColor(c.kind, v);
                  return <td key={c.questionId} style={{ ...dcell, textAlign: 'center', background: col.bg, color: col.fg, fontWeight: 700, ...NUM }}>{v == null ? '—' : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {segments.rows.some((r) => r.suppressed) && <div style={{ fontSize: '.72rem', color: C.muted2, marginTop: 8 }}>“—” — fewer than {segments.minN} responses, hidden for anonymity.</div>}
    </Card>
  );
}

function RateBar({ pct }) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const col = pct == null ? C.line : (p >= 60 ? '#1f9d57' : p >= 30 ? '#c77700' : C.red);
  return <div style={{ height: 7, borderRadius: 999, background: '#eef2f8', overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: col, borderRadius: 999 }} /></div>;
}

/* small distribution bar row, consistent with the kit */
function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const palette = [C.accentInk, C.navy, '#1f9d57', '#c77700', '#7c5cdf'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 96, fontSize: '.8rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
          <div style={{ flex: 1, height: 16, background: '#eef2f8', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: palette[i % palette.length], borderRadius: 6 }} />
          </div>
          <span style={{ ...NUM, width: 40, textAlign: 'right', fontWeight: 700, color: C.navy, fontSize: '.82rem' }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/* =============================== OVERVIEW =============================== */
function Overview() {
  const [series, setSeries] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { (async () => { try { const { data } = await api.get('/engagement/trends'); setSeries(data.series || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load the overview.'); } })(); }, []);

  const withNps = (series || []).filter((p) => p.enps != null);
  const latest = withNps[withNps.length - 1];
  const prev = withNps[withNps.length - 2];
  const delta = latest && prev ? latest.enps - prev.enps : null;
  const avgRate = (series || []).filter((p) => p.rate != null);
  const meanRate = avgRate.length ? Math.round(avgRate.reduce((s, p) => s + p.rate, 0) / avgRate.length) : null;

  return (
    <>
      <Hero crumbs={['Engagement', 'Overview']} title="Overview" />
      {series && (
        <KpiBand>
          <Kpi Icon={PieChart} iconBg={latest && latest.enps >= 0 ? '#e7f7ee' : '#fdecec'} iconColor={latest && latest.enps >= 0 ? '#1f9d57' : C.red} label="Latest eNPS" value={latest ? latest.enps : '—'}
            foot={delta != null ? <span style={{ color: delta >= 0 ? '#1f9d57' : C.red, fontWeight: 700 }}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs previous</span> : null} />
          <Kpi Icon={Users} label="Avg response rate" value={meanRate == null ? '—' : meanRate} unit={meanRate == null ? '' : '%'} />
          <Kpi Icon={ClipboardList} label="Surveys run" value={series.length} />
          <Kpi Icon={Inbox} label="Total responses" value={series.reduce((n, p) => n + (p.responses || 0), 0)} />
        </KpiBand>
      )}
      <Body>
        {err && <ErrBox>{err}</ErrBox>}
        {!series ? <Empty>Loading…</Empty>
          : series.length === 0 ? <Card><Empty>No open or closed surveys yet — run a pulse to start the trend.</Empty></Card>
            : (
              <>
                <Card title="eNPS over time">
                  {withNps.length ? <TrendChart points={withNps.map((p) => ({ label: p.title, value: p.enps }))} min={-100} max={100} zero /> : <Empty>No eNPS questions yet.</Empty>}
                </Card>
                <Card title="Response rate over time">
                  {avgRate.length ? <TrendChart points={avgRate.map((p) => ({ label: p.title, value: p.rate }))} min={0} max={100} pct /> : <Empty>No participation data yet.</Empty>}
                </Card>
              </>
            )}
      </Body>
    </>
  );
}

function TrendChart({ points, min, max, zero, pct }) {
  const w = 720, h = 220, padL = 40, padR = 16, padT = 16, padB = 46;
  const n = points.length;
  const x = (i) => padL + (n <= 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR)) / (n - 1));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const gridVals = pct ? [0, 25, 50, 75, 100] : [-100, -50, 0, 50, 100];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      {gridVals.map((g) => (
        <g key={g}>
          <line x1={padL} y1={y(g)} x2={w - padR} y2={y(g)} stroke={g === 0 && zero ? '#c7d2e0' : '#eef2f8'} strokeWidth={g === 0 && zero ? 1.4 : 1} />
          <text x={padL - 8} y={y(g) + 3} textAnchor="end" style={{ fontSize: 9, fill: C.muted2, ...NUM }}>{g}{pct ? '%' : ''}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke={C.accentInk} strokeWidth="2.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill={C.navy} />
          <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: C.navy, ...NUM }}>{p.value}{pct ? '%' : ''}</text>
          <text x={x(i)} y={h - 16} textAnchor="middle" style={{ fontSize: 8.5, fill: C.muted2 }}>{p.label.length > 14 ? p.label.slice(0, 12) + '…' : p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* =============================== SURVEYS =============================== */
function Surveys() {
  const [surveys, setSurveys] = useState(null);
  const [err, setErr] = useState('');
  const [banner, setBanner] = useState('');
  const [modal, setModal] = useState(false);

  async function load() { setErr(''); try { const { data } = await api.get('/engagement/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load surveys.'); } }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) { setErr(''); try { await api.patch(`/engagement/surveys/${id}`, { status }); setBanner(status === 'open' ? 'Survey opened for responses.' : 'Survey closed.'); load(); } catch (e) { setErr(e?.response?.data?.message || 'Could not update the survey.'); } }
  async function del(id) { setErr(''); try { await api.delete(`/engagement/surveys/${id}`); setBanner('Survey deleted.'); load(); } catch (e) { setErr(e?.response?.data?.message || 'Could not delete the survey.'); } }

  const total = surveys?.length || 0;
  const open = (surveys || []).filter((s) => s.status === 'open').length;
  const drafts = (surveys || []).filter((s) => s.status === 'draft').length;
  const responses = (surveys || []).reduce((n, s) => n + (s.responseCount || 0), 0);

  return (
    <>
      <Hero crumbs={['Engagement', 'Surveys']} title="Surveys"
        actions={<HeroBtn Icon={Plus} onClick={() => setModal(true)}>New survey</HeroBtn>} />
      <KpiBand>
        <Kpi Icon={ClipboardList} label="Surveys" value={total} />
        <Kpi Icon={Play} iconBg="#e7f7ee" iconColor="#1f9d57" label="Open" value={open} />
        <Kpi Icon={Square} iconBg="#f2f4f8" iconColor={C.muted} label="Drafts" value={drafts} />
        <Kpi Icon={Inbox} iconBg="#eaf2ff" iconColor={C.accentInk} label="Responses" value={responses} />
      </KpiBand>
      <Body>
        {banner && <Banner tone="green" onClose={() => setBanner('')}>{banner}</Banner>}
        {err && <ErrBox>{err}</ErrBox>}
        <Card title="All surveys" right={<HeroBtn ghost Icon={RefreshCw} onClick={load}>Refresh</HeroBtn>}>
          {!surveys ? <Empty>Loading…</Empty>
            : surveys.length === 0 ? <Empty>No surveys yet. Create your first one with “New survey”.</Empty>
              : (
                <TableWrap head={[['Survey'], ['Type'], ['Audience'], ['Participation'], ['Status'], ['', 'r']]}>
                  {surveys.map((s) => (
                    <tr key={s._id} style={rowStyle}>
                      <td style={td}><div style={{ fontWeight: 700, color: C.navy }}>{s.title}</div><div style={{ fontSize: '.74rem', color: C.muted2 }}>{s.questions} question(s){s.anonymous ? ' · anonymous' : ''}{s.closesAt ? ` · closes ${fmtDate(s.closesAt)}` : (s.status === 'scheduled' && s.opensAt ? ` · opens ${fmtDate(s.opensAt)}` : '')}</div></td>
                      <td style={td}><Pill tone={s.type === 'enps' ? 'blue' : 'grey'}>{TYPE_LABEL[s.type] || cap(s.type)}</Pill></td>
                      <td style={td}>{s.audience?.scope === 'department' ? (s.audience.department || 'Department') : 'Everyone'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 90 }}><RateBar pct={s.responseRate} /></div>
                          <span style={{ ...NUM, fontSize: '.78rem', color: C.muted2, whiteSpace: 'nowrap' }}>{s.responseCount}{s.eligible ? ` / ${s.eligible}` : ''}{s.responseRate != null ? ` · ${s.responseRate}%` : ''}</span>
                        </div>
                      </td>
                      <td style={td}><StatusPill map={STATUS_MAP} k={s.status} /></td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {(s.status === 'draft' || s.status === 'scheduled') && <button onClick={() => setStatus(s._id, 'open')} style={miniBtn('#1f9d57')}><Play size={13} /> Open now</button>}
                          {s.status === 'open' && <button onClick={() => setStatus(s._id, 'closed')} style={miniBtn('#c77700')}><Square size={13} /> Close</button>}
                          <button onClick={() => del(s._id)} title="Delete" style={miniBtn(C.red, true)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableWrap>
              )}
        </Card>
      </Body>
      {modal && <CreateSurvey onClose={() => setModal(false)} onCreated={() => { setModal(false); setBanner('Survey created as a draft.'); load(); }} />}
    </>
  );
}

const miniBtn = (color, outline) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: outline ? `1px solid #f6c9cb` : 'none', background: outline ? '#fff' : color, color: outline ? color : '#fff' });

function CreateSurvey({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('pulse');
  const [anonymous, setAnonymous] = useState(true);
  const [scope, setScope] = useState('all');
  const [department, setDepartment] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [questions, setQuestions] = useState([{ text: '', kind: 'scale', options: [] }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const addQ = () => setQuestions((q) => [...q, { text: '', kind: 'scale', options: [] }]);
  const updQ = (i, patch) => setQuestions((q) => q.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delQ = (i) => setQuestions((q) => q.filter((_, j) => j !== i));

  async function save() {
    if (!title.trim()) { setErr('A survey title is required.'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/engagement/surveys', {
        title, type, anonymous,
        audience: { scope, department: scope === 'department' ? department : '' },
        opensAt: opensAt || null, closesAt: closesAt || null,
        questions: questions.filter((q) => q.text.trim()).map((q) => ({ text: q.text, kind: q.kind, options: q.kind === 'choice' ? (q.options || []) : [] })),
      });
      onCreated();
    } catch (e) { setErr(e?.response?.data?.message || 'Could not create the survey.'); setBusy(false); }
  }

  return (
    <Overlay onClose={onClose} title="New survey" width={640}>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Title" value={title} onChange={setTitle} placeholder="e.g. Q3 pulse check" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Sel label="Type" value={type} onChange={setType} options={[['pulse', 'Pulse'], ['enps', 'eNPS'], ['custom', 'Custom']]} />
        <Sel label="Audience" value={scope} onChange={setScope} options={[['all', 'Everyone'], ['department', 'One department']]} />
      </div>
      {scope === 'department' && <Field label="Department" value={department} onChange={setDepartment} placeholder="Department name" />}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '2px 0 14px' }}>
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Anonymous responses
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Opens</Lbl><input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} style={qInp} /></label>
        <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Closes</Lbl><input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} style={qInp} /></label>
      </div>

      <Lbl>Questions</Lbl>
      {questions.map((q, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={q.text} onChange={(e) => updQ(i, { text: e.target.value })} placeholder={`Question ${i + 1}`} style={{ ...qInp, flex: '1 1 240px' }} />
          <select value={q.kind} onChange={(e) => updQ(i, { kind: e.target.value })} style={qSel}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {q.kind === 'choice' && <input value={(q.options || []).join(', ')} onChange={(e) => updQ(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="options, comma-separated" style={{ ...qInp, flex: '1 1 180px' }} />}
          <button onClick={() => delQ(i)} title="Remove" style={miniBtn(C.red, true)}><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={addQ} style={{ ...ghostBtn, padding: '8px 13px', fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}><Plus size={14} /> Add question</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Create draft'}</button>
      </div>
    </Overlay>
  );
}

const qInp = { padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: '.85rem', fontFamily: 'inherit', color: C.ink, boxSizing: 'border-box' };
const qSel = { padding: '9px 10px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: '.82rem', fontFamily: 'inherit', color: C.ink, background: '#fff' };

/* =============================== RESULTS =============================== */
function Results() {
  const [surveys, setSurveys] = useState([]);
  const [sel, setSel] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { (async () => { try { const { data } = await api.get('/engagement/surveys'); setSurveys(data.surveys || []); } catch { setErr('Could not load surveys.'); } })(); }, []);
  useEffect(() => { if (!sel) { setData(null); return; } (async () => { setErr(''); try { const { data } = await api.get(`/engagement/surveys/${sel}/results`); setData(data); } catch (e) { setErr(e?.response?.data?.message || 'Could not load results.'); } })(); }, [sel]);

  const npsQ = data?.results?.questions?.find((q) => q.kind === 'nps');

  return (
    <>
      <Hero crumbs={['Engagement', 'Results']} title="Results" />
      {data && (
        <KpiBand>
          <Kpi Icon={Inbox} label="Responses" value={data.results.responseCount} foot={data.participation?.eligible ? <span>of {data.participation.eligible} eligible</span> : null} />
          <Kpi Icon={Users} iconBg="#eaf2ff" iconColor={C.accentInk} label="Response rate" value={data.participation?.rate == null ? '—' : data.participation.rate} unit={data.participation?.rate == null ? '' : '%'} />
          {npsQ && <Kpi Icon={PieChart} iconBg={npsQ.enps >= 0 ? '#e7f7ee' : '#fdecec'} iconColor={npsQ.enps >= 0 ? '#1f9d57' : C.red} label="eNPS" value={npsQ.enps == null ? '—' : npsQ.enps} />}
          {npsQ && <Kpi Icon={Users} iconBg="#e7f7ee" iconColor="#1f9d57" label="Promoters" value={npsQ.promoters} />}
        </KpiBand>
      )}
      <Body>
        {err && <ErrBox>{err}</ErrBox>}
        <Card title="Choose a survey">
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...qSel, minWidth: 280 }}>
            <option value="">— choose —</option>
            {surveys.map((s) => <option key={s._id} value={s._id}>{s.title} ({s.responseCount} response{s.responseCount === 1 ? '' : 's'})</option>)}
          </select>
        </Card>

        {data && (data.drivers || []).length > 0 && (
          <Card title="Key drivers" sub="correlation with eNPS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.drivers.map((d) => {
                const mag = Math.min(1, Math.abs(d.r));
                const pos = d.r >= 0;
                return (
                  <div key={d.questionId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ flex: '0 0 42%', fontSize: '.82rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.text}>{d.text}</span>
                    <div style={{ flex: 1, height: 14, background: '#eef2f8', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${mag * 100}%`, height: '100%', background: pos ? '#1f9d57' : C.red, borderRadius: 6 }} /></div>
                    <span style={{ ...NUM, width: 46, textAlign: 'right', fontWeight: 700, color: pos ? '#1f7a4d' : C.red, fontSize: '.82rem' }}>{d.r > 0 ? '+' : ''}{d.r}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {data && data.themes && data.themes.keywords.length > 0 && (
          <Card title="Comment themes" sub={`${data.themes.total} comment(s)`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.themes.keywords.map((k) => {
                const maxc = data.themes.keywords[0].count || 1;
                const size = 0.78 + 0.5 * (k.count / maxc);
                return <span key={k.word} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef4ff', border: '1px solid #d5e3fb', color: '#173a6b', borderRadius: 999, padding: '5px 12px', fontSize: `${size}rem`, fontWeight: 700 }}>{k.word}<span style={{ ...NUM, color: C.accentInk, fontSize: '.72rem' }}>{k.count}</span></span>;
              })}
            </div>
          </Card>
        )}

        {data && data.results.questions.map((q) => (
          <Card key={q.questionId} title={q.text} sub={`${q.answered} answered`}>
            {q.kind === 'nps' ? (
              <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '.64rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>eNPS</div>
                  <div style={{ ...NUM, fontSize: '2.6rem', fontWeight: 800, color: q.enps == null ? C.muted : (q.enps >= 0 ? '#1f9d57' : C.red) }}>{q.enps == null ? '—' : q.enps}</div>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}><Bars data={[{ label: 'Promoters', value: q.promoters }, { label: 'Passives', value: q.passives }, { label: 'Detractors', value: q.detractors }]} /></div>
              </div>
            ) : q.kind === 'scale' ? (
              <div>
                <div style={{ fontSize: '.84rem', color: C.ink, marginBottom: 12 }}>Average <strong style={{ ...NUM, color: C.navy }}>{q.average == null ? '—' : q.average}</strong> / 5</div>
                <Bars data={q.distribution} />
              </div>
            ) : q.kind === 'choice' ? (
              (q.distribution || []).length ? <Bars data={q.distribution} /> : <Empty>No answers.</Empty>
            ) : (
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {(q.texts || []).length === 0 ? <Empty>No answers.</Empty>
                  : (q.texts || []).map((t, i) => <div key={i} style={{ fontSize: '.86rem', color: C.ink, padding: '9px 0', borderBottom: `1px solid ${C.lineSoft}` }}>“{t}”</div>)}
              </div>
            )}
          </Card>
        ))}
      </Body>
    </>
  );
}

/* =============================== ANSWER =============================== */
function AnswerSurveys() {
  const [surveys, setSurveys] = useState(null);
  const [err, setErr] = useState('');
  const [banner, setBanner] = useState('');

  async function load() { setErr(''); try { const { data } = await api.get('/engagement/me/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load your surveys.'); } }
  useEffect(() => { load(); }, []);

  return (
    <>
      <Hero crumbs={['Engagement', 'My surveys']} title="My surveys" />
      <Body>
        {banner && <Banner tone="green" onClose={() => setBanner('')}>{banner}</Banner>}
        {err && <ErrBox>{err}</ErrBox>}
        {!surveys ? <Empty>Loading…</Empty>
          : surveys.length === 0 ? <Card><Empty>Nothing to answer right now.</Empty></Card>
            : surveys.map((s) => <AnswerCard key={s._id} survey={s} onDone={() => { setBanner('Thanks — your response was recorded.'); load(); }} onError={setErr} />)}
      </Body>
    </>
  );
}

function AnswerCard({ survey, onDone, onError }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/engagement/surveys/${survey._id}/respond`, { answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) });
      onDone();
    } catch (e) { onError(e?.response?.data?.message || 'Could not submit your response.'); setBusy(false); }
  }

  return (
    <Card title={survey.title} sub={survey.anonymous ? 'anonymous' : null}>
      {survey.description && <div style={{ fontSize: '.86rem', color: C.ink, marginBottom: 14 }}>{survey.description}</div>}
      {(survey.questions || []).map((q) => {
        const qid = String(q._id);
        return (
          <div key={qid} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: '.88rem', fontWeight: 600, color: C.navy, marginBottom: 9 }}>{q.text}</div>
            {q.kind === 'scale' && <ScaleRow start={1} max={5} value={answers[qid]} onPick={(v) => set(qid, v)} />}
            {q.kind === 'nps' && <ScaleRow start={0} max={10} value={answers[qid]} onPick={(v) => set(qid, v)} />}
            {q.kind === 'choice' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(q.options || []).map((o) => (
              <button key={o} onClick={() => set(qid, o)} style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${answers[qid] === o ? C.navy : C.line}`, background: answers[qid] === o ? C.navy : '#fff', color: answers[qid] === o ? '#fff' : C.ink, fontWeight: 700, fontSize: '.84rem', cursor: 'pointer', fontFamily: 'inherit' }}>{o}</button>
            ))}</div>}
            {q.kind === 'text' && <textarea value={answers[qid] || ''} onChange={(e) => set(qid, e.target.value)} rows={3} placeholder="Your answer…" style={{ ...qInp, width: '100%', resize: 'vertical' }} />}
          </div>
        );
      })}
      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: busy ? 0.6 : 1 }}><Send size={15} /> {busy ? 'Submitting…' : 'Submit'}</button>
    </Card>
  );
}

function ScaleRow({ start, max, value, onPick }) {
  const nums = [];
  for (let i = start; i <= max; i++) nums.push(i);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {nums.map((n) => (
        <button key={n} onClick={() => onPick(n)} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${value === n ? C.navy : C.line}`, background: value === n ? C.navy : '#fff', color: value === n ? '#fff' : C.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', ...NUM }}>{n}</button>
      ))}
    </div>
  );
}
