"""Context data layered onto the Census sieve.

Outputs web/public/data/context.json with:
  heights  NHANES Aug 2021-Aug 2023 measured height (in) by sex x age band
  health   national rates among unpartnered adults (not married, not living
           with a partner) by sex x age band, from NHANES 2017-2023 (measured
           BMI, self-reported smoking): current smoker, BMI >= 30, BMI >= 25
  markets  per market: local shifts for those rates (log-odds difference of
           the metro's, or failing that the state's, 2024 BRFSS all-adult
           prevalence versus the US), and 2024 presidential two-party vote
"""

import json
import math
import hashlib
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
from survey_codes import nhanes_smoking, nhanes_degree

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"

BANDS = [(18, 24), (25, 34), (35, 44), (45, 54), (55, 64), (65, 99)]
HEIGHT_BANDS = [(20, 39), (40, 59), (60, 99)]


def band_of(age, bands):
    for i, (lo, hi) in enumerate(bands):
        if lo <= age <= hi:
            return i
    return -1


def wmean(x, w):
    return float(np.sum(x * w) / np.sum(w))


# ------------------------------------------------------------------ NHANES

def load(cycle: str) -> pd.DataFrame:
    sfx = "_L" if cycle == "L" else ""
    pre = "P_" if cycle == "P" else ""
    demo = pd.read_sas(RAW / f"{pre}DEMO{sfx}.xpt")
    bmx = pd.read_sas(RAW / f"{pre}BMX{sfx}.xpt")
    smq = pd.read_sas(RAW / f"{pre}SMQ{sfx}.xpt")
    d = demo.merge(bmx, on="SEQN", how="left").merge(smq, on="SEQN", how="left")
    # MEC weights; the pooled weight splits by each cycle's share of 5.2 years
    # (2017-Mar 2020 covers 3.2 years, Aug 2021-Aug 2023 covers 2).
    if cycle == "L":
        d["w"] = d.WTMEC2YR * 2 / 5.2
    else:
        d["w"] = d.WTMECPRP * 3.2 / 5.2
    d["cycle"] = cycle
    return d


nh = pd.concat([load("L"), load("P")], ignore_index=True)
nh = nh[(nh.RIDAGEYR >= 18) & (nh.w > 0)]

# Heights: current cycle only.
heights = {}
cur = nh[(nh.cycle == "L") & nh.BMXHT.notna()]
for sex in (1, 2):
    rows = []
    for lo, hi in HEIGHT_BANDS:
        g = cur[(cur.RIAGENDR == sex) & cur.RIDAGEYR.between(lo, hi)]
        h = g.BMXHT.values / 2.54
        m = wmean(h, g.w.values)
        sd = math.sqrt(wmean((h - m) ** 2, g.w.values))
        rows.append([lo, hi, round(m, 2), round(sd, 2), int(len(g))])
    heights[str(sex)] = rows
print("heights", heights)

# Unpartnered adults: DMDMARTZ 2 = widowed/divorced/separated, 3 = never married.
un = nh[nh.DMDMARTZ.isin([2, 3])].copy()
un["band"] = un.RIDAGEYR.apply(lambda a: band_of(a, BANDS))
un['smoker'] = nhanes_smoking(un)
un["obese"] = (un.BMXBMI >= 30).astype(float)
un["over"] = (un.BMXBMI >= 25).astype(float)
un.loc[un.BMXBMI.isna(), ["obese", "over"]] = np.nan

health = {"bands": BANDS, "smoke": {}, "obese": {}, "over": {}, "n": {}}
for sex in (1, 2):
    for key in ("smoke", "obese", "over"):
        col = "smoker" if key == "smoke" else key
        vals = []
        for b in range(len(BANDS)):
            g = un[(un.RIAGENDR == sex) & (un.band == b) & un[col].notna()]
            vals.append(round(wmean(g[col].values, g.w.values), 4))
        health[key][str(sex)] = vals
    health["n"][str(sex)] = [int(((un.RIAGENDR == sex) & (un.band == b)).sum()) for b in range(len(BANDS))]
# Share with BMI at or above each whole number from 20 to 40 (the BMI
# slider); 25 and 30 match "over" and "obese" above.
BMI_CUTS = list(range(20, 41))
health["bmiCuts"] = BMI_CUTS
health["bmiAbove"] = {}
for sex in (1, 2):
    rows = []
    for b in range(len(BANDS)):
        g = un[(un.RIAGENDR == sex) & (un.band == b) & un.BMXBMI.notna()]
        rows.append([round(wmean((g.BMXBMI.values >= t).astype(float), g.w.values), 4) for t in BMI_CUTS])
    health["bmiAbove"][str(sex)] = rows
