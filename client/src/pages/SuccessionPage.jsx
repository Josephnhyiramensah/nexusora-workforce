import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { exportTable, openPrintable } from '../utils/exporter';
import { ModuleShell } from '../ui/kit';
import {
  LayoutDashboard, Grid3x3, Star, Target, Plus, AlertTriangle,
  ShieldCheck, TrendingUp, UserCheck, GitBranch, Download, ChevronRight,
} from 'lucide-react';

const cap = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '';
const RISK_HEX = { Low: '#1f9d57', Medium: '#FD9C09', High: '#e5484d' };
const MODULE = 'Talent & Succession';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };

const RISK = { low: ['Low', C.green], medium: ['Medium', C.orange], high: ['High', C.red] };
const READINESS = [['ready_now', 'Ready now', C.green], ['1_2_years', '1–2 years', C.orange], ['3_5_years', '3–5 years', C.muted]];
const READY_LABEL = (k) => (READINESS.find((r) => r[0] === k) || [k, k, C.muted]);
const PROMO = [['not_identified', 'Not identified'], ['3_5_years', '3–5 years'], ['1_2_years', '1–2 years'], ['ready_now', 'Ready now']];
const MOBILITY = [['none', 'None'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
const RATING3 = [[1, 'Low'], [2, 'Medium'], [3, 'High']];
const BENCH_COLOR = { strong: C.green, moderate: C.orange, weak: C.muted, none: C.red };
const DEV_METHOD = [['course', 'Course'], ['on_the_job', 'On the job'], ['mentoring', 'Mentoring'], ['coaching', 'Coaching'], ['stretch_assignment', 'Stretch assignment'], ['reading', 'Reading'], ['other', 'Other']];
const GOAL_STATUS = { not_started: ['Not started', C.muted], in_progress: ['In progress', C.orange], completed: ['Completed', C.green], deferred: ['Deferred', C.muted] };

// 9-box definitions: box = (potential-1)*3 + performance. Grid drawn potential High→Low, performance Low→High.
const BOX = {
  9: { label: 'Star', bg: '#e7f6ee', accent: C.green },
  8: { label: 'High Potential', bg: '#e9f6ef', accent: C.green },
  7: { label: 'Potential Gem', bg: '#fff1e0', accent: C.orange },
  6: { label: 'High Performer', bg: '#eaf7f0', accent: C.green },
  5: { label: 'Core Player', bg: '#fff6e0', accent: C.orange },
  4: { label: 'Inconsistent', bg: '#fdeede', accent: '#e08600' },
  3: { label: 'Trusted Professional', bg: '#e6f4f7', accent: C.teal },
  2: { label: 'Effective', bg: '#fbf7e5', accent: '#b8960a' },
  1: { label: 'Under-performer', bg: '#fdecec', accent: C.red },
};
// Rows top→bottom (potential 3,2,1), each row cols left→right (performance 1,2,3)
const GRID_ROWS = [[7, 8, 9], [4, 5, 6], [1, 2, 3]];

const fullName = (e) => e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() || '—' : '—';

function useEmployees() {
  const [list, setList] = useState([]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/employees', { params: { limit: 1000 } }); if (a) setList(data.items || []); } catch { /* */ } })(); return () => { a = false; }; }, []);
  return list;
}

/* ============================ ROOT ============================ */
export default function SuccessionPage() {
  const { user } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const [section, setSection] = useState('overview');
  const [drill, setDrill] = useState(null);
  const [msg, setMsg] = useState('');

  function pick(k) { setSection(k); setDrill(null); }
  function drillTo(sec, filter) { setDrill(filter || null); setSection(sec); }

  const groups = [
    { title: 'Talent', items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
      { key: 'ninebox', label: '9-Box Talent Grid', Icon: Grid3x3 },
      { key: 'pool', label: 'Talent Pool', Icon: Star },
    ] },
    { title: 'Succession', items: [
      { key: 'plans', label: 'Succession Plans', Icon: GitBranch },
    ] },
    { title: 'Development', items: [
      { key: 'development', label: 'Development Plans', Icon: Target },
    ] },
  ];

  return (
    <ModuleShell brand={{ title: 'Talent & Succession', subtitle: 'Bench & growth', Icon: GitBranch }} groups={groups} active={section} onSelect={pick}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
        {section === 'overview' && <Overview onDrill={drillTo} />}
        {section === 'ninebox' && <NineBox canWrite={canWrite} setMsg={setMsg} />}
        {section === 'pool' && <TalentPool canWrite={canWrite} setMsg={setMsg} />}
        {section === 'plans' && <SuccessionPlans canWrite={canWrite} setMsg={setMsg} initialRisk={drill?.risk} />}
        {section === 'development' && <DevelopmentPlans canWrite={canWrite} setMsg={setMsg} />}
      </div>
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function PageHead({ title, subtitle, action }) {
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '24px 30px 26px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8 }}>{MODULE} <span style={{ opacity: .6 }}>›</span> <span style={{ opacity: 1 }}>{title}</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '.9rem', color: '#28466f', marginTop: 6 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </section>
  );
}
function AddBtn({ onClick, children }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}><Plus size={16} /> {children}</button>;
}
function ExportBtn({ onClick, label = 'Export' }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: `1px solid rgba(255,255,255,.9)`, borderRadius: 10, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}><Download size={15} /> {label}</button>;
}

/* ============================ OVERVIEW ============================ */
function Overview({ onDrill }) {
  const [o, setO] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/succession/overview'); if (a) setO(data); } catch { /* */ } })(); return () => { a = false; }; }, []);
  return (
    <div>
      <PageHead Icon={LayoutDashboard} title="Talent & Succession Overview"/>
      {!o ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <Kpi Icon={GitBranch} label="Key positions" value={o.succession.keyPositions} sub={`${o.succession.critical} business-critical`} color={C.navy} onClick={() => onDrill('plans')} />
          <Kpi Icon={ShieldCheck} label="Succession coverage" value={`${o.succession.coveragePct}%`} sub={`${o.succession.atRisk} with no successor`} color={o.succession.coveragePct >= 80 ? C.green : o.succession.coveragePct >= 50 ? C.orange : C.red} bar={o.succession.coveragePct} onClick={() => onDrill('plans')} />
          <Kpi Icon={UserCheck} label="Ready-now cover" value={o.succession.readyNow} sub="positions with a ready successor" color={C.green} onClick={() => onDrill('plans')} />
          <Kpi Icon={AlertTriangle} label="Positions at risk" value={o.succession.atRisk} sub="no named successor" color={o.succession.atRisk ? C.red : C.green} onClick={() => onDrill('plans', { risk: 'high' })} />
          <Kpi Icon={Star} label="Key talent" value={o.talent.keyTalent} sub={`${o.talent.assessed} assessed on 9-box`} color={C.orange} onClick={() => onDrill('pool')} />
          <Kpi Icon={TrendingUp} label="High flight risk" value={o.talent.highRisk} sub={`${o.watchlist} on retention watchlist`} color={o.talent.highRisk ? C.red : C.green} onClick={() => onDrill('pool')} />
          <Kpi Icon={Target} label="Active dev. plans" value={o.developmentPlans} sub="IDPs in progress" color={C.blue} onClick={() => onDrill('development')} />
        </div>
      )}
    </div>
  );
}

