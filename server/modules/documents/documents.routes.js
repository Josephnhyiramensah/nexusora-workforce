const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./documents.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

// Company library
router.get('/company', authorise(...READ), c.listCompany);
router.get('/company/expiring', authorise(...WRITE), c.expiring);
router.post('/company', authorise(...WRITE), c.createCompany);

// Acknowledgements — anyone who can read may acknowledge; the roster is HR-only.
router.post('/company/:id/acknowledge', authorise(...READ), c.acknowledge);
router.get('/company/:id/acknowledgements', authorise(...WRITE), c.ackReport);

// File upload (versioned) and lifecycle
router.post('/company/:id/file', authorise(...WRITE), upload.single('file'), c.uploadFile);
router.patch('/company/:id/status', authorise(...WRITE), c.setStatus);

// Single document (declared after the more specific /:id/* routes above)
router.get('/company/:id', authorise(...READ), c.getCompany);
router.put('/company/:id', authorise(...WRITE), c.updateCompany);
router.delete('/company/:id', authorise(...WRITE), c.deleteCompany);

// Employee documents (read-only aggregate) — HR/managers only.
router.get('/employees', authorise('super_admin', 'hr_manager', 'hr_officer', 'line_manager'), c.employeeDocs);

module.exports = router;