print("health", {k: v for k, v in health.items() if k != "bmiAbove"})

# --------------------------------------- conditional rates (race, degree)

# Smoking and BMI thresholds by sex, age band, degree and race/ethnicity, from
# a weighted logistic model on all NHANES adults (so partner status is a term,
# not a filter): sex x age band, degree and race each with sex-specific
# effects, and not living with a partner. Predictions are for unpartnered
# adults. Race codes follow the site: 0 White, 1 Black, 2 Hispanic, 3 Asian,
# 4 other (non-Hispanic unless noted).
RACE_OF = {1: 2, 2: 2, 3: 0, 4: 1, 6: 3, 7: 4}
ad = nh.copy()
ad["race"] = ad.RIDRETH3.map(RACE_OF)
ad['ba'] = nhanes_degree(ad)
ad["unp"] = np.where(ad.DMDMARTZ.isin([1, 2, 3]), ad.DMDMARTZ.isin([2, 3]).astype(float), np.nan)
ad["band"] = ad.RIDAGEYR.apply(lambda a: band_of(a, BANDS))
ad = ad[ad.race.notna() & ad.ba.notna() & ad.unp.notna() & (ad.band >= 0)].copy()


def design(sex, band, ba, race, unp):
    """Feature rows for arrays of attributes."""
    sex, band, ba, race, unp = (np.asarray(x, dtype=float) for x in (sex, band, ba, race, unp))
    f = (sex == 2).astype(float)
    cols = [np.ones_like(f)]
    for sx in (1, 2):
        for b in range(len(BANDS)):
            if (sx, b) != (1, 0):
                cols.append(((sex == sx) & (band == b)).astype(float))
    cols += [ba, ba * f, unp, unp * f]
    for r in range(1, 5):
        cols += [(race == r).astype(float), (race == r) * f]
    return np.column_stack(cols)


def fit_logit(X, y, w, ridge=1.0):
    """Weighted logistic regression by IRLS, lightly ridged."""
    w = w / w.mean()
    beta = np.zeros(X.shape[1])
    for _ in range(50):
        mu = 1 / (1 + np.exp(-(X @ beta)))
        W = w * mu * (1 - mu)
        H = X.T @ (X * W[:, None]) + ridge * np.eye(X.shape[1])
        g = X.T @ (w * (y - mu)) - ridge * beta
        step = np.linalg.solve(H, g)
        beta += step
        if np.abs(step).max() < 1e-8:
            break
    return beta


def fitted(col):
    d = ad[ad[col].notna()]
    return fit_logit(design(d.RIAGENDR, d.band, d.ba, d.race, d.unp), d[col].values.astype(float), d.w.values)


def predict(beta, sex, band, ba, race, unp):
    return 1 / (1 + np.exp(-(design(sex, band, ba, race, unp) @ beta)))


ad['smoke'] = nhanes_smoking(ad)
models = {"smoke": fitted("smoke")}
for t in BMI_CUTS:
    ad[f"bmi{t}"] = np.where(ad.BMXBMI.isna(), np.nan, (ad.BMXBMI >= t).astype(float))
    models[f"bmi{t}"] = fitted(f"bmi{t}")

grid = [(sx, b, ba, r) for sx in (1, 2) for b in range(len(BANDS)) for ba in (0, 1) for r in range(5)]
cond = {"races": 5, "smoke": {}, "bmiAbove": {}, "height": {}}
for sx in (1, 2):
    cond["smoke"][str(sx)] = [[[round(float(predict(models["smoke"], sx, b, ba, r, 1)[0]), 4) for r in range(5)]
                               for ba in (0, 1)] for b in range(len(BANDS))]
    rows = []
    for b in range(len(BANDS)):
        by_ba = []
        for ba in (0, 1):
            by_r = []
            for r in range(5):
                v = [float(predict(models[f"bmi{t}"], sx, b, ba, r, 1)[0]) for t in BMI_CUTS]
                v = np.minimum.accumulate(v)  # share at or above must fall as the cutoff rises
                by_r.append([round(float(x), 4) for x in v])
            by_ba.append(by_r)
        rows.append(by_ba)
    cond["bmiAbove"][str(sx)] = rows
