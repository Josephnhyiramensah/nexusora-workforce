import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
    catch (e) { setError(e?.response?.data?.message || 'Invalid credentials'); }
    finally { setBusy(false); }
  }
  const input = { width: '100%', boxSizing: 'border-box', padding: '12px 15px', borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, outline: 'none', marginBottom: 12 };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, #0a1a33, ${C.navy})`, fontFamily: 'Inter, system-ui, Arial, sans-serif', padding: 20 }}>
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
        style={{ background: '#fff', borderRadius: 20, padding: '44px 40px', width: 400, maxWidth: '100%', textAlign: 'center', boxShadow: '0 30px 70px rgba(0,0,0,0.35)' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 18px', borderRadius: 15, background: `linear-gradient(135deg, ${C.navy}, ${C.blue})`, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 24 }}>N</div>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: C.navy, margin: '0 0 5px' }}>Developer Console</h1>
        <p style={{ fontSize: 12.5, color: C.muted, margin: '0 0 26px' }}>Nexusora Technologies · Restricted Access</p>
        {error && <div style={{ padding: '10px 15px', background: '#fdecec', border: '1px solid #f6c9cb', borderRadius: 10, color: C.red, fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Platform admin email" style={input} />
        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Master admin password" style={input} />
        <motion.button onClick={submit} disabled={busy || !email || !password} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          style={{ width: '100%', padding: 13, borderRadius: 10, background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`, color: '#fff', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: busy || !email || !password ? 0.6 : 1 }}>
          {busy ? 'Signing in…' : 'Access Console'}
        </motion.button>
        <p style={{ fontSize: 11, color: C.faint, marginTop: 16 }}>Nexusora Technologies — Internal Use Only</p>
      </motion.div>
    </div>
  );
}
