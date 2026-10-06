// client/src/utils/exporter.js
// One shared, branded export utility for the whole app so every list exports the same way:
//   • exportTable(...)   — a professional branded Excel workbook (company letterhead, navy
//     header, applied-filter summary, status-colour cells, zebra rows, frozen header,
//     auto-filter, timestamp footer). Matches the payslip/branding look.
//   • openPrintable(...) — a branded print window for visual reports (e.g. the 9-box grid);
//     the user saves it as PDF. Used where a table would lose the meaning.
//
// Branding (letterhead / logo / company details) is pulled once from /settings/branding,
// the same source the payslip sheet uses.
import React from 'react';
import ExcelJS from 'exceljs';
import api from '../api/client';

// A ready-made, on-brand "⭳ Export" button any page can drop in. Written with
// React.createElement so this stays a plain .js util (no JSX build step needed).
//   import { ExportButton } from '../utils/exporter';
//   <ExportButton onClick={handleExport} />            // label defaults to "Export"
//   <ExportButton onClick={handlePdf} label="PDF" />
export function ExportButton({ onClick, label = 'Export' }) {
  return React.createElement('button', {
    onClick,
    style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: '#012158', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  }, `⭳ ${label}`);
}

let _brandCache = null;
export async function getBranding() {
  if (_brandCache) return _brandCache;
  try { const { data } = await api.get('/settings/branding'); _brandCache = { branding: data?.branding || {}, tenantName: data?.tenant?.name || '' }; }
  catch { _brandCache = { branding: {}, tenantName: '' }; }
  return _brandCache;
}

/* ------------------------------ colour helpers ------------------------------ */
// '#012158' -> 'FF012158'
function toArgb(hex) {
  if (!hex) return null;
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return null;
  return 'FF' + h.toUpperCase();
}
// Soft tint of a colour over white (for status-pill-style cell fills).
function softFill(hex, ratio = 0.16) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const mix = (c) => Math.round(c * ratio + 255 * (1 - ratio));
  const hx = (c) => c.toString(16).padStart(2, '0');
  return 'FF' + (hx(mix(r)) + hx(mix(g)) + hx(mix(b))).toUpperCase();
}
function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function logoImagePart(dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  let ext = m[1].toLowerCase(); if (ext === 'jpg') ext = 'jpeg';
  return { extension: ext, base64: m[2] };
}

async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Branded header on rows 1-3 (letterhead banner, else company name + contact + logo mark).
function brandSheet(wb, ws, b, tenantName, lastCol, title, subtitle) {
  const titleText = subtitle ? `${title} · ${subtitle}` : title;
  const last = colLetter(lastCol);
  const lhPart = logoImagePart(b && b.letterhead);
  if (lhPart) {
    try {
      ws.getRow(1).height = 84;
      const id = wb.addImage(lhPart);
      ws.addImage(id, `A1:${last}1`);
      ws.mergeCells(`A3:${last}3`);
      ws.getCell('A3').value = titleText;
      ws.getCell('A3').font = { size: 12, bold: true, color: { argb: 'FF16233B' } };
      return;
    } catch { /* fall through */ }
  }
  const coName = (b && b.companyName) || tenantName || 'Nexusora Workforce';
  const contact = [b && b.address, b && b.phone, b && b.email, b && b.website].filter(Boolean).join('   ·   ');
  ws.mergeCells(`A1:${last}1`); ws.getCell('A1').value = coName; ws.getCell('A1').font = { bold: true, size: 15, color: { argb: 'FF012158' } };
  ws.mergeCells(`A2:${last}2`); ws.getCell('A2').value = contact; ws.getCell('A2').font = { size: 10, color: { argb: 'FF8B96A9' } };
  ws.mergeCells(`A3:${last}3`); ws.getCell('A3').value = titleText; ws.getCell('A3').font = { size: 12, bold: true, color: { argb: 'FF16233B' } };
  try {
    const part = logoImagePart(b && b.logo);
    if (part) { const id = wb.addImage(part); ws.addImage(id, { tl: { col: Math.max(0, lastCol - 2), row: 0.15 }, ext: { width: 120, height: 46 } }); }
  } catch { /* logo optional */ }
}

