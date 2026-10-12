import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { C, PageTitle, Card, Badge, money, fmtDate } from '../ui';

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

  if (err) return <><PageTitle title="Overview" /><Card>{err}</Card></>;
  if (!m) return <><PageTitle title="Overview" /><Card>Loading…</Card></>;

  const paid = Object.entries(m.billing.paidTotalByCurrency || {});
  return (
    <>
      <PageTitle title="Overview" sub="Platform health and billing at a glance." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 18 }}>
        <Stat label="Tenants" value={m.tenants.total} />
        <Stat label="Active" value={m.tenants.byStatus.active || 0} tone={C.green} />
        <Stat label="On trial" value={m.tenants.byStatus.trial || 0} tone={C.blue} />
        <Stat label={`MRR (${m.billing.baseCurrency})`} value={money(m.billing.mrrEstimate)} />
        <Stat label="Open invoices" value={m.billing.openInvoices} tone={m.billing.openInvoices ? C.amber : C.muted} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <H>Recent signups</H>
          {m.tenants.recent.length === 0 ? <Muted>No tenants yet.</Muted> : m.tenants.recent.map((t) => (
            <Link key={t.subdomain} to={`/tenants`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: `1px solid ${C.line}`, textDecoration: 'none', color: C.ink }}>
              <span><b style={{ color: C.navy }}>{t.name}</b> <span style={{ color: C.muted, fontSize: '.8rem' }}>· {t.subdomain}</span></span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ color: C.muted, fontSize: '.78rem' }}>{fmtDate(t.createdAt)}</span><Badge>{t.status}</Badge></span>
            </Link>
          ))}
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <H>By plan</H>
            {Object.entries(m.tenants.byPlan).map(([k, v]) => (
              <Row key={k}><span style={{ textTransform: 'capitalize' }}>{k}</span><b>{v}</b></Row>
            ))}
          </Card>
          <Card>
            <H>Paid revenue</H>
            {paid.length === 0 ? <Muted>No payments yet.</Muted> : paid.map(([cur, total]) => (
              <Row key={cur}><span>{cur}</span><b>{money(total, cur)}</b></Row>
            ))}
            <Row><span>Invoices paid</span><b>{m.billing.paidInvoices}</b></Row>
          </Card>
          {health && (
            <Card>
              <H>System</H>
              <Row><span>Master DB</span><Badge>{health.masterDb === 'connected' ? 'active' : 'suspended'}</Badge></Row>
              <Row><span>Payments</span><b style={{ color: health.paymentsEnabled ? C.green : C.amber }}>{health.paymentsEnabled ? 'Enabled' : 'Not configured'}</b></Row>
              <Row><span>Uptime</span><b>{Math.floor(health.uptimeSec / 3600)}h {Math.floor((health.uptimeSec % 3600) / 60)}m</b></Row>
              <Row><span>Node / env</span><span style={{ color: C.muted, fontSize: '.82rem' }}>{health.node} · {health.env}</span></Row>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: '.72rem', letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: tone || C.navy, marginTop: 4 }}>{value}</div>
    </Card>
  );
}
const H = ({ children }) => <div style={{ fontWeight: 800, color: C.navy, marginBottom: 10 }}>{children}</div>;
const Row = ({ children }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', color: C.ink, fontSize: '.9rem' }}>{children}</div>;
const Muted = ({ children }) => <div style={{ color: C.muted, fontSize: '.86rem' }}>{children}</div>;
