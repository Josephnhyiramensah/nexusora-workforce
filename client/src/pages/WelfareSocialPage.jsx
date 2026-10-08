import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { exportTable, ExportButton } from '../utils/exporter';
import {
  LayoutDashboard, HandCoins, HeartHandshake, PiggyBank, Plus, Wallet,
  AlertTriangle, CheckCircle2, Paperclip, Users, ChevronRight, TrendingUp, Clock, ShieldCheck,
} from 'lucide-react';
import {
  ModuleShell, Hero, SubHero, KpiBand, Kpi, Body, Pill, StatusPill, EmpCell, Progress, HeroBtn,
  Card, Info, MiniStat, Empty, Banner, TableWrap, Overlay, Field, Sel, Row2, Lbl, Actions,
  ErrBox, Select,
} from '../ui/kit';
import {
  C, NUM, money, cap, fmtDate, fullName, labelOf as label, tone,
  inp, ta, primaryBtn, ghostBtn, rowStyle, td, mtd, miniBtn,
} from '../ui/tokens';
import { useEmployees } from '../ui/hooks';

const LOAN_TYPES = [['loan', 'Loan'], ['salary_advance', 'Salary advance']];
const LOAN_STATUS = { requested: ['Pending review', 'amber'], approved: ['Approved', 'amber'], active: ['Active', 'green'], completed: ['Completed', 'blue'], rejected: ['Rejected', 'red'], cancelled: ['Cancelled', 'grey'] };
const CLAIM_CATS = [['medical', 'Medical'], ['bereavement', 'Bereavement'], ['hardship', 'Hardship'], ['marriage', 'Marriage'], ['maternity', 'Maternity'], ['education', 'Education'], ['accident', 'Accident'], ['other', 'Other']];
const CLAIM_STATUS = { submitted: ['Submitted', 'blue'], under_review: ['Under review', 'amber'], approved: ['Approved', 'amber'], rejected: ['Rejected', 'red'], paid: ['Paid', 'green'] };
const SCHEME_TYPES = [['welfare_fund', 'Welfare fund'], ['benevolent', 'Benevolent'], ['sports', 'Sports'], ['social', 'Social'], ['savings', 'Savings'], ['other', 'Other']];
const METHODS = [['payroll_deduction', 'Payroll deduction'], ['cash', 'Cash'], ['bank', 'Bank'], ['other', 'Other']];
const FREQ = [['monthly', 'Monthly'], ['weekly', 'Weekly'], ['quarterly', 'Quarterly'], ['annual', 'Annual'], ['voluntary', 'Voluntary']];

/* ============================ ROOT ============================ */
export default function WelfareSocialPage() {
  const { user } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer', 'payroll_officer'].includes(user?.role);
  const canApprove = ['super_admin', 'hr_manager'].includes(user?.role);
  const [section, setSection] = useState('overview');
  const [msg, setMsg] = useState('');
  const [ov, setOv] = useState(null);
  const [ovReload, setOvReload] = useState(0);
  const bumpOv = useCallback(() => setOvReload((n) => n + 1), []);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/welfare/overview'); if (a) setOv(data); } catch { /* */ } })(); return () => { a = false; }; }, [ovReload]);

  const groups = [
    { title: 'Overview', items: [{ key: 'overview', label: 'Dashboard', Icon: LayoutDashboard }] },
    { title: 'Financial support', items: [
      { key: 'loans', label: 'Loans & Advances', Icon: HandCoins, count: ov?.loans?.active },
      { key: 'claims', label: 'Welfare Claims', Icon: HeartHandshake, count: ov?.claims?.pending },
    ] },
    { title: 'Funds', items: [{ key: 'schemes', label: 'Schemes & Contributions', Icon: PiggyBank }] },
  ];

  return (
    <ModuleShell brand={{ title: 'Welfare & Social', subtitle: 'Staff support & funds', Icon: HeartHandshake }} groups={groups} active={section} onSelect={setSection}>
      {msg && <Banner onClose={() => setMsg('')}>{msg}</Banner>}
      {section === 'overview' && <Overview ov={ov} onDrill={setSection} />}
      {section === 'loans' && <Loans ov={ov} canWrite={canWrite} canApprove={canApprove} setMsg={setMsg} onChange={bumpOv} />}
      {section === 'claims' && <Claims ov={ov} canWrite={canWrite} canApprove={canApprove} setMsg={setMsg} onChange={bumpOv} />}
      {section === 'schemes' && <Schemes ov={ov} canWrite={canWrite} canApprove={canApprove} setMsg={setMsg} onChange={bumpOv} />}
    </ModuleShell>
  );
}

