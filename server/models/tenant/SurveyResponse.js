const mongoose = require('mongoose');

// One employee's answers to a survey. respondentId is stored to prevent a
// double-submission, but it is NEVER exposed in results when the survey is
// anonymous — aggregation drops identity for anonymous surveys.
const schema = new mongoose.Schema({
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', index: true, required: true },
  respondentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId },
    value: { type: mongoose.Schema.Types.Mixed },
  }],
  submittedAt: { type: Date, default: Date.now },
}, { collection: 'survey_responses', minimize: false });

schema.index({ surveyId: 1, respondentId: 1 });

module.exports = { schema, modelName: 'SurveyResponse' };
