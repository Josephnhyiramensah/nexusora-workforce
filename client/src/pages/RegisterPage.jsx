import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { setSubdomain } from '../api/client';
import { authStyles as S, authColors as C } from '../components/AuthCard';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default function RegisterPage() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState({ countries: [], currencies: [] });
  const [plans, setPlans] = useState([]);
  const [meta, setMeta] = useState({ trialDays: 14, billingCurrency: 'GHS', pricesConfigured: false });

  const [company, setCompany] = useState('');
  const [subdomain, setSub] = useState('');
  const [subTouched, setSubTouched] = useState(false);
  const [countryCode, setCountry] = useState('GH');
  const [baseCurrency, setCurrency] = useState('GHS');
  const [plan, setPlan] = useState('professional');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');

  const [avail, setAvail] = useState(null);   // null | 'checking' | true | false
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const availTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: config }, { data: pl }] = await Promise.all([api.get('/config'), api.get('/billing/plans')]);
        setCfg({ countries: config.countries || [], currencies: config.currencies || [] });
        setPlans((pl.plans || []).sort((a, b) => a.order - b.order));
        setMeta({ trialDays: pl.trialDays, billingCurrency: pl.billingCurrency, pricesConfigured: pl.pricesConfigured });
      } catch { /* non-fatal; form still usable with defaults */ }
    })();
  }, []);

  // Auto-fill the workspace slug from the company name until the user edits it.
  useEffect(() => { if (!subTouched) setSub(slug(company)); }, [company, subTouched]);

  // When country changes, default the currency to that country's.
  function onCountry(cc) {
    setCountry(cc);
    const pack = cfg.countries.find((p) => p.countryCode === cc);
    if (pack && pack.currency) setCurrency(pack.currency);
  }

  // Debounced availability check.
  useEffect(() => {
    if (!subdomain || subdomain.length < 2) { setAvail(null); return; }
    setAvail('checking');
    clearTimeout(availTimer.current);
    availTimer.current = setTimeout(async () => {
      try { const { data } = await api.get('/billing/availability', { params: { subdomain } }); setAvail(!!data.available); }
      catch { setAvail(null); }
    }, 450);
    return () => clearTimeout(availTimer.current);
  }, [subdomain]);

  const canSubmit = company && subdomain.length >= 2 && avail === true && countryCode && baseCurrency
    && adminName && adminEmail && password.length >= 8;

  async function submit() {
    if (!canSubmit) return;
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/billing/register', {
        company, subdomain, countryCode, baseCurrency, plan,
        admin: { name: adminName, email: adminEmail, password },
      });
      setSubdomain(subdomain);
      setDone(data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not create your workspace. Please try again.');
    } finally { setBusy(false); }
  }

  const money = (n) => `${meta.billingCurrency} ${Number(n).toLocaleString()}`;

  if (done) {
    return (
      <Shell title="Workspace created">
        <div style={S.ok}>{done.message}</div>
        <p style={{ color: '#46536b', fontSize: '.9rem', lineHeight: 1.6 }}>
          Your workspace <b>{done.tenant?.subdomain}</b> is on a {done.trialDaysLeft}-day free trial of the{' '}
          <b>{plans.find((p) => p.key === done.tenant?.plan)?.label || done.tenant?.plan}</b> plan.
        </p>
        <button onClick={() => navigate('/login')} style={S.primaryBtn(false)}>Go to sign in</button>
      </Shell>
    );
  }

  return (
    <Shell title="Create your workspace" subtitle={`Start a ${meta.trialDays}-day free trial — no card required.`}>
      {error && <div style={S.error}>{error}</div>}

      <Row>
        <Field label="Company name">
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Ltd" style={S.input} />
        </Field>
        <Field label="Workspace address">
          <div style={{ position: 'relative' }}>
            <input value={subdomain} onChange={(e) => { setSubTouched(true); setSub(slug(e.target.value)); }}
              placeholder="acme" style={{ ...S.input, marginBottom: 4 }} />
          </div>
          <div style={{ fontSize: '.74rem', minHeight: 16, color: avail === false ? '#e5484d' : avail === true ? '#1f7a43' : C.muted }}>
            {subdomain ? (avail === 'checking' ? 'Checking…'
              : avail === true ? '✓ available'
              : avail === false ? 'Taken or invalid — try another'
              : `${subdomain}.nexusoraworkforce.com`) : 'Lowercase letters, numbers, hyphens'}
          </div>
        </Field>
      </Row>

      <Row>
        <Field label="Country">
          <select value={countryCode} onChange={(e) => onCountry(e.target.value)} style={S.input}>
            {cfg.countries.map((p) => <option key={p.countryCode} value={p.countryCode}>{p.countryName}</option>)}
          </select>
        </Field>
        <Field label="Base currency">
          <select value={baseCurrency} onChange={(e) => setCurrency(e.target.value)} style={S.input}>
            {cfg.currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </Field>
      </Row>

      <div style={{ ...S.label, marginTop: 4 }}>Choose a plan</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        {plans.map((p) => {
          const active = plan === p.key;
          return (
            <button key={p.key} type="button" onClick={() => setPlan(p.key)}
              style={{ textAlign: 'left', border: `1.5px solid ${active ? C.navy : C.line}`, background: active ? '#f4f8ff' : '#fff',
                borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ fontWeight: 800, color: C.navy, fontSize: '.95rem' }}>{p.label}</div>
              {meta.pricesConfigured && Number(p.price) >= 0 && (
                <div style={{ color: C.ink, fontSize: '.82rem', marginTop: 2 }}>{money(p.price)}<span style={{ color: C.muted }}>/{p.interval}</span></div>
              )}
              <div style={{ color: C.muted, fontSize: '.74rem', marginTop: 4 }}>
                {p.seatLimit ? `Up to ${p.seatLimit} seats` : 'Unlimited seats'} · {p.modules.length} modules
              </div>
            </button>
          );
        })}
      </div>

      <Row>
        <Field label="Your name">
          <input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Doe" style={S.input} />
        </Field>
        <Field label="Work email">
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="you@company.com" style={S.input} />
        </Field>
      </Row>
      <Field label="Password">
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" style={S.input} />
      </Field>

      <button onClick={submit} disabled={busy || !canSubmit} style={S.primaryBtn(busy || !canSubmit)}>
        {busy ? 'Creating…' : 'Create workspace'}
      </button>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <span style={{ color: C.muted, fontSize: '.85rem' }}>Already have a workspace? </span>
        <Link to="/login" style={S.link}>Sign in</Link>
      </div>
    </Shell>
  );
}

