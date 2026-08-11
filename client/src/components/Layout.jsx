import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import LanguageSwitcher from './LanguageSwitcher';

export default function Layout({ children }) {
  const { user, tenant, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__brand">{t('app.name')}</Link>
        <div className="topbar__right">
          {tenant && <span className="topbar__tenant">{tenant.name}</span>}
          <LanguageSwitcher />
          {user && (
            <button className="btn-link" onClick={() => { logout(); navigate('/login'); }}>
              {t('auth.logout')}
            </button>
          )}
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
