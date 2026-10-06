// client/src/utils/orgTaxonomy.js
// Canonical org-function taxonomy — one brain that knows "HR" = "Human Resources"
// = "People", "IT" = "I.T." = "ICT" = "Information Technology", etc. Used to
// de-duplicate dropdowns and to strictly validate new department/function names
// so the same unit can never be entered twice under different spellings.
//
// This mirrors server/utils/orgTaxonomy.js — keep the two in sync.

// --- Canonical functions and their known aliases -------------------------------
// Add or edit freely. The FIRST string in each row is the canonical display name.
const CANON = [
  ['Human Resources',        ['hr', 'h r', 'human resource', 'human resources', 'people', 'people ops', 'people operations', 'people and culture', 'human capital', 'hcm', 'hr department', 'hrm']],
  ['Information Technology',  ['it', 'i t', 'ict', 'is', 'mis', 'tech', 'technology', 'information technology', 'information tech', 'information systems', 'information & communication technology', 'infotech']],
  ['Finance',                ['finance', 'fin', 'accounts', 'account', 'accounting', 'accountant', 'finance and accounts', 'finance & accounts', 'financial', 'treasury']],
  ['Procurement',            ['procurement', 'purchasing', 'purchase', 'sourcing', 'stores']],
  ['Supply Chain',           ['supply chain', 'supply chain management', 'scm', 'logistics', 'warehouse', 'warehousing', 'distribution']],
  ['Sales',                  ['sales', 'business development', 'biz dev', 'bd', 'commercial']],
  ['Marketing',              ['marketing', 'mktg', 'brand', 'branding', 'communications', 'comms', 'public relations', 'pr', 'corporate affairs']],
  ['Operations',            ['operations', 'operation', 'ops', 'field operations']],
  ['Internal Audit',         ['internal audit', 'audit', 'auditing', 'internal auditor', 'internal control', 'controls']],
  ['Legal',                  ['legal', 'legal affairs', 'legal and compliance', 'legal & compliance', 'company secretary', 'secretariat']],
  ['Compliance',             ['compliance', 'risk', 'risk management', 'grc', 'risk & compliance']],
  ['Administration',         ['admin', 'administration', 'administrative', 'general services', 'corporate services']],
  ['Customer Service',       ['customer service', 'customer care', 'customer support', 'client service', 'client services', 'support', 'call center', 'call centre', 'contact center']],
  ['Research & Development',  ['r&d', 'r and d', 'research and development', 'research & development', 'research', 'product development', 'product']],
  ['Engineering',            ['engineering', 'engineer', 'eng', 'technical', 'technical services', 'maintenance']],
  ['Production',             ['production', 'manufacturing', 'factory', 'plant']],
  ['Quality Assurance',      ['qa', 'q a', 'quality assurance', 'quality', 'quality control', 'qc', 'quality management']],
  ['Health, Safety & Environment', ['hse', 'ehs', 'she', 'health and safety', 'health & safety', 'safety', 'occupational health', 'environment', 'sustainability']],
  ['Projects',               ['projects', 'project', 'pmo', 'project management', 'project management office']],
  ['Facilities',             ['facilities', 'facility', 'facilities management', 'estates', 'premises']],
  ['Security',               ['security', 'physical security', 'safety and security']],
  ['Training & Development',  ['training', 'training and development', 'training & development', 'l&d', 'learning', 'learning and development', 'learning & development', 'capacity building']],
  ['Corporate Strategy',     ['strategy', 'corporate strategy', 'planning', 'strategy and planning', 'business strategy']],
  ['Data & Analytics',       ['data', 'analytics', 'data and analytics', 'data & analytics', 'business intelligence', 'bi', 'data science']],
  ['Management',             ['management', 'executive', 'exec', 'managing director', 'md office', 'ceo office', 'board', 'directorate', 'senior management', 'manager']],
  ['Employee',              ['employee', 'staff', 'general staff', 'all staff']],
];

// --- Normalisation -------------------------------------------------------------
// Fold a raw string into a comparison key: lowercase, "&" -> "and",
// strip punctuation/dots/extra spaces, collapse whitespace.
export function normKey(raw) {
  return String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[._/\\|,'"`()-]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\bdept\b|\bdepartment\b|\bdivision\b|\bunit\b|\bsection\b|\bteam\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a fast alias -> canonical index once.
const ALIAS_INDEX = (() => {
  const idx = new Map();
  for (const [canonical, aliases] of CANON) {
    idx.set(normKey(canonical), canonical);
    for (const a of aliases) idx.set(normKey(a), canonical);
  }
  return idx;
})();

// Title-case a free-text name we don't recognise, so custom units still look tidy.
function titleCase(s) {
  return String(s || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
    .trim();
}

// --- Public API ----------------------------------------------------------------

// Return the canonical display name for any spelling. Unknown names are cleaned
// up (title-cased) but preserved, so the company keeps its own custom units.
export function canonicalize(raw) {
  const key = normKey(raw);
  if (!key) return '';
  if (ALIAS_INDEX.has(key)) return ALIAS_INDEX.get(key);
  return titleCase(raw);
}

// The stable identity of a name for de-duplication (same value for all variants).
export function catKeyOf(raw) {
  return normKey(canonicalize(raw));
}

// True if two names refer to the same function ("IT" vs "Information Technology").
export function sameFunction(a, b) {
  return !!normKey(a) && catKeyOf(a) === catKeyOf(b);
}

// Given a list of {value,label} options, collapse variants that mean the same
// thing. The canonical label wins; the first-seen value is kept as the value.
export function dedupeCategoryOptions(options) {
  const seen = new Map();
  for (const o of options) {
    const label = canonicalize(o.label != null ? o.label : o.value);
    const key = normKey(label);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { value: o.value, label });
    // else: a variant already claimed this slot — drop the duplicate.
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

// Validate a proposed new name against an existing list. Returns:
//   { ok: true, canonical }                         — safe to add
//   { ok: false, reason, existing, canonical }      — a clash / empty
// Use before creating a department so "IT" is refused when "Information
// Technology" already exists.
export function validateNewUnit(proposed, existingNames = []) {
  const canonical = canonicalize(proposed);
  if (!canonical) return { ok: false, reason: 'empty', canonical: '' };
  const key = normKey(canonical);
  for (const ex of existingNames) {
    if (normKey(canonicalize(ex)) === key) {
      return { ok: false, reason: 'duplicate', existing: ex, canonical };
    }
  }
  return { ok: true, canonical };
}

export const CANONICAL_FUNCTIONS = CANON.map((r) => r[0]);