function Field({ label, children }) {
  return <div style={{ flex: 1, minWidth: 0, marginBottom: 14 }}><label style={S.label}>{label}</label>{children}</div>;
}
function Row({ children }) {
  return <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{children}</div>;
}
function Shell({ title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'radial-gradient(1100px 460px at 50% -12%, rgba(22,142,255,.22), transparent 62%), linear-gradient(160deg,#aed9f3 0%,#dff0fa 48%,#eef7fd 100%)',
      padding: 20, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 22, overflow: 'hidden',
        border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(1,33,88,.16)' }}>
        <div style={{ padding: '30px 32px 24px', textAlign: 'center',
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 55%, #0e3a86 100%)` }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: 15, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 10px 26px rgba(0,0,0,.28)' }}>
            <img src="/logo-mark.png" alt="Nexusora Workforce" style={{ width: 38, height: 38, objectFit: 'contain' }} />
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>Nexusora Workforce</div>
        </div>
        <div style={{ padding: '26px 32px' }}>
          <h1 style={{ color: C.navy, fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px' }}>{title}</h1>
          {subtitle && <p style={{ color: C.muted, fontSize: '.9rem', margin: '0 0 20px' }}>{subtitle}</p>}
          {!subtitle && <div style={{ height: 14 }} />}
          {children}
          <div style={{ textAlign: 'center', color: C.muted, fontSize: '.78rem', marginTop: 18 }}>Powered by Nexusora Technologies · © 2025</div>
        </div>
      </div>
    </div>
  );
}
