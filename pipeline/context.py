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
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

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
un["smoker"] = ((un.SMQ020 == 1) & un.SMQ040.isin([1, 2])).astype(float)
un.loc[un.SMQ020.isna(), "smoker"] = np.nan
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
print("health", health)

# ------------------------------------------------------------ BRFSS 2024

SOCRATA = "https://data.cdc.gov/resource/{}.json?$limit=50000&$where={}"


def socrata(ds, where):
    with urlopen(SOCRATA.format(ds, quote(where))) as r:
        return pd.DataFrame(json.load(r))


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
        out[code] = dict(smoke=smoke, obese=obese, over=obese + over, n=n)
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

logit = lambda p: math.log(p / (1 - p))  # noqa: E731

# ----------------------------------------------------------- 2024 election

pres = pd.read_csv(RAW / "pres2024_county.csv", dtype={"county_fips": str})
pres["county_fips"] = pres.county_fips.str.zfill(5)
pres["cbsa"] = pres.county_fips.map(county_to_cbsa)
lean = pres.dropna(subset=["cbsa"]).groupby("cbsa")[["votes_dem", "votes_gop", "total_votes"]].sum()
state_lean = pres.groupby("state_name")[["votes_dem", "votes_gop", "total_votes"]].sum()

# ------------------------------------------------------------------ markets

idx = json.loads((OUT / "markets.json").read_text())
fips_to_abbr = pd.read_csv(RAW / "Geos20245YR.txt", sep="|", dtype=str, usecols=["SUMLEVEL", "STATE", "STUSAB"])
fips_to_abbr = dict(fips_to_abbr[fips_to_abbr.SUMLEVEL == "040"][["STATE", "STUSAB"]].values)
counties_by_cbsa = deline.groupby("cbsa").county.apply(list).to_dict()

out_markets = {}
for m in idx["markets"]:
    cb = m.get("cbsa")
    counties = counties_by_cbsa.get(cb, [])
    st_fips = pd.Series([c[:2] for c in counties]).mode()
    st = fips_to_abbr.get(st_fips.iloc[0]) if len(st_fips) else None
    if cb in metro_cbsa:
        loc, src = metro_cbsa[cb], "metro"
    elif st in state_r:
        loc, src = state_r[st], "state"
    else:
        loc, src = us, "us"
    rec = {
        "src": src,
        "smoke": round(logit(loc["smoke"]) - logit(us["smoke"]), 3),
        "obese": round(logit(loc["obese"]) - logit(us["obese"]), 3),
        "over": round(logit(loc["over"]) - logit(us["over"]), 3),
        "localSmoke": round(loc["smoke"], 3),
        "localObese": round(loc["obese"], 3),
    }
    if cb in lean.index:
        v = lean.loc[cb]
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
