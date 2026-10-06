import { useState, useEffect, useCallback, useMemo } from 'react';
import ExcelJS from 'exceljs';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import PayslipPrint from '../components/PayslipPrint';
import { CalendarClock, CalendarDays, Wallet, ShieldCheck, Users, Layers, Clock, Plus } from 'lucide-react';
import { RouteShell, Hero, KpiBand, Kpi, Body, Segmented } from '../ui/kit';
import { formatMoney } from '../ui/tokens';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', gold: '#C9A227', green: '#1f9d57',
  red: '#e5484d', ink: '#16233b', muted: '#8b96a9', line: '#e6ebf3', card: '#fff' };

const TIMEPAY_RAIL = {
  brand: { title: 'Time & Pay', subtitle: 'Attendance to payroll', Icon: CalendarClock },
  groups: [
    { title: 'Time', items: [{ label: 'Attendance', to: '/attendance', Icon: CalendarClock }, { label: 'Leave', to: '/leave', Icon: CalendarDays }] },
    { title: 'Pay', items: [{ label: 'Payroll', to: '/payroll', Icon: Wallet }, { label: 'Compliance', to: '/compliance', Icon: ShieldCheck }] },
  ],
};

const thisMonth = () => new Date().toISOString().slice(0, 7);
const num = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, c) => formatMoney(n, c, { maximumFractionDigits: 2 });

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF012158' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF012158' } } };
  });
  row.height = 22;
}
function styleTotals(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF012158' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FC' } };
    cell.border = { top: { style: 'double', color: { argb: 'FF012158' } } };
  });
}
function logoImagePart(dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  let ext = m[1].toLowerCase(); if (ext === 'jpg') ext = 'jpeg';
  return { extension: ext, base64: m[2] };
}
function brandSheet(wb, ws, b, tenant, lastCol, title, subtitle, logoAnchorCol) {
  const L = (c) => String.fromCharCode(64 + c);
  const titleText = subtitle ? `${title} · ${subtitle}` : title;
  const lhPart = logoImagePart(b && b.letterhead);
  if (lhPart) {
    try {
      ws.getRow(1).height = 84;
      const id = wb.addImage(lhPart);
      ws.addImage(id, `A1:${L(lastCol)}1`);
      ws.mergeCells(`A3:${L(lastCol)}3`);
      ws.getCell('A3').value = titleText;
      ws.getCell('A3').font = { size: 11, bold: true, color: { argb: 'FF16233B' } };
      return;
    } catch { /* fall through */ }
  }
  const coName = (b && b.companyName) || (tenant && tenant.name) || 'Nexusora Workforce';
  const contact = [b && b.address, b && b.phone, b && b.email, b && b.website].filter(Boolean).join('   ·   ');
  ws.mergeCells(`A1:${L(lastCol)}1`);
  ws.getCell('A1').value = coName;
  ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF012158' } };
  ws.mergeCells(`A2:${L(lastCol)}2`);
  ws.getCell('A2').value = contact;
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF8B96A9' } };
  ws.mergeCells(`A3:${L(lastCol)}3`);
  ws.getCell('A3').value = titleText;
  ws.getCell('A3').font = { size: 11, bold: true, color: { argb: 'FF16233B' } };
  try {
    const part = logoImagePart(b && b.logo);
    if (part) {
      const id = wb.addImage(part);
      const col = (logoAnchorCol != null ? logoAnchorCol : Math.max(0, lastCol - 2));
      ws.addImage(id, { tl: { col, row: 0.15 }, ext: { width: 120, height: 46 } });
    }
  } catch { /* logo optional */ }
}

