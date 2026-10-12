const express = require('express');
const router = express.Router();
const { platformProtect } = require('../../middleware/platformAuth');
const { platformLogin, createTenant, listTenants, getPricing, updatePricing, updateTenant } = require('./platform.controller');

router.post('/login', platformLogin);
router.post('/tenants', platformProtect, createTenant);
router.get('/tenants', platformProtect, listTenants);
router.put('/tenants/:id', platformProtect, updateTenant);

// Editable plan pricing (admin console).
router.get('/pricing', platformProtect, getPricing);
router.put('/pricing/:plan', platformProtect, updatePricing);

module.exports = router;
