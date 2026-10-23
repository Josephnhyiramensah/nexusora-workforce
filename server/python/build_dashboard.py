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

# Last row of an Excel worksheet. Live formulas reference each data column down
# to this row (from row 2) so added/edited/deleted rows recompute automatically.
MAX_DATA_ROW = 1048576


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


def _glyph_png(name, color, px=96):
    """Draw a small, crisp KPI-card glyph as an in-memory PNG, tinted to `color`.

    Best-effort: needs Pillow. If Pillow is missing (or drawing fails) we return
    None and the caller simply omits the icon — the card still renders fully.
    Supersampled ×4 then downscaled for clean anti-aliased edges.
    """
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    try:
        import io as _io
        S = 4
        W = px * S
        img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        c = color.lstrip("#")
        rgb = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
        fill = rgb + (255,)
        soft = rgb + (70,)
        lw = max(2, int(W * 0.06))

        def circle(cx, cy, r, f):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=f)

        if name == "people":
            # two overlapping person silhouettes (headcount)
            for dx, a in ((-0.17, soft), (0.17, fill)):
                hx = W * (0.5 + dx)
                circle(hx, W * 0.34, W * 0.14, a)
                d.pieslice([hx - W * 0.22, W * 0.46, hx + W * 0.22, W * 0.86], 180, 360, fill=a)
        elif name == "money":
            # coin with a currency tick (salary / payroll)
            circle(W * 0.5, W * 0.5, W * 0.36, soft)
            d.ellipse([W * 0.5 - W * 0.36, W * 0.5 - W * 0.36, W * 0.5 + W * 0.36, W * 0.5 + W * 0.36],
                      outline=fill, width=lw)
            d.line([(W * 0.5, W * 0.26), (W * 0.5, W * 0.74)], fill=fill, width=lw)
            d.arc([W * 0.36, W * 0.30, W * 0.64, W * 0.52], 20, 200, fill=fill, width=lw)
            d.arc([W * 0.36, W * 0.48, W * 0.64, W * 0.70], 200, 380, fill=fill, width=lw)
        elif name == "percent":
            # percent sign (ratio / attrition)
            r = W * 0.11
            circle(W * 0.33, W * 0.33, r, fill)
            circle(W * 0.67, W * 0.67, r, fill)
            d.line([(W * 0.72, W * 0.26), (W * 0.28, W * 0.74)], fill=fill, width=lw)
        elif name == "grid":
            # 2×2 tiles (distinct categories)
            g = W * 0.08
            s = (W - 3 * g - 2 * (W * 0.16)) / 1  # not used; explicit boxes below
            boxes = [(0.20, 0.20), (0.52, 0.20), (0.20, 0.52), (0.52, 0.52)]
            for i, (bx, by) in enumerate(boxes):
                d.rounded_rectangle([W * bx, W * by, W * (bx + 0.28), W * (by + 0.28)],
                                    radius=W * 0.04, fill=(fill if i in (0, 3) else soft))
        else:  # "trend" — upward line + arrow
            pts = [(W * 0.18, W * 0.70), (W * 0.40, W * 0.52), (W * 0.58, W * 0.60), (W * 0.82, W * 0.30)]
            d.line(pts, fill=fill, width=lw, joint="curve")
            d.polygon([(W * 0.82, W * 0.30), (W * 0.70, W * 0.30), (W * 0.82, W * 0.42)], fill=fill)

        img = img.resize((px, px), Image.LANCZOS)
        buf = _io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        return buf
    except Exception:
        return None


