import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { exportTable } from '../utils/exporter';
import { ModuleShell } from '../ui/kit';
import {
  LayoutDashboard, BookOpen, GraduationCap, Target, ClipboardList, Award, Plus,
  TrendingUp, Clock, ShieldCheck, Gauge, BarChart3, UserCheck, Layers, Download, ChevronRight,
} from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Learning & Competency';

const COURSE_CATS = [['induction', 'Induction'], ['mandatory', 'Mandatory'], ['compliance', 'Compliance'], ['technical', 'Technical'], ['leadership', 'Leadership'], ['soft_skills', 'Soft skills'], ['health_safety', 'Health & Safety'], ['other', 'Other']];
const DELIVERY = [['classroom', 'Classroom'], ['online', 'Online'], ['on_the_job', 'On the job'], ['external', 'External'], ['webinar', 'Webinar'], ['blended', 'Blended']];
const COMP_CATS = [['core', 'Core'], ['leadership', 'Leadership'], ['technical', 'Technical'], ['functional', 'Functional'], ['behavioural', 'Behavioural']];
const CERT_TYPES = [['certification', 'Certification'], ['license', 'License'], ['membership', 'Membership'], ['qualification', 'Qualification']];
const ENROL_STATUS = { enrolled: ['Enrolled', C.blue], in_progress: ['In progress', C.orange], completed: ['Completed', C.green], failed: ['Failed', C.red], cancelled: ['Cancelled', C.muted] };
const PLAN_STATUS = { draft: ['Draft', C.muted], submitted: ['Submitted', C.blue], approved: ['Approved', C.teal], in_progress: ['In progress', C.orange], completed: ['Completed', C.green] };
const NEED_SRC = [['appraisal', 'Appraisal'], ['gap_analysis', 'Gap analysis'], ['manager_request', 'Manager request'], ['self_request', 'Self request'], ['compliance', 'Compliance'], ['induction', 'Induction'], ['other', 'Other']];
const PRIORITY = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']];
const CERT_STATUS_COLOR = { valid: C.green, expiring: C.orange, expired: C.red, no_expiry: C.muted };

