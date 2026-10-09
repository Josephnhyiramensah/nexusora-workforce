const asyncHandler = require('express-async-handler');

/* ------------------------------------------------------------------ *
 *  Engagement — pulse surveys, eNPS, results.
 *  Surveys are created by HR, opened to an audience, answered by staff,
 *  and aggregated here (identity dropped for anonymous surveys).
 * ------------------------------------------------------------------ */

const NPS_QUESTION = { text: 'How likely are you to recommend this organisation as a place to work?', kind: 'nps' };
const MIN_SEGMENT = 5;   // anonymity floor — groups below this are suppressed in results

async function resolveMyEmployee(req) {
  const User = req.tenantConn.model('User');
  const Employee = req.tenantConn.model('Employee');
  const u = await User.findById(req.auth.userId).select('employee email');
  let emp = null;
  if (u?.employee) emp = await Employee.findById(u.employee).select('_id employment.department');
  if (!emp && u?.email) emp = await Employee.findOne({ email: u.email }).select('_id employment.department');
  return emp;
}

// Status with scheduling applied: a scheduled survey opens at opensAt and any
// survey auto-closes at closesAt.
function effectiveStatus(s, now = new Date()) {
  if (s.status === 'draft' || s.status === 'closed') return s.status;
  if (s.closesAt && now >= new Date(s.closesAt)) return 'closed';
  if (s.status === 'scheduled') return (s.opensAt && now >= new Date(s.opensAt)) ? 'open' : 'scheduled';
  return 'open';
}

// Eligible headcount for a survey's audience (active employees).
async function audienceCount(req, survey) {
  const Employee = req.tenantConn.model('Employee');
  const q = { status: { $ne: 'terminated' } };
  if (survey.audience?.scope === 'department' && survey.audience.department) q['employment.department'] = survey.audience.department;
  try { return await Employee.countDocuments(q); } catch { return 0; }
}

// Per-segment (department) scores, suppressing groups below the anonymity floor.
// scale → average 1–5; nps → eNPS −100…100.
function computeSegments(survey, responses, minN = MIN_SEGMENT) {
  const groups = {};
  for (const r of responses) {
    const seg = (r.segment && r.segment.department) || 'Unspecified';
    (groups[seg] = groups[seg] || []).push(r);
  }
  const scoreQs = survey.questions.filter((q) => q.kind === 'scale' || q.kind === 'nps');
  const rows = [];
  for (const [seg, rs] of Object.entries(groups)) {
    const n = rs.length;
    if (n < minN) { rows.push({ segment: seg, count: n, suppressed: true, scores: {} }); continue; }
    const scores = {};
    for (const q of scoreQs) {
      const nums = [];
      for (const r of rs) for (const a of (r.answers || [])) if (String(a.questionId) === String(q._id)) { const v = Number(a.value); if (Number.isFinite(v)) nums.push(v); }
      if (!nums.length) { scores[String(q._id)] = null; continue; }
      if (q.kind === 'nps') { const t = nums.length, pro = nums.filter((x) => x >= 9).length, det = nums.filter((x) => x <= 6).length; scores[String(q._id)] = Math.round(((pro - det) / t) * 100); }
      else scores[String(q._id)] = +(nums.reduce((s, x) => s + x, 0) / nums.length).toFixed(2);
    }
    rows.push({ segment: seg, count: n, suppressed: false, scores });
  }
  rows.sort((a, b) => b.count - a.count);
  return { minN, columns: scoreQs.map((q) => ({ questionId: String(q._id), text: q.text, kind: q.kind })), rows };
}

