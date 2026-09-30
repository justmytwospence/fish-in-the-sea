"""Religion and party identification, jointly, from the 2024 Cooperative
Election Study (CES, n = 60,000; https://doi.org/10.7910/DVN/X11EP6).

Two weighted multinomial models on all adults:
  religion | sex x age band, education, race/ethnicity, unmarried
  party    | the same, plus religion and religion x race
(each covariate with sex-specific effects), so religion and party are
estimated together and both depend on education and race. Predictions are
for unmarried adults (separated, divorced, widowed or never married; a
domestic partnership counts as partnered).

Religion: 0 Protestant, 1 Catholic, 2 Latter-day Saint, 3 Jewish, 4 other
(including Orthodox and "something else"), 5 none. Party, leaners counted
as partisans: 0 Democrat, 1 independent/other, 2 Republican. Race: 0 White,
1 Black, 2 Hispanic (any race), 3 Asian, 4 other. Education: 0 no bachelor's,
1 bachelor's, 2 graduate degree.

The national religion level is calibrated to the Pew Religious Landscape
Study 2023-24 (a probability sample; the CES panel runs less religious). Each
place is shifted by how its religious mix and its 2024 presidential vote
differ from the US beyond what its make-up (sex, age, education, race,
marital status of its adults, from market_comp.parquet) already explains.
The religious mix blends Pew (metro, else state, capped), the CES
respondents living there, and, most directly, the unmarried ones among them,
each weighted by sample size.

Outputs web/public/data/beliefs.json:
  bands
  joint[sex][band][edu][race][rel * 3 + party]   unmarried, national
  rel[market][6]   log shift per religion
  pol[market]      log-odds shift of Democratic vs Republican
"""

import json
import math
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"
BANDS = [(18, 24), (25, 34), (35, 44), (45, 54), (55, 64), (65, 99)]
NREL, NPOL, NRACE = 6, 3, 5
K_PEW = 100  # pseudo-respondents pulling small Pew samples toward national

# ---------------------------------------------------------------- the survey
ces = duckdb.sql(f"""
  select cast(gender4 as int) sex, 2024 - cast(birthyr as int) age, cast(educ as int) educ,
    cast(race as int) race0, hispanic, cast(marstat as int) marstat,
    cast(religpew as int) religpew, cast(pid7 as int) pid7, cast(commonweight as double) w, countyfips
  from read_csv('{RAW / "ces2024.csv"}', all_varchar=true)
  where gender4 in ('1', '2') and marstat <> 'NA' and religpew <> 'NA' and pid7 <> 'NA'
""").df()
ces = ces[ces.age.between(18, 99) & (ces.w > 0)].copy()
ces["band"] = pd.cut(ces.age, [lo - 1 for lo, _ in BANDS] + [BANDS[-1][1]], labels=False)
ces["edu"] = np.select([ces.educ == 6, ces.educ == 5], [2, 1], 0)
ces["race"] = np.select([(ces.hispanic == "1") | (ces.race0 == 3), ces.race0 == 1, ces.race0 == 2, ces.race0 == 4],
                        [2, 0, 1, 3], 4)
ces["unp"] = ces.marstat.isin([2, 3, 4, 5]).astype(int)
ces["rel"] = ces.religpew.map({1: 0, 2: 1, 3: 2, 5: 3, 4: 4, 6: 4, 7: 4, 8: 4, 12: 4, 9: 5, 10: 5, 11: 5})
ces["party"] = np.select([ces.pid7 <= 3, ces.pid7.between(5, 7)], [0, 2], 1)
ces = ces[ces.rel.notna()]
print(f"CES adults: {len(ces)}, unmarried: {int(ces.unp.sum())}")


def features(sex, band, edu, race, unp, rel=None):
    """One-hot design: sex x band, and education, race and marital status
    each by sex; optionally religion and religion x race."""
    sex, band, edu, race, unp = (np.asarray(x, dtype=int) for x in (sex, band, edu, race, unp))
    n = len(sex)
    cols = []
    for sx in (1, 2):
        s_ = sex == sx
        cols += [s_ & (band == b) for b in range(len(BANDS))]
        cols += [s_ & (edu == e) for e in (1, 2)]
        cols += [s_ & (race == r) for r in range(1, NRACE)]
        cols += [s_ & (unp == 1)]
    if rel is not None:
        rel = np.asarray(rel, dtype=int)
        cols += [rel == k for k in range(1, NREL)]
        cols += [(rel == k) & (race == r) for k in range(1, NREL) for r in range(1, NRACE)]
        cols += [(rel == k) & (edu >= 1) for k in range(1, NREL)]
    return np.column_stack(cols).astype(float) if n else np.zeros((0, len(cols)))


