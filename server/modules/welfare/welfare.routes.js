const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./welfare.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'payroll_officer', 'line_manager', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer', 'payroll_officer'];
const APPROVE = ['super_admin', 'hr_manager'];

router.use(protect, resolveTenant);

router.get('/overview', authorise(...READ), c.overview);

// Loans & advances
router.get('/loans', authorise(...READ), c.listLoans);
router.post('/loans', authorise(...WRITE), c.createLoan);
router.get('/loans/:id', authorise(...READ), c.getLoan);
router.put('/loans/:id', authorise(...WRITE), c.updateLoan);
router.patch('/loans/:id/decision', authorise(...APPROVE), c.decideLoan);
router.post('/loans/:id/repayment', authorise(...WRITE), c.addRepayment);
router.delete('/loans/:id', authorise(...APPROVE), c.deleteLoan);

// Welfare claims
router.get('/claims', authorise(...READ), c.listClaims);
router.post('/claims', authorise(...WRITE), c.createClaim);
router.get('/claims/:id', authorise(...READ), c.getClaim);
router.patch('/claims/:id/decision', authorise(...APPROVE), c.decideClaim);
router.patch('/claims/:id/pay', authorise(...WRITE), c.payClaim);
router.post('/claims/:id/documents', authorise(...WRITE), upload.single('file'), c.uploadClaimDoc);
router.delete('/claims/:id', authorise(...APPROVE), c.deleteClaim);

// Schemes & contributions
router.get('/schemes', authorise(...READ), c.listSchemes);
router.post('/schemes', authorise(...WRITE), c.createScheme);
router.get('/schemes/:id', authorise(...READ), c.getScheme);
router.put('/schemes/:id', authorise(...WRITE), c.updateScheme);
router.delete('/schemes/:id', authorise(...APPROVE), c.deleteScheme);
router.post('/schemes/:id/contributions', authorise(...WRITE), c.addContribution);
router.delete('/schemes/:id/contributions/:cid', authorise(...WRITE), c.deleteContribution);

module.exports = router;