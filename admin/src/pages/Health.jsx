import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { C, PageHead, Card, Badge } from '../ui';

export default function Health() {
  const [h, setH] = useState(null);
  const [ping, setPing] = useState(null);
  const [reachable, setReachable] = useState(true);
  const timer = useRef(null);

  async function fetchHealth() {
    const start = Date.now();
    try { const { data } = await api.get('/health'); setH(data); setPing(Date.now() - start); setReachable(true); }
    catch { setReachable(false); setPing(null); }
  }
  useEffect(() => { fetchHealth(); timer.current = setInterval(fetchHealth, 5000); return () => clearInterval(timer.current); }, []);

  const ok = (b) => (b ? C.green : C.red);
  return (
    <>
      <PageHead title="System Health" sub="Live — refreshes every 5 seconds." right={<Dot on={reachable} />} />
      {!h ? <Card>Checking…</Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          <Vital label="API" value={reachable ? 'Reachable' : 'Unreachable'} color={ok(reachable)} sub={ping != null ? `${ping}ms round-trip` : ''} />
          <Vital label="Master database" value={h.masterDb === 'connected' ? 'Connected' : 'Down'} color={ok(h.masterDb === 'connected')} />
          <Vital label="Payments (Paystack)" value={h.paymentsEnabled ? 'Configured' : 'Not configured'} color={h.paymentsEnabled ? C.green : C.amber} />
          <Vital label="Uptime" value={`${Math.floor(h.uptimeSec / 3600)}h ${Math.floor((h.uptimeSec % 3600) / 60)}m`} color={C.navy} />
          <Vital label="Environment" value={h.env} color={C.navy} sub={`Node ${h.node}`} />
          <Vital label="Server time" value={new Date(h.time).toLocaleTimeString()} color={C.navy} />
        </div>
      )}
    </>
  );
}

function Vital({ label, value, color, sub }) {
  return (
    <Card>
      <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: C.navy }}>{value}</span>
      </div>
      {sub && <div style={{ color: C.muted, fontSize: '.8rem', marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}
const Dot = ({ on }) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.8rem', color: on ? C.green : C.red, fontWeight: 700 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? C.green : C.red }} />{on ? 'Live' : 'Offline'}</span>;
