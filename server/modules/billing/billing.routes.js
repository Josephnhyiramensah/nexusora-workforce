// Public billing surface (A2). Plan catalog + self-serve company registration.
// Payment checkout/webhooks will mount here too (next step).
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { listPlans, checkAvailability, registerCompany } = require('./billing.controller');

// Tighter limiter on signup to blunt abuse (tenant creation is expensive).
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.get('/plans', listPlans);
router.get('/availability', checkAvailability);
router.post('/register', registerLimiter, registerCompany);

module.exports = router;
