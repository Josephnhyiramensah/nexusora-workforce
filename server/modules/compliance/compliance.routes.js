const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const { attachEntitlements, requireModule, requireFeature } = require('../../middleware/entitlements');
const c = require('./compliance.controller');

// View: HR/payroll admins. Edit: super_admin only (default Nexusora-held).
const VIEW = ['super_admin', 'hr_manager', 'payroll_officer'];
const EDIT = ['super_admin'];

router.use(protect, resolveTenant, attachEntitlements, requireModule('compliance'));
router.get('/', authorise(...VIEW), c.getEffective);
router.get('/base', authorise(...VIEW), c.getBase);
router.put('/', authorise(...EDIT), c.saveOverride);

module.exports = router;