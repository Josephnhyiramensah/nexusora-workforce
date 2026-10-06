import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import LeaveRequestForm from '../components/LeaveRequestForm';
import { CalendarClock, CalendarDays, Wallet, ShieldCheck, Plus, Clock, UserCheck, Inbox, Plane } from 'lucide-react';
import {
  RouteShell, Hero, KpiBand, Kpi, Body, Card, Empty, Segmented, Pill, TableWrap, HeroBtn,
} from '../ui/kit';
import { C, NUM, cap, fmtDate, fullName, rowStyle, td, miniBtn, ghostBtn } from '../ui/tokens';

const APPROVE_ROLES = ['super_admin', 'hr_manager', 'line_manager'];
const ADMIN_ROLES = ['super_admin', 'hr_manager'];

const TIMEPAY_RAIL = {
  brand: { title: 'Time & Pay', subtitle: 'Attendance to payroll', Icon: CalendarClock },
  groups: [
    { title: 'Time', items: [{ label: 'Attendance', to: '/attendance', Icon: CalendarClock }, { label: 'Leave', to: '/leave', Icon: CalendarDays }] },
    { title: 'Pay', items: [{ label: 'Payroll', to: '/payroll', Icon: Wallet }, { label: 'Compliance', to: '/compliance', Icon: ShieldCheck }] },
  ],
};

