const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./er.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Employee Relations is sensitive/confidential — HR, IR officers and line managers only.
const READ = ['super_admin', 'hr_manager', 'hr_officer', 'ir_officer', 'line_manager'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer', 'ir_officer'];

router.use(protect, resolveTenant);

router.get('/overview', authorise(...READ), c.overview);
router.get('/warnings', authorise(...READ), c.warningsRegister);

router.get('/cases', authorise(...READ), c.listCases);
router.post('/cases', authorise(...WRITE), c.createCase);
router.get('/cases/:id', authorise(...READ), c.getCase);
router.put('/cases/:id', authorise(...WRITE), c.updateCase);
router.delete('/cases/:id', authorise('super_admin', 'hr_manager'), c.deleteCase);

router.post('/cases/:id/timeline', authorise(...WRITE), c.addTimeline);
router.put('/cases/:id/hearing', authorise(...WRITE), c.setHearing);
router.put('/cases/:id/sanction', authorise(...WRITE), c.setSanction);
router.put('/cases/:id/appeal', authorise(...WRITE), c.setAppeal);
router.post('/cases/:id/documents', authorise(...WRITE), upload.single('file'), c.uploadDocument);
router.delete('/cases/:id/documents/:did', authorise(...WRITE), c.deleteDocument);

module.exports = router;