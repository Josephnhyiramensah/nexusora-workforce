const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./recruitment.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];
const HIRE = ['super_admin', 'hr_manager'];

router.use(protect, resolveTenant);

// Vacancies
router.get('/vacancies', authorise(...READ), c.listVacancies);
router.post('/vacancies', authorise(...WRITE), c.createVacancy);
router.get('/vacancies/:id', authorise(...READ), c.getVacancy);
router.put('/vacancies/:id', authorise(...WRITE), c.updateVacancy);
router.delete('/vacancies/:id', authorise(...WRITE), c.deleteVacancy);

// Applications (candidates)
router.get('/applications', authorise(...READ), c.listApplications);
router.post('/applications', authorise(...WRITE), c.createApplication);
router.get('/applications/:id', authorise(...READ), c.getApplication);
router.put('/applications/:id', authorise(...WRITE), c.updateApplication);
router.delete('/applications/:id', authorise(...WRITE), c.deleteApplication);
router.post('/applications/:id/stage', authorise(...WRITE), c.moveStage);
router.post('/applications/:id/notes', authorise(...WRITE), c.addNote);
router.post('/applications/:id/interviews', authorise(...WRITE), c.addInterview);
router.put('/applications/:id/interviews/:iid', authorise(...WRITE), c.updateInterview);
router.post('/applications/:id/offer', authorise(...WRITE), c.setOffer);
router.post('/applications/:id/hire', authorise(...HIRE), c.hire);
router.post('/applications/:id/resume', authorise(...WRITE), upload.single('file'), c.uploadResume);

module.exports = router;