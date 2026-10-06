const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./onboarding.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

// Templates (programs) — declared before /:id so they don't collide.
router.get('/templates', authorise(...READ), c.listTemplates);
router.post('/templates', authorise(...WRITE), c.createTemplate);
router.get('/templates/:id', authorise(...READ), c.getTemplate);
router.put('/templates/:id', authorise(...WRITE), c.updateTemplate);
router.delete('/templates/:id', authorise(...WRITE), c.deleteTemplate);

// Onboarding records
router.get('/', authorise(...READ), c.list);
router.post('/', authorise(...WRITE), c.create);
router.get('/:id', authorise(...READ), c.getOne);
router.put('/:id', authorise(...WRITE), c.update);
router.delete('/:id', authorise(...WRITE), c.remove);

router.post('/:id/tasks', authorise(...WRITE), c.addTask);
router.put('/:id/tasks/:tid', authorise(...WRITE), c.updateTask);
router.delete('/:id/tasks/:tid', authorise(...WRITE), c.deleteTask);

router.post('/:id/documents', authorise(...WRITE), c.addDocument);
router.put('/:id/documents/:did', authorise(...WRITE), c.updateDocument);
router.delete('/:id/documents/:did', authorise(...WRITE), c.deleteDocument);
router.post('/:id/documents/:did/file', authorise(...WRITE), upload.single('file'), c.uploadDocumentFile);

router.post('/:id/probation', authorise(...WRITE), c.setProbation);
router.post('/:id/complete', authorise(...WRITE), c.complete);

module.exports = router;