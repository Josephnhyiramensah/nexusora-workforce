// Notifications — tenant-scoped, per-user read state. Adapted from Nexusora
// Books to the Workforce server conventions: tenant model via req.tenantConn,
// current identity via req.auth (userId, role). The bell is an INBOX — it lists
// only UNREAD items; once read, an item leaves the bell.
const asyncHandler = require('express-async-handler');

const VALID_TYPES = ['info', 'success', 'warning', 'danger'];
const VALID_ROLES = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'];

// A user sees a notification only if it has not expired AND it is addressed to
// everyone, to their role, or to them by id. Enforced in the QUERY (never in the
// response mapping), so a recipient can never be handed a document not addressed
// to them.
const visibleTo = (auth) => ({
  $and: [
    { $or: [
      { expiresAt: null },
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
    ] },
    { $or: [
      { audience: 'all' },
      { audience: 'roles', roles: auth.role },
      { audience: 'users', users: auth.userId },
    ] },
  ],
});

// GET /notifications?limit=50 — the current user's visible feed, newest first.
const getNotifications = asyncHandler(async (req, res) => {
  const Notification = req.tenantConn.model('Notification');
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  const docs = await Notification.find(visibleTo(req.auth))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const uid = String(req.auth.userId);
  const data = docs.map((d) => ({
    _id: d._id,
    title: d.title,
    message: d.message,
    type: d.type,
    source: d.source,
    link: d.link || '',
    createdByLabel: d.createdByLabel || 'System',
    createdAt: d.createdAt,
    read: (d.readBy || []).some((r) => r.user && String(r.user) === uid),
  }));

  // serverNow lets the client measure ages against OUR clock — a device with a
  // wrong timezone would otherwise show a fresh item as hours old.
  res.json({ success: true, data, count: data.length, unread: data.filter((d) => !d.read).length, serverNow: Date.now() });
});

// GET /notifications/unread-count — cheap badge count.
const getUnreadCount = asyncHandler(async (req, res) => {
  const Notification = req.tenantConn.model('Notification');
  const count = await Notification.countDocuments({
    $and: [visibleTo(req.auth), { 'readBy.user': { $ne: req.auth.userId } }],
  });
  res.json({ success: true, data: { count } });
});

// POST /notifications — send a notification (admin / HR).
const createNotification = asyncHandler(async (req, res) => {
  const {
    title, message, type = 'info', audience = 'all',
    roles = [], users = [], link = '', expiresAt = null,
  } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Title and message are required.' });
  }
  if (!['all', 'roles', 'users'].includes(audience)) {
    return res.status(400).json({ success: false, message: 'Invalid audience.' });
  }
  if (audience === 'roles') {
    const bad = (roles || []).filter((r) => !VALID_ROLES.includes(r));
    if (!roles.length || bad.length) {
      return res.status(400).json({ success: false, message: 'Select at least one valid role.' });
    }
  }
  if (audience === 'users' && !(users || []).length) {
    return res.status(400).json({ success: false, message: 'Select at least one recipient.' });
  }

  const Notification = req.tenantConn.model('Notification');

  // Label the sender with their name/email for the feed.
  let label = 'System';
  try {
    const u = await req.tenantConn.model('User').findById(req.auth.userId).select('name email').lean();
    label = u?.name || u?.email || 'System';
  } catch { /* fall back to System */ }

  const doc = await Notification.create({
    title: String(title).trim(),
    message: String(message).trim(),
    type: VALID_TYPES.includes(type) ? type : 'info',
    source: 'tenant',
    audience,
    roles: audience === 'roles' ? roles : [],
    users: audience === 'users' ? users : [],
    link: link || '',
    expiresAt: expiresAt || null,
    createdBy: req.auth.userId,
    createdByLabel: label,
  });

  res.status(201).json({ success: true, data: doc });
});

// POST /notifications/:id/read — mark one read for THIS user.
const markRead = asyncHandler(async (req, res) => {
  const Notification = req.tenantConn.model('Notification');
  await Notification.updateOne(
    { $and: [visibleTo(req.auth), { _id: req.params.id, 'readBy.user': { $ne: req.auth.userId } }] },
    { $push: { readBy: { user: req.auth.userId, readAt: new Date() } } }
  );
  res.json({ success: true });
});

// POST /notifications/read-all — mark every visible unread item read.
const markAllRead = asyncHandler(async (req, res) => {
  const Notification = req.tenantConn.model('Notification');
  await Notification.updateMany(
    { $and: [visibleTo(req.auth), { 'readBy.user': { $ne: req.auth.userId } }] },
    { $push: { readBy: { user: req.auth.userId, readAt: new Date() } } }
  );
  res.json({ success: true });
});

// DELETE /notifications/:id — remove a tenant notification (admin). Platform
// broadcasts cannot be deleted from a tenant workspace.
const deleteNotification = asyncHandler(async (req, res) => {
  const Notification = req.tenantConn.model('Notification');
  const doc = await Notification.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Notification not found.' });
  if (doc.source === 'platform') {
    return res.status(403).json({ success: false, message: 'Platform announcements cannot be deleted here.' });
  }
  await doc.deleteOne();
  res.json({ success: true });
});

module.exports = {
  getNotifications, getUnreadCount, createNotification,
  markRead, markAllRead, deleteNotification,
};
