import { NavLink } from 'react-router-dom';
import { LayoutGrid, LogOut } from 'lucide-react';
import { getIcon } from '../config/icons';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { SECTIONS, visibleTiles } from '../config/modules';

export default function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <div className="sb-user">
        <div className="sb-user__avatar">{initials}</div>
        <div>
          <div className="sb-user__name">{user?.name}</div>
          <div className="sb-user__role">{user?.role}</div>
        </div>
      </div>
      <nav className="sb-nav">
        <NavLink to="/" end onClick={onNavigate} className="sb-item">
          <span className="sb-item__icon"><LayoutGrid size={18} strokeWidth={1.9} /></span>{t('nav.home')}
        </NavLink>
        {SECTIONS.map((sec) => {
          const tiles = visibleTiles(sec.tiles, user?.role);
          if (!tiles.length) return null;
          return (
            <div className="sb-group" key={sec.key}>
              <div className="sb-group__label">{t(`sections.${sec.key}`)}</div>
              {tiles.map((tile) => {
                const Icon = getIcon(tile.icon);
                if (tile.enabled && tile.route) {
                  return (
                    <NavLink key={tile.key} to={tile.route} onClick={onNavigate}
                      className={({ isActive }) => `sb-item ${isActive ? 'is-active' : ''}`}>
                      <span className="sb-item__icon"><Icon size={18} strokeWidth={1.9} /></span>{t(`tiles.${tile.key}`)}
                    </NavLink>
                  );
                }
                return (
                  <div key={tile.key} className="sb-item is-soon">
                    <span className="sb-item__icon"><Icon size={18} strokeWidth={1.9} /></span>{t(`tiles.${tile.key}`)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>
      <button className="sb-logout" onClick={logout}><LogOut size={17} />{t('auth.logout')}</button>
    </>
  );
}
