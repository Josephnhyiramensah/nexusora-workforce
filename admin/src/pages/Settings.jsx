import { useEffect, useState } from 'react';
import api from '../api';
import { C, PageHead, Card, Btn, SubTabs, Callout, inp, L, Grid } from '../ui';

export default function Settings() {
  const [tab, setTab] = useState('pricing');
  const [msg, setMsg] = useState('');
  return (
    <>
      <PageHead title="Platform Settings" sub="Pricing, company contact, branding and email — editable, nothing hardcoded." />
      <SubTabs active={tab} onChange={(k) => { setTab(k); setMsg(''); }} tabs={[
        { key: 'pricing', label: '💰 Pricing' }, { key: 'company', label: '🏢 Company' }, { key: 'branding', label: '🎨 Branding' }, { key: 'smtp', label: '📧 SMTP' },
      ]} />
      {msg && <div style={{ marginBottom: 14 }}><Callout tone="ok">{msg}</Callout></div>}
      {tab === 'pricing' ? <Pricing setMsg={setMsg} /> : <PlatformSettings tab={tab} setMsg={setMsg} />}
    </>
  );
}

function Pricing({ setMsg }) {
  const [rows, setRows] = useState([]);
  async function load() { const { data } = await api.get('/pricing'); setRows((data.pricing || []).map((p) => ({ ...p, overridesText: JSON.stringify(p.prices || {}) }))); }
  useEffect(() => { load(); }, []);
  const upd = (i, k, v) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  async function save(r) {
    let prices = {};
    try { prices = r.overridesText ? JSON.parse(r.overridesText) : {}; } catch { setMsg(`Overrides for ${r.plan} must be valid JSON.`); return; }
    try {
      await api.put(`/pricing/${r.plan}`, { baseCurrency: String(r.baseCurrency || 'GHS').toUpperCase(), basePrice: Number(r.basePrice) || 0, seatPrice: Number(r.seatPrice) || 0, interval: r.interval || 'month', prices });
      setMsg(`Saved ${r.plan} pricing.`); load();
    } catch (e) { setMsg(e?.response?.data?.message || 'Save failed.'); }
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {rows.map((r, i) => (
        <Card key={r.plan}>
          <div style={{ fontWeight: 800, color: C.navy, textTransform: 'capitalize', marginBottom: 12, fontSize: '1.05rem' }}>{r.plan}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <L label="Base currency"><input style={inp} value={r.baseCurrency || ''} onChange={(e) => upd(i, 'baseCurrency', e.target.value)} /></L>
            <L label="Base price / interval"><input type="number" style={inp} value={r.basePrice} onChange={(e) => upd(i, 'basePrice', e.target.value)} /></L>
            <L label="Seat price"><input type="number" style={inp} value={r.seatPrice} onChange={(e) => upd(i, 'seatPrice', e.target.value)} /></L>
            <L label="Interval"><select style={inp} value={r.interval} onChange={(e) => upd(i, 'interval', e.target.value)}><option value="month">month</option><option value="year">year</option></select></L>
          </div>
          <div style={{ marginTop: 12 }}><L label='Per-currency overrides (JSON, e.g. {"USD":20})'><input style={inp} value={r.overridesText} onChange={(e) => upd(i, 'overridesText', e.target.value)} placeholder="{}" /></L></div>
          <div style={{ marginTop: 14, textAlign: 'right' }}><Btn small onClick={() => save(r)}>Save {r.plan}</Btn></div>
        </Card>
      ))}
    </div>
  );
}

function PlatformSettings({ tab, setMsg }) {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/settings').then(({ data }) => setS(data.settings)).catch(() => {}); }, []);
  if (!s) return <Card>Loading…</Card>;
  const setSec = (sec, k, v) => setS({ ...s, [sec]: { ...s[sec], [k]: v } });
  async function save() {
    setSaving(true); setMsg('');
    try { const { data } = await api.put('/settings', { company: s.company, branding: s.branding, smtp: s.smtp }); setS(data.settings); setMsg('Settings saved.'); }
    catch (e) { setMsg(e?.response?.data?.message || 'Save failed.'); } finally { setSaving(false); }
  }

  const COMPANY = [['name', 'Company name'], ['developer', 'Developer / CTO'], ['email', 'Business email'], ['supportEmail', 'Support email'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp (digits)'], ['website', 'Website'], ['address', 'Address'], ['tagline', 'Tagline']];
  const SMTP = [['host', 'SMTP host', 'text'], ['port', 'Port', 'number'], ['user', 'Username', 'text'], ['fromName', 'From name', 'text']];

  return (
    <Card>
      {tab === 'company' && (
        <Grid cols={2}>
          {COMPANY.map(([k, label]) => <L key={k} label={label}><input style={inp} value={s.company?.[k] || ''} onChange={(e) => setSec('company', k, e.target.value)} /></L>)}
        </Grid>
      )}
      {tab === 'branding' && (
        <Grid cols={2}>
          <L label="Platform name"><input style={inp} value={s.branding?.platformName || ''} onChange={(e) => setSec('branding', 'platformName', e.target.value)} /></L>
          <div />
          {['primaryColor', 'accentColor'].map((k) => (
            <L key={k} label={k === 'primaryColor' ? 'Primary color' : 'Accent color'}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={s.branding?.[k] || '#012158'} onChange={(e) => setSec('branding', k, e.target.value)} style={{ width: 44, height: 40, borderRadius: 8, border: `1px solid ${C.line}`, padding: 2 }} />
                <input style={{ ...inp, flex: 1 }} value={s.branding?.[k] || ''} onChange={(e) => setSec('branding', k, e.target.value)} />
              </div>
            </L>
          ))}
        </Grid>
      )}
      {tab === 'smtp' && (
        <>
          <Grid cols={2}>{SMTP.map(([k, label, type]) => <L key={k} label={label}><input type={type} style={inp} value={s.smtp?.[k] ?? ''} onChange={(e) => setSec('smtp', k, type === 'number' ? Number(e.target.value) : e.target.value)} /></L>)}</Grid>
          <div style={{ marginTop: 14 }}><Callout tone="warn">The SMTP password stays in <code>server/.env</code> as <code>SMTP_PASS</code> / <code>BREVO_SMTP_PASS</code> — never stored here.</Callout></div>
        </>
      )}
      <div style={{ marginTop: 18, textAlign: 'right' }}><Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Btn></div>
    </Card>
  );
}
