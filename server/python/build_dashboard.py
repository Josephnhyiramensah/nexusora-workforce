#!/usr/bin/env python3
"""
Nexusora Workforce — AI analytics engine.

Turns a (Claude-generated) analysis SPEC + DATA into a professional, interactive
Excel dashboard. Numbers are computed here with pandas (never hallucinated); the
AI only decides WHAT to analyse and how to present it.

Usage:
    python3 build_dashboard.py JOB.json        # job path as arg
    cat JOB.json | python3 build_dashboard.py  # or on stdin

JOB:
{
  "output": "/abs/path/out.xlsx",
  "spec":   { ... see SPEC below ... },
  "data":   [ {col: val, ...}, ... ]           # or { "main": [...] }
}

SPEC (all keys optional except at least some data):
{
  "title": "Workforce Analytics Dashboard",
  "subtitle": "Prepared ...",
  "brand":   { "primary": "#012158", "accent": "#168eff" },
  "currency": "GHS",
  "selector": "department",                     # interactive dropdown dimension
  "derived": [
     { "name": "ageBand", "from": "age",   "type": "bucket",
       "bins": [20,30,40,50,60], "labels": ["<20","20-29","30-39","40-49","50-59","60+"] }
  ],
  "kpis": [
     { "label": "Headcount",  "agg": "count" },
     { "label": "Avg Salary", "field": "salary", "agg": "mean", "format": "money" },
     { "label": "Attrition",  "agg": "ratio", "field": "status",
       "match": "terminated", "format": "pct" }
  ],
  "breakdowns": [
     { "title": "Headcount by Department", "by": "department", "agg": "count",
       "chart": "column", "top": 12 },
     { "title": "Average Salary by Grade", "by": "grade", "field": "salary",
       "agg": "mean", "chart": "bar", "format": "money" },
     { "title": "Gender Split", "by": "gender", "agg": "count", "chart": "pie" }
  ]
}

Prints a JSON summary to stdout: {"ok": true, "output": "...", "sheets": [...],
"rows": N, "charts": M, "warnings": [...]}.
"""
import sys
import json
import math
import datetime as dt

import pandas as pd
from xlsxwriter.utility import xl_col_to_name


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def _read_job():
    if len(sys.argv) > 1 and sys.argv[1] not in ("-", ""):
        with open(sys.argv[1], "r", encoding="utf-8") as fh:
            return json.load(fh)
    raw = sys.stdin.read()
    return json.loads(raw)


def _as_frame(data):
    """Accept a list of rows or {name: rows}; return the primary DataFrame."""
    if isinstance(data, dict):
        rows = data.get("main") or next(iter(data.values()), [])
    else:
        rows = data
    df = pd.DataFrame(rows or [])
    # Normalise column names to strings; keep original order.
    df.columns = [str(c) for c in df.columns]
    return df


def _is_number_series(s):
    return pd.api.types.is_numeric_dtype(s)


def _coerce_numeric(df):
    """Best-effort: turn object columns that are really numbers into numbers."""
    for c in df.columns:
        if df[c].dtype == object:
            conv = pd.to_numeric(df[c], errors="coerce")
            # Only adopt if most non-null values converted cleanly.
            non_null = df[c].notna().sum()
            if non_null and conv.notna().sum() >= 0.8 * non_null:
                df[c] = conv
    return df


def _apply_derived(df, derived, warnings):
    for d in derived or []:
        name = d.get("name")
        src = d.get("from")
        if not name or src not in df.columns:
            warnings.append(f"derived '{name}': source '{src}' missing")
            continue
        typ = (d.get("type") or "bucket").lower()
        if typ == "bucket":
            bins = d.get("bins") or []
            labels = d.get("labels")
            try:
                col = pd.to_numeric(df[src], errors="coerce")
                edges = [-math.inf] + list(bins) + [math.inf]
                if not labels or len(labels) != len(edges) - 1:
                    labels = [f"{edges[i]}–{edges[i+1]}" for i in range(len(edges) - 1)]
                df[name] = pd.cut(col, bins=edges, labels=labels, right=False)
                df[name] = df[name].astype(object).where(df[name].notna(), "Unknown")
            except Exception as e:  # noqa
                warnings.append(f"derived '{name}': {e}")
        else:
            warnings.append(f"derived '{name}': unknown type '{typ}'")
    return df


_DATE_HINTS = ("hiredate", "hire_date", "hireperiod", "datejoined", "date_joined", "joined",
               "startdate", "start_date", "dateemployed", "employmentdate", "date", "period", "month")


