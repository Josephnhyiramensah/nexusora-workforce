import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import api from '../api/client';

const C = { navy: '#012158', blue: '#3485E9', gold: '#C9A227', muted: '#8b96a9', line: '#e6ebf3', ink: '#16233b' };

const num = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, c) => `${c || ''} ${num(n)}`.trim();

/* ---- ExcelJS branding helpers (shared shape with PayrollPage) ---- */
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
// Pull a base64 image ExcelJS can embed (png/jpeg/gif) out of a data URL; null for anything else.
function logoImagePart(dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  let ext = m[1].toLowerCase(); if (ext === 'jpg') ext = 'jpeg';
  return { extension: ext, base64: m[2] };
}
// Branded header. Priority matches the printed letterhead:
//   1) uploaded letterhead banner (full-width), else 2) company name + contact + logo mark.
// Uses rows 1-3; caller adds a spacer (row 4) and the table header (row 5).
function brandSheet(wb, ws, b, tenantName, lastCol, title, subtitle, logoAnchorCol) {
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
    } catch { /* fall through to text header */ }
  }

  const coName = (b && b.companyName) || tenantName || 'Nexusora Workforce';
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

export default function PayslipPrint({ run, tenantName, onClose }) {
  const [view, setView] = useState('sheet');          // 'sheet' | 'payslips'
  const [branding, setBranding] = useState(null);
  const slips = run?.payslips || [];
  const cur = run?.currency || '';

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get('/settings/branding'); setBranding(data?.branding || {}); }
      catch { setBranding({}); }
    })();
  }, []);

  const periodLabel = (() => {
    if (!run?.period) return '';
    const [y, m] = String(run.period).split('-').map(Number);
    if (!y || !m) return run.period;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  })();

  async function exportExcel() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nexusora Workforce';
    const ws = wb.addWorksheet('Payroll Sheet', {
      views: [{ state: 'frozen', ySplit: 5 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });

    brandSheet(wb, ws, branding || {}, tenantName, 11, 'Staff Payroll Sheet', `${periodLabel} · PR-${run?.period || ''}`, 9);
    ws.addRow([]); // row 4 spacer

    const headers = ['No', 'Name of Employee', 'Pay Basis', 'Days Worked', 'Output',
      'Gross Earnings', 'Social Security', 'PAYE', 'Total Deduction', 'Net Income', 'Employer Cost'];
    styleHeader(ws.addRow(headers)); // row 5

    slips.forEach((s, i) => {
      const r = ws.addRow([
        i + 1, s.employee?.name || '', (s.employee?.payBasis || '').replace('_', ' '),
        Number(s.inputs?.daysWorked || 0), Number(s.inputs?.output || 0),
        Number(s.earnings?.grossEarnings || 0), Number(s.deductions?.socialSecurity || 0),
        Number(s.paye || 0), Number(s.deductions?.total || 0), Number(s.netPay || 0), Number(s.employerCost || 0),
      ]);
      if (i % 2) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFE' } }; });
      r.getCell(10).font = { bold: true };
    });

    const t = ws.addRow(['', 'TOTALS', '', '', '',
      Number(run?.totals?.gross || 0),
      slips.reduce((a, s) => a + Number(s.deductions?.socialSecurity || 0), 0),
      slips.reduce((a, s) => a + Number(s.paye || 0), 0),
      Number(run?.totals?.deductions || 0), Number(run?.totals?.net || 0), Number(run?.totals?.employerCost || 0)]);
    styleTotals(t);

    ws.columns = [{ width: 5 }, { width: 26 }, { width: 12 }, { width: 12 }, { width: 10 },
      { width: 15 }, { width: 15 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 15 }];
    const fmt = '#,##0.00';
    [6, 7, 8, 9, 10, 11].forEach((c) => { ws.getColumn(c).numFmt = fmt; });
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 11 } };

    const note = ws.addRow([]);
    ws.mergeCells(`A${note.number + 1}:K${note.number + 1}`);
    const nc = ws.getCell(`A${note.number + 1}`);
    nc.value = `All figures in ${cur}. Employer cost this period: ${num(run?.totals?.employerCost)} (employer contributions are not deducted from staff).${branding?.footerNote ? ' ' + branding.footerNote : ''}`;
    nc.font = { italic: true, size: 9, color: { argb: 'FF8B96A9' } };

    await downloadWorkbook(wb, `Payroll_${run?.period || 'run'}.xlsx`);
  }

  return (
    <div className="rep-overlay" style={{ position: 'fixed', inset: 0, background: '#e9edf4', zIndex: 70, overflowY: 'auto' }}>
      <style>{`
       @media print {
          body * { visibility: hidden !important; }
          .rep-sheet, .rep-sheet * { visibility: visible !important; }
          .rep-overlay {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; background: #fff !important; overflow: visible !important;
          }
          .rep-sheet { padding: 0 !important; }
          .rep-toolbar { display: none !important; }
          .rep-page {
            box-shadow: none !important; border: none !important; border-radius: 0 !important;
            width: 100% !important; max-width: 100% !important;
            min-height: 0 !important; height: auto !important;
            margin: 0 !important; padding: 0 !important;
            page-break-after: always;
          }
          .rep-page:last-child { page-break-after: auto; }
          .rep-table thead { display: table-header-group; }
          .rep-table tr { page-break-inside: avoid; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      {/* toolbar */}
      <div className="rep-toolbar" style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, padding: '12px 22px', background: '#fff', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onClose} style={btn()}>← Back to payroll runs</button>
          <div style={{ display: 'flex', gap: 4 }}>
            <TabBtn on={view === 'sheet'} onClick={() => setView('sheet')}>Payroll Sheet</TabBtn>
            <TabBtn on={view === 'payslips'} onClick={() => setView('payslips')}>Individual Payslips</TabBtn>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={exportExcel} style={btn()}>⭳ Export Excel</button>
          <button onClick={() => window.print()} style={{ ...btn(), background: C.navy, color: '#fff', border: 'none' }}>🖨 Print / PDF</button>
        </div>
      </div>

      <div className="rep-sheet" style={{ padding: '22px 0 50px' }}>
        {view === 'sheet' ? (
          <Page>
            <Letterhead branding={branding} tenantName={tenantName} />
            <h2 style={{ textAlign: 'center', color: C.navy, fontSize: '1.15rem', fontWeight: 800, margin: '16px 0 2px' }}>Staff Payroll Sheet</h2>
            <div style={{ textAlign: 'center', color: C.muted, fontSize: '.8rem', marginBottom: 16 }}>
              {periodLabel} · PR-{run?.period}
            </div>

            <table className="rep-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
              <thead>
                <tr>
                  {['No', 'Name of Employee', 'Basis', 'Days', 'Output', 'Gross', 'Social Sec.', 'PAYE', 'Total Deduction', 'Net Income'].map((h, i) => (
                    <th key={h} style={{ textAlign: i <= 2 ? 'left' : 'right', padding: '9px 8px', color: C.navy,
                      fontWeight: 700, borderBottom: `2px solid ${C.navy}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slips.map((s, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <Cell left>{i + 1}</Cell>
                    <Cell left>{s.employee?.name || '—'}{s.minimumWage?.toppedUp && <sup style={{ color: C.gold, fontWeight: 700 }}> ▲</sup>}</Cell>
                    <Cell left style={{ textTransform: 'capitalize', color: C.muted }}>{(s.employee?.payBasis || '').replace('_', ' ')}</Cell>
                    <Cell>{num(s.inputs?.daysWorked)}</Cell>
                    <Cell>{Number(s.inputs?.output) ? num(s.inputs.output) : '—'}</Cell>
                    <Cell>{num(s.earnings?.grossEarnings)}</Cell>
                    <Cell>{num(s.deductions?.socialSecurity)}</Cell>
                    <Cell>{num(s.paye)}</Cell>
                    <Cell>{num(s.deductions?.total)}</Cell>
                    <Cell bold>{num(s.netPay)}</Cell>
                  </tr>
                ))}
                {slips.length === 0 && <tr><td colSpan="10" style={{ textAlign: 'center', padding: 26, color: C.muted }}>No payslips in this run.</td></tr>}
                <tr style={{ borderTop: `2px solid ${C.navy}` }}>
                  <Cell left />
                  <Cell left bold>TOTALS</Cell>
                  <Cell left /><Cell /><Cell />
                  <Cell bold>{num(run?.totals?.gross)}</Cell>
                  <Cell bold>{num(slips.reduce((a, s) => a + Number(s.deductions?.socialSecurity || 0), 0))}</Cell>
                  <Cell bold>{num(slips.reduce((a, s) => a + Number(s.paye || 0), 0))}</Cell>
                  <Cell bold>{num(run?.totals?.deductions)}</Cell>
                  <Cell bold>{num(run?.totals?.net)}</Cell>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 14, fontSize: '.68rem', color: C.muted, fontStyle: 'italic', lineHeight: 1.6 }}>
              All figures in {cur}. Employer cost this period: {money(run?.totals?.employerCost, cur)} (employer contributions are not deducted from staff).
              {slips.some((s) => s.minimumWage?.toppedUp) && ' ▲ Piece-rate pay topped up to the statutory minimum wage.'}
              {branding?.footerNote ? ` ${branding.footerNote}` : ''}
            </div>
          </Page>
        ) : (
          slips.map((s, i) => (
            <Page key={i}>
              <Letterhead branding={branding} tenantName={tenantName} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '16px 0 14px' }}>
                <h2 style={{ color: C.navy, fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Payslip</h2>
                <div style={{ textAlign: 'right', fontSize: '.78rem', color: C.muted }}>
                  Pay period<div style={{ color: C.navy, fontWeight: 800, fontSize: '.95rem' }}>{periodLabel}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16,
                background: '#f7f9fc', border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }}>
                <Meta label="Employee" value={s.employee?.name || '—'} />
                <Meta label="Pay basis" value={(s.employee?.payBasis || '').replace('_', ' ')} />
                <Meta label="Days worked" value={num(s.inputs?.daysWorked)} />
                <Meta label="Output" value={Number(s.inputs?.output) ? num(s.inputs.output) : '—'} />
              </div>

              <SlipSection title="Earnings">
                <SlipRow label="Gross earnings" value={money(s.earnings?.grossEarnings, s.currency || cur)} />
                {Number(s.earnings?.unpaidDeduction) > 0 &&
                  <SlipRow label="Less: unpaid leave" value={`− ${money(s.earnings.unpaidDeduction, s.currency || cur)}`} />}
                {s.minimumWage?.toppedUp &&
                  <SlipRow label="Minimum-wage top-up applied" value={money(s.minimumWage.floor, s.currency || cur)} muted />}
              </SlipSection>

              <SlipSection title="Deductions">
                <SlipRow label="Social security" value={money(s.deductions?.socialSecurity, s.currency || cur)} />
                <SlipRow label="Income tax (PAYE)" value={money(s.paye, s.currency || cur)} />
                <SlipRow label="Total deductions" value={money(s.deductions?.total, s.currency || cur)} bold />
              </SlipSection>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f7f9fc',
                border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.gold}`, borderRadius: 8, padding: '13px 16px', marginTop: 14 }}>
                <div style={{ fontWeight: 800, color: C.navy, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: '.76rem' }}>Net Pay</div>
                <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.25rem' }}>{money(s.netPay, s.currency || cur)}</div>
              </div>

              <div style={{ marginTop: 12, fontSize: '.66rem', color: C.muted, lineHeight: 1.6 }}>
                Employer cost this period: {money(s.employerCost, s.currency || cur)}.
                {branding?.footerNote ? ` ${branding.footerNote}` : ''}
                <br />Computer-generated payslip · Nexusora Workforce
              </div>
            </Page>
          ))
        )}
      </div>
    </div>
  );
}

/* Letterhead with the fallback chain: uploaded letterhead → company details + logo → Nexusora mark. */
function Letterhead({ branding, tenantName }) {
  const b = branding || {};
  if (b.letterhead) {
    return (
      <div>
        <img src={b.letterhead} alt="" style={{ width: '100%', display: 'block', borderRadius: 4 }} />
        <div style={{ height: 3, background: `linear-gradient(90deg, ${C.navy} 50%, ${C.gold} 50%)`, marginTop: 6 }} />
      </div>
    );
  }
  const hasDetails = b.companyName || b.logo || b.address || b.phone;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 10 }}>
        <img src={b.logo || '/logo-mark.png'} alt="" style={{ height: 52 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.15rem' }}>
            {b.companyName || tenantName || 'Nexusora Workforce'}
          </div>
          {hasDetails && (
            <div style={{ color: C.muted, fontSize: '.72rem', lineHeight: 1.5 }}>
              {[b.address, b.phone, b.email, b.website].filter(Boolean).join(' · ')}
            </div>
          )}
          {!hasDetails && <div style={{ color: C.muted, fontSize: '.72rem' }}>People · Performance · Progress</div>}
        </div>
      </div>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${C.navy} 50%, ${C.gold} 50%)` }} />
    </div>
  );
}

