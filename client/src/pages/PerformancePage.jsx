import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ModuleShell } from '../ui/kit';
import {
  LayoutDashboard, CalendarRange, Plus, TrendingUp, CheckCircle2, Clock,
  UserCheck, ListChecks, ChevronRight, ChevronLeft,
} from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Performance';

const REVIEW_STATUS = {
  draft: ['Draft', '#8a94a6'], self_submitted: ['Self done', C.blue], manager_review: ['Manager review', C.orange],
  completed: ['Completed', C.teal], acknowledged: ['Acknowledged', C.green],
};
const rsMeta = (k) => REVIEW_STATUS[k] || [k, C.muted];
const CYCLE_TYPES = ['annual', 'half_year', 'quarter', 'probation', 'project'];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fullName = (e) => e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() : '—';

/* ============================ ROOT ============================ */
export default function PerformancePage() {
  const { user } = useAuth();
  const canCycles = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('overview');
  const [cycle, setCycle] = useState(null);        // selected cycle id
  const [reviewId, setReviewId] = useState(null);  // selected review id
  const [cycleFilter, setCycleFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { data } = await api.get('/performance/cycles'); if (alive) setCycles(data.items || []); }
      catch { if (alive) setCycles([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);

  const groups = [
    { title: 'Appraisals', items: [
      { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
      { key: 'cycles', label: 'Appraisal Cycles', Icon: CalendarRange, count: cycles.length },
    ] },
  ];

  function pickSection(k) { setReviewId(null); setCycle(null); setCycleFilter('all'); setSection(k); }
  function drill(flt) { setCycleFilter(flt || 'all'); setReviewId(null); setCycle(null); setSection('cycles'); }

  let content;
  if (reviewId) content = <ReviewEditor id={reviewId} onBack={() => setReviewId(null)} setMsg={setMsg} />;
  else if (cycle) content = <CycleDetail cycleId={cycle} canManage={canCycles} onOpenReview={setReviewId} onBack={() => { setCycle(null); refresh(); }} setMsg={setMsg} msg={msg} />;
  else if (section === 'overview') content = <Overview cycles={cycles} loading={loading} canCycles={canCycles} onDrill={drill} onNew={() => setModal({ mode: 'add' })} />;
  else content = <CyclesList cycles={cycles} loading={loading} canCycles={canCycles} filter={cycleFilter} setFilter={setCycleFilter} onOpen={setCycle} onNew={() => setModal({ mode: 'add' })} />;

  return (
    <ModuleShell brand={{ title: 'Performance', subtitle: 'Appraisals & reviews', Icon: TrendingUp }} groups={groups} active={reviewId || cycle ? 'cycles' : section} onSelect={pickSection}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
        {content}
      </div>
      {modal && <CycleModal mode={modal.mode} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); refresh(); }} />}
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function Hero({ crumbs, title, subtitle, action, onBack, backLabel }) {
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '20px 30px 26px', position: 'relative' }}>
      {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 8, color: C.navy, fontWeight: 700, fontSize: '.78rem', padding: '5px 11px', cursor: 'pointer', marginBottom: 12 }}><ChevronLeft size={14} /> {backLabel || 'Back'}</button>}
      {crumbs && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8 }}>{MODULE} <span style={{ opacity: .6 }}>›</span> <span>{crumbs}</span></div>}
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
function AddBtn({ onClick, children }) {
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(1,33,88,.22)' }}><Plus size={16} /> {children}</button>;
}

