/* =====================================================================
   dashboardCompute — client-side aggregation for the in-web dashboard
   builder's LIVE preview. Mirrors server/python/build_dashboard.py so what
   the user sees on screen matches the exported Excel.
   ===================================================================== */

export const asNum = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Column profile: name, type (number/category), distinct, sample values.
export function columnsOf(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return headers.map((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => v !== '' && v != null);
    const nums = vals.map(asNum).filter((n) => n != null);
    const numeric = vals.length > 0 && nums.length >= vals.length * 0.8;
    return {
      name: h,
      type: numeric ? 'number' : 'category',
      distinct: new Set(vals.map((v) => String(v))).size,
      samples: vals.slice(0, 5).map((v) => String(v)),
    };
  });
}

// Apply derived "bucket" columns (e.g. age bands) to a copy of the rows.
export function applyDerived(rows, derived) {
  if (!derived || !derived.length) return rows;
  return rows.map((r) => {
    const out = { ...r };
    for (const d of derived) {
      if (!d || !d.name || d.from == null) continue;
      const n = asNum(r[d.from]);
      const bins = Array.isArray(d.bins) ? d.bins : [];
      const labels = Array.isArray(d.labels) ? d.labels : [];
      if (n == null) { out[d.name] = 'Unknown'; continue; }
      let idx = bins.findIndex((b) => n < b);
      if (idx === -1) idx = bins.length;
      out[d.name] = labels[idx] != null ? labels[idx] : `Bucket ${idx}`;
    }
    return out;
  });
}

export function filterRows(rows, selector, value) {
  if (!selector || value == null || value === '(All)') return rows;
  return rows.filter((r) => String(r[selector] ?? '') === String(value));
}

export function uniqueValues(rows, col) {
  if (!col) return [];
  return Array.from(new Set(rows.map((r) => r[col]).filter((v) => v !== '' && v != null).map((v) => String(v)))).sort();
}

export function kpiValue(rows, kpi) {
  const agg = (kpi.agg || 'count').toLowerCase();
  const f = kpi.field;
  if (agg === 'count') return rows.length;
  if (agg === 'distinct') return f ? new Set(rows.map((r) => String(r[f] ?? '')).filter((x) => x !== '')).size : 0;
  if (agg === 'sum' || agg === 'mean') {
    const nums = rows.map((r) => asNum(r[f])).filter((n) => n != null);
    if (!nums.length) return 0;
    const sum = nums.reduce((a, b) => a + b, 0);
    return agg === 'sum' ? sum : sum / nums.length;
  }
  if (agg === 'ratio') {
    if (!rows.length || !f) return 0;
    const match = String(kpi.match ?? '').toLowerCase();
    const num = rows.filter((r) => String(r[f] ?? '').toLowerCase() === match).length;
    return num / rows.length;
  }
  return 0;
}

export function breakdownSeries(rows, bd) {
  const by = bd.by;
  if (!by) return [];
  const agg = (bd.agg || 'count').toLowerCase();
  const f = bd.field;
  const groups = new Map();
  for (const r of rows) {
    const k = (r[by] === '' || r[by] == null) ? 'Unknown' : String(r[by]);
    const g = groups.get(k) || { sum: 0, count: 0, n: 0 };
    g.count += 1;
    if ((agg === 'sum' || agg === 'mean') && f) { const v = asNum(r[f]); if (v != null) { g.sum += v; g.n += 1; } }
    groups.set(k, g);
  }
  let arr = Array.from(groups, ([label, g]) => ({
    label,
    value: agg === 'mean' ? (g.n ? +(g.sum / g.n).toFixed(1) : 0) : agg === 'sum' ? g.sum : g.count,
  }));
  arr.sort((a, b) => b.value - a.value);
  const top = Number.isInteger(bd.top) ? bd.top : 12;
  if (top > 0 && arr.length > top) {
    const head = arr.slice(0, top);
    const other = arr.slice(top).reduce((s, x) => s + x.value, 0);
    head.push({ label: 'Other', value: other });
    arr = head;
  }
  return arr;
}

export function fmtValue(n, format, currency) {
  const v = Number(n || 0);
  const cur = (currency || '').toUpperCase();
  const sym = { USD: '$', GHS: 'GH₵ ', NGN: '₦', EUR: '€', GBP: '£', KES: 'KSh ', ZAR: 'R ', XOF: 'CFA ', XAF: 'FCFA ' }[cur] || (cur ? cur + ' ' : '');
  if (format === 'pct') return (v * 100).toFixed(1) + '%';
  if (format === 'money') return sym + Math.round(v).toLocaleString();
  if (format === 'float') return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return Math.round(v).toLocaleString();
}
