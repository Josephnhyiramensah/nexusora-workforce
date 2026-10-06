import { useEffect, useState, useCallback } from 'react';
import { Users, TrendingDown, Target, UserPlus, Wallet, LayoutGrid, List, LineChart, SlidersHorizontal, ChevronLeft } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ModuleShell } from '../ui/kit';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Workforce Planning';
const money = (n, c) => (n == null || n === '') ? '—' : `${c || ''} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`.trim();
const kMoney = (n) => n == null ? '—' : (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));
const PRI = { low: ['Low', C.muted], medium: ['Medium', C.blue], high: ['High', C.red] };
const num = (v) => (v === '' || v == null ? null : Number(v));
const stripLine = (l) => ({ department: l.department, positionTitle: l.positionTitle || '', targetHeadcount: Number(l.targetHeadcount) || 0, attritionRatePct: num(l.attritionRatePct), costPerHead: num(l.costPerHead), currency: l.currency || '', priority: l.priority || 'medium', notes: l.notes || '' });
const stripScenario = (s) => ({ name: s.name, demandFactorPct: Number(s.demandFactorPct) || 100, attritionPctOverride: num(s.attritionPctOverride), isBaseline: !!s.isBaseline, notes: s.notes || '' });

export default function WorkforcePlanningPage() {
  const { user, tenant } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('dashboard');
  const [modal, setModal] = useState(false);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const { data } = await api.get('/workforce/plans'); if (alive) setPlans(data.items || []); }
      catch { if (alive) setPlans([]); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);

  const groups = [
    { title: 'Planning', items: [{ key: 'plans', label: 'All Plans', Icon: LayoutGrid, count: plans.length }] },
    ...(selected ? [{ title: 'Workspace', items: [
      { key: 'dashboard', label: 'Dashboard', Icon: LayoutGrid },
      { key: 'forecast', label: 'Forecast', Icon: LineChart },
      { key: 'lines', label: 'Plan lines', Icon: List },
    ] }] : []),
  ];
  const active = selected ? view : 'plans';
  function pick(k) { if (k === 'plans') { setSelected(null); refresh(); } else { setView(k); } }

  return (
    <ModuleShell brand={{ title: 'Workforce Planning', subtitle: 'Headcount & cost', Icon: Target }} groups={groups} active={active} onSelect={pick}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
        {selected
          ? <PlanWorkspace id={selected} view={view} canWrite={canWrite} tenant={tenant} onBack={() => { setSelected(null); refresh(); }} setMsg={setMsg} msg={msg} />
          : <PlansList plans={plans} loading={loading} canWrite={canWrite} onOpen={setSelected} onNew={() => setModal(true)} />}
      </div>
      {modal && <PlanModal onClose={() => setModal(false)} onSaved={(m, id) => { setModal(false); setMsg(m); if (id) setSelected(id); else refresh(); }} />}
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function Hero({ crumbs, title, subtitle, action, onBack, backLabel }) {
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '20px 30px 26px', position: 'relative' }}>
      {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 8, color: C.navy, fontWeight: 700, fontSize: '.78rem', padding: '5px 11px', cursor: 'pointer', marginBottom: 12 }}><ChevronLeft size={14} /> {backLabel || 'Back'}</button>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8, flexWrap: 'wrap' }}>{MODULE} <span style={{ opacity: .6 }}>›</span> <span>{crumbs}</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '.88rem', color: '#28466f', marginTop: 6 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </section>
  );
}
function heroCtrl() { return { padding: '8px 11px', border: '1px solid rgba(255,255,255,.9)', borderRadius: 9, background: 'rgba(255,255,255,.72)', color: C.navy, fontSize: '.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function heroGhost() { return { padding: '9px 14px', border: '1px solid rgba(255,255,255,.9)', borderRadius: 9, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', fontFamily: 'inherit' }; }
function heroPrimary() { return { padding: '9px 16px', border: 'none', borderRadius: 9, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(1,33,88,.22)' }; }

/* ============================ PLANS LIST ============================ */
function PlansList({ plans, loading, canWrite, onOpen, onNew }) {
  return (
    <div>
      <Hero crumbs="All Plans" title="Workforce Planning" subtitle={`Strategic headcount & cost planning · ${plans.length} plan${plans.length === 1 ? '' : 's'}`}
        action={canWrite && <button onClick={onNew} style={heroPrimary()}>+ New Plan</button>} />
      {loading ? <div style={{ color: C.muted, padding: 40 }}>Loading…</div>
        : plans.length === 0 ? <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted }}>No workforce plans yet.{canWrite && ' Create one to model demand, attrition and the hiring need.'}</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {plans.map((p) => (
                <div key={p._id} onClick={() => onOpen(p._id)} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{p.name}</div>
                    <StatusPill status={p.status} />
                  </div>
                  <div style={{ color: C.muted, fontSize: '.78rem', marginTop: 4 }}>{p.year} · {p.horizonYears || 1}-yr horizon · {p.scenarioCount || 1} scenario{(p.scenarioCount || 1) === 1 ? '' : 's'}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Mini label="Lines" value={p.lineCount} /><Mini label="Target HC" value={p.targetTotal} accent={C.blue} /></div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

/* ============================ PLAN WORKSPACE ============================ */
function PlanWorkspace({ id, view, canWrite, tenant, onBack, setMsg, msg }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [dept, setDept] = useState('all');
  const [scenIdx, setScenIdx] = useState(0);
  const [lineModal, setLineModal] = useState(null);
  const [planEdit, setPlanEdit] = useState(false);
  const [scenMgr, setScenMgr] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { const { data } = await api.get(`/workforce/plans/${id}`); setData(data); }, [id]);
  useEffect(() => { let alive = true; (async () => { try { await load(); } catch { if (alive) setErr('Could not load plan.'); } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, [load]);
  async function put(body, okMsg) {
    setBusy(true); setErr('');
    try { const { data: r } = await api.put(`/workforce/plans/${id}`, body); setData(r); if (okMsg) setMsg(okMsg); return true; }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); return false; } finally { setBusy(false); }
  }
  const saveLine = (line) => { const lines = data.lines.slice(); if (line._idx != null) lines[line._idx] = line; else lines.push(line); setLineModal(null); put({ lines: lines.map(stripLine) }, 'Plan line saved.'); };
  const delLine = (idx) => { if (!window.confirm('Remove this line?')) return; put({ lines: data.lines.filter((_, i) => i !== idx).map(stripLine) }, 'Line removed.'); };
  const saveScenarios = (scs) => put({ scenarios: scs.map(stripScenario) }, 'Scenarios saved.').then((ok) => { if (ok) { setScenMgr(false); setScenIdx(0); } });
  const savePlan = (patch) => put(patch, 'Plan settings saved.').then((ok) => { if (ok) setPlanEdit(false); });

  if (loading) return <div style={{ padding: 40, color: C.muted }}>Loading…</div>;
  if (!data) return <div style={{ padding: 40, color: C.red }}>{err || 'Not found.'}</div>;
  const { plan, lines, forecast, orgHeadcount, suggestedAttritionPct } = data;
  const cur = tenant?.baseCurrency;
  const depts = Array.from(new Set(lines.map((l) => l.department)));
  const shown = dept === 'all' ? lines : lines.filter((l) => l.department === dept);
  const T = shown.reduce((a, l) => ({ current: a.current + l.current, projAttrition: a.projAttrition + l.projAttrition, projSupply: a.projSupply + l.projSupply, target: a.target + l.target, hiringNeed: a.hiringNeed + l.hiringNeed, surplus: a.surplus + l.surplus, projCost: a.projCost + (l.projCost || 0), hiringCost: a.hiringCost + (l.hiringCost || 0) }), { current: 0, projAttrition: 0, projSupply: 0, target: 0, hiringNeed: 0, surplus: 0, projCost: 0, hiringCost: 0 });
  const byDept = {}; shown.forEach((l) => { const d = byDept[l.department] || (byDept[l.department] = { department: l.department, projSupply: 0, target: 0, hiringNeed: 0, projAttrition: 0, projCost: 0 }); d.projSupply += l.projSupply; d.target += l.target; d.hiringNeed += l.hiringNeed; d.projAttrition += l.projAttrition; d.projCost += (l.projCost || 0); });
  const deptRows = Object.values(byDept);
  const scenarios = forecast?.scenarios || [];
  const scen = scenarios[Math.min(scenIdx, scenarios.length - 1)] || scenarios[0];

  const VIEW_TITLE = { dashboard: 'Planning Dashboard', forecast: 'Forecast & Scenarios', lines: 'Plan Lines' };
  const meta = `${plan.year} · ${plan.horizonYears || 1}-yr horizon · planning attrition ${plan.defaultAttritionPct != null ? `${plan.defaultAttritionPct}%` : `${suggestedAttritionPct}% (org avg)`} · org headcount ${orgHeadcount}`;
  const action = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#2b4a74', fontSize: '.76rem', fontWeight: 700 }}><SlidersHorizontal size={14} /></span>
      <select value={dept} onChange={(e) => setDept(e.target.value)} style={heroCtrl()}>
        <option value="all">All organizational units</option>
        {depts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      {canWrite && <button onClick={() => setPlanEdit(true)} style={heroGhost()}>Settings</button>}
      {canWrite && view !== 'forecast' && <button onClick={() => setLineModal({})} disabled={busy} style={heroPrimary()}>+ Add line</button>}
      {canWrite && view === 'forecast' && <button onClick={() => setScenMgr(true)} disabled={busy} style={heroPrimary()}>Scenarios</button>}
    </div>
  );

  return (
    <div>
      <Hero onBack={onBack} backLabel="All plans"
        crumbs={<>{plan.name} <span style={{ opacity: .6 }}>›</span> {VIEW_TITLE[view]}</>}
        title={plan.name} subtitle={meta} action={action} />
      {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
      {err && <ErrBox>{err}</ErrBox>}

      {/* Tiles (dashboard/lines context) */}
      {view !== 'forecast' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Tile Icon={Users} color={C.navy} label="Current supply" value={T.current} sub="Active today" ratio={1} />
          <Tile Icon={TrendingDown} color={C.red} label="Projected attrition" value={`−${T.projAttrition}`} sub={`over ${plan.horizonYears || 1} yr`} ratio={T.current ? T.projAttrition / T.current : 0} barColor={C.red} />
          <Tile Icon={Users} color={C.teal} label="Projected supply" value={T.projSupply} sub="After attrition" ratio={T.target ? T.projSupply / T.target : 0} barColor={C.teal} />
          <Tile Icon={Target} color={C.blue} label="Demand" value={T.target} sub="Planned target" ratio={1} barColor={C.blue} />
          <Tile Icon={UserPlus} color={C.orange} label="Hiring need" value={T.hiringNeed} sub="To recruit" ratio={T.target ? T.hiringNeed / T.target : 0} barColor={C.orange} />
          <Tile Icon={Wallet} color={C.green} label="Planned cost" value={kMoney(T.projCost)} sub={cur || ''} ratio={0.6} barColor={C.green} />
        </div>
      )}

      {view === 'dashboard' && (
        deptRows.length === 0 ? <Empty msg="No plan lines yet — add a department demand to see the analytics." canWrite={canWrite} onAdd={() => setLineModal({})} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              <ChartCard title="Filled vs positions to hire, by unit" wide legend={[['Projected supply', C.teal], ['To hire', C.orange]]}><StackedBars data={deptRows.map((d) => ({ label: d.department, filled: d.projSupply, vacant: d.hiringNeed }))} /></ChartCard>
              <ChartCard title="Workforce bridge (total)"><Waterfall t={T} /></ChartCard>
              <ChartCard title="Hiring need by unit"><HBars data={deptRows.map((d) => ({ label: d.department, value: d.hiringNeed }))} color={C.orange} /></ChartCard>
              <ChartCard title="Projected attrition by unit"><HBars data={deptRows.map((d) => ({ label: d.department, value: d.projAttrition }))} color={C.red} /></ChartCard>
              <ChartCard title="Planned cost by unit" wide><HBars data={deptRows.filter((d) => d.projCost).map((d) => ({ label: d.department, value: Math.round(d.projCost) }))} color={C.green} money cur={cur} empty="No cost-per-head set on these lines yet." /></ChartCard>
            </div>
          )
      )}

      {view === 'forecast' && (
        !scen ? <Empty msg="Add plan lines first, then the forecast populates." canWrite={canWrite} onAdd={() => setLineModal({})} />
          : (
            <>
              {/* scenario chips */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {scenarios.map((s, i) => (
                  <button key={i} onClick={() => setScenIdx(i)} style={{ padding: '7px 14px', borderRadius: 999, border: `1px solid ${i === scenIdx ? C.navy : C.line}`, background: i === scenIdx ? C.navy : '#fff', color: i === scenIdx ? '#fff' : C.ink, fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
                    {s.name}{s.demandFactorPct !== 100 ? ` · ${s.demandFactorPct}%` : ''}{s.isBaseline ? ' ★' : ''}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Tile Icon={Target} color={C.blue} label={`Demand ${scen.series[scen.series.length - 1]?.year || ''}`} value={scen.totals.finalDemand} sub="End of horizon" ratio={1} barColor={C.blue} />
                <Tile Icon={UserPlus} color={C.orange} label="Cumulative hires" value={scen.totals.cumulativeHires} sub={`over ${forecast.years} yr`} ratio={0.7} barColor={C.orange} />
                <Tile Icon={TrendingDown} color={C.red} label="Total attrition" value={scen.totals.totalAttrition} sub="Expected losses" ratio={0.5} barColor={C.red} />
                <Tile Icon={Wallet} color={C.green} label="Final annual cost" value={kMoney(scen.totals.finalCost)} sub={cur || ''} ratio={0.8} barColor={C.green} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                <ChartCard title="Workforce size by year"><VBars data={scen.series.map((y) => ({ label: y.label, value: y.demand }))} color={C.blue} /></ChartCard>
                <ChartCard title="Hires needed per year"><VBars data={scen.series.map((y) => ({ label: y.label, value: y.hires }))} color={C.orange} /></ChartCard>
                <ChartCard title="Attrition loss per year"><VBars data={scen.series.map((y) => ({ label: y.label, value: y.attrition }))} color={C.red} /></ChartCard>
                <ChartCard title="Annual cost by year"><VBars data={scen.series.map((y) => ({ label: y.label, value: y.cost }))} color={C.green} money cur={cur} /></ChartCard>
              </div>

              {/* per-year table */}
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(1,33,88,.05)', marginTop: 16 }}>
                <div style={{ padding: '12px 16px', fontWeight: 800, color: C.navy, fontSize: '.9rem' }}>Year-by-year plan · {scen.name}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
                    <thead><tr>{['Year', 'Demand', 'Attrition', 'Hires', 'Surplus', 'Annual cost'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '10px 14px', background: C.panel, color: C.navy, fontWeight: 700, fontSize: '.7rem', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                    <tbody>{scen.series.map((y, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={td()}>{y.year} <span style={{ color: C.muted }}>({y.label})</span></td>
                        <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{y.demand}</td>
                        <td style={{ ...td(), textAlign: 'right', color: C.red }}>−{y.attrition}</td>
                        <td style={{ ...td(), textAlign: 'right', color: C.orange, fontWeight: 700 }}>+{y.hires}</td>
                        <td style={{ ...td(), textAlign: 'right', color: C.muted }}>{y.surplus || '—'}</td>
                        <td style={{ ...td(), textAlign: 'right' }}>{y.cost ? money(y.cost, cur) : '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>

              {/* scenario comparison */}
              {scenarios.length > 1 && (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginTop: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', marginBottom: 14 }}>Scenario comparison</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
                      <thead><tr>{['Scenario', 'Demand factor', 'Final demand', 'Cumulative hires', 'Final annual cost'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 12px', color: C.muted, fontSize: '.7rem', textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>)}</tr></thead>
                      <tbody>{scenarios.map((s, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.line}`, background: i === scenIdx ? '#f4f8ff' : '#fff' }}>
                          <td style={td()}>{s.name}{s.isBaseline ? ' ★' : ''}</td>
                          <td style={{ ...td(), textAlign: 'right' }}>{s.demandFactorPct}%{s.attritionPctOverride != null ? ` · attr ${s.attritionPctOverride}%` : ''}</td>
                          <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{s.totals.finalDemand}</td>
                          <td style={{ ...td(), textAlign: 'right', color: C.orange, fontWeight: 700 }}>{s.totals.cumulativeHires}</td>
                          <td style={{ ...td(), textAlign: 'right' }}>{s.totals.finalCost ? money(s.totals.finalCost, cur) : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )
      )}

      {view === 'lines' && (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
              <thead><tr>{['Unit', 'Role', 'Pri', 'Current', 'Attr %', 'Proj. loss', 'Proj. supply', 'Demand', 'Hiring need', 'Cost/head', 'Planned cost', ''].map((h, i) => <th key={i} style={{ textAlign: i >= 3 && i <= 10 ? 'right' : 'left', padding: '11px 14px', background: C.panel, color: C.navy, fontWeight: 700, fontSize: '.68rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan="12" style={{ textAlign: 'center', color: C.muted, padding: 30 }}>No lines.</td></tr>}
                {shown.map((l, i) => { const idx = lines.indexOf(l); const [plabel, pcolor] = PRI[l.priority] || PRI.medium; return (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={td()}>{l.department}</td>
                    <td style={{ ...td(), color: C.muted }}>{l.positionTitle || 'Any'}</td>
                    <td style={td()}><span style={{ color: pcolor, fontWeight: 700, fontSize: '.72rem' }}>{plabel}</span></td>
                    <td style={{ ...td(), textAlign: 'right' }}>{l.current}</td>
                    <td style={{ ...td(), textAlign: 'right', color: C.muted }}>{l.attritionRatePct}%</td>
                    <td style={{ ...td(), textAlign: 'right', color: C.red }}>−{l.projAttrition}</td>
                    <td style={{ ...td(), textAlign: 'right', color: C.teal, fontWeight: 700 }}>{l.projSupply}</td>
                    <td style={{ ...td(), textAlign: 'right', fontWeight: 700 }}>{l.target}</td>
                    <td style={{ ...td(), textAlign: 'right', fontWeight: 800, color: l.hiringNeed > 0 ? C.orange : l.surplus > 0 ? C.purple : C.green }}>{l.hiringNeed > 0 ? `+${l.hiringNeed}` : (l.surplus > 0 ? `−${l.surplus}` : '0')}</td>
                    <td style={{ ...td(), textAlign: 'right', color: C.muted }}>{money(l.costPerHead, l.currency || cur)}</td>
                    <td style={{ ...td(), textAlign: 'right' }}>{money(l.projCost, l.currency || cur)}</td>
                    <td style={{ ...td(), textAlign: 'right', whiteSpace: 'nowrap' }}>{canWrite && <><button onClick={() => setLineModal({ ...l, _idx: idx })} style={miniBtn(C.muted)}>Edit</button>{' '}<button onClick={() => delLine(idx)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button></>}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {plan.assumptions && <div style={{ color: C.muted, fontSize: '.82rem', marginTop: 14, lineHeight: 1.6 }}><strong style={{ color: C.ink }}>Assumptions:</strong> {plan.assumptions}</div>}

      {lineModal && <LineModal line={lineModal} tenant={tenant} suggested={suggestedAttritionPct} planDefault={plan.defaultAttritionPct} onClose={() => setLineModal(null)} onSave={saveLine} />}
      {planEdit && <PlanSettings plan={plan} suggested={suggestedAttritionPct} onClose={() => setPlanEdit(false)} onSave={savePlan} busy={busy} />}
      {scenMgr && <ScenarioManager scenarios={plan.scenarios} onClose={() => setScenMgr(false)} onSave={saveScenarios} busy={busy} />}
    </div>
  );
}

/* ============================ charts ============================ */
function StackedBars({ data }) {
  const max = Math.max(...data.map((d) => d.filled + d.vacant), 1);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>{data.map((d, i) => (
    <div key={i}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: 3 }}><span style={{ color: C.ink }}>{d.label}</span><span style={{ color: C.muted }}>{d.filled + d.vacant} demand</span></div>
      <div style={{ display: 'flex', height: 16, borderRadius: 5, overflow: 'hidden', background: '#eef2f8' }}><div title={`Projected supply ${d.filled}`} style={{ width: `${(d.filled / max) * 100}%`, background: C.teal }} /><div title={`To hire ${d.vacant}`} style={{ width: `${(d.vacant / max) * 100}%`, background: C.orange }} /></div>
    </div>))}</div>;
}
function HBars({ data, color, money: isMoney, cur, empty }) {
  if (!data.length) return <Muted>{empty || 'No data.'}</Muted>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{data.map((d, i) => (
    <div key={i}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.79rem', marginBottom: 3 }}><span style={{ color: C.ink }}>{d.label}</span><span style={{ color: C.muted, fontWeight: 700 }}>{isMoney ? money(d.value, cur) : d.value}</span></div>
      <div style={{ height: 9, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: color, borderRadius: 999, minWidth: d.value ? 2 : 0 }} /></div>
    </div>))}</div>;
}
function VBars({ data, color, money: isMoney, cur }) {
  const max = Math.max(...data.map((d) => d.value), 1); const H = 150;
  return <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: H + 40, paddingTop: 6 }}>{data.map((d, i) => (
    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
      <div style={{ fontSize: '.66rem', color: C.muted, marginBottom: 4, fontWeight: 700 }}>{isMoney ? kMoney(d.value) : d.value}</div>
      <div title={isMoney ? money(d.value, cur) : String(d.value)} style={{ width: '70%', height: Math.max(Math.round((d.value / max) * H), 2), background: color, borderRadius: '5px 5px 0 0' }} />
      <div style={{ fontSize: '.64rem', color: C.muted, marginTop: 6 }}>{d.label}</div>
    </div>))}</div>;
}
function Waterfall({ t }) {
  const maxV = Math.max(t.current, t.target, t.projSupply, 1); const H = 150; const scale = (v) => Math.round((v / maxV) * H);
  const cols = [{ label: 'Current', base: 0, h: t.current, color: C.navy, val: t.current }, { label: '−Attrition', base: t.projSupply, h: t.projAttrition, color: C.red, val: `−${t.projAttrition}` }, { label: 'Proj. supply', base: 0, h: t.projSupply, color: C.teal, val: t.projSupply }, { label: '+Hiring', base: t.projSupply, h: t.hiringNeed, color: C.orange, val: `+${t.hiringNeed}` }, { label: 'Demand', base: 0, h: t.target, color: C.blue, val: t.target }];
  return <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: H + 44 }}>{cols.map((c, i) => (
    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: H + 22 }}>
      <div style={{ fontSize: '.72rem', fontWeight: 800, color: c.color, marginBottom: 4 }}>{c.val}</div>
      <div style={{ position: 'relative', width: '68%', height: H }}><div style={{ position: 'absolute', bottom: scale(c.base), width: '100%', height: Math.max(scale(c.h), 2), background: c.color, borderRadius: 4, opacity: c.label.startsWith('−') || c.label.startsWith('+') ? 0.85 : 1 }} /></div>
      <div style={{ fontSize: '.62rem', color: C.muted, marginTop: 7, textAlign: 'center' }}>{c.label}</div>
    </div>))}</div>;
}

/* ============================ tiles / cards ============================ */
function Tile({ Icon, color, label, value, sub, ratio = 0, barColor }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 15px', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><span style={{ width: 26, height: 26, borderRadius: 7, background: color + '15', color, display: 'grid', placeItems: 'center' }}><Icon size={15} strokeWidth={2} /></span><span style={{ fontSize: '.62rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 700 }}>{label}</span></div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.navy, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: '.64rem', color: C.muted, margin: '3px 0 7px' }}>{sub}</div>
    <div style={{ height: 4, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, height: '100%', background: barColor || color }} /></div>
  </div>;
}
function ChartCard({ title, children, wide, legend }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', gridColumn: wide ? '1 / -1' : 'auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}><div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem' }}>{title}</div>{legend && <div style={{ display: 'flex', gap: 12 }}>{legend.map(([l, c]) => <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.72rem', color: C.ink }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}</span>)}</div>}</div>
    {children}
  </div>;
}

/* ============================ modals ============================ */
function ScenarioManager({ scenarios, onClose, onSave, busy }) {
  const seed = (scenarios && scenarios.length) ? scenarios : [{ name: 'Baseline', demandFactorPct: 100, attritionPctOverride: null, isBaseline: true }];
  const [rows, setRows] = useState(seed.map((s) => ({ name: s.name, demandFactorPct: s.demandFactorPct ?? 100, attritionPctOverride: s.attritionPctOverride ?? '', isBaseline: !!s.isBaseline })));
  const [err, setErr] = useState('');
  const set = (i, k, v) => setRows(rows.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const add = () => setRows([...rows, { name: '', demandFactorPct: 100, attritionPctOverride: '', isBaseline: false }]);
  const del = (i) => setRows(rows.filter((_, j) => j !== i));
  function submit() {
    if (rows.some((r) => !r.name.trim())) { setErr('Every scenario needs a name.'); return; }
    onSave(rows);
  }
  return (
    <Overlay onClose={onClose} wide>
      <h2 style={h2()}>Scenarios</h2>
      <div style={{ fontSize: '.8rem', color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>Model variations on the same plan. <strong>Demand factor</strong> scales targets (115 = +15%); <strong>attrition override</strong> replaces the planning attrition for that scenario.</div>
      {err && <ErrBox>{err}</ErrBox>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr .9fr auto', gap: 8, alignItems: 'end', background: C.panel, padding: 10, borderRadius: 10 }}>
            <div><Lbl>Name</Lbl><input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} style={inp()} placeholder="e.g. Growth" /></div>
            <div><Lbl>Demand %</Lbl><input type="number" value={r.demandFactorPct} onChange={(e) => set(i, 'demandFactorPct', e.target.value)} style={inp()} /></div>
            <div><Lbl>Attrition %</Lbl><input type="number" value={r.attritionPctOverride} onChange={(e) => set(i, 'attritionPctOverride', e.target.value)} style={inp()} placeholder="—" /></div>
            <button onClick={() => del(i)} disabled={rows.length === 1} style={{ ...miniBtn(C.red), border: 'none', height: 36 }}>✕</button>
          </div>
        ))}
      </div>
      <button onClick={add} style={{ ...btnGhost(), marginBottom: 16 }}>+ Add scenario</button>
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label="Save scenarios" />
    </Overlay>
  );
}
function PlanModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', year: new Date().getFullYear(), horizonYears: 3, defaultAttritionPct: '', status: 'active', assumptions: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.name.trim()) { setErr('A plan name is required.'); return; }
    setBusy(true); setErr('');
    try { const { data } = await api.post('/workforce/plans', { ...f, year: Number(f.year), horizonYears: Number(f.horizonYears) || 1, defaultAttritionPct: num(f.defaultAttritionPct) }); onSaved('Plan created.', data._id); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not create plan.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>New workforce plan</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Plan name" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="e.g. 2026 Workforce Plan" />
      <Row2><Field label="Base year" type="number" value={f.year} onChange={(v) => setF({ ...f, year: v })} /><Field label="Horizon (years)" type="number" value={f.horizonYears} onChange={(v) => setF({ ...f, horizonYears: v })} /></Row2>
      <Row2><Field label="Default attrition % / yr" type="number" value={f.defaultAttritionPct} onChange={(v) => setF({ ...f, defaultAttritionPct: v })} placeholder="e.g. 8" /><div><Lbl>Status</Lbl><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={inp()}><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option></select></div></Row2>
      <Lbl>Assumptions (optional)</Lbl>
      <textarea value={f.assumptions} onChange={(e) => setF({ ...f, assumptions: e.target.value })} rows={2} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label="Create plan" />
    </Overlay>
  );
}
function PlanSettings({ plan, suggested, onClose, onSave, busy }) {
  const [f, setF] = useState({ name: plan.name, year: plan.year, horizonYears: plan.horizonYears || 1, defaultAttritionPct: plan.defaultAttritionPct ?? '', status: plan.status, assumptions: plan.assumptions || '' });
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>Plan settings</h2>
      <Field label="Plan name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      <Row2><Field label="Base year" type="number" value={f.year} onChange={(v) => setF({ ...f, year: v })} /><Field label="Horizon (years)" type="number" value={f.horizonYears} onChange={(v) => setF({ ...f, horizonYears: v })} /></Row2>
      <Field label="Default attrition % / yr" type="number" value={f.defaultAttritionPct} onChange={(v) => setF({ ...f, defaultAttritionPct: v })} />
      <div style={{ fontSize: '.76rem', color: C.muted, margin: '-6px 0 12px' }}>Actual attrition (last 12 months): <strong style={{ color: C.blue }}>{suggested}%</strong>.</div>
      <div><Lbl>Status</Lbl><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={{ ...inp(), marginBottom: 12 }}><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option></select></div>
      <Lbl>Assumptions</Lbl>
      <textarea value={f.assumptions} onChange={(e) => setF({ ...f, assumptions: e.target.value })} rows={2} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
      <Actions onClose={onClose} onSubmit={() => onSave({ name: f.name, year: Number(f.year), horizonYears: Number(f.horizonYears) || 1, defaultAttritionPct: num(f.defaultAttritionPct), status: f.status, assumptions: f.assumptions })} busy={busy} label="Save settings" />
    </Overlay>
  );
}
function LineModal({ line, tenant, suggested, planDefault, onClose, onSave }) {
  const [f, setF] = useState({ department: line.department || '', positionTitle: line.positionTitle || '', targetHeadcount: line.targetHeadcount ?? 0, attritionRatePct: line.attritionRatePct ?? '', costPerHead: line.costPerHead ?? '', currency: line.currency || tenant?.baseCurrency || '', priority: line.priority || 'medium', notes: line.notes || '', _idx: line._idx });
  const [err, setErr] = useState('');
  function submit() { if (!f.department.trim()) { setErr('Department is required.'); return; } onSave(f); }
  return (
    <Overlay onClose={onClose}>
      <h2 style={h2()}>{line._idx != null ? 'Edit line' : 'Add plan line'}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Organizational unit / department" value={f.department} onChange={(v) => setF({ ...f, department: v })} placeholder="Match the department name on staff records" />
      <Field label="Role / position (optional)" value={f.positionTitle} onChange={(v) => setF({ ...f, positionTitle: v })} placeholder="Leave blank to count the whole unit" />
      <Row2><Field label="Demand (target headcount)" type="number" value={f.targetHeadcount} onChange={(v) => setF({ ...f, targetHeadcount: v })} /><div><Lbl>Priority</Lbl><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} style={inp()}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></Row2>
      <Row2><Field label="Attrition % / yr" type="number" value={f.attritionRatePct} onChange={(v) => setF({ ...f, attritionRatePct: v })} placeholder={planDefault != null ? `Default ${planDefault}%` : `Org avg ${suggested}%`} /><Field label="Cost per head / yr" type="number" value={f.costPerHead} onChange={(v) => setF({ ...f, costPerHead: v })} /></Row2>
      <Row2><Field label="Currency" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} /><Field label="Notes" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} /></Row2>
      <Actions onClose={onClose} onSubmit={submit} label={line._idx != null ? 'Save line' : 'Add line'} />
    </Overlay>
  );
}

/* ============================ shared ============================ */
function Empty({ msg, canWrite, onAdd }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 40, textAlign: 'center', color: C.muted }}>{msg}{canWrite && <div style={{ marginTop: 12 }}><button onClick={onAdd} style={btnPrimary()}>+ Add line</button></div>}</div>; }
function Muted({ children }) { return <div style={{ color: C.muted, fontSize: '.82rem', padding: '14px 0' }}>{children}</div>; }
function Mini({ label, value, accent }) { return <div style={{ background: C.panel, borderRadius: 8, padding: '6px 10px', minWidth: 66 }}><div style={{ fontWeight: 800, fontSize: '.95rem', color: accent || C.navy }}>{value}</div><div style={{ fontSize: '.6rem', color: C.muted, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div></div>; }
function StatusPill({ status }) { const map = { draft: ['#eef1f6', '#8a94a6'], active: ['#e4f7ec', '#1f9d57'], closed: ['#eaf2fd', '#1f6fd6'] }; const [bg, col] = map[status] || ['#eef1f6', '#8a94a6']; return <span style={{ background: bg, color: col, fontWeight: 700, fontSize: '.68rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize' }}>{status}</span>; }
function Overlay({ children, onClose, wide }) { return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}><div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 640 : 500, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div></div>; }
function Note({ children, onClose }) { return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0f3d78', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
function Field({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>; }
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function Actions({ onClose, onSubmit, busy, label }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}><button onClick={onClose} style={btnGhost()}>Cancel</button><button onClick={onSubmit} disabled={busy} style={btnPrimary()}>{busy ? 'Saving…' : label}</button></div>; }
function h2() { return { color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', fontFamily: 'inherit' }; }
function btnPrimary() { return { padding: '9px 16px', border: 'none', borderRadius: 9, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function btnGhost() { return { padding: '9px 14px', border: '1px solid #d8e0ec', borderRadius: 9, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function miniBtn(color) { return { padding: '4px 10px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.74rem', cursor: 'pointer', fontFamily: 'inherit' }; }
function td() { return { padding: '11px 14px', fontSize: '.85rem', whiteSpace: 'nowrap', color: C.ink }; }