print("conditional smoking, women 25-34, [no degree, degree] x [W,B,H,A,O]:", cond["smoke"]["2"][1])
print("conditional BMI 30+, women 25-34:", [[r[10] for r in x] for x in cond["bmiAbove"]["2"][1]])

# Height by sex, age band and race: measured (current cycle), all adults.
hh = cur.copy()
hh["race"] = hh.RIDRETH3.map(RACE_OF)
for sex in (1, 2):
    by_band = []
    for lo, hi in HEIGHT_BANDS:
        g0 = hh[(hh.RIAGENDR == sex) & hh.RIDAGEYR.between(lo, hi)]
        all_h = g0.BMXHT.values / 2.54
        m_all = wmean(all_h, g0.w.values)
        sd_all = math.sqrt(wmean((all_h - m_all) ** 2, g0.w.values))
        by_r = []
        for r in range(5):
            g = g0[g0.race == r]
            n = len(g)
            if n < 20:
                by_r.append([round(m_all, 2), round(sd_all, 2)])
                continue
            h = g.BMXHT.values / 2.54
            m = wmean(h, g.w.values)
            sd = math.sqrt(wmean((h - m) ** 2, g.w.values))
            k = n / (n + 10)  # shrink small groups toward the band's overall
            by_r.append([round(k * m + (1 - k) * m_all, 2), round(k * sd + (1 - k) * sd_all, 2)])
        by_band.append(by_r)
    cond["height"][str(sex)] = by_band
print("height women 20-39 by race [mean, sd]:", cond["height"]["2"][0])
health["cond"] = cond

# ------------------------------------------------------------ BRFSS 2024

SOCRATA = "https://data.cdc.gov/resource/{}.json?$limit=50000&$where={}"


def socrata(ds, where):
    cache = RAW / f'brfss-{ds}-{hashlib.sha256(where.encode()).hexdigest()[:12]}.json'
    if not cache.exists():
        with urlopen(SOCRATA.format(ds, quote(where)), timeout=60) as r:
            cache.write_text(json.dumps(json.load(r)))
    return pd.DataFrame(json.loads(cache.read_text()))


TOPICS = "(topic='Current Smoker Status' or topic='BMI Categories')"
metro = socrata("j32a-sa6u", f"year='2024' and break_out='Overall' and {TOPICS}")
state = socrata("dttw-5yxu", f"year='2024' and break_out='Overall' and {TOPICS}")


def rates(df, loc):
    out = {}
    for code, g in df.groupby(loc):
        v = dict(zip(g.response, pd.to_numeric(g.data_value, errors="coerce") / 100))
        n = pd.to_numeric(g.sample_size, errors="coerce").max()
        smoke = v.get("Yes")
        obese = v.get("Obese (BMI 30.0 - 99.8)")
        over = v.get("Overweight (BMI 25.0-29.9)")
        if any(x is None or not math.isfinite(x) for x in (smoke, obese, over)):
            continue  # suppressed in this area; fall back to the state
        out[code] = dict(smoke=smoke, obese=obese, over=obese + over, n=n, year=int(g.year.iloc[0]))
    return out


metro_r = rates(metro, "locationid")
state_r = rates(state, "locationabbr")
# Tennessee (and any other state) missing from 2024 falls back to 2023.
state23 = rates(socrata("dttw-5yxu", f"year='2023' and break_out='Overall' and {TOPICS}"), "locationabbr")
for k, v in state23.items():
    state_r.setdefault(k, v)
us = state_r["US"]
print(f"BRFSS 2024: {len(metro_r)} metro areas/divisions, {len(state_r)} states")

deline = pd.read_excel(RAW / "list1_2023.xlsx", header=2).dropna(subset=["FIPS County Code"])
deline["cbsa"] = deline["CBSA Code"].astype(str)
deline["div"] = deline["Metropolitan Division Code"].apply(lambda x: "" if pd.isna(x) else str(int(x)))
deline["county"] = (deline["FIPS State Code"].astype(int).map("{:02d}".format)
                    + deline["FIPS County Code"].astype(int).map("{:03d}".format))
div_to_cbsa = {r.div: r.cbsa for r in deline.itertuples() if r.div}
county_to_cbsa = dict(zip(deline.county, deline.cbsa))

