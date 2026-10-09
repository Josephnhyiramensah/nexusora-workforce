const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./employee.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];
// Self-service: any signed-in user (incl. 'employee') — endpoints return only the caller's own data.
const SELF = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

// In-memory upload: file lives in req.file.buffer, streamed to Cloudinary (never hits disk).
// 8 MB cap; adjust if you expect larger scanned PDFs.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.use(protect, resolveTenant);

router.get('/', authorise(...READ), c.list);
// Self-service "me" routes MUST come before '/:id' so 'me' isn't captured as an id.
router.get('/me', authorise(...SELF), c.getMe);
router.get('/me/team', authorise(...SELF), c.myTeam);
router.get('/me/leave', authorise(...SELF), c.getMyLeave);
router.post('/me/leave', authorise(...SELF), c.submitMyLeave);
router.get('/me/payslips', authorise(...SELF), c.getMyPayslips);
router.get('/me/attendance', authorise(...SELF), c.getMyAttendance);
router.get('/:id', authorise(...READ), c.getById);
router.get('/:id/history', authorise(...READ), c.history);
router.post('/', authorise(...WRITE), c.create);
router.post('/import/analyze', authorise(...WRITE), upload.single('file'), c.importAnalyze);
router.post('/import', authorise(...WRITE), upload.single('file'), c.importEmployees);
router.put('/:id', authorise(...WRITE), c.update);
router.delete('/:id', authorise(...WRITE), c.deactivate);

// Documents + photo (multipart/form-data; field name must be "file").
router.post('/:id/documents', authorise(...WRITE), upload.single('file'), c.uploadDocument);
router.delete('/:id/documents/:docId', authorise(...WRITE), c.deleteDocument);
router.post('/:id/photo', authorise(...WRITE), upload.single('file'), c.uploadPhoto);

module.exports = router;