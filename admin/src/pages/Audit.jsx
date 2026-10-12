import { useEffect, useState } from 'react';
import api from '../api';
import { C, PageHead, Card, inp, th, td, fmtDateTime } from '../ui';

export default function Audit() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/audit', { params: filter ? { action: filter } : {} }); setItems(data.items || []); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <>
      <PageHead title="Activity Log" sub="Platform-admin actions — who changed what, when." />
      <Card style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Filter by action, e.g. tenant.suspend" style={{ ...inp, flex: 1 }} />
        <button onClick={load} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Search</button>
      </Card>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 18, color: C.faint }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: C.canvas }}><th style={th}>When</th><th style={th}>Action</th><th style={th}>Detail</th><th style={th}>IP</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                  <td style={td}><code style={{ color: C.navy, fontWeight: 700 }}>{a.action}</code></td>
                  <td style={{ ...td, color: C.muted }}>{summarize(a.meta)}</td>
                  <td style={{ ...td, color: C.faint }}>{a.ip || '—'}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td style={{ ...td, color: C.faint }} colSpan={4}>No audit entries.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function summarize(meta) {
  if (!meta || typeof meta !== 'object') return '—';
  return Object.entries(meta).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => `${k}: ${v}`).join(' · ') || '—';
}