/* ============================ 9-BOX GRID ============================ */
function NineBox({ canWrite, setMsg }) {
  const employees = useEmployees();
  const [data, setData] = useState(null);
  const [dept, setDept] = useState('all');
  const [modal, setModal] = useState(null);   // employeeId being assessed, or 'new'
  const [reload, setReload] = useState(0);
  const depts = Array.from(new Set(employees.map((e) => e.employment?.department).filter(Boolean))).sort();

  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/succession/ninebox', { params: { department: dept } }); if (a) setData(data); } catch { if (a) setData({ boxes: {}, placed: 0 }); } })(); return () => { a = false; }; }, [dept, reload]);

  function exportPdf() {
    if (!data) return;
    const rowsHtml = GRID_ROWS.map((r) => `<div style="display:flex;gap:8px;margin-bottom:8px">` + r.map((b) => {
      const cfg = BOX[b]; const ppl = data.boxes[b] || [];
      return `<div style="flex:1;background:${cfg.bg};border:1px solid ${cfg.accent}55;border-radius:8px;padding:8px;min-height:110px">
        <div style="font-weight:800;color:${cfg.accent};font-size:11px;margin-bottom:5px">${cfg.label} (${ppl.length})</div>
        ${ppl.map((p) => `<div style="font-size:10px;background:#fff;border:1px solid #e5e8ec;border-radius:5px;padding:3px 6px;margin-bottom:3px">${p.keyTalent ? '★ ' : ''}${p.name}${p.flightRisk === 'high' ? ' <span style="color:#e5484d">●</span>' : ''}</div>`).join('')}
      </div>`;
    }).join('') + `</div>`).join('');
    const html = `<div style="font-size:10px;color:#012158;font-weight:700;margin-bottom:6px">↑ Potential (High → Low)&nbsp;&nbsp;·&nbsp;&nbsp;Performance (Low → High) →</div>${rowsHtml}`;
    openPrintable({ title: '9-Box Talent Grid', subtitle: dept === 'all' ? 'All departments' : dept, html, orientation: 'landscape' });
  }

  return (
    <div>
      <PageHead Icon={Grid3x3} title="9-Box Talent Grid" action={<div style={{ display: 'flex', gap: 8 }}><ExportBtn onClick={exportPdf} label="PDF" />{canWrite && <AddBtn onClick={() => setModal('new')}>Assess Employee</AddBtn>}</div>} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={ctrl()}><option value="all">All departments</option>{depts.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <span style={{ color: C.muted, fontSize: '.82rem' }}>{data ? `${data.placed} employee(s) plotted` : ''}</span>
      </div>

      {!data ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {/* Y axis label */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 26 }}>
            <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontWeight: 800, color: C.navy, fontSize: '.78rem', letterSpacing: '.05em' }}>POTENTIAL →</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {GRID_ROWS.flat().map((b) => {
                const cfg = BOX[b]; const people = data.boxes[b] || [];
                return (
                  <div key={b} style={{ background: cfg.bg, border: `1px solid ${cfg.accent}33`, borderRadius: 12, padding: 12, minHeight: 150, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 800, color: cfg.accent, fontSize: '.76rem' }}>{cfg.label}</span>
                      <span style={{ background: '#fff', color: cfg.accent, fontWeight: 800, fontSize: '.7rem', borderRadius: 999, padding: '1px 8px', border: `1px solid ${cfg.accent}44` }}>{people.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {people.map((p) => (
                        <button key={p.employeeId} onClick={() => canWrite && setModal(p.employeeId)} title={`${p.grade || ''} ${p.department || ''}`.trim()} style={{
                          display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 8px',
                          cursor: canWrite ? 'pointer' : 'default', fontSize: '.76rem', color: C.ink, textAlign: 'left',
                        }}>
                          {p.keyTalent && <Star size={12} color={C.orange} fill={C.orange} />}
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          {p.flightRisk === 'high' && <span title="High flight risk" style={{ width: 8, height: 8, borderRadius: 999, background: C.red, flexShrink: 0 }} />}
                        </button>
                      ))}
                      {people.length === 0 && <span style={{ color: cfg.accent + '99', fontSize: '.72rem' }}>—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', fontWeight: 800, color: C.navy, fontSize: '.78rem', letterSpacing: '.05em', marginTop: 10 }}>PERFORMANCE →</div>
          </div>
        </div>
      )}

      {modal && <TalentModal employeeId={modal === 'new' ? '' : modal} employees={employees} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); setReload((n) => n + 1); }} />}
    </div>
  );
}

