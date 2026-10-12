import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import api, { PRODUCT_URL } from '../api';
import { C, PageHead, Card, Badge, Btn, Modal, SubTabs, Callout, inp, L, Grid, th, td, money, fmtDate, fmtDateTime } from '../ui';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fPlan, setFPlan] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/tenants'); setTenants(data); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase();
    return (!q || t.subdomain.includes(q) || t.name?.toLowerCase().includes(q))
      && (!fPlan || t.plan === fPlan) && (!fStatus || t.status === fStatus);
  });

  return (
    <>
      <PageHead title="Tenants" sub={`${tenants.length} workspace${tenants.length === 1 ? '' : 's'}`} right={<Btn onClick={() => setCreating(true)}>+ New tenant</Btn>} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#f7f9fc', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 11px', flex: 1, minWidth: 200 }}>
            <Search size={14} color={C.faint} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or subdomain…" style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: '100%' }} />
          </div>
          <select value={fPlan} onChange={(e) => setFPlan(e.target.value)} style={{ ...inp, width: 'auto', background: '#fff' }}><option value="">All plans</option><option>starter</option><option>professional</option><option>enterprise</option></select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ ...inp, width: 'auto', background: '#fff' }}><option value="">All statuses</option>{['trial', 'active', 'past_due', 'grace', 'expired', 'suspended'].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        {loading ? <div style={{ padding: 18, color: C.faint }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: C.canvas }}><th style={th}>Company</th><th style={th}>Workspace</th><th style={th}>Plan</th><th style={th}>Status</th><th style={th}>Country</th><th style={th}>Created</th></tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} onClick={() => setSelected(t)} style={{ borderTop: `1px solid ${C.line}`, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f7faff')} onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
                  <td style={td}><b style={{ color: C.navy }}>{t.name}</b></td>
                  <td style={{ ...td, fontFamily: 'monospace', color: C.muted }}>{t.subdomain}</td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{t.plan}</td>
                  <td style={td}><Badge>{t.status}</Badge></td>
                  <td style={td}>{t.countryCode}</td>
                  <td style={td}>{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td style={{ ...td, color: C.faint }} colSpan={6}>No tenants match.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
      {creating && <CreateTenant onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {selected && <TenantModal tenant={selected} onClose={() => setSelected(null)} onRefresh={load} />}
    </>
  );
}

/* ───────────── Create tenant ───────────── */
function CreateTenant({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', subdomain: '', countryCode: 'GH', baseCurrency: 'GHS', plan: 'professional', adminName: '', adminEmail: '', adminPassword: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setError(''); setBusy(true);
    try {
      await api.post('/tenants', { name: f.name, subdomain: f.subdomain, countryCode: f.countryCode, baseCurrency: f.baseCurrency, plan: f.plan, admin: { name: f.adminName, email: f.adminEmail, password: f.adminPassword } });
      onCreated();
    } catch (e) { setError(e?.response?.data?.message || 'Could not create tenant.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="New tenant" onClose={onClose}>
      {error && <div style={{ marginBottom: 12 }}><Callout tone="warn">{error}</Callout></div>}
      <Grid>
        <L label="Company"><input style={inp} value={f.name} onChange={set('name')} /></L>
        <L label="Workspace"><input style={inp} value={f.subdomain} onChange={set('subdomain')} placeholder="acme" /></L>
        <L label="Country code"><input style={inp} value={f.countryCode} onChange={set('countryCode')} /></L>
        <L label="Base currency"><input style={inp} value={f.baseCurrency} onChange={set('baseCurrency')} /></L>
        <L label="Plan"><select style={inp} value={f.plan} onChange={set('plan')}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></L>
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

/* ───────────── Tenant detail modal ───────────── */
function TenantModal({ tenant, onClose, onRefresh }) {
  const [tab, setTab] = useState('info');
  const [d, setD] = useState(null);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState(null);

  async function load() {
    const { data } = await api.get(`/tenants/${tenant.id}`);
    setD(data);
    const t = data.tenant;
    setEdit({ plan: t.plan, status: t.status, seatsPurchased: t.seatsPurchased || 0, taxRate: (t.tax?.rate || 0) * 100, taxLabel: t.tax?.label || 'Tax', billingEmail: t.billingEmail || '', supportNote: t.supportNote || '' });
  }
  async function loadUsers() { try { const { data } = await api.get(`/tenants/${tenant.id}/users`); setUsers(data.users || []); } catch {} }
  useEffect(() => { load(); loadUsers(); /* eslint-disable-next-line */ }, [tenant.id]);

  async function run(fn, ok) { setMsg(''); try { await fn(); setMsg(ok || 'Done.'); await load(); await loadUsers(); onRefresh?.(); } catch (e) { setMsg(e?.response?.data?.message || 'Action failed.'); } }

  async function saveManage() {
    await run(() => api.put(`/tenants/${tenant.id}`, { plan: edit.plan, status: edit.status, seatsPurchased: Number(edit.seatsPurchased) || 0, billingEmail: edit.billingEmail, tax: { rate: (Number(edit.taxRate) || 0) / 100, label: edit.taxLabel } }), 'Saved.');
  }
  async function saveNote() { await run(() => api.put(`/tenants/${tenant.id}`, { supportNote: edit.supportNote }), 'Note saved.'); }
  async function extend(days) { await run(() => api.post(`/tenants/${tenant.id}/extend`, { days }), `Extended by ${days} days.`); }
  async function impersonate() {
    setMsg('');
    try {
      const { data } = await api.post(`/tenants/${tenant.id}/impersonate`, {});
      window.open(`${PRODUCT_URL}/?impersonate=${encodeURIComponent(data.token)}&workspace=${encodeURIComponent(data.subdomain)}`, '_blank', 'noopener');
      setMsg(`Opened ${data.subdomain} as ${data.user.email}.`);
    } catch (e) { setMsg(e?.response?.data?.message || 'Could not impersonate.'); }
  }
  async function del() {
    if (!window.confirm('Remove this tenant from the registry? The tenant database is left intact.')) return;
    try { await api.delete(`/tenants/${tenant.id}`); onRefresh?.(); onClose(); } catch (e) { setMsg(e?.response?.data?.message || 'Delete failed.'); }
  }

  if (!d || !edit) return <Modal title={tenant.name} subtitle={`${tenant.subdomain}`} onClose={onClose} wide>Loading…</Modal>;
  const t = d.tenant;
  const suspended = t.status === 'suspended';

  return (
    <Modal title={t.name} subtitle={`${t.subdomain}.nexusoraworkforce.com`} onClose={onClose} wide>
      <SubTabs active={tab} onChange={setTab} tabs={[
        { key: 'info', label: '📋 Info' }, { key: 'users', label: `👥 Users (${users.length})` },
        { key: 'billing', label: '💳 Billing' }, { key: 'notes', label: '📝 Notes' },
      ]} />
      {msg && <div style={{ marginBottom: 14 }}><Callout tone="ok">{msg}</Callout></div>}

      {tab === 'info' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <Btn small tone="ghost" onClick={impersonate}>Login as admin</Btn>
            {suspended ? <Btn small tone="ghost" onClick={() => run(() => api.post(`/tenants/${tenant.id}/unsuspend`), 'Reactivated.')}>Unsuspend</Btn>
              : <Btn small tone="ghost" onClick={() => run(() => api.post(`/tenants/${tenant.id}/suspend`), 'Suspended.')}>Suspend</Btn>}
            <Btn small tone="danger" onClick={del}>Delete</Btn>
          </div>
          <Grid>
            <Fact label="Status" value={<Badge>{t.status}</Badge>} />
            <Fact label="Plan" value={<span style={{ textTransform: 'capitalize' }}>{t.plan}</span>} />
            <Fact label="Country / currency" value={`${t.countryCode} · ${t.baseCurrency}`} />
            <Fact label="Created" value={fmtDate(t.createdAt)} />
            {t.trialEndsAt && <Fact label="Trial ends" value={`${fmtDate(t.trialEndsAt)} (${d.trialDaysLeft}d)`} />}
            {t.currentPeriodEnd && <Fact label="Renews" value={fmtDate(t.currentPeriodEnd)} />}
            <Fact label="Seats" value={d.seatLimit ? `${d.usage.users ?? '—'} / ${d.seatLimit}` : 'Unlimited'} />
            <Fact label="Employees" value={d.usage.employees ?? '—'} />
            {t.pendingPlan && <Fact label="Scheduled change" value={<span style={{ textTransform: 'capitalize' }}>{t.pendingPlan}</span>} />}
          </Grid>
        </div>
      )}

      {tab === 'users' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {users.length === 0 && <div style={{ color: C.faint }}>No users.</div>}
          {users.map((u) => <UserRow key={u._id} u={u} tenantId={tenant.id} onChanged={loadUsers} setMsg={setMsg} />)}
        </div>
      )}

      {tab === 'billing' && (
        <div>
          <Grid>
            <L label="Plan"><select style={inp} value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></L>
            <L label="Status"><select style={inp} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['trial', 'active', 'past_due', 'grace', 'expired', 'suspended'].map((s) => <option key={s}>{s}</option>)}</select></L>
            <L label="Purchased seats (0 = plan default)"><input type="number" style={inp} value={edit.seatsPurchased} onChange={(e) => setEdit({ ...edit, seatsPurchased: e.target.value })} /></L>
            <L label="Billing email"><input style={inp} value={edit.billingEmail} onChange={(e) => setEdit({ ...edit, billingEmail: e.target.value })} /></L>
            <L label="Tax rate %"><input type="number" style={inp} value={edit.taxRate} onChange={(e) => setEdit({ ...edit, taxRate: e.target.value })} /></L>
            <L label="Tax label"><input style={inp} value={edit.taxLabel} onChange={(e) => setEdit({ ...edit, taxLabel: e.target.value })} /></L>
          </Grid>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn small onClick={saveManage}>Save changes</Btn>
            <span style={{ color: C.line }}>|</span>
            <span style={{ fontSize: '.82rem', color: C.muted }}>Extend:</span>
            {[30, 90, 365].map((dd) => <Btn key={dd} small tone="ghost" onClick={() => extend(dd)}>+{dd}d</Btn>)}
          </div>

          <div style={{ marginTop: 18, fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>Invoices</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead><tr style={{ background: C.canvas }}><th style={th}>Invoice</th><th style={th}>Date</th><th style={th}>Amount</th><th style={th}>Status</th></tr></thead>
            <tbody>
              {(d.invoices || []).map((v) => (
                <tr key={v.number} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={td}>{v.number}{v.kind === 'proration' ? ' · proration' : ''}</td><td style={td}>{fmtDateTime(v.createdAt)}</td>
                  <td style={td}>{money(v.total, v.currency)}</td><td style={td}><Badge>{v.status}</Badge></td>
                </tr>
              ))}
              {(d.invoices || []).length === 0 && <tr><td style={{ ...td, color: C.faint }} colSpan={4}>No invoices.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'notes' && (
        <div>
          <L label="Internal support note (not visible to the tenant)">
            <textarea value={edit.supportNote} onChange={(e) => setEdit({ ...edit, supportNote: e.target.value })} rows={6} style={{ ...inp, resize: 'vertical' }} />
          </L>
          <div style={{ marginTop: 12, textAlign: 'right' }}><Btn small onClick={saveNote}>Save note</Btn></div>
        </div>
      )}
    </Modal>
  );
}

function UserRow({ u, tenantId, onChanged, setMsg }) {
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const ROLES = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

  async function act(key, fn, ok) {
    setBusy(key); setMsg('');
    try { await fn(); setMsg(ok); onChanged(); } catch (e) { setMsg(e?.response?.data?.message || 'Failed.'); } finally { setBusy(''); }
  }
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, color: C.navy }}>{u.name} {!u.isActive && <span style={{ color: C.red, fontSize: '.72rem', fontWeight: 700 }}>· inactive</span>}</div>
          <div style={{ fontSize: '.8rem', color: C.muted }}>{u.email}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={u.role} disabled={busy === 'role'} onChange={(e) => act('role', () => api.put(`/tenants/${tenantId}/users/${u._id}`, { role: e.target.value }), 'Role updated.')}
            style={{ ...inp, width: 'auto', padding: '6px 8px', fontSize: '.8rem', background: '#fff' }}>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
          <Btn small tone="ghost" disabled={busy === 'active'} onClick={() => act('active', () => api.put(`/tenants/${tenantId}/users/${u._id}`, { isActive: !u.isActive }), u.isActive ? 'Deactivated.' : 'Activated.')}>
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Btn>
          <Btn small tone="ghost" onClick={() => setShowPw((v) => !v)}>Reset password</Btn>
        </div>
      </div>
      {showPw && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New temporary password (min 8)" style={{ ...inp, flex: 1 }} />
          <Btn small disabled={busy === 'pw' || pw.length < 8} onClick={() => act('pw', () => api.post(`/tenants/${tenantId}/users/${u._id}/reset-password`, { newPassword: pw }), 'Temporary password set.').then(() => { setPw(''); setShowPw(false); })}>Set</Btn>
        </div>
      )}
    </div>
  );
}

const Fact = ({ label, value }) => (
  <div><div style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div><div style={{ color: C.ink, fontWeight: 600, marginTop: 4 }}>{value}</div></div>
);
