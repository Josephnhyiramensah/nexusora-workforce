const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./analytics.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];

router.use(protect, resolveTenant);

router.get('/overview', authorise(...READ), c.overview);
router.get('/turnover', authorise(...READ), c.turnover);
router.get('/payroll', authorise(...READ), c.payroll);
router.get('/recruitment', authorise(...READ), c.recruitment);
router.get('/absence', authorise(...READ), c.absence);
router.get('/pivot', authorise(...READ), c.pivot);
router.get('/drill', authorise(...READ), c.drill);

module.exports = router;