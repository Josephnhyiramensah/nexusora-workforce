// Master record of a console broadcast (A3). One broadcast fans out to a
// Notification in each tenant DB (linked by broadcastId); this row lets the
// console list and withdraw it as a single item.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  broadcastId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'success', 'warning', 'danger'], default: 'info' },
  tenants: { type: [String], default: [] },   // subdomains it reached
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  at: { type: Date, default: Date.now, index: true },
}, { minimize: false, collection: 'broadcasts' });

module.exports = { schema, modelName: 'Broadcast' };
