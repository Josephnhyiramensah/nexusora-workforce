import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getSubdomain, setSubdomain } from '../api/client';
import AuthCard, { authStyles as S } from '../components/AuthCard';

export default function ForgotPasswordPage() {
  const [workspace, setWorkspace] = useState(getSubdomain() || 'demo');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError(''); setBusy(true);
    try {
      setSubdomain(String(workspace).trim().toLowerCase());
      await api.post('/auth/forgot-password', { email });
      setDone(true);
    } catch (e) {
      setError(e?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <AuthCard title="Reset your password">
      {done ? (
        <>
          <div style={S.ok}>If that email is registered, a reset link is on its way. Check your inbox.</div>
          <Link to="/login" style={{ ...S.link, display: 'inline-block' }}>← Back to sign in</Link>
        </>
      ) : (
        <>
          <p style={{ color: '#46536b', fontSize: '.9rem', lineHeight: 1.55, margin: '0 0 18px' }}>
            Enter your workspace and email, and we'll send you a link to set a new password.
          </p>
          {error && <div style={S.error}>{error}</div>}
          <label style={S.label}>Workspace</label>
          <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} onKeyDown={onEnter} placeholder="demo" style={S.input} />
          <label style={S.label}>Email address</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter}
            placeholder="you@company.com" autoComplete="username" style={S.input} />
          <button onClick={submit} disabled={busy || !email} style={S.primaryBtn(busy || !email)}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/login" style={S.link}>← Back to sign in</Link>
          </div>
        </>
      )}
    </AuthCard>
  );
}
