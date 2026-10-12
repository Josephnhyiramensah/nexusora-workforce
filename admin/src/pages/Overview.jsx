import { useEffect, useState } from 'react';
import { Server, CheckCircle, AlertCircle, XCircle, DollarSign } from 'lucide-react';
import api from '../api';
import { C, PageHead, Card, StatCard, Badge, money, fmtDate } from '../ui';

const PLAN_COLOR = { starter: C.blue, professional: C.accent, enterprise: C.navy };

export default function Overview() {
  const [m, setM] = useState(null);
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [{ data: metrics }, { data: h }] = await Promise.all([api.get('/metrics'), api.get('/health')]);
        setM(metrics); setHealth(h);
      } catch (e) { setErr(e?.response?.data?.message || 'Could not load metrics.'); }
    })();
  }, []);

  if (err) return <><PageHead title="Overview" /><Card>{err}</Card></>;
  if (!m) return <><PageHead title="Overview" /><Card>Loading…</Card></>;

  const s = m.tenants.byStatus;
  const stats = [
    { label: 'Total Tenants', value: m.tenants.total, color: C.navy, Icon: Server },
    { label: 'Active', value: s.active || 0, color: C.green, Icon: CheckCircle },
    { label: 'On Trial', value: s.trial || 0, color: C.amber, Icon: AlertCircle },
    { label: 'Suspended', value: (s.suspended || 0) + (s.expired || 0), color: C.red, Icon: XCircle },
    { label: `MRR (${m.billing.baseCurrency})`, value: money(m.billing.mrrEstimate).replace('.00', ''), color: C.accent, Icon: DollarSign },
  ];

  return (
    <>
      <PageHead title="Overview" sub="Platform health and billing at a glance." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 15, marginBottom: 24 }}>
        {stats.map((st, i) => <StatCard key={st.label} {...st} i={i} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <H>Recent signups</H>
          {m.tenants.recent.length === 0 ? <Muted>No tenants yet.</Muted> : m.tenants.recent.map((t) => (
            <div key={t.subdomain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.line}` }}>
              <span><b style={{ color: C.navy }}>{t.name}</b> <span style={{ color: C.faint, fontSize: '.8rem', fontFamily: 'monospace' }}>· {t.subdomain}</span></span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ color: C.faint, fontSize: '.78rem' }}>{fmtDate(t.createdAt)}</span><Badge>{t.status}</Badge></span>
            </div>
          ))}
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <H>Tenants by plan</H>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {Object.entries(m.tenants.byPlan).map(([plan, count]) => (
                <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 20, background: `${PLAN_COLOR[plan] || C.muted}14`, border: `1px solid ${PLAN_COLOR[plan] || C.muted}30` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PLAN_COLOR[plan] || C.muted }} />
                  <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', color: C.navy }}>{plan}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: PLAN_COLOR[plan] || C.muted }}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
          {health && (
            <Card>
              <H>System</H>
              <Row><span>Master DB</span><Badge>{health.masterDb === 'connected' ? 'active' : 'suspended'}</Badge></Row>
              <Row><span>Payments</span><b style={{ color: health.paymentsEnabled ? C.green : C.amber }}>{health.paymentsEnabled ? 'Enabled' : 'Not configured'}</b></Row>
              <Row><span>Uptime</span><b>{Math.floor(health.uptimeSec / 3600)}h {Math.floor((health.uptimeSec % 3600) / 60)}m</b></Row>
              <Row><span>Paid revenue</span><b>{m.billing.paidInvoices} invoice{m.billing.paidInvoices === 1 ? '' : 's'}</b></Row>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
const H = ({ children }) => <div style={{ fontWeight: 800, color: C.navy, marginBottom: 12 }}>{children}</div>;
const Row = ({ children }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', color: C.ink, fontSize: '.9rem' }}>{children}</div>;
const Muted = ({ children }) => <div style={{ color: C.faint, fontSize: '.86rem' }}>{children}</div>;
