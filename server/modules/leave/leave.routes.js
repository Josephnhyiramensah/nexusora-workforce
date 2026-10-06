const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./leave.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const REQUEST = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager'];
const APPROVE = ['super_admin', 'hr_manager', 'line_manager'];
const ADMIN = ['super_admin', 'hr_manager'];

router.use(protect, resolveTenant);
router.get('/types', authorise(...READ), c.listTypes);
router.post('/types', authorise(...ADMIN), c.createType);
router.post('/types/seed', authorise(...ADMIN), c.seedTypes);

router.get('/requests', authorise(...READ), c.listRequests);
router.post('/requests', authorise(...REQUEST), c.createRequest);
router.post('/requests/:id/approve', authorize('leave.approve'), c.approve);
router.post('/requests/:id/reject', authorise(...APPROVE), c.reject);
router.post('/requests/:id/cancel', authorise(...REQUEST), c.cancel);

router.get('/balance/:employeeId', authorise(...READ), c.balance);

module.exports = router;
