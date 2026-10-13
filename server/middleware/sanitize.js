// NoSQL-injection sanitization (E1). Recursively removes object KEYS that start
// with '$' (Mongo operators) or contain '.' (path traversal) from req.body,
// req.query and req.params — so a payload like { email: { $gt: '' } } can never
// turn an equality lookup into an operator query. Values are untouched (a value
// of "employment.department" is fine; only dangerous KEYS are stripped).
function clean(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return obj;
  if (Array.isArray(obj)) { obj.forEach((v) => clean(v, depth + 1)); return obj; }
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) { delete obj[key]; continue; }
    const v = obj[key];
    if (v && typeof v === 'object') clean(v, depth + 1);
  }
  return obj;
}

function sanitize(req, res, next) {
  try {
    // The AI/Data-Scientist routes carry user dataset rows whose KEYS are
    // arbitrary column names (a column could legitimately be "$total" or
    // "price.usd") — cleaning those would corrupt the data. Those routes don't
    // build Mongo queries from the payload, so skip their body; still clean
    // query + params everywhere, and body on every other route.
    const skipBody = String(req.path || '').startsWith('/api/ai');
    if (req.body && !skipBody) clean(req.body);
    if (req.query) clean(req.query);
    if (req.params) clean(req.params);
  } catch { /* never block a request on sanitization */ }
  return next();
}

module.exports = { sanitize, clean };
