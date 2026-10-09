#!/usr/bin/env python3
"""
Nexusora Workforce — deterministic analytics engine (NO AI required).

Reads a job { data: rows, spec: {selector?, currency?}, title? } and returns a
statistical analysis as the SAME narrative shape the AI path produces, so the
UI and the Excel "AI Insights" sheet work identically with or without Claude:

    { "ok": true,
      "narrative": { "headline", "summary", "findings":[...],
                     "risks":[{title,detail}], "recommendations":[{action,rationale}] },
      "stats": { ... machine-readable figures ... } }

Everything here is computed from the data with pandas + numpy — no LLM, no
network, no per-call cost. HR-aware heuristics with a generic fallback so it
also says something useful about an arbitrary uploaded dataset.
"""
import sys
import json
import math

import numpy as np
import pandas as pd


def _read_job():
    if len(sys.argv) > 1 and sys.argv[1] not in ("-", ""):
        return json.load(open(sys.argv[1], "r", encoding="utf-8"))
    return json.loads(sys.stdin.read())


def _money(n, currency):
    cur = (currency or "").upper()
    sym = {"USD": "$", "GHS": "GH₵ ", "NGN": "₦", "EUR": "€", "GBP": "£", "KES": "KSh ",
           "ZAR": "R ", "XOF": "CFA ", "XAF": "FCFA "}.get(cur, (cur + " ") if cur else "")
    try:
        return f"{sym}{round(float(n)):,}"
    except Exception:
        return str(n)


def _pct(x):
    return f"{x * 100:.1f}%"


def _coerce(df):
    for c in df.columns:
        if df[c].dtype == object:
            conv = pd.to_numeric(df[c], errors="coerce")
            nn = df[c].notna().sum()
            if nn and conv.notna().sum() >= 0.8 * nn:
                df[c] = conv
    return df