def _icon_for_kpi(kpi):
    """Pick a glyph name for a KPI card: explicit `icon`, else inferred."""
    ic = (kpi.get("icon") or "").strip().lower()
    if ic in ("people", "money", "percent", "grid", "trend"):
        return ic
    agg = (kpi.get("agg") or "count").lower()
    fmt = (kpi.get("format") or "").lower()
    if agg == "ratio" or fmt == "pct":
        return "percent"
    if fmt in ("money", "money2") or any(k in str(kpi.get("label", "")).lower()
                                         for k in ("salary", "pay", "cost", "payroll", "wage")):
        return "money"
    if agg == "distinct":
        return "grid"
    if agg in ("sum", "mean"):
        return "trend"
    return "people"


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

    # Slicers: one or more dropdown dimensions, AND-combined so they compose. The
    # multi-slicer form is `selectors`; a single `selector` is still accepted.
    slicer_cols = spec.get("selectors")
    if not isinstance(slicer_cols, list):
        slicer_cols = [spec.get("selector")] if spec.get("selector") else []
    seen = set()
    slicer_cols = [c for c in slicer_cols if c in df.columns and not (c in seen or seen.add(c))][:4]
    selector = slicer_cols[0] if slicer_cols else None   # legacy single-selector alias

    # Period (YYYY-MM) for vs-previous deltas + the combo trend, and a real Date
    # column (Excel date serials) so the From/To date-range filter compares
    # numerically. Both only when a parseable date column exists.
    period_col = latest_period = prev_period = None
    date_real_col = date_min = date_max = None
    _pcol, _pser = _detect_dates(df)
    src_date_col = _pcol          # the user's own date column that Period/Date derive from
    if _pcol is not None:
        try:
            _per = _pser.dt.to_period("M").astype(str)
            df["Period"] = _per.where(_pser.notna(), other=None)
            _ups = sorted(p for p in df["Period"].dropna().unique())
            if len(_ups) >= 2:
                period_col, latest_period, prev_period = "Period", _ups[-1], _ups[-2]
            df["Date"] = _pser.dt.date.where(_pser.notna(), other=None)
            _valid = _pser.dropna()
            if len(_valid):
                date_real_col = "Date"
                date_min, date_max = _valid.min().date(), _valid.max().date()
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

    # ---------- ONE VISIBLE SHEET: create it up front ---------- #
    # The whole board — filter panel, KPIs, gauges, charts AND the editable data
    # table — lives on a single "Dashboard" sheet, matching the client's sample
    # boards. Helper aggregation tables sit on a veryHidden "Analysis" sheet the
    # user never sees. The editable table is placed below the canvas at DATA_R0,
    # computed from an upper bound of the tile count so it can never overlap the
    # charts (a shorter canvas just leaves a small gap).
    ws = wb.add_worksheet("Dashboard")
    ws.hide_gridlines(2)
    ws.set_column("A:A", 2)
    ncols = len(df.columns)
    nrows = len(df)
    for _c in range(1, max(18, ncols + 2)):   # cols B..R cover the left panel + content band
        ws.set_column(_c, _c, 14)
    ws_tr = ws_rt = None   # optional deep-dive sheets (hidden if built)

    _n_tiles = (len(spec.get("breakdowns") or []) + len(spec.get("stacked") or [])
                + (1 if spec.get("combo") else 0) + (1 if spec.get("funnel") else 0)
                + (1 if spec.get("pyramid") else 0) + (1 if spec.get("statusTable") else 0))
    _tile_rows = max(1, -(-_n_tiles // 2))
    _gauge_band = 13 if spec.get("gauges") else 0
    _charts_start_est = 8 + 2 + _gauge_band           # KPI_DLT(8) + 2 + gauge band
    DATA_C0 = 1                                        # data starts at column B (A is the margin)
    DATA_R0 = (_charts_start_est + 1) + _tile_rows * 16 + 6   # 0-based header row of the editable table
    DATA_BODY = DATA_R0 + 2                            # 1-based Excel row where data values begin

    # ---------- EDITABLE DATA TABLE (same sheet, below the canvas) ---------- #
    ws_data = ws
    date_cell_fmt = wb.add_format({**base_font, "font_size": 10, "num_format": "yyyy-mm-dd", "border": 1, "border_color": "#E3EAF5"})

    # The engine-derived Period/Date columns are needed by the date filter, the
    # combo trend and the period deltas, but they are internal — the user never
    # edits them. Keep them OFF the visible table, in hidden helper columns to the
    # far right (beyond the canvas), written as formulas that read each row's own
    # source date cell so they stay aligned even after the user sorts or deletes
    # rows. Everything else — the user's real columns and any category buckets —
    # stays in the visible table.
    HELPER_C0 = 22
    helper_cols = [c for c in ("Date", "Period") if c in df.columns]
    display_cols = [c for c in df.columns if c not in helper_cols]

    def _col_meta(col):
        s = df[col]
        if _is_number_series(s):
            looks_money = any(k in col.lower() for k in ("salary", "pay", "wage", "amount", "cost", "net", "gross"))
            return _fmt_code("money", currency) if looks_money else _fmt_code("float" if s.dropna().mod(1).any() else "int", currency)
        return None

    # Section banner just above the table.
    f_data_h = wb.add_format({**base_font, "font_size": 12, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "valign": "vcenter", "indent": 1})
    ws.merge_range(DATA_R0 - 2, 1, DATA_R0 - 2, max(2, min(len(display_cols), 12)),
                   "YOUR DATA  —  edit cells, add rows at the bottom, or delete rows; the dashboard above updates live", f_data_h)
    ws.set_row(DATA_R0 - 2, 22)

    # Visible table body (display columns only). add_table writes the header row.
    table_cols = [{"header": str(c), "header_format": f_hdr} for c in display_cols]
    for di, col in enumerate(display_cols):
        cc = DATA_C0 + di
        code = _col_meta(col)
        src_i = list(df.columns).index(col)
        for ri in range(nrows):
            v = df.iat[ri, src_i]
            rr = DATA_R0 + 1 + ri
            if pd.isna(v):
                ws_data.write_blank(rr, cc, None, f_cell)
            elif code:
                ws_data.write_number(rr, cc, float(v), num_format(code))
            else:
                ws_data.write(rr, cc, (v.item() if hasattr(v, "item") else v), f_cell)
    last_row = max(1, nrows)
    ws_data.add_table(DATA_R0, DATA_C0, DATA_R0 + last_row, DATA_C0 + len(display_cols) - 1,
                      {"columns": table_cols, "name": "DataTbl", "style": "Table Style Medium 2",
                       "autofilter": True, "header_row": True})

    # Hidden helper columns: Date (= DATEVALUE of the source date cell) and Period
    # (= its YYYY-MM). Formulas reference the same physical row, with a buffer of
    # extra rows so rows the user adds still derive a Date/Period.
    if helper_cols and src_date_col in display_cols:
        hd_letter = xl_col_to_name(DATA_C0 + display_cols.index(src_date_col))
        d_idx = df.columns.get_loc("Date") if "Date" in df.columns else None
        p_idx = df.columns.get_loc("Period") if "Period" in df.columns else None
        buf = 500
        for hi, name in enumerate(helper_cols):
            hc = HELPER_C0 + hi
            ws.set_column(hc, hc, 12, None, {"hidden": True})
        for ri in range(nrows + buf):
            rr = DATA_R0 + 1 + ri
            src_cell = f"${hd_letter}${rr + 1}"
            if "Date" in helper_cols:
                dc = HELPER_C0 + helper_cols.index("Date")
                cached = None
                if ri < nrows and d_idx is not None:
                    v = df.iat[ri, d_idx]
                    cached = None if pd.isna(v) else float((v - dt.date(1899, 12, 30)).days)
                ws.write_formula(rr, dc, f'=IFERROR(DATEVALUE({src_cell}),"")', date_cell_fmt, cached if cached is not None else "")
            if "Period" in helper_cols:
                pc = HELPER_C0 + helper_cols.index("Period")
                d_ref = f"${xl_col_to_name(HELPER_C0 + helper_cols.index('Date'))}${rr + 1}" if "Date" in helper_cols else src_cell
                cached = ""
                if ri < nrows and p_idx is not None:
                    pv = df.iat[ri, p_idx]
                    cached = "" if pd.isna(pv) else str(pv)
                ws.write_formula(rr, pc, f'=IF({d_ref}="","",TEXT({d_ref},"yyyy-mm"))', None, cached)

    def col_range(col):
        """Auto-expanding A1 range for a column, e.g. Dashboard!$C$96:$C$1048576.
        Real columns live in the visible table; Date/Period live in the hidden
        helper columns. The range starts at the table's first body row (so no
        header is caught) and runs to the last Excel row, so rows the user ADDS,
        EDITS or DELETES recompute the whole board live."""
        if col in helper_cols:
            letter = xl_col_to_name(HELPER_C0 + helper_cols.index(col))
        else:
            letter = xl_col_to_name(DATA_C0 + display_cols.index(col))
        return f"Dashboard!${letter}${DATA_BODY}:${letter}${MAX_DATA_ROW}"

    per_range = col_range(period_col) if period_col else None

    # Live-formula wiring. Every slicer dropdown and the From/To date cells live on
    # the Dashboard sheet at fixed addresses; each live formula AND-combines them as
    # COUNTIFS/SUMIFS criteria, so the whole board recomputes when any one changes.
    # A slicer set to "(All)" contributes the "*" wildcard (matches every category).
    # ---- Left filter PANEL geometry (slicers stacked down cols B–D, like the
    #      sample boards). The main content (KPIs, gauges, charts) starts at MC. ----
    MC = 4                               # main content first column (E, 0-based 4)
    PANEL_C0, PANEL_C1 = 1, 3            # panel spans columns B..D
    PANEL_VAL_C = 1                      # slicer/date VALUE cell column (B), merged B..D
    SLICER_TOP = 7                       # first slicer value row (0-based) → Excel row 8
    SLICER_STEP = 3                      # rows per slicer (label + value + gap)
    _n_sl = len(slicer_cols)
    DATE_FROM_ROW = SLICER_TOP + _n_sl * SLICER_STEP + 1
    DATE_TO_ROW = DATE_FROM_ROW + 3

    def _slicer_cell(i, scope="local"):
        r = SLICER_TOP + i * SLICER_STEP
        ref = f"${xl_col_to_name(PANEL_VAL_C)}${r + 1}"
        return (f"Dashboard!{ref}" if scope == "full" else ref)

    def _date_cell(which, scope="local"):
        r = DATE_FROM_ROW if which == "from" else DATE_TO_ROW
        ref = f"${xl_col_to_name(PANEL_VAL_C)}${r + 1}"
        return (f"Dashboard!{ref}" if scope == "full" else ref)

    def crit_suffix(scope="local", include_date=True):
        """Trailing COUNTIFS/SUMIFS criteria for all active slicers (+ date range).
        Returns e.g. ',Data!$C$2:$C$9,IF($C$5="(All)","*",$C$5),Data!$K$2:$K$9,">="&$C$6'."""
        parts = []
        for i, col in enumerate(slicer_cols):
            cell = _slicer_cell(i, scope)
            parts.append(f'{col_range(col)},IF({cell}="(All)","*",{cell})')
        if include_date and date_real_col:
            dR = col_range(date_real_col)
            parts.append(f'{dR},">="&{_date_cell("from", scope)}')
            parts.append(f'{dR},"<="&{_date_cell("to", scope)}')
        return ("," + ",".join(parts)) if parts else ""

    has_filters = bool(slicer_cols) or bool(date_real_col)

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
        # Live when filters exist and the agg is formula-expressible. The value cell
        # references its own label in column A ($A<row>), so category text is never
        # inlined (quote-safe), and every active slicer/date filter is AND-combined
        # via crit_suffix() so the chart redraws when any filter changes.
        live = has_filters and dimR is not None and agg in ("count", "sum", "mean")
        sfx = crit_suffix("full")
        for _, r in tbl.iterrows():
            lab = str(r[dim_name])
            sval = float(r[meas_name])
            excel_r = an_row + 1                      # 1-based Excel row of this line
            aref = f"$A${excel_r}"
            ws_an.write(an_row, 0, lab, f_cell)
            if live and lab != "Other":
                if agg == "count":
                    f = f'=COUNTIFS({dimR},{aref}{sfx})'
                elif agg == "sum":
                    f = f'=SUMIFS({fldR},{dimR},{aref}{sfx})'
                else:  # mean
                    f = f'=IFERROR(AVERAGEIFS({fldR},{dimR},{aref}{sfx}),0)'
                ws_an.write_formula(an_row, 1, f, valfmt, sval)
            elif live and lab == "Other" and agg in ("count", "sum"):
                # Residual = (total under the current filter) − (the shown rows above).
                shown = f"$B${start + 1}:$B${excel_r - 1}"
                if agg == "count":
                    f = f'=COUNTIFS({dimR},"*"{sfx})-SUM({shown})'
                else:
                    f = f'=SUMIFS({fldR},{dimR},"*"{sfx})-SUM({shown})'
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
        sfx = crit_suffix("full")
        for cat in cats:
            er = an_row + 1
            ws_an.write(an_row, 0, cat, f_cell)
            aref = f"$A${er}"
            sub = df[df[by].astype(str) == cat]
            for j, seg in enumerate(segs):
                colL = xl_col_to_name(1 + j)
                segref = f"{colL}${hdr + 1}"
                if agg == "count":
                    f = f'=COUNTIFS({byR},{aref},{stR},{segref}{sfx})'
                    cached = float((sub[stackBy].astype(str) == seg).sum())
                elif agg == "sum":
                    f = f'=SUMIFS({fR},{byR},{aref},{stR},{segref}{sfx})'
                    cached = float(pd.to_numeric(sub[sub[stackBy].astype(str) == seg][field], errors="coerce").sum())
                else:
                    f = f'=IFERROR(AVERAGEIFS({fR},{byR},{aref},{stR},{segref}{sfx}),0)'
                    _s = pd.to_numeric(sub[sub[stackBy].astype(str) == seg][field], errors="coerce")
                    cached = float(_s.mean()) if _s.notna().any() else 0.0
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
        # Slicers apply; the date range does not (the period axis already scopes time).
        sfx = crit_suffix("full", include_date=False)
        for p in pers:
            er = an_row + 1
            ws_an.write(an_row, 0, p, f_cell)
            aref = f"$A${er}"
            sub = df[df[period_col] == p]
            s = pd.to_numeric(sub[field], errors="coerce")
            cS = float(s.sum())
            cA = float(s.mean()) if s.notna().any() else 0.0
            fS = f'=SUMIFS({fR},{per_range},{aref}{sfx})'
            fA = f'=IFERROR(AVERAGEIFS({fR},{per_range},{aref}{sfx}),0)'
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

    # (C) Gauge charts — single-value half-doughnut gauges. The value is live
    #     (COUNTIFS/SUMIFS under the active filters); the target is a fixed
    #     reference denominator, so the gauge reads as a share-of-target. The
    #     doughnut's three cells (value, remainder, hidden bottom half) and the
    #     centred percentage are all cell-driven, so each gauge recomputes live.
    def _lerp_color(a, b, t):
        a = a.lstrip("#"); b = b.lstrip("#")
        ar = [int(a[i:i + 2], 16) for i in (0, 2, 4)]
        br = [int(b[i:i + 2], 16) for i in (0, 2, 4)]
        return "#" + "".join(f"{int(round(ar[i] + (br[i] - ar[i]) * t)):02X}" for i in range(3))

    def _gauge_value_formula(gg):
        if not has_filters:
            return None
        agg = (gg.get("agg") or "ratio").lower()
        field = gg.get("field")
        fR = col_range(field) if field in df.columns else None
        sfx = crit_suffix("full")
        if not sfx:
            return None
        if agg == "count":
            return f'=COUNTIFS({sfx[1:]})'
        if agg in ("sum", "mean") and fR:
            fn = "SUMIFS" if agg == "sum" else "AVERAGEIFS"
            return f'=IFERROR({fn}({fR}{sfx}),0)'
        if agg == "ratio" and fR:
            m = gg.get("match")
            return f'=IFERROR(COUNTIFS({fR},"{m}"{sfx})/COUNTIFS({sfx[1:]}),0)'
        return None  # distinct → cached only

    gauge_specs = []
    for gg in (spec.get("gauges") or [])[:4]:
        agg = (gg.get("agg") or "ratio").lower()
        field = gg.get("field")
        if agg in ("sum", "mean", "ratio") and field not in df.columns:
            warnings.append(f"gauge '{gg.get('title')}': field '{field}' missing")
            continue
        cached_val = _kpi_value(df, gg, warnings)
        if gg.get("max") is not None:
            try:
                target = float(gg["max"])
            except Exception:
                target = 0.0
        elif agg == "ratio":
            target = 1.0
        elif agg == "count":
            target = float(len(df))
        elif agg == "distinct":
            target = float(df[field].nunique(dropna=True)) if field in df.columns else 1.0
        elif agg == "sum":
            target = float(pd.to_numeric(df[field], errors="coerce").sum())
        else:  # mean
            target = float(pd.to_numeric(df[field], errors="coerce").max())
        if not target or target <= 0:
            target = 1.0
        frac = max(0.0, min(1.0, (cached_val / target) if target else 0.0))
        is_pct = agg == "ratio" or (gg.get("format") or "").lower() == "pct"
        val_code = _fmt_code(gg.get("format") or ("pct" if is_pct else "int"), currency)
        # Band colour: pick by fraction if bands given, else interpolate accent→primary.
        gcolor = None
        for band in (gg.get("bands") or []):
            try:
                if frac <= float(band.get("upto", 1)):
                    gcolor = band.get("color"); break
            except Exception:
                pass
        if not gcolor:
            gcolor = accent  # default arc: accent keeps the navy centre number legible

        ws_an.write(an_row, 0, gg.get("title") or "Gauge", f_section)
        an_row += 1
        # Vertical mini-table — the doughnut reads a single COLUMN (value,
        # remainder, hidden). A column range is the pattern LibreOffice reliably
        # re-renders on recalc; a horizontal 1-row range is cached and goes stale.
        gfmt = num_format(val_code)
        vrow, rrow, hrow_, drow2 = an_row, an_row + 1, an_row + 2, an_row + 3
        ev, eh, ed = vrow + 1, hrow_ + 1, drow2 + 1  # 1-based Excel rows
        vf = _gauge_value_formula(gg)
        ws_an.write(vrow, 0, "Value", f_cell)
        if vf:
            ws_an.write_formula(vrow, 1, vf, gfmt, cached_val)
        else:
            ws_an.write_number(vrow, 1, cached_val, gfmt)
        ws_an.write(rrow, 0, "Remainder", f_cell)
        ws_an.write_formula(rrow, 1, f"=MAX(0,$B${eh}-$B${ev})", gfmt, max(0.0, target - cached_val))
        ws_an.write(hrow_, 0, "Hidden", f_cell)
        ws_an.write_number(hrow_, 1, target, gfmt)
        ws_an.write(drow2, 0, "Display", f_cell)
        ws_an.write_formula(drow2, 1, f'=TEXT(IFERROR($B${ev}/$B${eh},0),"0.0%")',
                            wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": primary}),
                            f"{frac*100:.1f}%")
        an_row = drow2 + 2  # past the block + a spacer
        gauge_specs.append({
            "title": gg.get("title") or "Gauge",
            "cats_ref": f"=Analysis!$A${ev}:$A${eh}",      # Value/Remainder/Hidden labels
            "series_ref": f"=Analysis!$B${ev}:$B${eh}",   # value, remainder, hidden (column)
            "display_ref": f"=Analysis!$B${ed}",
            "cached_pct": f"{frac*100:.1f}%",
            "color": gcolor,
        })

    # (D) Funnel / pyramid — centred stacked bars. A transparent spacer centres
    #     each stage's coloured bar; spacer and value are both formulas, so the
    #     shape recomputes under the filters. Funnel = measure per stage (widest
    #     on top); pyramid = share-of-total per level (base widest at the bottom).
    centered_specs = []
    for mode, cfg in (("funnel", spec.get("funnel")), ("pyramid", spec.get("pyramid"))):
        if not cfg:
            continue
        by = cfg.get("by")
        agg = (cfg.get("agg") or "count").lower()
        field = cfg.get("field")
        if by not in df.columns:
            warnings.append(f"{mode} '{cfg.get('title')}': dimension '{by}' missing")
            continue
        if mode == "pyramid" and agg == "mean":
            agg = "count"
        if agg in ("sum", "mean") and field not in df.columns:
            warnings.append(f"{mode} '{cfg.get('title')}': field '{field}' missing")
            continue
        g2 = df.copy()
        g2[by] = g2[by].astype(object).where(g2[by].notna(), "Unknown").astype(str)
        if agg == "count":
            order = g2.groupby(by).size()
        else:
            g2[field] = pd.to_numeric(g2[field], errors="coerce")
            order = g2.groupby(by)[field].agg(agg)
        order = order.sort_values(ascending=False)
        cats = [str(x) for x in order.index]
        explicit = cfg.get("stages") or cfg.get("order")
        if isinstance(explicit, list) and explicit:
            present = set(cats)
            cats = [str(s) for s in explicit if str(s) in present]
        cats = cats[: int(cfg.get("top") or 8)]
        # Largest first → largest at the BOTTOM (pyramid base). Funnel reverses
        # the category axis so largest reads at the TOP.
        cats = sorted(cats, key=lambda c: float(order.get(c, 0)), reverse=True)
        if not cats:
            continue
        byR = col_range(by)
        fR = col_range(field) if field in df.columns else None
        share = (mode == "pyramid") or bool(cfg.get("asShare"))
        code = _fmt_code("pct", currency) if share else _fmt_code(
            cfg.get("format") or ("money" if agg == "sum" and fR else "int"), currency)
        vfmt = num_format(code)
        spfmt = num_format(_fmt_code("float", currency))
        cvals = {}
        for cat in cats:
            if agg == "count":
                cvals[cat] = float((g2[by] == cat).sum())
            elif agg == "sum":
                cvals[cat] = float(pd.to_numeric(g2[g2[by] == cat][field], errors="coerce").sum())
            else:
                _s = pd.to_numeric(g2[g2[by] == cat][field], errors="coerce")
                cvals[cat] = float(_s.mean()) if _s.notna().any() else 0.0
        denom = sum(cvals.values()) or 1.0
        ws_an.write(an_row, 0, cfg.get("title") or f"{by} {mode}", f_section)
        an_row += 1
        for j, h in enumerate(["Stage", "Spacer", "Value"]):
            ws_an.write(an_row, j, h, f_hdr)
        an_row += 1
        ds = an_row
        de = ds + len(cats) - 1
        valrng = f"$C${ds + 1}:$C${de + 1}"
        sfx = crit_suffix("full")
        live = has_filters and agg in ("count", "sum", "mean")
        for cat in cats:
            er2 = an_row + 1
            aref = f"$A${er2}"
            ws_an.write(an_row, 0, cat, f_cell)
            cv = cvals[cat]
            disp = (cv / denom) if share else cv
            # Value (col C): live where possible, else cached.
            if live and share and agg == "count":
                f = f'=IFERROR(COUNTIFS({byR},{aref}{sfx})/COUNTIFS({sfx[1:]}),0)'
            elif live and share and agg == "sum":
                f = f'=IFERROR(SUMIFS({fR},{byR},{aref}{sfx})/SUMIFS({fR}{sfx}),0)'
            elif live and agg == "count":
                f = f'=COUNTIFS({byR},{aref}{sfx})'
            elif live and agg == "sum":
                f = f'=SUMIFS({fR},{byR},{aref}{sfx})'
            elif live and agg == "mean":
                f = f'=IFERROR(AVERAGEIFS({fR},{byR},{aref}{sfx}),0)'
            else:
                f = None
            # Spacer (col B): centres the bar; recomputes from the live value column.
            sp = f"=(MAX({valrng})-$C${er2})/2"
            sp_cached = (max(cvals.values()) - cv) / 2 if cvals else 0.0
            ws_an.write_formula(an_row, 1, sp, spfmt, sp_cached)
            if f is not None:
                ws_an.write_formula(an_row, 2, f, vfmt, disp)
            else:
                ws_an.write_number(an_row, 2, disp, vfmt)
            an_row += 1
        # Colour ramp: funnel accent→primary; pyramid a warm triangular ramp.
        n = len(cats)
        colors = [_lerp_color(accent, primary, (i / (n - 1)) if n > 1 else 0) for i in range(n)]
        centered_specs.append({
            "title": cfg.get("title") or f"{by} {mode}",
            "mode": mode,
            "cats": f"=Analysis!$A${ds + 1}:$A${de + 1}",
            "spacer": f"=Analysis!$B${ds + 1}:$B${de + 1}",
            "vals": f"=Analysis!$C${ds + 1}:$C${de + 1}",
            "colors": colors,
            "code": code,
            "reverse": (mode == "funnel"),
        })
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

    # ---------- DASHBOARD CANVAS (same sheet, above the data table) ---------- #
    charts_added = 0

    RIGHT = MC + 4 * 3 - 1               # right edge of the KPI/content band (col P)

    # Title band (full width, two stacked merged rows)
    ws.merge_range(1, 1, 1, RIGHT, title, wb.add_format({**base_font, "font_size": 20, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "valign": "vcenter", "indent": 1}))
    ws.merge_range(2, 1, 2, RIGHT, subtitle, wb.add_format({**base_font, "font_size": 10, "font_color": "#DCE7F7", "bg_color": primary, "valign": "vcenter", "indent": 1}))
    ws.set_row(1, 34)
    ws.set_row(2, 18)

    # ---- LEFT FILTER PANEL: slicers stacked down cols B–D (like the samples) ----
    f_panel_h = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": "#FFFFFF", "bg_color": accent, "align": "left", "valign": "vcenter", "indent": 1})
    f_sl_lab = wb.add_format({**base_font, "font_size": 8, "bold": True, "font_color": primary, "bg_color": "#EEF3FB", "align": "left", "valign": "vcenter", "indent": 1})
    f_sl_val = wb.add_format({**base_font, "font_size": 11, "bold": True, "font_color": primary, "bg_color": "#FFF8E6", "border": 1, "border_color": "#FFD98A", "align": "center", "valign": "vcenter"})
    ws.merge_range(4, PANEL_C0, 5, PANEL_C1, "FILTERS", f_panel_h)
    for i, col in enumerate(slicer_cols):
        vr = SLICER_TOP + i * SLICER_STEP
        ws.merge_range(vr - 1, PANEL_C0, vr - 1, PANEL_C1, col.upper()[:24], f_sl_lab)
        ws.merge_range(vr, PANEL_C0, vr, PANEL_C1, "(All)", f_sl_val)
        values = ["(All)"] + sorted(str(v) for v in df[col].dropna().unique())[:200]
        ws.data_validation(vr, PANEL_VAL_C, vr, PANEL_VAL_C, {"validate": "list", "source": values})
        ws.set_row(vr, 20)

    if date_real_col:
        f_dlab = wb.add_format({**base_font, "font_size": 8, "bold": True, "font_color": "#FFFFFF", "bg_color": primary, "align": "left", "valign": "vcenter", "indent": 1})
        f_dval = wb.add_format({**base_font, "font_size": 10, "bold": True, "font_color": primary, "num_format": "yyyy-mm-dd", "bg_color": "#EEF3FB", "border": 1, "border_color": "#C7D6EC", "align": "center", "valign": "vcenter"})
        ws.merge_range(DATE_FROM_ROW - 1, PANEL_C0, DATE_FROM_ROW - 1, PANEL_C1, "DATE FROM", f_dlab)
        ws.merge_range(DATE_FROM_ROW, PANEL_C0, DATE_FROM_ROW, PANEL_C1, "", f_dval)
        ws.write_datetime(DATE_FROM_ROW, PANEL_VAL_C, dt.datetime(date_min.year, date_min.month, date_min.day), f_dval)
        ws.merge_range(DATE_TO_ROW - 1, PANEL_C0, DATE_TO_ROW - 1, PANEL_C1, "DATE TO", f_dlab)
        ws.merge_range(DATE_TO_ROW, PANEL_C0, DATE_TO_ROW, PANEL_C1, "", f_dval)
        ws.write_datetime(DATE_TO_ROW, PANEL_VAL_C, dt.datetime(date_max.year, date_max.month, date_max.day), f_dval)
        ws.set_row(DATE_FROM_ROW, 18)
        ws.set_row(DATE_TO_ROW, 18)

    # ---- KPI cards: big number (live) + vs-previous delta (▲/▼ %) ----
    kpis = (spec.get("kpis") or [{"label": "Total Records", "agg": "count"}])[:4]
    KPI_LAB, KPI_VAL, KPI_DLT = 6, 7, 8
    span = 3
    delta_code = '[Green]▲ 0.0%;[Red]▼ 0.0%;0.0%'
    f_k_lab = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#5B6B86", "bg_color": CARD_BG, "align": "left", "valign": "vcenter", "indent": 1})

    def _kpi_value_formula(kpi):
        """Big-number formula that AND-combines every active filter, or None."""
        if not has_filters:
            return None
        agg = (kpi.get("agg") or "count").lower()
        field = kpi.get("field")
        fR = col_range(field) if field in df.columns else None
        sfx = crit_suffix("local")
        if not sfx:
            return None
        if agg == "count":
            return f'=COUNTIFS({sfx[1:]})'
        if agg in ("sum", "mean") and fR:
            fn = "SUMIFS" if agg == "sum" else "AVERAGEIFS"
            return f'=IFERROR({fn}({fR}{sfx}),0)'
        if agg == "ratio" and fR:
            m = kpi.get("match")
            return f'=IFERROR(COUNTIFS({fR},"{m}"{sfx})/COUNTIFS({sfx[1:]}),0)'
        return None

    def _kpi_period_exprs(kpi):
        """(current, previous) period sub-expressions for the delta, or None.
        Slicers apply; the date range does not (the period scopes time itself)."""
        if not period_col:
            return None
        agg = (kpi.get("agg") or "count").lower()
        if agg not in ("count", "sum", "mean"):
            return None
        field = kpi.get("field")
        fR = col_range(field) if field in df.columns else None
        if agg in ("sum", "mean") and not fR:
            return None
        sfx = crit_suffix("local", include_date=False)

        def expr(pv):
            if agg == "count":
                return f'COUNTIFS({per_range},"{pv}"{sfx})'
            if agg == "sum":
                return f'SUMIFS({fR},{per_range},"{pv}"{sfx})'
            return f'IFERROR(AVERAGEIFS({fR},{per_range},"{pv}"{sfx}),0)'

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
        c0 = MC + (i % 4) * span
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
        # Small brand-tinted glyph, top-right of the card. Best-effort: if Pillow
        # is unavailable the card renders fine without it.
        _ic = _glyph_png(_icon_for_kpi(kpi), primary)
        if _ic is not None:
            ws.insert_image(KPI_LAB, c0 + span - 1, "kpi_icon.png", {
                "image_data": _ic, "x_scale": 0.24, "y_scale": 0.24,
                "x_offset": 38, "y_offset": 2, "object_position": 1})
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

    # ---- KEY RATIOS band: half-doughnut gauges (value / target), live. ----
    gauge_band_h = 0
    if gauge_specs:
        g0 = KPI_DLT + 2
        ws.write(g0, MC, "KEY RATIOS", f_section)
        grow = g0 + 1
        f_gcap = wb.add_format({**base_font, "font_size": 9, "bold": True, "font_color": "#5B6B86", "align": "center", "valign": "vcenter"})
        # Big centred number: a transparent cell drawn UNDER the gauge hole, not the
        # chart title. A linked-cell chart title is frozen to its cache by some
        # renderers; a worksheet cell is always live and shows through the (no-fill)
        # chart hole.
        f_gnum = wb.add_format({**base_font, "font_size": 20, "bold": True, "font_color": primary, "align": "center", "valign": "vcenter"})
        for gi, gs in enumerate(gauge_specs[:4]):
            gc = MC + gi * 3
            ws.merge_range(grow, gc, grow, gc + 2, gs["title"].upper(), f_gcap)
            ch = wb.add_chart({"type": "doughnut"})
            ch.add_series({
                "categories": gs["cats_ref"],
                "values": gs["series_ref"],
                "points": [{"fill": {"color": gs["color"]}, "border": {"none": True}},
                           {"fill": {"color": "#E7ECF5"}, "border": {"none": True}},
                           {"fill": {"none": True}, "border": {"none": True}}],
            })
            ch.set_rotation(270)
            ch.set_hole_size(74)
            ch.set_legend({"position": "none"})
            ch.set_chartarea({"border": {"none": True}, "fill": {"none": True}})
            ch.set_plotarea({"border": {"none": True}, "fill": {"none": True}})
            ch.set_size({"width": 215, "height": 205})
            ws.insert_chart(grow + 1, gc, ch)
            # Live % centred in the hole (row ~ middle of the chart's span).
            ws.merge_range(grow + 6, gc, grow + 6, gc + 2, "", f_gnum)
            ws.write_formula(grow + 6, gc, gs["display_ref"], f_gnum, gs["cached_pct"])
            charts_added += 1
        gauge_band_h = 2 + 11  # section label + caption row + chart rows

    # ---- Tiles: native interactive charts + a conditional-format table, all
    #      sourced from the selector-driven Analysis ranges so they move together. ----
    charts_start = KPI_DLT + 2 + gauge_band_h
    ws.write(charts_start, MC, "BREAKDOWNS", f_section)
    palette = [accent, primary, "#1f9d57", "#c77700", "#7c5cdf", "#17a2b8", "#e5484d", "#0b6fd6"]
    TILE_W, TILE_H = 6, 16          # 2 tiles per row in the main content band
    tile_row0 = charts_start + 1

    # Assemble tiles in a display order so the canvas reads like a BI board.
    prio = {"pie": 0, "funnel": 1, "combo": 2, "pyramid": 3, "stacked": 4,
            "column": 5, "bar": 6, "line": 7, "table": 8}
    tiles = []
    if combo_spec:
        tiles.append((prio["combo"], "combo", combo_spec))
    for cs in chart_specs:
        tiles.append((prio.get(cs["type"], 5), "chart", cs))
    for ss in stacked_specs:
        tiles.append((prio["stacked"], "stacked", ss))
    for cspec in centered_specs:
        tiles.append((prio.get(cspec["mode"], 2), cspec["mode"], cspec))
    stt = spec.get("statusTable") or {}
    if stt and stt.get("by") in df.columns and stt.get("field") in df.columns:
        tiles.append((prio["table"], "table", stt))
    tiles.sort(key=lambda t: t[0])

    def _place(i):
        return tile_row0 + (i // 2) * TILE_H, MC + (i % 2) * TILE_W

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
            sfx = crit_suffix("local")
            ftot = f'=SUMIFS({fR},{byR},{labref}{sfx})'
            favg = f'=IFERROR(AVERAGEIFS({fR},{byR},{labref}{sfx}),0)'
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
        elif kind in ("funnel", "pyramid"):
            chart = wb.add_chart({"type": "bar", "subtype": "stacked"})
            # Transparent spacer centres each bar; the coloured value carries labels.
            chart.add_series({"categories": spc["cats"], "values": spc["spacer"],
                              "fill": {"none": True}, "border": {"none": True}, "gap": 40})
            chart.add_series({
                "categories": spc["cats"], "values": spc["vals"],
                "points": [{"fill": {"color": col}, "border": {"none": True}} for col in spc["colors"]],
                "gap": 40,
                "data_labels": {"value": True, "num_format": spc["code"],
                                "font": {"name": "Arial", "size": 8, "color": primary}},
            })
            chart.set_title({"name": spc["title"], "name_font": {"name": "Arial", "size": 11, "bold": True, "color": primary}})
            chart.set_legend({"position": "none"})
            # For a bar chart the renderer puts the category axis on the left
            # (y_axis) and the value axis on the bottom (x_axis). Keep category
            # labels (reversed for a funnel so the widest reads on top); hide the
            # value axis and zero-base it so the centring holds.
            chart.set_y_axis({"reverse": spc["reverse"], "num_font": {"name": "Arial", "size": 9, "color": primary}})
            chart.set_x_axis({"visible": False, "min": 0, "major_gridlines": {"visible": False}})
            chart.set_size({"width": 430, "height": 300})
            ws.insert_chart(r, c, chart)
            charts_added += 1
        elif kind == "table":
            _render_status_table(r, c, spc)

    tile_rows = (len(tiles) + 1) // 2

    # Footer note
    foot = tile_row0 + max(1, tile_rows) * TILE_H
    ws.write(foot, MC, "Figures are computed from the source data. The filter panel, cards and charts are live — open in Excel and change a filter.", f_note)
    if warnings:
        ws.write(foot + 1, MC, "Notes: " + "; ".join(warnings[:6]), f_note)

    # Single-canvas print / PDF: landscape, scaled to one page (dashboard only;
    # the editable data table below is for input, not the printed page).
    ws.set_landscape()
    ws.set_paper(8)          # A3 gives the tiled grid room before fit-to-1-page scales it
    ws.fit_to_pages(1, 1)
    ws.set_margins(0.2, 0.2, 0.2, 0.2)
    ws.print_area(0, 0, foot + 2, RIGHT)

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

    # Collapse to ONE visible sheet: the user sees only the Dashboard (with its
    # editable data table on it). The formula engine is veryHidden (protected);
    # the optional deep-dive analyses are hidden (right-click a tab → Unhide to
    # reach them). This matches the client's single-page sample boards.
    ws.activate()
    ws.set_first_sheet()
    ws_an.very_hidden()
    for _x in (ws_corr, ws_piv, ws_tr, ws_rt):
        if _x is not None:
            _x.hide()
    wb.close()

    return {
        "ok": True,
        "output": out_path,
        "sheets": ["Dashboard"],
        "hidden_sheets": ["Analysis"] + extra_sheets,
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