// Aggregate responses for a survey into per-question results. No identity is
// returned for anonymous surveys.
function computeResults(survey, responses) {
  const byQ = {};
  for (const q of survey.questions) byQ[String(q._id)] = [];
  for (const r of responses) {
    for (const a of (r.answers || [])) {
      const key = String(a.questionId);
      if (byQ[key]) byQ[key].push(a.value);
    }
  }
  const questions = survey.questions.map((q) => {
    const vals = byQ[String(q._id)] || [];
    const base = { questionId: String(q._id), text: q.text, kind: q.kind, answered: vals.length };
    if (q.kind === 'nps') {
      const nums = vals.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
      const total = nums.length;
      const promoters = nums.filter((n) => n >= 9).length;
      const detractors = nums.filter((n) => n <= 6).length;
      const passives = total - promoters - detractors;
      const score = total ? Math.round(((promoters - detractors) / total) * 100) : null;
      return { ...base, enps: score, promoters, passives, detractors, total };
    }
    if (q.kind === 'scale') {
      const nums = vals.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      const total = nums.length;
      const avg = total ? +(nums.reduce((s, n) => s + n, 0) / total).toFixed(2) : null;
      const dist = [1, 2, 3, 4, 5].map((k) => ({ label: String(k), value: nums.filter((n) => n === k).length }));
      return { ...base, average: avg, distribution: dist };
    }
    if (q.kind === 'choice') {
      const opts = q.options && q.options.length ? q.options : [...new Set(vals.map((v) => String(v)))];
      const dist = opts.map((o) => ({ label: o, value: vals.filter((v) => String(v) === String(o)).length }));
      return { ...base, distribution: dist };
    }
    // text — list the free-text answers (always anonymous in the results view)
    return { ...base, texts: vals.map((v) => String(v)).filter(Boolean).slice(0, 300) };
  });
  return { responseCount: responses.length, questions };
}

// GET /engagement/surveys — HR list with response counts + headline score.
const listSurveys = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const SurveyResponse = req.tenantConn.model('SurveyResponse');
  const surveys = await Survey.find().sort({ createdAt: -1 }).lean();
  const counts = await SurveyResponse.aggregate([{ $group: { _id: '$surveyId', n: { $sum: 1 } } }]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  const rows = await Promise.all(surveys.map(async (s) => {
    const responseCount = countMap[String(s._id)] || 0;
    const eligible = await audienceCount(req, s);
    return {
      _id: s._id, title: s.title, type: s.type, status: effectiveStatus(s), anonymous: s.anonymous,
      audience: s.audience, questions: (s.questions || []).length,
      responseCount, eligible, responseRate: eligible ? Math.round((responseCount / eligible) * 100) : null,
      opensAt: s.opensAt, closesAt: s.closesAt, openedAt: s.openedAt, closedAt: s.closedAt, createdAt: s.createdAt,
    };
  }));
  res.json({ surveys: rows });
});

// POST /engagement/surveys — create a draft.
const createSurvey = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const { title, description, type, questions, audience, anonymous, opensAt, closesAt } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ message: 'A survey title is required.' });
  let qs = Array.isArray(questions) ? questions.filter((q) => q && q.text && String(q.text).trim()) : [];
  if (type === 'enps' && !qs.some((q) => q.kind === 'nps')) qs = [NPS_QUESTION, ...qs];
  if (!qs.length) return res.status(400).json({ message: 'Add at least one question.' });
  const open = opensAt ? new Date(opensAt) : null;
  const close = closesAt ? new Date(closesAt) : null;
  // A future open date schedules the survey; otherwise it starts as a draft.
  const scheduled = open && !Number.isNaN(open.getTime()) && open > new Date();
  const doc = await Survey.create({
    title: String(title).trim(), description: description || '', type: type || 'pulse',
    questions: qs.map((q) => ({ text: String(q.text).trim(), kind: q.kind || 'scale', options: Array.isArray(q.options) ? q.options.filter(Boolean) : [] })),
    audience: { scope: audience?.scope === 'department' ? 'department' : 'all', department: audience?.department || '' },
    anonymous: anonymous !== false,
    opensAt: open && !Number.isNaN(open.getTime()) ? open : null,
    closesAt: close && !Number.isNaN(close.getTime()) ? close : null,
    status: scheduled ? 'scheduled' : 'draft', createdBy: req.auth.userId, createdAt: new Date(),
  });
  res.status(201).json({ survey: doc });
});

