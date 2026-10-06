// A CourseEnrollment — an employee's participation in a course: enrolled → in progress →
// completed (with score/result), plus an optional completion certificate file and an
// expiry date (computed from the course's validForMonths) for refresher tracking.
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },

  status: { type: String, enum: ['enrolled', 'in_progress', 'completed', 'failed', 'cancelled'], default: 'enrolled', index: true },
  enrolledDate: { type: Date, default: Date.now },
  startDate: { type: Date, default: null },
  completionDate: { type: Date, default: null },

  score: { type: Number, default: null },              // % if scored
  result: { type: String, enum: ['', 'pass', 'fail'], default: '' },
  expiryDate: { type: Date, default: null, index: true }, // completion + course.validForMonths

  cost: { type: Number, default: 0 },                  // actual cost booked to this enrollment
  certificate: { name: String, url: String, publicId: String, format: String, bytes: Number, uploadedAt: Date },

  // Snapshot for reporting without extra joins
  courseTitle: { type: String, default: '' },
  category: { type: String, default: '' },

  notes: { type: String, default: '' },
  enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, collection: 'course_enrollments' });

schema.index({ employee: 1, course: 1 });

module.exports = { schema, modelName: 'CourseEnrollment' };