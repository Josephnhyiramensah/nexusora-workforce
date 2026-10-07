const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./fx.controller');

router.use(protect, resolveTenant);

// Any authenticated user can read rates (the display-currency feature needs them).
router.get('/rates', c.getRates);

// Setting / refreshing rates is admin-level.
router.post('/rates/manual', authorise('super_admin', 'hr_manager'), c.setManualRate);
router.post('/rates/fetch', authorise('super_admin', 'hr_manager'), c.fetchLiveRates);

module.exports = router;
