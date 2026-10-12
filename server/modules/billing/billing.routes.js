// Billing surface (A2). Public: plan catalog, availability, signup, webhook.
// Authenticated (tenant admin): subscription summary, invoices, checkout.
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./billing.controller');

// Tighter limiter on signup (tenant creation is expensive).
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Public
router.get('/plans', c.listPlans);
router.get('/availability', c.checkAvailability);
router.post('/register', registerLimiter, c.registerCompany);
router.post('/webhook', c.webhook);                       // Paystack (HMAC-verified)

// Authenticated tenant admin
router.get('/subscription', protect, resolveTenant, c.getSubscription);
router.get('/invoices', protect, resolveTenant, authorise('super_admin', 'hr_manager'), c.listInvoices);
router.post('/checkout', protect, resolveTenant, authorise('super_admin'), c.startCheckout);

module.exports = router;
