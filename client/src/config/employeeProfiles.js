// Which form sections/fields apply to each worker class + employment type.
// The Employee model is a superset; this drives the UI so you only capture relevant data.

export const WORKER_CLASSES = ['staff', 'field_worker', 'tapper', 'operator'];
export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'seasonal', 'probation'];
export const GENDERS = ['male', 'female', 'other'];
export const PAY_BASES = ['salary', 'daily', 'hourly', 'piece_rate', 'task'];
export const PAY_METHODS = ['bank', 'mobile_money', 'cash'];

// Sections to render for a given class + type.
export function sectionsFor(workerClass, employmentType) {
  const s = new Set(['identity', 'contact', 'employment', 'compensation', 'payment']);
  if (['staff', 'operator'].includes(workerClass)) { s.add('statutory'); s.add('education'); s.add('nextOfKin'); }
  if (['tapper', 'field_worker'].includes(workerClass)) { s.add('fieldWork'); s.add('nextOfKin'); }
  if (employmentType === 'contract') s.add('contract');
  if (employmentType === 'casual') { s.delete('statutory'); s.delete('education'); s.delete('nextOfKin'); }
  return s;
}

// Which pay-amount fields to show for a pay basis.
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

// Sensible defaults when a worker class is chosen.
export function defaultPayBasis(workerClass) {
  if (workerClass === 'tapper') return 'piece_rate';
  if (workerClass === 'field_worker') return 'daily';
  if (workerClass === 'operator') return 'hourly';
  return 'salary';
}
export function defaultPaymentMethod(workerClass) {
  return ['tapper', 'field_worker'].includes(workerClass) ? 'mobile_money' : 'bank';
}
