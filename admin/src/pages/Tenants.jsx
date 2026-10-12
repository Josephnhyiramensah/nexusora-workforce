import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { C, PageTitle, Card, Badge, Btn, fmtDate } from '../ui';

export default function Tenants() {
  const nav = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/tenants'); setTenants(data); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageTitle title="Tenants" sub={`${tenants.length} workspace${tenants.length === 1 ? '' : 's'}`} right={<Btn onClick={() => setCreating(true)}>+ New tenant</Btn>} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 18, color: C.muted }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
            <thead><tr style={{ background: C.canvas, color: C.muted, textAlign: 'left' }}>
              <th style={th}>Name</th><th style={th}>Workspace</th><th style={th}>Plan</th><th style={th}>Status</th><th style={th}>Country</th><th style={th}>Created</th>
            </tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} onClick={() => nav(`/tenants/${t.id}`)} style={{ borderTop: `1px solid ${C.line}`, cursor: 'pointer' }}>
                  <td style={td}><b style={{ color: C.navy }}>{t.name}</b></td>
                  <td style={td}>{t.subdomain}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{t.plan}</td>
                  <td style={td}><Badge>{t.status}</Badge></td>
                  <td style={td}>{t.countryCode}</td>
                  <td style={td}>{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
              {tenants.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={6}>No tenants yet.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
      {creating && <CreateTenant onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </>
  );
}

function CreateTenant({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', subdomain: '', countryCode: 'GH', baseCurrency: 'GHS', plan: 'professional', adminName: '', adminEmail: '', adminPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setError(''); setBusy(true);
    try {
      await api.post('/tenants', {
        name: f.name, subdomain: f.subdomain, countryCode: f.countryCode, baseCurrency: f.baseCurrency, plan: f.plan,
        admin: { name: f.adminName, email: f.adminEmail, password: f.adminPassword },
      });
      onCreated();
    } catch (e) { setError(e?.response?.data?.message || 'Could not create tenant.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} title="New tenant">
      {error && <div style={{ color: C.red, background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 10, fontSize: '.85rem', marginBottom: 12 }}>{error}</div>}
      <Grid>
        <L label="Company"><input style={inp} value={f.name} onChange={set('name')} /></L>
        <L label="Workspace (subdomain)"><input style={inp} value={f.subdomain} onChange={set('subdomain')} placeholder="acme" /></L>
        <L label="Country code"><input style={inp} value={f.countryCode} onChange={set('countryCode')} placeholder="GH" /></L>
        <L label="Base currency"><input style={inp} value={f.baseCurrency} onChange={set('baseCurrency')} placeholder="GHS" /></L>
        <L label="Plan">
          <select style={inp} value={f.plan} onChange={set('plan')}>
            <option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option>
          </select>
        </L>
        <div />
        <L label="Admin name"><input style={inp} value={f.adminName} onChange={set('adminName')} /></L>
        <L label="Admin email"><input style={inp} value={f.adminEmail} onChange={set('adminEmail')} /></L>
        <L label="Admin password"><input type="password" style={inp} value={f.adminPassword} onChange={set('adminPassword')} placeholder="min 8 chars" /></L>
      </Grid>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create tenant'}</Btn>
      </div>
    </Modal>
  );
}

export function Modal({ title, children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.4)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.1rem', marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export const inp = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: '#f7f9fc', fontSize: '.9rem', outline: 'none' };
export const L = ({ label, children }) => <div><div style={{ fontSize: '.78rem', color: '#46536b', fontWeight: 600, marginBottom: 5 }}>{label}</div>{children}</div>;
export const Grid = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
const th = { padding: '11px 14px', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' };
const td = { padding: '12px 14px', color: C.ink };