/* ============================ OVERVIEW ============================ */
function Overview({ ov, onDrill }) {
  const [funds, setFunds] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/welfare/schemes'); if (a) setFunds(data.items || []); } catch { if (a) setFunds([]); } })(); return () => { a = false; }; }, []);
  return (
    <>
      <Hero crumbs={['Welfare & Social', 'Overview']} title="Welfare & Social"/>
      <KpiBand>
        <Kpi Icon={HandCoins} label="Active loans" value={ov ? ov.loans.active : '—'} pill={ov && ov.loans.pending ? [`${ov.loans.pending} pending`, 'amber'] : null} foot={<span>being repaid</span>} onClick={() => onDrill('loans')} />
        <Kpi Icon={Wallet} iconColor={C.amber} iconBg={C.amberBg} label="Loan outstanding" value={ov ? money(ov.loans.outstanding) : '—'} foot={<span>total balance</span>} onClick={() => onDrill('loans')} />
        <Kpi Icon={AlertTriangle} iconColor={C.amber} iconBg={C.amberBg} label="Pending claims" value={ov ? ov.claims.pending : '—'} foot={<span>awaiting review / payment</span>} onClick={() => onDrill('claims')} />
        <Kpi Icon={CheckCircle2} iconColor={C.green} iconBg={C.greenBg} label="Claims paid" value={ov ? money(ov.claims.paidTotal) : '—'} pill={ov ? [`${ov.claims.paid} paid`, 'green'] : null} foot={<span>this year</span>} onClick={() => onDrill('claims')} />
        <Kpi Icon={PiggyBank} iconColor={C.navy} iconBg={C.greyBg} label="Welfare fund balance" value={ov ? money(ov.funds.balance) : '—'} foot={<span>{ov ? `${ov.funds.schemes} scheme(s)` : ''}</span>} onClick={() => onDrill('schemes')} />
      </KpiBand>
      <Body cols="minmax(0,1fr) 340px">
        <Card title="Claims by category" sub={ov ? `${ov.byCategory.reduce((a, x) => a + x.value, 0)} total` : ''}>
          {!ov ? <Empty>Loading…</Empty> : ov.byCategory.length === 0 ? <Empty>No claims recorded yet.</Empty> : (
            <div style={{ padding: '4px 4px 8px' }}>
              {ov.byCategory.map((r) => { const max = Math.max(...ov.byCategory.map((x) => x.value), 1); return (
                <button key={r.label} onClick={() => onDrill('claims')} className="nx-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '5px 6px', borderRadius: 8, textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 116, fontSize: '.82rem', color: C.ink, textTransform: 'capitalize', fontWeight: 500 }}>{label(CLAIM_CATS, r.label)}</span>
                  <div style={{ flex: 1, height: 8, background: C.greyBg, borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(r.value / max) * 100}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,${C.accent},${C.navy})` }} /></div>
                  <span style={{ ...NUM, width: 28, textAlign: 'right', fontWeight: 800, color: C.navy, fontSize: '.85rem' }}>{r.value}</span>
                </button>
              ); })}
            </div>
          )}
        </Card>
        <Card title="Welfare funds" sub="live balances">
          {!funds ? <Empty>Loading…</Empty> : funds.length === 0 ? <Empty>No schemes yet.</Empty> : (
            <div style={{ padding: '2px 2px' }}>
              {funds.slice(0, 5).map((s, i) => (
                <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 6px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center', background: [C.greenBg, '#e6f1fd', '#f3eefe', C.amberBg, C.greyBg][i % 5], color: [C.green, C.accentInk, C.purple, C.amber, C.navy][i % 5] }}><PiggyBank size={18} /></div>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, color: C.ink, fontSize: '.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div><div style={{ ...NUM, fontSize: '.72rem', color: C.muted2 }}>{s.memberCount || 0} members · {label(SCHEME_TYPES, s.type)}</div></div>
                  <div style={{ marginLeft: 'auto', ...NUM, fontWeight: 800, color: C.navy, fontSize: '.9rem' }}>{money(s.balance, s.currency)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Body>
      <div style={{ padding: '22px 32px 0', color: C.muted2, fontSize: '.76rem' }}>Figures reflect your live welfare records.</div>
    </>
  );
}

/* ============================ LOANS ============================ */
function Loans({ ov, canWrite, canApprove, setMsg, onChange }) {
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('all'); const [type, setType] = useState('all');
  const [modal, setModal] = useState(false); const [open, setOpen] = useState(null); const [reload, setReload] = useState(0);
  const refresh = useCallback(() => { setReload((n) => n + 1); onChange && onChange(); }, [onChange]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/welfare/loans', { params: { status, type } }); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [status, type, reload]);

  function exportLoans() {
    exportTable({
      filename: 'Staff_Loans.xlsx', sheet: 'Loans', title: 'Staff Loans & Advances', subtitle: 'Loan register',
      filters: { Status: status === 'all' ? 'All' : (LOAN_STATUS[status] || [status])[0], Type: type === 'all' ? 'All' : label(LOAN_TYPES, type) },
      columns: [
        { label: 'Loan No.', key: 'no', width: 16 }, { label: 'Employee', key: 'emp', width: 24 }, { label: 'Type', key: 'type', width: 14 },
        { label: 'Principal', key: 'principal', width: 14, align: 'right' }, { label: 'Repayable', key: 'repayable', width: 14, align: 'right' },
        { label: 'Monthly', key: 'monthly', width: 12, align: 'right' }, { label: 'Balance', key: 'balance', width: 14, align: 'right' },
        { label: 'Status', key: 'stat', width: 14, align: 'center', color: (v, r) => tone(LOAN_STATUS[r.statKey]) },
      ],
      rows: (items || []).map((l) => ({ no: l.loanNumber, emp: fullName(l.employee), type: label(LOAN_TYPES, l.type), principal: l.principal, repayable: l.totalRepayable || l.principal, monthly: l.monthlyDeduction || 0, balance: l.balance || 0, stat: (LOAN_STATUS[l.status] || [l.status])[0], statKey: l.status })),
    });
  }
  if (open) return <LoanDrawer id={open} canApprove={canApprove} canWrite={canWrite} onBack={() => { setOpen(null); refresh(); }} setMsg={setMsg} />;

  return (
    <>
      <Hero crumbs={['Welfare & Social', 'Loans & Advances']} title="Loans & Advances"
        actions={<>{items && items.length > 0 && <HeroBtn ghost onClick={exportLoans} Icon={TrendingUp}>Export</HeroBtn>}{canWrite && <HeroBtn onClick={() => setModal(true)} Icon={Plus}>New loan</HeroBtn>}</>} />
      <KpiBand>
        <Kpi Icon={Wallet} label="Outstanding balance" value={ov ? money(ov.loans.outstanding) : '—'} pill={ov ? [`${ov.loans.active} active`, 'blue'] : null} foot={<span>across all facilities</span>} />
        <Kpi Icon={Clock} iconColor={C.amber} iconBg={C.amberBg} label="Awaiting approval" value={ov ? ov.loans.pending : '—'} pill={ov && ov.loans.pending ? ['in queue', 'amber'] : null} foot={<span>pending decision</span>} />
        <Kpi Icon={CheckCircle2} iconColor={C.green} iconBg={C.greenBg} label="Completed" value={ov ? (ov.loans.completed ?? '—') : '—'} foot={<span>fully repaid</span>} />
        <Kpi Icon={HandCoins} iconColor={C.navy} iconBg={C.greyBg} label="Total facilities" value={items ? items.length : '—'} foot={<span>in current view</span>} />
      </KpiBand>
      <Body>
        <Card title="Loan register" sub={items ? `${items.length} in view` : ''} right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Select value={status} onChange={setStatus}><option value="all">All statuses</option>{Object.entries(LOAN_STATUS).map(([v, l]) => <option key={v} value={v}>{l[0]}</option>)}</Select>
            <Select value={type} onChange={setType}><option value="all">All types</option>{LOAN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </div>
        }>
          {!items ? <Empty>Loading…</Empty> : items.length === 0 ? <Empty>No loans in this view.</Empty> : (
            <TableWrap head={[['Ref'], ['Employee'], ['Type'], ['Principal', 'r'], ['Repayment progress'], ['Outstanding', 'r'], ['Status'], ['', 'r']]}>
              {items.map((l) => { const pct = l.totalRepayable ? Math.round(((l.totalRepayable - l.balance) / l.totalRepayable) * 100) : 0; const repaid = (l.totalRepayable || l.principal) - (l.balance || 0); return (
                <tr key={l._id} className="nx-row" onClick={() => setOpen(l._id)} style={rowStyle}>
                  <td style={td}><span style={{ ...NUM, fontWeight: 700, color: C.accentInk }}>{l.loanNumber}</span></td>
                  <td style={td}><EmpCell e={l.employee} /></td>
                  <td style={td}><Pill tone={l.type === 'salary_advance' ? 'blue' : 'grey'}>{label(LOAN_TYPES, l.type)}</Pill></td>
                  <td style={{ ...td, textAlign: 'right', ...NUM }}>{money(l.principal, l.currency)}</td>
                  <td style={td}>{['active', 'completed'].includes(l.status) ? <Progress pct={pct} note={`${pct}% · ${money(repaid, l.currency)} repaid`} /> : <span style={{ fontSize: '.72rem', color: C.muted2 }}>{l.status === 'approved' ? 'Awaiting first deduction' : '—'}</span>}</td>
                  <td style={{ ...td, textAlign: 'right', ...NUM, fontWeight: 700 }}>{money(l.balance, l.currency)}</td>
                  <td style={td}><StatusPill map={LOAN_STATUS} k={l.status} /></td>
                  <td style={{ ...td, textAlign: 'right' }}><ChevronRight size={16} color={C.muted2} /></td>
                </tr>
              ); })}
            </TableWrap>
          )}
        </Card>
      </Body>
      {modal && <LoanModal onClose={() => setModal(false)} onSaved={(id) => { setModal(false); refresh(); setOpen(id); }} />}
    </>
  );
}

function LoanModal({ onClose, onSaved }) {
  const employees = useEmployees();
  const [f, setF] = useState({ employee: '', type: 'loan', principal: '', interestRatePct: '', termMonths: '12', currency: 'GHS', reason: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.employee || !f.principal) { setErr('Employee and principal are required.'); return; }
    setBusy(true); setErr('');
    try { const { data } = await api.post('/welfare/loans', { ...f, principal: Number(f.principal), interestRatePct: Number(f.interestRatePct) || 0, termMonths: Number(f.termMonths) || 1 }); onSaved(data._id); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not create.'); } finally { setBusy(false); }
  }
  const total = Math.round((Number(f.principal) || 0) * (1 + (Number(f.interestRatePct) || 0) / 100));
  const monthly = f.termMonths ? Math.ceil(total / Number(f.termMonths)) : 0;
  return (
    <Overlay onClose={onClose} title="New loan / advance">
      {err && <ErrBox>{err}</ErrBox>}
      <Lbl>Employee</Lbl>
      <select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} style={{ ...inp, marginBottom: 12 }}><option value="">Select…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>)}</select>
      <Row2><Sel label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={LOAN_TYPES} /><Field label="Currency" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} /></Row2>
      <Row2><Field label="Principal" type="number" value={f.principal} onChange={(v) => setF({ ...f, principal: v })} /><Field label="Interest % (flat)" type="number" value={f.interestRatePct} onChange={(v) => setF({ ...f, interestRatePct: v })} /></Row2>
      <Field label="Term (months)" type="number" value={f.termMonths} onChange={(v) => setF({ ...f, termMonths: v })} />
      {Number(f.principal) > 0 && <div style={{ background: C.hero3, border: `1px solid #cfe3f5`, borderRadius: 9, padding: '10px 12px', fontSize: '.82rem', color: C.ink, marginBottom: 12 }}>Total repayable <b style={NUM}>{money(total, f.currency)}</b> · Monthly deduction <b style={NUM}>{money(monthly, f.currency)}</b> <span style={{ color: C.muted2 }}>(finalised on approval)</span></div>}
      <Lbl>Reason</Lbl><textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} style={ta} />
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label="Submit request" />
    </Overlay>
  );
}

function LoanDrawer({ id, canApprove, canWrite, onBack, setMsg }) {
  const [l, setL] = useState(null); const [reload, setReload] = useState(0);
  const [rp, setRp] = useState({ amount: '', method: 'payroll_deduction', reference: '', note: '' });
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get(`/welfare/loans/${id}`); if (a) setL(data); } catch { /* */ } })(); return () => { a = false; }; }, [id, reload]);
  async function decide(decision) { setBusy(true); setErr(''); try { await api.patch(`/welfare/loans/${id}/decision`, { decision, decisionNote: note }); setMsg(decision === 'approve' ? 'Loan approved.' : 'Loan rejected.'); setReload((n) => n + 1); } catch (e) { setErr(e?.response?.data?.message || 'Failed.'); } finally { setBusy(false); } }
  async function repay() { if (!rp.amount) return; setBusy(true); setErr(''); try { await api.post(`/welfare/loans/${id}/repayment`, { ...rp, amount: Number(rp.amount) }); setRp({ amount: '', method: 'payroll_deduction', reference: '', note: '' }); setMsg('Repayment recorded.'); setReload((n) => n + 1); } catch (e) { setErr(e?.response?.data?.message || 'Failed.'); } finally { setBusy(false); } }
  const pct = l && l.totalRepayable ? Math.round(((l.totalRepayable - l.balance) / l.totalRepayable) * 100) : 0;
  return (
    <>
      <SubHero onBack={onBack} backLabel="Back to loans" crumbs={['Loans & Advances', l ? l.loanNumber : '…']}
        title={l ? l.loanNumber : 'Loading…'} statusEl={l && <StatusPill map={LOAN_STATUS} k={l.status} />} meta={l && `${fullName(l.employee)} · ${label(LOAN_TYPES, l.type)}`} />
      <Body cols="minmax(0,1fr) minmax(0,1fr)">
        {!l ? <Empty>Loading…</Empty> : <>
          {err && <div style={{ gridColumn: '1 / -1' }}><ErrBox>{err}</ErrBox></div>}
          <Card title="Loan summary">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '4px 2px' }}>
              <Info label="Principal" value={money(l.principal, l.currency)} /><Info label="Interest" value={`${l.interestRatePct || 0}%`} />
              <Info label="Total repayable" value={money(l.totalRepayable || l.principal, l.currency)} /><Info label="Term" value={`${l.termMonths} mo`} />
              <Info label="Monthly deduction" value={l.monthlyDeduction ? money(l.monthlyDeduction, l.currency) : '—'} /><Info label="Outstanding" value={money(l.balance, l.currency)} strong />
            </div>
            {l.totalRepayable > 0 && <div style={{ marginTop: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.76rem', color: C.muted, marginBottom: 5, fontWeight: 600 }}><span>Repaid</span><span style={NUM}>{pct}%</span></div><div style={{ height: 8, background: C.greyBg, borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,#2bb673,${C.green})` }} /></div></div>}
            {l.reason && <div style={{ marginTop: 14 }}><Lbl>Reason</Lbl><div style={{ fontSize: '.85rem', color: C.ink }}>{l.reason}</div></div>}
            {canApprove && l.status === 'requested' && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
                <Lbl>Decision note</Lbl><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={ta} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => decide('reject')} disabled={busy} style={{ ...ghostBtn, color: C.red, borderColor: '#f6c9cb' }}>Reject</button><button onClick={() => decide('approve')} disabled={busy} style={primaryBtn}>Approve loan</button></div>
              </div>
            )}
          </Card>
          <Card title="Repayments" sub={`${(l.repayments || []).length} recorded`}>
            {['active', 'approved'].includes(l.status) && canWrite && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 11, padding: 13, marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input type="number" value={rp.amount} onChange={(e) => setRp({ ...rp, amount: e.target.value })} placeholder="Amount" style={inp} />
                  <select value={rp.method} onChange={(e) => setRp({ ...rp, method: e.target.value })} style={inp}>{METHODS.map(([v, m]) => <option key={v} value={v}>{m}</option>)}</select>
                </div>
                <input value={rp.reference} onChange={(e) => setRp({ ...rp, reference: e.target.value })} placeholder="Reference (optional)" style={{ ...inp, marginBottom: 8 }} />
                <div style={{ textAlign: 'right' }}><button onClick={repay} disabled={busy || !rp.amount} style={primaryBtn}>Record repayment</button></div>
              </div>
            )}
            {(l.repayments || []).length === 0 ? <Empty>No repayments yet.</Empty> : (
              <TableWrap head={[['Date'], ['Amount', 'r'], ['Method'], ['Balance', 'r']]}>
                {(l.repayments || []).slice().reverse().map((r, i) => <tr key={i} style={{ borderTop: `1px solid ${C.lineSoft}` }}><td style={td}>{fmtDate(r.date)}</td><td style={{ ...td, textAlign: 'right', ...NUM }}>{money(r.amount, l.currency)}</td><td style={{ ...td, textTransform: 'capitalize' }}>{cap(r.method)}</td><td style={{ ...td, textAlign: 'right', color: C.muted2, ...NUM }}>{money(r.balanceAfter, l.currency)}</td></tr>)}
              </TableWrap>
            )}
          </Card>
        </>}
      </Body>
    </>
  );
}

