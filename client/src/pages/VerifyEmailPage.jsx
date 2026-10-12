import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { setSubdomain } from '../api/client';
import AuthCard, { authStyles as S } from '../components/AuthCard';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const workspace = params.get('workspace') || '';
  const [state, setState] = useState(token ? 'verifying' : 'missing'); // verifying | ok | error | missing
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        if (workspace) setSubdomain(String(workspace).trim().toLowerCase());
        const { data } = await api.post('/auth/verify-email', { token });
        setMessage(data?.message || 'Email verified — thank you.');
        setState('ok');
      } catch (e) {
        setMessage(e?.response?.data?.message || 'This verification link is invalid or has expired.');
        setState('error');
      }
    })();
  }, [token, workspace]);

  return (
    <AuthCard title="Email verification">
      {state === 'verifying' && <p style={{ color: '#46536b', fontSize: '.92rem' }}>Verifying your email…</p>}
      {state === 'missing' && <div style={S.error}>This verification link is missing its token.</div>}
      {state === 'ok' && <div style={S.ok}>{message}</div>}
      {state === 'error' && <div style={S.error}>{message}</div>}
      {state !== 'verifying' && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/login" style={S.link}>Continue to sign in →</Link>
        </div>
      )}
    </AuthCard>
  );
}
