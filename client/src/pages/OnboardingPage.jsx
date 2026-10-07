import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { canonicalize, catKeyOf, dedupeCategoryOptions, CANONICAL_FUNCTIONS } from '../utils/orgTaxonomy';
import { UserPlus, ClipboardCheck, ClipboardList, TrendingUp, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { RouteShell, Hero, SubHero, KpiBand, Kpi, Body } from '../ui/kit';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };

const HIRE_RAIL = {
  brand: { title: 'Hire & Onboard', subtitle: 'Recruit to day one', Icon: UserPlus },
  groups: [{ title: 'Pipeline', items: [
    { label: 'Recruitment', to: '/recruitment', Icon: UserPlus },
    { label: 'Onboarding', to: '/onboarding', Icon: ClipboardCheck },
  ] }],
};

// Brand colours anchored to canonical function names; everything else gets a stable hashed colour.
const CAT_COLORS = { 'Human Resources': C.navy, 'Information Technology': C.blue, 'Finance': C.green, 'Management': C.purple, 'Facilities': C.teal, 'Employee': C.orange, 'Operations': C.teal };
const CAT_PALETTE = ['#012158', '#3485E9', '#FD9C09', '#17a2b8', '#7c5cdf', '#1f9d57', '#e5484d', '#0f766e', '#b45309', '#7c3aed', '#0369a1'];
function hashColor(s) { let h = 0; const str = String(s || ''); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return CAT_PALETTE[h % CAT_PALETTE.length]; }
const catMeta = (raw) => { const label = canonicalize(raw) || 'Other'; return [label, CAT_COLORS[label] || hashColor(label)]; };
function useCatOptions() {
  const [depts, setDepts] = useState([]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/org'); if (a) setDepts((data.items || []).map((o) => o.name).filter(Boolean)); } catch { /* */ } })(); return () => { a = false; }; }, []);
  const base = CANONICAL_FUNCTIONS.map((n) => ({ value: n, label: n }));
  const company = depts.map((d) => ({ value: d, label: d }));
  return dedupeCategoryOptions([...base, ...company]);
}
function withCurrentCat(options, current) {
  if (!current || options.some((o) => catKeyOf(o.value) === catKeyOf(current))) return options;
  return [...options, { value: current, label: canonicalize(current) }];
}
const PHASES = [['pre_boarding', 'Pre-boarding'], ['first_day', 'First day'], ['first_week', 'First week'], ['first_month', 'First month'], ['probation', 'Probation'], ['other', 'Other']];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fullName = (e) => e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() : '—';
const isOverdue = (t) => t.status === 'pending' && t.dueDate && new Date(t.dueDate) < new Date();

export default function OnboardingPage() {
  const { user } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const [obFilter, setObFilter] = useState('all');
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const { data } = await api.get('/onboarding'); if (alive) setItems(data.items || []); }
      catch { if (alive) setItems([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);

  if (selected) return <OnboardingDetail id={selected} canWrite={canWrite} onBack={() => { setSelected(null); refresh(); }} setMsg={setMsg} msg={msg} />;

  const active = items.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length;
  const avg = items.length ? Math.round(items.reduce((a, o) => a + (o.progress?.pct || 0), 0) / items.length) : 0;
  const overdue = items.reduce((a, o) => a + (o.progress?.overdue || 0), 0);
  const completed = items.filter((o) => o.status === 'completed').length;
  const shown = obFilter === 'active' ? items.filter((o) => o.status !== 'completed' && o.status !== 'cancelled')
    : obFilter === 'overdue' ? items.filter((o) => (o.progress?.overdue || 0) > 0)
    : obFilter === 'completed' ? items.filter((o) => o.status === 'completed') : items;
  const OB_LABEL = { all: 'All', active: 'In progress', overdue: 'With overdue tasks', completed: 'Completed' };

  return (
    <RouteShell brand={HIRE_RAIL.brand} groups={HIRE_RAIL.groups}>
      <Hero crumbs={['Hire & Onboard', 'Onboarding']} title="Onboarding"
        actions={canWrite && <>
          <HeroBtnGhost onClick={() => setTplOpen(true)}>Templates</HeroBtnGhost>
          <HeroBtnPrimary onClick={() => setAddOpen(true)}><Plus size={16} /> Start onboarding</HeroBtnPrimary>
        </>} />
      <KpiBand>
        <Kpi Icon={ClipboardList} label="In progress" value={loading ? '—' : active} foot={<span>currently onboarding</span>} onClick={() => setObFilter('active')} />
        <Kpi Icon={TrendingUp} iconColor={C.green} iconBg="#e7f6ee" label="Average progress" value={loading ? '—' : avg} unit="%" foot={<span>across active hires</span>} onClick={() => setObFilter('all')} />
        <Kpi Icon={AlertTriangle} iconColor={C.amber} iconBg="#fdf0dc" label="Overdue tasks" value={loading ? '—' : overdue} pill={!loading && overdue ? ['attention', 'amber'] : null} foot={<span>past due date</span>} onClick={() => setObFilter('overdue')} />
        <Kpi Icon={CheckCircle2} iconColor={C.navy} iconBg="#eef1f6" label="Completed" value={loading ? '—' : completed} foot={<span>confirmed hires</span>} onClick={() => setObFilter('completed')} />
      </KpiBand>
      <Body>
        <div>
          {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
          {obFilter !== 'all' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}><span style={{ fontSize: '.82rem', fontWeight: 700, color: C.navy }}>Filtered: {OB_LABEL[obFilter]} · {shown.length}</span><button onClick={() => setObFilter('all')} style={{ border: `1px solid ${C.line}`, background: '#fff', color: C.blue, fontWeight: 700, fontSize: '.78rem', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>Clear ✕</button></div>}
          {loading ? <div style={{ color: C.muted, padding: 20 }}>Loading…</div>
            : shown.length === 0 ? <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted }}>{items.length === 0 ? <>No one is onboarding right now.{canWrite && ' Click “Start onboarding”.'}</> : 'No hires match this filter.'}</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {shown.map((o) => (
                    <div key={o._id} onClick={() => setSelected(o._id)} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div><div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{fullName(o.employee)}</div>
                          <div style={{ color: C.muted, fontSize: '.78rem', marginTop: 2 }}>{o.employee?.staffId ? `${o.employee.staffId} · ` : ''}{o.employee?.employment?.jobTitle || '—'}</div></div>
                        <StatusPill status={o.status} />
                      </div>
                      {o.program && <div style={{ fontSize: '.72rem', color: C.blue, marginTop: 6, fontWeight: 700 }}>{o.program}</div>}
                      <div style={{ marginTop: 12 }}>
                        <ProgressBar pct={o.progress?.pct || 0} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '.74rem', color: C.muted }}>
                          <span>{o.progress?.tasksDone || 0}/{o.progress?.tasksTotal || 0} tasks</span>
                          {o.progress?.overdue > 0 ? <span style={{ color: C.red, fontWeight: 700 }}>{o.progress.overdue} overdue</span> : <span>{o.progress?.docsReceived || 0}/{o.progress?.docsTotal || 0} docs</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
      </Body>
      {addOpen && <AddModal onClose={() => setAddOpen(false)} onSaved={(m, id) => { setAddOpen(false); setMsg(m); if (id) setSelected(id); else refresh(); }} />}
      {tplOpen && <TemplatesManager onClose={() => setTplOpen(false)} setMsg={setMsg} />}
    </RouteShell>
  );
}

/* ============================ DETAIL ============================ */
function OnboardingDetail({ id, canWrite, onBack, setMsg, msg }) {
  const [o, setO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [taskModal, setTaskModal] = useState(null);
  const [newDoc, setNewDoc] = useState({ name: '', required: false });
  const [prob, setProb] = useState({ review: 'pending', note: '', endDate: '' });
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/onboarding/${id}`); setO(data);
    setProb((p) => ({ ...p, review: data.probation?.review || 'pending', note: data.probation?.note || '', endDate: data.probation?.endDate ? data.probation.endDate.slice(0, 10) : '' }));
  }, [id]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try { await load(); }
      catch { if (alive) setErr('Could not load onboarding.'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [load]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  async function call(fn, okMsg) { setBusy(true); setErr(''); try { await fn(); await load(); setToast({ ok: true, text: okMsg || 'Saved' }); } catch (e) { const m = e?.response?.data?.message || 'Action failed.'; setErr(m); setToast({ ok: false, text: m }); } finally { setBusy(false); } }
  const toggleTask = (t) => call(() => api.put(`/onboarding/${id}/tasks/${t._id}`, { status: t.status === 'done' ? 'pending' : 'done' }));
  const naTask = (t) => call(() => api.put(`/onboarding/${id}/tasks/${t._id}`, { status: t.status === 'na' ? 'pending' : 'na' }));
  const delTask = (t) => call(() => api.delete(`/onboarding/${id}/tasks/${t._id}`));
  const saveTask = (t) => { setTaskModal(null); if (t._id) call(() => api.put(`/onboarding/${id}/tasks/${t._id}`, t), 'Task updated.'); else call(() => api.post(`/onboarding/${id}/tasks`, t), 'Task added.'); };
  const toggleDoc = (d) => call(() => api.put(`/onboarding/${id}/documents/${d._id}`, { received: !d.received }));
  const delDoc = (d) => call(() => api.delete(`/onboarding/${id}/documents/${d._id}`));
  const addDoc = () => { if (!newDoc.name.trim()) return; call(() => api.post(`/onboarding/${id}/documents`, newDoc).then(() => setNewDoc({ name: '', required: false })), 'Document added.'); };
  const saveProb = () => call(() => api.post(`/onboarding/${id}/probation`, prob), prob.review === 'passed' ? 'Probation passed — employee confirmed.' : 'Probation updated.');
  async function uploadDoc(d, e) { const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); call(() => api.post(`/onboarding/${id}/documents/${d._id}/file`, fd), 'File uploaded.'); }
  const complete = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/onboarding/${id}/complete`); await load(); setToast({ ok: true, text: 'Onboarding marked complete.' }); }
    catch (e) { const m = e?.response?.data?.message || 'Could not complete.'; if (e?.response?.status === 409 && window.confirm(`${m}\n\nComplete anyway (override)?`)) { try { await api.post(`/onboarding/${id}/complete`, { force: true }); await load(); setToast({ ok: true, text: 'Onboarding force-completed.' }); } catch (e2) { setErr(e2?.response?.data?.message || 'Could not complete.'); } } else { setErr(m); setToast({ ok: false, text: m }); } }
    finally { setBusy(false); }
  };

  if (loading) return <RouteShell brand={HIRE_RAIL.brand} groups={HIRE_RAIL.groups}><Body><div style={{ color: C.muted, padding: 8 }}>Loading…</div></Body></RouteShell>;
  if (!o) return <RouteShell brand={HIRE_RAIL.brand} groups={HIRE_RAIL.groups}><Body><div style={{ color: C.red, padding: 8 }}>{err || 'Not found.'}</div></Body></RouteShell>;

  const done = o.status === 'completed';
  const tasksByPhase = PHASES.map(([k, label]) => ({ key: k, label, tasks: (o.tasks || []).filter((t) => (t.phase || 'other') === k) })).filter((p) => p.tasks.length);
  const meta = `${o.employee?.staffId ? `${o.employee.staffId} · ` : ''}${o.employee?.employment?.jobTitle || '—'} · Start ${fmtDate(o.startDate)}${o.program ? ` · ${o.program}` : ''}${o.buddy ? ` · Buddy: ${fullName(o.buddy)}` : ''}`;

  return (
    <RouteShell brand={HIRE_RAIL.brand} groups={HIRE_RAIL.groups}>
      <SubHero onBack={onBack} backLabel="All onboarding" crumbs={['Onboarding', fullName(o.employee)]}
        title={fullName(o.employee)} statusEl={<StatusPill status={o.status} />} meta={meta} />
      <Body>
        <div>
          {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
          {err && <ErrBox>{err}</ErrBox>}

          {/* summary */}
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.76rem', color: C.muted, fontWeight: 600, marginBottom: 5 }}><span>Overall progress</span><span>{o.progress?.pct || 0}%{o.progress?.overdue > 0 && <span style={{ color: C.red, fontWeight: 700 }}> · {o.progress.overdue} overdue</span>}</span></div>
              <ProgressBar pct={o.progress?.pct || 0} />
            </div>
            {canWrite && !done && <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setTaskModal({ phase: 'first_week' })} style={{ ...btnGhost(), padding: '9px 14px' }}>+ Add task</button>
              <button onClick={complete} disabled={busy} style={{ padding: '9px 16px', border: 'none', borderRadius: 9, background: C.green, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>✓ Mark complete</button>
            </div>}
          </div>

          {tasksByPhase.map((p) => {
            const ph = o.progress?.phases?.[p.key] || { total: 0, done: 0 };
            return (
              <div key={p.key} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h2 style={{ color: C.navy, fontSize: '.98rem', fontWeight: 800, margin: 0 }}>{p.label}</h2>
                  <span style={{ fontSize: '.76rem', color: C.muted, fontWeight: 700 }}>{ph.done}/{ph.total || p.tasks.length}</span>
                </div>
                <div style={{ marginBottom: 12 }}><ProgressBar pct={ph.total ? Math.round((ph.done / ph.total) * 100) : 0} /></div>
                {p.tasks.map((t) => {
                  const [clabel, ccolor] = catMeta(t.category); const over = isOverdue(t);
                  return (
                    <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: `1px solid ${C.line}` }}>
                      <button onClick={() => canWrite && toggleTask(t)} disabled={!canWrite || busy} title="Toggle done" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, cursor: canWrite ? 'pointer' : 'default', border: `2px solid ${t.status === 'done' ? C.green : over ? C.red : C.line}`, background: t.status === 'done' ? C.green : '#fff', color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{t.status === 'done' ? '✓' : ''}</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.9rem', fontWeight: 600, color: t.status === 'na' ? C.muted : C.ink, textDecoration: t.status === 'na' ? 'line-through' : 'none' }}>{t.title}</div>
                        <div style={{ fontSize: '.72rem', color: over ? C.red : C.muted, marginTop: 2, fontWeight: over ? 700 : 400 }}>{t.owner || clabel}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}${over ? ' (overdue)' : ''}` : ''}{t.assignee ? ` · ${fullName(t.assignee)}` : ''}</div>
                      </div>
                      <span style={{ background: ccolor + '18', color: ccolor, fontWeight: 700, fontSize: '.64rem', padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase' }}>{clabel}</span>
                      {canWrite && <>
                        <button onClick={() => setTaskModal(t)} disabled={busy} style={miniBtn(C.muted)}>Edit</button>
                        <button onClick={() => naTask(t)} disabled={busy} title="Not applicable" style={miniBtn(C.muted)}>{t.status === 'na' ? 'Undo' : 'N/A'}</button>
                        <button onClick={() => delTask(t)} disabled={busy} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>
                      </>}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <Section title="Documents" sub={`${o.progress?.docsReceived || 0} of ${o.progress?.docsTotal || 0} received`}>
            {(o.documents || []).map((d) => (
              <div key={d._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', borderBottom: `1px solid ${C.line}` }}>
                <button onClick={() => canWrite && toggleDoc(d)} disabled={!canWrite || busy} style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, cursor: canWrite ? 'pointer' : 'default', border: `2px solid ${d.received ? C.green : C.line}`, background: d.received ? C.green : '#fff', color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{d.received ? '✓' : ''}</button>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '.9rem', fontWeight: 600, color: C.ink }}>{d.name} {d.required && <span style={{ color: C.red, fontSize: '.7rem', fontWeight: 700 }}>· required</span>}</div>{d.file?.url && <a href={d.file.url} target="_blank" rel="noreferrer" style={{ fontSize: '.74rem', color: C.blue, fontWeight: 700 }}>📎 {d.file.name || 'View file'}</a>}</div>
                {canWrite && <><label style={{ ...miniBtn(C.blue), cursor: 'pointer' }}>{d.file?.url ? 'Replace' : 'Upload'}<input type="file" onChange={(e) => uploadDoc(d, e)} style={{ display: 'none' }} /></label><button onClick={() => delDoc(d)} disabled={busy} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button></>}
              </div>
            ))}
            {canWrite && !done && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14, background: C.panel, padding: 12, borderRadius: 10 }}>
              <div style={{ flex: '2 1 220px' }}><Lbl>New document</Lbl><input value={newDoc.name} onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })} placeholder="Document name" style={inp()} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: C.ink, marginBottom: 8 }}><input type="checkbox" checked={newDoc.required} onChange={(e) => setNewDoc({ ...newDoc, required: e.target.checked })} /> Required</label>
              <button onClick={addDoc} disabled={busy || !newDoc.name.trim()} style={{ ...btnPrimary(), height: 38 }}>Add</button>
            </div>}
          </Section>

          <Section title="Probation" sub={o.probation?.endDate ? `Ends ${fmtDate(o.probation.endDate)}` : 'No end date set'}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 150px' }}><Lbl>Probation end date</Lbl><input type="date" value={prob.endDate} onChange={(e) => setProb({ ...prob, endDate: e.target.value })} style={inp()} disabled={!canWrite} /></div>
              <div style={{ flex: '1 1 160px' }}><Lbl>Review outcome</Lbl><select value={prob.review} onChange={(e) => setProb({ ...prob, review: e.target.value })} style={inp()} disabled={!canWrite}><option value="pending">Pending</option><option value="passed">Passed — confirm employee</option><option value="failed">Failed</option><option value="extended">Extended</option></select></div>
              <div style={{ flex: '2 1 220px' }}><Lbl>Note</Lbl><input value={prob.note} onChange={(e) => setProb({ ...prob, note: e.target.value })} style={inp()} disabled={!canWrite} /></div>
              {canWrite && <button onClick={saveProb} disabled={busy} style={{ ...btnPrimary(), height: 38, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>}
            </div>
            {o.probation?.review && o.probation.review !== 'pending' && <div style={{ marginTop: 12, fontSize: '.82rem', color: o.probation.review === 'passed' ? C.green : o.probation.review === 'failed' ? C.red : C.orange, fontWeight: 700, textTransform: 'capitalize' }}>Outcome: {o.probation.review}{o.probation.decidedAt ? ` · ${fmtDate(o.probation.decidedAt)}` : ''}</div>}
          </Section>
        </div>
      </Body>

      {taskModal && <TaskModal task={taskModal} onClose={() => setTaskModal(null)} onSave={saveTask} />}
      {toast && <div style={{ position: 'fixed', right: 20, bottom: 20, background: toast.ok ? '#e4f7ec' : '#fdecec', color: toast.ok ? C.green : C.red, border: `1px solid ${toast.ok ? '#b7e4c7' : '#f6c9cb'}`, padding: '11px 16px', borderRadius: 10, fontWeight: 700, fontSize: '.85rem', boxShadow: '0 8px 24px rgba(1,33,88,.18)', zIndex: 200 }}>{toast.ok ? '✓ ' : '⚠ '}{toast.text}</div>}
    </RouteShell>
  );
}

/* ============================ ADD MODAL ============================ */
function AddModal({ onClose, onSaved }) {
  const [employees, setEmployees] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [f, setF] = useState({ employee: '', startDate: '', template: '', buddy: '', seedDefaults: true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get('/employees', { params: { status: 'active', limit: 500 } }); setEmployees(data.items || []); } catch { /* */ }
      try { const { data } = await api.get('/onboarding/templates'); setTemplates(data.items || []); } catch { /* */ }
    })();
  }, []);
  async function submit() {
    if (!f.employee) { setErr('Choose an employee.'); return; }
    setBusy(true); setErr('');
    const payload = { employee: f.employee, startDate: f.startDate || undefined, buddy: f.buddy || undefined };
    if (f.template) payload.template = f.template; else payload.seedDefaults = f.seedDefaults;
    try { const { data } = await api.post('/onboarding', payload); onSaved('Onboarding started.', data._id); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not start onboarding.'); } finally { setBusy(false); }
  }
  const empName = (e) => `${fullName(e)}${e.staffId ? ` · ${e.staffId}` : ''}`;
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>Start onboarding</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Employee</Lbl><select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} style={inp()}><option value="">— Select an employee —</option>{employees.map((e) => <option key={e._id} value={e._id}>{empName(e)}</option>)}</select></label>
      <Row2>
        <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Start date</Lbl><input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} style={inp()} /></label>
        <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Buddy / mentor</Lbl><select value={f.buddy} onChange={(e) => setF({ ...f, buddy: e.target.value })} style={inp()}><option value="">— None —</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></label>
      </Row2>
      <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Onboarding program</Lbl>
        <select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} style={inp()}>
          <option value="">Standard checklist (built-in)</option>
          {templates.map((t) => <option key={t._id} value={t._id}>{t.name} ({t.taskCount} tasks)</option>)}
        </select>
      </label>
      {!f.template && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, marginBottom: 16 }}><input type="checkbox" checked={f.seedDefaults} onChange={(e) => setF({ ...f, seedDefaults: e.target.checked })} /> Pre-fill the standard phased checklist &amp; documents</label>}
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label="Start onboarding" />
    </Overlay>
  );
}

/* ============================ TASK MODAL ============================ */
function TaskModal({ task, onClose, onSave }) {
  const [f, setF] = useState({ _id: task._id, title: task.title || '', category: canonicalize(task.category) || 'Employee', phase: task.phase || 'first_week', owner: task.owner || '', dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '' });
  const [err, setErr] = useState('');
  const catOptions = useCatOptions();
  const withCurrent = withCurrentCat(catOptions, f.category);
  function submit() { if (!f.title.trim()) { setErr('Title is required.'); return; } onSave({ ...f, category: canonicalize(f.category) || 'Employee', dueDate: f.dueDate || null }); }
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>{task._id ? 'Edit task' : 'Add task'}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Task" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
      <Row2>
        <div><Lbl>Phase</Lbl><select value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value })} style={inp()}>{PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><Lbl>Category / function</Lbl><select value={canonicalize(f.category)} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp()}>{withCurrent.map((o) => <option key={o.value} value={canonicalize(o.value)}>{o.label}</option>)}</select></div>
      </Row2>
      <Row2>
        <Field label="Owner" value={f.owner} onChange={(v) => setF({ ...f, owner: v })} placeholder="e.g. IT" />
        <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Due date</Lbl><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} style={inp()} /></label>
      </Row2>
      <Actions onClose={onClose} onSubmit={submit} label={task._id ? 'Save task' : 'Add task'} />
    </Overlay>
  );
}

/* ============================ TEMPLATES ============================ */
function TemplatesManager({ onClose, setMsg }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/onboarding/templates'); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } finally { if (a) setLoading(false); } })(); return () => { a = false; }; }, [reload]);
  async function del(t) { if (!window.confirm(`Delete template "${t.name}"?`)) return; try { await api.delete(`/onboarding/templates/${t._id}`); setReload((n) => n + 1); setMsg('Template deleted.'); } catch { /* */ } }

  if (editing) return <TemplateEditor tpl={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setReload((n) => n + 1); setMsg('Template saved.'); }} />;

  return (
    <Overlay onClose={onClose} wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ ...h2(), margin: 0 }}>Onboarding programs</h2>
        <button onClick={() => setEditing({ tasks: [], documents: [] })} style={btnPrimary()}>+ New program</button>
      </div>
      {loading ? <div style={{ color: C.muted, padding: 20 }}>Loading…</div>
        : items.length === 0 ? <div style={{ color: C.muted, padding: 20 }}>No programs yet. Create one to reuse across hires.</div>
          : items.map((t) => (
            <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', borderTop: `1px solid ${C.line}` }}>
              <div><div style={{ fontWeight: 700, color: C.navy }}>{t.name}</div><div style={{ fontSize: '.76rem', color: C.muted }}>{t.appliesTo ? `${t.appliesTo} · ` : ''}{t.taskCount} tasks · {t.docCount} docs</div></div>
              <div style={{ display: 'flex', gap: 8 }}><button onClick={() => setEditing(t)} style={miniBtn(C.blue)}>Edit</button><button onClick={() => del(t)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button></div>
            </div>
          ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button onClick={onClose} style={btnGhost()}>Close</button></div>
    </Overlay>
  );
}
function TemplateEditor({ tpl, onClose, onSaved }) {
  const editing = !!tpl._id;
  const [full, setFull] = useState(editing ? null : tpl);
  const [f, setF] = useState({ name: tpl.name || '', description: tpl.description || '', appliesTo: tpl.appliesTo || '' });
  const [tasks, setTasks] = useState(tpl.tasks || []);
  const [docs, setDocs] = useState(tpl.documents || []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const catOptions = useCatOptions();
  useEffect(() => { if (editing) (async () => { try { const { data } = await api.get(`/onboarding/templates/${tpl._id}`); setFull(data); setF({ name: data.name, description: data.description || '', appliesTo: data.appliesTo || '' }); setTasks(data.tasks || []); setDocs(data.documents || []); } catch { setErr('Could not load template.'); } })(); }, [editing, tpl._id]);
  const setTask = (i, k, v) => setTasks(tasks.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const addTask = () => setTasks([...tasks, { title: '', category: 'Human Resources', phase: 'first_week', owner: '', dueOffsetDays: '' }]);
  const setDocRow = (i, k, v) => setDocs(docs.map((d, j) => j === i ? { ...d, [k]: v } : d));
  async function save() {
    if (!f.name.trim()) { setErr('A name is required.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, tasks: tasks.filter((t) => t.title.trim()).map((t) => ({ title: t.title, category: t.category, phase: t.phase, owner: t.owner, dueOffsetDays: t.dueOffsetDays === '' || t.dueOffsetDays == null ? null : Number(t.dueOffsetDays) })), documents: docs.filter((d) => d.name.trim()).map((d) => ({ name: d.name, required: !!d.required })) };
    try { if (editing) await api.put(`/onboarding/templates/${tpl._id}`, payload); else await api.post('/onboarding/templates', payload); onSaved(); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  if (editing && !full) return <Overlay onClose={onClose} wide><div style={{ color: C.muted, padding: 20 }}>Loading…</div></Overlay>;
  return (
    <Overlay onClose={onClose} wide>
      <h2 style={h2()}>{editing ? 'Edit program' : 'New program'}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Row2><Field label="Program name" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="e.g. Field Worker Onboarding" /><Field label="Applies to" value={f.appliesTo} onChange={(v) => setF({ ...f, appliesTo: v })} placeholder="role / department" /></Row2>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '.85rem', margin: '8px 0 8px' }}>Tasks</div>
      {tasks.map((t, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr .9fr .9fr .7fr auto', gap: 6, alignItems: 'end', marginBottom: 6 }}>
          <div><input value={t.title} onChange={(e) => setTask(i, 'title', e.target.value)} placeholder="Task title" style={inp()} /></div>
          <select value={t.phase} onChange={(e) => setTask(i, 'phase', e.target.value)} style={inp()}>{PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={canonicalize(t.category)} onChange={(e) => setTask(i, 'category', e.target.value)} style={inp()}>{withCurrentCat(catOptions, t.category).map((o) => <option key={o.value} value={canonicalize(o.value)}>{o.label}</option>)}</select>
          <input type="number" value={t.dueOffsetDays ?? ''} onChange={(e) => setTask(i, 'dueOffsetDays', e.target.value)} placeholder="±d" title="Due date offset in days from start" style={inp()} />
          <button onClick={() => setTasks(tasks.filter((_, j) => j !== i))} style={{ ...miniBtn(C.red), border: 'none', height: 36 }}>✕</button>
        </div>
      ))}
      <button onClick={addTask} style={{ ...btnGhost(), marginBottom: 14 }}>+ Add task</button>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '.85rem', margin: '4px 0 8px' }}>Documents</div>
      {docs.map((d, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr auto auto', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input value={d.name} onChange={(e) => setDocRow(i, 'name', e.target.value)} placeholder="Document name" style={inp()} />
          <label style={{ fontSize: '.8rem', color: C.ink, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={!!d.required} onChange={(e) => setDocRow(i, 'required', e.target.checked)} /> Required</label>
          <button onClick={() => setDocs(docs.filter((_, j) => j !== i))} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>
        </div>
      ))}
      <button onClick={() => setDocs([...docs, { name: '', required: false }])} style={{ ...btnGhost(), marginBottom: 16 }}>+ Add document</button>
      <Actions onClose={onClose} onSubmit={save} busy={busy} label={editing ? 'Save program' : 'Create program'} />
    </Overlay>
  );
}

/* ============================ shared ============================ */
function HeroBtnGhost({ children, onClick }) { return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 10, fontWeight: 700, fontSize: '.83rem', padding: '10px 16px', cursor: 'pointer', border: '1px solid rgba(255,255,255,.9)', background: 'rgba(255,255,255,.72)', color: C.navy }}>{children}</button>; }
function HeroBtnPrimary({ children, onClick }) { return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 10, fontWeight: 700, fontSize: '.83rem', padding: '10px 16px', cursor: 'pointer', border: 'none', background: C.navy, color: '#fff', boxShadow: '0 4px 14px rgba(1,33,88,.28)' }}>{children}</button>; }
function Section({ title, sub, children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}><div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ color: C.navy, fontSize: '.98rem', fontWeight: 800, margin: 0 }}>{title}</h2>{sub && <span style={{ color: C.muted, fontSize: '.76rem' }}>{sub}</span>}</div>{children}</div>; }
function ProgressBar({ pct = 0 }) { return <div style={{ height: 8, background: '#e9eef5', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? C.green : C.blue, borderRadius: 999, transition: 'width .3s' }} /></div>; }
function StatusPill({ status }) { const map = { not_started: ['#eef1f6', '#8a94a6'], in_progress: ['#eaf2fd', '#1f6fd6'], completed: ['#e4f7ec', '#1f9d57'], cancelled: ['#fdecec', '#e5484d'] }; const [bg, col] = map[status] || ['#eef1f6', '#8a94a6']; return <span style={{ background: bg, color: col, fontWeight: 700, fontSize: '.68rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize' }}>{(status || '').replace('_', ' ')}</span>; }
function Overlay({ children, onClose, wide }) { return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}><div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 680 : 480, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div></div>; }
function Note({ children, onClose }) { return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0f3d78', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
function Field({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>; }
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function Actions({ onClose, onSubmit, busy, label }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}><button onClick={onClose} style={btnGhost()}>Cancel</button><button onClick={onSubmit} disabled={busy} style={btnPrimary()}>{busy ? 'Saving…' : label}</button></div>; }
function h2() { return { color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.88rem', color: C.ink, background: '#fff', fontFamily: 'inherit' }; }
function btnPrimary() { return { padding: '9px 16px', border: 'none', borderRadius: 9, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function btnGhost() { return { padding: '9px 14px', border: '1px solid #d8e0ec', borderRadius: 9, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function miniBtn(color) { return { padding: '4px 10px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.72rem', cursor: 'pointer' }; }