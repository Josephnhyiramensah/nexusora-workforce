const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./attendance.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager'];

router.use(protect, resolveTenant);
router.get('/absenteeism', authorise(...READ), c.absenteeism);
router.get('/', authorise(...READ), c.list);
router.post('/muster', authorise(...WRITE), c.muster);

module.exports = router;
