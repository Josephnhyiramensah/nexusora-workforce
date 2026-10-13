import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowRight, ArrowLeft, Loader2, ShieldCheck, Sparkles, Building2, UserCog } from 'lucide-react';
import api, { setSubdomain } from '../api/client';

// ---- Brand palette (Nexusora Workforce) -------------------------------------
const C = {
  navy: '#012158', navy2: '#0a2c66', blue: '#3485E9', accent: '#168eff',
  ink: '#16233b', muted: '#67728a', line: '#E2E8F0',
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// A plan's selling-point bullets, built from the live catalog (never hardcoded
// prices). featureLabels/moduleLabels come from the same /billing/plans call.
function planBullets(p, featureLabels) {
  const bullets = [];
  bullets.push(p.seatLimit ? `Up to ${p.seatLimit} team members` : 'Unlimited team members');
  bullets.push(`${(p.modules || []).length} HR modules included`);
  for (const f of (p.features || []).slice(0, 3)) {
    if (featureLabels && featureLabels[f]) bullets.push(featureLabels[f]);
  }
  if (p.key === 'enterprise') bullets.push('Dedicated onboarding & priority support');
  bullets.push('30-day free trial · no card required');
  return bullets;
}

const PLAN_ACCENT = { starter: '#3485E9', professional: '#168eff', enterprise: '#0a2c66' };

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [cfg, setCfg] = useState({ countries: [], currencies: [] });
  const [plans, setPlans] = useState([]);
  const [meta, setMeta] = useState({ trialDays: 30, baseCurrency: 'GHS', pricesConfigured: false, featureLabels: {} });

  const [selectedKey, setSelectedKey] = useState('professional');
  const [company, setCompany] = useState('');
  const [subdomain, setSub] = useState('');
  const [subTouched, setSubTouched] = useState(false);
  const [countryCode, setCountry] = useState('GH');
  const [baseCurrency, setCurrency] = useState('GHS');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [avail, setAvail] = useState(null);   // null | 'checking' | true | false
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const availTimer = useRef(null);

  // Load config + live plan catalog.
  useEffect(() => {
    (async () => {
      try {
        const [{ data: config }, { data: pl }] = await Promise.all([api.get('/config'), api.get('/billing/plans')]);
        setCfg({ countries: config.countries || [], currencies: config.currencies || [] });
        setPlans((pl.plans || []).sort((a, b) => a.order - b.order));
        setMeta({ trialDays: pl.trialDays || 30, baseCurrency: pl.baseCurrency || 'GHS',
          pricesConfigured: !!pl.pricesConfigured, featureLabels: pl.featureLabels || {} });
      } catch { /* non-fatal; form still usable with defaults */ }
    })();
  }, []);

  useEffect(() => { if (!subTouched) setSub(slug(company)); }, [company, subTouched]);

  function onCountry(cc) {
    setCountry(cc);
    const pack = cfg.countries.find((p) => p.countryCode === cc);
    if (pack && pack.currency) setCurrency(pack.currency);
  }

  // Debounced workspace-availability check.
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

  const selectedPlan = useMemo(() => plans.find((p) => p.key === selectedKey) || null, [plans, selectedKey]);
  const money = (n, cur) => `${cur || meta.baseCurrency} ${Number(n || 0).toLocaleString()}`;

  const companyOk = company && subdomain.length >= 2 && avail === true && countryCode && baseCurrency;
  const adminOk = adminName && adminEmail && password.length >= 8 && password === confirm;

  async function submit() {
    if (!companyOk || !adminOk) return;
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/billing/register', {
        company, subdomain, countryCode, baseCurrency, plan: selectedKey,
        admin: { name: adminName, email: adminEmail, password },
      });
      setSubdomain(subdomain);
      setDone(data);
      setStep(4);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not create your workspace. Please try again.');
    } finally { setBusy(false); }
  }

  const STEPS = ['Plan', 'Company', 'Admin account'];

  return (
    <div style={sx.page}>
      <style>{KEYFRAMES}</style>

      {/* Top nav */}
      <header style={sx.nav}>
        <div style={sx.brand}>
          <div style={sx.logoMark}><img src="/logo-mark.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} /></div>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-.01em' }}>Nexusora Workforce</span>
        </div>
        <Link to="/login" style={sx.signIn}>Sign in <ArrowRight size={14} /></Link>
      </header>

      <main style={{ maxWidth: step === 1 ? 1120 : 600, margin: '0 auto', padding: '8px 24px 72px', width: '100%', boxSizing: 'border-box' }}>

        {/* ---- Step 1 · Plans ---- */}
        {step === 1 && (
          <div style={sx.fade}>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <h1 style={sx.h1}>Build a workforce that runs itself</h1>
              <p style={sx.sub}>Pick a plan to start your {meta.trialDays}-day free trial. No card required — upgrade, downgrade or cancel anytime.</p>
            </div>

            <div style={sx.planGrid}>
              {plans.map((p, i) => {
                const popular = p.key === 'professional';
                const accent = PLAN_ACCENT[p.key] || C.blue;
                const bullets = planBullets(p, meta.featureLabels);
                return (
                  <div key={p.key} className="nx-plan" onClick={() => { setSelectedKey(p.key); setStep(2); }}
                    style={{ ...sx.planCard, border: popular ? `2px solid ${accent}` : '1px solid rgba(255,255,255,0.14)',
                      animationDelay: `${i * 70}ms` }}>
                    {popular && <div style={{ ...sx.popular, background: accent }}><Sparkles size={12} /> MOST POPULAR</div>}
                    <div style={{ fontSize: 12, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{p.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minHeight: 44 }}>
                      {meta.pricesConfigured && Number(p.price) > 0 ? (
                        <>
                          <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{money(p.price, p.currency)}</span>
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>/{p.interval || 'month'}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Free for {meta.trialDays} days</span>
                      )}
                    </div>
                    <div style={{ margin: '18px 0 22px' }}>
                      {bullets.map((b, bi) => (
                        <div key={bi} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 9 }}>
                          <Check size={15} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.4 }}>{b}</span>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedKey(p.key); setStep(2); }}
                      style={{ ...sx.planCta, background: popular ? accent : 'transparent',
                        border: popular ? 'none' : `1.5px solid ${accent}`, color: popular ? '#fff' : '#cfe4ff' }}>
                      Start free trial <ArrowRight size={15} />
                    </button>
                  </div>
                );
              })}
              {plans.length === 0 && <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', gridColumn: '1/-1' }}>Loading plans…</p>}
            </div>

            <p style={sx.trustRow}><ShieldCheck size={14} /> Secure · multi-currency · multi-tenant · Powered by Nexusora Technologies</p>
            <p style={{ textAlign: 'center', marginTop: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Already have a workspace? </span>
              <Link to="/login" style={{ color: C.accent, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Sign in</Link>
            </p>
          </div>
        )}

        {/* ---- Steps 2 & 3 · Form ---- */}
        {(step === 2 || step === 3) && (
          <div style={sx.slide}>
            {/* Stepper */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
              {STEPS.map((s, i) => {
                const n = i + 1, active = n === step, doneStep = n < step;
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%',
                      background: doneStep || active ? C.accent : 'rgba(255,255,255,0.18)',
                      color: doneStep || active ? '#fff' : 'rgba(255,255,255,0.6)',
                      display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>
                      {doneStep ? <Check size={14} /> : n}
                    </div>
                    <span style={{ fontSize: 13, color: active ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: active ? 700 : 400 }}>{s}</span>
                    {i < STEPS.length - 1 && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.2)' }} />}
                  </div>
                );
              })}
            </div>

            <div style={sx.formCard}>
              {selectedPlan && (
                <div style={sx.selBar}>
                  <span style={{ fontSize: 13, color: C.muted }}>Selected plan</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: PLAN_ACCENT[selectedPlan.key] || C.blue }}>
                    {selectedPlan.label}{meta.pricesConfigured && Number(selectedPlan.price) > 0 ? ` — ${money(selectedPlan.price, selectedPlan.currency)}/${selectedPlan.interval || 'mo'}` : ` — free ${meta.trialDays}-day trial`}
                  </span>
                  <button onClick={() => setStep(1)} style={sx.changeBtn}>Change</button>
                </div>
              )}

              {error && <div style={sx.error}>⚠️ {error}</div>}

              {/* Step 2 — Company */}
              {step === 2 && (
                <>
                  <h2 style={sx.h2}><Building2 size={20} style={{ marginBottom: -3, color: C.navy }} /> Company details</h2>
                  <p style={sx.formSub}>Tell us about your organisation. This sets up your private, isolated workspace.</p>

                  <L label="Company name *">
                    <input style={sx.inp} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Industries Ltd" />
                  </L>

                  <L label="Your workspace address *">
                    <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.line}`, borderRadius: 11, overflow: 'hidden' }}>
                      <input style={{ ...sx.inp, border: 'none', borderRadius: 0, flex: 1, marginBottom: 0 }}
                        value={subdomain} onChange={(e) => { setSubTouched(true); setSub(slug(e.target.value)); }} placeholder="acme" />
                      <span style={{ padding: '12px 14px', background: '#F4F7FC', fontSize: 13, color: C.muted, borderLeft: `1px solid ${C.line}`, whiteSpace: 'nowrap' }}>.nexusoraworkforce.com</span>
                    </div>
                    <div style={{ fontSize: 12, minHeight: 16, marginTop: 5, color: avail === false ? '#e5484d' : avail === true ? '#16A34A' : C.muted }}>
                      {subdomain ? (avail === 'checking' ? 'Checking availability…'
                        : avail === true ? `✓ Available — your team will log in at ${subdomain}.nexusoraworkforce.com`
                        : avail === false ? 'Taken or invalid — try another name'
                        : '') : 'Lowercase letters, numbers and hyphens'}
                    </div>
                  </L>

                  <Row>
                    <L label="Country">
                      <select value={countryCode} onChange={(e) => onCountry(e.target.value)} style={sx.inp}>
                        {cfg.countries.length === 0 && <option value="GH">Ghana</option>}
                        {cfg.countries.map((p) => <option key={p.countryCode} value={p.countryCode}>{p.countryName}</option>)}
                      </select>
                    </L>
                    <L label="Base currency">
                      <select value={baseCurrency} onChange={(e) => setCurrency(e.target.value)} style={sx.inp}>
                        {cfg.currencies.length === 0 && <option value="GHS">GHS — Ghana Cedi</option>}
                        {cfg.currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                      </select>
                    </L>
                  </Row>

                  <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                    <button onClick={() => setStep(1)} style={sx.backBtn}><ArrowLeft size={14} /> Back</button>
                    <button onClick={() => { if (!companyOk) { setError(avail === true ? 'Please complete all required fields.' : 'Choose an available workspace address.'); return; } setError(''); setStep(3); }}
                      style={sx.nextBtn}>Continue <ArrowRight size={14} /></button>
                  </div>
                </>
              )}

              {/* Step 3 — Admin */}
              {step === 3 && (
                <>
                  <h2 style={sx.h2}><UserCog size={20} style={{ marginBottom: -3, color: C.navy }} /> Administrator account</h2>
                  <p style={sx.formSub}>This is your owner login — you'll use it to invite your team and manage everything.</p>

                  <L label="Full name *">
                    <input style={sx.inp} value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Doe" />
                  </L>
                  <L label="Work email *">
                    <input type="email" style={sx.inp} value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
                  </L>
                  <Row>
                    <L label="Password *">
                      <input type="password" style={sx.inp} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" autoComplete="new-password" />
                    </L>
                    <L label="Confirm password *">
                      <input type="password" style={sx.inp} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" />
                    </L>
                  </Row>
                  {confirm && password !== confirm && <div style={{ fontSize: 12, color: '#e5484d', marginTop: -6, marginBottom: 12 }}>Passwords don't match</div>}

                  <div style={sx.note}>📋 After you register, your team signs in at <strong>{subdomain || 'yourcompany'}.nexusoraworkforce.com</strong>. We'll email you a link to verify your address.</div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setStep(2)} style={sx.backBtn}><ArrowLeft size={14} /> Back</button>
                    <button onClick={submit} disabled={busy || !adminOk} style={{ ...sx.nextBtn, opacity: busy || !adminOk ? 0.6 : 1, cursor: busy || !adminOk ? 'not-allowed' : 'pointer' }}>
                      {busy ? <><Loader2 size={16} className="nx-spin" /> Creating your workspace…</> : <>🚀 Start free trial</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---- Step 4 · Success ---- */}
        {step === 4 && done && (
          <div style={{ ...sx.pop, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
            <div style={{ fontSize: 72, marginBottom: 18 }}>🎉</div>
            <h1 style={sx.h1}>Welcome to Nexusora Workforce!</h1>
            <p style={{ ...sx.sub, marginBottom: 28 }}>{done.message || 'Your workspace is ready.'}</p>

            <div style={sx.successCard}>
              <p style={sx.scLabel}>Your login URL</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: C.accent, marginBottom: 20 }}>{done.tenant?.subdomain}.nexusoraworkforce.com</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'left' }}>
                <div>
                  <p style={sx.scK}>PLAN</p>
                  <p style={sx.scV}>{plans.find((p) => p.key === done.tenant?.plan)?.label || done.tenant?.plan}</p>
                </div>
                <div>
                  <p style={sx.scK}>TRIAL</p>
                  <p style={sx.scV}>{done.trialDaysLeft != null ? `${done.trialDaysLeft} days free` : 'Active'}</p>
                </div>
              </div>
            </div>

            <button onClick={() => navigate('/login')} style={sx.openBtn}>Go to sign in <ArrowRight size={18} /></button>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 18 }}>Bookmark your URL and share it with your team.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ---- Small layout helpers ---------------------------------------------------
function L({ label, children }) {
  return <div style={{ flex: 1, minWidth: 0, marginBottom: 16 }}><label style={sx.label}>{label}</label>{children}</div>;
}
function Row({ children }) {
  return <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>{children}</div>;
}

const KEYFRAMES = `
@keyframes nxFade { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes nxSlide { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
@keyframes nxPop { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
@keyframes nxSpin { to { transform: rotate(360deg); } }
@keyframes nxCardIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.nx-plan { animation: nxCardIn .5s both; transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
.nx-plan:hover { transform: translateY(-5px); background: rgba(255,255,255,0.12) !important; box-shadow: 0 18px 44px rgba(0,0,0,.35); }
.nx-spin { animation: nxSpin 1s linear infinite; }
`;

// ---- Styles -----------------------------------------------------------------
const sx = {
  page: { minHeight: '100vh', width: '100%',
    background: `radial-gradient(1200px 520px at 50% -10%, rgba(52,133,233,.28), transparent 60%), linear-gradient(160deg, #01143a 0%, ${C.navy} 46%, ${C.navy2} 100%)`,
    fontFamily: 'Inter, system-ui, Arial, sans-serif' },
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', maxWidth: 1180, margin: '0 auto', boxSizing: 'border-box' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 11, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 8px 22px rgba(0,0,0,.3)' },
  signIn: { display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '8px 16px' },

  h1: { fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 800, color: '#fff', margin: '0 0 12px', letterSpacing: '-.02em' },
  sub: { fontSize: 16, color: 'rgba(255,255,255,0.62)', maxWidth: 580, margin: '0 auto', lineHeight: 1.5 },

  fade: { animation: 'nxFade .5s both' },
  slide: { animation: 'nxSlide .4s both' },
  pop: { animation: 'nxPop .5s both' },

  planGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'start' },
  planCard: { background: 'rgba(255,255,255,0.07)', borderRadius: 18, padding: '30px 26px', cursor: 'pointer', position: 'relative', backdropFilter: 'blur(4px)' },
  popular: { position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', color: '#fff', padding: '4px 14px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  planCta: { width: '100%', padding: 12, borderRadius: 11, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 },
  trustRow: { textAlign: 'center', color: 'rgba(255,255,255,0.42)', fontSize: 13, marginTop: 34, display: 'inline-flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: 7 },

  formCard: { background: '#fff', borderRadius: 20, padding: '34px 36px', boxShadow: '0 24px 64px rgba(0,0,0,.32)' },
  selBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 22, padding: '10px 16px', background: '#F4F7FC', borderRadius: 10, border: `1px solid ${C.line}` },
  changeBtn: { fontSize: 12, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 },
  h2: { fontSize: 21, fontWeight: 800, color: C.navy, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 },
  formSub: { fontSize: 13, color: C.muted, margin: '0 0 22px', lineHeight: 1.5 },
  label: { display: 'block', fontSize: '.84rem', color: '#46536b', fontWeight: 600, marginBottom: 7 },
  inp: { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 11, border: `1px solid ${C.line}`,
    background: '#F4F7FC', color: C.ink, fontSize: '.95rem', outline: 'none', fontFamily: 'inherit', marginBottom: 0 },
  note: { padding: '12px 16px', background: '#F0F7FF', borderRadius: 10, fontSize: 13, color: '#1E40AF', margin: '6px 0 22px', lineHeight: 1.5 },
  error: { padding: '11px 15px', background: '#FEE2E2', borderRadius: 10, color: '#DC2626', fontSize: 13, marginBottom: 18 },
  backBtn: { padding: '12px 22px', borderRadius: 11, border: `1px solid ${C.line}`, background: '#fff', fontSize: 14, color: C.muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 },
  nextBtn: { flex: 1, padding: '13px 24px', borderRadius: 11, background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`, color: '#fff', fontSize: 14.5, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 },

  successCard: { background: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 28, marginBottom: 30, border: '1px solid rgba(255,255,255,0.18)' },
  scLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.08em' },
  scK: { fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 2px' },
  scV: { fontSize: 15, fontWeight: 700, color: '#fff', margin: 0, textTransform: 'capitalize' },
  openBtn: { width: '100%', maxWidth: 400, padding: '15px 32px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: `linear-gradient(90deg, ${C.blue}, ${C.accent})`, color: '#fff', fontSize: 16, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 12px 30px rgba(52,133,233,.4)' },
};
