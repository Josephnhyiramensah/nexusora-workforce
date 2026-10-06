const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./position.controller');

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

// In-memory upload for the JD soft copy (streamed to Cloudinary). 10 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(protect, resolveTenant);

router.get('/', authorise(...READ), c.list);
router.get('/:id', authorise(...READ), c.getById);
router.post('/', authorise(...WRITE), c.create);
router.put('/:id', authorise(...WRITE), c.update);
router.delete('/:id', authorise(...WRITE), c.remove);

// Job-description soft copy (multipart/form-data; field name must be "file").
router.post('/:id/jd-file', authorise(...WRITE), upload.single('file'), c.uploadJobDescriptionFile);
router.delete('/:id/jd-file', authorise(...WRITE), c.deleteJobDescriptionFile);

module.exports = router;