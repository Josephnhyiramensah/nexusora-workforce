const express = require('express');
const router = express.Router();
const { resolveTenant } = require('../../middleware/tenant');
const { protect, authorise } = require('../../middleware/auth');
const { login, me, createUser, listUsers } = require('./auth.controller');

router.post('/login', resolveTenant, login);
router.get('/me', protect, resolveTenant, me);
router.post('/users', protect, resolveTenant, authorise('super_admin', 'hr_manager'), createUser);
router.get('/users', protect, resolveTenant, authorise('super_admin', 'hr_manager', 'hr_officer'), listUsers);

module.exports = router;
