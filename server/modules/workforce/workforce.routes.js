const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./workforce.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

router.get('/plans', authorise(...READ), c.listPlans);
router.post('/plans', authorise(...WRITE), c.createPlan);
router.get('/plans/:id', authorise(...READ), c.getPlan);
router.put('/plans/:id', authorise(...WRITE), c.updatePlan);
router.delete('/plans/:id', authorise(...WRITE), c.deletePlan);

module.exports = router;