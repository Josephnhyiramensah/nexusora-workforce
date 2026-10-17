const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const { listAudit, auditFacets, getAuditEntry } = require('./audit.controller');

// The tenant-facing audit trail is an admin/compliance surface: workspace owners
// and HR managers only. (Platform-level audit lives in the admin console.)
const VIEW = ['super_admin', 'hr_manager'];

router.use(protect, resolveTenant);
router.get('/', authorise(...VIEW), listAudit);
router.get('/facets', authorise(...VIEW), auditFacets);
router.get('/:id', authorise(...VIEW), getAuditEntry);

module.exports = router;