/* ============================ CLAIMS ============================ */
function Claims({ ov, canWrite, canApprove, setMsg, onChange }) {
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('all'); const [cat, setCat] = useState('all');
  const [modal, setModal] = useState(false); const [open, setOpen] = useState(null); const [reload, setReload] = useState(0);
  const refresh = useCallback(() => { setReload((n) => n + 1); onChange && onChange(); }, [onChange]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/welfare/claims', { params: { status, category: cat } }); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [status, cat, reload]);
  function exportClaims() {
    exportTable({
      filename: 'Welfare_Claims.xlsx', sheet: 'Claims', title: 'Welfare Claims', subtitle: 'Benefit & welfare claims',
      filters: { Status: status === 'all' ? 'All' : (CLAIM_STATUS[status] || [status])[0], Category: cat === 'all' ? 'All' : label(CLAIM_CATS, cat) },
      columns: [
        { label: 'Claim No.', key: 'no', width: 16 }, { label: 'Employee', key: 'emp', width: 24 }, { label: 'Category', key: 'catL', width: 14 },
        { label: 'Requested', key: 'req', width: 14, align: 'right' }, { label: 'Approved', key: 'app', width: 14, align: 'right' },
        { label: 'Status', key: 'stat', width: 14, align: 'center', color: (v, r) => tone(CLAIM_STATUS[r.statKey]) }, { label: 'Reported', key: 'reported', width: 14 },
      ],
      rows: (items || []).map((cl) => ({ no: cl.claimNumber, emp: fullName(cl.employee), catL: label(CLAIM_CATS, cl.category), req: cl.amountRequested || 0, app: cl.amountApproved || 0, stat: (CLAIM_STATUS[cl.status] || [cl.status])[0], statKey: cl.status, reported: fmtDate(cl.createdAt) })),
    });
  }
  if (open) return <ClaimDrawer id={open} canApprove={canApprove} canWrite={canWrite} onBack={() => { setOpen(null); refresh(); }} setMsg={setMsg} />;
  return (
    <>
      <Hero crumbs={['Welfare & Social', 'Welfare Claims']} title="Welfare Claims"
        
        actions={<>{items && items.length > 0 && <HeroBtn ghost onClick={exportClaims} Icon={TrendingUp}>Export</HeroBtn>}{canWrite && <HeroBtn onClick={() => setModal(true)} Icon={Plus}>New claim</HeroBtn>}</>} />
      <KpiBand>
        <Kpi Icon={AlertTriangle} iconColor={C.amber} iconBg={C.amberBg} label="Pending claims" value={ov ? ov.claims.pending : '—'} pill={ov && ov.claims.pending ? ['action needed', 'amber'] : null} foot={<span>awaiting review / payment</span>} />
        <Kpi Icon={CheckCircle2} iconColor={C.green} iconBg={C.greenBg} label="Paid this year" value={ov ? money(ov.claims.paidTotal) : '—'} pill={ov ? [`${ov.claims.paid} paid`, 'green'] : null} foot={<span>disbursed to staff</span>} />
        <Kpi Icon={ShieldCheck} label="Approved" value={ov ? (ov.claims.approved ?? '—') : '—'} foot={<span>ready for payout</span>} />
        <Kpi Icon={HeartHandshake} iconColor={C.navy} iconBg={C.greyBg} label="Total claims" value={items ? items.length : '—'} foot={<span>in current view</span>} />
      </KpiBand>
      <Body>
        <Card title="Claim register" sub={items ? `${items.length} in view` : ''} right={
          <div style={{ display: 'flex', gap: 8 }}>
            <Select value={status} onChange={setStatus}><option value="all">All statuses</option>{Object.entries(CLAIM_STATUS).map(([v, l]) => <option key={v} value={v}>{l[0]}</option>)}</Select>
            <Select value={cat} onChange={setCat}><option value="all">All categories</option>{CLAIM_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </div>
        }>
          {!items ? <Empty>Loading…</Empty> : items.length === 0 ? <Empty>No claims in this view.</Empty> : (
            <TableWrap head={[['Ref'], ['Employee'], ['Category'], ['Requested', 'r'], ['Approved', 'r'], ['Status'], ['', 'r']]}>
              {items.map((cl) => (
                <tr key={cl._id} className="nx-row" onClick={() => setOpen(cl._id)} style={rowStyle}>
                  <td style={td}><span style={{ ...NUM, fontWeight: 700, color: C.accentInk }}>{cl.claimNumber}</span></td>
                  <td style={td}><EmpCell e={cl.employee} /></td>
                  <td style={td}><Pill tone="grey">{label(CLAIM_CATS, cl.category)}</Pill></td>
                  <td style={{ ...td, textAlign: 'right', ...NUM }}>{money(cl.amountRequested, cl.currency)}</td>
                  <td style={{ ...td, textAlign: 'right', ...NUM, fontWeight: 700 }}>{cl.amountApproved ? money(cl.amountApproved, cl.currency) : '—'}</td>
                  <td style={td}><StatusPill map={CLAIM_STATUS} k={cl.status} /></td>
                  <td style={{ ...td, textAlign: 'right' }}><ChevronRight size={16} color={C.muted2} /></td>
                </tr>
              ))}
            </TableWrap>
          )}
        </Card>
      </Body>
      {modal && <ClaimModal onClose={() => setModal(false)} onSaved={(id) => { setModal(false); refresh(); setOpen(id); }} />}
    </>
  );
}

function ClaimModal({ onClose, onSaved }) {
  const employees = useEmployees(); const [schemes, setSchemes] = useState([]);
  const [f, setF] = useState({ employee: '', category: 'medical', scheme: '', amountRequested: '', currency: 'GHS', description: '', relationship: '', incidentDate: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { (async () => { try { const { data } = await api.get('/welfare/schemes', { params: { active: true } }); setSchemes(data.items || []); } catch { /* */ } })(); }, []);
  async function submit() {
    if (!f.employee) { setErr('Select an employee.'); return; }
    setBusy(true); setErr('');
    try { const { data } = await api.post('/welfare/claims', { ...f, scheme: f.scheme || null, amountRequested: Number(f.amountRequested) || 0, incidentDate: f.incidentDate || null }); onSaved(data._id); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not create.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose} title="New welfare claim">
      {err && <ErrBox>{err}</ErrBox>}
      <Lbl>Employee</Lbl>
      <select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} style={{ ...inp, marginBottom: 12 }}><option value="">Select…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>)}</select>
      <Row2><Sel label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CLAIM_CATS} /><Field label="Amount requested" type="number" value={f.amountRequested} onChange={(v) => setF({ ...f, amountRequested: v })} /></Row2>
      <Row2>
        <div><Lbl>Pay from scheme (optional)</Lbl><select value={f.scheme} onChange={(e) => setF({ ...f, scheme: e.target.value })} style={inp}><option value="">—</option>{schemes.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
        <Field label="Incident date" type="date" value={f.incidentDate} onChange={(v) => setF({ ...f, incidentDate: v })} />
      </Row2>
      {f.category === 'bereavement' && <Field label="Relationship to deceased" value={f.relationship} onChange={(v) => setF({ ...f, relationship: v })} placeholder="e.g. Father, Spouse" />}
      <Lbl>Description</Lbl><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} style={ta} />
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label="Submit claim" />
    </Overlay>
  );
}