def analyze(job):
    spec = job.get("spec") or {}
    currency = spec.get("currency") or job.get("currency") or ""
    rows = job.get("data") or []
    df = pd.DataFrame(rows)
    df.columns = [str(c) for c in df.columns]
    df = _coerce(df)
    n = len(df)

    findings, risks, recs = [], [], []
    stats = {"rows": n}

    if n == 0:
        return {"ok": True, "narrative": {"headline": "No data", "summary": "There are no records to analyse.",
                                          "findings": [], "risks": [], "recommendations": []}, "stats": stats}

    cat_cols = [c for c in df.columns if df[c].dtype == object and 1 < df[c].nunique(dropna=True) <= 60]
    num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    lower = {c: c.lower() for c in df.columns}

    def find_col(*keys):
        for c in df.columns:
            if any(k in lower[c] for k in keys):
                return c
        return None

    status_col = find_col("status")
    gender_col = find_col("gender", "sex")
    salary_col = next((c for c in num_cols if any(k in c.lower() for k in ("salary", "pay", "wage", "net", "gross", "cost"))), None)
    dept_col = find_col("department", "unit", "division") or (cat_cols[0] if cat_cols else None)
    primary_cat = spec.get("selector") if spec.get("selector") in cat_cols else dept_col

    severity = 0  # drives the headline choice
    headline = None

    findings.append(f"Total records: {n:,}.")

    # ---- Attrition (status col with a 'terminated'/'exited' value) ----
    if status_col is not None:
        s = df[status_col].astype(str).str.lower()
        term = s.isin(["terminated", "exited", "left", "resigned", "inactive"]).sum()
        rate = term / n if n else 0
        stats["attrition_rate"] = round(rate, 4)
        stats["terminations"] = int(term)
        findings.append(f"Attrition is {_pct(rate)} ({term:,} of {n:,}).")
        if rate > 0.15:
            risks.append({"title": "High attrition", "detail": f"At {_pct(rate)}, turnover is above a healthy band (~<10%). Capability and hiring costs are at risk."})
            recs.append({"action": "Launch stay interviews and a retention plan in the highest-exit areas", "rationale": f"Attrition of {_pct(rate)} is elevated and concentrated — act where exits cluster."})
            if severity < 3:
                severity, headline = 3, f"Attrition is high at {_pct(rate)}"
        elif rate > 0.10:
            risks.append({"title": "Watch attrition", "detail": f"At {_pct(rate)}, turnover is at the upper edge of healthy. Monitor by department and tenure."})
            if severity < 2:
                severity, headline = 2, f"Attrition is edging up at {_pct(rate)}"

    # ---- Concentration of the primary dimension ----
    if primary_cat:
        vc = df[primary_cat].astype(str).replace({"": "Unknown"}).value_counts()
        topname, topn = vc.index[0], int(vc.iloc[0])
        share = topn / n
        stats["top_segment"] = {"dimension": primary_cat, "name": topname, "share": round(share, 4), "count": topn}
        findings.append(f"Largest {primary_cat.lower()} is “{topname}” with {topn:,} ({_pct(share)}).")
        if share > 0.40:
            risks.append({"title": "Concentration risk", "detail": f"{_pct(share)} of people sit in “{topname}”. A shock there hits a large share of the workforce."})
            recs.append({"action": f"Build succession and cross-skilling depth in {topname}", "rationale": "Reduce single-point concentration in the largest group."})
            if severity < 1:
                severity, headline = 1, f"Workforce is concentrated in {topname} ({_pct(share)})"

    # ---- Group extremes on a key measure (e.g. salary by dept/grade) ----
    if salary_col and primary_cat:
        g = df.groupby(df[primary_cat].astype(str).replace({"": "Unknown"}))[salary_col].mean().dropna()
        if len(g) >= 2:
            hi, lo = g.idxmax(), g.idxmin()
            stats["measure_by_group"] = {"measure": salary_col, "dimension": primary_cat,
                                         "highest": {"name": hi, "value": round(float(g.max()), 2)},
                                         "lowest": {"name": lo, "value": round(float(g.min()), 2)}}
            findings.append(f"Average {salary_col} is highest in “{hi}” ({_money(g.max(), currency)}) and lowest in “{lo}” ({_money(g.min(), currency)}).")
            if g.min() > 0 and g.max() / g.min() >= 2:
                findings.append(f"That is a {g.max() / g.min():.1f}× gap between the top and bottom {primary_cat.lower()} — worth a fairness check.")

    # ---- Pay equity by gender ----
    if salary_col and gender_col:
        gg = df.groupby(df[gender_col].astype(str).str.title())[salary_col].mean().dropna()
        if {"Male", "Female"}.issubset(set(gg.index)) and gg["Male"] > 0:
            gap = (gg["Male"] - gg["Female"]) / gg["Male"]
            stats["gender_pay_gap"] = round(float(gap), 4)
            findings.append(f"Average {salary_col}: men {_money(gg['Male'], currency)} vs women {_money(gg['Female'], currency)} (gap {_pct(gap)}).")
            if abs(gap) >= 0.10:
                risks.append({"title": "Possible pay inequity", "detail": f"A {_pct(abs(gap))} average gap by gender may reflect role mix or inequity — investigate at the same grade/role."})
                recs.append({"action": "Run a like-for-like pay-equity review by grade and role", "rationale": f"A headline gap of {_pct(abs(gap))} warrants a controlled analysis before conclusions."})
                if severity < 2:
                    severity, headline = 2, f"Gender pay gap of {_pct(abs(gap))} detected"

    # ---- Correlation among numeric columns ----
    useful_nums = [c for c in num_cols if df[c].notna().sum() >= max(5, 0.5 * n)]
    if len(useful_nums) >= 2:
        best = None
        for i in range(len(useful_nums)):
            for j in range(i + 1, len(useful_nums)):
                a, b = df[useful_nums[i]], df[useful_nums[j]]
                m = a.notna() & b.notna()
                if m.sum() >= 5 and a[m].std() > 0 and b[m].std() > 0:
                    r = float(np.corrcoef(a[m], b[m])[0, 1])
                    if best is None or abs(r) > abs(best[2]):
                        best = (useful_nums[i], useful_nums[j], r)
        if best and abs(best[2]) >= 0.3:
            direction = "rise together" if best[2] > 0 else "move in opposite directions"
            findings.append(f"{best[0]} and {best[1]} {direction} (correlation r = {best[2]:.2f}).")
            stats["top_correlation"] = {"a": best[0], "b": best[1], "r": round(best[2], 3)}

    # ---- Dispersion of the key measure ----
    if salary_col and df[salary_col].notna().sum() >= 5:
        mean = df[salary_col].mean()
        std = df[salary_col].std()
        if mean and std and std / mean > 0.6:
            findings.append(f"{salary_col} is widely dispersed (spread ~{std / mean:.0%} of the average) — pay is uneven across the workforce.")

    # ---- Defaults so there is always something actionable ----
    if not recs:
        recs.append({"action": "Set a monthly review of these metrics with HR leadership", "rationale": "Trend direction matters more than any single snapshot."})
    if len(recs) < 2 and primary_cat:
        recs.append({"action": f"Break down the key metrics by {primary_cat.lower()} and tenure", "rationale": "Segment views surface where to focus first."})

    if headline is None:
        headline = f"{n:,} records analysed across {len(cat_cols)} dimensions"

    # Summary: stitch the strongest 2–3 findings.
    summary_bits = findings[1:4]  # skip the bare record-count line
    summary = " ".join(summary_bits) if summary_bits else f"{n:,} records analysed."

    return {
        "ok": True,
        "narrative": {
            "headline": headline,
            "summary": summary,
            "findings": findings,
            "risks": risks,
            "recommendations": recs,
        },
        "stats": stats,
    }


def main():
    try:
        out = analyze(_read_job())
        sys.stdout.write(json.dumps(out))
    except Exception as e:  # noqa
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
