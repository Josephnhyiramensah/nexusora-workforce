import { useEffect, useState } from 'react';
import api from '../api';
import { C, PageHead, Card, StatCard, Badge, money, fmtDate, th, td } from '../ui';
import { DollarSign, TrendingUp, FileText } from 'lucide-react';

export default function Revenue() {
  const [rev, setRev] = useState(null);
  const [m, setM] = useState(null);

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: metrics }] = await Promise.all([api.get('/revenue'), api.get('/metrics')]);
      setRev(r); setM(metrics);
    })().catch(() => {});
  }, []);

  if (!rev || !m) return <><PageHead title="Revenue" /><Card>Loading…</Card></>;
  const paidByCur = Object.entries(m.billing.paidTotalByCurrency || {});
  const months = Object.entries(rev.byMonth || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

  return (
    <>
      <PageHead title="Revenue" sub="Subscription income across all tenants." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 15, marginBottom: 22 }}>
        <StatCard label={`MRR (${m.billing.baseCurrency})`} value={money(m.billing.mrrEstimate).replace('.00', '')} color={C.accent} Icon={TrendingUp} i={0} />
        <StatCard label="Paid invoices" value={rev.count} color={C.green} Icon={FileText} i={1} />
        <StatCard label="Open invoices" value={m.billing.openInvoices} color={C.amber} Icon={FileText} i={2} />
        {paidByCur.slice(0, 1).map(([cur, total]) => <StatCard key={cur} label={`Collected (${cur})`} value={money(total).replace('.00', '')} color={C.navy} Icon={DollarSign} i={3} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <H>By currency</H>
          {paidByCur.length === 0 ? <Muted>No payments yet.</Muted> : paidByCur.map(([cur, total]) => (
            <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.line}` }}><b>{cur}</b><span>{money(total, cur)}</span></div>
          ))}
          <H style={{ marginTop: 18 }}>Monthly</H>
          {months.length === 0 ? <Muted>No data.</Muted> : months.map(([mo, curs]) => (
            <div key={mo} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '.86rem' }}>
              <span style={{ color: C.muted }}>{mo}</span>
              <span>{Object.entries(curs).map(([c, v]) => money(v, c)).join(' · ')}</span>
            </div>
          ))}
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', fontWeight: 800, color: C.navy }}>Recent payments</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: C.canvas }}><th style={th}>Tenant</th><th style={th}>Plan</th><th style={th}>Amount</th><th style={th}>Paid</th></tr></thead>
            <tbody>
              {(rev.recent || []).map((v, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ ...td, fontFamily: 'monospace', color: C.muted }}>{v.subdomain}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{v.plan}</td>
                  <td style={td}>{money(v.total, v.currency)}</td>
                  <td style={td}>{fmtDate(v.paidAt)}</td>
                </tr>
              ))}
              {(rev.recent || []).length === 0 && <tr><td style={{ ...td, color: C.faint }} colSpan={4}>No payments yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
const H = ({ children, style }) => <div style={{ fontWeight: 800, color: C.navy, marginBottom: 10, ...style }}>{children}</div>;
const Muted = ({ children }) => <div style={{ color: C.faint, fontSize: '.86rem' }}>{children}</div>;
