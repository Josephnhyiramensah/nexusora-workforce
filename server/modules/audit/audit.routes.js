const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const { listAudit } = require('./audit.controller');

router.use(protect, resolveTenant);
router.get('/', authorise('super_admin', 'hr_manager'), listAudit);

module.exports = router;
