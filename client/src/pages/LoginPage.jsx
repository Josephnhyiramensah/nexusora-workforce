import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { getSubdomain } from '../api/client';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState(getSubdomain() || 'demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(''); setBusy(true);
    try { await login(subdomain, email, password); navigate('/'); }
    catch (e) { setError(e?.response?.data?.message || t('auth.failed')); }
    finally { setBusy(false); }
  }
  const onEnter = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-card__head">
          <span className="auth-card__brand">{t('app.name')}</span>
          <LanguageSwitcher />
        </div>
        <h1 className="auth-card__title">{t('auth.signIn')}</h1>
        <p className="auth-card__sub">{t('app.tagline')}</p>
        <label className="field">{t('auth.workspace')}
          <input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="demo" onKeyDown={onEnter} />
        </label>
        <label className="field">{t('auth.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} autoComplete="username" />
        </label>
        <label className="field">{t('auth.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} autoComplete="current-password" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary btn-block" disabled={busy || !email || !password} onClick={submit}>
          {busy ? t('common.loading') : t('auth.signIn')}
        </button>
      </div>
    </div>
  );
}