function ClaimDrawer({ id, canApprove, canWrite, onBack, setMsg }) {
  const [cl, setCl] = useState(null); const [reload, setReload] = useState(0);
  const [amt, setAmt] = useState(''); const [note, setNote] = useState(''); const [payRef, setPayRef] = useState('');
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [preview, setPreview] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get(`/welfare/claims/${id}`); if (a) { setCl(data); setAmt(data.amountApproved || data.amountRequested || ''); } } catch { /* */ } })(); return () => { a = false; }; }, [id, reload]);
  async function decide(decision) { setBusy(true); setErr(''); try { await api.patch(`/welfare/claims/${id}/decision`, { decision, amountApproved: Number(amt) || 0, decisionNote: note }); setMsg('Decision saved.'); setReload((n) => n + 1); } catch (e) { setErr(e?.response?.data?.message || 'Failed.'); } finally { setBusy(false); } }
  async function pay() { setBusy(true); setErr(''); try { await api.patch(`/welfare/claims/${id}/pay`, { paymentReference: payRef }); setMsg('Claim marked paid.'); setReload((n) => n + 1); } catch (e) { setErr(e?.response?.data?.message || 'Failed.'); } finally { setBusy(false); } }
  async function upload() { if (!file) return; setBusy(true); setErr(''); try { const fd = new FormData(); fd.append('file', file); await api.post(`/welfare/claims/${id}/documents`, fd); setFile(null); setReload((n) => n + 1); } catch (e) { setErr(e?.response?.data?.message || 'Upload failed.'); } finally { setBusy(false); } }
  return (
    <>
      <SubHero onBack={onBack} backLabel="Back to claims" crumbs={['Welfare Claims', cl ? cl.claimNumber : '…']}
        title={cl ? cl.claimNumber : 'Loading…'} statusEl={cl && <StatusPill map={CLAIM_STATUS} k={cl.status} />} meta={cl && `${fullName(cl.employee)} · ${label(CLAIM_CATS, cl.category)}`} />
      <Body cols="minmax(0,1fr) minmax(0,1fr)">
        {!cl ? <Empty>Loading…</Empty> : <>
          {err && <div style={{ gridColumn: '1 / -1' }}><ErrBox>{err}</ErrBox></div>}
          <Card title="Claim details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '4px 2px' }}>
              <Info label="Requested" value={money(cl.amountRequested, cl.currency)} /><Info label="Approved" value={cl.amountApproved ? money(cl.amountApproved, cl.currency) : '—'} strong />
              <Info label="Scheme" value={cl.scheme?.name || '—'} /><Info label="Incident" value={fmtDate(cl.incidentDate)} />
              {cl.relationship && <Info label="Relationship" value={cl.relationship} />}
              {cl.paidDate && <Info label="Paid" value={fmtDate(cl.paidDate)} />}
            </div>
            {cl.description && <div style={{ marginTop: 14 }}><Lbl>Description</Lbl><div style={{ fontSize: '.85rem', color: C.ink, lineHeight: 1.5 }}>{cl.description}</div></div>}
            {cl.decisionNote && <div style={{ marginTop: 12 }}><Lbl>Decision note</Lbl><div style={{ fontSize: '.82rem', color: C.muted }}>{cl.decisionNote}</div></div>}
            {canApprove && ['submitted', 'under_review'].includes(cl.status) && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
                <Row2><Field label="Amount to approve" type="number" value={amt} onChange={setAmt} /><div /></Row2>
                <Lbl>Decision note</Lbl><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={ta} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => decide('reject')} disabled={busy} style={{ ...ghostBtn, color: C.red, borderColor: '#f6c9cb' }}>Reject</button>
                  {cl.status === 'submitted' && <button onClick={() => decide('review')} disabled={busy} style={ghostBtn}>Mark under review</button>}
                  <button onClick={() => decide('approve')} disabled={busy} style={primaryBtn}>Approve</button>
                </div>
              </div>
            )}
            {canWrite && cl.status === 'approved' && (
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14 }}>
                <Field label="Payment reference" value={payRef} onChange={setPayRef} placeholder="cheque / transfer ref" />
                <div style={{ textAlign: 'right' }}><button onClick={pay} disabled={busy} style={primaryBtn}>Mark as paid</button></div>
              </div>
            )}
          </Card>
          <Card title="Supporting documents" sub={`${(cl.documents || []).length} file(s)`}>
            {canWrite && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: '.82rem', flex: 1 }} />
                <button onClick={upload} disabled={busy || !file} style={{ ...primaryBtn, opacity: busy || !file ? 0.6 : 1 }}>Upload</button>
              </div>
            )}
            {(cl.documents || []).length === 0 ? <Empty>No documents attached.</Empty> : (cl.documents || []).map((d) => (
              <div key={d._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: `1px solid ${C.lineSoft}`, fontSize: '.83rem' }}>
                <Paperclip size={14} color={C.muted2} /><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <button onClick={() => setPreview(d)} style={miniBtn(C.accent)}>Preview</button>
                <a href={d.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>Open</a>
              </div>
            ))}
          </Card>
        </>}
      </Body>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

