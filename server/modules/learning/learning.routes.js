const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./learning.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const READ = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer', 'employee'];
const HRREAD = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'viewer'];
const WRITE = ['super_admin', 'hr_manager', 'hr_officer'];

router.use(protect, resolveTenant);

// Overview
router.get('/overview', authorise(...HRREAD), c.overview);

// Courses (catalog)
router.get('/courses', authorise(...READ), c.listCourses);
router.post('/courses', authorise(...WRITE), c.createCourse);
router.put('/courses/:id', authorise(...WRITE), c.updateCourse);
router.delete('/courses/:id', authorise(...WRITE), c.deleteCourse);

// Enrollments
router.get('/enrollments', authorise(...READ), c.listEnrollments);
router.post('/enrollments', authorise(...WRITE), c.enrol);
router.put('/enrollments/:id', authorise(...WRITE), c.updateEnrollment);
router.delete('/enrollments/:id', authorise(...WRITE), c.deleteEnrollment);
router.post('/enrollments/:id/certificate', authorise(...WRITE), upload.single('file'), c.uploadCertificate);

// Competencies + assessment + gaps  (specific routes before /:id)
router.get('/competencies', authorise(...HRREAD), c.listCompetencies);
router.get('/competencies/gaps', authorise(...HRREAD), c.gapAnalysis);
router.get('/competencies/employee/:employeeId', authorise(...HRREAD), c.employeeCompetencies);
router.post('/competencies/assess', authorise(...WRITE), c.assess);
router.post('/competencies', authorise(...WRITE), c.createCompetency);
router.put('/competencies/:id', authorise(...WRITE), c.updateCompetency);
router.delete('/competencies/:id', authorise(...WRITE), c.deleteCompetency);

// Training plans
router.get('/plans', authorise(...HRREAD), c.listPlans);
router.post('/plans', authorise(...WRITE), c.createPlan);
router.get('/plans/:id', authorise(...HRREAD), c.getPlan);
router.put('/plans/:id', authorise(...WRITE), c.updatePlan);
router.delete('/plans/:id', authorise(...WRITE), c.deletePlan);

// Certifications & licenses
router.get('/certifications', authorise(...HRREAD), c.listCertifications);
router.post('/certifications', authorise(...WRITE), c.createCertification);
router.put('/certifications/:id', authorise(...WRITE), c.updateCertification);
router.delete('/certifications/:id', authorise(...WRITE), c.deleteCertification);
router.post('/certifications/:id/file', authorise(...WRITE), upload.single('file'), c.uploadCertFile);

module.exports = router;
