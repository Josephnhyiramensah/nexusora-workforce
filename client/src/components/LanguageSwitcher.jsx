import { useLocale } from '../context/LocaleContext';

// Language dropdown. Shows every registered locale; a bullet marks languages whose
// translations are not shipped yet (they fall back to English text but still apply RTL/LTR).
export default function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useLocale();
  return (
    <label className="lang-switcher">
      <span className="lang-switcher__label">{t('common.language')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {(l.nativeName || l.name) + (l.status && l.status !== 'ready' ? ' •' : '')}
          </option>
        ))}
      </select>
    </label>
  );
}
