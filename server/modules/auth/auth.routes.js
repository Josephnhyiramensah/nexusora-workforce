const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../../middleware/tenant');
const { protect, authorise } = require('../../middleware/auth');
const c = require('./auth.controller');

const ADMIN = ['super_admin', 'hr_manager'];
const VIEW_USERS = ['super_admin', 'hr_manager', 'hr_officer'];

router.post('/login', resolveTenant, c.login);
router.get('/me', protect, resolveTenant, c.me);

// Own account
router.post('/change-password', protect, resolveTenant, c.changePassword);
router.put('/profile', protect, resolveTenant, c.updateProfile);

// User administration
router.get('/users', protect, resolveTenant, authorise(...VIEW_USERS), c.listUsers);
router.post('/users', protect, resolveTenant, authorise(...ADMIN), c.createUser);
router.put('/users/:id', protect, resolveTenant, authorise(...ADMIN), c.updateUser);
router.post('/users/:id/status', protect, resolveTenant, authorise(...ADMIN), c.setUserStatus);
router.post('/users/:id/reset-password', protect, resolveTenant, authorise(...ADMIN), c.adminResetPassword);

module.exports = router;