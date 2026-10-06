import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { IdCard, User, CalendarDays, Wallet, CalendarClock, Users } from 'lucide-react';
import { ModuleShell, Hero, Body } from '../ui/kit';
import { C } from '../ui/tokens';

/* Self-Service ("My Workspace") — own-data only (/employees/me/*).
   Kit shell: "My Workspace" rail (the five sections) + light-blue identity hero.
   Keeps the leave-approval celebration and all data logic. Scoped "ss-" skin retained. */

const humanize = (v) => (v ? String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const val = (x) => (x === 0 ? '0' : x || '—');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const fmtMoney = (n, ccy) => (n || n === 0 ? `${ccy ? ccy + ' ' : ''}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const nameOf = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '—';
const initialsOf = (p) => ((p?.firstName?.[0] || '') + (p?.lastName?.[0] || '')).toUpperCase() || '?';
const tidyKey = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const fmtPeriod = (p) => { if (!p) return '—'; const [y, m] = String(p).split('-'); if (!y || !m) return p; const d = new Date(Number(y), Number(m) - 1, 1); return isNaN(d.getTime()) ? p : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };
const pickNum = (o, keys) => { for (const k of keys) { const v = o?.[k]; if (v != null && !isNaN(Number(v))) return Number(v); } return null; };
function flattenSlip(obj, prefix = '', out = [], depth = 0) {
  if (depth > 2 || !obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || Array.isArray(v)) continue;
    const label = prefix ? `${prefix} · ${tidyKey(k)}` : tidyKey(k);
    if (typeof v === 'object') flattenSlip(v, label, out, depth + 1); else out.push([label, v]);
  }
  return out;
}

const STATUS_TONE = { active: ['#e7f6ee', '#1a7f47'], suspended: ['#fff4e0', '#9a6400'], terminated: ['#fdeaea', '#b3261e'] };
function Pill({ status }) { const [bg, fg] = STATUS_TONE[status] || ['#eef1f5', '#5b6b7f']; return <span className="ss-pill" style={{ background: bg, color: fg }}>{humanize(status) || 'Active'}</span>; }
const TONES = { pending: ['#fff4e0', '#9a6400'], approved: ['#e7f6ee', '#1a7f47'], paid: ['#e7f6ee', '#1a7f47'], rejected: ['#fdeaea', '#b3261e'], cancelled: ['#eef1f5', '#5b6b7f'], present: ['#e7f6ee', '#1a7f47'], late: ['#fff4e0', '#9a6400'], half_day: ['#fff4e0', '#9a6400'], absent: ['#fdeaea', '#b3261e'], leave: ['#eaf1fb', '#1d5fbf'], rest_day: ['#eef1f5', '#5b6b7f'], holiday: ['#eef1f5', '#5b6b7f'] };
function Tone({ status }) { const [bg, fg] = TONES[status] || ['#eef1f5', '#5b6b7f']; return <span className="ss-pill" style={{ background: bg, color: fg }}>{humanize(status) || '—'}</span>; }

function Fld({ label, children }) { const empty = children == null || children === '' || children === '—'; return <div className="ss-f"><span className="l">{label}</span><span className={'v' + (empty ? ' empty' : '')}>{empty ? '—' : children}</span></div>; }
function Section({ title, children }) { return <div className="ss-section"><div className="ss-sec-title">{title}</div><div className="ss-card"><div className="ss-grid">{children}</div></div></div>; }

function checkCelebrate(requests, employeeId) {
  try {
    const key = `ss_seen_approved_${employeeId}`;
    const approvedIds = requests.filter((r) => r.status === 'approved').map((r) => r._id);
    const stored = localStorage.getItem(key);
    if (stored === null) { localStorage.setItem(key, JSON.stringify(approvedIds)); return null; }
    const seen = new Set(JSON.parse(stored || '[]'));
    const fresh = requests.filter((r) => r.status === 'approved' && !seen.has(r._id));
    if (fresh.length) { localStorage.setItem(key, JSON.stringify(approvedIds)); return { text: `Your ${fresh[0].leaveType?.name || 'leave'} was approved!`, count: fresh.length }; }
  } catch { /* no localStorage — no celebration, no crash */ }
  return null;
}

const SECTIONS = [['details', 'My Details', User], ['leave', 'My Leave', CalendarDays], ['payslips', 'My Payslips', Wallet], ['attendance', 'My Attendance', CalendarClock], ['team', 'My Team', Users]];
const secLabel = (k) => (SECTIONS.find((s) => s[0] === k) || [k, k])[1];

export default function SelfServicePage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [leave, setLeave] = useState(null);
  const [payslips, setPayslips] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('details');
  const [celebrate, setCelebrate] = useState(null);
  const [openSlip, setOpenSlip] = useState(null);

  const [form, setForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formOk, setFormOk] = useState('');

  const loadLeave = useCallback(async (empId, celebrateOnLoad) => {
    try { const { data } = await api.get('/employees/me/leave'); setLeave(data); if (celebrateOnLoad) { const c = checkCelebrate(data.requests || [], empId); if (c) setCelebrate(c); } }
    catch { setLeave({ types: [], requests: [], takenByType: [], pendingCount: 0 }); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotLinked(false);
    try {
      const { data } = await api.get('/employees/me');
      const meDoc = data.item || data.employee || data;
      setMe(meDoc);
      api.get('/employees/me/team').then((t) => setTeam(t.data.items || [])).catch(() => setTeam([]));
      await loadLeave(meDoc._id, true);
    } catch (err) { if (err?.response?.status === 404) setNotLinked(true); else setError(err?.response?.data?.message || 'Could not load your workspace.'); }
    finally { setLoading(false); }
  }, [loadLeave]);
  useEffect(() => { let alive = true; (async () => { if (alive) await load(); })(); return () => { alive = false; }; }, [load]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      if (tab === 'payslips' && payslips === null) { setPayslips({ loading: true }); try { const { data } = await api.get('/employees/me/payslips'); setPayslips({ items: data.items || [] }); } catch (e) { setPayslips({ error: e?.response?.data?.message || 'Could not load payslips.' }); } }
      if (tab === 'attendance' && attendance === null) { setAttendance({ loading: true }); try { const { data } = await api.get('/employees/me/attendance'); setAttendance({ items: data.items || [] }); } catch (e) { setAttendance({ error: e?.response?.data?.message || 'Could not load attendance.' }); } }
    })();
  }, [tab, me, payslips, attendance]);

  useEffect(() => { if (!celebrate) return undefined; const id = setTimeout(() => setCelebrate(null), 4000); return () => clearTimeout(id); }, [celebrate]);

  const submitLeave = async () => {
    if (!form.leaveType || !form.startDate || !form.endDate) { setFormError('Pick a leave type and both dates.'); return; }
    setSubmitting(true); setFormError(''); setFormOk('');
    try { await api.post('/employees/me/leave', form); setForm({ leaveType: '', startDate: '', endDate: '', reason: '' }); setFormOk('Request submitted — it’s now pending approval.'); if (me?._id) await loadLeave(me._id, false); }
    catch (err) { setFormError(err?.response?.data?.message || 'Could not submit your request.'); }
    finally { setSubmitting(false); }
  };

  const pending = leave?.pendingCount || 0;
  const brand = { title: 'My Workspace', subtitle: user?.name || 'Self-service', Icon: IdCard };
  const groups = [{ title: 'My Workspace', items: SECTIONS.map(([key, label, Icon]) => ({ key, label, Icon, count: key === 'leave' ? (pending || 0) : key === 'team' ? (team.length || 0) : 0 })) }];

  if (loading) return <ModuleShell brand={brand} groups={groups} active={tab} onSelect={setTab}><style>{STYLES}</style><Body><p className="ss-muted">Loading your workspace…</p></Body></ModuleShell>;
  if (notLinked) return (
    <ModuleShell brand={brand} groups={groups} active={tab} onSelect={setTab}><style>{STYLES}</style>
      <Hero crumbs={['My Workspace']} title="My Workspace"/>
      <Body><div className="ss-empty">
        <div className="ss-empty-mark">🔗</div>
        <div className="ss-empty-title">Your account isn’t linked to an employee record</div>
        <div className="ss-empty-note">Ask HR to connect your login ({user?.email}) to your employee profile. Once linked, your details, leave, payslips and attendance appear here.</div>
      </div></Body>
    </ModuleShell>
  );
  if (error) return <ModuleShell brand={brand} groups={groups} active={tab} onSelect={setTab}><style>{STYLES}</style><Body><div className="ss-err">{error}</div><button className="ss-btn" onClick={load}>Retry</button></Body></ModuleShell>;
  if (!me) return null;

  const em = me.employment || {};
  const comp = me.compensation || {};
  const pay = me.payment || {};
  const positionTitle = em.positionId && typeof em.positionId === 'object' ? em.positionId.title : '';
  const deptName = em.departmentId && typeof em.departmentId === 'object' ? em.departmentId.name : em.department;
  const sectionName = em.sectionId && typeof em.sectionId === 'object' ? em.sectionId.name : em.section;
  const orgPath = [deptName, sectionName].filter(Boolean).join(' • ');
  const mgr = em.lineManager && typeof em.lineManager === 'object' ? em.lineManager : null;
  const managerName = mgr ? nameOf(mgr) : '';
  const pb = comp.payBasis;
  const facts = [['Staff ID', me.staffId], ['Email', me.email], ['Phone', me.phone], ['Department', deptName], ['Manager', managerName], ['Hired', fmtDate(em.startDate)]];

  return (
    <ModuleShell brand={brand} groups={groups} active={tab} onSelect={setTab}>
      <style>{STYLES}</style>

      {celebrate && (
        <div className="ss-celebrate" onClick={() => setCelebrate(null)}>
          <div className="ss-cel-card">
            <div className="ss-cel-thumbwrap"><span className="ss-cel-ring" /><span className="ss-cel-thumb">👍</span></div>
            <div className="ss-cel-title">Leave approved!</div>
            <div className="ss-cel-text">{celebrate.text}{celebrate.count > 1 ? ` (+${celebrate.count - 1} more)` : ''}</div>
          </div>
        </div>
      )}

      <Hero crumbs={['My Workspace', secLabel(tab)]} title={nameOf(me)}
        subtitle={`${positionTitle || em.jobTitle || '—'}${orgPath ? ` · ${orgPath}` : ''}${managerName ? ` · Reports to ${managerName}` : ''}`}
        actions={<Pill status={me.status} />} />

      <Body>
        <div>
          {/* identity card — always visible */}
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 18, marginBottom: 18, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            {me.photo ? <img src={me.photo} alt={nameOf(me)} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: '1.3rem', background: 'linear-gradient(135deg,#3485E9,#012158)' }}>{initialsOf(me)}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px 24px', flex: 1, minWidth: 0 }}>
              {facts.map(([l, v], i) => <div key={i}><div style={{ fontSize: '.62rem', letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted2, fontWeight: 800, marginBottom: 2 }}>{l}</div><div style={{ fontSize: '.86rem', color: C.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v || ''}>{v || '—'}</div></div>)}
            </div>
          </div>

          {tab === 'details' && (<>
            <Section title="Personal">
              <Fld label="Gender">{humanize(me.gender) || '—'}</Fld>
              <Fld label="Date of birth">{fmtDate(me.dateOfBirth)}</Fld>
              <Fld label="Marital status">{humanize(me.maritalStatus) || '—'}</Fld>
              <Fld label="Nationality">{val(me.nationality)}</Fld>
              <Fld label="National ID">{val(me.nationalId)}</Fld>
            </Section>
            <Section title="Contact">
              <Fld label="Email">{val(me.email)}</Fld>
              <Fld label="Phone">{val(me.phone)}</Fld>
              <Fld label="Address">{val(me.address)}</Fld>
            </Section>
            <Section title="Job">
              <Fld label="Position">{positionTitle || '—'}</Fld>
              <Fld label="Job title">{val(em.jobTitle)}</Fld>
              <Fld label="Department">{deptName || '—'}</Fld>
              <Fld label="Section / estate">{sectionName || '—'}</Fld>
              <Fld label="Grade">{val(em.grade)}</Fld>
              <Fld label="Worker class">{humanize(em.workerClass) || '—'}</Fld>
              <Fld label="Employment type">{humanize(em.employmentType) || '—'}</Fld>
              <Fld label="Start date">{fmtDate(em.startDate)}</Fld>
            </Section>
            <Section title="Pay">
              <Fld label="Pay basis">{humanize(pb) || '—'}</Fld>
              <Fld label="Currency">{val(comp.currency)}</Fld>
              {pb === 'salary' && <Fld label="Monthly salary">{fmtMoney(comp.baseSalary, comp.currency)}</Fld>}
              {pb === 'daily' && <Fld label="Daily rate">{fmtMoney(comp.dailyRate, comp.currency)}</Fld>}
              {pb === 'hourly' && <Fld label="Hourly rate">{fmtMoney(comp.hourlyRate, comp.currency)}</Fld>}
              {(pb === 'piece_rate' || pb === 'task') && <Fld label="Piece rate">{comp.pieceRate?.amount != null ? `${fmtMoney(comp.pieceRate.amount, comp.currency)}${comp.pieceRate?.unit ? ' / ' + comp.pieceRate.unit : ''}` : '—'}</Fld>}
              <Fld label="Payment method">{humanize(pay.method) || '—'}</Fld>
            </Section>
          </>)}

          {tab === 'leave' && leave && (<>
            <div className="ss-card" style={{ marginBottom: 16 }}>
              <h3 className="ss-blocktitle">Request leave</h3>
              {formError && <div className="ss-err">{formError}</div>}
              {formOk && <div className="ss-ok">{formOk}</div>}
              <div className="ss-form">
                <label className="ss-field">Leave type
                  <select value={form.leaveType} onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}>
                    <option value="">— Select —</option>
                    {(leave.types || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="ss-field">From<input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></label>
                <label className="ss-field">To<input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></label>
                <label className="ss-field" style={{ gridColumn: '1 / -1' }}>Reason (optional)<input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Family event" /></label>
              </div>
              <div style={{ marginTop: 12 }}><button className="ss-btn primary" onClick={submitLeave} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit request'}</button></div>
            </div>
            {leave.takenByType?.length > 0 && (
              <div className="ss-statrow">
                {leave.takenByType.map((b, i) => <div className="ss-stat" key={i}><span className="num">{b.days}</span><span className="lab">{b.type} taken</span></div>)}
                <div className="ss-stat gold"><span className="num">{pending}</span><span className="lab">Pending</span></div>
              </div>
            )}
            <div className="ss-card">
              <h3 className="ss-blocktitle">My requests</h3>
              {leave.requests?.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="ss-tbl">
                    <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Reason</th></tr></thead>
                    <tbody>
                      {leave.requests.map((r) => (
                        <tr key={r._id}><td>{r.leaveType?.name || '—'}</td><td>{fmtDate(r.startDate)}</td><td>{fmtDate(r.endDate)}</td><td>{r.days != null ? r.days : '—'}</td><td><Tone status={r.status} /></td><td style={{ color: '#5b6b7f' }}>{r.reason || '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="ss-muted">No leave requests yet. Submit one above.</p>}
            </div>
          </>)}

          {tab === 'payslips' && (
            <div className="ss-card">
              <h3 className="ss-blocktitle">My payslips</h3>
              {!payslips || payslips.loading ? <p className="ss-muted">Loading payslips…</p>
                : payslips.error ? <div className="ss-err">{payslips.error}</div>
                  : payslips.items.length ? (
                    <div className="ss-slips">
                      {payslips.items.map((it) => {
                        const slip = it.payslip || {};
                        const ccy = it.currency || slip.currency;
                        const net = pickNum(slip, ['net', 'netPay', 'net_pay', 'netpay', 'takeHome', 'take_home']) ?? slip?.totals?.net;
                        const gross = pickNum(slip, ['gross', 'grossPay', 'gross_pay', 'grosspay', 'earnings']);
                        const ded = pickNum(slip, ['deductions', 'totalDeductions', 'total_deductions']);
                        const open = openSlip === it.runId;
                        const rows = open ? flattenSlip(slip) : [];
                        return (
                          <div className="ss-slip" key={it.runId}>
                            <div className="ss-slip-head"><div><div className="ss-slip-period">{fmtPeriod(it.period)}</div>{it.label && <div className="ss-slip-label">{it.label}</div>}</div><Tone status={it.status} /></div>
                            <div className="ss-slip-figures">
                              <div className="fig big"><span className="l">Net pay</span><span className="v">{net != null ? fmtMoney(net, ccy) : '—'}</span></div>
                              <div className="fig"><span className="l">Gross</span><span className="v">{gross != null ? fmtMoney(gross, ccy) : '—'}</span></div>
                              <div className="fig"><span className="l">Deductions</span><span className="v">{ded != null ? fmtMoney(ded, ccy) : '—'}</span></div>
                            </div>
                            <button className="ss-mini" onClick={() => setOpenSlip(open ? null : it.runId)}>{open ? 'Hide breakdown' : 'View breakdown'}</button>
                            {open && <div className="ss-slip-detail">{rows.length ? rows.map(([k, v], i) => (<div className="ss-kv" key={i}><span className="k">{k}</span><span className="vv">{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v)}</span></div>)) : <p className="ss-muted">No line items on this payslip.</p>}</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="ss-muted">No payslips yet. Approved or paid payroll runs that include you will appear here.</p>}
            </div>
          )}

          {tab === 'attendance' && <AttendanceView state={attendance} />}

          {tab === 'team' && (
            <div className="ss-card">
              {team.length ? (
                <div className="ss-team">
                  {team.map((r) => (
                    <div key={r._id} className="ss-member">
                      {r.photo ? <img className="ss-m-av" src={r.photo} alt={nameOf(r)} /> : <div className="ss-m-av ph">{initialsOf(r)}</div>}
                      <div style={{ minWidth: 0 }}><div className="ss-m-name">{nameOf(r)}</div><div className="ss-m-title">{r.employment?.jobTitle || '—'}</div></div>
                    </div>
                  ))}
                </div>
              ) : <p className="ss-muted" style={{ textAlign: 'center', padding: '18px 0' }}>You have no direct reports.</p>}
            </div>
          )}
        </div>
      </Body>
    </ModuleShell>
  );
}

function AttendanceView({ state }) {
  if (!state || state.loading) return <div className="ss-card"><p className="ss-muted">Loading attendance…</p></div>;
  if (state.error) return <div className="ss-err">{state.error}</div>;
  const items = state.items || [];
  const norm = (s) => String(s || '').toLowerCase();
  let attended = 0, absent = 0, onLeave = 0, nonWorking = 0;
  for (const r of items) { const s = norm(r.status); if (s === 'present' || s === 'late') attended += 1; else if (s === 'half_day') attended += 0.5; else if (s === 'absent') absent += 1; else if (s === 'leave') onLeave += 1; else if (s === 'rest_day' || s === 'holiday') nonWorking += 1; }
  const working = attended + absent;
  const rate = working ? Math.round((attended / working) * 100) : null;
  const attendedDisplay = Number.isInteger(attended) ? attended : attended.toFixed(1);
  return (
    <>
      <div className="ss-statrow">
        <div className="ss-stat gold"><span className="num">{attendedDisplay}</span><span className="lab">Attended</span></div>
        <div className="ss-stat"><span className="num">{absent}</span><span className="lab">Absent</span></div>
        <div className="ss-stat"><span className="num">{onLeave}</span><span className="lab">On leave</span></div>
        <div className="ss-stat"><span className="num">{nonWorking}</span><span className="lab">Rest / holiday</span></div>
        <div className="ss-stat"><span className="num">{rate == null ? '—' : rate + '%'}</span><span className="lab">Rate</span></div>
      </div>
      <div className="ss-card">
        <h3 className="ss-blocktitle">Recent attendance</h3>
        {items.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="ss-tbl">
              <thead><tr><th>Date</th><th>Status</th><th>Hours</th><th>Output</th></tr></thead>
              <tbody>
                {items.slice(0, 40).map((r, i) => (
                  <tr key={r._id || i}><td>{fmtDate(r.date)}</td><td><Tone status={norm(r.status)} /></td><td>{r.hoursWorked != null ? r.hoursWorked : '—'}</td><td>{r.output?.quantity != null ? `${r.output.quantity}${r.output.unit ? ' ' + r.output.unit : ''}` : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="ss-muted">No attendance records yet.</p>}
      </div>
    </>
  );
}

const STYLES = `
.ss-card{background:#fff;border:1px solid #e5e8ec;border-radius:14px;box-shadow:0 1px 2px rgba(1,33,88,.05);padding:18px 20px}
.ss-blocktitle{font-size:.95rem;font-weight:800;color:#012158;margin:0 0 14px}
.ss-pill{display:inline-flex;align-items:center;padding:3px 12px;border-radius:999px;font-size:.75rem;font-weight:700;text-transform:capitalize}
.ss-section{display:grid;grid-template-columns:200px 1fr;gap:26px;align-items:start;padding:20px 0;border-top:1px solid #e5e8ec}
.ss-section:first-of-type{border-top:none;padding-top:0}
.ss-sec-title{font-size:.98rem;font-weight:800;color:#012158;padding-top:4px}
.ss-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px 24px}
.ss-f .l{font-size:.66rem;letter-spacing:.05em;text-transform:uppercase;color:#8a94a6;font-weight:800;display:block;margin-bottom:3px}
.ss-f .v{font-size:.9rem;color:#1f2733;font-weight:600;word-break:break-word}
.ss-f .v.empty{color:#c3cad4}
.ss-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
.ss-field{display:flex;flex-direction:column;gap:5px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7f}
.ss-field input,.ss-field select{font-family:inherit;font-size:.9rem;font-weight:500;text-transform:none;letter-spacing:normal;padding:9px 11px;border:1px solid #d8e0ec;border-radius:9px;color:#1f2733;background:#fff}
.ss-statrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-bottom:16px}
.ss-stat{position:relative;display:flex;flex-direction:column;gap:6px;padding:16px 18px;background:#fff;border:1px solid #e5e8ec;border-radius:14px;box-shadow:0 1px 2px rgba(1,33,88,.05);overflow:hidden}
.ss-stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#e5e8ec}
.ss-stat.gold::before{background:#FD9C09}
.ss-stat .num{font-size:1.7rem;font-weight:800;color:#012158;line-height:1;font-variant-numeric:tabular-nums}
.ss-stat .lab{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:#8a94a6;font-weight:800}
.ss-tbl{width:100%;border-collapse:collapse;font-size:.86rem}
.ss-tbl th{text-align:left;padding:9px 12px;font-size:.66rem;letter-spacing:.05em;text-transform:uppercase;color:#8a94a6;font-weight:800;border-bottom:1px solid #e5e8ec;white-space:nowrap}
.ss-tbl td{padding:10px 12px;border-bottom:1px solid #f0f2f5;color:#1f2733}
.ss-tbl tr:last-child td{border-bottom:none}
.ss-slips{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.ss-slip{border:1px solid #e5e8ec;border-radius:12px;padding:16px;background:#f7f9fc}
.ss-slip-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.ss-slip-period{font-size:1rem;font-weight:800;color:#012158}
.ss-slip-label{font-size:.78rem;color:#8a94a6}
.ss-slip-figures{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.ss-slip-figures .fig{display:flex;flex-direction:column}
.ss-slip-figures .fig .l{font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:#8a94a6;font-weight:800}
.ss-slip-figures .fig .v{font-size:.95rem;font-weight:700;color:#1f2733;font-variant-numeric:tabular-nums}
.ss-slip-figures .fig.big .v{font-size:1.25rem;color:#012158}
.ss-slip-detail{margin-top:12px;border-top:1px solid #eef1f5;padding-top:10px;display:grid;gap:6px}
.ss-kv{display:flex;justify-content:space-between;gap:12px;font-size:.82rem}
.ss-kv .k{color:#5b6b7f}
.ss-kv .vv{color:#1f2733;font-weight:700;font-variant-numeric:tabular-nums}
.ss-team{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.ss-member{display:flex;align-items:center;gap:12px;border:1px solid #eef1f5;border-radius:12px;padding:12px 14px;background:#f7f9fc}
.ss-m-av{width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0}
.ss-m-av.ph{display:grid;place-items:center;background:linear-gradient(135deg,#012158,#3485E9);color:#fff;font-weight:800}
.ss-m-name{font-size:.9rem;font-weight:700;color:#012158;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-m-title{font-size:.78rem;color:#5b6b7f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss-muted{color:#8a94a6;font-size:.9rem;padding:16px 4px}
.ss-err{background:#fdeaea;color:#b3261e;border:1px solid #f5c6c6;padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:12px}
.ss-ok{background:#e7f6ee;color:#1a7f47;border:1px solid #b6e2c8;padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:12px}
.ss-btn{appearance:none;border:1px solid #d8e0ec;background:#fff;color:#012158;font-weight:700;font-size:.85rem;padding:9px 18px;border-radius:9px;cursor:pointer;font-family:inherit}
.ss-btn.primary{background:#012158;color:#fff;border-color:#012158}
.ss-btn:disabled{opacity:.55;cursor:default}
.ss-mini{appearance:none;border:1px solid #d8e0ec;background:#fff;color:#012158;font-weight:700;font-size:.74rem;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit}
.ss-empty{background:#fff;border:1px dashed #cfd8e3;border-radius:14px;padding:44px 24px;text-align:center}
.ss-empty-mark{font-size:2rem;margin-bottom:10px}
.ss-empty-title{font-size:1.05rem;font-weight:800;color:#012158}
.ss-empty-note{font-size:.86rem;color:#5b6b7f;margin-top:6px;max-width:460px;margin-left:auto;margin-right:auto;line-height:1.5}
.ss-celebrate{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(1,20,50,.32);animation:ss-fade .25s ease}
.ss-cel-card{background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(1,33,88,.35);padding:30px 40px;text-align:center;animation:ss-pop .5s cubic-bezier(.2,1.3,.4,1)}
.ss-cel-thumbwrap{position:relative;display:inline-flex;align-items:center;justify-content:center;width:96px;height:96px;margin-bottom:8px}
.ss-cel-thumb{font-size:3.6rem;animation:ss-thumb 1s ease}
.ss-cel-ring{position:absolute;width:60px;height:60px;border-radius:50%;border:4px solid #FD9C09;opacity:.7;animation:ss-ring .9s ease-out forwards}
.ss-cel-title{font-size:1.35rem;font-weight:800;color:#012158}
.ss-cel-text{font-size:.95rem;color:#5b6b7f;margin-top:4px}
@keyframes ss-fade{from{opacity:0}to{opacity:1}}
@keyframes ss-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes ss-thumb{0%{transform:scale(0) rotate(-28deg)}55%{transform:scale(1.35) rotate(12deg)}100%{transform:scale(1) rotate(0)}}
@keyframes ss-ring{0%{transform:scale(.4);opacity:.8}100%{transform:scale(2.6);opacity:0}}
@media(max-width:820px){.ss-section{grid-template-columns:1fr;gap:10px}}
`;