// GET /engagement/surveys/:id
const getSurvey = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const s = await Survey.findById(req.params.id);
  if (!s) return res.status(404).json({ message: 'Survey not found.' });
  res.json({ survey: s });
});

// PATCH /engagement/surveys/:id — edit a draft, or open/close.
const updateSurvey = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const s = await Survey.findById(req.params.id);
  if (!s) return res.status(404).json({ message: 'Survey not found.' });
  const { status, title, description, questions, audience, anonymous, opensAt, closesAt } = req.body;

  if (status && status !== s.status) {
    if (status === 'open') { if (!s.questions.length) return res.status(400).json({ message: 'Add a question before opening.' }); s.status = 'open'; s.openedAt = s.openedAt || new Date(); }
    else if (status === 'closed') { s.status = 'closed'; s.closedAt = new Date(); }
    else if (status === 'scheduled') { s.status = 'scheduled'; }
    else if (status === 'draft') { s.status = 'draft'; }
  }
  // Content + scheduling edits are allowed before the survey opens.
  if (s.status === 'draft' || s.status === 'scheduled') {
    if (title != null) s.title = String(title).trim();
    if (description != null) s.description = description;
    if (Array.isArray(questions)) s.questions = questions.filter((q) => q && q.text).map((q) => ({ text: String(q.text).trim(), kind: q.kind || 'scale', options: Array.isArray(q.options) ? q.options.filter(Boolean) : [] }));
    if (audience) s.audience = { scope: audience.scope === 'department' ? 'department' : 'all', department: audience.department || '' };
    if (anonymous != null) s.anonymous = !!anonymous;
    if (opensAt !== undefined) { const d = opensAt ? new Date(opensAt) : null; s.opensAt = d && !Number.isNaN(d.getTime()) ? d : null; if (s.opensAt && s.opensAt > new Date() && s.status === 'draft') s.status = 'scheduled'; }
    if (closesAt !== undefined) { const d = closesAt ? new Date(closesAt) : null; s.closesAt = d && !Number.isNaN(d.getTime()) ? d : null; }
  }
  s.updatedAt = new Date();
  await s.save();
  res.json({ survey: s });
});

// DELETE /engagement/surveys/:id — removes the survey and its responses.
const deleteSurvey = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const SurveyResponse = req.tenantConn.model('SurveyResponse');
  const s = await Survey.findById(req.params.id);
  if (!s) return res.status(404).json({ message: 'Survey not found.' });
  await SurveyResponse.deleteMany({ surveyId: s._id });
  await s.deleteOne();
  res.json({ message: 'Survey deleted.' });
});

// GET /engagement/surveys/:id/results — aggregated, anonymity-respecting.
const surveyResults = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const SurveyResponse = req.tenantConn.model('SurveyResponse');
  const s = await Survey.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ message: 'Survey not found.' });
  const responses = await SurveyResponse.find({ surveyId: s._id }).select('answers segment').lean();
  const eligible = await audienceCount(req, s);
  const responded = responses.length;
  res.json({
    survey: { _id: s._id, title: s.title, type: s.type, status: effectiveStatus(s), anonymous: s.anonymous, opensAt: s.opensAt, closesAt: s.closesAt },
    participation: { eligible, responded, rate: eligible ? Math.round((responded / eligible) * 100) : null },
    results: computeResults(s, responses),
    segments: computeSegments(s, responses),
  });
});

