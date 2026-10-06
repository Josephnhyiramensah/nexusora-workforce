const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./succession.controller');

// Talent & succession is sensitive (calibration data) — HR + managers only, no self-service.
const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

router.get('/overview', authorise(...READ), c.overview);

// 9-box + talent profiles
router.get('/ninebox', authorise(...READ), c.nineBox);
router.get('/talent', authorise(...READ), c.listTalent);
router.get('/talent/employee/:employeeId', authorise(...READ), c.getTalent);
router.put('/talent/:employeeId', authorise(...WRITE), c.saveTalent);
router.delete('/talent/:employeeId', authorise(...WRITE), c.deleteTalent);

// Talent pool
router.get('/pool', authorise(...READ), c.talentPool);

// Succession plans (specific routes before /:id)
router.get('/plans', authorise(...READ), c.listPlans);
router.get('/plans/uncovered', authorise(...WRITE), c.uncoveredPositions);
router.post('/plans', authorise(...WRITE), c.createPlan);
router.get('/plans/:id', authorise(...READ), c.getPlan);
router.put('/plans/:id', authorise(...WRITE), c.updatePlan);
router.delete('/plans/:id', authorise(...WRITE), c.deletePlan);

// Development plans (IDP)
router.get('/development', authorise(...READ), c.listDevPlans);
router.post('/development', authorise(...WRITE), c.createDevPlan);
router.get('/development/:id', authorise(...READ), c.getDevPlan);
router.put('/development/:id', authorise(...WRITE), c.updateDevPlan);
router.delete('/development/:id', authorise(...WRITE), c.deleteDevPlan);

module.exports = router;