# Metro divisions (e.g. the three NYC divisions) roll up to their CBSA,
# weighted by sample size.
by_cbsa: dict[str, list] = {}
for code, r in metro_r.items():
    cb = div_to_cbsa.get(code, code)
    by_cbsa.setdefault(cb, []).append(r)
metro_cbsa = {}
for cb, rs in by_cbsa.items():
    n = sum(r["n"] for r in rs)
    metro_cbsa[cb] = {k: sum(r[k] * r["n"] for r in rs) / n for k in ("smoke", "obese", "over")}
    metro_cbsa[cb]['year'] = 2024

logit = lambda p: math.log(p / (1 - p))  # noqa: E731

# ----------------------------------------------------------- 2024 election

pres = pd.read_csv(RAW / "pres2024_county.csv", dtype={"county_fips": str})
pres["county_fips"] = pres.county_fips.str.zfill(5)
county_votes = pres.groupby("county_fips")[["votes_dem", "votes_gop", "total_votes"]].sum()
state_lean = pres.groupby("state_name")[["votes_dem", "votes_gop", "total_votes"]].sum()

# ------------------------------------------------------------------ markets

idx = json.loads((OUT / "markets.json").read_text())
fips_to_abbr = pd.read_csv(RAW / "Geos20245YR.txt", sep="|", dtype=str, usecols=["SUMLEVEL", "STATE", "STUSAB"])
fips_to_abbr = dict(fips_to_abbr[fips_to_abbr.SUMLEVEL == "040"][["STATE", "STUSAB"]].values)
market_counties = json.loads((ROOT / "market_counties.json").read_text())

# Each place's adults by sex, age band, degree, race and partner status, and
# what the national models above predict for them: the local shift is how far
# the place's BRFSS rate sits from the US BRFSS rate, minus how far its make-up
# alone would put it (so composition isn't counted twice, and the
# self-report bias in BRFSS cancels).
import duckdb  # noqa: E402

comp = duckdb.sql(f"select * from '{ROOT / 'market_comp.parquet'}'").df()
comp["band"] = comp.band.astype(int)


def predicted(df, key):
    return float(np.average(predict(models[key], df.sex, df.band, df.ba, df.race, df.unp), weights=df.w))


us_pred = {k: predicted(comp, k) for k in ("smoke", "bmi25", "bmi30")}
pred_by_market = {m_id: {k: predicted(g, k) for k in ("smoke", "bmi25", "bmi30")} for m_id, g in comp.groupby("market")}

out_markets = {}
for m in idx["markets"]:
    cb = m.get("cbsa")
    counties = market_counties[m["id"]]
    st_fips = pd.Series([c[:2] for c in counties]).mode()
    st = fips_to_abbr.get(st_fips.iloc[0]) if len(st_fips) else None
    if cb in metro_cbsa:
        loc, src = metro_cbsa[cb], "metro"
    elif st in state_r:
        loc, src = state_r[st], "state"
    else:
        loc, src = us, "us"
    pm = pred_by_market.get(m["id"], us_pred)
    net = lambda key, pk: logit(loc[key]) - logit(us[key]) - (logit(pm[pk]) - logit(us_pred[pk]))  # noqa: E731
    rec = {
        "src": src, 'sourceYear': loc['year'],
        "smoke": round(net("smoke", "smoke"), 3),
        "obese": round(net("obese", "bmi30"), 3),
        "over": round(net("over", "bmi25"), 3),
        "localSmoke": round(loc["smoke"], 3),
        "localObese": round(loc["obese"], 3),
    }
    have = [c for c in counties if c in county_votes.index]
    if have:
        v = county_votes.loc[have].sum()
        two = v.votes_dem + v.votes_gop
        rec["dem"] = round(float(v.votes_dem / two), 3)
        rec["votes"] = int(v.total_votes)
    out_markets[m["id"]] = rec

missing_lean = [k for k, v in out_markets.items() if "dem" not in v]
print(f"markets: {len(out_markets)}; health src:",
      pd.Series([v['src'] for v in out_markets.values()]).value_counts().to_dict(),
      f"; no election data: {len(missing_lean)}", missing_lean[:5])

(OUT / "context.json").write_text(json.dumps(allow_nan=False, obj=
    dict(heights=heights, health=health, us={k: round(us[k], 4) for k in ("smoke", "obese", "over")},
         markets=out_markets), separators=(",", ":")))
print("wrote context.json")
