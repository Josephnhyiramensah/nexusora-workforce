const asyncHandler = require('express-async-handler');
const { STATUSES, SCHEDULED, lostManDay, dayStart } = require('./attendance.util');

// POST /api/attendance/muster — bulk upsert a crew's attendance for one date.
const muster = asyncHandler(async (req, res) => {
  const { date, department, section, entries } = req.body;
  if (!date || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: 'date and a non-empty entries[] are required' });
  }
  const day = dayStart(date);
  const Attendance = req.tenantConn.model('Attendance');
  const ops = entries.map((e) => {
    const status = STATUSES.includes(e.status) ? e.status : 'present';
    return {
      updateOne: {
        filter: { employee: e.employee, date: day },
        update: { $set: {
          employee: e.employee, date: day, status,
          department: e.department || department, section: e.section || section,
          hoursWorked: e.hoursWorked, overtimeHours: e.overtimeHours,
          output: e.output, absenceReason: e.absenceReason, excused: !!e.excused,
          lostManDay: lostManDay(status), recordedBy: req.auth.userId,
        } },
        upsert: true,
      },
    };
  });
  const result = await Attendance.bulkWrite(ops);
  res.json({ message: 'Muster saved', date: day, count: entries.length, upserted: result.upsertedCount, modified: result.modifiedCount });
});

// GET /api/attendance — list with filters + pagination.
const list = asyncHandler(async (req, res) => {
  const Attendance = req.tenantConn.model('Attendance');
  const { from, to, employee, department, status, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (employee) filter.employee = employee;
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (from || to) { filter.date = {}; if (from) filter.date.$gte = dayStart(from); if (to) filter.date.$lte = dayStart(to); }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const [items, total] = await Promise.all([
    Attendance.find(filter).populate('employee', 'firstName lastName staffId').sort({ date: -1 }).skip((pg - 1) * lim).limit(lim),
    Attendance.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
});

// GET /api/attendance/absenteeism — the plantation KPI: lost man-days, rate, breakdowns.
const absenteeism = asyncHandler(async (req, res) => {
  const Attendance = req.tenantConn.model('Attendance');
  const { from, to, department } = req.query;
  const match = {};
  if (department) match.department = department;
  if (from || to) { match.date = {}; if (from) match.date.$gte = dayStart(from); if (to) match.date.$lte = dayStart(to); }

  const schedCond = { $cond: [{ $in: ['$status', SCHEDULED] }, 1, 0] };

  const [totals] = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: null,
      records: { $sum: 1 },
      scheduled: { $sum: schedCond },
      lostManDays: { $sum: '$lostManDay' },
      absentCount: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
      presentCount: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
    } },
  ]);
  const scheduled = totals ? totals.scheduled : 0;
  const lostManDays = totals ? totals.lostManDays : 0;
  const absenteeismRate = scheduled ? Number(((lostManDays / scheduled) * 100).toFixed(2)) : 0;

  const byDepartment = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: '$department', scheduled: { $sum: schedCond }, lostManDays: { $sum: '$lostManDay' } } },
    { $project: { _id: 0, department: { $ifNull: ['$_id', '—'] }, scheduled: 1, lostManDays: 1,
      rate: { $cond: [{ $gt: ['$scheduled', 0] }, { $multiply: [{ $divide: ['$lostManDays', '$scheduled'] }, 100] }, 0] } } },
    { $sort: { lostManDays: -1 } },
  ]);

  const trend = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: '$date', lostManDays: { $sum: '$lostManDay' } } },
    { $project: { _id: 0, date: '$_id', lostManDays: 1 } },
    { $sort: { date: 1 } },
  ]);

  const chronic = await Attendance.aggregate([
    { $match: { ...match, status: 'absent' } },
    { $group: { _id: '$employee', absences: { $sum: 1 } } },
    { $sort: { absences: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'emp' } },
    { $project: { _id: 0, employee: '$_id', absences: 1,
      name: { $concat: [{ $ifNull: [{ $arrayElemAt: ['$emp.firstName', 0] }, '?'] }, ' ', { $ifNull: [{ $arrayElemAt: ['$emp.lastName', 0] }, ''] }] } } },
  ]);

  res.json({
    range: { from: from || null, to: to || null, department: department || null },
    summary: { scheduledManDays: scheduled, lostManDays, absenteeismRate, absentCount: totals ? totals.absentCount : 0, presentCount: totals ? totals.presentCount : 0 },
    byDepartment, trend, chronic,
  });
});

module.exports = { muster, list, absenteeism };
