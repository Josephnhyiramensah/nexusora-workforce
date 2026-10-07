const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./settings.controller');
const ak = require('../apikeys/apikey.controller');

router.use(protect, resolveTenant);
router.get('/branding', c.getBranding);
router.put('/branding', authorise('super_admin', 'hr_manager'), c.updateBranding);

// Company settings — base currency (super admin only; payroll runs in this currency).
router.put('/company', authorise('super_admin'), c.updateCompany);

// Users & Roles (admin) — list logins and link them to employees.
router.get('/users', authorise('super_admin', 'hr_manager'), c.listUsers);
router.put('/users/:id', authorise('super_admin', 'hr_manager'), c.updateUser);

// API keys (super admin only) — for external integrations via /api/v1.
router.get('/api-keys', authorise('super_admin'), ak.getApiKeys);
router.post('/api-keys', authorise('super_admin'), ak.createApiKey);
router.delete('/api-keys/:id', authorise('super_admin'), ak.revokeApiKey);

module.exports = router;