def fit(X, y, w):
    m = LogisticRegression(C=1.0, max_iter=2000)
    m.fit(X, y, sample_weight=w / w.mean())
    return m


rel_model = fit(features(ces.sex, ces.band, ces.edu, ces.race, ces.unp), ces.rel.astype(int), ces.w.values)
pol_model = fit(features(ces.sex, ces.band, ces.edu, ces.race, ces.unp, ces.rel), ces.party, ces.w.values)

# Every combination of the covariates, with religion and party probabilities.
grid = pd.DataFrame([(sx, b, e, r, u) for sx in (1, 2) for b in range(len(BANDS)) for e in range(3)
                     for r in range(NRACE) for u in (0, 1)], columns=["sex", "band", "edu", "race", "unp"])
P_rel = rel_model.predict_proba(features(grid.sex, grid.band, grid.edu, grid.race, grid.unp))
P_pol = np.stack([pol_model.predict_proba(features(grid.sex, grid.band, grid.edu, grid.race, grid.unp,
                                                   np.full(len(grid), k))) for k in range(NREL)], axis=1)
key = {tuple(v): i for i, v in enumerate(grid[["sex", "band", "edu", "race", "unp"]].values)}

# ------------------------------------------------ calibration and local shifts
comp = duckdb.sql(f"select * from '{ROOT / 'market_comp.parquet'}'").df()
comp["gi"] = [key[(int(a), int(b), int(c), int(d), int(e))] for a, b, c, d, e in
              zip(comp.sex, comp.band, comp.edu, comp.race, comp.unp)]


def shares(rows, off):
    """Weighted religion shares for a set of composition rows, with a log
    offset per religion."""
    p = P_rel[rows.gi.values] * np.exp(off)
    p /= p.sum(1, keepdims=True)
    return (p * rows.w.values[:, None]).sum(0) / rows.w.sum()


pew = pd.read_csv(RAW / "pew_rls_2023_24.csv", dtype={"geo_code": str})
CATS = ["protestant", "catholic", "lds", "jewish", "other_religion", "unaffiliated"]
pew_nat = pew[pew.geo_type == "nation"].iloc[0]
target = np.array([pew_nat[f"share_{c}"] for c in CATS])
target /= target.sum()
off = np.zeros(NREL)
for _ in range(40):
    off += np.log(target) - np.log(shares(comp, off))
print("religion calibration (log offsets):", off.round(3), "national now", shares(comp, off).round(3))

P_rel_cal = P_rel * np.exp(off)
P_rel_cal /= P_rel_cal.sum(1, keepdims=True)
joint = P_rel_cal[:, :, None] * P_pol  # [grid][rel][party]

nat_rel = shares(comp, off)
pD = lambda rows: (joint[rows.gi.values][:, :, 0].sum(1) * rows.w.values).sum() / rows.w.sum()  # noqa: E731
pR = lambda rows: (joint[rows.gi.values][:, :, 2].sum(1) * rows.w.values).sum() / rows.w.sum()  # noqa: E731
logit = lambda p: math.log(p / (1 - p))  # noqa: E731
nat_two = pD(comp) / (pD(comp) + pR(comp))

ctx = json.loads((OUT / "context.json").read_text())["markets"]
pol_json = json.loads((OUT / "politics.json").read_text())
nat_vote = pol_json["nationalDem"]
market_counties = json.loads((ROOT / "market_counties.json").read_text())
geo = pd.read_csv(RAW / "Geos20245YR.txt", sep="|", dtype=str, usecols=["SUMLEVEL", "STATE", "STUSAB"])
fips_to_abbr = dict(geo[geo.SUMLEVEL == "040"][["STATE", "STUSAB"]].values)
idx = json.loads((OUT / "markets.json").read_text())
pew_by = {r.geo_code: r for r in pew.itertuples()}

# CES respondents living in each market: local religion evidence of its own
# (county-level), compared with what the uncalibrated model predicts there.
county_market = {c: m for m, cs in market_counties.items() for c in cs}
ces["market"] = ces.countyfips.map(lambda c: county_market.get(str(c).zfill(5)) if isinstance(c, str) and c.isdigit() else None)
ces_nat = np.array([ces.w[ces.rel == k].sum() for k in range(NREL)]) / ces.w.sum()
pred_nat_raw = shares(comp, np.zeros(NREL))
K_CES = 20  # pseudo-respondents pulling a market's CES shares toward national
STATE_WEIGHT = 200  # most a state-wide Pew sample counts for, about one metro
ces_local = {}
for m_id, g in ces[ces.market.notna()].groupby("market"):
    v = np.array([g.w[g.rel == k].sum() for k in range(NREL)]) / g.w.sum()
    ces_local[m_id] = ((len(g) * v + K_CES * ces_nat) / (len(g) + K_CES), len(g))
