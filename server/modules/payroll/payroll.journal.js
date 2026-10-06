// Turns an approved payroll run into a balanced double-entry journal for Nexusora Books.
//   DEBIT  gross wages + employer social-security expense
//   CREDIT social-security payable, PAYE payable, net pay payable
// Account codes are configurable per tenant, defaulting to the Books chart of accounts.
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

const DEFAULT_ACCOUNTS = {
  wageExpense: '5000',
  employerSocialExpense: '5010',
  socialSecurityPayable: '2100',
  payePayable: '2110',
  netPayPayable: '2120',
};

function buildJournal(run, accounts = {}) {
  const A = { ...DEFAULT_ACCOUNTS, ...(accounts || {}) };
  const slips = run.payslips || [];

  const gross = round2(slips.reduce((a, s) => a + Number(s.earnings?.grossEarnings || 0), 0));
  const employeeSS = round2(slips.reduce((a, s) => a + Number(s.deductions?.socialSecurity || 0), 0));
  const paye = round2(slips.reduce((a, s) => a + Number(s.paye || 0), 0));
  const net = round2(slips.reduce((a, s) => a + Number(s.netPay || 0), 0));
  const employerSS = round2(slips.reduce((a, s) => a + Number(s.socialSecurity?.employerTotal || 0), 0));

  const lines = [
    { account: A.wageExpense, description: 'Gross wages & salaries', debit: gross, credit: 0 },
    ...(employerSS > 0 ? [{ account: A.employerSocialExpense, description: 'Employer social security', debit: employerSS, credit: 0 }] : []),
    ...(employeeSS + employerSS > 0 ? [{ account: A.socialSecurityPayable, description: 'Social security payable', debit: 0, credit: round2(employeeSS + employerSS) }] : []),
    ...(paye > 0 ? [{ account: A.payePayable, description: 'PAYE payable', debit: 0, credit: paye }] : []),
    { account: A.netPayPayable, description: 'Net pay payable to staff', debit: 0, credit: net },
  ];

  const totalDebit = round2(lines.reduce((a, l) => a + l.debit, 0));
  const totalCredit = round2(lines.reduce((a, l) => a + l.credit, 0));

  return {
    date: run.period ? `${run.period}-28` : null,
    reference: `PR-${run.period}`,
    memo: `Payroll ${run.period} — ${slips.length} employee(s)`,
    currency: run.currency,
    lines,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    summary: { gross, employeeSocialSecurity: employeeSS, employerSocialSecurity: employerSS, paye, net },
  };
}

module.exports = { buildJournal, DEFAULT_ACCOUNTS };