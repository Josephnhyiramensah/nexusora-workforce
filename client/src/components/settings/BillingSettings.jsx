import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const C = { navy: '#012158', blue: '#3485E9', green: '#1f9d57', amber: '#c77700', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', line: '#e6ebf3', canvas: '#f4f7fc' };

const STATUS = {
  trial: { label: 'Free trial', color: C.blue, bg: '#eaf2ff' },
  active: { label: 'Active', color: C.green, bg: '#e9f7ef' },
  past_due: { label: 'Past due', color: C.amber, bg: '#fff5e6' },
  grace: { label: 'Grace period', color: C.amber, bg: '#fff5e6' },
  expired: { label: 'Expired', color: C.red, bg: '#fdecec' },
  suspended: { label: 'Suspended', color: C.red, bg: '#fdecec' },
};

const money = (n, cur) => `${cur || ''} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export default function BillingSettings({ setMsg }) {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [sub, setSub] = useState(null);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState('');
  const isAdmin = user?.role === 'super_admin';

  async function load() {
    setLoading(true);
    try {
      const [{ data: s }, { data: inv }] = await Promise.all([
        api.get('/billing/subscription'),
        api.get('/billing/invoices').catch(() => ({ data: { items: [] } })),
      ]);
      setSub(s);
      setInvoices(inv.items || []);
      const { data: pl } = await api.get('/billing/plans', { params: { currency: s.baseCurrency } });
      setPlans(pl.plans || []);
    } catch (e) {
      setMsg?.(e?.response?.data?.message || 'Could not load billing.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Returning from a Paystack checkout — the webhook does activation; refresh.
  useEffect(() => { if (params.get('ref')) setMsg?.('Payment received — your subscription will update shortly.'); /* eslint-disable-next-line */ }, []);

  async function subscribe(plan) {
    setBusyPlan(plan); setMsg?.('');
    try {
      const { data } = await api.post('/billing/checkout', { plan });
      if (data.authorizationUrl) window.location.href = data.authorizationUrl;
    } catch (e) {
      setMsg?.(e?.response?.data?.message || 'Could not start checkout.');
    } finally { setBusyPlan(''); }
  }

  if (loading) return <div style={{ color: C.muted, padding: 20 }}>Loading…</div>;

  const st = STATUS[sub?.status] || STATUS.active;
  const planLabel = plans.find((p) => p.key === sub?.plan)?.label || sub?.plan;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Current subscription */}
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: '.72rem', letterSpacing: '.08em', textTransform: 'uppercase', color: C.muted, fontWeight: 700 }}>Current plan</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: C.navy, marginTop: 2 }}>{planLabel}</div>
          </div>
          <span style={{ background: st.bg, color: st.color, fontWeight: 700, fontSize: '.8rem', padding: '6px 12px', borderRadius: 999 }}>{st.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
          {sub?.status === 'trial' && <Fact label="Trial ends" value={`${fmtDate(sub.trialEndsAt)} · ${sub.trialDaysLeft} days left`} />}
          {sub?.currentPeriodEnd && <Fact label="Renews" value={fmtDate(sub.currentPeriodEnd)} />}
          <Fact label="Seats" value={sub?.seatLimit ? `${sub.seatsPurchased || 0} / ${sub.seatLimit}` : 'Unlimited'} />
          {sub?.tax?.rate > 0 && <Fact label={sub.tax.label || 'Tax'} value={`${(sub.tax.rate * 100).toFixed(1)}%`} />}
        </div>
        {!sub?.paymentsEnabled && (
          <div style={{ marginTop: 16, background: '#fff5e6', border: '1px solid #ffe0ad', color: '#8a5a00', borderRadius: 10, padding: '10px 14px', fontSize: '.86rem' }}>
            Online payments aren't switched on yet{isAdmin ? ' — add your Paystack keys to enable checkout.' : '. Contact your administrator.'}
          </div>
        )}
      </div>

      {/* Plans */}
      {isAdmin && (
        <div>
          <div style={{ fontWeight: 800, color: C.navy, marginBottom: 10 }}>Plans</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {plans.map((p) => {
              const current = p.key === sub?.plan;
              return (
                <div key={p.key} style={{ border: `1.5px solid ${current ? C.navy : C.line}`, borderRadius: 12, padding: 16, background: current ? '#f4f8ff' : '#fff' }}>
                  <div style={{ fontWeight: 800, color: C.navy }}>{p.label}</div>
                  <div style={{ color: C.ink, fontSize: '.95rem', margin: '6px 0' }}>
                    {Number(p.price) > 0 ? <>{money(p.price, p.currency)}<span style={{ color: C.muted, fontWeight: 400 }}>/{p.interval}</span></> : <span style={{ color: C.muted }}>Not priced yet</span>}
                  </div>
                  <div style={{ color: C.muted, fontSize: '.75rem', marginBottom: 12 }}>
                    {p.seatLimit ? `Up to ${p.seatLimit} seats` : 'Unlimited seats'} · {p.modules.length} modules
                  </div>
                  <button
                    onClick={() => subscribe(p.key)}
                    disabled={!sub?.paymentsEnabled || Number(p.price) <= 0 || busyPlan === p.key}
                    style={{ width: '100%', padding: '10px', borderRadius: 10, border: current ? `1px solid ${C.navy}` : 'none',
                      background: current ? '#fff' : `linear-gradient(90deg, ${C.navy}, ${C.blue})`, color: current ? C.navy : '#fff',
                      fontWeight: 700, fontSize: '.88rem', cursor: (!sub?.paymentsEnabled || Number(p.price) <= 0) ? 'not-allowed' : 'pointer',
                      opacity: (!sub?.paymentsEnabled || Number(p.price) <= 0) ? 0.55 : 1 }}>
                    {busyPlan === p.key ? 'Starting…' : current ? 'Renew' : 'Choose plan'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoices */}
      <div>
        <div style={{ fontWeight: 800, color: C.navy, marginBottom: 10 }}>Invoices</div>
        {invoices.length === 0 ? (
          <div style={{ color: C.muted, fontSize: '.88rem', background: C.canvas, borderRadius: 10, padding: 16 }}>No invoices yet.</div>
        ) : (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
              <thead>
                <tr style={{ background: C.canvas, color: C.muted, textAlign: 'left' }}>
                  <th style={th}>Invoice</th><th style={th}>Date</th><th style={th}>Amount</th><th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((v) => (
                  <tr key={v.number} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={td}>{v.number}</td>
                    <td style={td}>{fmtDate(v.createdAt)}</td>
                    <td style={td}>{money(v.total, v.currency)}</td>
                    <td style={td}><StatusPill s={v.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const th = { padding: '10px 14px', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em' };
const td = { padding: '11px 14px', color: C.ink };

function Fact({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '.7rem', letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, fontWeight: 700 }}>{label}</div>
      <div style={{ color: C.ink, fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}
function StatusPill({ s }) {
  const map = { paid: [C.green, '#e9f7ef'], open: [C.amber, '#fff5e6'], void: [C.muted, '#eef1f6'], uncollectible: [C.red, '#fdecec'], draft: [C.muted, '#eef1f6'] };
  const [color, bg] = map[s] || [C.muted, '#eef1f6'];
  return <span style={{ color, background: bg, fontWeight: 700, fontSize: '.74rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize' }}>{s}</span>;
}
