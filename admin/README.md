# Nexusora Workforce — Admin Console

Separate app from the public product. Platform operators sign in with
**platform-admin** credentials (not tenant logins) and manage tenants,
pricing, billing and the audit trail.

## Run (dev)

```bash
cd admin
npm install
npm run dev          # http://localhost:5174  (proxies /api to the API on :5002)
```

Set `VITE_PRODUCT_URL` if the product isn't on `http://localhost:5173` — it's
used by **Login as admin** (impersonation) to open the tenant's workspace.

## First sign-in

A platform admin is created by the seed script:

```bash
cd server && node scripts/seedDemo.js      # creates Platform Admin / ChangeMe123!
```

## Build (prod)

```bash
cd admin && npm run build                  # → admin/dist
```

Serve `dist` behind a host that falls back to `index.html` for client routes
(e.g. `admin.nexusoraworkforce.com`). Keep it on a **separate host/deploy** from
the product so it never ships in the tenant bundle.

## What's here

- **Overview** — tenant counts, MRR estimate, paid revenue, system health.
- **Tenants** — list, create, and per-tenant: plan/status/seats/tax, suspend /
  unsuspend / delete, invoices, and **Login as admin**.
- **Pricing** — edit base prices (one currency, converted via FX) and
  per-currency overrides.
- **Audit log** — platform-admin actions.
