const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./ai.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// AI Advisor exposes company-wide analytics — management / HR roles only.
const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];

router.use(protect, resolveTenant);

router.get('/status', authorise(...READ), c.status);
router.post('/insights', authorise(...READ), c.insights);
router.post('/chat', authorise(...READ), c.chat);
router.post('/dashboard', authorise(...READ), c.buildDashboard);
router.post('/analyze-upload', authorise(...READ), upload.single('file'), c.analyzeUpload);

module.exports = router;