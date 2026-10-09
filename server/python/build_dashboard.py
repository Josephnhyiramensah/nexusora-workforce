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
        "sheets": ["Dashboard", "Data", "Analysis"] + (["AI Insights"] if has_narr else []),
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
