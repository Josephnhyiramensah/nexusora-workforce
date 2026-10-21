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
from xlsxwriter.utility import xl_col_to_name, xl_rowcol_to_cell


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

    # Selector decided up front: it drives the interactive dropdown AND makes the
    # breakdown charts + dynamic KPI cards recompute live when the user changes it.
    selector = spec.get("selector")
    if selector not in df.columns:
        selector = None

    # Period helper (YYYY-MM) for the "vs previous period" KPI deltas. Only added
    # when a real date column is present and spans >= 2 months; otherwise the cards
    # omit the delta line rather than invent a baseline.
    period_col = latest_period = prev_period = None
    _pcol, _pser = _detect_dates(df)
    if _pcol is not None:
        try:
            _per = _pser.dt.to_period("M").astype(str)
            df["Period"] = _per.where(_pser.notna(), other=None)
            _ups = sorted(p for p in df["Period"].dropna().unique())
            if len(_ups) >= 2:
                period_col, latest_period, prev_period = "Period", _ups[-1], _ups[-2]
        except Exception as e:  # noqa
            warnings.append(f"period: {e}")

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

    # Live-formula wiring. When a selector column exists, the breakdown values and
    # dynamic KPIs reference the dropdown cell (Dashboard!$D$5), so the cards and
    # charts recompute the instant the user changes the filter — no macros.
    SEL_LOCAL = "$D$5"            # dropdown cell, referenced from the Dashboard sheet
    SEL_FULL = "Dashboard!$D$5"   # same cell, referenced from the Analysis sheet
    sel_range = col_range(selector) if selector else None
    per_range = col_range(period_col) if period_col else None
    anchor_col = list(df.columns)[0]
    anchor_range = col_range(anchor_col)

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
        agg = (bd.get("agg") or "count").lower()
        by = bd.get("by")
        field = bd.get("field")
        dimR = col_range(by) if by in df.columns else None
        fldR = col_range(field) if (field in df.columns) else None
        fmt_code = _fmt_code(bd.get("format") or ("money" if "salary" in str(field or "").lower() else "int"), currency)
        valfmt = num_format(fmt_code)
        # Live when a selector exists and the agg is formula-expressible. The value
        # cell references its own label in column A ($A<row>), so no category text
        # is inlined (quote-safe) and the chart redraws when the dropdown changes.
        live = bool(selector) and dimR is not None and agg in ("count", "sum", "mean")
        for _, r in tbl.iterrows():
            lab = str(r[dim_name])
            sval = float(r[meas_name])
            excel_r = an_row + 1                      # 1-based Excel row of this line
            aref = f"$A${excel_r}"
            ws_an.write(an_row, 0, lab, f_cell)
            if live and lab != "Other":
                if agg == "count":
                    f = (f'=IF({SEL_FULL}="(All)",COUNTIF({dimR},{aref}),'
                         f'COUNTIFS({dimR},{aref},{sel_range},{SEL_FULL}))')
                elif agg == "sum":
                    f = (f'=IF({SEL_FULL}="(All)",SUMIFS({fldR},{dimR},{aref}),'
                         f'SUMIFS({fldR},{dimR},{aref},{sel_range},{SEL_FULL}))')
                else:  # mean
                    f = (f'=IF({SEL_FULL}="(All)",IFERROR(AVERAGEIFS({fldR},{dimR},{aref}),0),'
                         f'IFERROR(AVERAGEIFS({fldR},{dimR},{aref},{sel_range},{SEL_FULL}),0))')
                ws_an.write_formula(an_row, 1, f, valfmt, sval)
            elif live and lab == "Other" and agg in ("count", "sum"):
                # Residual = (total under the current filter) − (the shown rows above).
                shown = f"$B${start + 1}:$B${excel_r - 1}"
                if agg == "count":
                    f = (f'=IF({SEL_FULL}="(All)",COUNTA({anchor_range})-SUM({shown}),'
                         f'COUNTIF({sel_range},{SEL_FULL})-SUM({shown}))')
                else:
                    f = (f'=IF({SEL_FULL}="(All)",SUM({fldR})-SUM({shown}),'
                         f'SUMIFS({fldR},{sel_range},{SEL_FULL})-SUM({shown}))')
                ws_an.write_formula(an_row, 1, f, valfmt, sval)
            else:
                ws_an.write_number(an_row, 1, sval, valfmt)
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

    # ---- Phase 2 helper tables (also live, selector-driven) ----
    def _distinct(col, n):
        s = df[col].astype(object).where(df[col].notna(), "Unknown").astype(str)
        return [str(v) for v in s.value_counts().index[:n]]

    # (A) Stacked crosstab: by (axis) × stackBy (segments). Each cell references
    #     its row label ($A) and its column's segment header, so it's quote-safe
    #     and recomputes under the dropdown.
    stacked_specs = []
    for st in (spec.get("stacked") or []):
        by, stackBy = st.get("by"), st.get("stackBy")
        agg = (st.get("agg") or "count").lower()
        field = st.get("field")
        if by not in df.columns or stackBy not in df.columns:
            warnings.append(f"stacked '{st.get('title')}': missing by/stackBy")
            continue
        if agg in ("sum", "mean") and field not in df.columns:
            warnings.append(f"stacked '{st.get('title')}': missing field")
            continue
        byR, stR = col_range(by), col_range(stackBy)
        fR = col_range(field) if field in df.columns else None
        cats = _distinct(by, int(st.get("topBy") or 12))
        segs = _distinct(stackBy, int(st.get("topSeg") or 6))
        code = _fmt_code(st.get("format") or ("money" if agg == "sum" and fR else "int"), currency)
        vfmt = num_format(code)
        ws_an.write(an_row, 0, st.get("title") or f"{by} × {stackBy}", f_section)
        an_row += 1
        hdr = an_row
        ws_an.write(hdr, 0, by, f_hdr)
        for j, seg in enumerate(segs):
            ws_an.write(hdr, 1 + j, seg, f_hdr)
        an_row += 1
        ds = an_row
        for cat in cats:
            er = an_row + 1
            ws_an.write(an_row, 0, cat, f_cell)
            aref = f"$A${er}"
            sub = df[df[by].astype(str) == cat]
            for j, seg in enumerate(segs):
                colL = xl_col_to_name(1 + j)
                segref = f"{colL}${hdr + 1}"
                if agg == "count":
                    base = f'COUNTIFS({byR},{aref},{stR},{segref})'
                    filt = f'COUNTIFS({byR},{aref},{stR},{segref},{sel_range},{SEL_FULL})'
                    cached = float((sub[stackBy].astype(str) == seg).sum())
                elif agg == "sum":
                    base = f'SUMIFS({fR},{byR},{aref},{stR},{segref})'
                    filt = f'SUMIFS({fR},{byR},{aref},{stR},{segref},{sel_range},{SEL_FULL})'
                    cached = float(pd.to_numeric(sub[sub[stackBy].astype(str) == seg][field], errors="coerce").sum())
                else:
                    base = f'IFERROR(AVERAGEIFS({fR},{byR},{aref},{stR},{segref}),0)'
                    filt = f'IFERROR(AVERAGEIFS({fR},{byR},{aref},{stR},{segref},{sel_range},{SEL_FULL}),0)'
                    _s = pd.to_numeric(sub[sub[stackBy].astype(str) == seg][field], errors="coerce")
                    cached = float(_s.mean()) if _s.notna().any() else 0.0
                f = f'=IF({SEL_FULL}="(All)",{base},{filt})' if selector else f'={base}'
                ws_an.write_formula(an_row, 1 + j, f, vfmt, cached)
            an_row += 1
        de = an_row - 1
        series = []
        for j, seg in enumerate(segs):
            colL = xl_col_to_name(1 + j)
            series.append({
                "name": f"=Analysis!${colL}${hdr + 1}",
                "cats": f"=Analysis!$A${ds + 1}:$A${de + 1}",
                "vals": f"=Analysis!${colL}${ds + 1}:${colL}${de + 1}",
            })
        stacked_specs.append({"title": st.get("title") or f"{by} × {stackBy}",
                              "orient": (st.get("chart") or "column"), "series": series})
        an_row += 2

    # (B) Dual-axis combo trend over periods: total (column, primary) + per-unit
    #     mean (line, secondary). Needs a period column; reacts to the dropdown.
    combo_spec = None
    cb = spec.get("combo") or {}
    if cb and period_col and (cb.get("field") in df.columns):
        field = cb.get("field")
        fR = col_range(field)
        pers = sorted(p for p in df[period_col].dropna().unique())[-12:]
        code = _fmt_code(cb.get("format") or "money", currency)
        mfmt = num_format(code)
        ws_an.write(an_row, 0, cb.get("title") or f"{field} trend", f_section)
        an_row += 1
        hrow = an_row
        ws_an.write(hrow, 0, "Period", f_hdr)
        ws_an.write(hrow, 1, cb.get("sumLabel") or f"Total {field}", f_hdr)
        ws_an.write(hrow, 2, cb.get("avgLabel") or f"Per employee", f_hdr)
        an_row += 1
        ds = an_row
        for p in pers:
            er = an_row + 1
            ws_an.write(an_row, 0, p, f_cell)
            aref = f"$A${er}"
            sub = df[df[period_col] == p]
            s = pd.to_numeric(sub[field], errors="coerce")
            cS = float(s.sum())
            cA = float(s.mean()) if s.notna().any() else 0.0
            bsum, fsum = f'SUMIFS({fR},{per_range},{aref})', f'SUMIFS({fR},{per_range},{aref},{sel_range},{SEL_FULL})'
            bavg = f'IFERROR(AVERAGEIFS({fR},{per_range},{aref}),0)'
            favg = f'IFERROR(AVERAGEIFS({fR},{per_range},{aref},{sel_range},{SEL_FULL}),0)'
            fS = f'=IF({SEL_FULL}="(All)",{bsum},{fsum})' if selector else f'={bsum}'
            fA = f'=IF({SEL_FULL}="(All)",{bavg},{favg})' if selector else f'={bavg}'
            ws_an.write_formula(an_row, 1, fS, mfmt, cS)
            ws_an.write_formula(an_row, 2, fA, mfmt, cA)
            an_row += 1
        de = an_row - 1
        combo_spec = {
            "title": cb.get("title") or f"{field} trend",
            "cats": f"=Analysis!$A${ds + 1}:$A${de + 1}",
            "sum_vals": f"=Analysis!$B${ds + 1}:$B${de + 1}", "sum_name": f"=Analysis!$B${hrow + 1}",
            "avg_vals": f"=Analysis!$C${ds + 1}:$C${de + 1}", "avg_name": f"=Analysis!$C${hrow + 1}",
        }
        an_row += 2

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
        ws.set_column(c, c, 11)
    charts_added = 0

    # Title band (two stacked merged rows — no overlapping ranges)
    ws.merge_range(1, 1, 1, 12, title, wb.add_format({**base_font, "font_size": 20, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "valign": "vcenter", "indent": 1}))
    ws.merge_range(2, 1, 2, 12, subtitle, wb.add_format({**base_font, "font_size": 10, "font_color": "#DCE7F7", "bg_color": primary, "valign": "vcenter", "indent": 1}))
    ws.set_row(1, 34)
    ws.set_row(2, 18)

    # ---- Slicer (interactive dropdown at D5 = SEL cell) ----
    SLICER_ROW = 4
    if selector:
        f_sl_lab = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#FFFFFF", "bg_color": accent, "align": "center", "valign": "vcenter"})
        f_sl_val = wb.add_format({**base_font, "font_size": 11, "bold": True, "font_color": primary, "bg_color": "#FFF8E6", "border": 1, "border_color": "#FFD98A", "align": "center", "valign": "vcenter"})
        ws.merge_range(SLICER_ROW, 1, SLICER_ROW, 2, f"FILTER — {selector}".upper(), f_sl_lab)
        ws.merge_range(SLICER_ROW, 3, SLICER_ROW, 4, "(All)", f_sl_val)      # D5:E5, top-left D5 == SEL_LOCAL
        values = ["(All)"] + sorted(str(v) for v in df[selector].dropna().unique())[:200]
        ws.data_validation(SLICER_ROW, 3, SLICER_ROW, 3, {"validate": "list", "source": values})
        ws.write(SLICER_ROW, 5, "↳ pick a value — the cards and charts update live", f_note)
        ws.set_row(SLICER_ROW, 22)

    # ---- KPI cards: big number (live) + vs-previous delta (▲/▼ %) ----
    kpis = (spec.get("kpis") or [{"label": "Total Records", "agg": "count"}])[:4]
    KPI_LAB, KPI_VAL, KPI_DLT = 6, 7, 8
    span = 3
    delta_code = '[Green]▲ 0.0%;[Red]▼ 0.0%;0.0%'
    f_k_lab = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#5B6B86", "bg_color": CARD_BG, "align": "left", "valign": "vcenter", "indent": 1})

    def _kpi_value_formula(kpi):
        """Big-number formula that reacts to the dropdown, or None (→ static)."""
        if not selector:
            return None
        agg = (kpi.get("agg") or "count").lower()
        field = kpi.get("field")
        fR = col_range(field) if field in df.columns else None
        if agg == "count":
            return f'=IF({SEL_LOCAL}="(All)",COUNTA({anchor_range}),COUNTIF({sel_range},{SEL_LOCAL}))'
        if agg in ("sum", "mean") and fR:
            fn, fns = ("SUM", "SUMIFS") if agg == "sum" else ("AVERAGE", "AVERAGEIFS")
            return f'=IFERROR(IF({SEL_LOCAL}="(All)",{fn}({fR}),{fns}({fR},{sel_range},{SEL_LOCAL})),0)'
        if agg == "ratio" and fR:
            m = kpi.get("match")
            return (f'=IFERROR(IF({SEL_LOCAL}="(All)",COUNTIF({fR},"{m}")/COUNTA({fR}),'
                    f'COUNTIFS({fR},"{m}",{sel_range},{SEL_LOCAL})/COUNTIFS({sel_range},{SEL_LOCAL})),0)')
        return None

    def _kpi_period_exprs(kpi):
        """(current, previous) period sub-expressions for the delta, or None.
        Reacts to the dropdown too when a selector exists."""
        if not period_col:
            return None
        agg = (kpi.get("agg") or "count").lower()
        if agg not in ("count", "sum", "mean"):
            return None
        field = kpi.get("field")
        fR = col_range(field) if field in df.columns else None
        if agg in ("sum", "mean") and not fR:
            return None

        def expr(pv):
            if agg == "count":
                base = f'COUNTIF({per_range},"{pv}")'
                filt = f'COUNTIFS({per_range},"{pv}",{sel_range},{SEL_LOCAL})'
            elif agg == "sum":
                base = f'SUMIFS({fR},{per_range},"{pv}")'
                filt = f'SUMIFS({fR},{per_range},"{pv}",{sel_range},{SEL_LOCAL})'
            else:  # mean
                base = f'IFERROR(AVERAGEIFS({fR},{per_range},"{pv}"),0)'
                filt = f'IFERROR(AVERAGEIFS({fR},{per_range},"{pv}",{sel_range},{SEL_LOCAL}),0)'
            return f'IF({SEL_LOCAL}="(All)",{base},{filt})' if selector else base

        return expr(latest_period), expr(prev_period)

    def _period_scalar(kpi, pv):
        """Full-data (All) value of a KPI within one period — the cached value so
        the delta shows correctly before Excel/LibreOffice recalculates."""
        agg = (kpi.get("agg") or "count").lower()
        field = kpi.get("field")
        sub = df[df[period_col] == pv]
        if agg == "count":
            return float(len(sub))
        if field in df.columns:
            s = pd.to_numeric(sub[field], errors="coerce")
            if agg == "sum":
                return float(s.sum())
            if agg == "mean":
                return float(s.mean()) if s.notna().any() else 0.0
        return 0.0

    for i, kpi in enumerate(kpis):
        c0 = 1 + (i % 4) * span
        label = (kpi.get("label") or "").upper()
        agg = (kpi.get("agg") or "count").lower()
        fmt = (kpi.get("format") or ("pct" if agg == "ratio" else "int")).lower()
        code = _fmt_code(fmt, currency)
        cached = _kpi_value(df, kpi, warnings)
        val_fmt = wb.add_format({**base_font, "font_size": 18, "bold": True, "font_color": primary, "num_format": code, "bg_color": CARD_BG, "align": "left", "valign": "vcenter", "indent": 1})
        # Label + value merged across the whole card, so money never renders as ###.
        ws.merge_range(KPI_LAB, c0, KPI_LAB, c0 + span - 1, label, f_k_lab)
        ws.merge_range(KPI_VAL, c0, KPI_VAL, c0 + span - 1, "", val_fmt)
        vf = _kpi_value_formula(kpi)
        if vf:
            ws.write_formula(KPI_VAL, c0, vf, val_fmt, cached)
        else:
            ws.write_number(KPI_VAL, c0, cached, val_fmt)
        # Delta row: "vs prev N" (left) + colored ▲/▼ % (right), both live.
        ex = _kpi_period_exprs(kpi)
        if ex:
            cur, prev = ex
            cur_c = _period_scalar(kpi, latest_period)
            prev_c = _period_scalar(kpi, prev_period)
            delta_c = (cur_c - prev_c) / prev_c if prev_c else 0.0
            prev_txt = f"vs prev {prev_c:,.1f}" if fmt == "float" else f"vs prev {prev_c:,.0f}"
            # The money format code embeds quotes (e.g. "$"#,##0); double them so
            # they survive as a string literal inside TEXT(...) — otherwise the
            # inner quotes close the formula string early (Excel #VALUE / LO Err:508).
            code_esc = code.replace('"', '""')
            prev_fmt = wb.add_format({**base_font, "font_size": 8, "font_color": "#8B96A9", "bg_color": CARD_BG, "align": "left", "valign": "vcenter", "indent": 1})
            dlt_fmt = wb.add_format({**base_font, "font_size": 9, "bold": True, "num_format": delta_code, "bg_color": CARD_BG, "align": "right", "valign": "vcenter"})
            ws.merge_range(KPI_DLT, c0, KPI_DLT, c0 + span - 2, "", prev_fmt)
            ws.write_formula(KPI_DLT, c0, f'="vs prev "&TEXT({prev},"{code_esc}")', prev_fmt, prev_txt)
            ws.write_formula(KPI_DLT, c0 + span - 1, f'=IFERROR(({cur}-{prev})/{prev},0)', dlt_fmt, delta_c)
        else:
            ws.merge_range(KPI_DLT, c0, KPI_DLT, c0 + span - 1, "", wb.add_format({"bg_color": CARD_BG}))
    ws.set_row(KPI_VAL, 28)
    ws.set_row(KPI_DLT, 15)

    # ---- Tiles: native interactive charts + a conditional-format table, all
    #      sourced from the selector-driven Analysis ranges so they move together. ----
    charts_start = KPI_DLT + 2
    ws.write(charts_start, 1, "BREAKDOWNS", f_section)
    palette = [accent, primary, "#1f9d57", "#c77700", "#7c5cdf", "#17a2b8", "#e5484d", "#0b6fd6"]
    TILE_W, TILE_H = 6, 16          # 2 tiles per 12-column row
    tile_row0 = charts_start + 1

    # Assemble tiles in a display order so the canvas reads like a BI board.
    prio = {"pie": 0, "combo": 1, "stacked": 2, "column": 3, "bar": 4, "line": 5, "table": 6}
    tiles = []
    if combo_spec:
        tiles.append((prio["combo"], "combo", combo_spec))
    for cs in chart_specs:
        tiles.append((prio.get(cs["type"], 3), "chart", cs))
    for ss in stacked_specs:
        tiles.append((prio["stacked"], "stacked", ss))
    stt = spec.get("statusTable") or {}
    if stt and stt.get("by") in df.columns and stt.get("field") in df.columns:
        tiles.append((prio["table"], "table", stt))
    tiles.sort(key=lambda t: t[0])

    def _place(i):
        return tile_row0 + (i // 2) * TILE_H, 1 + (i % 2) * TILE_W

    def _axes(ch):
        ch.set_x_axis({"num_font": {"name": "Arial", "size": 8}})
        ch.set_y_axis({"num_font": {"name": "Arial", "size": 8}})

    def _render_status_table(r0, c0, stt):
        by, field = stt["by"], stt["field"]
        byR, fR = col_range(by), col_range(field)
        top = int(stt.get("top") or 6)
        g = df.copy()
        g[field] = pd.to_numeric(g[field], errors="coerce")
        order = g.groupby(by)[field].sum().sort_values(ascending=False)
        cats = [str(x) for x in order.index[:top]]
        code = _fmt_code(stt.get("format") or "money", currency)
        hL = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "border": 1, "border_color": "#2B4A74", "align": "left", "valign": "vcenter"})
        hR = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "border": 1, "border_color": "#2B4A74", "align": "right", "valign": "vcenter"})
        labf = wb.add_format({**base_font, "font_size": 10, "border": 1, "border_color": "#E3EAF5"})
        totf = wb.add_format({**base_font, "font_size": 10, "num_format": code, "border": 1, "border_color": "#E3EAF5", "align": "right"})
        avgf = wb.add_format({**base_font, "font_size": 10, "num_format": code, "border": 1, "border_color": "#E3EAF5", "align": "right"})
        ws.write(r0, c0, stt.get("title") or f"{field} by {by}", f_section)
        hr = r0 + 1
        ws.merge_range(hr, c0, hr, c0 + 2, by, hL)
        ws.merge_range(hr, c0 + 3, hr, c0 + 4, stt.get("sumLabel") or f"Total {field}", hR)
        ws.write(hr, c0 + 5, stt.get("avgLabel") or "Per emp", hR)
        rr = hr + 1
        first = rr
        for cat in cats:
            subtot = float(order.get(cat, 0.0))
            subm = g[g[by].astype(str) == cat][field]
            cavg = float(subm.mean()) if subm.notna().any() else 0.0
            labref = xl_rowcol_to_cell(rr, c0)                 # the label cell, e.g. "H23"
            if selector:
                ftot = f'=IF({SEL_LOCAL}="(All)",SUMIFS({fR},{byR},{labref}),SUMIFS({fR},{byR},{labref},{sel_range},{SEL_LOCAL}))'
                favg = f'=IF({SEL_LOCAL}="(All)",IFERROR(AVERAGEIFS({fR},{byR},{labref}),0),IFERROR(AVERAGEIFS({fR},{byR},{labref},{sel_range},{SEL_LOCAL}),0))'
            else:
                ftot = f'=SUMIFS({fR},{byR},{labref})'
                favg = f'=IFERROR(AVERAGEIFS({fR},{byR},{labref}),0)'
            ws.merge_range(rr, c0, rr, c0 + 2, cat, labf)
            ws.merge_range(rr, c0 + 3, rr, c0 + 4, "", totf)
            ws.write_formula(rr, c0 + 3, ftot, totf, subtot)
            ws.write_formula(rr, c0 + 5, favg, avgf, cavg)
            rr += 1
        if rr - 1 >= first:
            ws.conditional_format(first, c0 + 5, rr - 1, c0 + 5, {"type": "icon_set", "icon_style": "3_traffic_lights"})

    for idx, (_, kind, spc) in enumerate(tiles):
        r, c = _place(idx)
        if kind == "chart":
            ctype = spc["type"]
            xtype = "doughnut" if ctype == "pie" else ("bar" if ctype == "bar" else ("line" if ctype == "line" else "column"))
            chart = wb.add_chart({"type": xtype})
            series = {"name": spc["name"], "categories": spc["cats"], "values": spc["vals"],
                      "data_labels": {"value": True, "font": {"name": "Arial", "size": 8}}}
            if xtype == "doughnut":
                series["points"] = [{"fill": {"color": palette[i % len(palette)]}} for i in range(16)]
            else:
                series["fill"] = {"color": accent}
                series["gap"] = 70
            chart.add_series(series)
            chart.set_title({"name": spc["title"], "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
            chart.set_legend({"position": "bottom" if xtype == "doughnut" else "none"})
            chart.set_size({"width": 430, "height": 300})
            if xtype == "doughnut":
                chart.set_hole_size(55)
            else:
                _axes(chart)
            ws.insert_chart(r, c, chart)
            charts_added += 1
        elif kind == "stacked":
            orient = "bar" if spc.get("orient") == "bar" else "column"
            chart = wb.add_chart({"type": orient, "subtype": "stacked"})
            for k, s in enumerate(spc["series"]):
                chart.add_series({"name": s["name"], "categories": s["cats"], "values": s["vals"],
                                  "fill": {"color": palette[k % len(palette)]}, "gap": 60})
            chart.set_title({"name": spc["title"], "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
            chart.set_legend({"position": "bottom"})
            chart.set_size({"width": 430, "height": 300})
            _axes(chart)
            ws.insert_chart(r, c, chart)
            charts_added += 1
        elif kind == "combo":
            colc = wb.add_chart({"type": "column"})
            colc.add_series({"name": spc["sum_name"], "categories": spc["cats"], "values": spc["sum_vals"],
                             "fill": {"color": accent}, "gap": 50})
            linec = wb.add_chart({"type": "line"})
            linec.add_series({"name": spc["avg_name"], "categories": spc["cats"], "values": spc["avg_vals"],
                              "y2_axis": True, "line": {"color": primary, "width": 2.0},
                              "marker": {"type": "circle", "size": 5, "fill": {"color": primary}}})
            colc.combine(linec)
            colc.set_title({"name": spc["title"], "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
            colc.set_legend({"position": "bottom"})
            colc.set_size({"width": 430, "height": 300})
            colc.set_x_axis({"num_font": {"name": "Arial", "size": 7, "rotation": -45}})
            colc.set_y_axis({"num_font": {"name": "Arial", "size": 8}})
            colc.set_y2_axis({"num_font": {"name": "Arial", "size": 8}})
            ws.insert_chart(r, c, colc)
            charts_added += 1
        elif kind == "table":
            _render_status_table(r, c, spc)

    tile_rows = (len(tiles) + 1) // 2

    # Footer note
    foot = tile_row0 + max(1, tile_rows) * TILE_H
    ws.write(foot, 1, "Figures are computed from the source data. The dropdown, cards and charts are live — open in Excel and change the filter.", f_note)
    if warnings:
        ws.write(foot + 1, 1, "Notes: " + "; ".join(warnings[:6]), f_note)

    # Single-canvas print / PDF: landscape, scaled to one page.
    ws.set_landscape()
    ws.set_paper(8)          # A3 gives the tiled grid room before fit-to-1-page scales it
    ws.fit_to_pages(1, 1)
    ws.set_margins(0.2, 0.2, 0.2, 0.2)
    ws.print_area(0, 0, foot + 2, 12)

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