# The same for unmarried respondents only: where the local unmarried differ
# from local adults more than they do nationally (Latter-day Saints in Utah
# marry young, so Salt Lake singles are far less LDS than its adults), this is
# the direct evidence about the people the site counts.
unm = ces[ces.unp == 1]
ces_nat_u = np.array([unm.w[unm.rel == k].sum() for k in range(NREL)]) / unm.w.sum()
pred_nat_u = shares(comp[comp.unp == 1], np.zeros(NREL))
ces_local_u = {}
for m_id, g in unm[unm.market.notna()].groupby("market"):
    v = np.array([g.w[g.rel == k].sum() for k in range(NREL)]) / g.w.sum()
    ces_local_u[m_id] = ((len(g) * v + K_CES * ces_nat_u) / (len(g) + K_CES), len(g))
ADULT_WEIGHT = 100  # how many local unmarried respondents the all-adult shift is worth

rel_shift, pol_shift, src = {}, {}, {"metro": 0, "state": 0, "none": 0}
by_market = {m: g for m, g in comp.groupby("market")}
for m in idx["markets"]:
    rows = by_market.get(m["id"])
    if rows is None:
        continue
    pred = shares(rows, off)
    st = pd.Series([c[:2] for c in market_counties[m["id"]]]).mode()
    abbr = fips_to_abbr.get(st.iloc[0]) if len(st) else None
    r = pew_by.get(m.get("cbsa")) or pew_by.get(abbr)
    # Pew (metro, else state) and the market's own CES respondents, each as a
    # shift beyond what the make-up explains, weighted by sample size (a
    # state-wide Pew sample says less about one metro, so it's capped).
    parts = []
    if r is not None:
        metro = m.get("cbsa") in pew_by
        src["metro" if metro else "state"] += 1
        n = r.n_unweighted
        loc = np.array([(n * getattr(r, f"share_{c}") + K_PEW * target[i]) / (n + K_PEW) for i, c in enumerate(CATS)])
        loc /= loc.sum()
        s = np.log(np.maximum(loc, 1e-3)) - np.log(target) - (np.log(pred) - np.log(nat_rel))
        parts.append((s, n if metro else min(n, STATE_WEIGHT)))
    else:
        src["none"] += 1
    if m["id"] in ces_local:
        loc, n = ces_local[m["id"]]
        pr = shares(rows, np.zeros(NREL))
        s = np.log(np.maximum(loc, 1e-3)) - np.log(ces_nat) - (np.log(pr) - np.log(pred_nat_raw))
        parts.append((s, n))
    if parts:
        wsum = sum(w for _, w in parts)
        s = sum(x * w for x, w in parts) / wsum
        if m["id"] in ces_local_u:
            loc, n = ces_local_u[m["id"]]
            pr = shares(rows[rows.unp == 1], np.zeros(NREL))
            su = np.log(np.maximum(loc, 1e-3)) - np.log(ces_nat_u) - (np.log(pr) - np.log(pred_nat_u))
            s = (ADULT_WEIGHT * s + n * su) / (ADULT_WEIGHT + n)
        rel_shift[m["id"]] = [round(float(x), 2) for x in s]
    dem = ctx.get(m["id"], {}).get("dem")
    if dem:
        two = pD(rows) / (pD(rows) + pR(rows))
        pol_shift[m["id"]] = round(logit(dem) - logit(nat_vote) - (logit(two) - logit(nat_two)), 2)
print("religion shift source:", src, "; party shifts:", len(pol_shift))

out = {"bands": BANDS, "joint": {}}
for sx in (1, 2):
    out["joint"][str(sx)] = [[[[round(float(x), 4) for x in joint[key[(sx, b, e, r, 1)]].ravel()]
                               for r in range(NRACE)] for e in range(3)] for b in range(len(BANDS))]
out["rel"] = rel_shift
out["pol"] = pol_shift
(OUT / "beliefs.json").write_text(json.dumps(out, separators=(",", ":")))

# A few checks: unmarried women 25-34.
for e, r, lab in ((0, 0, "White, no degree"), (2, 0, "White, graduate"), (0, 1, "Black, no degree"), (1, 2, "Hispanic, BA"), (1, 3, "Asian, BA")):
    j = joint[key[(2, 1, e, r, 1)]]
    print(f"  women 25-34 {lab:18} none {j[5].sum():.0%} Prot {j[0].sum():.0%} Cath {j[1].sum():.0%} | D {j[:, 0].sum():.0%} R {j[:, 2].sum():.0%} | R among Prot {j[0, 2] / j[0].sum():.0%}")
print("wrote beliefs.json")
