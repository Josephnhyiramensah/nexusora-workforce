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

// Interactive Excel (.xlsx) dashboards — Python-powered.
router.post('/excel/system', authorise(...READ), c.excelFromSystem);
router.post('/excel/upload', authorise(...READ), upload.single('file'), c.excelFromUpload);

// In-web dashboard builder (dataset → AI suggest → live preview → export).
router.get('/dataset/system', authorise(...READ), c.datasetSystem);
router.post('/dataset/upload', authorise(...READ), upload.single('file'), c.datasetUpload);
router.post('/spec/suggest', authorise(...READ), c.specSuggest);
// Rows can be large (an uploaded dataset the client is previewing) → bigger JSON cap here.
router.post('/excel/build', express.json({ limit: '30mb' }), authorise(...READ), c.excelBuild);

module.exports = router;