def _detect_dates(df):
    """Find a date/period column (name hint first, then any parseable object col).
    Returns (col_name, datetime Series) or (None, None)."""
    def _try(col):
        s = df[col]
        nn = s.notna().sum()
        if not nn:
            return None
        p = pd.to_datetime(s.astype(str).str.strip(), errors="coerce", format="mixed")
        return p if (p.notna().sum() >= 0.6 * nn and p.notna().sum() >= 3) else None

    low = {c: c.lower().replace(" ", "").replace("-", "").replace("_", "") for c in df.columns}
    for hint in _DATE_HINTS:
        for c in df.columns:
            if hint in low[c]:
                p = _try(c)
                if p is not None:
                    return c, p
    for c in df.columns:
        if df[c].dtype == object:
            p = _try(c)
            if p is not None:
                return c, p
    return None, None


def _linreg_project(y, ahead):
    import numpy as _np
    y = _np.asarray(y, dtype=float)
    k = len(y)
    if k < 2:
        return [float(y[-1])] * ahead if k else []
    x = _np.arange(k, dtype=float)
    slope, intercept = _np.polyfit(x, y, 1)
    return [float(max(0.0, slope * (k + i) + intercept)) for i in range(ahead)]


def _fmt_code(kind, currency):
    cur = (currency or "").upper()
    sym = {"USD": "$", "GHS": "GH₵ ", "NGN": "₦", "EUR": "€", "GBP": "£", "KES": "KSh ",
           "ZAR": "R ", "XOF": "CFA ", "XAF": "FCFA "}.get(cur, (cur + " ") if cur else "")
    # Quote the literal prefix so letters like G/H are never mis-read as date tokens.
    lit = f'"{sym}"' if sym else ""
    if kind == "money":
        return f'{lit}#,##0'
    if kind == "money2":
        return f'{lit}#,##0.00'
    if kind == "pct":
        return "0.0%"
    if kind == "float":
        return "#,##0.0"
    return "#,##0"


# --------------------------------------------------------------------------- #
#  Aggregation (pandas — the real numbers)
# --------------------------------------------------------------------------- #
def _kpi_value(df, kpi, warnings):
    agg = (kpi.get("agg") or "count").lower()
    field = kpi.get("field")
    if agg == "count":
        return float(len(df))
    if agg == "distinct":
        if field in df.columns:
            return float(df[field].nunique(dropna=True))
        return 0.0
    if agg in ("sum", "mean"):
        if field in df.columns:
            s = pd.to_numeric(df[field], errors="coerce")
            return float(s.sum() if agg == "sum" else (s.mean() if s.notna().any() else 0.0))
        warnings.append(f"kpi '{kpi.get('label')}': field '{field}' missing")
        return 0.0
    if agg == "ratio":
        if field in df.columns and len(df):
            match = kpi.get("match")
            num = (df[field].astype(str).str.lower() == str(match).lower()).sum()
            return float(num) / float(len(df))
        return 0.0
    warnings.append(f"kpi '{kpi.get('label')}': unknown agg '{agg}'")
    return 0.0


def _breakdown_table(df, bd, warnings):
    by = bd.get("by")
    if by not in df.columns:
        warnings.append(f"breakdown '{bd.get('title')}': dimension '{by}' missing")
        return None
    agg = (bd.get("agg") or "count").lower()
    field = bd.get("field")
    g = df.copy()
    g[by] = g[by].astype(object).where(g[by].notna(), "Unknown")
    if agg == "count":
        out = g.groupby(by, dropna=False).size().reset_index(name="value")
        measure = bd.get("measureLabel") or "Count"
    elif agg in ("sum", "mean") and field in df.columns:
        g[field] = pd.to_numeric(g[field], errors="coerce")
        series = g.groupby(by, dropna=False)[field].agg(agg)
        out = series.reset_index().rename(columns={field: "value"})
        measure = bd.get("measureLabel") or (f"Total {field}" if agg == "sum" else f"Avg {field}")
    else:
        warnings.append(f"breakdown '{bd.get('title')}': bad agg/field")
        return None
    out = out.sort_values("value", ascending=False).reset_index(drop=True)
    top = bd.get("top")
    if isinstance(top, int) and top > 0 and len(out) > top:
        head = out.iloc[:top].copy()
        other = pd.DataFrame({by: ["Other"], "value": [out.iloc[top:]["value"].sum()]})
        out = pd.concat([head, other], ignore_index=True)
    out.columns = [by, measure]
    return out


