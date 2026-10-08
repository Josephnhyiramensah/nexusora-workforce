const express = require('express');
const router = express.Router();
const { protect, authorise } = require('../../middleware/auth');
const { resolveTenant } = require('../../middleware/tenant');
const c = require('./notification.controller');

router.use(protect, resolveTenant);

// Reading your own feed is open to every authenticated user; what comes back is
// filtered by the query in the controller, not by the route.
router.get('/', c.getNotifications);
router.get('/unread-count', c.getUnreadCount);
router.post('/read-all', c.markAllRead);
router.post('/:id/read', c.markRead);

// Sending / deleting is admin-level (super admin or HR manager).
router.post('/', authorise('super_admin', 'hr_manager'), c.createNotification);
router.delete('/:id', authorise('super_admin', 'hr_manager'), c.deleteNotification);

// Run the overdue reminder sweep for this tenant on demand (admin).
router.post('/run-reminders', authorise('super_admin', 'hr_manager'), c.runReminders);

module.exports = router;