const LV_STATUS = { pending: ['Pending', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'], cancelled: ['Cancelled', 'grey'], taken: ['Taken', 'blue'] };
const lvPill = (s) => { const t = LV_STATUS[String(s || '').toLowerCase()] || [cap(s) || '—', 'grey']; return <Pill tone={t[1]}>{t[0]}</Pill>; };
const isToday = (r) => { if (r.status !== 'approved') return false; const now = new Date(); const s = new Date(r.startDate); const e = new Date(r.endDate); return s <= now && now <= e; };

export default function LeavePage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [tab, setTab] = useState('requests');
  const canApprove = APPROVE_ROLES.includes(user?.role);
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/leave/requests'); setRequests(Array.isArray(data) ? data : (data.items || [])); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  async function seedTypes() {
    setMsg('');
    try { const { data } = await api.post('/leave/types/seed'); setMsg(t('leave.typesReady', { n: data.created })); }
    catch (e) { setMsg(e?.response?.data?.message || 'Error'); }
  }
  async function decide(id, action) { await api.post(`/leave/requests/${id}/${action}`); load(); }

  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved');
  const onLeaveToday = requests.filter(isToday).length;

  const TABS = [['requests', t('leave.allRequests')], ...(canApprove ? [['approvals', `${t('leave.approvals')} (${pending.length})`]] : []), ['balance', t('leave.balance')]];
  const rows = tab === 'approvals' ? pending : requests;

  return (
    <RouteShell brand={TIMEPAY_RAIL.brand} groups={TIMEPAY_RAIL.groups}>
      <Hero crumbs={['Time & Pay', 'Leave']} title={t('tiles.leave')}
        actions={<>
          {isAdmin && <HeroBtn ghost onClick={seedTypes}>{t('leave.seedTypes')}</HeroBtn>}
          <HeroBtn Icon={Plus} onClick={() => setShowForm(true)}>{t('leave.newRequest')}</HeroBtn>
        </>} />
      <KpiBand>
        <Kpi Icon={Clock} iconColor={C.amber} iconBg={C.amberBg} label="Awaiting approval" value={loading ? '—' : pending.length} pill={!loading && pending.length ? ['action needed', 'amber'] : null} foot={<span>pending requests</span>} onClick={() => setTab(canApprove ? 'approvals' : 'requests')} />
        <Kpi Icon={Plane} iconColor={C.accentInk} iconBg="#e6f1fd" label="On leave today" value={loading ? '—' : onLeaveToday} foot={<span>currently away</span>} onClick={() => setTab('requests')} />
        <Kpi Icon={UserCheck} iconColor={C.green} iconBg={C.greenBg} label="Approved" value={loading ? '—' : approved.length} foot={<span>this period</span>} onClick={() => setTab('requests')} />
        <Kpi Icon={Inbox} iconColor={C.navy} iconBg={C.greyBg} label="Total requests" value={loading ? '—' : requests.length} foot={<span>all statuses</span>} onClick={() => setTab('requests')} />
      </KpiBand>
      <Body>
        <div style={{ minWidth: 0 }}>
          {msg && <div style={{ background: '#eaf5ff', border: '1px solid #cfe6fb', color: '#0b4a8f', padding: '10px 13px', borderRadius: 10, fontSize: '.86rem', marginBottom: 14 }}>{msg}</div>}
          <div style={{ marginBottom: 16 }}><Segmented items={TABS} active={tab} onSelect={setTab} /></div>

          {tab === 'balance' ? <BalanceTab /> : (
            <Card title={tab === 'approvals' ? t('leave.approvals') : t('leave.allRequests')} sub={loading ? '' : `${rows.length}`}>
              {loading ? <Empty>{t('common.loading')}</Empty> : rows.length === 0 ? <Empty>{t('leave.none')}</Empty> : (
                <TableWrap head={[[t('leave.employee')], [t('leave.type')], [t('leave.dates')], [t('leave.days'), 'r'], [t('leave.status')], (tab === 'approvals' && canApprove) ? ['', 'r'] : ['']]}>
                  {rows.map((r) => (
                    <tr key={r._id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.employee ? fullName(r.employee) : '—'}</td>
                      <td style={td}>{r.leaveType?.name || '—'}</td>
                      <td style={{ ...td, ...NUM, color: C.muted }}>{String(r.startDate).slice(0, 10)} → {String(r.endDate).slice(0, 10)}</td>
                      <td style={{ ...td, textAlign: 'right', ...NUM, fontWeight: 700 }}>{r.days}</td>
                      <td style={td}>{lvPill(r.status)}</td>
                      {tab === 'approvals' && canApprove && (
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => decide(r._id, 'approve')} style={miniBtn(C.green)}>{t('leave.approve')}</button>
                          <button onClick={() => decide(r._id, 'reject')} style={{ ...miniBtn(C.red), marginLeft: 6 }}>{t('leave.reject')}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </TableWrap>
              )}
            </Card>
          )}
        </div>
      </Body>

      {showForm && <LeaveRequestForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </RouteShell>
  );
}

function BalanceTab() {
  const { t } = useLocale();
  const [employees, setEmployees] = useState([]);
  const [sel, setSel] = useState('');
  const [bal, setBal] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/employees', { params: { status: 'active', limit: 200 } }).then(({ data }) => setEmployees(data.items || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!sel) { setBal(null); return; }
    setLoading(true);
    api.get(`/leave/balance/${sel}`).then(({ data }) => setBal(data)).catch(() => setBal(null)).finally(() => setLoading(false));
  }, [sel]);

  return (
    <div>
      <Card title={t('leave.balance')} sub={t('leave.employee')} right={
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ padding: '8px 11px', border: `1px solid ${C.line}`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.85rem', fontWeight: 600, fontFamily: 'inherit', minWidth: 200 }}>
          <option value="">— {t('leave.employee')} —</option>
          {employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}
        </select>
      }>
        {loading ? <Empty>{t('common.loading')}</Empty> : !bal ? <Empty>Select an employee to view their leave balance.</Empty> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
              <BalTile value={bal.annual.remaining} label={t('leave.annualRemaining')} gold />
              <BalTile value={bal.annual.entitlement} label={t('leave.annualEntitlement')} />
              <BalTile value={bal.annual.taken} label={t('leave.annualTaken')} />
              <BalTile value={bal.tenureMonths} label={t('leave.tenureMonths')} />
            </div>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', margin: '4px 0 10px' }}>{t('leave.usageByType')}</div>
            <TableWrap flush={false} head={[[t('leave.type')], [t('leave.days'), 'r']]}>
              {bal.byType.length === 0 ? <tr><td style={{ ...td, color: C.muted2 }} colSpan={2}>{t('leave.noUsage')}</td></tr>
                : bal.byType.map((b, i) => <tr key={i} style={{ borderTop: `1px solid ${C.lineSoft}` }}><td style={td}>{b.type}</td><td style={{ ...td, textAlign: 'right', ...NUM, fontWeight: 700 }}>{b.days}</td></tr>)}
            </TableWrap>
          </>
        )}
      </Card>
    </div>
  );
}

function BalTile({ value, label, gold }) {
  return (
    <div style={{ position: 'relative', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: gold ? C.amber : C.line }} />
      <div style={{ ...NUM, fontSize: '1.7rem', fontWeight: 800, color: C.navy, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: '.05em', color: C.muted2, fontWeight: 800, marginTop: 6 }}>{label}</div>
    </div>
  );
}