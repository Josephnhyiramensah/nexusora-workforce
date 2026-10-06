// Payroll engine — pure functions. Turns an employee + period attendance into a payslip,
// running every statutory number through the country's Compliance Pack (no hardcoded rates).
const { computeSocialSecurity, computeIncomeTax, applyMinimumWageGate } = require('../../compliance/engine');

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// inputs: { daysWorked, unpaidDays, hoursWorked, output, standardDays=26 }
function computePayslip(pack, employee, inputs = {}) {
  const comp = employee.compensation || {};
  const basis = comp.payBasis || 'salary';
  const currency = comp.currency || (pack && pack.currency) || '';
  const standardDays = inputs.standardDays || 26;
  const daysWorked = num(inputs.daysWorked);
  const unpaidDays = num(inputs.unpaidDays);
  const hoursWorked = num(inputs.hoursWorked);
  const output = num(inputs.output);

  let grossEarnings = 0;
  let unpaidDeduction = 0;
  let minWage = null;
  const notes = [];

  if (basis === 'salary') {
    const base = num(comp.baseSalary);
    unpaidDeduction = round2((base / standardDays) * unpaidDays);
    grossEarnings = round2(base - unpaidDeduction);
  } else if (basis === 'daily') {
    grossEarnings = round2(num(comp.dailyRate) * daysWorked);
  } else if (basis === 'hourly') {
    grossEarnings = round2(num(comp.hourlyRate) * hoursWorked);
  } else if (basis === 'piece_rate' || basis === 'task') {
    const rate = num(comp.pieceRate && comp.pieceRate.amount);
    const raw = round2(rate * output);
    const gate = applyMinimumWageGate(pack, { computedPay: raw, daysWorked });
    grossEarnings = gate.pay;
    minWage = gate;
    if (gate.toppedUp) notes.push(`Piece pay ${raw} topped up to minimum-wage floor ${gate.floor}`);
  } else {
    grossEarnings = round2(num(comp.baseSalary));
  }

  // Social security base: 'basic' contributions use grossEarnings as the basic for this period.
  const ss = computeSocialSecurity(pack, { basic: grossEarnings, gross: grossEarnings });
  const taxable = Math.max(0, round2(grossEarnings - ss.employeeTotal)); // SS is pre-tax
  const paye = computeIncomeTax(pack, taxable);

  const totalDeductions = round2(ss.employeeTotal + paye);
  const netPay = round2(grossEarnings - totalDeductions);

  return {
    employee: { id: employee._id, name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(), payBasis: basis },
    currency,
    inputs: { daysWorked, unpaidDays, hoursWorked, output, standardDays },
    earnings: { grossEarnings, unpaidDeduction },
    minimumWage: minWage,
    socialSecurity: ss,
    paye,
    deductions: { socialSecurity: ss.employeeTotal, paye, total: totalDeductions },
    employerCost: round2(grossEarnings + ss.employerTotal),
    netPay,
    notes,
  };
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

module.exports = { computePayslip };