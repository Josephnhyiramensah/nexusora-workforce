// Safe search helpers. User-supplied search text must NEVER be fed straight to
// `new RegExp(...)`: regex metacharacters let an attacker trigger catastrophic
// backtracking (ReDoS → the event loop hangs) and silently change what a query
// matches (e.g. a search for "C++" or "a.b" would otherwise be interpreted as a
// pattern). escapeRegex() neutralises every metacharacter; searchRegex() builds
// a trimmed, case-insensitive "contains" matcher for list/search endpoints.
function escapeRegex(s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchRegex(s) {
  return new RegExp(escapeRegex(String(s == null ? '' : s).trim()), 'i');
}

module.exports = { escapeRegex, searchRegex };