# --------------------------------------------------------------------------- #
#  Workbook
# --------------------------------------------------------------------------- #
def build(job):
    spec = job.get("spec") or {}
    out_path = job["output"]
    warnings = []

    df = _as_frame(job.get("data"))
    if df.empty:
        # Still produce a valid (near-empty) workbook rather than crashing.
        df = pd.DataFrame({"Note": ["No data was provided."]})
    df = _coerce_numeric(df)
    df = _apply_derived(df, spec.get("derived"), warnings)

    brand = spec.get("brand") or {}
    primary = brand.get("primary") or "#012158"
    accent = brand.get("accent") or "#168eff"
    currency = spec.get("currency")
    title = spec.get("title") or "Workforce Analytics Dashboard"
    subtitle = spec.get("subtitle") or f"Generated {dt.date.today().isoformat()} · {len(df):,} records"

    import xlsxwriter
    wb = xlsxwriter.Workbook(out_path, {"nan_inf_to_errors": True, "default_date_format": "yyyy-mm-dd"})
    base_font = {"font_name": "Arial"}

    f_title = wb.add_format({**base_font, "font_size": 20, "bold": True, "font_color": "#FFFFFF", "valign": "vcenter"})
    f_sub = wb.add_format({**base_font, "font_size": 10, "font_color": "#DCE7F7", "valign": "vcenter"})
    f_section = wb.add_format({**base_font, "font_size": 12, "bold": True, "font_color": primary})
    f_kpi_label = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#5B6B86", "align": "left"})
    f_kpi_num = wb.add_format({**base_font, "font_size": 22, "bold": True, "font_color": primary, "align": "left", "valign": "vcenter"})
    f_card = wb.add_format({"bg_color": "#F5F8FD", "border": 1, "border_color": "#E3EAF5"})
    f_sel_label = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#FFFFFF", "bg_color": accent, "align": "center", "valign": "vcenter"})
    f_sel_val = wb.add_format({**base_font, "font_size": 12, "bold": True, "font_color": primary, "bg_color": "#FFF8E6", "border": 1, "border_color": "#FFD98A", "align": "center", "valign": "vcenter"})
    f_hdr = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "border": 1, "border_color": "#2B4A74", "align": "center", "valign": "vcenter"})
    f_cell = wb.add_format({**base_font, "font_size": 10, "border": 1, "border_color": "#E3EAF5"})
    f_note = wb.add_format({**base_font, "font_size": 8, "italic": True, "font_color": "#8B96A9"})

    def num_format(code):
        return wb.add_format({**base_font, "font_size": 10, "num_format": code, "border": 1, "border_color": "#E3EAF5"})

    def kpi_num_format(code):
        return wb.add_format({**base_font, "font_size": 22, "bold": True, "font_color": primary, "num_format": code, "align": "left", "valign": "vcenter"})

    CARD_BG = "#F1F6FD"

    def write_kpi(r0, c0, span, label, code, value=None, formula=None, cached=None, num_color=primary):
        """A flat KPI card: label row (merged) + value row (value at anchor, bg
        fill across). No vertical merge, so the value cell is never a dropped
        non-anchor merged cell."""
        lab_fmt = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#5B6B86", "bg_color": CARD_BG, "align": "left", "valign": "vcenter"})
        val_fmt = wb.add_format({**base_font, "font_size": 22, "bold": True, "font_color": num_color, "num_format": code, "bg_color": CARD_BG, "align": "left", "valign": "vcenter"})
        bg = wb.add_format({"bg_color": CARD_BG})
        ws.merge_range(r0, c0, r0, c0 + span - 1, label.upper(), lab_fmt)
        if formula is not None:
            ws.write_formula(r0 + 1, c0, formula, val_fmt, cached)
        else:
            ws.write_number(r0 + 1, c0, value or 0, val_fmt)
        for cc in range(c0 + 1, c0 + span):
            ws.write_blank(r0 + 1, cc, None, bg)
        ws.set_row(r0 + 1, 30)

    # ---------- DATA sheet (Excel Table, filterable) ---------- #
    ws_data = wb.add_worksheet("Data")
    ncols = len(df.columns)
    nrows = len(df)
    # Choose per-column number formats.
    col_meta = []
    for ci, col in enumerate(df.columns):
        s = df[col]
        if _is_number_series(s):
            looks_money = any(k in col.lower() for k in ("salary", "pay", "wage", "amount", "cost", "net", "gross"))
            code = _fmt_code("money", currency) if looks_money else _fmt_code("float" if s.dropna().mod(1).any() else "int", currency)
        else:
            code = None
        col_meta.append(code)
        ws_data.set_column(ci, ci, max(12, min(32, int(s.astype(str).str.len().clip(upper=40).max() if nrows else 12) + 2)),
                           num_format(code) if code else wb.add_format({**base_font, "font_size": 10}))

    # Write rows via table.
    table_cols = [{"header": str(c), "header_format": f_hdr} for c in df.columns]
    # Fill cells (xlsxwriter add_table writes the header; we write the body).
    for ci, col in enumerate(df.columns):
        for ri in range(nrows):
            v = df.iat[ri, ci]
            if pd.isna(v):
                ws_data.write_blank(ri + 1, ci, None, f_cell)
            elif col_meta[ci]:
                ws_data.write_number(ri + 1, ci, float(v), num_format(col_meta[ci]))
            else:
                ws_data.write(ri + 1, ci, (v.item() if hasattr(v, "item") else v), f_cell)
    last_row = max(1, nrows)
    ws_data.add_table(0, 0, last_row, ncols - 1,
                      {"columns": table_cols, "name": "DataTbl", "style": "Table Style Medium 2",
                       "autofilter": True, "header_row": True})
    ws_data.freeze_panes(1, 0)

    def col_range(col):
        """A1 range for a data column body, e.g. Data!$C$2:$C$101."""
        ci = list(df.columns).index(col)
        letter = xl_col_to_name(ci)
        return f"Data!${letter}${2}:${letter}${last_row + 1}"

    # ---------- ANALYSIS sheet (summary tables feed the charts) ---------- #
    ws_an = wb.add_worksheet("Analysis")
    ws_an.set_column(0, 0, 28)
    ws_an.set_column(1, 1, 16)
    an_row = 0
    chart_specs = []  # (title, chart_type, cat_range, val_range, fmt)
    for bd in (spec.get("breakdowns") or []):
        tbl = _breakdown_table(df, bd, warnings)
        if tbl is None or tbl.empty:
            continue
        dim_name, meas_name = tbl.columns[0], tbl.columns[1]
        ws_an.write(an_row, 0, bd.get("title") or f"{meas_name} by {dim_name}", f_section)
        an_row += 1
        ws_an.write(an_row, 0, dim_name, f_hdr)
        ws_an.write(an_row, 1, meas_name, f_hdr)
        header_row = an_row
        an_row += 1
        start = an_row
        fmt_code = _fmt_code(bd.get("format") or ("money" if "salary" in str(bd.get("field") or "").lower() else "int"), currency)
        valfmt = num_format(fmt_code)
        for _, r in tbl.iterrows():
            ws_an.write(an_row, 0, str(r[dim_name]), f_cell)
            ws_an.write_number(an_row, 1, float(r[meas_name]), valfmt)
            an_row += 1
        end = an_row - 1
        chart_specs.append({
            "title": bd.get("title") or f"{meas_name} by {dim_name}",
            "type": (bd.get("chart") or "column").lower(),
            "cats": f"=Analysis!$A${start + 1}:$A${end + 1}",
            "vals": f"=Analysis!$B${start + 1}:$B${end + 1}",
            "name": meas_name,
        })
        an_row += 2  # spacer

    # ---------- CORRELATION MATRIX sheet ---------- #
    # Pearson r across numeric columns with enough data and variation. Heat-map
    # styled so relationships read at a glance. Pairwise-complete (pandas .corr).
    extra_sheets = []
    corr_cols = [c for c in df.columns
                 if _is_number_series(df[c])
                 and df[c].notna().sum() >= max(3, int(0.3 * nrows))
                 and float(df[c].std(skipna=True) or 0) > 0]
    corr_cols = corr_cols[:12]  # keep the matrix legible
    ws_corr = wb.add_worksheet("Correlation")
    ws_corr.hide_gridlines(2)
    ws_corr.write(0, 0, "Correlation matrix (Pearson r)", f_section)
    if len(corr_cols) >= 2:
        cm = df[corr_cols].corr(method="pearson")
        corner = wb.add_format({**base_font, "font_size": 9, "bold": True, "bg_color": "#EEF3FB", "border": 1, "border_color": "#2B4A74"})
        ws_corr.write(1, 0, "", corner)
        for j, c in enumerate(corr_cols):
            ws_corr.write(1, j + 1, c, f_hdr)   # column headers
            ws_corr.write(j + 2, 0, c, f_hdr)   # row headers
        f_r = num_format("0.00")
        for i, ci in enumerate(corr_cols):
            for j, cj in enumerate(corr_cols):
                v = cm.iloc[i, j]
                ws_corr.write_number(i + 2, j + 1, 0.0 if pd.isna(v) else round(float(v), 3), f_r)
        # Diverging heat-map: red (−1) → white (0) → accent (+1).
        ws_corr.conditional_format(2, 1, len(corr_cols) + 1, len(corr_cols), {
            "type": "3_color_scale",
            "min_type": "num", "min_value": -1, "min_color": "#E5484D",
            "mid_type": "num", "mid_value": 0, "mid_color": "#FFFFFF",
            "max_type": "num", "max_value": 1, "max_color": accent,
        })
        ws_corr.set_column(0, 0, 18)
        ws_corr.set_column(1, len(corr_cols), 11)
        ws_corr.write(len(corr_cols) + 3, 0,
                      "r ranges −1…+1. Near ±1 = strong linear link; near 0 = weak. Correlation is not causation.", f_note)
        extra_sheets.append("Correlation")
    else:
        ws_corr.write(2, 0, "Not enough numeric columns with variation to compute correlations.", f_note)

    # ---------- PIVOT MATRIX sheet (cross-tab headcount) ---------- #
    # Row dimension × column dimension headcount, with Top-N capping and totals.
    def _cat_cols():
        out = []
        for c in df.columns:
            if _is_number_series(df[c]):
                continue
            k = df[c].astype(str).replace({"": "Unknown"}).nunique()
            if 1 < k <= 40:
                out.append((c, k))
        return out

    cats = _cat_cols()
    cat_names = [c for c, _ in cats]

    def _find_cat(keys):
        for c in cat_names:
            if any(k in c.lower() for k in keys):
                return c
        return None

    sel = spec.get("selector")
    row_dim = sel if sel in cat_names else (_find_cat(("department", "unit", "division")) or (cat_names[0] if cat_names else None))
    # Column dim: a *different* categorical, preferably gender; else smallest-cardinality other.
    col_dim = _find_cat(("gender", "sex"))
    if col_dim in (None, row_dim):
        others = sorted([(k, c) for c, k in cats if c != row_dim and k <= 12])
        col_dim = others[0][1] if others else None

    ws_piv = wb.add_worksheet("Pivot Matrix")
    ws_piv.hide_gridlines(2)
    if row_dim and col_dim and row_dim != col_dim:
        ws_piv.write(0, 0, f"Headcount: {row_dim} × {col_dim}", f_section)

        def _topn(series, n):
            series = series.astype(str).replace({"": "Unknown"})
            keep = list(series.value_counts().index[:n])
            return series.where(series.isin(keep), "Other")

        rseries = _topn(df[row_dim], 24)
        cseries = _topn(df[col_dim], 11)
        ct = pd.crosstab(rseries, cseries, margins=True, margins_name="Total")
        col_labels = list(ct.columns)
        row_labels = list(ct.index)

        f_corner = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "border": 1, "border_color": "#2B4A74", "align": "left", "valign": "vcenter"})
        f_tot_hdr = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": "#FFFFFF", "bg_color": accent, "border": 1, "border_color": "#2B4A74", "align": "center", "valign": "vcenter"})
        f_rowhdr = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": primary, "bg_color": "#EEF3FB", "border": 1, "border_color": "#E3EAF5"})
        f_tot_cell = wb.add_format({**base_font, "font_size": 10, "bold": True, "num_format": "#,##0", "bg_color": "#F1F6FD", "border": 1, "border_color": "#E3EAF5"})
        f_count = num_format("#,##0")

        hdr_r = 1
        ws_piv.write(hdr_r, 0, f"{row_dim} \\ {col_dim}", f_corner)
        for j, cl in enumerate(col_labels):
            ws_piv.write(hdr_r, j + 1, str(cl), f_tot_hdr if cl == "Total" else f_hdr)
        for i, rl in enumerate(row_labels):
            is_tot_row = (rl == "Total")
            ws_piv.write(hdr_r + 1 + i, 0, str(rl), f_corner if is_tot_row else f_rowhdr)
            for j, cl in enumerate(col_labels):
                val = int(ct.iloc[i, j])
                fmt = f_tot_cell if (is_tot_row or cl == "Total") else f_count
                ws_piv.write_number(hdr_r + 1 + i, j + 1, val, fmt)
        # Light single-hue scale over the inner counts (exclude the Total row/col).
        inner_rows, inner_cols = len(row_labels) - 1, len(col_labels) - 1
        if inner_rows >= 1 and inner_cols >= 1:
            ws_piv.conditional_format(hdr_r + 1, 1, hdr_r + inner_rows, inner_cols, {
                "type": "2_color_scale",
                "min_type": "min", "min_color": "#FFFFFF",
                "max_type": "max", "max_color": accent,
            })
        ws_piv.set_column(0, 0, max(16, min(30, len(str(row_dim)) + 10)))
        ws_piv.set_column(1, len(col_labels), 12)
        ws_piv.write(hdr_r + len(row_labels) + 2, 0,
                     "Counts are live from the Data sheet at generation time. Categories beyond the top are grouped as “Other”.", f_note)
        extra_sheets.append("Pivot Matrix")
    else:
        ws_piv.write(0, 0, "Pivot Matrix", f_section)
        ws_piv.write(2, 0, "Need two categorical columns (e.g. Department and Gender) to build a cross-tab.", f_note)

    # ---------- TRENDS sheet (activity per month + moving avg + projection) ---------- #
    date_col, dser = _detect_dates(df)
    if date_col is not None:
        per = dser.dt.to_period("M")
        vc = per.value_counts().sort_index()
        vc = vc[vc.index.notna()]
        if len(vc) >= 4:
            periods = [str(p) for p in vc.index]
            counts = [int(v) for v in vc.values]
            ma = pd.Series(counts).rolling(3, min_periods=1).mean().round(2).tolist()
            proj = _linreg_project(counts, 3)
            last = vc.index[-1]
            proj_periods = [str(last + i) for i in range(1, 4)]

            ws_tr = wb.add_worksheet("Trends")
            ws_tr.hide_gridlines(2)
            ws_tr.write(0, 0, f"Activity over time — by {date_col} (monthly)", f_section)
            hdr_r = 1
            for j, h in enumerate(["Period", "Count", "3-mo avg", "Projected"]):
                ws_tr.write(hdr_r, j, h, f_hdr)
            cnt_fmt = num_format("#,##0")
            ma_fmt = num_format("#,##0.0")
            proj_fmt = wb.add_format({**base_font, "font_size": 10, "num_format": "#,##0.0", "italic": True, "font_color": accent, "border": 1, "border_color": "#E3EAF5"})
            r = hdr_r + 1
            for i, p in enumerate(periods):
                ws_tr.write(r, 0, p, f_cell)
                ws_tr.write_number(r, 1, counts[i], cnt_fmt)
                ws_tr.write_number(r, 2, ma[i], ma_fmt)
                ws_tr.write_blank(r, 3, None, f_cell)
                r += 1
            proj_start = r
            for i, p in enumerate(proj_periods):
                ws_tr.write(r, 0, p, f_cell)
                ws_tr.write_blank(r, 1, None, f_cell)
                ws_tr.write_blank(r, 2, None, f_cell)
                ws_tr.write_number(r, 3, round(proj[i], 1), proj_fmt)
                r += 1
            data_end = hdr_r + len(periods)            # last historical row (0-based)
            all_end = r - 1
            # Line chart: Count + 3-mo avg over history, Projected tail.
            chart = wb.add_chart({"type": "line"})
            chart.add_series({"name": "Count", "categories": ["Trends", hdr_r + 1, 0, all_end, 0],
                              "values": ["Trends", hdr_r + 1, 1, data_end, 1],
                              "line": {"color": primary, "width": 1.75}})
            chart.add_series({"name": "3-mo avg", "categories": ["Trends", hdr_r + 1, 0, all_end, 0],
                              "values": ["Trends", hdr_r + 1, 2, data_end, 2],
                              "line": {"color": accent, "width": 1.5, "dash_type": "dash"}})
            chart.add_series({"name": "Projected", "categories": ["Trends", hdr_r + 1, 0, all_end, 0],
                              "values": ["Trends", proj_start, 3, all_end, 3],
                              "line": {"color": "#c77700", "width": 1.5, "dash_type": "round_dot"},
                              "marker": {"type": "circle", "size": 5}})
            chart.set_title({"name": f"Activity by {date_col}", "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
            chart.set_legend({"position": "bottom"})
            chart.set_x_axis({"num_font": {"name": "Arial", "size": 7, "rotation": -45}})
            chart.set_y_axis({"num_font": {"name": "Arial", "size": 8}})
            chart.set_size({"width": 640, "height": 320})
            ws_tr.insert_chart(hdr_r, 5, chart)
            ws_tr.set_column(0, 0, 12)
            ws_tr.set_column(1, 3, 11)
            ws_tr.write(all_end + 2, 0, "Projection = least-squares linear trend, 3 months ahead. A forecast, not a guarantee.", f_note)
            extra_sheets.append("Trends")

    # ---------- RETENTION sheet (hire cohorts → share still active) ---------- #
    status_col_name = None
    for c in df.columns:
        if "status" in c.lower():
            status_col_name = c
            break
    if date_col is not None and status_col_name is not None:
        active = ~df[status_col_name].astype(str).str.lower().isin(["terminated", "exited", "left", "resigned", "inactive"])
        cohort = dser.dt.year
        cdf = pd.DataFrame({"cohort": cohort, "active": active.astype(int)}).dropna(subset=["cohort"])
        grp = cdf.groupby("cohort")["active"].agg(["size", "sum"])
        grp = grp[grp["size"] >= 3]
        if len(grp) >= 2:
            ws_rt = wb.add_worksheet("Retention")
            ws_rt.hide_gridlines(2)
            ws_rt.write(0, 0, "Retention by hire cohort (share still active)", f_section)
            hdr_r = 1
            for j, h in enumerate(["Hire year", "Hires", "Still active", "Retention"]):
                ws_rt.write(hdr_r, j, h, f_hdr)
            int_fmt = num_format("#,##0")
            pct_fmt = num_format("0.0%")
            rows_written = 0
            r = hdr_r + 1
            retentions = []
            for yr, row in grp.iterrows():
                ret = float(row["sum"]) / float(row["size"]) if row["size"] else 0.0
                retentions.append(ret)
                ws_rt.write_number(r, 0, int(yr), num_format("0"))
                ws_rt.write_number(r, 1, int(row["size"]), int_fmt)
                ws_rt.write_number(r, 2, int(row["sum"]), int_fmt)
                ws_rt.write_number(r, 3, round(ret, 4), pct_fmt)
                r += 1
                rows_written += 1
            # Heat-map the retention column: red (low) → white → green (high).
            ws_rt.conditional_format(hdr_r + 1, 3, hdr_r + rows_written, 3, {
                "type": "3_color_scale",
                "min_type": "num", "min_value": 0, "min_color": "#E5484D",
                "mid_type": "num", "mid_value": 0.75, "mid_color": "#FFF8E6",
                "max_type": "num", "max_value": 1, "max_color": "#1f9d57",
            })
            # Column chart of retention by cohort.
            chart = wb.add_chart({"type": "column"})
            chart.add_series({"name": "Retention", "categories": ["Retention", hdr_r + 1, 0, hdr_r + rows_written, 0],
                              "values": ["Retention", hdr_r + 1, 3, hdr_r + rows_written, 3],
                              "fill": {"color": accent}, "gap": 60,
                              "data_labels": {"value": True, "num_format": "0%", "font": {"name": "Arial", "size": 8}}})
            chart.set_title({"name": "Retention-to-date by hire year", "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
            chart.set_legend({"position": "none"})
            chart.set_y_axis({"min": 0, "max": 1, "num_format": "0%", "num_font": {"name": "Arial", "size": 8}})
            chart.set_x_axis({"num_font": {"name": "Arial", "size": 8}})
            chart.set_size({"width": 520, "height": 300})
            ws_rt.insert_chart(hdr_r, 5, chart)
            ws_rt.set_column(0, 0, 11)
            ws_rt.set_column(1, 3, 13)
            ws_rt.write(hdr_r + rows_written + 2, 0, "“Retention” = share of each hire-year cohort still active now (snapshot), not a full survival curve.", f_note)
            extra_sheets.append("Retention")

    # ---------- DASHBOARD sheet ---------- #
    ws = wb.add_worksheet("Dashboard")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 2)
    for c in range(1, 13):
        ws.set_column(c, c, 13)
    # Title band (two stacked merged rows — no overlapping ranges)
    ws.merge_range(1, 1, 1, 12, title, wb.add_format({**base_font, "font_size": 20, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "valign": "vcenter"}))
    ws.merge_range(2, 1, 2, 12, subtitle, wb.add_format({**base_font, "font_size": 10, "font_color": "#DCE7F7", "bg_color": primary, "valign": "vcenter"}))
    ws.set_row(1, 30)
    ws.set_row(2, 18)

    # KPI cards (static, pandas-computed)
    kpis = spec.get("kpis") or [{"label": "Total Records", "agg": "count"}]
    kpi_row0 = 4
    col = 1
    span = 3  # each card spans 3 columns
    for i, kpi in enumerate(kpis[:4]):
        val = _kpi_value(df, kpi, warnings)
        fmt = (kpi.get("format") or ("pct" if kpi.get("agg") == "ratio" else "int")).lower()
        code = _fmt_code(fmt, currency)
        c0 = col + (i % 4) * span
        write_kpi(kpi_row0, c0, span, (kpi.get("label") or ""), code, value=val, num_color=primary)

    charts_added = 0
    # Interactive selector + dynamic KPIs
    sel_dim = spec.get("selector")
    dyn_row = kpi_row0 + 4
    if sel_dim and sel_dim in df.columns:
        values = ["(All)"] + sorted([str(v) for v in df[sel_dim].dropna().unique()])[:200]
        ws.write(dyn_row, 1, f"FILTER — {sel_dim}".upper(), f_sel_label)
        sel_cell_row, sel_cell_col = dyn_row, 2
        ws.write(sel_cell_row, sel_cell_col, "(All)", f_sel_val)
        ws.data_validation(sel_cell_row, sel_cell_col, sel_cell_row, sel_cell_col,
                           {"validate": "list", "source": values})
        sel_ref = f"${xl_col_to_name(sel_cell_col)}${sel_cell_row + 1}"
        ws.write(dyn_row, 4, "↳ Pick a value to update the cards below", f_note)

        dyn_cards_row = dyn_row + 2
        dkpis = [k for k in kpis if (k.get("agg") in ("count", "mean", "sum", "ratio"))][:4]
        selrange = col_range(sel_dim)
        for i, kpi in enumerate(dkpis):
            agg = kpi.get("agg")
            field = kpi.get("field")
            fmt = (kpi.get("format") or ("pct" if agg == "ratio" else "int")).lower()
            code = _fmt_code(fmt, currency)
            cached = _kpi_value(df, kpi, warnings)
            anchor = list(df.columns)[0]
            if agg == "count":
                formula = (f'=IF({sel_ref}="(All)",COUNTA({col_range(anchor)}),'
                           f'COUNTIF({selrange},{sel_ref}))')
            elif agg in ("mean", "sum") and field in df.columns:
                fn = "AVERAGE" if agg == "mean" else "SUM"
                fnifs = "AVERAGEIFS" if agg == "mean" else "SUMIFS"
                formula = (f'=IFERROR(IF({sel_ref}="(All)",{fn}({col_range(field)}),'
                           f'{fnifs}({col_range(field)},{selrange},{sel_ref})),0)')
            elif agg == "ratio" and field in df.columns:
                match = kpi.get("match")
                fr = col_range(field)
                formula = (f'=IFERROR(IF({sel_ref}="(All)",'
                           f'COUNTIF({fr},"{match}")/COUNTA({fr}),'
                           f'COUNTIFS({fr},"{match}",{selrange},{sel_ref})/COUNTIFS({selrange},{sel_ref})),0)')
            else:
                continue
            c0 = col + (i % 4) * span
            write_kpi(dyn_cards_row, c0, span, (kpi.get("label") or ""), code, formula=formula, cached=cached, num_color=accent)
        charts_start = dyn_cards_row + 5
    else:
        charts_start = dyn_row

    # Charts (native, interactive)
    ws.write(charts_start - 1, 1, "BREAKDOWNS", f_section)
    positions = [(charts_start, 1), (charts_start, 7), (charts_start + 16, 1), (charts_start + 16, 7)]
    palette = [accent, primary, "#1f9d57", "#c77700", "#7c5cdf", "#17a2b8", "#e5484d", "#0b6fd6"]
    for idx, cs in enumerate(chart_specs[:4]):
        ctype = cs["type"]
        chart = wb.add_chart({"type": "pie" if ctype == "pie" else ("bar" if ctype == "bar" else ("line" if ctype == "line" else "column"))})
        series = {
            "name": cs["name"],
            "categories": cs["cats"],
            "values": cs["vals"],
            "data_labels": {"value": True, "font": {"name": "Arial", "size": 8}},
        }
        if ctype == "pie":
            series["points"] = [{"fill": {"color": palette[i % len(palette)]}} for i in range(12)]
        else:
            series["fill"] = {"color": accent}
            series["gap"] = 80
        chart.add_series(series)
        chart.set_title({"name": cs["title"], "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
        chart.set_legend({"position": "bottom" if ctype == "pie" else "none"})
        chart.set_size({"width": 400, "height": 300})
        if ctype not in ("pie",):
            chart.set_x_axis({"num_font": {"name": "Arial", "size": 8}})
            chart.set_y_axis({"num_font": {"name": "Arial", "size": 8}})
        r, c = positions[idx]
        ws.insert_chart(r, c, chart)
        charts_added += 1

    # Footer note
    foot = charts_start + 33
    ws.write(foot, 1, "Figures computed from the source data. Charts and the filter are live — open in Excel to interact.", f_note)
    if warnings:
        ws.write(foot + 1, 1, "Notes: " + "; ".join(warnings[:6]), f_note)

    # ---------- AI INSIGHTS sheet (optional, from spec.narrative) ---------- #
    narr = spec.get("narrative") or {}
    has_narr = bool(narr) and any(narr.get(k) for k in ("headline", "summary", "findings", "risks", "recommendations"))
    if has_narr:
        wsx = wb.add_worksheet("AI Insights")
        wsx.hide_gridlines(2)
        wsx.set_column("A:A", 2)
        wsx.set_column("B:B", 112)
        f_h = wb.add_format({**base_font, "font_size": 16, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "valign": "vcenter"})
        f_sumtxt = wb.add_format({**base_font, "font_size": 11, "text_wrap": True, "valign": "top", "font_color": "#16233b"})
        f_sec = wb.add_format({**base_font, "font_size": 12, "bold": True, "font_color": primary})
        f_item = wb.add_format({**base_font, "font_size": 10, "text_wrap": True, "valign": "top", "font_color": "#16233b"})
        rr = [1]

        def _line(txt, fmt, height=None):
            wsx.write(rr[0], 1, txt, fmt)
            if height:
                wsx.set_row(rr[0], height)
            rr[0] += 1

        wsx.set_row(1, 30)
        _line(narr.get("headline") or "AI Analysis", f_h)
        rr[0] += 1
        if narr.get("summary"):
            _line(str(narr["summary"]), f_sumtxt, 70)
            rr[0] += 1

        def _section(title, items, render):
            items = items or []
            if not items:
                return
            _line(title, f_sec)
            for it in items:
                text = render(it)
                _line("•  " + text, f_item, max(18, min(90, 18 + int(len(text) / 95) * 15)))
            rr[0] += 1

        _section("Key findings", narr.get("findings"), lambda s: str(s))
        _section("Risks", narr.get("risks"),
                 lambda x: (f"{x.get('title', '')} — {x.get('detail', '')}".strip(" —") if isinstance(x, dict) else str(x)))
        _section("Recommendations", narr.get("recommendations"),
                 lambda x: (f"{x.get('action', '')} — {x.get('rationale', '')}".strip(" —") if isinstance(x, dict) else str(x)))
        _line("Generated by AI from this dashboard's figures. Review before acting on it.", f_note)

    ws.set_first_sheet()
    ws.activate()
    wb.close()

    return {
        "ok": True,
        "output": out_path,
        "sheets": ["Dashboard", "Data", "Analysis"] + extra_sheets + (["AI Insights"] if has_narr else []),
        "rows": int(nrows),
        "charts": charts_added,
        "warnings": warnings,
    }


def main():
    try:
        job = _read_job()
        result = build(job)
        sys.stdout.write(json.dumps(result))
    except Exception as e:  # noqa
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
