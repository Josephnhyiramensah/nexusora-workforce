// Form section/field logic. Worker classes, employment types, and grades are now
// customer-managed picklists (fetched from /api/picklists) — NOT hardcoded here.
// The behavior that used to be keyed off hardcoded strings (field work, pay defaults)
// now lives as flags on each worker-class picklist record, so any industry can configure
// its own worker types. These helpers read those flags.

// System enums that are NOT customer-configurable (fixed by the app's own logic).
export const GENDERS = ['male', 'female', 'other'];
export const PAY_BASES = ['salary', 'daily', 'hourly', 'piece_rate', 'task'];
export const PAY_METHODS = ['bank', 'mobile_money', 'cash'];

// Sections to render, driven by the SELECTED worker-class record's flags + employment type.
// `wcRecord` is a picklist record: { code, showsFieldWork, ... } (or null if none chosen).
// `employmentTypeCode` is the chosen employment type's code string.
export function sectionsForRecord(wcRecord, employmentTypeCode) {
  const s = new Set(['identity', 'contact', 'employment', 'compensation', 'payment']);
  const showsFieldWork = !!(wcRecord && wcRecord.showsFieldWork);
  if (showsFieldWork) {
    // Field workers: field-work section + next of kin.
    s.add('fieldWork'); s.add('nextOfKin');
  } else {
    // Office/other: statutory, education, next of kin.
    s.add('statutory'); s.add('education'); s.add('nextOfKin');
  }
  if (employmentTypeCode === 'contract') s.add('contract');
  if (employmentTypeCode === 'casual') { s.delete('statutory'); s.delete('education'); s.delete('nextOfKin'); }
  return s;
}

// Which pay-amount fields to show for a pay basis. (Pay bases are a fixed system enum.)
export function payFieldsFor(payBasis) {
  switch (payBasis) {
    case 'salary': return ['baseSalary'];
    case 'daily': return ['dailyRate'];
    case 'hourly': return ['hourlyRate'];
    case 'piece_rate': return ['pieceAmount', 'pieceUnit'];
    case 'task': return ['pieceAmount'];
    default: return ['baseSalary'];
  }
}

// Defaults now come straight off the chosen worker-class record's flags.
export function defaultPayBasisFor(wcRecord) {
  return (wcRecord && wcRecord.defaultPayBasis) || 'salary';
}
export function defaultPaymentMethodFor(wcRecord) {
  return (wcRecord && wcRecord.defaultPaymentMethod) || 'bank';
}

// Helper: find a worker-class record by its stored code (bridges existing employee data,
// whose employment.workerClass holds the code string, to the picklist record + flags).
export function findByCode(records, code) {
  if (!code) return null;
  return (records || []).find((r) => r.code === code) || null;
}