import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { SECTIONS, visibleTiles } from '../config/modules';

export default function HomeScreen() {
  const { user } = useAuth();
  const { t } = useLocale();
  return (
    <div className="home">
      <h1 className="home__hello">{t('home.hello', { name: user?.name || '' })}</h1>
      <p className="home__role">{t('home.roleLabel')}: <strong>{user?.role}</strong></p>
      {SECTIONS.map((sec) => {
        const tiles = visibleTiles(sec.tiles, user?.role);
        if (!tiles.length) return null;
        return (
          <section key={sec.key} className="tile-section">
            <h2 className="tile-section__title">{t(`sections.${sec.key}`)}</h2>
            <div className="tile-grid">
              {tiles.map((tile) => {
                const label = t(`tiles.${tile.key}`);
                const body = (
                  <>
                    <span className="tile__label">{label}</span>
                    {!tile.enabled && <span className="tile__badge">{t('common.soon')}</span>}
                  </>
                );
                return tile.enabled && tile.route
                  ? <Link key={tile.key} to={tile.route} className="tile tile--live">{body}</Link>
                  : <div key={tile.key} className="tile tile--soon" aria-disabled="true">{body}</div>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
