import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { PRODUCT_URL } from '../api';
import { C, PageTitle, Card, Badge, Btn, money, fmtDate, fmtDateTime } from '../ui';
import { inp, L, Grid } from './Tenants';

export default function TenantDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState(null);   // editable subset

  async function load() {
    try {
      const { data } = await api.get(`/tenants/${id}`);
      setD(data);
      const t = data.tenant;
      setEdit({ plan: t.plan, status: t.status, seatsPurchased: t.seatsPurchased || 0, taxRate: (t.tax?.rate || 0) * 100, taxLabel: t.tax?.label || 'Tax', billingEmail: t.billingEmail || '' });
    } catch (e) { setErr(e?.response?.data?.message || 'Could not load tenant.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function act(fn, done) {
    setMsg('');
    try { await fn(); setMsg(done || 'Done.'); await load(); }
    catch (e) { setMsg(e?.response?.data?.message || 'Action failed.'); }
  }

  async function save() {
    await act(() => api.put(`/tenants/${id}`, {
      plan: edit.plan, status: edit.status, seatsPurchased: Number(edit.seatsPurchased) || 0,
      billingEmail: edit.billingEmail, tax: { rate: (Number(edit.taxRate) || 0) / 100, label: edit.taxLabel },
    }), 'Saved.');
  }

  async function impersonate() {
    setMsg('');
    try {
      const { data } = await api.post(`/tenants/${id}/impersonate`, {});
      const url = `${PRODUCT_URL}/?impersonate=${encodeURIComponent(data.token)}&workspace=${encodeURIComponent(data.subdomain)}`;
      window.open(url, '_blank', 'noopener');
      setMsg(`Opened ${data.subdomain} as ${data.user.email}.`);
    } catch (e) { setMsg(e?.response?.data?.message || 'Could not start impersonation.'); }
  }

  async function del() {
    if (!window.confirm('Remove this tenant from the registry? The tenant database is left intact.')) return;
    await act(() => api.delete(`/tenants/${id}`));
    nav('/tenants');
  }

  if (err) return <><PageTitle title="Tenant" /><Card>{err}</Card></>;
  if (!d || !edit) return <><PageTitle title="Tenant" /><Card>Loading…</Card></>;
  const t = d.tenant;
  const suspended = t.status === 'suspended';

  return (
    <>
      <PageTitle title={t.name} sub={`${t.subdomain} · ${t.countryCode} · ${t.baseCurrency}`}
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn tone="ghost" small onClick={impersonate}>Login as admin</Btn>
          {suspended
            ? <Btn tone="ghost" small onClick={() => act(() => api.post(`/tenants/${id}/unsuspend`), 'Reactivated.')}>Unsuspend</Btn>
            : <Btn tone="ghost" small onClick={() => act(() => api.post(`/tenants/${id}/suspend`), 'Suspended.')}>Suspend</Btn>}
          <Btn tone="danger" small onClick={del}>Delete</Btn>
        </div>} />

      {msg && <Card style={{ marginBottom: 14, background: '#f4f8ff', borderColor: '#cfe0ff', color: C.navy }}>{msg}</Card>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <H>Status</H>
          <Row><span>Subscription</span><Badge>{t.status}</Badge></Row>
          {t.trialEndsAt && <Row><span>Trial ends</span><b>{fmtDate(t.trialEndsAt)} ({d.trialDaysLeft}d)</b></Row>}
          {t.currentPeriodEnd && <Row><span>Renews</span><b>{fmtDate(t.currentPeriodEnd)}</b></Row>}
          {t.pendingPlan && <Row><span>Scheduled change</span><b style={{ textTransform: 'capitalize' }}>{t.pendingPlan}</b></Row>}
          <Row><span>Seats</span><b>{d.seatLimit ? `${d.usage.users ?? '—'} / ${d.seatLimit}` : 'Unlimited'}</b></Row>
          <Row><span>Employees</span><b>{d.usage.employees ?? '—'}</b></Row>
        </Card>
        <Card>
          <H>Manage</H>
          <Grid>
            <L label="Plan"><select style={inp} value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value })}><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option></select></L>
            <L label="Status"><select style={inp} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['trial', 'active', 'past_due', 'grace', 'expired', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}</select></L>
            <L label="Purchased seats (0 = plan default)"><input style={inp} type="number" value={edit.seatsPurchased} onChange={(e) => setEdit({ ...edit, seatsPurchased: e.target.value })} /></L>
            <L label="Billing email"><input style={inp} value={edit.billingEmail} onChange={(e) => setEdit({ ...edit, billingEmail: e.target.value })} /></L>
            <L label="Tax rate %"><input style={inp} type="number" value={edit.taxRate} onChange={(e) => setEdit({ ...edit, taxRate: e.target.value })} /></L>
            <L label="Tax label"><input style={inp} value={edit.taxLabel} onChange={(e) => setEdit({ ...edit, taxLabel: e.target.value })} /></L>
          </Grid>
          <div style={{ marginTop: 14, textAlign: 'right' }}><Btn onClick={save}>Save changes</Btn></div>
        </Card>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', fontWeight: 800, color: C.navy }}>Invoices</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
          <thead><tr style={{ background: C.canvas, color: C.muted, textAlign: 'left' }}>
            <th style={th}>Invoice</th><th style={th}>Date</th><th style={th}>Amount</th><th style={th}>Status</th>
          </tr></thead>
          <tbody>
            {(d.invoices || []).map((v) => (
              <tr key={v.number} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={td}>{v.number}{v.kind === 'proration' ? ' · proration' : ''}</td>
                <td style={td}>{fmtDateTime(v.createdAt)}</td>
                <td style={td}>{money(v.total, v.currency)}</td>
                <td style={td}><Badge>{v.status}</Badge></td>
              </tr>
            ))}
            {(d.invoices || []).length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={4}>No invoices.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

const H = ({ children }) => <div style={{ fontWeight: 800, color: C.navy, marginBottom: 12 }}>{children}</div>;
const Row = ({ children }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', color: C.ink, fontSize: '.9rem' }}>{children}</div>;
const th = { padding: '11px 14px', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' };
const td = { padding: '12px 14px', color: C.ink };