/* A4 page: looks like a real sheet on screen; in print the @page margin handles the spacing. */
function Page({ children }) {
  return (
    <div className="rep-page" style={{
      width: '210mm', maxWidth: '96vw', minHeight: '297mm', margin: '0 auto 22px', background: '#fff',
      padding: '14mm', boxShadow: '0 8px 26px rgba(1,33,88,.16)', boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, Arial, sans-serif', color: C.ink,
    }}>{children}</div>
  );
}
function Cell({ children, left, bold, style }) {
  return <td style={{ padding: '7px 8px', textAlign: left ? 'left' : 'right', fontWeight: bold ? 800 : 400,
    color: bold ? C.navy : C.ink, whiteSpace: 'nowrap', ...style }}>{children}</td>;
}
function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '.62rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '.88rem', textTransform: 'capitalize' }}>{value}</div>
    </div>
  );
}
function SlipSection({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '.66rem', color: C.blue, textTransform: 'uppercase', letterSpacing: '.09em',
        fontWeight: 800, borderBottom: `1px solid ${C.line}`, paddingBottom: 5, marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}
function SlipRow({ label, value, bold, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.84rem',
      fontWeight: bold ? 800 : 500, color: muted ? C.muted : C.ink }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
function TabBtn({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
      padding: '8px 14px', fontWeight: 700, fontSize: '.86rem', color: on ? C.navy : C.muted }}>
      {children}
      {on && <span style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 3, background: C.gold, borderRadius: 3 }} />}
    </button>
  );
}
function btn() {
  return { padding: '9px 16px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff',
    color: C.navy, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' };
}