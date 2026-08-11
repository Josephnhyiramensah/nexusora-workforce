import LanguageSwitcher from './components/LanguageSwitcher';
import { useLocale } from './context/LocaleContext';

export default function App() {
  const { t, locale, dir } = useLocale();
  return (
    <div className="app">
      <header className="app__bar">
        <strong className="app__brand">{t('app.name')}</strong>
        <LanguageSwitcher />
      </header>
      <main className="app__main">
        <h1>{t('home.welcome', { app: t('app.name') })}</h1>
        <p className="app__tagline">{t('app.tagline')}</p>
        <ul className="nav-demo">
          <li>{t('nav.home')}</li>
          <li>{t('nav.employees')}</li>
          <li>{t('nav.attendance')}</li>
          <li>{t('nav.leave')}</li>
          <li>{t('nav.payroll')}</li>
          <li>{t('nav.reports')}</li>
        </ul>
        <p className="meta">{t('home.direction')}: <code>{dir}</code> · locale <code>{locale}</code></p>
      </main>
    </div>
  );
}
