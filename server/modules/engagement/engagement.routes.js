const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./engagement.controller');

// HR manages surveys & sees results; any signed-in employee can answer.
const HR = ['super_admin', 'hr_manager', 'hr_officer'];
const SELF = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

router.use(protect, resolveTenant);

// Self-service "me" routes before '/:id' so 'me' isn't captured as an id.
router.get('/me/surveys', authorise(...SELF), c.mySurveys);

router.get('/trends', authorise(...HR), c.trends);
router.get('/surveys', authorise(...HR), c.listSurveys);
router.post('/surveys', authorise(...HR), c.createSurvey);
router.get('/surveys/:id', authorise(...HR), c.getSurvey);
router.patch('/surveys/:id', authorise(...HR), c.updateSurvey);
router.delete('/surveys/:id', authorise(...HR), c.deleteSurvey);
router.get('/surveys/:id/results', authorise(...HR), c.surveyResults);
router.post('/surveys/:id/respond', authorise(...SELF), c.respond);

// Action planning
router.get('/actions', authorise(...HR), c.listActions);
router.post('/actions', authorise(...HR), c.createAction);
router.patch('/actions/:id', authorise(...HR), c.updateAction);
router.delete('/actions/:id', authorise(...HR), c.deleteAction);

module.exports = router;
