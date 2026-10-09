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


def _shares(series):
    """Proportions of each category (NaN/blank dropped), as a numpy array."""
    vc = series.astype(str).replace({"": np.nan, "nan": np.nan, "None": np.nan}).dropna().value_counts()
    total = int(vc.sum())
    if total == 0:
        return np.array([]), total
    return (vc.to_numpy(dtype=float) / total), total


def _blau(series):
    """Blau's index of heterogeneity: 1 - Σ p_i². 0 = uniform, →1 = even spread."""
    p, total = _shares(series)
    if total == 0 or p.size < 2:
        return None
    return float(1.0 - np.sum(p ** 2))


def _shannon(series):
    """Shannon evenness: H / ln(k), normalised to 0..1 across k categories."""
    p, total = _shares(series)
    k = p.size
    if total == 0 or k < 2:
        return None
    h = float(-np.sum(p * np.log(p)))
    return float(h / math.log(k)) if k > 1 else None


def _outliers(values):
    """Flag outliers with BOTH z-score (|z|>3) and Tukey IQR (1.5·IQR) fences.
    Returns (idx_set, detail) where detail carries the fences and extremes."""
    s = pd.to_numeric(pd.Series(values), errors="coerce").dropna()
    n = len(s)
    if n < 8:
        return set(), None
    mean, std = float(s.mean()), float(s.std(ddof=0))
    q1, q3 = float(s.quantile(0.25)), float(s.quantile(0.75))
    iqr = q3 - q1
    lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    z_out = set(s.index[(std > 0) & ((s - mean).abs() > 3 * std)]) if std > 0 else set()
    iqr_out = set(s.index[(s < lo_f) | (s > hi_f)]) if iqr > 0 else set()
    idx = z_out | iqr_out
    if not idx:
        return set(), {"count": 0, "fence_low": round(lo_f, 2), "fence_high": round(hi_f, 2)}
    flagged = s.loc[sorted(idx)]
    return idx, {
        "count": int(len(idx)),
        "share": round(len(idx) / n, 4),
        "fence_low": round(lo_f, 2),
        "fence_high": round(hi_f, 2),
        "min_flagged": round(float(flagged.min()), 2),
        "max_flagged": round(float(flagged.max()), 2),
        "by_zscore": int(len(z_out)),
        "by_iqr": int(len(iqr_out)),
    }


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

    # ---- Outlier / anomaly detection (z-score + IQR) on the key measure ----
    # Prefer the pay/cost column; otherwise the numeric column with the widest
    # relative spread, so an arbitrary dataset still gets an anomaly scan.
    outlier_col = salary_col
    if outlier_col is None and useful_nums:
        spreads = []
        for c in useful_nums:
            m, sd = df[c].mean(), df[c].std()
            if m and sd and m != 0:
                spreads.append((abs(sd / m), c))
        outlier_col = max(spreads)[1] if spreads else None
    if outlier_col is not None:
        idx, od = _outliers(df[outlier_col].tolist())
        if od is not None and od.get("count"):
            stats["outliers"] = {"column": outlier_col, **od}
            findings.append(
                f"{od['count']:,} outlier value(s) in {outlier_col} "
                f"(outside {_money(od['fence_low'], currency) if outlier_col == salary_col else od['fence_low']}"
                f"–{_money(od['fence_high'], currency) if outlier_col == salary_col else od['fence_high']}; "
                f"flagged by z-score and IQR)."
            )
            if od.get("share", 0) >= 0.02:
                risks.append({"title": "Outliers in " + outlier_col,
                              "detail": f"{od['count']:,} record(s) sit well outside the normal range of {outlier_col}. "
                                        f"These skew averages and may be data-entry errors or genuine exceptions — verify before trusting the mean."})
                recs.append({"action": f"Review the {od['count']:,} flagged {outlier_col} outlier(s)",
                             "rationale": "Confirm each is a real value, not a typo; outliers distort KPIs and pay benchmarks."})

    # ---- Diversity indices (Blau, Shannon) + adverse-impact (4/5ths proxy) ----
    diversity = {}
    if gender_col is not None:
        g = df[gender_col].astype(str).str.title()
        gp, gtot = _shares(g)
        if gtot:
            fem = float((g == "Female").sum()) / gtot
            blau_g, sh_g = _blau(g), _shannon(g)
            diversity["gender"] = {"female_share": round(fem, 4),
                                   "blau": round(blau_g, 3) if blau_g is not None else None,
                                   "shannon": round(sh_g, 3) if sh_g is not None else None}
            findings.append(f"Gender mix: women are {_pct(fem)} of the workforce"
                            + (f" (balance index {blau_g:.2f}/1.0)." if blau_g is not None else "."))
            if fem and (fem < 0.30 or fem > 0.70):
                under = "women" if fem < 0.30 else "men"
                risks.append({"title": "Gender imbalance",
                              "detail": f"The workforce skews heavily one way ({_pct(fem)} women). {under.title()} are under-represented, which carries culture, hiring-pool and compliance implications."})
                recs.append({"action": f"Set representation targets and review the hiring funnel for {under}",
                             "rationale": "A skew beyond 70/30 is worth a deliberate sourcing and inclusion plan."})
                if severity < 1:
                    severity, headline = 1, f"Workforce is {_pct(fem)} women — representation is skewed"

    if primary_cat:
        blau_d, sh_d = _blau(df[primary_cat]), _shannon(df[primary_cat])
        if blau_d is not None:
            diversity[primary_cat] = {"blau": round(blau_d, 3),
                                      "shannon": round(sh_d, 3) if sh_d is not None else None,
                                      "groups": int(df[primary_cat].astype(str).replace({"": "Unknown"}).nunique())}
            spread_word = "evenly spread" if blau_d >= 0.75 else ("moderately spread" if blau_d >= 0.5 else "concentrated")
            findings.append(f"Distribution across {primary_cat.lower()} is {spread_word} (spread index {blau_d:.2f}/1.0).")

    # Adverse-impact / 4-fifths proxy: positive-status rate by gender group.
    if gender_col is not None and status_col is not None:
        s = df[status_col].astype(str).str.lower()
        active = ~s.isin(["terminated", "exited", "left", "resigned", "inactive"])
        tmp = pd.DataFrame({"g": df[gender_col].astype(str).str.title(), "ok": active.astype(int)})
        grp = tmp.groupby("g")["ok"].mean()
        grp = grp[[gi for gi in grp.index if gi and gi.lower() not in ("nan", "none", "")]]
        if len(grp) >= 2 and grp.max() > 0:
            air = float(grp.min() / grp.max())
            lo_grp, hi_grp = grp.idxmin(), grp.idxmax()
            diversity["adverse_impact_ratio"] = {"ratio": round(air, 3), "lowest": lo_grp, "highest": hi_grp,
                                                 "measure": "active-status rate"}
            if air < 0.8:
                findings.append(f"Active-status rate for {lo_grp} is {air:.0%} of {hi_grp}'s — below the 4/5ths (80%) threshold.")
                risks.append({"title": "Possible adverse impact",
                              "detail": f"By the 4/5ths rule, {lo_grp} retain active status at {air:.0%} of {hi_grp}'s rate. A ratio under 80% is a recognised screen for disparate impact — investigate exits by group."})
                recs.append({"action": f"Audit separations and status changes for {lo_grp}",
                             "rationale": "An adverse-impact ratio below 0.80 warrants a controlled review for fairness and compliance."})
                if severity < 2:
                    severity, headline = 2, f"Adverse-impact signal: {lo_grp} at {air:.0%} of {hi_grp}"

    if diversity:
        stats["diversity"] = diversity

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
