import { Menu, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import LanguageSwitcher from './LanguageSwitcher';

export default function TopBar({ title, onMenu }) {
  const { user, tenant, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button className="icon-btn" onClick={onMenu} aria-label="Menu"><Menu size={22} /></button>
        <span className="topbar__title">{title}</span>
      </div>
      <div className="topbar__right">
        {tenant && <span className="tenant-chip"><span className="tenant-chip__dot" />{tenant.name}</span>}
        <LanguageSwitcher />
        <div className="user-menu">
          <div className="avatar">{initials}</div>
          <div className="user-menu__meta">
            <div className="user-menu__name">{user?.name}</div>
            <div className="user-menu__role">{user?.role}</div>
          </div>
          <button className="icon-btn" style={{ display: 'inline-grid' }} title={t('auth.logout')}
            onClick={() => { logout(); navigate('/login'); }}><LogOut size={18} /></button>
        </div>
      </div>
    </header>
  );
}
