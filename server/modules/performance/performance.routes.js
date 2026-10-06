const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./performance.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];
const REVIEW_WRITE = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager'];
const CYCLE_WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

// Cycles
router.get('/cycles', authorise(...READ), c.listCycles);
router.post('/cycles', authorise(...CYCLE_WRITE), c.createCycle);
router.get('/cycles/:id', authorise(...READ), c.getCycle);
router.put('/cycles/:id', authorise(...CYCLE_WRITE), c.updateCycle);
router.delete('/cycles/:id', authorise(...CYCLE_WRITE), c.deleteCycle);
router.post('/cycles/:id/generate', authorise(...CYCLE_WRITE), c.generateReviews);

// Reviews
router.get('/reviews', authorise(...READ), c.listReviews);
router.get('/reviews/:id', authorise(...READ), c.getReview);
router.put('/reviews/:id', authorise(...REVIEW_WRITE), c.updateReview);
router.post('/reviews/:id/self-submit', authorise(...REVIEW_WRITE), c.selfSubmit);
router.post('/reviews/:id/manager-submit', authorise(...REVIEW_WRITE), c.managerSubmit);
router.post('/reviews/:id/acknowledge', authorise(...REVIEW_WRITE), c.acknowledge);
router.delete('/reviews/:id', authorise(...CYCLE_WRITE), c.deleteReview);

module.exports = router;