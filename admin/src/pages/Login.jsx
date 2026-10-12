import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth';
import { C } from '../ui';

export default function Login() {
  const { login } = usePlatformAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError(''); setBusy(true);
    try { await login(email, password); nav('/'); }
    catch (e) { setError(e?.response?.data?.message || 'Sign in failed'); }
    finally { setBusy(false); }
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(); };

  const input = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 11, border: `1px solid ${C.line}`, background: '#f4f7fc', color: C.ink, fontSize: '.95rem', outline: 'none', marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: `linear-gradient(160deg, ${C.navy}, ${C.navy2})`, padding: 20, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 20, padding: 32, boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ width: 52, height: 52, margin: '0 auto 12px', borderRadius: 13, background: C.navy, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22 }}>N</div>
          <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.2rem' }}>Admin Console</div>
          <div style={{ color: C.muted, fontSize: '.82rem', marginTop: 3 }}>Nexusora Workforce — platform operations</div>
        </div>
        {error && <div style={{ color: C.red, background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 10, fontSize: '.85rem', marginBottom: 14 }}>{error}</div>}
        <label style={{ fontSize: '.84rem', color: '#46536b', fontWeight: 600 }}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} placeholder="admin@nexusora.app" style={{ ...input, marginTop: 6 }} />
        <label style={{ fontSize: '.84rem', color: '#46536b', fontWeight: 600 }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} style={{ ...input, marginTop: 6 }} />
        <button onClick={submit} disabled={busy || !email || !password} style={{ width: '100%', padding: 13, border: 'none', borderRadius: 11, color: '#fff', fontWeight: 700, fontSize: '1rem', background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`, cursor: 'pointer', opacity: busy || !email || !password ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </div>
  );
}
