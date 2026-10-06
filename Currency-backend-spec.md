# Nexusora Workforce — Multi-currency: what the backend needs

The frontend currency system (CurrencyContext + CurrencySwitcher) is built and
degrades safely: with **no backend changes at all** it already stops hardcoding
cedis and shows every amount in the company's base currency with the correct
symbol. To unlock the **per-user "view in another currency"** switch with real
conversion, add the three pieces below.

## Principles (agreed)
- **Base currency = the company's.** Payroll is always calculated and stored in
  the tenant's `baseCurrency`. It never changes with exchange rates.
- **Display currency = per user, display-only.** A user can view amounts in
  another currency; it does not touch payroll math.
- **Rates = live + manual, manual wins.** Pull a live feed, but let an admin
  override any rate; the override takes precedence.

## 1) Tenant base currency (probably already there)
Ensure every tenant has `baseCurrency` (ISO-4217, e.g. `GHS`, `NGN`, `USD`) set
at company registration. The frontend reads `tenant.baseCurrency`.

## 2) Exchange-rates endpoint  — `GET /fx/rates?base=GHS`
Returns rates **relative to the base** (how many units of each currency per 1
unit of base), merging the live feed with manual overrides:

```json
{
  "base": "GHS",
  "rates": { "GHS": 1, "USD": 0.065, "NGN": 103.5, "EUR": 0.060, "KES": 8.4 },
  "updatedAt": "2026-09-07T06:00:00Z",
  "source": "live+manual"
}
```
- Fetch a live feed once a day (e.g. a free FX API), cache it.
- Merge any admin overrides on top (manual value replaces the live value for
  that currency). Always include the base itself as `1`.
- If this endpoint is missing, the app stays base-only and the switcher simply
  shows amounts in the base currency (no crash).

## 3) Manual overrides (admin) — `PUT /fx/rates/overrides`  (super_admin only)
```json
{ "base": "GHS", "rates": { "USD": 0.064 } }
```
Store per base currency. These win over the live feed in the response above.
Surface this in Settings so an admin can pin rates they trust.

## 4) (Optional) Persist the user's display choice — `PATCH /auth/users/me`
```json
{ "displayCurrency": "USD" }
```
If you add it, the choice follows the user across devices. Until then the
frontend remembers it per-browser (localStorage), which is fine for display-only.

## Frontend wiring (already coded)
- `ui/tokens.js` → `money()` is now Intl-based and currency-aware; `setDefaultCurrency()`
  is called automatically by CurrencyProvider with the tenant base.
- `context/CurrencyContext.jsx` → `<CurrencyProvider>` (mount inside AuthProvider +
  LocaleProvider) exposes `useCurrency()` → `{ fmt, convert, baseCurrency, displayCurrency, setDisplayCurrency, isConverted }`.
- `ui/CurrencySwitcher.jsx` → drop `<CurrencySwitcher />` in the top bar next to the language switcher.
- In pages, replace `money(x)` with `const { fmt } = useCurrency(); … fmt(x)` — amounts are
  assumed to be in base currency; pass `fmt(x, { from: 'USD' })` if a value is already in another currency.
