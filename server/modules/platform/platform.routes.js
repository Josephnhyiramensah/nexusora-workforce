const express = require('express');
const router = express.Router();
const { platformProtect } = require('../../middleware/platformAuth');
const c = require('./platform.controller');

router.post('/login', c.platformLogin);

// Everything below requires a platform-admin token.
router.use(platformProtect);

// Overview + health
router.get('/metrics', c.metrics);
router.get('/health', c.health);
router.get('/audit', c.platformAudit);
router.get('/invoices', c.listAllInvoices);

// Tenant management
router.get('/tenants', c.listTenants);
router.post('/tenants', c.createTenant);
router.get('/tenants/:id', c.getTenant);
router.put('/tenants/:id', c.updateTenant);
router.post('/tenants/:id/suspend', c.suspendTenant);
router.post('/tenants/:id/unsuspend', c.unsuspendTenant);
router.post('/tenants/:id/impersonate', c.impersonate);
router.delete('/tenants/:id', c.deleteTenant);

// Pricing
router.get('/pricing', c.getPricing);
router.put('/pricing/:plan', c.updatePricing);

module.exports = router;
