// Compliance pack registry.
// Ready-made packs give a country correct statutory rules out of the box.
// Every OTHER country in compliance/countries.js is still onboardable: it gets a neutral
// generic pack (zero deductions) whose rates an administrator enters in Compliance & Statutory.
const { isSupportedCurrency } = require('../config/currencies');
const { isSupportedLocale } = require('../i18n/locales');
const COUNTRIES = require('./countries');
const makeGenericPack = require('./packs/_generic');

const readyPacks = [
  require('./packs/ghana'),
  require('./packs/liberia'),
  require('./packs/coteIvoire'),
];

const byCode = {};

for (const p of readyPacks) {
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

for (const c of COUNTRIES) {
  if (byCode[c.code]) continue;
  if (!isSupportedCurrency(c.currency)) continue;
  const locales = (c.locales || []).filter(isSupportedLocale);
  byCode[c.code] = makeGenericPack({
    countryCode: c.code, countryName: c.name, currency: c.currency, locales,
  });
}

const getPack = (countryCode) => byCode[countryCode] || null;
const listPacks = () => Object.values(byCode).map((p) => ({
  countryCode: p.countryCode, countryName: p.countryName, currency: p.currency,
  officialLocales: p.officialLocales, configured: !p.isTemplate,
}));
const isSupportedCountry = (countryCode) => Boolean(byCode[countryCode]);

module.exports = { getPack, listPacks, isSupportedCountry };