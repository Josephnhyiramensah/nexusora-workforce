const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./settings.controller');

router.use(protect, resolveTenant);
router.get('/branding', c.getBranding);
router.put('/branding', authorise('super_admin', 'hr_manager'), c.updateBranding);

// Users & Roles (admin) — list logins and link them to employees.
router.get('/users', authorise('super_admin', 'hr_manager'), c.listUsers);
router.put('/users/:id', authorise('super_admin', 'hr_manager'), c.updateUser);

module.exports = router;