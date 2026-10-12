import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { setSubdomain } from '../api/client';
import AuthCard, { authStyles as S } from '../components/AuthCard';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const workspace = params.get('workspace') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = token && password.length >= 8 && password === confirm;

  async function submit() {
    if (!canSubmit) return;
    setError(''); setBusy(true);
    try {
      if (workspace) setSubdomain(String(workspace).trim().toLowerCase());
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2200);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not reset your password. The link may have expired.');
    } finally { setBusy(false); }
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(); };

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <div style={S.error}>This reset link is missing its token. Please request a new one.</div>
        <Link to="/forgot-password" style={S.link}>Request a new link</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password">
      {done ? (
        <div style={S.ok}>Your password has been reset. Taking you to sign in…</div>
      ) : (
        <>
          {error && <div style={S.error}>{error}</div>}
          <label style={S.label}>New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter}
            autoComplete="new-password" placeholder="At least 8 characters" style={S.input} />
          <label style={S.label}>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={onEnter}
            autoComplete="new-password" style={S.input} />
          {tooShort && <div style={{ color: '#c77700', fontSize: '.8rem', margin: '-8px 0 14px' }}>Password must be at least 8 characters.</div>}
          {mismatch && <div style={{ color: '#c77700', fontSize: '.8rem', margin: '-8px 0 14px' }}>Passwords don't match.</div>}
          <button onClick={submit} disabled={busy || !canSubmit} style={S.primaryBtn(busy || !canSubmit)}>
            {busy ? 'Saving…' : 'Reset password'}
          </button>
        </>
      )}
    </AuthCard>
  );
}
