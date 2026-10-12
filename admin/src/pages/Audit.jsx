import { useEffect, useState } from 'react';
import api from '../api';
import { C, PageTitle, Card, fmtDateTime } from '../ui';

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
      <PageTitle title="Audit log" sub="Platform-admin actions — who changed what, when." />
      <Card style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Filter by action, e.g. tenant.suspend" style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: `1px solid ${C.line}`, outline: 'none', fontSize: '.9rem' }} />
        <button onClick={load} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Search</button>
      </Card>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 18, color: C.muted }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
            <thead><tr style={{ background: C.canvas, color: C.muted, textAlign: 'left' }}>
              <th style={th}>When</th><th style={th}>Action</th><th style={th}>Detail</th><th style={th}>IP</th>
            </tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDateTime(a.at)}</td>
                  <td style={td}><code style={{ color: C.navy, fontWeight: 700 }}>{a.action}</code></td>
                  <td style={{ ...td, color: C.muted }}>{summarize(a.meta)}</td>
                  <td style={{ ...td, color: C.muted }}>{a.ip || '—'}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={4}>No audit entries.</td></tr>}
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
const th = { padding: '11px 14px', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' };
const td = { padding: '11px 14px', color: C.ink };