function TalentModal({ employeeId, employees, onClose, onSaved }) {
  const [empId, setEmpId] = useState(employeeId || '');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  useEffect(() => {
    let a = true;
    (async () => {
      if (!empId) { if (a) setF({ performanceRating: '', potentialRating: '', flightRisk: 'low', impactOfLoss: 'medium', promotionReadiness: 'not_identified', mobility: 'medium', keyTalent: false, aspirations: '', strengths: '', developmentAreas: '' }); return; }
      try {
        const { data } = await api.get(`/succession/talent/employee/${empId}`);
        const p = data.profile || {};
        if (a) setF({
          performanceRating: p.performanceRating || '', potentialRating: p.potentialRating || '', flightRisk: p.flightRisk || 'low',
          impactOfLoss: p.impactOfLoss || 'medium', promotionReadiness: p.promotionReadiness || 'not_identified', mobility: p.mobility || 'medium',
          keyTalent: !!p.keyTalent, aspirations: p.aspirations || '', strengths: p.strengths || '', developmentAreas: p.developmentAreas || '',
        });
      } catch { if (a) setErr('Could not load profile.'); }
    })();
    return () => { a = false; };
  }, [empId]);

  async function submit() {
    if (!empId) { setErr('Select an employee.'); return; }
    if (!f.performanceRating || !f.potentialRating) { setErr('Set both a performance and a potential rating.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, performanceRating: Number(f.performanceRating), potentialRating: Number(f.potentialRating) };
    try { await api.put(`/succession/talent/${empId}`, payload); onSaved('Talent profile saved.'); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  if (!f) return <Overlay onClose={onClose}><div style={{ color: C.muted }}>Loading…</div></Overlay>;
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>Talent assessment</h2>
      {err && <ErrBox>{err}</ErrBox>}
      {!employeeId && <><Lbl>Employee</Lbl><select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ ...inp(), marginBottom: 12 }}><option value="">Select…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>)}</select></>}
      <Row2>
        <Sel label="Performance" value={f.performanceRating} onChange={(v) => setF({ ...f, performanceRating: v })} options={[['', '—'], ...RATING3]} />
        <Sel label="Potential" value={f.potentialRating} onChange={(v) => setF({ ...f, potentialRating: v })} options={[['', '—'], ...RATING3]} />
      </Row2>
      <Row2>
        <Sel label="Flight risk" value={f.flightRisk} onChange={(v) => setF({ ...f, flightRisk: v })} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
        <Sel label="Impact of loss" value={f.impactOfLoss} onChange={(v) => setF({ ...f, impactOfLoss: v })} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
      </Row2>
      <Row2>
        <Sel label="Promotion readiness" value={f.promotionReadiness} onChange={(v) => setF({ ...f, promotionReadiness: v })} options={PROMO} />
        <Sel label="Mobility" value={f.mobility} onChange={(v) => setF({ ...f, mobility: v })} options={MOBILITY} />
      </Row2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '2px 0 12px', background: '#fff8ee', border: '1px solid #fde4bf', borderRadius: 9, padding: '9px 11px' }}>
        <input type="checkbox" checked={f.keyTalent} onChange={(e) => setF({ ...f, keyTalent: e.target.checked })} /> <span><strong>Key talent</strong> — flag as a high-value / high-potential individual.</span>
      </label>
      <Lbl>Career aspirations</Lbl>
      <textarea value={f.aspirations} onChange={(e) => setF({ ...f, aspirations: e.target.value })} rows={2} style={ta()} />
      <Row2>
        <div><Lbl>Strengths</Lbl><textarea value={f.strengths} onChange={(e) => setF({ ...f, strengths: e.target.value })} rows={2} style={ta()} /></div>
        <div><Lbl>Development areas</Lbl><textarea value={f.developmentAreas} onChange={(e) => setF({ ...f, developmentAreas: e.target.value })} rows={2} style={ta()} /></div>
      </Row2>
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label="Save assessment" />
    </Overlay>
  );
}

