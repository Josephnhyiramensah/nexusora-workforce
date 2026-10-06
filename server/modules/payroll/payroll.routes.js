const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./payroll.controller');

const READ = ['super_admin', 'hr_manager', 'payroll_officer'];
const RUN = ['super_admin', 'payroll_officer'];
const APPROVE = ['super_admin', 'hr_manager'];

// In-memory upload for the reconciliation sheet (streamed to ExcelJS). 10 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(protect, resolveTenant);

// NOTE: the more specific /runs/:id/journal must be declared BEFORE /runs/:id,
// otherwise Express matches /runs/:id first and the journal route is never reached.
router.get('/runs/:id/journal', authorise(...READ), c.getJournal);
router.get('/runs', authorise(...READ), c.listRuns);
router.get('/runs/:id', authorise(...READ), c.getRun);
router.post('/runs', authorise(...RUN), c.createRun);
router.post('/runs/:id/approve', authorise(...APPROVE), c.approveRun);
router.post('/runs/:id/reconcile', authorise(...READ), upload.single('file'), c.reconcile);

module.exports = router;