// Master/registry model: subscription invoices & receipts (A2 billing).
// One document per billing event per tenant. Registered on the MASTER
// connection only. Money is stored in major units of the invoice currency
// (e.g. GHS 1200.00 as 1200.00) — never card/account numbers.
const mongoose = require('mongoose');

const lineItem = new mongoose.Schema({
  label: { type: String, required: true },
  qty: { type: Number, default: 1 },
  unitAmount: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },          // qty * unitAmount
}, { _id: false });

const schema = new mongoose.Schema({
  number: { type: String, required: true, unique: true, index: true },  // e.g. INV-2026-000123
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  subdomain: { type: String, index: true },       // denormalised for quick lookup
  plan: { type: String },
  interval: { type: String, enum: ['month', 'year'], default: 'month' },  // billing cadence this invoice covers
  periodStart: { type: Date },
  periodEnd: { type: Date },
  kind: { type: String, enum: ['subscription', 'proration'], default: 'subscription' },
  lastReminderAt: { type: Date },          // dunning: last payment reminder sent
  remindersSent: { type: Number, default: 0 },
  currency: { type: String, uppercase: true, default: 'GHS' },
  items: { type: [lineItem], default: [] },
  subtotal: { type: Number, default: 0 },
  taxRate: { type: Number, default: 0 },           // e.g. 0.15 for 15% VAT
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // open = awaiting payment; paid; void = cancelled; uncollectible = written off.
  status: { type: String, enum: ['draft', 'open', 'paid', 'void', 'uncollectible'], default: 'open', index: true },
  // Payment provider linkage (A2). Opaque references only.
  provider: { type: String },
  providerRef: { type: String },                   // transaction / charge reference
  chargeAmount: { type: Number },                  // amount actually sent to the gateway
  chargeCurrency: { type: String, uppercase: true },// currency actually charged (may differ from `currency`)
  paymentMethod: { type: String },                 // 'card' | 'mobile_money' | ...
  dueDate: { type: Date },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
}, { minimize: false, collection: 'invoices' });

module.exports = { schema, modelName: 'Invoice' };
