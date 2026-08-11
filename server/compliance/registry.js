// Compliance pack registry — the single place countries are activated.
// To add a country: create compliance/packs/<country>.js from _template.js, then add it here.
const { isSupportedCurrency } = require('../config/currencies');
const { isSupportedLocale } = require('../i18n/locales');

const packs = [
  require('./packs/ghana'),
  require('./packs/liberia'),
  require('./packs/coteIvoire'),
];

const byCode = {};
for (const p of packs) {
  // Fail fast if a pack references a currency/locale the platform doesn't know.
  if (!isSupportedCurrency(p.currency)) {
    throw new Error(`Compliance pack ${p.countryCode}: unknown currency ${p.currency}`);
  }
  for (const loc of (p.officialLocales || [])) {
    if (!isSupportedLocale(loc)) {
      throw new Error(`Compliance pack ${p.countryCode}: unknown locale ${loc}`);
    }
  }
  byCode[p.countryCode] = p;
}

const getPack = (countryCode) => byCode[countryCode] || null;
const listPacks = () => Object.values(byCode).map((p) => ({
  countryCode: p.countryCode, countryName: p.countryName, currency: p.currency, officialLocales: p.officialLocales,
}));
const isSupportedCountry = (countryCode) => Boolean(byCode[countryCode]);

module.exports = { getPack, listPacks, isSupportedCountry };
