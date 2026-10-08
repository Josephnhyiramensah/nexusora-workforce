import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSubdomain } from '../api/client';

export default function LoginPage() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState(getSubdomain() || 'demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Two-factor second step.
  const [stage, setStage] = useState('creds');          // 'creds' | '2fa'
  const [challengeToken, setChallengeToken] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  async function submit() {
    setError(''); setBusy(true);
    try {
      const res = await login(subdomain, email, password);
      if (res?.twoFactorRequired) { setChallengeToken(res.challengeToken); setStage('2fa'); }
      else navigate('/');
    }
    catch (e) { setError(e?.response?.data?.message || 'Sign in failed'); }
    finally { setBusy(false); }
  }

  async function verify() {
    setError(''); setBusy(true);
    try {
      await verifyTwoFactor(useBackup ? { challengeToken, backupCode: code } : { challengeToken, code });
      navigate('/');
    }
    catch (e) { setError(e?.response?.data?.message || 'Verification failed'); }
    finally { setBusy(false); }
  }

  function backToCreds() { setStage('creds'); setCode(''); setUseBackup(false); setError(''); }
  const onEnter = (e) => { if (e.key === 'Enter') (stage === '2fa' ? verify() : submit()); };

  const C = {
    navy: '#012158', navy2: '#0a2c66', blue: '#3485E9', ink: '#16233b',
    muted: '#67728a', line: '#dfe6f0', fieldBg: '#f4f7fc',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'radial-gradient(1100px 460px at 50% -12%, rgba(22,142,255,.22), transparent 62%), linear-gradient(160deg,#aed9f3 0%,#dff0fa 48%,#eef7fd 100%)',
      padding: 20, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 22,
        overflow: 'hidden', border: `1px solid ${C.line}`, boxShadow: '0 24px 60px rgba(1,33,88,.16)' }}>

        {/* Header — now white, part of one clean card */}
        <div style={{ padding: '34px 32px 26px', textAlign: 'center', borderBottom: `1px solid #eef2f8` }}>
          <div style={{ width: 74, height: 74, margin: '0 auto 16px', borderRadius: 18,
            background: '#fff', display: 'grid', placeItems: 'center',
            border: `1px solid ${C.line}`, boxShadow: '0 8px 22px rgba(1,33,88,.10)' }}>
            <img src="/logo-mark.png" alt="Nexusora Workforce" style={{ width: 52, height: 52, objectFit: 'contain' }} />
          </div>
          <div style={{ color: C.navy, fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-.01em' }}>
            Nexusora Workforce
          </div>
          <div style={{ color: C.muted, fontSize: '.9rem', marginTop: 6 }}>
            People · Performance · Progress
          </div>
        </div>

        {/* White form */}
        <div style={{ padding: '26px 32px 26px' }}>
          <h1 style={{ color: C.navy, fontSize: '1.4rem', fontWeight: 800, margin: '0 0 22px' }}>
            {stage === '2fa' ? 'Two-factor verification' : 'Sign in to your account'}
          </h1>

          {stage === 'creds' && (
            <>
              <Field label="Workspace">
                <IconBox>{/* building icon */}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7a92" strokeWidth="2"><path d="M3 21h18M6 21V7l6-4 6 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/></svg>
                </IconBox>
                <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} onKeyDown={onEnter}
                  placeholder="demo" style={inputStyle(C)} />
              </Field>

              <Field label="Email address">
                <IconBox>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7a92" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
                </IconBox>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter}
                  placeholder="you@company.com" autoComplete="username" style={inputStyle(C)} />
              </Field>

              <Field label="Password">
                <IconBox>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7a92" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </IconBox>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onEnter} autoComplete="current-password" style={{ ...inputStyle(C), paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label="Toggle password"
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7a92" strokeWidth="2">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </Field>
            </>
          )}

          {stage === '2fa' && (
            <>
              <div style={{ color: C.muted, fontSize: '.86rem', lineHeight: 1.55, margin: '0 0 16px' }}>
                {useBackup
                  ? 'Enter one of your saved backup codes.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </div>
              <Field label={useBackup ? 'Backup code' : 'Authenticator code'}>
                <IconBox>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7a92" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </IconBox>
                <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onEnter} autoFocus
                  inputMode={useBackup ? 'text' : 'numeric'} placeholder={useBackup ? 'XXXXX-XXXXX' : '123456'}
                  style={{ ...inputStyle(C), letterSpacing: useBackup ? '.05em' : '.3em', fontWeight: 700 }} />
              </Field>
              <button type="button" onClick={() => { setUseBackup((v) => !v); setCode(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: C.blue, fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', padding: 0, marginBottom: 14 }}>
                {useBackup ? 'Use authenticator app instead' : "Can't access your app? Use a backup code"}
              </button>
            </>
          )}

          {error && (
            <div style={{ color: '#e5484d', background: '#fdecec', border: '1px solid #f6c9cb',
              padding: '9px 12px', borderRadius: 10, fontSize: '.85rem', margin: '0 0 14px' }}>{error}</div>
          )}

          {stage === 'creds' ? (
            <button onClick={submit} disabled={busy || !email || !password}
              style={{ width: '100%', padding: '13px', border: 'none', borderRadius: 12, cursor: 'pointer',
                color: '#fff', fontWeight: 700, fontSize: '1rem',
                background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`,
                opacity: busy || !email || !password ? 0.6 : 1,
                boxShadow: '0 8px 20px rgba(1,33,88,.25)' }}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          ) : (
            <>
              <button onClick={verify} disabled={busy || !code.trim()}
                style={{ width: '100%', padding: '13px', border: 'none', borderRadius: 12, cursor: 'pointer',
                  color: '#fff', fontWeight: 700, fontSize: '1rem',
                  background: `linear-gradient(90deg, ${C.navy}, ${C.blue})`,
                  opacity: busy || !code.trim() ? 0.6 : 1, boxShadow: '0 8px 20px rgba(1,33,88,.25)' }}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button onClick={backToCreds} type="button"
                style={{ width: '100%', padding: '11px', marginTop: 10, border: `1px solid ${C.line}`, borderRadius: 12,
                  cursor: 'pointer', color: C.ink, fontWeight: 600, fontSize: '.9rem', background: '#fff' }}>
                Back
              </button>
            </>
          )}

          <div style={{ textAlign: 'center', color: C.muted, fontSize: '.78rem', marginTop: 18 }}>
            Powered by Nexusora Technologies · © 2025
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: '.85rem', color: '#46536b', fontWeight: 600, marginBottom: 7 }}>{label}</label>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
function IconBox({ children }) {
  return <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center' }}>{children}</span>;
}
function inputStyle(C) {
  return {
    width: '100%', padding: '12px 12px 12px 40px', borderRadius: 11,
    border: `1px solid ${C.line}`, background: C.fieldBg, color: C.ink, fontSize: '.95rem', outline: 'none',
    fontFamily: 'inherit',
  };
}