/* ================================ EXCEL TABLE ================================ */
// opts = {
//   filename, sheet, title, subtitle,
//   filters: { Label: 'value', ... },          // optional, printed under the title
//   columns: [{ label, key, width?, numFmt?, align?, color? }],
//       color: (value,row) => '#rrggbb' | null   OR   { valueKey: '#rrggbb', ... }
//   rows: [ {key: value, ...}, ... ],
//   totals: { key: value, ... }                  // optional bold totals row
// }
export async function exportTable(opts) {
  const { filename, sheet = 'Sheet1', title = 'Report', subtitle = '', filters, columns, rows, totals } = opts;
  const { branding, tenantName } = await getBranding();
  const wb = new ExcelJS.Workbook(); wb.creator = 'Nexusora Workforce'; wb.created = new Date();
  const ws = wb.addWorksheet(sheet, { views: [{ showGridLines: false }] });
  const lastCol = columns.length;

  brandSheet(wb, ws, branding, tenantName, lastCol, title, subtitle);

  // Filter summary line (row 4)
  let cursor = 4;
  if (filters && Object.keys(filters).length) {
    const txt = 'Filters:  ' + Object.entries(filters).map(([k, v]) => `${k}: ${v}`).join('     ');
    ws.mergeCells(`A4:${colLetter(lastCol)}4`);
    ws.getCell('A4').value = txt;
    ws.getCell('A4').font = { size: 9.5, italic: true, color: { argb: 'FF6B7686' } };
    cursor = 5;
  }
  ws.getRow(cursor).height = 6; cursor += 1;               // spacer

  // Header row
  const headerRowIdx = cursor;
  const header = ws.getRow(headerRowIdx);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF012158' } };
    cell.alignment = { vertical: 'middle', horizontal: c.align || 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF012158' } } };
  });
  header.height = 22;

  // Data rows
  const thin = { style: 'thin', color: { argb: 'FFEAEEF4' } };
  rows.forEach((r, ri) => {
    const row = ws.getRow(headerRowIdx + 1 + ri);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const val = r[c.key];
      cell.value = (val === undefined || val === null) ? '' : val;
      cell.alignment = { vertical: 'middle', horizontal: c.align || (typeof val === 'number' ? 'right' : 'left') };
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.border = { bottom: thin };
      // zebra
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
      // status colour
      let hex = null;
      if (typeof c.color === 'function') hex = c.color(val, r);
      else if (c.color && typeof c.color === 'object') hex = c.color[val];
      if (hex) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: softFill(hex) } };
        cell.font = { bold: true, color: { argb: toArgb(hex) } };
      }
    });
    row.height = 18;
  });

  // Totals row
  if (totals) {
    const tr = ws.getRow(headerRowIdx + 1 + rows.length);
    columns.forEach((c, ci) => {
      const cell = tr.getCell(ci + 1);
      if (totals[c.key] !== undefined) cell.value = totals[c.key];
      cell.font = { bold: true, color: { argb: 'FF012158' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FC' } };
      cell.border = { top: { style: 'double', color: { argb: 'FF012158' } } };
      cell.alignment = { horizontal: c.align || (ci === 0 ? 'left' : 'right') };
      if (c.numFmt) cell.numFmt = c.numFmt;
    });
  }

  // Column widths
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || Math.max(12, String(c.label).length + 4); });

  // Freeze header, auto-filter, timestamp footer
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: false }];
  ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: lastCol } };
  const footIdx = headerRowIdx + 1 + rows.length + (totals ? 1 : 0) + 1;
  ws.mergeCells(`A${footIdx}:${colLetter(lastCol)}${footIdx}`);
  ws.getCell(`A${footIdx}`).value = `Generated ${new Date().toLocaleString()} · ${rows.length} record(s) · Nexusora Workforce`;
  ws.getCell(`A${footIdx}`).font = { size: 9, italic: true, color: { argb: 'FF8B96A9' } };

  await downloadWorkbook(wb, filename || `${title.replace(/\s+/g, '_')}.xlsx`);
}