/* ============================ TALENT POOL ============================ */
function TalentPool() {
  const [data, setData] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/succession/pool'); if (a) setData(data); } catch { if (a) setData({ items: [], watchlist: [] }); } })(); return () => { a = false; }; }, []);
  function exportPool() {
    exportTable({
      filename: 'Talent_Pool.xlsx', sheet: 'Talent Pool', title: 'Talent Pool', subtitle: 'Key talent & retention watchlist',
      columns: [
        { label: 'Employee', key: 'name', width: 26 }, { label: 'Staff ID', key: 'staffId', width: 14 },
        { label: 'Department', key: 'department', width: 20 }, { label: 'Grade', key: 'grade', width: 12 },
        { label: '9-Box', key: 'boxLabel', width: 20 }, { label: 'Key talent', key: 'keyTalentTxt', width: 12, align: 'center' },
        { label: 'Flight risk', key: 'flightRisk', width: 13, align: 'center', color: RISK_HEX },
        { label: 'Impact of loss', key: 'impactOfLoss', width: 14, align: 'center', color: RISK_HEX },
        { label: 'Readiness', key: 'readinessTxt', width: 16 }, { label: 'Mobility', key: 'mobility', width: 12 },
      ],
      rows: (data.items || []).map((p) => ({
        name: p.name, staffId: p.staffId, department: p.department, grade: p.grade,
        boxLabel: p.box ? BOX[p.box].label : '—', keyTalentTxt: p.keyTalent ? 'Yes' : '',
        flightRisk: cap(p.flightRisk), impactOfLoss: cap(p.impactOfLoss),
        readinessTxt: (PROMO.find((x) => x[0] === p.promotionReadiness) || ['', '—'])[1], mobility: cap(p.mobility),
      })),
    });
  }
  return (
    <div>
      <PageHead Icon={Star} title="Talent Pool"action={data && data.items.length > 0 && <ExportBtn onClick={exportPool} />} />
      {!data ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : (
        <>
          {data.watchlist.length > 0 && (
            <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: C.red, fontSize: '.85rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={15} /> Retention watchlist — {data.watchlist.length} at high flight risk</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.watchlist.map((w) => <span key={w.employeeId} style={{ background: '#fff', border: '1px solid #f6c9cb', borderRadius: 8, padding: '4px 10px', fontSize: '.78rem', color: C.ink }}>{w.name}{w.grade ? ` · ${w.grade}` : ''}</span>)}
              </div>
            </div>
          )}
          {data.items.length === 0 ? <Empty>No key talent identified yet. Flag employees as key talent on the 9-box grid.</Empty> : (
            <Card>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Employee', 'Department', '9-box', 'Flight risk', 'Impact', 'Readiness', 'Mobility'].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.employeeId} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={td()}>{p.keyTalent && <Star size={12} color={C.orange} fill={C.orange} style={{ marginRight: 4, verticalAlign: 'middle' }} />}<b style={{ color: C.navy }}>{p.name}</b>{p.staffId ? <span style={{ color: C.muted }}> · {p.staffId}</span> : ''}</td>
                      <td style={td()}>{p.department || '—'}{p.grade ? <span style={{ color: C.muted }}> · {p.grade}</span> : ''}</td>
                      <td style={td()}>{p.box ? <span style={{ background: BOX[p.box].bg, color: BOX[p.box].accent, fontWeight: 800, fontSize: '.72rem', padding: '2px 8px', borderRadius: 999 }}>{BOX[p.box].label}</span> : '—'}</td>
                      <td style={td()}><Tag t={RISK[p.flightRisk]} /></td>
                      <td style={td()}><Tag t={RISK[p.impactOfLoss]} /></td>
                      <td style={{ ...td(), fontSize: '.8rem' }}>{(PROMO.find((x) => x[0] === p.promotionReadiness) || ['', '—'])[1]}</td>
                      <td style={{ ...td(), fontSize: '.8rem', textTransform: 'capitalize' }}>{p.mobility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ============================ SUCCESSION PLANS ============================ */
function SuccessionPlans({ canWrite, setMsg, initialRisk }) {
  const [items, setItems] = useState(null);
  const [risk, setRisk] = useState(initialRisk || 'all');
  const [editing, setEditing] = useState(null);   // plan id or 'new'
  const [reload, setReload] = useState(0);

  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/succession/plans', { params: { risk } }); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [risk, reload]);

  async function del(p) { if (!window.confirm(`Delete the plan for "${p.position?.title}"?`)) return; try { await api.delete(`/succession/plans/${p._id}`); setMsg('Plan deleted.'); setReload((n) => n + 1); } catch { /* */ } }

  function exportPlans() {
    exportTable({
      filename: 'Succession_Plans.xlsx', sheet: 'Succession', title: 'Succession Plans', subtitle: 'Key-position cover & bench strength',
      filters: risk !== 'all' ? { 'Risk level': cap(risk) } : null,
      columns: [
        { label: 'Position', key: 'position', width: 28 }, { label: 'Incumbent', key: 'incumbent', width: 22 },
        { label: 'Critical', key: 'critical', width: 10, align: 'center' },
        { label: 'Risk of loss', key: 'riskOfLoss', width: 13, align: 'center', color: RISK_HEX },
        { label: 'Impact', key: 'impactOfLoss', width: 12, align: 'center', color: RISK_HEX },
        { label: 'Bench', key: 'bench', width: 16, color: { Strong: '#1f9d57', Developing: '#FD9C09', 'Long-term only': '#8a94a6', 'No successors': '#e5484d' } },
        { label: 'Successors', key: 'count', width: 11, align: 'center' }, { label: 'Named successors', key: 'names', width: 46 },
      ],
      rows: (items || []).map((p) => ({
        position: p.position?.title || '—', incumbent: fullName(p.incumbent), critical: p.businessCritical ? 'Yes' : '',
        riskOfLoss: cap(p.riskOfLoss), impactOfLoss: cap(p.impactOfLoss), bench: p.bench?.label || '—',
        count: (p.successors || []).length,
        names: (p.successors || []).map((s) => `${fullName(s.employee)} (${READY_LABEL(s.readiness)[1]})`).join('; '),
      })),
    });
  }
  if (editing) return <PlanEditor id={editing === 'new' ? null : editing} onBack={() => { setEditing(null); setReload((n) => n + 1); }} setMsg={setMsg} />;
  return (
    <div>
      <PageHead Icon={GitBranch} action={<div style={{ display: 'flex', gap: 8 }}>{items && items.length > 0 && <ExportBtn onClick={exportPlans} />}{canWrite && <AddBtn onClick={() => setEditing('new')}>New Plan</AddBtn>}</div>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={risk} onChange={(e) => setRisk(e.target.value)} style={ctrl()}><option value="all">All risk levels</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select>
      </div>
      {!items ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : items.length === 0 ? <Empty>No succession plans yet.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {items.map((p) => (
            <div key={p._id} style={cardBox()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{p.position?.title || 'Position'}</div>
                  <div style={{ color: C.muted, fontSize: '.76rem' }}>Incumbent: {fullName(p.incumbent)}</div>
                </div>
                {p.businessCritical && <span style={{ background: '#fdecec', color: C.red, fontWeight: 700, fontSize: '.64rem', padding: '3px 8px', borderRadius: 999 }}>CRITICAL</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
                <MiniStat label="Risk of loss" t={RISK[p.riskOfLoss]} />
                <MiniStat label="Impact" t={RISK[p.impactOfLoss]} />
                <MiniStat label="Bench" t={[p.bench.label, BENCH_COLOR[p.bench.level]]} />
              </div>
              <div style={{ fontSize: '.76rem', color: C.ink, marginBottom: 6, fontWeight: 700 }}>{(p.successors || []).length} successor(s)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {(p.successors || []).slice(0, 4).map((s, i) => { const [rl, , rc] = READY_LABEL(s.readiness); return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: C.ink }}>
                    <span>{fullName(s.employee)}</span><span style={{ color: rc, fontWeight: 700 }}>{rl}</span>
                  </div>
                ); })}
                {(p.successors || []).length === 0 && <span style={{ color: C.red, fontSize: '.76rem', fontWeight: 700 }}>⚠ No successor identified</span>}
              </div>
              <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(p._id)} style={miniBtn(C.blue)}>Manage</button>
                {canWrite && <button onClick={() => del(p)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanEditor({ id, onBack, setMsg }) {
  const employees = useEmployees();
  const [f, setF] = useState({ position: '', businessCritical: false, riskOfLoss: 'low', impactOfLoss: 'medium', notes: '' });
  const [successors, setSuccessors] = useState([]);
  const [uncovered, setUncovered] = useState([]);
  const [posTitle, setPosTitle] = useState('');
  const [incumbent, setIncumbent] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    let a = true;
    (async () => {
      if (!id) { try { const { data } = await api.get('/succession/plans/uncovered'); if (a) setUncovered(data.items || []); } catch { /* */ } return; }
      try {
        const { data } = await api.get(`/succession/plans/${id}`);
        if (!a) return;
        setF({ position: data.position?._id || data.position, businessCritical: !!data.businessCritical, riskOfLoss: data.riskOfLoss, impactOfLoss: data.impactOfLoss, notes: data.notes || '' });
        setSuccessors((data.successors || []).map((s) => ({ employee: s.employee?._id || s.employee, readiness: s.readiness, rank: s.rank, notes: s.notes || '' })));
        setPosTitle(data.position?.title || ''); setIncumbent(data.incumbent); setLoaded(true);
      } catch { if (a) setErr('Could not load plan.'); }
    })();
    return () => { a = false; };
  }, [id]);

  const addSucc = () => setSuccessors([...successors, { employee: '', readiness: '1_2_years', rank: successors.length + 1, notes: '' }]);
  const setSucc = (i, k, v) => setSuccessors(successors.map((s, j) => j === i ? { ...s, [k]: v } : s));

  async function save() {
    if (!f.position) { setErr('Select a position.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, successors: successors.filter((s) => s.employee).map((s, i) => ({ ...s, rank: i + 1, employee: s.employee })) };
    try {
      if (id) await api.put(`/succession/plans/${id}`, payload);
      else await api.post('/succession/plans', payload);
      setMsg('Succession plan saved.'); onBack();
    } catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  if (id && !loaded) return <div style={{ color: C.muted }}>Loading…</div>;
  return (
    <div>
      <button onClick={onBack} style={{ ...btnGhost(), marginBottom: 14 }}>← Back to plans</button>
      {err && <ErrBox>{err}</ErrBox>}
      <Card title={id ? `Succession plan — ${posTitle}` : 'New succession plan'}>
        {!id ? (
          <><Lbl>Key position</Lbl><select value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} style={{ ...inp(), marginBottom: 12 }}><option value="">Select a position…</option>{uncovered.map((p) => <option key={p._id} value={p._id}>{p.title}{p.code ? ` (${p.code})` : ''}</option>)}</select></>
        ) : <div style={{ fontSize: '.82rem', color: C.muted, marginBottom: 12 }}>Incumbent: <b style={{ color: C.ink }}>{fullName(incumbent)}</b></div>}
        <Row2>
          <Sel label="Risk of loss (incumbent)" value={f.riskOfLoss} onChange={(v) => setF({ ...f, riskOfLoss: v })} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
          <Sel label="Impact of loss" value={f.impactOfLoss} onChange={(v) => setF({ ...f, impactOfLoss: v })} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} />
        </Row2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '2px 0 14px' }}><input type="checkbox" checked={f.businessCritical} onChange={(e) => setF({ ...f, businessCritical: e.target.checked })} /> Business-critical position</label>

        <div style={{ fontWeight: 800, color: C.navy, fontSize: '.85rem', marginBottom: 8 }}>Successors (bench)</div>
        {successors.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1.4fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <select value={s.employee} onChange={(e) => setSucc(i, 'employee', e.target.value)} style={inp()}><option value="">Select employee…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select>
            <select value={s.readiness} onChange={(e) => setSucc(i, 'readiness', e.target.value)} style={inp()}>{READINESS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input value={s.notes} onChange={(e) => setSucc(i, 'notes', e.target.value)} placeholder="Notes" style={inp()} />
            <button onClick={() => setSuccessors(successors.filter((_, j) => j !== i))} style={{ ...miniBtn(C.red), border: 'none', height: 36 }}>✕</button>
          </div>
        ))}
        <button onClick={addSucc} style={{ ...btnGhost(), marginBottom: 14 }}>+ Add successor</button>
        <Lbl>Notes</Lbl>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} style={ta()} />
        <div style={{ textAlign: 'right' }}><button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : 'Save plan'}</button></div>
      </Card>
    </div>
  );
}

/* ============================ DEVELOPMENT PLANS ============================ */
function DevelopmentPlans({ canWrite, setMsg }) {
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/succession/development'); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [reload]);
  async function del(p) { if (!window.confirm('Delete this development plan?')) return; try { await api.delete(`/succession/development/${p._id}`); setMsg('Deleted.'); setReload((n) => n + 1); } catch { /* */ } }
  if (editing) return <DevEditor id={editing === 'new' ? null : editing} onBack={() => { setEditing(null); setReload((n) => n + 1); }} setMsg={setMsg} />;
  return (
    <div>
      <PageHead Icon={Target} action={canWrite && <AddBtn onClick={() => setEditing('new')}>New IDP</AddBtn>} />
      {!items ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : items.length === 0 ? <Empty>No development plans yet.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {items.map((p) => (
            <div key={p._id} style={cardBox()} onClick={() => setEditing(p._id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{fullName(p.employee)}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ background: C.navy + '12', color: C.navy, fontWeight: 700, fontSize: '.66rem', padding: '3px 9px', borderRadius: 999 }}>{p.cycle || 'IDP'}</span>
                  {canWrite && <button onClick={(e) => { e.stopPropagation(); del(p); }} title="Delete plan" style={{ ...miniBtn(C.red), border: 'none', padding: '3px 8px' }}>✕</button>}
                </div>
              </div>
              <div style={{ color: C.muted, fontSize: '.76rem', marginBottom: 10 }}>{p.title || 'Development plan'} · {p.goalCount} goal(s)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 7, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${p.progress}%`, height: '100%', background: C.green }} /></div>
                <span style={{ fontSize: '.72rem', color: C.muted, fontWeight: 700 }}>{p.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DevEditor({ id, onBack, setMsg }) {
  const employees = useEmployees();
  const [comps, setComps] = useState([]); const [courses, setCourses] = useState([]);
  const [f, setF] = useState({ employee: '', cycle: String(new Date().getFullYear()), title: '', status: 'active', mentor: '' });
  const [goals, setGoals] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    let a = true;
    (async () => {
      try { const { data } = await api.get('/learning/competencies', { params: { active: true } }); if (a) setComps(data.items || []); } catch { /* */ }
      try { const { data } = await api.get('/learning/courses', { params: { active: true } }); if (a) setCourses(data.items || []); } catch { /* */ }
      if (!id) return;
      try {
        const { data } = await api.get(`/succession/development/${id}`);
        if (!a) return;
        setF({ employee: data.employee?._id || data.employee, cycle: data.cycle || '', title: data.title || '', status: data.status, mentor: data.mentor?._id || data.mentor || '' });
        setGoals((data.goals || []).map((g) => ({ ...g, competency: g.competency?._id || g.competency || '', course: g.course?._id || g.course || '', targetDate: g.targetDate ? g.targetDate.slice(0, 10) : '' })));
        setLoaded(true);
      } catch { if (a) setErr('Could not load plan.'); }
    })();
    return () => { a = false; };
  }, [id]);

  const addGoal = () => setGoals([...goals, { title: '', action: '', method: 'on_the_job', competency: '', course: '', targetDate: '', status: 'not_started', progress: 0 }]);
  const setGoal = (i, k, v) => setGoals(goals.map((g, j) => j === i ? { ...g, [k]: v } : g));

  async function save() {
    if (!f.employee) { setErr('Select an employee.'); return; }
    const clean = goals.filter((g) => (g.title || '').trim());
    setBusy(true); setErr('');
    const payload = { ...f, mentor: f.mentor || null, goals: clean.map((g) => ({ ...g, competency: g.competency || null, course: g.course || null, targetDate: g.targetDate || null, progress: Number(g.progress) || 0 })) };
    try { if (id) await api.put(`/succession/development/${id}`, payload); else await api.post('/succession/development', payload); setMsg('Development plan saved.'); onBack(); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  if (id && !loaded) return <div style={{ color: C.muted }}>Loading…</div>;
  return (
    <div>
      <button onClick={onBack} style={{ ...btnGhost(), marginBottom: 14 }}>← Back to plans</button>
      {err && <ErrBox>{err}</ErrBox>}
      <Card title={id ? 'Edit development plan' : 'New development plan'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div><Lbl>Employee</Lbl><select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} style={inp()} disabled={!!id}><option value="">Select…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></div>
          <Field label="Cycle" value={f.cycle} onChange={(v) => setF({ ...f, cycle: v })} />
          <Field label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="e.g. Leadership track" />
          <div><Lbl>Mentor</Lbl><select value={f.mentor} onChange={(e) => setF({ ...f, mentor: e.target.value })} style={inp()}><option value="">—</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></div>
          <Sel label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['draft', 'Draft'], ['active', 'Active'], ['completed', 'Completed'], ['archived', 'Archived']]} />
        </div>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '.85rem', margin: '6px 0 8px' }}>Development goals</div>
        {goals.map((g, i) => (
          <div key={i} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <input value={g.title} onChange={(e) => setGoal(i, 'title', e.target.value)} placeholder="Goal" style={inp()} />
              <select value={g.method} onChange={(e) => setGoal(i, 'method', e.target.value)} style={inp()}>{DEV_METHOD.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <button onClick={() => setGoals(goals.filter((_, j) => j !== i))} style={{ ...miniBtn(C.red), border: 'none', height: 36 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
              <select value={g.competency} onChange={(e) => setGoal(i, 'competency', e.target.value)} style={inp()}><option value="">Competency…</option>{comps.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
              <select value={g.course} onChange={(e) => setGoal(i, 'course', e.target.value)} style={inp()}><option value="">Course…</option>{courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}</select>
              <input type="date" value={g.targetDate} onChange={(e) => setGoal(i, 'targetDate', e.target.value)} style={inp()} />
              <select value={g.status} onChange={(e) => setGoal(i, 'status', e.target.value)} style={inp()}>{Object.entries(GOAL_STATUS).map(([v, l]) => <option key={v} value={v}>{l[0]}</option>)}</select>
            </div>
          </div>
        ))}
        <button onClick={addGoal} style={{ ...btnGhost(), marginBottom: 14 }}>+ Add goal</button>
        <div style={{ textAlign: 'right' }}><button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : 'Save plan'}</button></div>
      </Card>
    </div>
  );
}

/* ============================ shared UI ============================ */
function Kpi({ Icon, label, value, sub, color, bar, onClick }) {
  const inner = <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      {Icon && <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '15', display: 'grid', placeItems: 'center' }}><Icon size={16} color={color} /></div>}
      <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      {onClick && <ChevronRight size={15} color={C.muted} className="nx-kpi-arrow" style={{ marginLeft: 'auto' }} />}
    </div>
    <div style={{ fontSize: '1.7rem', fontWeight: 800, color, margin: '0 0 2px' }}>{value}</div>
    <div style={{ fontSize: '.72rem', color: C.muted }}>{sub}</div>
    {bar != null && <div style={{ height: 6, background: '#eef2f8', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}><div style={{ width: `${Math.min(100, bar)}%`, height: '100%', background: color }} /></div>}
  </>;
  const base = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)' };
  if (onClick) return <button type="button" onClick={onClick} className="nx-kpi" style={{ ...base, textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: 'inherit', transition: 'box-shadow .15s, transform .15s' }}>{inner}</button>;
  return <div style={base}>{inner}</div>;
}
function Tag({ t }) { const [l, c] = t || ['—', C.muted]; return <span style={{ background: c + '18', color: c, fontWeight: 700, fontSize: '.72rem', padding: '2px 9px', borderRadius: 999 }}>{l}</span>; }
function MiniStat({ label, t }) { const [l, c] = t || ['—', C.muted]; return <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: '6px 8px' }}><div style={{ fontSize: '.6rem', color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}>{label}</div><div style={{ fontSize: '.82rem', fontWeight: 800, color: c }}>{l}</div></div>; }
function Card({ title, children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', overflowX: 'auto' }}>{title && <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', marginBottom: 12 }}>{title}</div>}{children}</div>; }
function Empty({ children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted }}>{children}</div>; }
function Overlay({ children, onClose }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div>
  </div>;
}
function Note({ children, onClose }) { return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0f3d78', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>; }
function Field({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>; }
function Sel({ label, value, onChange, options }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><select value={value} onChange={(e) => onChange(e.target.value)} style={inp()}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function Actions({ onClose, onSubmit, busy, label }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}><button onClick={onClose} style={ghostBtn()}>Cancel</button><button onClick={onSubmit} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : label}</button></div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
function h2() { return { color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff' }; }
function ta() { return { ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }; }
function ctrl() { return { padding: '9px 12px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.85rem', fontWeight: 500, cursor: 'pointer' }; }
function cardBox() { return { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', display: 'flex', flexDirection: 'column', cursor: 'default' }; }
function primaryBtn() { return { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer' }; }
function ghostBtn() { return { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer' }; }
function btnGhost() { return { padding: '8px 14px', border: `1px dashed #b9c6da`, borderRadius: 9, background: '#fff', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }; }
function miniBtn(color) { return { padding: '5px 11px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', display: 'inline-block' }; }
function th() { return { textAlign: 'left', padding: '10px 14px', background: '#f4f7fc', color: C.navy, fontWeight: 700, fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }; }
function td() { return { padding: '10px 14px', fontSize: '.85rem', color: C.ink }; }