// GET /engagement/me/surveys — open surveys this employee can still answer.
const mySurveys = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const SurveyResponse = req.tenantConn.model('SurveyResponse');
  const emp = await resolveMyEmployee(req);
  const candidates = await Survey.find({ status: { $in: ['open', 'scheduled'] } }).sort({ openedAt: -1 }).lean();
  const open = candidates.filter((s) => effectiveStatus(s) === 'open');
  const myDept = emp?.employment?.department || '';
  const eligible = open.filter((s) => s.audience?.scope !== 'department' || (s.audience.department && s.audience.department === myDept));
  let answered = new Set();
  if (emp) {
    const done = await SurveyResponse.find({ respondentId: emp._id, surveyId: { $in: eligible.map((s) => s._id) } }).select('surveyId').lean();
    answered = new Set(done.map((d) => String(d.surveyId)));
  }
  const rows = eligible.filter((s) => !answered.has(String(s._id)))
    .map((s) => ({ _id: s._id, title: s.title, description: s.description, type: s.type, anonymous: s.anonymous, questions: s.questions }));
  res.json({ surveys: rows });
});

// POST /engagement/surveys/:id/respond — submit answers (one per employee).
const respond = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const SurveyResponse = req.tenantConn.model('SurveyResponse');
  const s = await Survey.findById(req.params.id).lean();
  if (!s) return res.status(404).json({ message: 'Survey not found.' });
  if (effectiveStatus(s) !== 'open') return res.status(400).json({ message: 'This survey is not open.' });
  const emp = await resolveMyEmployee(req);
  if (emp) {
    const exists = await SurveyResponse.findOne({ surveyId: s._id, respondentId: emp._id }).select('_id');
    if (exists) return res.status(409).json({ message: 'You have already responded to this survey.' });
  }
  const validIds = new Set(s.questions.map((q) => String(q._id)));
  const answers = Array.isArray(req.body.answers) ? req.body.answers
    .filter((a) => a && validIds.has(String(a.questionId)) && a.value != null && a.value !== '')
    .map((a) => ({ questionId: a.questionId, value: a.value })) : [];
  if (!answers.length) return res.status(400).json({ message: 'No answers submitted.' });
  await SurveyResponse.create({ surveyId: s._id, respondentId: emp ? emp._id : null, segment: { department: emp?.employment?.department || '' }, answers, submittedAt: new Date() });
  res.status(201).json({ message: 'Thanks — your response was recorded.' });
});

// GET /engagement/trends — eNPS + engagement score across surveys over time.
const trends = asyncHandler(async (req, res) => {
  const Survey = req.tenantConn.model('Survey');
  const SurveyResponse = req.tenantConn.model('SurveyResponse');
  const surveys = await Survey.find({ status: { $in: ['open', 'closed'] } }).sort({ openedAt: 1, createdAt: 1 }).lean();
  const series = [];
  for (const s of surveys) {
    const responses = await SurveyResponse.find({ surveyId: s._id }).select('answers').lean();
    const npsQ = s.questions.find((q) => q.kind === 'nps');
    let enps = null;
    if (npsQ) {
      const nums = [];
      for (const r of responses) for (const a of (r.answers || [])) if (String(a.questionId) === String(npsQ._id)) { const v = Number(a.value); if (Number.isFinite(v) && v >= 0 && v <= 10) nums.push(v); }
      if (nums.length) { const pro = nums.filter((x) => x >= 9).length, det = nums.filter((x) => x <= 6).length; enps = Math.round(((pro - det) / nums.length) * 100); }
    }
    const scaleIds = new Set(s.questions.filter((q) => q.kind === 'scale').map((q) => String(q._id)));
    const sv = [];
    for (const r of responses) for (const a of (r.answers || [])) if (scaleIds.has(String(a.questionId))) { const v = Number(a.value); if (Number.isFinite(v)) sv.push(v); }
    const scaleAvg = sv.length ? +(sv.reduce((x, y) => x + y, 0) / sv.length).toFixed(2) : null;
    const eligible = await audienceCount(req, s);
    series.push({
      id: String(s._id), title: s.title, type: s.type,
      date: s.openedAt || s.createdAt,
      responses: responses.length, eligible,
      rate: eligible ? Math.round((responses.length / eligible) * 100) : null,
      enps, scaleAvg,
    });
  }
  res.json({ series });
});

module.exports = { listSurveys, createSurvey, getSurvey, updateSurvey, deleteSurvey, surveyResults, mySurveys, respond, trends };