export default function PayrollPage() {
  const { user, tenant } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState('employees');
  const [period, setPeriod] = useState(thisMonth());
  const [runs, setRuns] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [detail, setDetail] = useState(null);
  const [journal, setJournal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [showRun, setShowRun] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [reload, setReload] = useState(0);
  const [reconRunId, setReconRunId] = useState('');
  const [reconFile, setReconFile] = useState(null);
  const [reconBusy, setReconBusy] = useState(false);
  const [reconResult, setReconResult] = useState(null);
  const [reconErr, setReconErr] = useState('');

  const rail = useMemo(() => ({
    brand: { title: t('compliance.rail_brand'), subtitle: t('compliance.rail_sub'), Icon: CalendarClock },
    groups: [
      { title: t('compliance.grp_time'), items: [{ label: t('home.tile.attendance'), to: '/attendance', Icon: CalendarClock }, { label: t('home.tile.leave'), to: '/leave', Icon: CalendarDays }] },
      { title: t('compliance.grp_pay'), items: [{ label: t('home.tile.payroll'), to: '/payroll', Icon: Wallet }, { label: t('home.tile.compliance'), to: '/compliance', Icon: ShieldCheck }] },
    ],
  }), [t]);

  const canRun = ['super_admin', 'payroll_officer'].includes(user?.role);
  const canApprove = ['super_admin', 'hr_manager'].includes(user?.role);
  const canAccount = ['super_admin', 'payroll_officer'].includes(user?.role);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { data } = await api.get('/payroll/runs'); if (alive) setRuns(Array.isArray(data) ? data : []); } catch { if (alive) setRuns([]); }
      try { const { data } = await api.get('/employees', { params: { status: 'active', limit: 200 } }); if (alive) setEmployees(data?.items || []); } catch { if (alive) setEmployees([]); }
    })();
    return () => { alive = false; };
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  async function runPayroll() {
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/payroll/runs', { period });
      setDetail(data); setJournal(null); setShowRun(false); setTab('runs'); refresh();
      setMsg(t('payroll.msg_runCreated', { period, n: data?.totals?.headcount ?? 0 }));
    } catch (e) { setMsg(e?.response?.data?.message || t('payroll.err_run')); }
    finally { setBusy(false); }
  }
  async function openRun(id) {
    setJournal(null);
    try { const { data } = await api.get(`/payroll/runs/${id}`); setDetail(data); setTab('runs'); }
    catch { setMsg(t('payroll.err_open')); }
  }
  async function approve(id) {
    try { await api.post(`/payroll/runs/${id}/approve`); await openRun(id); refresh(); setMsg(t('payroll.msg_approved')); }
    catch (e) { setMsg(e?.response?.data?.message || t('payroll.err_approve')); }
  }
  async function loadJournal(run) {
    setMsg('');
    try { const { data } = await api.get(`/payroll/runs/${run._id}/journal`); setJournal({ ...data, runId: run._id, runLabel: run.label || run.period }); }
    catch (e) { setJournal(null); setMsg(e?.response?.data?.message || t('payroll.err_journal')); }
  }

  const downloadReconTemplate = () => {
    const csv = 'Staff ID,Name,Net Pay\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'payment-sheet-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
  async function runReconcile() {
    if (!reconRunId) { setReconErr(t('payroll.err_pickRun')); return; }
    if (!reconFile) { setReconErr(t('payroll.err_pickFile')); return; }
    setReconBusy(true); setReconErr(''); setReconResult(null);
    try { const fd = new FormData(); fd.append('file', reconFile); const { data } = await api.post(`/payroll/runs/${reconRunId}/reconcile`, fd); setReconResult(data); }
    catch (e) { setReconErr(e?.response?.data?.message || t('payroll.err_recon')); }
    finally { setReconBusy(false); }
  }

  async function exportPayrollExcel() {
    if (!detail) return;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nexusora Workforce';
    const ws = wb.addWorksheet('Payroll Sheet', { views: [{ state: 'frozen', ySplit: 5 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true } });
    const b = tenant?.branding || {};
    brandSheet(wb, ws, b, tenant, 10, t('payroll.xls_title'), `${detail.label || detail.period} · PR-${detail.period}`, 8);
    ws.addRow([]);
    const headers = [t('payroll.xls_no'), t('payroll.xls_employee'), t('payroll.xls_basis'), t('payroll.xls_days'), t('payroll.xls_output'), t('payroll.xls_gross'), t('payroll.xls_socialSecurity'), t('payroll.xls_paye'), t('payroll.xls_totalDeduction'), t('payroll.xls_netIncome')];
    styleHeader(ws.addRow(headers));
    (detail.payslips || []).forEach((s, i) => {
      const r = ws.addRow([i + 1, s.employee?.name || '', (s.employee?.payBasis || '').replace('_', ' '), Number(s.inputs?.daysWorked || 0), Number(s.inputs?.output || 0), Number(s.earnings?.grossEarnings || 0), Number(s.deductions?.socialSecurity || 0), Number(s.paye || 0), Number(s.deductions?.total || 0), Number(s.netPay || 0)]);
      if (i % 2) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFE' } }; });
      r.getCell(10).font = { bold: true };
    });
    const t2 = ws.addRow(['', t('payroll.totals'), '', '', '', Number(detail.totals?.gross || 0), (detail.payslips || []).reduce((a, s) => a + Number(s.deductions?.socialSecurity || 0), 0), (detail.payslips || []).reduce((a, s) => a + Number(s.paye || 0), 0), Number(detail.totals?.deductions || 0), Number(detail.totals?.net || 0)]);
    styleTotals(t2);
    ws.columns = [{ width: 6 }, { width: 28 }, { width: 13 }, { width: 9 }, { width: 11 }, { width: 15 }, { width: 17 }, { width: 14 }, { width: 17 }, { width: 16 }];
    const fmt = `#,##0.00`;
    ws.getColumn(6).numFmt = fmt; ws.getColumn(7).numFmt = fmt; ws.getColumn(8).numFmt = fmt; ws.getColumn(9).numFmt = fmt; ws.getColumn(10).numFmt = fmt;
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 10 } };
    const note = ws.addRow([]);
    ws.mergeCells(`A${note.number + 1}:J${note.number + 1}`);
    const nc = ws.getCell(`A${note.number + 1}`);
    nc.value = t('payroll.xls_note', { cur: detail.currency, cost: num(detail.totals?.employerCost) }) + (b.footerNote ? ' ' + b.footerNote : '');
    nc.font = { italic: true, size: 9, color: { argb: 'FF8B96A9' } };
    await downloadWorkbook(wb, `Payroll_${detail.period}.xlsx`);
  }

  async function exportJournalExcel() {
    if (!journal) return;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nexusora Workforce';
    const ws = wb.addWorksheet('Journal', { views: [{ state: 'frozen', ySplit: 5 }] });
    const b = tenant?.branding || {};
    brandSheet(wb, ws, b, tenant, 6, t('payroll.xls_journalTitle'), `${journal.reference} · ${journal.date} · ${journal.currency}`, 4);
    ws.addRow([]);
    styleHeader(ws.addRow([t('payroll.xls_date'), t('payroll.xls_reference'), t('payroll.th_account'), t('payroll.th_description'), t('payroll.th_debit'), t('payroll.th_credit')]));
    journal.lines.forEach((l, i) => {
      const r = ws.addRow([journal.date, journal.reference, l.account, l.description, l.debit || null, l.credit || null]);
      if (i % 2) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFE' } }; });
    });
    styleTotals(ws.addRow(['', '', '', t('payroll.totals'), journal.totalDebit, journal.totalCredit]));
    ws.columns = [{ width: 13 }, { width: 15 }, { width: 11 }, { width: 34 }, { width: 15 }, { width: 15 }];
    ws.getColumn(5).numFmt = '#,##0.00'; ws.getColumn(6).numFmt = '#,##0.00';
    await downloadWorkbook(wb, `Journal_${journal.reference}.xlsx`);
  }

  function copyJournal() {
    if (!journal) return;
    const text = [`${journal.reference} · ${journal.date} · ${journal.currency}`, journal.memo, '', ...journal.lines.map((l) => `${l.account}\t${l.description}\t${l.debit ? num(l.debit) : ''}\t${l.credit ? num(l.credit) : ''}`), `\tTOTALS\t${num(journal.totalDebit)}\t${num(journal.totalCredit)}`].join('\n');
    navigator.clipboard?.writeText(text).then(() => setMsg(t('payroll.msg_copied'))).catch(() => setMsg(t('payroll.err_copy')));
  }

  const approvedRuns = runs.filter((r) => r.status !== 'draft');
  const latestNet = runs[0]?.totals?.net;
  const pendingRuns = runs.filter((r) => r.status === 'draft').length;

  const TABS = [['employees', t('payroll.tab_employees')], ['runs', t('payroll.tab_runs')], ...(canAccount ? [['accounting', t('payroll.tab_accounting')], ['reconcile', t('payroll.tab_reconcile')]] : [])];
  const selectTab = (k) => { if (k === 'accounting') setJournal(null); if (k === 'reconcile') { setReconResult(null); setReconErr(''); } setTab(k); };

  return (
    <RouteShell brand={rail.brand} groups={rail.groups}>
      <Hero crumbs={[t('compliance.rail_brand'), t('home.tile.payroll')]} title={t('home.tile.payroll')}
        actions={canRun && tab !== 'accounting' && <button onClick={() => setShowRun(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.83rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(1,33,88,.28)' }}><Plus size={16} /> {t('payroll.runPayroll')}</button>} />
      <KpiBand>
        <Kpi Icon={Users} label={t('payroll.kpi_onPayroll')} value={employees.length} foot={<span>{t('payroll.kpi_onPayroll_foot')}</span>} onClick={() => selectTab('employees')} />
        <Kpi Icon={Wallet} iconColor={C.green} iconBg="#e7f6ee" label={t('payroll.kpi_latestNet')} value={latestNet != null ? money(latestNet, runs[0]?.currency) : '—'} foot={<span>{t('payroll.kpi_latestNet_foot')}</span>} onClick={() => selectTab('runs')} />
        <Kpi Icon={Layers} iconColor={C.navy} iconBg="#eef1f6" label={t('payroll.kpi_runs')} value={runs.length} foot={<span>{t('payroll.kpi_runs_foot')}</span>} onClick={() => selectTab('runs')} />
        <Kpi Icon={Clock} iconColor={C.orange} iconBg="#fdf0dc" label={t('payroll.kpi_awaiting')} value={pendingRuns} pill={pendingRuns ? [t('payroll.st_draft'), 'amber'] : null} foot={<span>{t('payroll.kpi_awaiting_foot')}</span>} onClick={() => selectTab('runs')} />
      </KpiBand>
      <Body>
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}><Segmented items={TABS} active={tab} onSelect={selectTab} /></div>
          {msg && <div style={{ background: '#eaf5ff', border: '1px solid #cfe6fb', color: '#0b4a8f', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16 }}>{msg}</div>}

          {tab === 'employees' && (
            <Card>
              <div style={{ overflowX: 'auto' }}>
                <table style={tbl()}>
                  <thead><tr>{[t('payroll.th_name'), t('payroll.th_position'), t('payroll.th_payBasis'), t('payroll.th_rate'), t('payroll.th_payment')].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {employees.length === 0 && <tr><td colSpan="5" style={empty()}>{t('payroll.empty_employees')}</td></tr>}
                    {employees.map((e, i) => {
                      const comp = e.compensation || {};
                      const rate = comp.payBasis === 'salary' ? comp.baseSalary : comp.payBasis === 'daily' ? comp.dailyRate : comp.payBasis === 'hourly' ? comp.hourlyRate : comp.pieceRate?.amount;
                      return (
                        <tr key={e._id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                          <Td>{e.firstName} {e.lastName}</Td>
                          <Td>{e.employment?.jobTitle || '—'}</Td>
                          <Td style={{ textTransform: 'capitalize' }}>{(comp.payBasis || '').replace('_', ' ') || '—'}</Td>
                          <Td>{rate ? money(rate, comp.currency) : '—'}{comp.payBasis === 'piece_rate' && comp.pieceRate?.unit ? ` / ${comp.pieceRate.unit}` : ''}</Td>
                          <Td style={{ textTransform: 'capitalize' }}>{(e.payment?.method || '').replace('_', ' ') || '—'}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'runs' && (
            <>
              <Card>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tbl()}>
                    <thead><tr>{[t('payroll.th_period'), t('payroll.th_headcount'), t('payroll.th_gross'), t('payroll.th_net'), t('common.status'), ''].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                    <tbody>
                      {runs.length === 0 && <tr><td colSpan="6" style={empty()}>{t('payroll.empty_runs')}</td></tr>}
                      {runs.map((r, i) => (
                        <tr key={r._id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                          <Td>{r.label || r.period}</Td><Td>{r.totals?.headcount ?? '—'}</Td><Td>{money(r.totals?.gross, r.currency)}</Td><Td>{money(r.totals?.net, r.currency)}</Td>
                          <Td><Pill status={r.status} /></Td>
                          <Td><button onClick={() => openRun(r._id)} style={{ padding: '6px 14px', border: 'none', borderRadius: 8, background: C.blue, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.8rem' }}>{t('payroll.view')}</button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {detail && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.05rem' }}>{detail.label || detail.period} · {money(detail.totals?.net, detail.currency)}{t('payroll.netSuffix')}</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => setPrinting(true)} style={outlineBtn()}>{t('payroll.payslips')}</button>
                      <button onClick={exportPayrollExcel} style={outlineBtn()}>⭳ {t('payroll.exportExcel')}</button>
                      {canApprove && detail.status === 'draft' && <button onClick={() => approve(detail._id)} style={{ padding: '9px 16px', border: 'none', borderRadius: 10, background: C.green, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{t('payroll.approveRun')}</button>}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
                    <Stat label={t('payroll.stat_headcount')} value={detail.totals?.headcount ?? 0} />
                    <Stat label={t('payroll.stat_gross')} value={money(detail.totals?.gross, detail.currency)} />
                    <Stat label={t('payroll.stat_deductions')} value={money(detail.totals?.deductions, detail.currency)} />
                    <Stat label={t('payroll.stat_net')} value={money(detail.totals?.net, detail.currency)} accent />
                    <Stat label={t('payroll.stat_employerCost')} value={money(detail.totals?.employerCost, detail.currency)} />
                  </div>
                  <Card>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={tbl()}>
                        <thead><tr>{[t('payroll.th_employee'), t('payroll.th_basis'), t('payroll.th_gross'), t('payroll.th_socialSecurity'), t('payroll.th_paye'), t('payroll.th_net')].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                        <tbody>
                          {(detail.payslips || []).map((s, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                              <Td>{s.employee?.name || '—'}{s.minimumWage?.toppedUp && <span title={t('payroll.minWageTitle')} style={{ marginLeft: 6, fontSize: '.62rem', color: C.orange, fontWeight: 700 }}>▲ {t('payroll.minWage')}</span>}</Td>
                              <Td style={{ textTransform: 'capitalize' }}>{(s.employee?.payBasis || '').replace('_', ' ')}</Td>
                              <Td>{money(s.earnings?.grossEarnings, s.currency)}</Td><Td>{money(s.deductions?.socialSecurity, s.currency)}</Td><Td>{money(s.paye, s.currency)}</Td>
                              <Td style={{ fontWeight: 700 }}>{money(s.netPay, s.currency)}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}

          {tab === 'accounting' && (
            <>
              <div style={{ color: C.muted, fontSize: '.88rem', marginBottom: 16, lineHeight: 1.6 }}>{t('payroll.accountingIntro')}</div>
              <Card>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tbl()}>
                    <thead><tr>{[t('payroll.th_period'), t('payroll.th_gross'), t('payroll.th_net'), t('common.status'), ''].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                    <tbody>
                      {approvedRuns.length === 0 && <tr><td colSpan="5" style={empty()}>{t('payroll.empty_approved')}</td></tr>}
                      {approvedRuns.map((r, i) => (
                        <tr key={r._id} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                          <Td>{r.label || r.period}</Td><Td>{money(r.totals?.gross, r.currency)}</Td><Td>{money(r.totals?.net, r.currency)}</Td>
                          <Td><Pill status={r.status} /></Td>
                          <Td><button onClick={() => loadJournal(r)} style={{ padding: '6px 14px', border: 'none', borderRadius: 8, background: C.blue, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.8rem' }}>{t('payroll.viewJournal')}</button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {journal && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800, color: C.navy }}>{t('payroll.ledgerJournal')} · {journal.reference}</div>
                    <div style={{ display: 'flex', gap: 8 }}><button onClick={copyJournal} style={outlineBtn()}>{t('payroll.copy')}</button><button onClick={exportJournalExcel} style={outlineBtn()}>⭳ {t('payroll.exportExcel')}</button></div>
                  </div>
                  <Card>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={tbl()}>
                        <thead><tr>{[t('payroll.th_account'), t('payroll.th_description'), t('payroll.th_debit'), t('payroll.th_credit')].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '13px 16px', background: '#fafbfd', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {journal.lines.map((l, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}><Td>{l.account}</Td><Td>{l.description}</Td><Td style={{ textAlign: 'right' }}>{l.debit ? num(l.debit) : ''}</Td><Td style={{ textAlign: 'right' }}>{l.credit ? num(l.credit) : ''}</Td></tr>
                          ))}
                          <tr style={{ borderTop: `2px solid ${C.navy}` }}><Td /><Td style={{ fontWeight: 800 }}>{t('payroll.totals')}</Td><Td style={{ textAlign: 'right', fontWeight: 800 }}>{num(journal.totalDebit)}</Td><Td style={{ textAlign: 'right', fontWeight: 800 }}>{num(journal.totalCredit)}</Td></tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <div style={{ marginTop: 8, fontSize: '.82rem', fontWeight: 700, color: journal.balanced ? C.green : C.red }}>{journal.balanced ? '✓ ' + t('payroll.journalBalances') : '✗ ' + t('payroll.journalUnbalanced')}</div>
                </div>
              )}
            </>
          )}

          {tab === 'reconcile' && (
            <>
              <div style={{ color: C.muted, fontSize: '.88rem', marginBottom: 16, lineHeight: 1.6 }}>{t('payroll.reconIntro_pre')}<strong>{t('payroll.staffId')}</strong>{t('payroll.reconIntro_mid')}<strong>{t('payroll.name')}</strong>{t('payroll.reconIntro_post')}</div>
              <Card>
                <div style={{ padding: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ fontSize: '.8rem', color: C.muted, fontWeight: 700 }}>
                    <div style={{ marginBottom: 6 }}>{t('payroll.reconRunLabel')}</div>
                    <select value={reconRunId} onChange={(e) => { setReconRunId(e.target.value); setReconResult(null); }} style={{ padding: '10px 12px', border: '1px solid #d8e0ec', borderRadius: 10, minWidth: 240 }}>
                      <option value="">{t('payroll.selectRun')}</option>
                      {runs.map((r) => <option key={r._id} value={r._id}>{r.label || r.period} · {money(r.totals?.net, r.currency)}{t('payroll.netSuffix')}</option>)}
                    </select>
                  </label>
                  <button onClick={downloadReconTemplate} style={outlineBtn()}>{t('payroll.downloadTemplate')}</button>
                  <input type="file" accept=".xlsx,.csv" onChange={(e) => { setReconFile(e.target.files?.[0] || null); setReconResult(null); }} />
                  <button onClick={runReconcile} disabled={reconBusy} style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: reconBusy ? 0.6 : 1 }}>{reconBusy ? t('payroll.comparing') : t('payroll.compare')}</button>
                </div>
                {reconErr && <div style={{ margin: '0 18px 16px', background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '10px 13px', borderRadius: 10, fontSize: '.85rem' }}>{reconErr}</div>}
              </Card>

              {reconResult && (() => {
                const s = reconResult.summary; const cur = reconResult.currency;
                const balanced = Math.abs(s.diffTotal) < 0.01;
                return (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 14 }}>
                      <Stat label={t('payroll.stat_matched')} value={s.matched} />
                      <Stat label={t('payroll.stat_mismatched')} value={s.mismatched} accent={s.mismatched > 0} />
                      <Stat label={t('payroll.stat_onlySheet')} value={s.onlyInSheet} />
                      <Stat label={t('payroll.stat_onlyPayroll')} value={s.onlyInPayroll} />
                      <Stat label={t('payroll.stat_difference')} value={money(s.diffTotal, cur)} accent={!balanced} />
                    </div>
                    <div style={{ fontSize: '.85rem', color: C.muted, marginBottom: 16 }}>{t('payroll.sheetTotal')} {money(s.sheetTotal, cur)} · {t('payroll.payrollTotal')} {money(s.payrollTotal, cur)} · <strong style={{ color: balanced ? C.green : C.red }}>{balanced ? t('payroll.inBalance') : t('payroll.outBy') + money(s.diffTotal, cur)}</strong></div>

                    {reconResult.mismatches.length > 0 && (
                      <Card>
                        <div style={{ padding: '12px 16px', fontWeight: 800, color: C.red }}>{t('payroll.mismatchesTitle', { n: reconResult.mismatches.length })}</div>
                        <div style={{ overflowX: 'auto' }}><table style={tbl()}>
                          <thead><tr>{[t('payroll.staffId'), t('payroll.name'), t('payroll.th_payroll'), t('payroll.th_sheet'), t('payroll.th_difference')].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '11px 16px', background: '#fafbfd', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>
                          <tbody>{reconResult.mismatches.map((m, i) => <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}><Td>{m.staffId || '—'}</Td><Td>{m.name || '—'}</Td><Td style={{ textAlign: 'right' }}>{money(m.payroll, cur)}</Td><Td style={{ textAlign: 'right' }}>{money(m.sheet, cur)}</Td><Td style={{ textAlign: 'right', fontWeight: 700, color: C.red }}>{money(m.diff, cur)}</Td></tr>)}</tbody>
                        </table></div>
                      </Card>
                    )}
                    {reconResult.onlyInSheet.length > 0 && (
                      <div style={{ marginTop: 16 }}><Card>
                        <div style={{ padding: '12px 16px', fontWeight: 800, color: C.navy }}>{t('payroll.onlySheetTitle', { n: reconResult.onlyInSheet.length })}</div>
                        <div style={{ overflowX: 'auto' }}><table style={tbl()}><thead><tr>{[t('payroll.staffId'), t('payroll.name'), t('payroll.th_amount')].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '11px 16px', background: '#fafbfd', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead><tbody>{reconResult.onlyInSheet.map((m, i) => <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}><Td>{m.staffId || '—'}</Td><Td>{m.name || '—'}</Td><Td style={{ textAlign: 'right' }}>{money(m.amount, cur)}</Td></tr>)}</tbody></table></div>
                      </Card></div>
                    )}
                    {reconResult.onlyInPayroll.length > 0 && (
                      <div style={{ marginTop: 16 }}><Card>
                        <div style={{ padding: '12px 16px', fontWeight: 800, color: C.navy }}>{t('payroll.onlyPayrollTitle', { n: reconResult.onlyInPayroll.length })}</div>
                        <div style={{ overflowX: 'auto' }}><table style={tbl()}><thead><tr>{[t('payroll.staffId'), t('payroll.name'), t('payroll.th_payrollNet')].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? 'right' : 'left', padding: '11px 16px', background: '#fafbfd', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead><tbody>{reconResult.onlyInPayroll.map((m, i) => <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}><Td>{m.staffId || '—'}</Td><Td>{m.name || '—'}</Td><Td style={{ textAlign: 'right' }}>{money(m.payroll, cur)}</Td></tr>)}</tbody></table></div>
                      </Card></div>
                    )}
                    {s.mismatched === 0 && s.onlyInSheet === 0 && s.onlyInPayroll === 0 && <div style={{ padding: 16, color: C.green, fontWeight: 800 }}>✓ {t('payroll.allMatch')}</div>}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </Body>

      {showRun && (
        <div onClick={() => setShowRun(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>
            <h2 style={{ color: C.navy, fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px' }}>{t('payroll.runModalTitle')}</h2>
            <div style={{ fontSize: '.82rem', color: C.muted, fontWeight: 600, marginBottom: 6 }}>{t('payroll.period')}</div>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: '100%', padding: '11px 13px', border: '1px solid #d8e0ec', borderRadius: 10, marginBottom: 8 }} />
            <div style={{ fontSize: '.8rem', color: C.muted, marginBottom: 16 }}>{t('payroll.runModalHint')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowRun(false)} style={{ padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', fontWeight: 600, cursor: 'pointer' }}>{t('common.cancel')}</button>
              <button onClick={runPayroll} disabled={busy} style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? t('payroll.running') : t('payroll.runPayroll')}</button>
            </div>
          </div>
        </div>
      )}

      {printing && detail && <PayslipPrint run={detail} tenantName={tenant?.name} onClose={() => setPrinting(false)} />}
    </RouteShell>
  );
}

function Card({ children }) { return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>{children}</div>; }
function Th({ children }) { return <th style={{ textAlign: 'left', padding: '13px 16px', background: '#fafbfd', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{children}</th>; }
function Td({ children, style }) { return <td style={{ padding: '12px 16px', fontSize: '.9rem', ...style }}>{children}</td>; }
function tbl() { return { width: '100%', borderCollapse: 'collapse' }; }
function empty() { return { textAlign: 'center', color: C.muted, padding: 34, fontSize: '.9rem' }; }
function outlineBtn() { return { padding: '9px 16px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.navy, fontWeight: 700, cursor: 'pointer' }; }
function Stat({ label, value, accent }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 2px rgba(1,33,88,.05)', borderTop: `3px solid ${accent ? C.orange : '#d8e0ec'}` }}>
    <div style={{ fontSize: '.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: C.navy, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>;
}
function Pill({ status }) {
  const map = { draft: ['#fdf0dc', '#b8760a'], approved: ['#e4f7ec', '#1f9d57'], paid: ['#e6f1fd', '#1f6fd6'] };
  const [bg, col] = map[status] || ['#eef1f6', '#8b96a9'];
  return <span style={{ background: bg, color: col, fontWeight: 700, fontSize: '.72rem', padding: '4px 11px', borderRadius: 999, textTransform: 'capitalize' }}>{status}</span>;
}