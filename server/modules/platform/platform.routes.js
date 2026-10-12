const express = require('express');
const router = express.Router();
const { platformProtect } = require('../../middleware/platformAuth');
const c = require('./platform.controller');

router.post('/login', c.platformLogin);

// Everything below requires a platform-admin token.
router.use(platformProtect);

// Overview + health + revenue
router.get('/metrics', c.metrics);
router.get('/health', c.health);
router.get('/revenue', c.revenue);
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
router.post('/tenants/:id/extend', c.extendSubscription);
router.delete('/tenants/:id', c.deleteTenant);

// Tenant user management
router.get('/tenants/:id/users', c.getTenantUsers);
router.put('/tenants/:id/users/:uid', c.updateTenantUser);
router.post('/tenants/:id/users/:uid/reset-password', c.resetTenantUserPassword);

// Announcements
router.get('/announcements', c.listAnnouncements);
router.post('/announcements', c.broadcast);
router.delete('/announcements/:bid', c.deleteAnnouncement);

// Pricing + platform settings
router.get('/pricing', c.getPricing);
router.put('/pricing/:plan', c.updatePricing);
router.get('/settings', c.getSettings);
router.put('/settings', c.updateSettings);

module.exports = router;
