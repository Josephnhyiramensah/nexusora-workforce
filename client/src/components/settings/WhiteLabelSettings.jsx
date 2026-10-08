/* =====================================================================
   White-label settings — set the workspace brand logo and colours.
   Colours are applied live (CSS variables) on save and persist with the
   tenant branding, so the whole app picks them up on next load too.
   ===================================================================== */
import { useEffect, useState } from 'react';
import { Check, Image as ImageIcon, RotateCcw } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const C = { navy: '#012158', blue: '#3485E9', green: '#1f9d57', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', muted2: '#67728a', line: '#e6ebf3' };

const DEFAULT_PRIMARY = '#012158';
const DEFAULT_ACCENT = '#168eff';

function shade(hex, pct) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const num = parseInt(h, 16); const amt = Math.round(2.55 * pct);
  const cl = (v) => Math.max(0, Math.min(255, v));
  const r = cl((num >> 16) + amt), g = cl(((num >> 8) & 0xff) + amt), b = cl((num & 0xff) + amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function applyLive(primary, accent) {
  const root = document.documentElement;
  if (primary) { root.style.setProperty('--nx-brand', primary); root.style.setProperty('--nx-brand-2', shade(primary, -16)); }
  else { root.style.removeProperty('--nx-brand'); root.style.removeProperty('--nx-brand-2'); }
  if (accent) root.style.setProperty('--nx-accent', accent); else root.style.removeProperty('--nx-accent');
}
const isHex = (v) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(v || ''));

export default function WhiteLabelSettings({ setMsg }) {
  const { tenant } = useAuth();
  const [b, setB] = useState({ primaryColor: '', accentColor: '', logo: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/settings/branding');
        const br = data.branding || {};
        setB({ primaryColor: br.primaryColor || '', accentColor: br.accentColor || '', logo: br.logo || '' });
      } catch { /* defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  const primary = b.primaryColor || DEFAULT_PRIMARY;
  const accent = b.accentColor || DEFAULT_ACCENT;

  function pickLogo() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      if (file.size > 1000000) { setMsg && setMsg('Logo is larger than 1MB — please compress it first.'); return; }
      const reader = new FileReader();
      reader.onload = () => setB((s) => ({ ...s, logo: reader.result }));
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function save() {
    if (b.primaryColor && !isHex(b.primaryColor)) { setMsg && setMsg('Primary colour must be a hex value like #0b3f96.'); return; }
    if (b.accentColor && !isHex(b.accentColor)) { setMsg && setMsg('Accent colour must be a hex value like #168eff.'); return; }
    setSaving(true);
    try {
      await api.put('/settings/branding', { primaryColor: b.primaryColor || '', accentColor: b.accentColor || '', logo: b.logo });
      applyLive(b.primaryColor, b.accentColor); // instant, no reload
      setMsg && setMsg('Brand saved and applied.');
    } catch (e) { setMsg && setMsg(e?.response?.data?.message || 'Could not save brand.'); }
    finally { setSaving(false); }
  }
  function resetDefaults() { setB((s) => ({ ...s, primaryColor: '', accentColor: '' })); applyLive('', ''); }

  if (loading) return <div style={{ color: C.muted, padding: 30 }}>Loading…</div>;

  return (
    <Grid>
      <Panel title="Brand colours" sub="Applied to the top bar brand, primary buttons and highlights across the workspace.">
        <ColorField label="Primary colour" value={b.primaryColor} fallback={DEFAULT_PRIMARY} onChange={(v) => setB((s) => ({ ...s, primaryColor: v }))} />
        <ColorField label="Accent colour" value={b.accentColor} fallback={DEFAULT_ACCENT} onChange={(v) => setB((s) => ({ ...s, accentColor: v }))} />
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={{ ...btn(primary, true), opacity: saving ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 7 }}><Check size={16} /> {saving ? 'Saving…' : 'Save & apply'}</button>
          <button onClick={resetDefaults} style={{ ...btn(C.muted2, false), display: 'inline-flex', alignItems: 'center', gap: 7 }}><RotateCcw size={15} /> Reset to default</button>
        </div>
      </Panel>

      <Panel title="Brand logo" sub="Shown in the top bar and on printed reports. Square PNG/SVG works best.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px solid ${C.line}`, background: b.logo ? '#fff' : `linear-gradient(135deg, ${primary}, ${shade(primary, -16)})` }}>
            {b.logo ? <img src={b.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#fff', fontWeight: 800 }}>N</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={pickLogo} style={btn(primary, true)}>{b.logo ? 'Replace logo' : 'Upload logo'}</button>
            {b.logo && <button onClick={() => setB((s) => ({ ...s, logo: '' }))} style={{ ...btn(C.red, false), borderColor: '#f6c9cb', color: C.red }}>Remove</button>}
          </div>
        </div>
        <div style={{ fontSize: '.78rem', color: C.muted, lineHeight: 1.6 }}>The logo is shared with Company &amp; Letterhead — updating it here updates it everywhere. Remember to <strong>Save &amp; apply</strong> to store a logo change.</div>
      </Panel>

      <Panel title="Live preview" sub="How your brand looks in the app.">
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', background: '#fff', borderBottom: `1px solid ${C.line}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden', background: b.logo ? '#fff' : `linear-gradient(135deg, ${primary}, ${shade(primary, -16)})`, border: b.logo ? `1px solid ${C.line}` : 'none' }}>
              {b.logo ? <img src={b.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#fff', fontWeight: 800, fontSize: '.8rem' }}>N</span>}
            </div>
            <span style={{ fontWeight: 800, color: primary, fontSize: '.9rem' }}>{tenant?.name || 'Your Company'}</span>
            <span style={{ marginLeft: 'auto', width: 9, height: 9, borderRadius: '50%', background: accent }} />
          </div>
          <div style={{ padding: 16, background: '#f4f6f9', display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={{ padding: '9px 16px', border: 'none', borderRadius: 9, background: primary, color: '#fff', fontWeight: 700, cursor: 'default' }}>Primary action</button>
            <span style={{ fontSize: '.8rem', fontWeight: 700, color: accent, background: accent + '18', borderRadius: 8, padding: '5px 10px' }}>Accent label</span>
          </div>
        </div>
      </Panel>
    </Grid>
  );
}

/* --- atoms --- */
function ColorField({ label, value, fallback, onChange }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={lbl()}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 40, padding: 2, border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', cursor: 'pointer' }} />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={fallback}
          style={{ flex: 1, padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.92rem', color: C.ink, fontFamily: 'ui-monospace, Menlo, monospace' }} />
      </div>
    </label>
  );
}
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>{children}</div>; }
function Panel({ title, sub, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 20, marginBottom: 18 }}>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{title}</div>
      {sub && <div style={{ color: C.muted, fontSize: '.84rem', margin: '4px 0 16px', lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
}
function lbl() { return { fontSize: '.78rem', color: C.muted, fontWeight: 700, marginBottom: 6 }; }
function btn(color, solid) {
  return { padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '.84rem', fontFamily: 'inherit',
    border: solid ? 'none' : `1px solid ${C.line}`, background: solid ? color : '#fff', color: solid ? '#fff' : color };
}
