const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./picklist.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

router.get('/', authorise(...READ), c.list);
router.post('/', authorise(...WRITE), c.create);
router.put('/:id', authorise(...WRITE), c.update);
router.delete('/:id', authorise(...WRITE), c.remove);
router.post('/seed', authorise(...WRITE), c.seed);

module.exports = router;