const label = (arr, k) => (arr.find((x) => x[0] === k) || [k, k])[1];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fullName = (e) => e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() || '—' : '—';
const money = (n, cur = 'GHS') => `${cur} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function useEmployees() {
  const [list, setList] = useState([]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/employees', { params: { limit: 1000 } }); if (a) setList(data.items || []); } catch { /* */ } })(); return () => { a = false; }; }, []);
  return list;
}

/* ============================ ROOT ============================ */
export default function LearningPage() {
  const { user } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const isHR = canWrite || ['line_manager', 'viewer'].includes(user?.role);
  const [section, setSection] = useState(isHR ? 'overview' : 'mylearning');
  const [drill, setDrill] = useState(null);
  const [msg, setMsg] = useState('');

  function pick(k) { setSection(k); setDrill(null); }
  function drillTo(sec, filter) { setDrill(filter || null); setSection(sec); }

  const groups = [
    { title: 'Learning', items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard, show: isHR },
      { key: 'catalog', label: 'Course Catalog', Icon: BookOpen, show: true },
      { key: 'mylearning', label: 'My Learning', Icon: GraduationCap, show: true },
    ] },
    { title: 'Competency', items: [
      { key: 'competencies', label: 'Competencies', Icon: Target, show: isHR },
    ] },
    { title: 'Planning & Compliance', items: [
      { key: 'plans', label: 'Training Plans', Icon: ClipboardList, show: isHR },
      { key: 'certifications', label: 'Certifications', Icon: Award, show: isHR },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length);

  return (
    <ModuleShell brand={{ title: 'Learning & Competency', subtitle: 'Skills & growth', Icon: GraduationCap }} groups={groups} active={section} onSelect={pick}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
        {section === 'overview' && <Overview onDrill={drillTo} />}
        {section === 'catalog' && <Catalog canWrite={canWrite} setMsg={setMsg} initialCat={drill?.cat} />}
        {section === 'mylearning' && <MyLearning />}
        {section === 'competencies' && <Competencies canWrite={canWrite} setMsg={setMsg} initialView={drill?.view} />}
        {section === 'plans' && <TrainingPlans canWrite={canWrite} setMsg={setMsg} />}
        {section === 'certifications' && <Certifications canWrite={canWrite} setMsg={setMsg} initialStatus={drill?.status} />}
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
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(1,33,88,.22)' }}><Plus size={16} /> {children}</button>;
}
function ExportBtn({ onClick, label = 'Export' }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: `1px solid rgba(255,255,255,.9)`, borderRadius: 10, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}><Download size={15} /> {label}</button>;
}
const capw = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '';

/* ============================ OVERVIEW ============================ */
function Overview({ onDrill }) {
  const [o, setO] = useState(null);
  const [gaps, setGaps] = useState([]);
  useEffect(() => { let a = true; (async () => {
    try { const { data } = await api.get('/learning/overview'); if (a) setO(data); } catch { /* */ }
    try { const { data } = await api.get('/learning/competencies/gaps'); if (a) setGaps(data.items || []); } catch { /* */ }
  })(); return () => { a = false; }; }, []);
  return (
    <div>
      <PageHead title="Learning Overview"/>
      {!o ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <Kpi Icon={ShieldCheck} label="Mandatory compliance" value={`${o.mandatory.pct}%`} sub={`${o.mandatory.completedValid} valid completions`} color={o.mandatory.pct >= 80 ? C.green : o.mandatory.pct >= 50 ? C.orange : C.red} bar={o.mandatory.pct} onClick={() => onDrill('catalog', { cat: 'compliance' })} />
        <Kpi Icon={BookOpen} label="Active courses" value={o.courses.active} sub={`${o.courses.mandatory} mandatory`} color={C.navy} onClick={() => onDrill('catalog')} />
        <Kpi Icon={TrendingUp} label="Course completion" value={`${o.enrollments.completionPct}%`} sub={`${o.enrollments.completed}/${o.enrollments.total} enrollments`} color={C.blue} bar={o.enrollments.completionPct} onClick={() => onDrill('catalog')} />
        <Kpi Icon={Clock} label="Refreshers due" value={o.refreshersDue} sub="next 60 days" color={o.refreshersDue ? C.orange : C.green} onClick={() => onDrill('certifications', { status: 'expiring' })} />
        <Kpi Icon={Award} label="Certs expiring" value={o.certifications.expiringSoon} sub={`${o.certifications.expired} already expired`} color={o.certifications.expired ? C.red : o.certifications.expiringSoon ? C.orange : C.green} onClick={() => onDrill('certifications', { status: 'expiring' })} />
        <Kpi Icon={Gauge} label="Competency gaps" value={o.competencyGaps} sub="ratings below required" color={o.competencyGaps ? C.orange : C.green} onClick={() => onDrill('competencies', { view: 'gaps' })} />
      </div>

      <Card title="Top competency gaps across the workforce">
        {gaps.length === 0 ? <Empty>No competency assessments recorded yet.</Empty> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Competency', 'Category', 'Assessed', 'Avg level', 'Required', '% with gap'].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
            <tbody>
              {gaps.slice(0, 8).map((g) => (
                <tr key={g.competency} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={td()}><b style={{ color: C.navy }}>{g.name}</b></td>
                  <td style={{ ...td(), textTransform: 'capitalize' }}>{g.category}</td>
                  <td style={td()}>{g.assessed}</td>
                  <td style={td()}>{g.avgLevel}</td>
                  <td style={td()}>{g.avgRequired}</td>
                  <td style={td()}><GapBar pct={g.gapPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      </>}
    </div>
  );
}
function GapBar({ pct }) {
  const col = pct >= 50 ? C.red : pct >= 25 ? C.orange : C.green;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ flex: 1, height: 8, background: '#eef2f8', borderRadius: 999, overflow: 'hidden', maxWidth: 120 }}><div style={{ width: `${pct}%`, height: '100%', background: col }} /></div>
    <span style={{ fontWeight: 700, color: col, fontSize: '.8rem' }}>{pct}%</span>
  </div>;
}

/* ============================ CATALOG ============================ */
function Catalog({ canWrite, setMsg, initialCat }) {
  const [items, setItems] = useState([]);
  const [cat, setCat] = useState(initialCat || 'all'); const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [enrolFor, setEnrolFor] = useState(null);
  const [manage, setManage] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => { let a = true; (async () => {
    setLoading(true);
    try { const { data } = await api.get('/learning/courses', { params: { category: cat, q } }); if (a) setItems(data.items || []); }
    catch { if (a) setItems([]); } finally { if (a) setLoading(false); }
  })(); return () => { a = false; }; }, [cat, q, reload]);

  async function del(c) {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    try { const { data } = await api.delete(`/learning/courses/${c._id}`); setMsg(data.message || 'Deleted.'); refresh(); }
    catch (e) { setMsg(e?.response?.data?.message || 'Could not delete.'); }
  }

  function exportCourses() {
    exportTable({
      filename: 'Course_Catalog.xlsx', sheet: 'Courses', title: 'Course Catalog', subtitle: 'Training catalogue',
      filters: cat !== 'all' ? { Category: label(COURSE_CATS, cat) } : null,
      columns: [
        { label: 'Title', key: 'title', width: 30 }, { label: 'Code', key: 'code', width: 14 },
        { label: 'Category', key: 'category', width: 16 }, { label: 'Delivery', key: 'delivery', width: 14 },
        { label: 'Provider', key: 'provider', width: 20 }, { label: 'Hours', key: 'hours', width: 8, align: 'right' },
        { label: 'Mandatory', key: 'mandatory', width: 11, align: 'center', color: { Yes: '#e5484d' } },
        { label: 'Valid (mo)', key: 'valid', width: 10, align: 'right' },
        { label: 'Enrolled', key: 'enrolled', width: 10, align: 'right' }, { label: 'Completed', key: 'completed', width: 11, align: 'right' },
      ],
      rows: (items || []).map((c) => ({
        title: c.title, code: c.code || '', category: label(COURSE_CATS, c.category), delivery: label(DELIVERY, c.deliveryMode),
        provider: c.provider || '', hours: c.durationHours || 0, mandatory: c.mandatory ? 'Yes' : '', valid: c.validForMonths || 0,
        enrolled: c.enrolledCount || 0, completed: c.completedCount || 0,
      })),
    });
  }
  return (
    <div>
      <PageHead title="Course Catalog"  action={<div style={{ display: 'flex', gap: 8 }}>{items.length > 0 && <ExportBtn onClick={exportCourses} />}{canWrite && <AddBtn onClick={() => setModal({})}>New Course</AddBtn>}</div>} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={ctrl()}><option value="all">All categories</option>{COURSE_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search course, provider…" style={{ ...ctrl(), minWidth: 200 }} />
      </div>
      {loading ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div>
        : items.length === 0 ? <Empty>No courses yet.</Empty>
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {items.map((c) => (
              <div key={c._id} style={cardBox()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={pill(C.navy)}>{label(COURSE_CATS, c.category)}</span>
                  {c.mandatory && <span style={pill(C.red)}>Mandatory</span>}
                </div>
                <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem', margin: '10px 0 4px' }}>{c.title}</div>
                {c.description && <div style={{ color: C.muted, fontSize: '.8rem', lineHeight: 1.5, marginBottom: 8 }}>{c.description.slice(0, 110)}{c.description.length > 110 ? '…' : ''}</div>}
                <div style={{ color: C.muted, fontSize: '.74rem', marginBottom: 10 }}>
                  {label(DELIVERY, c.deliveryMode)}{c.provider ? ` · ${c.provider}` : ''}{c.durationHours ? ` · ${c.durationHours}h` : ''}
                  {c.validForMonths ? ` · valid ${c.validForMonths}mo` : ''}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: '.74rem', color: C.ink, marginBottom: 12 }}>
                  <span><b>{c.enrolledCount || 0}</b> enrolled</span><span><b style={{ color: C.green }}>{c.completedCount || 0}</b> completed</span>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canWrite && <button onClick={() => setEnrolFor(c)} style={miniBtn(C.green)}>Enrol</button>}
                  {canWrite && <button onClick={() => setManage(c)} style={miniBtn(C.blue)}>Roster</button>}
                  {canWrite && <button onClick={() => setModal(c)} style={miniBtn(C.muted)}>Edit</button>}
                  {canWrite && <button onClick={() => del(c)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>}
                </div>
              </div>
            ))}
          </div>}
      {modal && <CourseModal course={modal._id ? modal : null} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); refresh(); }} />}
      {enrolFor && <EnrolModal course={enrolFor} onClose={() => setEnrolFor(null)} onSaved={(m) => { setEnrolFor(null); setMsg(m); refresh(); }} />}
      {manage && <RosterDrawer course={manage} onClose={() => setManage(null)} onChanged={refresh} />}
    </div>
  );
}

function CourseModal({ course, onClose, onSaved }) {
  const editing = !!course;
  const [comps, setComps] = useState([]);
  const [f, setF] = useState({
    title: course?.title || '', code: course?.code || '', category: course?.category || 'technical', deliveryMode: course?.deliveryMode || 'classroom',
    provider: course?.provider || '', description: course?.description || '', durationHours: course?.durationHours || '', cost: course?.cost || '',
    currency: course?.currency || 'GHS', mandatory: !!course?.mandatory, validForMonths: course?.validForMonths || '', passMark: course?.passMark || '',
    competencies: (course?.competencies || []).map((c) => c._id || c), active: course?.active ?? true,
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { (async () => { try { const { data } = await api.get('/learning/competencies', { params: { active: true } }); setComps(data.items || []); } catch { /* */ } })(); }, []);

  async function submit() {
    if (!f.title.trim()) { setErr('Title is required.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, durationHours: Number(f.durationHours) || 0, cost: Number(f.cost) || 0, validForMonths: Number(f.validForMonths) || 0, passMark: Number(f.passMark) || 0 };
    try { if (editing) await api.put(`/learning/courses/${course._id}`, payload); else await api.post('/learning/courses', payload); onSaved(editing ? 'Course updated.' : 'Course created.'); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  const toggleComp = (id) => setF((s) => ({ ...s, competencies: s.competencies.includes(id) ? s.competencies.filter((x) => x !== id) : [...s.competencies, id] }));
  return (
    <Overlay onClose={onClose} wide>
      <h2 style={h2()}>{editing ? 'Edit course' : 'New course'}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Row2><Field label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} /><Field label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v })} /></Row2>
      <Row2>
        <Sel label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={COURSE_CATS} />
        <Sel label="Delivery" value={f.deliveryMode} onChange={(v) => setF({ ...f, deliveryMode: v })} options={DELIVERY} />
      </Row2>
      <Row2><Field label="Provider" value={f.provider} onChange={(v) => setF({ ...f, provider: v })} placeholder="Internal dept / external body" /><Field label="Duration (hours)" type="number" value={f.durationHours} onChange={(v) => setF({ ...f, durationHours: v })} /></Row2>
      <Lbl>Description</Lbl>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />
      <Row2><Field label="Cost" type="number" value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /><Field label="Currency" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} /></Row2>
      <Row2><Field label="Valid for (months)" type="number" value={f.validForMonths} onChange={(v) => setF({ ...f, validForMonths: v })} placeholder="0 = no expiry" /><Field label="Pass mark (%)" type="number" value={f.passMark} onChange={(v) => setF({ ...f, passMark: v })} /></Row2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '4px 0 12px' }}><input type="checkbox" checked={f.mandatory} onChange={(e) => setF({ ...f, mandatory: e.target.checked })} /> Mandatory for target staff</label>
      {comps.length > 0 && <>
        <Lbl>Competencies developed</Lbl>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {comps.map((c) => <button key={c._id} type="button" onClick={() => toggleComp(c._id)} style={chip(f.competencies.includes(c._id))}>{c.name}</button>)}
        </div>
      </>}
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label={editing ? 'Save course' : 'Create course'} />
    </Overlay>
  );
}

function EnrolModal({ course, onClose, onSaved }) {
  const employees = useEmployees();
  const [sel, setSel] = useState([]); const [q, setQ] = useState(''); const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const filtered = employees.filter((e) => !q || fullName(e).toLowerCase().includes(q.toLowerCase()) || String(e.staffId || '').toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  async function submit() {
    if (!sel.length) { setErr('Select at least one employee.'); return; }
    setBusy(true); setErr('');
    try { const { data } = await api.post('/learning/enrollments', { course: course._id, employees: sel, startDate: startDate || null }); onSaved(`Enrolled ${data.created} staff into “${course.title}”.`); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not enrol.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>Enrol staff — {course.title}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Start date (optional)" type="date" value={startDate} onChange={setStartDate} />
      <Lbl>Employees ({sel.length} selected)</Lbl>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff…" style={{ ...inp(), marginBottom: 8 }} />
      <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.line}`, borderRadius: 10 }}>
        {filtered.slice(0, 200).map((e) => (
          <label key={e._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.line}`, fontSize: '.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.includes(e._id)} onChange={() => toggle(e._id)} />
            {fullName(e)} {e.staffId && <span style={{ color: C.muted }}>· {e.staffId}</span>}
          </label>
        ))}
        {filtered.length === 0 && <div style={{ padding: 14, color: C.muted, fontSize: '.84rem' }}>No staff.</div>}
      </div>
      <div style={{ marginTop: 16 }}><Actions onClose={onClose} onSubmit={submit} busy={busy} label={`Enrol ${sel.length || ''}`.trim()} /></div>
    </Overlay>
  );
}

function RosterDrawer({ course, onClose, onChanged }) {
  const [rows, setRows] = useState(null); const [reload, setReload] = useState(0); const [err, setErr] = useState('');
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/learning/enrollments', { params: { course: course._id } }); if (a) setRows(data.items || []); } catch { if (a) setErr('Could not load.'); } })(); return () => { a = false; }; }, [course._id, reload]);
  async function setStatus(en, status) {
    try { await api.put(`/learning/enrollments/${en._id}`, { status, completionDate: status === 'completed' ? new Date().toISOString() : undefined }); setReload((n) => n + 1); onChanged(); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not update.'); }
  }
  async function remove(en) { if (!window.confirm('Remove this enrollment?')) return; try { await api.delete(`/learning/enrollments/${en._id}`); setReload((n) => n + 1); onChanged(); } catch { /* */ } }
  return (
    <Drawer title={`Roster — ${course.title}`} onClose={onClose}>
      {err && <ErrBox>{err}</ErrBox>}
      {!rows ? <div style={{ color: C.muted }}>Loading…</div> : rows.length === 0 ? <Empty>Nobody enrolled yet.</Empty> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Staff', 'Status', 'Completed', 'Expiry', ''].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((en) => { const [sl, sc] = ENROL_STATUS[en.status] || [en.status, C.muted]; return (
              <tr key={en._id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={td()}>{fullName(en.employee)}{en.employee?.staffId ? <span style={{ color: C.muted }}> · {en.employee.staffId}</span> : ''}</td>
                <td style={td()}><span style={{ color: sc, fontWeight: 700, fontSize: '.78rem' }}>{sl}</span></td>
                <td style={td()}>{fmtDate(en.completionDate)}</td>
                <td style={td()}>{en.expiryDate ? <span style={{ color: new Date(en.expiryDate) < new Date() ? C.red : C.ink }}>{fmtDate(en.expiryDate)}</span> : '—'}</td>
                <td style={{ ...td(), textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {en.status !== 'completed' && <button onClick={() => setStatus(en, 'in_progress')} style={miniBtn(C.orange)}>Start</button>}{' '}
                  {en.status !== 'completed' && <button onClick={() => setStatus(en, 'completed')} style={miniBtn(C.green)}>Complete</button>}{' '}
                  <button onClick={() => remove(en)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      )}
    </Drawer>
  );
}

/* ============================ MY LEARNING ============================ */
function MyLearning() {
  const [rows, setRows] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/learning/enrollments', { params: { mine: true } }); if (a) setRows(data.items || []); } catch { if (a) setRows([]); } })(); return () => { a = false; }; }, []);
  return (
    <div>
      <PageHead title="My Learning"/>
      {!rows ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div>
        : rows.length === 0 ? <Empty>You have no course enrollments yet. Your HR team assigns training here.</Empty>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      {rows.map((en) => { const [sl, sc] = ENROL_STATUS[en.status] || [en.status, C.muted]; const expd = en.expiryDate && new Date(en.expiryDate) < new Date(); return (
        <div key={en._id} style={cardBox()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={pill(C.navy)}>{label(COURSE_CATS, en.course?.category || en.category)}</span>
            <span style={{ ...pill(sc), background: sc + '18' }}>{sl}</span>
          </div>
          <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem', margin: '10px 0 6px' }}>{en.course?.title || en.courseTitle}</div>
          <div style={{ color: C.muted, fontSize: '.76rem', marginBottom: 6 }}>Enrolled {fmtDate(en.enrolledDate)}{en.completionDate ? ` · Completed ${fmtDate(en.completionDate)}` : ''}</div>
          {en.expiryDate && <div style={{ fontSize: '.76rem', fontWeight: 700, color: expd ? C.red : C.orange, marginBottom: 8 }}>{expd ? '⚠ Refresher overdue' : `Valid until ${fmtDate(en.expiryDate)}`}</div>}
          {en.certificate?.url && <a href={en.certificate.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none', marginTop: 4 }}>Download certificate</a>}
        </div>
      ); })}
        </div>}
    </div>
  );
}

/* ============================ COMPETENCIES ============================ */
function Competencies({ canWrite, setMsg, initialView }) {
  const [view, setView] = useState(initialView || 'framework');
  const SUB = [['framework', 'Framework', Layers], ['gaps', 'Gap Analysis', BarChart3], ['assess', 'Assess Employee', UserCheck]];
  return (
    <div>
      <PageHead title="Competencies"/>
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {SUB.map(([v, l, I]) => (
          <button key={v} onClick={() => setView(v)} style={{ ...segBtn(view === v), display: 'inline-flex', alignItems: 'center', gap: 7 }}><I size={15} /> {l}</button>
        ))}
      </div>
      {view === 'framework' && <CompFramework canWrite={canWrite} setMsg={setMsg} />}
      {view === 'gaps' && <GapAnalysis />}
      {view === 'assess' && <AssessEmployee setMsg={setMsg} />}
    </div>
  );
}

function CompFramework({ canWrite, setMsg }) {
  const [items, setItems] = useState([]); const [modal, setModal] = useState(null); const [reload, setReload] = useState(0); const [loading, setLoading] = useState(true);
  useEffect(() => { let a = true; (async () => { setLoading(true); try { const { data } = await api.get('/learning/competencies'); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } finally { if (a) setLoading(false); } })(); return () => { a = false; }; }, [reload]);
  async function del(c) { if (!window.confirm(`Delete "${c.name}"? Ratings for it will be removed.`)) return; try { await api.delete(`/learning/competencies/${c._id}`); setMsg('Competency deleted.'); setReload((n) => n + 1); } catch (e) { setMsg(e?.response?.data?.message || 'Could not delete.'); } }
  const grouped = COMP_CATS.map(([k, l]) => [l, items.filter((c) => c.category === k)]).filter(([, arr]) => arr.length);
  return (
    <div>
      {canWrite && <div style={{ marginBottom: 14 }}><button onClick={() => setModal({})} style={primaryBtn()}>+ New Competency</button></div>}
      {loading ? <div style={{ color: C.muted }}>Loading…</div> : items.length === 0 ? <Empty>No competencies defined yet.</Empty> : grouped.map(([l, arr]) => (
        <div key={l} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 800, color: C.navy, fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{l}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {arr.map((c) => (
              <div key={c._id} style={cardBox()}>
                <div style={{ fontWeight: 800, color: C.navy, fontSize: '.95rem' }}>{c.name}{c.code ? <span style={{ color: C.muted, fontWeight: 500 }}> · {c.code}</span> : ''}</div>
                {c.description && <div style={{ color: C.muted, fontSize: '.78rem', margin: '5px 0 8px', lineHeight: 1.5 }}>{c.description.slice(0, 100)}</div>}
                <div style={{ fontSize: '.74rem', color: C.ink, marginBottom: 10 }}>Scale 1–{c.scaleMax} · default required {c.defaultRequiredLevel} · {(c.requirements || []).length} role rule(s)</div>
                {canWrite && <div style={{ display: 'flex', gap: 8 }}><button onClick={() => setModal(c)} style={miniBtn(C.muted)}>Edit</button><button onClick={() => del(c)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button></div>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {modal && <CompetencyModal comp={modal._id ? modal : null} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); setReload((n) => n + 1); }} />}
    </div>
  );
}

function CompetencyModal({ comp, onClose, onSaved }) {
  const editing = !!comp;
  const [f, setF] = useState({ name: comp?.name || '', code: comp?.code || '', category: comp?.category || 'core', description: comp?.description || '', scaleMax: comp?.scaleMax || 5, defaultRequiredLevel: comp?.defaultRequiredLevel || 3 });
  const [reqs, setReqs] = useState(comp?.requirements?.map((r) => ({ grade: r.grade || '', requiredLevel: r.requiredLevel })) || []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.name.trim()) { setErr('Name is required.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, scaleMax: Number(f.scaleMax) || 5, defaultRequiredLevel: Number(f.defaultRequiredLevel) || 3, requirements: reqs.filter((r) => r.grade).map((r) => ({ grade: r.grade, requiredLevel: Number(r.requiredLevel) || 3 })) };
    try { if (editing) await api.put(`/learning/competencies/${comp._id}`, payload); else await api.post('/learning/competencies', payload); onSaved(editing ? 'Competency updated.' : 'Competency created.'); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>{editing ? 'Edit competency' : 'New competency'}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Row2><Field label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><Field label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v })} /></Row2>
      <Row2><Sel label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={COMP_CATS} /><Field label="Scale max" type="number" value={f.scaleMax} onChange={(v) => setF({ ...f, scaleMax: v })} /></Row2>
      <Lbl>Description</Lbl>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />
      <Field label="Default required level" type="number" value={f.defaultRequiredLevel} onChange={(v) => setF({ ...f, defaultRequiredLevel: v })} />
      <Lbl>Required level by grade (optional)</Lbl>
      {reqs.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 6, marginBottom: 6 }}>
          <input value={r.grade} onChange={(e) => setReqs(reqs.map((x, j) => j === i ? { ...x, grade: e.target.value } : x))} placeholder="Grade (e.g. M2)" style={inp()} />
          <input type="number" value={r.requiredLevel} onChange={(e) => setReqs(reqs.map((x, j) => j === i ? { ...x, requiredLevel: e.target.value } : x))} placeholder="Lvl" style={inp()} />
          <button onClick={() => setReqs(reqs.filter((_, j) => j !== i))} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>
        </div>
      ))}
      <button onClick={() => setReqs([...reqs, { grade: '', requiredLevel: f.defaultRequiredLevel }])} style={{ ...btnGhost(), marginBottom: 14 }}>+ Add grade rule</button>
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label={editing ? 'Save' : 'Create'} />
    </Overlay>
  );
}

function GapAnalysis() {
  const [rows, setRows] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/learning/competencies/gaps'); if (a) setRows(data.items || []); } catch { if (a) setRows([]); } })(); return () => { a = false; }; }, []);
  function exportGaps() {
    exportTable({
      filename: 'Competency_Gap_Analysis.xlsx', sheet: 'Gap Analysis', title: 'Competency Gap Analysis', subtitle: 'Workforce-wide competency gaps',
      columns: [
        { label: 'Competency', key: 'name', width: 28 }, { label: 'Category', key: 'category', width: 16 },
        { label: 'Assessed', key: 'assessed', width: 12, align: 'right' }, { label: 'Avg level', key: 'avgLevel', width: 12, align: 'right' },
        { label: 'Avg required', key: 'avgRequired', width: 14, align: 'right' }, { label: 'Avg gap', key: 'avgGap', width: 12, align: 'right' },
        { label: '% with gap', key: 'gapPctTxt', width: 13, align: 'right', color: (v, r) => r.gapPct >= 50 ? '#e5484d' : r.gapPct >= 25 ? '#FD9C09' : '#1f9d57' },
      ],
      rows: rows.map((g) => ({ name: g.name, category: capw(g.category), assessed: g.assessed, avgLevel: g.avgLevel, avgRequired: g.avgRequired, avgGap: g.avgGap, gapPctTxt: `${g.gapPct}%`, gapPct: g.gapPct })),
    });
  }
  if (!rows) return <div style={{ color: C.muted }}>Loading…</div>;
  if (rows.length === 0) return <Empty>No competency assessments recorded yet — assess employees to build the gap picture.</Empty>;
  return (
    <>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><ExportBtn onClick={exportGaps} /></div>
    <Card title="Workforce competency gap analysis">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Competency', 'Category', 'Assessed', 'Avg level', 'Required', 'Avg gap', '% with gap'].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.competency} style={{ borderTop: `1px solid ${C.line}` }}>
              <td style={td()}><b style={{ color: C.navy }}>{g.name}</b></td>
              <td style={{ ...td(), textTransform: 'capitalize' }}>{g.category}</td>
              <td style={td()}>{g.assessed}</td><td style={td()}>{g.avgLevel}</td><td style={td()}>{g.avgRequired}</td>
              <td style={td()}>{g.avgGap}</td><td style={td()}><GapBar pct={g.gapPct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
    </>
  );
}

function AssessEmployee({ setMsg }) {
  const employees = useEmployees();
  const [empId, setEmpId] = useState(''); const [data, setData] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [edits, setEdits] = useState({});
  useEffect(() => { let a = true; (async () => { if (!empId) { setData(null); setEdits({}); return; } try { const { data } = await api.get(`/learning/competencies/employee/${empId}`); if (a) { setData(data); setEdits({}); } } catch { if (a) setErr('Could not load.'); } })(); return () => { a = false; }; }, [empId]);
  const setVal = (cid, k, v) => setEdits((s) => ({ ...s, [cid]: { ...s[cid], [k]: v } }));
  async function save() {
    setBusy(true); setErr('');
    const ratings = (data?.rows || []).map((r) => {
      const e = edits[r.competency] || {};
      const self = e.self ?? r.selfRating; const mgr = e.mgr ?? r.managerRating; const fin = e.final ?? r.finalRating;
      if (self == null && mgr == null && fin == null) return null;
      return { competency: r.competency, selfRating: num(self), managerRating: num(mgr), finalRating: num(fin), notes: e.notes ?? r.notes };
    }).filter(Boolean);
    try { const { data: res } = await api.post('/learning/competencies/assess', { employee: empId, ratings }); setMsg(`Saved ${res.updated} rating(s).`); const { data: fresh } = await api.get(`/learning/competencies/employee/${empId}`); setData(fresh); setEdits({}); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ maxWidth: 380, marginBottom: 16 }}>
        <Lbl>Employee</Lbl>
        <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={inp()}>
          <option value="">Select an employee…</option>
          {employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>)}
        </select>
      </div>
      {err && <ErrBox>{err}</ErrBox>}
      {data && (
        <Card title={`${data.employee.name} — ${data.employee.grade || 'no grade'} · ${data.summary.assessed}/${data.summary.total} assessed · ${data.summary.gaps} gap(s)`}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Competency', 'Required', 'Self', 'Manager', 'Agreed', 'Gap'].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r) => { const e = edits[r.competency] || {}; const fin = e.final ?? r.finalRating; const gap = fin != null ? Math.max(0, r.required - fin) : null; return (
                <tr key={r.competency} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={td()}><b style={{ color: C.navy }}>{r.name}</b> <span style={{ color: C.muted, fontSize: '.72rem' }}>/{r.scaleMax}</span></td>
                  <td style={td()}>{r.required}</td>
                  <td style={td()}><NumCell value={e.self ?? r.selfRating} max={r.scaleMax} onChange={(v) => setVal(r.competency, 'self', v)} /></td>
                  <td style={td()}><NumCell value={e.mgr ?? r.managerRating} max={r.scaleMax} onChange={(v) => setVal(r.competency, 'mgr', v)} /></td>
                  <td style={td()}><NumCell value={e.final ?? r.finalRating} max={r.scaleMax} onChange={(v) => setVal(r.competency, 'final', v)} /></td>
                  <td style={td()}>{gap == null ? '—' : gap > 0 ? <span style={{ color: C.red, fontWeight: 800 }}>-{gap}</span> : <span style={{ color: C.green, fontWeight: 700 }}>✓</span>}</td>
                </tr>
              ); })}
            </tbody>
          </table>
          <div style={{ marginTop: 14, textAlign: 'right' }}><button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : 'Save assessment'}</button></div>
        </Card>
      )}
    </div>
  );
}
function NumCell({ value, max, onChange }) {
  return <input type="number" min="0" max={max} value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ width: 54, padding: '5px 7px', border: `1px solid ${C.line}`, borderRadius: 7, fontSize: '.82rem', textAlign: 'center' }} />;
}
const num = (v) => (v === '' || v == null ? null : Number(v));

/* ============================ TRAINING PLANS ============================ */
function TrainingPlans({ canWrite, setMsg }) {
  const [items, setItems] = useState([]); const [editing, setEditing] = useState(null); const [reload, setReload] = useState(0); const [loading, setLoading] = useState(true);
  useEffect(() => { let a = true; (async () => { setLoading(true); try { const { data } = await api.get('/learning/plans'); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } finally { if (a) setLoading(false); } })(); return () => { a = false; }; }, [reload]);
  if (editing) return <PlanEditor id={editing === 'new' ? null : editing} onBack={() => { setEditing(null); setReload((n) => n + 1); }} setMsg={setMsg} />;
  return (
    <div>
      <PageHead title="Training Plans"  action={canWrite && <AddBtn onClick={() => setEditing('new')}>New Training Plan</AddBtn>} />
      {loading ? <div style={{ color: C.muted }}>Loading…</div> : items.length === 0 ? <Empty>No training plans yet.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {items.map((p) => { const [sl, sc] = PLAN_STATUS[p.status] || [p.status, C.muted]; const pct = p.itemCount ? Math.round((p.completedItems / p.itemCount) * 100) : 0; return (
            <div key={p._id} style={cardBox()} onClick={() => setEditing(p._id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={pill(C.navy)}>{p.year}</span><span style={{ ...pill(sc), background: sc + '18' }}>{sl}</span>
              </div>
              <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem', margin: '10px 0 4px' }}>{p.title || `${p.department || 'Company-wide'} plan`}</div>
              <div style={{ color: C.muted, fontSize: '.76rem', marginBottom: 8 }}>{p.department || 'Company-wide'} · {p.itemCount} need(s)</div>
              <div style={{ fontSize: '.76rem', color: C.ink, marginBottom: 8 }}>Budget {money(p.budget, p.currency)} · Planned {money(p.plannedCost, p.currency)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 7, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: C.green }} /></div>
                <span style={{ fontSize: '.72rem', color: C.muted, fontWeight: 700 }}>{pct}%</span>
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

function PlanEditor({ id, onBack, setMsg }) {
  const employees = useEmployees();
  const [f, setF] = useState({ year: new Date().getFullYear(), title: '', department: '', status: 'draft', budget: '', currency: 'GHS' });
  const [items, setItems] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(!id);
  useEffect(() => { if (!id) return; let a = true; (async () => { try { const { data } = await api.get(`/learning/plans/${id}`); if (a) { setF({ year: data.year, title: data.title || '', department: data.department || '', status: data.status, budget: data.budget || '', currency: data.currency || 'GHS' }); setItems((data.items || []).map((it) => ({ ...it, employee: it.employee?._id || it.employee || '' }))); setLoaded(true); } } catch { if (a) setErr('Could not load.'); } })(); return () => { a = false; }; }, [id]);
  const setItem = (i, k, v) => setItems(items.map((it, j) => j === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems([...items, { title: '', employee: '', audienceLabel: '', needSource: 'manager_request', priority: 'medium', targetQuarter: '', estimatedCost: '', status: 'identified' }]);
  const planned = items.reduce((s, it) => s + (Number(it.estimatedCost) || 0), 0);
  async function save(newStatus) {
    if (!f.year || Number(f.year) < 2000) { setErr('Enter a valid year.'); return; }
    if (!f.title.trim() && !f.department.trim()) { setErr('Give the plan a name (title) or a department.'); return; }
    const cleanItems = items.filter((it) => (it.title || '').trim() || it.employee || (it.audienceLabel || '').trim());
    if (newStatus === 'approved' && cleanItems.length === 0) { setErr('Add at least one training need before approving the plan.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, year: Number(f.year), budget: Number(f.budget) || 0, status: newStatus || f.status, items: cleanItems.map((it) => ({ ...it, employee: it.employee || null, estimatedCost: Number(it.estimatedCost) || 0, actualCost: Number(it.actualCost) || 0 })) };
    try { if (id) await api.put(`/learning/plans/${id}`, payload); else await api.post('/learning/plans', payload); setMsg('Training plan saved.'); onBack(); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  if (!loaded) return <div style={{ color: C.muted }}>Loading…</div>;
  return (
    <div>
      <button onClick={onBack} style={{ ...btnGhost(), marginBottom: 14 }}>← Back to plans</button>
      {err && <ErrBox>{err}</ErrBox>}
      <Card title={id ? 'Edit training plan' : 'New training plan'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
          <Field label="Year" type="number" value={f.year} onChange={(v) => setF({ ...f, year: v })} />
          <Field label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="e.g. 2026 Plan" />
          <Field label="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} placeholder="Blank = company-wide" />
          <Field label="Budget" type="number" value={f.budget} onChange={(v) => setF({ ...f, budget: v })} />
          <Field label="Currency" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
          <div style={{ fontWeight: 800, color: C.navy, fontSize: '.85rem' }}>Training needs ({items.length})</div>
          <div style={{ fontSize: '.8rem', color: C.ink }}>Planned: <b>{money(planned, f.currency)}</b>{f.budget ? <span style={{ color: planned > Number(f.budget) ? C.red : C.green }}> / {money(f.budget, f.currency)}</span> : ''}</div>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <input value={it.title} onChange={(e) => setItem(i, 'title', e.target.value)} placeholder="Training need / course" style={inp()} />
              <select value={it.employee || ''} onChange={(e) => setItem(i, 'employee', e.target.value)} style={inp()}><option value="">Whole group…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select>
              <input value={it.audienceLabel || ''} onChange={(e) => setItem(i, 'audienceLabel', e.target.value)} placeholder="or audience" style={inp()} />
              <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ ...miniBtn(C.red), border: 'none', height: 36 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr .8fr 1fr 1fr', gap: 6 }}>
              <select value={it.needSource} onChange={(e) => setItem(i, 'needSource', e.target.value)} style={inp()}>{NEED_SRC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select value={it.priority} onChange={(e) => setItem(i, 'priority', e.target.value)} style={inp()}>{PRIORITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select value={it.targetQuarter || ''} onChange={(e) => setItem(i, 'targetQuarter', e.target.value)} style={inp()}><option value="">Qtr</option>{['Q1', 'Q2', 'Q3', 'Q4'].map((qx) => <option key={qx} value={qx}>{qx}</option>)}</select>
              <input type="number" value={it.estimatedCost ?? ''} onChange={(e) => setItem(i, 'estimatedCost', e.target.value)} placeholder="Est. cost" style={inp()} />
              <select value={it.status} onChange={(e) => setItem(i, 'status', e.target.value)} style={inp()}>{['identified', 'planned', 'approved', 'scheduled', 'completed', 'deferred', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
          </div>
        ))}
        <button onClick={addItem} style={{ ...btnGhost(), marginBottom: 14 }}>+ Add need</button>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => save()} disabled={busy} style={ghostBtn()}>{busy ? 'Saving…' : 'Save draft'}</button>
          {f.status !== 'approved' && <button onClick={() => save('approved')} disabled={busy} style={primaryBtn()}>Approve plan</button>}
        </div>
      </Card>
    </div>
  );
}

/* ============================ CERTIFICATIONS ============================ */
function Certifications({ canWrite, setMsg, initialStatus }) {
  const [items, setItems] = useState([]); const [type, setType] = useState('all'); const [status, setStatus] = useState(initialStatus || 'all'); const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); const [reload, setReload] = useState(0);
  useEffect(() => { let a = true; (async () => { setLoading(true); try { const { data } = await api.get('/learning/certifications', { params: { type, status } }); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } finally { if (a) setLoading(false); } })(); return () => { a = false; }; }, [type, status, reload]);
  async function del(c) { if (!window.confirm(`Delete "${c.name}"?`)) return; try { await api.delete(`/learning/certifications/${c._id}`); setMsg('Deleted.'); setReload((n) => n + 1); } catch { /* */ } }
  async function verify(c) { try { await api.put(`/learning/certifications/${c._id}`, { verified: true }); setMsg('Verified.'); setReload((n) => n + 1); } catch { /* */ } }
  function exportCerts() {
    const STATUS_HEX = { valid: '#1f9d57', expiring: '#FD9C09', expired: '#e5484d', no_expiry: '#8a94a6' };
    exportTable({
      filename: 'Certifications.xlsx', sheet: 'Certifications', title: 'Certifications & Licenses', subtitle: 'Staff professional certifications',
      filters: { Type: type === 'all' ? 'All' : label(CERT_TYPES, type), Status: status === 'all' ? 'All' : capw(status) },
      columns: [
        { label: 'Employee', key: 'emp', width: 26 }, { label: 'Certification', key: 'name', width: 24 },
        { label: 'Type', key: 'type', width: 14 }, { label: 'Issuing body', key: 'body', width: 22 },
        { label: 'Number', key: 'num', width: 16 }, { label: 'Issued', key: 'issued', width: 14 },
        { label: 'Expires', key: 'expires', width: 14 }, { label: 'Status', key: 'statusLabel', width: 12, align: 'center', color: (v, r) => STATUS_HEX[r.statusKey] },
        { label: 'Verified', key: 'verified', width: 10, align: 'center' },
      ],
      rows: (items || []).map((c) => ({
        emp: fullName(c.employee), name: c.name, type: label(CERT_TYPES, c.type), body: c.issuingBody || '',
        num: c.certificateNumber || '', issued: fmtDate(c.issueDate), expires: fmtDate(c.expiryDate),
        statusLabel: capw((c.status || '').replace('_', ' ')), statusKey: c.status, verified: c.verified ? 'Yes' : '',
      })),
    });
  }
  return (
    <div>
      <PageHead title="Certifications & Licenses"action={<div style={{ display: 'flex', gap: 8 }}>{items && items.length > 0 && <ExportBtn onClick={exportCerts} />}{canWrite && <AddBtn onClick={() => setModal({})}>Add Certification</AddBtn>}</div>} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={ctrl()}><option value="all">All types</option>{CERT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={ctrl()}><option value="all">All statuses</option><option value="valid">Valid</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="no_expiry">No expiry</option></select>
      </div>
      {loading ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : items.length === 0 ? <Empty>No certifications recorded.</Empty> : (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Employee', 'Certification', 'Body', 'Issued', 'Expires', 'Status', ''].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c._id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                  <td style={td()}>{fullName(c.employee)}{c.employee?.staffId ? <span style={{ color: C.muted }}> · {c.employee.staffId}</span> : ''}</td>
                  <td style={td()}><b style={{ color: C.navy }}>{c.name}</b> <span style={{ color: C.muted, fontSize: '.72rem', textTransform: 'capitalize' }}>{label(CERT_TYPES, c.type)}</span>{c.verified && <span title="Verified" style={{ color: C.green, marginLeft: 6 }}>✓</span>}</td>
                  <td style={td()}>{c.issuingBody || '—'}</td>
                  <td style={td()}>{fmtDate(c.issueDate)}</td>
                  <td style={td()}>{fmtDate(c.expiryDate)}</td>
                  <td style={td()}><span style={{ ...pill(CERT_STATUS_COLOR[c.status]), background: CERT_STATUS_COLOR[c.status] + '18', textTransform: 'capitalize' }}>{c.status.replace('_', ' ')}</span></td>
                  <td style={{ ...td(), textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.file?.url && <a href={c.file.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>File</a>}{' '}
                    {canWrite && !c.verified && <button onClick={() => verify(c)} style={miniBtn(C.green)}>Verify</button>}{' '}
                    {canWrite && <button onClick={() => setModal(c)} style={miniBtn(C.muted)}>Edit</button>}{' '}
                    {canWrite && <button onClick={() => del(c)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <CertModal cert={modal._id ? modal : null} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); setReload((n) => n + 1); }} />}
    </div>
  );
}

function CertModal({ cert, onClose, onSaved }) {
  const employees = useEmployees(); const editing = !!cert;
  const [f, setF] = useState({ employee: cert?.employee?._id || cert?.employee || '', name: cert?.name || '', type: cert?.type || 'certification', issuingBody: cert?.issuingBody || '', certificateNumber: cert?.certificateNumber || '', issueDate: cert?.issueDate ? cert.issueDate.slice(0, 10) : '', expiryDate: cert?.expiryDate ? cert.expiryDate.slice(0, 10) : '', notes: cert?.notes || '' });
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.employee || !f.name.trim()) { setErr('Employee and name are required.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, issueDate: f.issueDate || null, expiryDate: f.expiryDate || null };
    try {
      let id = cert?._id;
      if (editing) await api.put(`/learning/certifications/${id}`, payload);
      else { const { data } = await api.post('/learning/certifications', payload); id = data._id; }
      if (file) { const fd = new FormData(); fd.append('file', file); await api.post(`/learning/certifications/${id}/file`, fd); }
      onSaved(editing ? 'Certification updated.' : 'Certification added.');
    } catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>{editing ? 'Edit certification' : 'Add certification'}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Lbl>Employee</Lbl>
      <select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} style={{ ...inp(), marginBottom: 12 }}><option value="">Select…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>)}</select>
      <Row2><Field label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="e.g. ACCA, PMP" /><Sel label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={CERT_TYPES} /></Row2>
      <Row2><Field label="Issuing body" value={f.issuingBody} onChange={(v) => setF({ ...f, issuingBody: v })} /><Field label="Certificate no." value={f.certificateNumber} onChange={(v) => setF({ ...f, certificateNumber: v })} /></Row2>
      <Row2><Field label="Issue date" type="date" value={f.issueDate} onChange={(v) => setF({ ...f, issueDate: v })} /><Field label="Expiry date" type="date" value={f.expiryDate} onChange={(v) => setF({ ...f, expiryDate: v })} /></Row2>
      <Lbl>{cert?.file?.url ? 'Replace file (optional)' : 'Certificate file'}</Lbl>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginBottom: 8, fontSize: '.85rem' }} />
      {cert?.file?.url && !file && <div style={{ fontSize: '.78rem', color: C.muted, marginBottom: 12 }}>Current: {cert.file.name}</div>}
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label={editing ? 'Save' : 'Add'} />
    </Overlay>
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
function Card({ title, children }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', overflowX: 'auto' }}>
    {title && <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', marginBottom: 12 }}>{title}</div>}{children}
  </div>;
}
function Empty({ children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted }}>{children}</div>; }
function Overlay({ children, onClose, wide }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 640 : 500, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div>
  </div>;
}
function Drawer({ title, onClose, children }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, height: '100%', background: '#fff', boxShadow: '-14px 0 40px rgba(1,33,88,.25)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.02rem' }}>{title}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>{children}</div>
    </div>
  </div>;
}
function Note({ children, onClose }) { return <div style={{ background: '#eaf5ff', border: '1px solid #cfe6fb', color: '#0b4a8f', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', margin: '16px 0', display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0b4a8f', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>; }
function Field({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>; }
function Sel({ label, value, onChange, options }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><select value={value} onChange={(e) => onChange(e.target.value)} style={inp()}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function Actions({ onClose, onSubmit, busy, label }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}><button onClick={onClose} style={ghostBtn()}>Cancel</button><button onClick={onSubmit} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : label}</button></div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
function h2() { return { color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', fontFamily: 'inherit' }; }
function ctrl() { return { padding: '9px 12px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }; }
function cardBox() { return { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', display: 'flex', flexDirection: 'column', cursor: 'default' }; }
function pill(color) { return { background: color + '12', color, fontWeight: 700, fontSize: '.66rem', padding: '3px 9px', borderRadius: 999 }; }
function chip(on) { return { padding: '5px 10px', borderRadius: 8, border: `1px solid ${on ? C.navy : C.line}`, background: on ? C.navy : '#fff', color: on ? '#fff' : C.ink, fontWeight: 600, fontSize: '.76rem', cursor: 'pointer' }; }
function segBtn(on) { return { padding: '7px 14px', borderRadius: 9, border: `1px solid ${on ? C.navy : C.line}`, background: on ? C.navy : '#fff', color: on ? '#fff' : C.ink, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }; }
function primaryBtn() { return { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer' }; }
function ghostBtn() { return { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer' }; }
function btnGhost() { return { padding: '8px 14px', border: `1px dashed #b9c6da`, borderRadius: 9, background: '#fff', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }; }
function miniBtn(color) { return { padding: '5px 11px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', display: 'inline-block' }; }
function th() { return { textAlign: 'left', padding: '10px 14px', background: '#fafbfd', color: C.muted, fontWeight: 700, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }; }
function td() { return { padding: '10px 14px', fontSize: '.85rem', color: C.ink }; }