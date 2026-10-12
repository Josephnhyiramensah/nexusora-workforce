// Shared chrome for the public auth pages (login, forgot/reset password, verify
// email). Mirrors the navy brand band on the sign-in card so the whole
// unauthenticated flow reads as one product.
const C = {
  navy: '#012158', navy2: '#0a2c66', blue: '#3485E9', ink: '#16233b',
  muted: '#67728a', line: '#dfe6f0', fieldBg: '#f4f7fc',
};

export default function AuthCard({ title, children, footer }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'radial-gradient(1100px 460px at 50% -12%, rgba(22,142,255,.22), transparent 62%), linear-gradient(160deg,#aed9f3 0%,#dff0fa 48%,#eef7fd 100%)',
      padding: 20, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 22,
        overflow: 'hidden', border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(1,33,88,.16)' }}>
        <div style={{ padding: '32px 32px 26px', textAlign: 'center',
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 55%, #0e3a86 100%)`,
          borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: 16,
            background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 10px 26px rgba(0,0,0,.28)' }}>
            <img src="/logo-mark.png" alt="Nexusora Workforce" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-.01em' }}>Nexusora Workforce</div>
        </div>
        <div style={{ padding: '26px 32px' }}>
          {title && <h1 style={{ color: C.navy, fontSize: '1.3rem', fontWeight: 800, margin: '0 0 20px' }}>{title}</h1>}
          {children}
          <div style={{ textAlign: 'center', color: C.muted, fontSize: '.78rem', marginTop: 18 }}>
            {footer || 'Powered by Nexusora Technologies · © 2025'}
          </div>
        </div>
      </div>
    </div>
  );
}

export const authStyles = {
  label: { display: 'block', fontSize: '.85rem', color: '#46536b', fontWeight: 600, marginBottom: 7 },
  input: { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 11,
    border: `1px solid ${C.line}`, background: C.fieldBg, color: C.ink, fontSize: '.95rem', outline: 'none', fontFamily: 'inherit', marginBottom: 16 },
  primaryBtn: (disabled) => ({ width: '100%', padding: '13px', border: 'none', borderRadius: 12, cursor: disabled ? 'default' : 'pointer',
    color: '#fff', fontWeight: 700, fontSize: '1rem', background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`,
    opacity: disabled ? 0.6 : 1, boxShadow: '0 8px 20px rgba(1,33,88,.25)' }),
  link: { background: 'none', border: 'none', color: C.blue, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', padding: 0 },
  error: { color: '#e5484d', background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 10, fontSize: '.85rem', margin: '0 0 14px' },
  ok: { color: '#1f7a43', background: '#e9f7ef', border: '1px solid #bfe6cd', padding: '10px 12px', borderRadius: 10, fontSize: '.88rem', margin: '0 0 14px' },
};

export { C as authColors };
