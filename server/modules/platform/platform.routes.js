const express = require('express');
const router = express.Router();
const { platformProtect } = require('../../middleware/platformAuth');
const { platformLogin, createTenant, listTenants } = require('./platform.controller');

router.post('/login', platformLogin);
router.post('/tenants', platformProtect, createTenant);
router.get('/tenants', platformProtect, listTenants);

module.exports = router;
