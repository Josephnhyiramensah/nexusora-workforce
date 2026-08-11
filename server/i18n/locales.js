// Locale registry for Nexusora Workforce.
// English is the DEFAULT and the only fully-translated locale at launch.
// Every other locale is registered here and becomes selectable in the language switcher;
// its UI strings are supplied by dropping in a translation JSON file (no code change).
// `dir` drives layout direction — 'rtl' for Arabic enables right-to-left rendering.
// `status`: 'ready' = strings shipped, 'registered' = selectable, translations pending.

const LOCALES = [
  { code: 'en', name: 'English',    nativeName: 'English',    dir: 'ltr', status: 'ready' },
  { code: 'fr', name: 'French',     nativeName: 'Français',   dir: 'ltr', status: 'registered' },
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',     dir: 'rtl', status: 'registered' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',  dir: 'ltr', status: 'registered' },
  { code: 'sw', name: 'Swahili',    nativeName: 'Kiswahili',  dir: 'ltr', status: 'registered' },
  // Indigenous languages — activate by shipping a translation file, then flip status to 'ready'.
  { code: 'ha', name: 'Hausa',      nativeName: 'Hausa',      dir: 'ltr', status: 'registered' },
  { code: 'yo', name: 'Yoruba',     nativeName: 'Yorùbá',     dir: 'ltr', status: 'registered' },
  { code: 'am', name: 'Amharic',    nativeName: 'አማርኛ',       dir: 'ltr', status: 'registered' },
  { code: 'zu', name: 'Zulu',       nativeName: 'isiZulu',    dir: 'ltr', status: 'registered' },
];

const DEFAULT_LOCALE = 'en';
const byCode = Object.fromEntries(LOCALES.map((l) => [l.code, l]));
const listLocales = () => LOCALES;
const getLocale = (code) => byCode[code] || null;
const isSupportedLocale = (code) => Boolean(byCode[code]);
const resolveDir = (code) => (byCode[code] ? byCode[code].dir : 'ltr');

module.exports = { LOCALES, DEFAULT_LOCALE, listLocales, getLocale, isSupportedLocale, resolveDir };
