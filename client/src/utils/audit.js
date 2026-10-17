/* =====================================================================
   audit — shared helpers for the Audit Log viewer. Turns the raw
   "resource.verb" action codes the trail records into human labels and
   consistent colour tones, used by both the page and the detail tray.
   ===================================================================== */
import { C } from '../ui/tokens';

// Map an HTTP method or an action suffix to a verb.
const METHOD_VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

export function VERB_OF(action, method) {
  const fromAction = String(action || '').split('.').slice(1).join('.');
  if (fromAction) return fromAction;
  return METHOD_VERB[String(method || '').toUpperCase()] || '';
}

// "employee.update" → "Employee · Updated". Falls back gracefully.
const PRETTY = { create: 'Created', update: 'Updated', delete: 'Deleted' };
export function describe(action, method) {
  const [res] = String(action || '').split('.');
  const verb = VERB_OF(action, method);
  const resLabel = res ? res.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Action';
  const verbLabel = PRETTY[verb] || (verb ? verb.replace(/\b\w/g, (m) => m.toUpperCase()) : '');
  return verbLabel ? `${resLabel} · ${verbLabel}` : resLabel;
}

// The raw code, shown monospaced (e.g. "employee.update").
export function actionLabel(action) {
  return action || '—';
}

// Resource label only ("employee" → "Employee").
export function resourceLabel(resource) {
  return resource ? String(resource).replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : resource;
}

// [verbLabel, [fg, bg]] tone for a verb, matching the app's pill palette.
const VERB_TONE = {
  create: ['Created', [C.green, C.greenBg]],
  update: ['Updated', [C.accentInk, '#e6f1fd']],
  delete: ['Deleted', [C.red, C.redBg]],
};
export function verbTone(verb) {
  return VERB_TONE[verb] || [verb ? verb.replace(/\b\w/g, (m) => m.toUpperCase()) : 'Action', [C.muted, C.greyBg]];
}