/* ============================ SCHEMES ============================ */
function Schemes({ ov, canWrite, canApprove, setMsg, onChange }) {
  const [items, setItems] = useState(null); const [modal, setModal] = useState(null); const [open, setOpen] = useState(null); const [reload, setReload] = useState(0);
  const refresh = useCallback(() => { setReload((n) => n + 1); onChange && onChange(); }, [onChange]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/welfare/schemes'); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [reload]);
  async function del(s) { if (!window.confirm(`Delete scheme "${s.name}"?`)) return; try { await api.delete(`/welfare/schemes/${s._id}`); setMsg('Scheme deleted.'); refresh(); } catch (e) { setMsg(e?.response?.data?.message || 'Could not delete.'); } }
  if (open) return <SchemeDrawer id={open} canWrite={canWrite} onBack={() => { setOpen(null); refresh(); }} setMsg={setMsg} />;
  const totalBal = (items || []).reduce((a, s) => a + (s.balance || 0), 0);
  const totalContrib = (items || []).reduce((a, s) => a + (s.contributions || 0), 0);
  return (
    <>
      <Hero crumbs={['Welfare & Social', 'Schemes & Contributions']} title="Schemes & Contributions"
        actions={canWrite && <HeroBtn onClick={() => setModal({})} Icon={Plus}>New scheme</HeroBtn>} />
      <KpiBand>
        <Kpi Icon={PiggyBank} iconColor={C.green} iconBg={C.greenBg} label="Total fund balance" value={items ? money(totalBal) : '—'} foot={<span>across all schemes</span>} />
        <Kpi Icon={Wallet} label="Contributed" value={items ? money(totalContrib) : '—'} foot={<span>all-time</span>} />
        <Kpi Icon={HeartHandshake} iconColor={C.amber} iconBg={C.amberBg} label="Paid from funds" value={ov ? money(ov.claims.paidTotal) : '—'} foot={<span>welfare claims</span>} />
        <Kpi Icon={PiggyBank} iconColor={C.navy} iconBg={C.greyBg} label="Active schemes" value={items ? items.filter((s) => s.active).length : '—'} foot={<span>of {items ? items.length : '—'} total</span>} />
      </KpiBand>
      <Body>
        <div>
          {!items ? <Empty>Loading…</Empty> : items.length === 0 ? <Card><Empty>No welfare schemes yet.</Empty></Card> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
              {items.map((s, i) => (
                <div key={s._id} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', background: [C.greenBg, '#e6f1fd', '#f3eefe', C.amberBg, C.greyBg][i % 5], color: [C.green, C.accentInk, C.purple, C.amber, C.navy][i % 5] }}><PiggyBank size={20} /></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Pill tone="grey">{label(SCHEME_TYPES, s.type)}</Pill>
                      {!s.active && <Pill tone="red">Inactive</Pill>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.05rem', margin: '12px 0 3px' }}>{s.name}</div>
                  <div style={{ ...NUM, color: C.muted2, fontSize: '.76rem', marginBottom: 14 }}>{s.memberCount || 0} member(s) · {s.contributionCount || 0} contribution(s)</div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <MiniStat label="Balance" value={money(s.balance, s.currency)} color={C.green} />
                    <MiniStat label="Contributed" value={money(s.contributions, s.currency)} color={C.accentInk} />
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => setOpen(s._id)} style={{ ...primaryBtn, padding: '8px 14px', fontSize: '.82rem' }}>Open ledger</button>
                    {canWrite && <button onClick={() => setModal(s)} style={miniBtn(C.muted)}>Edit</button>}
                    {canApprove && <button onClick={() => del(s)} title="Delete" style={{ ...miniBtn(C.red), marginLeft: 'auto' }}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Body>
      {modal && <SchemeModal scheme={modal._id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg('Scheme saved.'); refresh(); }} />}
    </>
  );
}

function SchemeModal({ scheme, onClose, onSaved }) {
  const editing = !!scheme;
  const [f, setF] = useState({ name: scheme?.name || '', code: scheme?.code || '', type: scheme?.type || 'welfare_fund', description: scheme?.description || '', contributionAmount: scheme?.contributionAmount || '', frequency: scheme?.frequency || 'monthly', currency: scheme?.currency || 'GHS', openingBalance: scheme?.openingBalance || '', active: scheme?.active ?? true });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.name.trim()) { setErr('A name is required.'); return; }
    setBusy(true); setErr('');
    const payload = { ...f, contributionAmount: Number(f.contributionAmount) || 0, openingBalance: Number(f.openingBalance) || 0 };
    try { if (editing) await api.put(`/welfare/schemes/${scheme._id}`, payload); else await api.post('/welfare/schemes', payload); onSaved(); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose} title={editing ? 'Edit scheme' : 'New welfare scheme'}>
      {err && <ErrBox>{err}</ErrBox>}
      <Row2><Field label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><Field label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v })} /></Row2>
      <Row2><Sel label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={SCHEME_TYPES} /><Sel label="Frequency" value={f.frequency} onChange={(v) => setF({ ...f, frequency: v })} options={FREQ} /></Row2>
      <Row2><Field label="Standard contribution" type="number" value={f.contributionAmount} onChange={(v) => setF({ ...f, contributionAmount: v })} /><Field label="Opening balance" type="number" value={f.openingBalance} onChange={(v) => setF({ ...f, openingBalance: v })} /></Row2>
      <Field label="Currency" value={f.currency} onChange={(v) => setF({ ...f, currency: v })} />
      <Lbl>Description</Lbl><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} style={ta} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, marginBottom: 12 }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label={editing ? 'Save' : 'Create scheme'} />
    </Overlay>
  );
}