/* ============================ MULTI-SECTION WORKBOOK ============================ */
// One branded sheet holding several titled tables — used to export a whole dashboard
// (each widget's data as its own section).
//   sections: [{ heading, columns: [{label,key,width?,numFmt?}], rows: [{...}] }]
export async function exportSections({ filename, title = 'Dashboard', subtitle = '', sections = [] }) {
  const { branding, tenantName } = await getBranding();
  const wb = new ExcelJS.Workbook(); wb.creator = 'Nexusora Workforce'; wb.created = new Date();
  const ws = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] });
  const widest = Math.max(2, ...sections.map((s) => (s.columns || []).length));
  brandSheet(wb, ws, branding, tenantName, widest, title, subtitle);

  let r = 5;
  const thin = { style: 'thin', color: { argb: 'FFEAEEF4' } };
  for (const sec of sections) {
    const cols = sec.columns || [];
    const hRow = ws.getRow(r); hRow.getCell(1).value = sec.heading || ''; hRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF012158' } };
    r += 1;
    const head = ws.getRow(r);
    cols.forEach((c, i) => { const cell = head.getCell(i + 1); cell.value = c.label; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF012158' } }; cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }; });
    head.height = 20; r += 1;
    (sec.rows || []).forEach((row, ri) => {
      const xr = ws.getRow(r);
      cols.forEach((c, ci) => { const cell = xr.getCell(ci + 1); const v = row[c.key]; cell.value = v == null ? '' : v; cell.alignment = { horizontal: ci === 0 ? 'left' : 'right' }; if (c.numFmt) cell.numFmt = c.numFmt; if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } }; cell.border = { bottom: thin }; });
      r += 1;
    });
    r += 1; // spacer between sections
  }
  sections.forEach((s) => (s.columns || []).forEach((c, i) => { const w = c.width || Math.max(14, String(c.label).length + 4); const col = ws.getColumn(i + 1); if (!col.width || col.width < w) col.width = w; }));
  ws.mergeCells(`A${r + 1}:${colLetter(widest)}${r + 1}`);
  ws.getCell(`A${r + 1}`).value = `Generated ${new Date().toLocaleString()} · Nexusora Workforce`;
  ws.getCell(`A${r + 1}`).font = { size: 9, italic: true, color: { argb: 'FF8B96A9' } };
  await downloadWorkbook(wb, filename || `${title.replace(/\s+/g, '_')}.xlsx`);
}

/* ================================ PRINT / PDF ================================ */
// Opens a branded print window (letterhead + title + your HTML) and triggers print,
// so the user can Save as PDF. Use for visual reports (e.g. the 9-box grid).
export async function openPrintable({ title = 'Report', subtitle = '', html = '', orientation = 'landscape' }) {
  const { branding, tenantName } = await getBranding();
  const b = branding || {};
  const head = b.letterhead
    ? `<img src="${b.letterhead}" style="width:100%;display:block;border-radius:4px;margin-bottom:10px"/>`
    : `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #012158;padding-bottom:8px;margin-bottom:12px">
         <div><div style="font-size:18px;font-weight:800;color:#012158">${b.companyName || tenantName || 'Nexusora Workforce'}</div>
         <div style="font-size:11px;color:#8B96A9">${[b.address, b.phone, b.email].filter(Boolean).join(' · ')}</div></div>
         ${b.logo ? `<img src="${b.logo}" style="height:46px"/>` : ''}</div>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to export the PDF.'); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>@page{size:A4 ${orientation};margin:14mm} body{font-family:Inter,Arial,sans-serif;color:#16233b;margin:0;padding:16px}
    h1{font-size:16px;color:#012158;margin:0} .sub{font-size:11px;color:#8B96A9;margin:2px 0 14px}
    .foot{margin-top:16px;font-size:9px;color:#8B96A9;font-style:italic}</style></head>
    <body>${head}<h1>${title}</h1><div class="sub">${subtitle}</div>${html}
    <div class="foot">Generated ${new Date().toLocaleString()} · Nexusora Workforce</div></body></html>`);
  w.document.close();
  // give images a moment, then print
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* */ } }, 350);
}

// Reset the cached branding (call after the company updates branding in Settings).
export function clearBrandingCache() { _brandCache = null; }