/* ============================ OVERVIEW (KPI drill-downs) ============================ */
function Overview({ cycles, loading, canCycles, onDrill, onNew }) {
  const agg = cycles.reduce((a, c) => {
    const r = c.reviews || {};
    a.total += r.total || 0; a.completed += (r.completed || 0) + (r.acknowledged || 0);
    a.selfPending += r.draft || 0; a.mgrPending += (r.self_submitted || 0) + (r.manager_review || 0);
    if (c.status === 'active') a.active += 1;
    return a;
  }, { total: 0, completed: 0, selfPending: 0, mgrPending: 0, active: 0 });
  const pct = agg.total ? Math.round((agg.completed / agg.total) * 100) : 0;

  return (
    <div>
      <Hero crumbs="Overview" title="Performance Overview" 
        action={canCycles && <AddBtn onClick={onNew}>New Cycle</AddBtn>} />
      {loading ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
            <DrillKpi Icon={CalendarRange} label="Appraisal cycles" value={cycles.length} sub="all cycles" color={C.navy} onClick={() => onDrill('all')} />
            <DrillKpi Icon={Clock} label="Active cycles" value={agg.active} sub="currently running" color={agg.active ? C.orange : C.muted} onClick={() => onDrill('active')} />
            <DrillKpi Icon={ListChecks} label="Reviews generated" value={agg.total} sub="across all cycles" color={C.blue} onClick={() => onDrill('all')} />
            <DrillKpi Icon={TrendingUp} label="Completion rate" value={`${pct}%`} sub={`${agg.completed}/${agg.total} done`} color={pct >= 80 ? C.green : pct >= 50 ? C.orange : C.red} bar={pct} onClick={() => onDrill('all')} />
            <DrillKpi Icon={UserCheck} label="Awaiting self-assessment" value={agg.selfPending} sub="not yet submitted" color={agg.selfPending ? C.orange : C.green} onClick={() => onDrill('active')} />
            <DrillKpi Icon={CheckCircle2} label="Awaiting manager review" value={agg.mgrPending} sub="pending manager" color={agg.mgrPending ? C.orange : C.green} onClick={() => onDrill('active')} />
          </div>

          <Card title="Recent cycles" sub="Click a cycle to open its reviews">
            {cycles.length === 0 ? <Empty>No appraisal cycles yet. {canCycles && 'Create one to start reviews.'}</Empty> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {cycles.slice(0, 6).map((c) => { const done = (c.reviews?.completed || 0) + (c.reviews?.acknowledged || 0); const tot = c.reviews?.total || 0; const p = tot ? Math.round((done / tot) * 100) : 0; return (
                  <button key={c._id} onClick={() => onDrill(c.status)} className="nx-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem' }}>{c.name}</div>
                      <div style={{ color: C.muted, fontSize: '.76rem', textTransform: 'capitalize', marginTop: 2 }}>{c.type?.replace('_', ' ')}{c.periodLabel ? ` · ${c.periodLabel}` : ''} · {tot} review(s)</div>
                    </div>
                    <div style={{ width: 120, height: 7, background: '#e8edf5', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: p >= 80 ? C.green : C.blue }} /></div>
                    <span style={{ width: 38, textAlign: 'right', fontWeight: 800, color: C.navy, fontSize: '.82rem' }}>{p}%</span>
                    <ChevronRight size={16} color={C.muted} />
                  </button>
                ); })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ============================ CYCLES LIST ============================ */
function CyclesList({ cycles, loading, canCycles, filter, setFilter, onOpen, onNew }) {
  const FILTERS = [['all', 'All'], ['draft', 'Draft'], ['active', 'Active'], ['closed', 'Closed']];
  const shown = filter === 'all' ? cycles : cycles.filter((c) => c.status === filter);
  return (
    <div>
      <Hero crumbs="Appraisal Cycles" title="Appraisal Cycles" subtitle={`${cycles.length} cycle${cycles.length === 1 ? '' : 's'} · review windows across the workforce`}
        action={canCycles && <AddBtn onClick={onNew}>New Cycle</AddBtn>} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(([v, l]) => <button key={v} onClick={() => setFilter(v)} style={segBtn(filter === v)}>{l}</button>)}
      </div>
      {loading ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div>
        : shown.length === 0 ? <Empty>No {filter === 'all' ? '' : filter + ' '}cycles. {canCycles && filter === 'all' && 'Create one to start reviews.'}</Empty>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {shown.map((c) => (
              <div key={c._id} className="pf-card" onClick={() => onOpen(c._id)} style={cardBox()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{c.name}</div>
                  <StatusPill status={c.status} map={{ draft: ['#eef1f6', '#8a94a6'], active: ['#e4f7ec', '#1f9d57'], closed: ['#eaf2fd', '#1f6fd6'] }} />
                </div>
                <div style={{ color: C.muted, fontSize: '.78rem', margin: '4px 0 12px', textTransform: 'capitalize' }}>
                  {c.type?.replace('_', ' ')}{c.periodLabel ? ` · ${c.periodLabel}` : ''}{c.startDate ? ` · ${fmtDate(c.startDate)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Mini label="Reviews" value={c.reviews?.total || 0} />
                  <Mini label="Completed" value={(c.reviews?.completed || 0) + (c.reviews?.acknowledged || 0)} accent={C.green} />
                  <Mini label="In progress" value={(c.reviews?.self_submitted || 0) + (c.reviews?.manager_review || 0) + (c.reviews?.draft || 0)} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 5, color: C.blue, fontWeight: 700, fontSize: '.78rem' }}>Open reviews <ChevronRight size={14} /></div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/* ============================ CYCLE DETAIL ============================ */
function CycleDetail({ cycleId, canManage, onOpenReview, onBack, setMsg, msg }) {
  const [cycle, setCycle] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const { data } = await api.get(`/performance/cycles/${cycleId}`); if (alive) setCycle(data); } catch { /* */ }
      try { const { data } = await api.get('/performance/reviews', { params: { cycle: cycleId } }); if (alive) setReviews(data.items || []); }
      catch { if (alive) setReviews([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [cycleId, reload]);

  async function generate() {
    setBusy(true); setErr('');
    try { const { data } = await api.post(`/performance/cycles/${cycleId}/generate`); setMsg(data.message); refresh(); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not generate reviews.'); }
    finally { setBusy(false); }
  }

  const meta = cycle ? `${(cycle.type || '').replace('_', ' ')}${cycle.periodLabel ? ` · ${cycle.periodLabel}` : ''} · rating out of ${cycle.ratingMax}${cycle.startDate ? ` · ${fmtDate(cycle.startDate)}` : ''}${cycle.endDate ? ` – ${fmtDate(cycle.endDate)}` : ''}` : '';

  return (
    <div>
      <Hero onBack={onBack} backLabel="All cycles" crumbs={<>Appraisal Cycles <span style={{ opacity: .6 }}>›</span> {cycle?.name || 'Cycle'}</>} title={cycle?.name || 'Cycle'} subtitle={meta}
        action={canManage && cycle && <button onClick={generate} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(1,33,88,.22)' }}>{busy ? 'Generating…' : '⚡ Generate reviews'}</button>} />
      {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
      {err && <ErrBox>{err}</ErrBox>}

      {loading ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div> : !cycle ? <div style={{ color: C.red, padding: 40 }}>Could not load cycle.</div> : (
        <>
          {cycle.instructions && <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: C.ink, fontSize: '.85rem', lineHeight: 1.5 }}>{cycle.instructions}</div>}
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Employee', 'Manager', 'Self', 'Manager', 'Status', ''].map((h, i) => <th key={i} style={th()}>{h}</th>)}</tr></thead>
              <tbody>
                {reviews.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: C.muted, padding: 34 }}>No reviews yet. Click “Generate reviews” to create one per active employee.</td></tr>}
                {reviews.map((r, i) => {
                  const [slabel, scolor] = rsMeta(r.status);
                  return (
                    <tr key={r._id} onClick={() => onOpenReview(r._id)} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff', cursor: 'pointer' }}>
                      <td style={td()}>{fullName(r.employee)}{r.employee?.staffId ? <span style={{ color: C.muted }}> · {r.employee.staffId}</span> : ''}</td>
                      <td style={td()}>{fullName(r.manager)}</td>
                      <td style={{ ...td(), fontWeight: 700 }}>{r.overall?.selfRating ?? '—'}</td>
                      <td style={{ ...td(), fontWeight: 700 }}>{r.overall?.managerRating ?? '—'}</td>
                      <td style={td()}><span style={{ background: scolor + '1f', color: scolor, fontWeight: 700, fontSize: '.7rem', padding: '3px 10px', borderRadius: 999 }}>{slabel}</span></td>
                      <td style={{ ...td(), textAlign: 'right' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.blue, fontWeight: 700, fontSize: '.8rem' }}>Open <ChevronRight size={14} /></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ REVIEW EDITOR ============================ */
function ReviewEditor({ id, onBack, setMsg }) {
  const [r, setR] = useState(null);
  const [goals, setGoals] = useState([]);
  const [comps, setComps] = useState([]);
  const [selfComments, setSelfComments] = useState('');
  const [managerComments, setManagerComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data } = await api.get(`/performance/reviews/${id}`);
    setR(data); setGoals(data.goals || []); setComps(data.competencies || []);
    setSelfComments(data.selfComments || ''); setManagerComments(data.managerComments || '');
  }, [id]);
  useEffect(() => { (async () => { try { await load(); } catch { setErr('Could not load review.'); } })(); }, [load]);

  const max = r?.cycle?.ratingMax || 5;
  const scale = Array.from({ length: max }, (_, i) => i + 1);
  const locked = r?.status === 'acknowledged';

  const payload = () => ({ goals, competencies: comps, selfComments, managerComments });
  async function call(fn, okMsg) {
    setBusy(true); setErr('');
    try { await fn(); await load(); if (okMsg) setMsg(okMsg); }
    catch (e) { setErr(e?.response?.data?.message || 'Action failed.'); }
    finally { setBusy(false); }
  }
  const save = () => call(() => api.put(`/performance/reviews/${id}`, payload()), 'Saved.');
  const selfSubmit = () => call(() => api.post(`/performance/reviews/${id}/self-submit`, { ...payload() }), 'Self-assessment submitted.');
  const managerSubmit = () => call(() => api.post(`/performance/reviews/${id}/manager-submit`, { ...payload() }), 'Manager review submitted.');
  const acknowledge = () => call(() => api.post(`/performance/reviews/${id}/acknowledge`), 'Review acknowledged.');

  const addGoal = () => setGoals([...goals, { title: '', description: '', weight: 0, selfRating: null, managerRating: null, selfComment: '', managerComment: '' }]);
  const setGoal = (i, k, v) => setGoals(goals.map((g, j) => j === i ? { ...g, [k]: v } : g));
  const delGoal = (i) => setGoals(goals.filter((_, j) => j !== i));
  const setComp = (i, k, v) => setComps(comps.map((c, j) => j === i ? { ...c, [k]: v } : c));

  if (!r) return <div style={{ padding: 40, color: err ? C.red : C.muted }}>{err || 'Loading…'}</div>;
  const [slabel, scolor] = rsMeta(r.status);

  return (
    <div>
      <Hero onBack={onBack} backLabel="Back to cycle"
        crumbs={<>{r.cycle?.name} <span style={{ opacity: .6 }}>›</span> {fullName(r.employee)}</>}
        title={fullName(r.employee)}
        subtitle={`${r.employee?.employment?.jobTitle || '—'} · Manager: ${fullName(r.manager)}`}
        action={<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ background: scolor + '2a', color: '#062a55', fontWeight: 700, fontSize: '.72rem', padding: '5px 12px', borderRadius: 999 }}>{slabel}</span>
          <OverallBox label="Self" value={r.overall?.selfRating} max={max} />
          <OverallBox label="Manager" value={r.overall?.managerRating} max={max} accent />
        </div>} />
      {err && <ErrBox>{err}</ErrBox>}

      {/* goals */}
      <Section title="Goals & objectives" action={!locked && <button onClick={addGoal} style={miniBtn(C.blue)}>+ Add goal</button>}>
        {goals.length === 0 && <div style={{ color: C.muted, fontSize: '.85rem' }}>No goals yet.</div>}
        {goals.map((g, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input value={g.title} disabled={locked} onChange={(e) => setGoal(i, 'title', e.target.value)} placeholder="Goal title" style={{ ...inp(), fontWeight: 700 }} />
              <input type="number" value={g.weight ?? ''} disabled={locked} onChange={(e) => setGoal(i, 'weight', Number(e.target.value))} placeholder="wt%" style={{ ...inp(), width: 70 }} />
              {!locked && <button onClick={() => delGoal(i)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>}
            </div>
            <input value={g.description || ''} disabled={locked} onChange={(e) => setGoal(i, 'description', e.target.value)} placeholder="Description / target" style={{ ...inp(), marginTop: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <RatingRow label="Self" value={g.selfRating} scale={scale} disabled={locked} onChange={(v) => setGoal(i, 'selfRating', v)} comment={g.selfComment} onComment={(v) => setGoal(i, 'selfComment', v)} />
              <RatingRow label="Manager" value={g.managerRating} scale={scale} disabled={locked} onChange={(v) => setGoal(i, 'managerRating', v)} comment={g.managerComment} onComment={(v) => setGoal(i, 'managerComment', v)} />
            </div>
          </div>
        ))}
      </Section>

      {/* competencies */}
      <Section title="Competencies">
        {comps.length === 0 && <div style={{ color: C.muted, fontSize: '.85rem' }}>No competencies on this cycle.</div>}
        {comps.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10, alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: '.88rem', fontWeight: 600, color: C.ink }}>{c.name}</div>
            <RatePill label="Self" value={c.selfRating} scale={scale} disabled={locked} onChange={(v) => setComp(i, 'selfRating', v)} />
            <RatePill label="Manager" value={c.managerRating} scale={scale} disabled={locked} onChange={(v) => setComp(i, 'managerRating', v)} />
          </div>
        ))}
      </Section>

      {/* comments */}
      <Section title="Comments">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><Lbl>Employee comments</Lbl><textarea value={selfComments} disabled={locked} onChange={(e) => setSelfComments(e.target.value)} rows={3} style={ta()} /></div>
          <div><Lbl>Manager comments</Lbl><textarea value={managerComments} disabled={locked} onChange={(e) => setManagerComments(e.target.value)} rows={3} style={ta()} /></div>
        </div>
      </Section>

      {/* actions */}
      {!locked && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={save} disabled={busy} style={ghostBtn()}>Save draft</button>
          <button onClick={selfSubmit} disabled={busy} style={{ ...primaryBtn(), background: C.blue }}>Submit self-assessment</button>
          <button onClick={managerSubmit} disabled={busy} style={{ ...primaryBtn(), background: C.teal }}>Submit manager review</button>
          {r.status === 'completed' && <button onClick={acknowledge} disabled={busy} style={{ ...primaryBtn(), background: C.green }}>✓ Acknowledge</button>}
        </div>
      )}
      {locked && <div style={{ textAlign: 'center', color: C.green, fontWeight: 700, padding: 12 }}>✓ Review acknowledged and closed — {fmtDate(r.acknowledgedAt)}</div>}
    </div>
  );
}

/* ============================ CYCLE MODAL ============================ */
function CycleModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', type: 'annual', periodLabel: '', startDate: '', endDate: '', ratingMax: 5, instructions: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.name.trim()) { setErr('A cycle name is required.'); return; }
    setBusy(true); setErr('');
    try { await api.post('/performance/cycles', { ...f, ratingMax: Number(f.ratingMax) || 5 }); onSaved('Cycle created.'); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not create cycle.'); }
    finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={{ color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }}>New appraisal cycle</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Cycle name" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="e.g. 2026 Annual Review" />
      <Row2>
        <div><Lbl>Type</Lbl><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} style={inp()}>{CYCLE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></div>
        <Field label="Period label" value={f.periodLabel} onChange={(v) => setF({ ...f, periodLabel: v })} placeholder="e.g. FY2026" />
      </Row2>
      <Row2>
        <Field label="Start date" type="date" value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} />
        <Field label="End date" type="date" value={f.endDate} onChange={(v) => setF({ ...f, endDate: v })} />
      </Row2>
      <Field label="Rating scale (out of)" type="number" value={f.ratingMax} onChange={(v) => setF({ ...f, ratingMax: v })} />
      <Lbl>Instructions (optional)</Lbl>
      <textarea value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} rows={2} style={{ ...ta(), marginBottom: 14 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onClose} style={ghostBtn()}>Cancel</button>
        <button onClick={submit} disabled={busy} style={primaryBtn()}>{busy ? 'Creating…' : 'Create cycle'}</button>
      </div>
    </Overlay>
  );
}

/* ============================ shared bits ============================ */
function DrillKpi({ Icon, label, value, sub, color, bar, onClick }) {
  return (
    <button onClick={onClick} className="nx-kpi" style={{ textAlign: 'left', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)', cursor: 'pointer', position: 'relative', transition: 'box-shadow .15s, transform .15s', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {Icon && <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '15', display: 'grid', placeItems: 'center' }}><Icon size={16} color={color} /></div>}
        <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
        <ChevronRight size={15} color={C.muted} style={{ marginLeft: 'auto' }} className="nx-kpi-arrow" />
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color, margin: '0 0 2px' }}>{value}</div>
      <div style={{ fontSize: '.72rem', color: C.muted }}>{sub}</div>
      {bar != null && <div style={{ height: 6, background: '#eef2f8', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}><div style={{ width: `${Math.min(100, bar)}%`, height: '100%', background: color }} /></div>}
      <style>{`.nx-kpi:hover{box-shadow:0 8px 22px rgba(1,33,88,.13);transform:translateY(-2px)}.nx-kpi .nx-kpi-arrow{opacity:.4}.nx-kpi:hover .nx-kpi-arrow{opacity:1}`}</style>
    </button>
  );
}
function Card({ title, sub, children }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
    {title && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>{title}</div>{sub && <div style={{ color: C.muted, fontSize: '.76rem', marginTop: 2 }}>{sub}</div>}</div>}{children}
  </div>;
}
function Empty({ children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted }}>{children}</div>; }
function RatingRow({ label, value, scale, disabled, onChange, comment, onComment }) {
  return (
    <div style={{ background: '#f7f9fc', borderRadius: 8, padding: 8 }}>
      <RatePill label={label} value={value} scale={scale} disabled={disabled} onChange={onChange} />
      <input value={comment || ''} disabled={disabled} onChange={(e) => onComment(e.target.value)} placeholder={`${label} comment`} style={{ ...inp(), marginTop: 6, fontSize: '.8rem' }} />
    </div>
  );
}
function RatePill({ label, value, scale, disabled, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '.66rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginRight: 4 }}>{label}</span>
      {scale.map((n) => (
        <button key={n} disabled={disabled} onClick={() => onChange(value === n ? null : n)}
          style={{ width: 26, height: 26, borderRadius: 6, cursor: disabled ? 'default' : 'pointer', fontWeight: 700, fontSize: '.78rem',
            border: `1px solid ${value === n ? C.navy : C.line}`, background: value === n ? C.navy : '#fff', color: value === n ? '#fff' : C.ink }}>{n}</button>
      ))}
    </div>
  );
}
function OverallBox({ label, value, max, accent }) {
  return (
    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.72)', borderRadius: 10, padding: '8px 14px', borderTop: `3px solid ${accent ? C.orange : '#9fc3ec'}` }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: C.navy }}>{value != null ? value : '—'}<span style={{ fontSize: '.8rem', color: C.muted }}>/{max}</span></div>
      <div style={{ fontSize: '.62rem', color: '#28466f', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
    </div>
  );
}
function Section({ title, action, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, marginBottom: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ color: C.navy, fontSize: '1rem', fontWeight: 800, margin: 0 }}>{title}</h2>{action}
      </div>
      {children}
    </div>
  );
}
function StatusPill({ status, map }) {
  const [bg, col] = (map && map[status]) || ['#eef1f6', '#8a94a6'];
  return <span style={{ background: bg, color: col, fontWeight: 700, fontSize: '.68rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{(status || '').replace('_', ' ')}</span>;
}
function Mini({ label, value, accent }) {
  return <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '6px 10px', minWidth: 70 }}>
    <div style={{ fontWeight: 800, fontSize: '.95rem', color: accent || C.navy }}>{value}</div>
    <div style={{ fontSize: '.6rem', color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
  </div>;
}
function Overlay({ children, onClose }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div>
  </div>;
}
function Note({ children, onClose }) {
  return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
    <span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0f3d78', cursor: 'pointer', fontWeight: 800 }}>×</button>}
  </div>;
}
function Field({ label, value, onChange, type = 'text', placeholder }) {
  return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl>
    <input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>;
}
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', fontFamily: 'inherit' }; }
function ta() { return { width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.88rem', resize: 'vertical', fontFamily: 'inherit', color: C.ink }; }
function th() { return { textAlign: 'left', padding: '12px 16px', background: '#f4f7fc', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }; }
function td() { return { padding: '12px 16px', fontSize: '.9rem', color: C.ink }; }
function cardBox() { return { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', cursor: 'pointer' }; }
function segBtn(on) { return { padding: '7px 14px', borderRadius: 9, border: `1px solid ${on ? C.navy : C.line}`, background: on ? C.navy : '#fff', color: on ? '#fff' : C.ink, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', fontFamily: 'inherit' }; }
function primaryBtn() { return { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function ghostBtn() { return { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function miniBtn(color) { return { padding: '5px 11px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.74rem', cursor: 'pointer', fontFamily: 'inherit' }; }