function SchemeDrawer({ id, canWrite, onBack, setMsg }) {
  const employees = useEmployees();
  const [s, setS] = useState(null); const [reload, setReload] = useState(0);
  const [c1, setC1] = useState({ employee: '', amount: '', period: '', method: 'payroll_deduction' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get(`/welfare/schemes/${id}`); if (a) { setS(data); setC1((x) => ({ ...x, amount: x.amount || data.contributionAmount || '' })); } } catch { /* */ } })(); return () => { a = false; }; }, [id, reload]);
  async function add() { if (!c1.employee || !c1.amount) { setErr('Employee and amount are required.'); return; } setBusy(true); setErr(''); try { await api.post(`/welfare/schemes/${id}/contributions`, { ...c1, amount: Number(c1.amount) }); setC1({ employee: '', amount: s?.contributionAmount || '', period: '', method: 'payroll_deduction' }); setMsg('Contribution recorded.'); setReload((n) => n + 1); } catch (e) { setErr(e?.response?.data?.message || 'Failed.'); } finally { setBusy(false); } }
  async function del(cid) { try { await api.delete(`/welfare/schemes/${id}/contributions/${cid}`); setReload((n) => n + 1); } catch { /* */ } }
  // The ledger is an ARRAY; guard in case an older server sends a summary number.
  const ledger = Array.isArray(s?.contributions) ? s.contributions : [];
  const totalContributed = typeof s?.totalContributed === 'number'
    ? s.totalContributed
    : ledger.reduce((a, c) => a + (c.amount || 0), 0);
  const members = new Set(ledger.map((x) => String(x.employee?._id || x.employee))).size;
  return (
    <>
      <SubHero onBack={onBack} backLabel="Back to schemes" crumbs={['Schemes & Contributions', s ? s.name : '…']}
        title={s ? s.name : 'Loading…'} statusEl={s && <Pill tone="grey">{label(SCHEME_TYPES, s.type)}</Pill>} meta={s && `${s.frequency ? cap(s.frequency) : ''} contributions`} />
      {s && <KpiBand>
        <Kpi Icon={PiggyBank} iconColor={C.green} iconBg={C.greenBg} label="Fund balance" value={money(s.balance, s.currency)} foot={<span>opening + in − paid</span>} />
        <Kpi Icon={Wallet} label="Contributions" value={money(totalContributed, s.currency)} foot={<span>all-time</span>} />
        <Kpi Icon={HeartHandshake} iconColor={C.amber} iconBg={C.amberBg} label="Paid out" value={money(s.paidOut, s.currency)} foot={<span>claims from fund</span>} />
        <Kpi Icon={Users} iconColor={C.navy} iconBg={C.greyBg} label="Members" value={members} foot={<span>contributors</span>} />
      </KpiBand>}
      <Body>
        {!s ? <Empty>Loading…</Empty> : <div>
          {err && <ErrBox>{err}</ErrBox>}
          {canWrite && (
            <Card title="Record contribution">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr auto', gap: 8, alignItems: 'end', padding: '4px 2px' }}>
                <div><Lbl>Employee</Lbl><select value={c1.employee} onChange={(e) => setC1({ ...c1, employee: e.target.value })} style={inp}><option value="">Select…</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></div>
                <Field label="Amount" type="number" value={c1.amount} onChange={(v) => setC1({ ...c1, amount: v })} />
                <Field label="Period" value={c1.period} onChange={(v) => setC1({ ...c1, period: v })} placeholder="2026-09" />
                <div><Lbl>Method</Lbl><select value={c1.method} onChange={(e) => setC1({ ...c1, method: e.target.value })} style={inp}>{METHODS.map(([v, m]) => <option key={v} value={v}>{m}</option>)}</select></div>
                <button onClick={add} disabled={busy} style={{ ...primaryBtn, height: 40 }}>Add</button>
              </div>
            </Card>
          )}
          <div style={{ marginTop: 18 }}>
            <Card title="Contributions ledger" sub={`${ledger.length} entries`}>
              {ledger.length === 0 ? <Empty>No contributions recorded yet.</Empty> : (
                <TableWrap head={[['Member'], ['Period'], ['Amount', 'r'], ['Method'], ['Date'], ['', 'r']]}>
                  {ledger.slice().reverse().map((c) => (
                    <tr key={c._id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                      <td style={td}><EmpCell e={c.employee} fallback={c.name} /></td>
                      <td style={{ ...td, ...NUM }}>{c.period || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, ...NUM }}>{money(c.amount, s.currency)}</td>
                      <td style={{ ...td, textTransform: 'capitalize' }}>{cap(c.method)}</td>
                      <td style={td}>{fmtDate(c.date)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{canWrite && <button onClick={() => del(c._id)} style={miniBtn(C.red)}>Remove</button>}</td>
                    </tr>
                  ))}
                </TableWrap>
              )}
            </Card>
          </div>
        </div>}
      </Body>
    </>
  );
}

/* ============================ FILE PREVIEW ============================ */
function FilePreview({ file, onClose }) {
  const url = file?.url || '';
  const ext = (String(file?.format || file?.name || url).split('.').pop() || '').toLowerCase().split('?')[0];
  const enc = encodeURIComponent(url);
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
  let body;
  if (isImg) body = <img src={url} alt={file?.name} style={{ maxWidth: '100%', maxHeight: '78vh', display: 'block', margin: '0 auto', borderRadius: 6 }} />;
  else if (isPdf) body = <iframe title="pdf" src={url} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  else if (isOffice) body = <iframe title="office" src={`https://view.officeapps.live.com/op/embed.aspx?src=${enc}`} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  else body = <iframe title="doc" src={`https://docs.google.com/gview?url=${enc}&embedded=true`} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 920, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 44px rgba(1,33,88,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name || 'Document'}</div>
          <div style={{ display: 'flex', gap: 8 }}><a href={url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>Open in new tab</a><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button></div>
        </div>
        <div style={{ padding: 14, background: '#f4f6f9' }}>{body}</div>
      </div>
    </div>
  );
}