const { test } = require('node:test');
const assert = require('node:assert/strict');
const fm = require('../services/fieldMapping.service');

// Map headers → { field: label } for compact assertions, after the full-name
// augmentation (which mirrors what the import controller does).
function mapped(headers) {
  const { mapping } = fm.mapColumns(headers);
  const full = fm.augmentFullName(headers, mapping);
  const out = {};
  for (const m of full) out[m.source] = m.field;
  return out;
}

// ---- the training-log file that imported 0 rows before the fix ----
const TRAINING = ['STAFF ID', 'NAME OF PARTICIPANT', 'AGE', 'GENDER', 'SESSION',
  'DEPARTMENT/ UNIT', 'POSITION', 'CATEGORY', 'START DATE', 'END DATE', 'YEAR', 'NO. HRS'];

test('full-name column "NAME OF PARTICIPANT" is split into first + last', () => {
  const m = mapped(TRAINING);
  assert.equal(m['NAME OF PARTICIPANT'], fm.FULLNAME);
});

test('a full-name file produces valid rows (last name no longer missing)', () => {
  const headers = TRAINING;
  const rows = [['10000431', 'COBBINAH DICKSON', '34', 'M', '2021', 'Finance', 'Officer', 'Senior', '2021-03-01', '2021-03-03', '2021', '21']];
  const full = fm.augmentFullName(headers, fm.mapColumns(headers).mapping);
  const prev = fm.buildPreview(headers, rows, full);
  assert.equal(prev.summary.validRows, 1);
  assert.equal(prev.sample[0].data.firstName, 'COBBINAH');
  assert.equal(prev.sample[0].data.lastName, 'DICKSON');
});

test('"AGE" does not match "marriage status" by substring', () => {
  assert.notEqual(mapped(['AGE'])['AGE'], 'maritalStatus');
});

test('"END DATE" is not forced onto date of birth via the shared word "date"', () => {
  const m = mapped(['START DATE', 'END DATE']);
  assert.equal(m['START DATE'], 'employment.startDate');
  assert.notEqual(m['END DATE'], 'dateOfBirth');   // no end-date field → left for AI / skip
});

// ---- regressions: normal files must still map the obvious way ----
test('proper First Name + Surname stay separate (no split)', () => {
  const m = mapped(['Staff No', 'First Name', 'Surname', 'Date of Birth', 'Hire Date']);
  assert.equal(m['First Name'], 'firstName');
  assert.equal(m['Surname'], 'lastName');
  assert.equal(m['Date of Birth'], 'dateOfBirth');
  assert.equal(m['Hire Date'], 'employment.startDate');
  assert.ok(!Object.values(m).includes(fm.FULLNAME));   // nothing to split
});

test('"Surname" + "Other Names" map to last/first, not a full-name split', () => {
  const m = mapped(['Staff ID', 'Surname', 'Other Names', 'Gender']);
  assert.equal(m['Surname'], 'lastName');
  assert.equal(m['Other Names'], 'firstName');
  assert.ok(!Object.values(m).includes(fm.FULLNAME));
});

test('a lone "Name"/"Full Name" column is still split', () => {
  assert.equal(mapped(['Employee ID', 'Full Name', 'Department'])['Full Name'], fm.FULLNAME);
  assert.equal(mapped(['Emp No', 'Name', 'Grade'])['Name'], fm.FULLNAME);
});

test('phrase containment still matches "DEPARTMENT/ UNIT" → Department', () => {
  assert.equal(mapped(['DEPARTMENT/ UNIT'])['DEPARTMENT/ UNIT'], 'employment.department');
});
