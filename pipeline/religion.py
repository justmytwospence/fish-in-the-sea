"""Religion: national rates and pairing from the General Social Survey, with
local shifts by state or metro.

Categories: 0 Protestant (incl. nondenominational Christian), 1 Catholic,
2 Latter-day Saint, 3 Jewish, 4 other religion, 5 none.

Outputs web/public/data/religion.json:
  bands, national[sex][band][6]  P(religion | sex, age band) among unmarried
                                 adults, GSS 2016-2024 (weighted)
  pairing[dir][6][6]             log affinity of chooser religion x partner
                                 religion from GSS married couples under 45,
                                 relative to random pairing (observed /
                                 expected from the margins)
  markets[id][6]                 log shift of the local composition vs. the
                                 national one (from local.csv, see README)
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadstat

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"

BANDS = [(18, 24), (25, 34), (35, 44), (45, 54), (55, 64), (65, 99)]
NREL = 6
LDS = {60, 64, 162}

cols = ["year", "age", "sex", "marital", "relig", "other", "sprel", "spother", "wtssps", "wtssall"]
df, _ = pyreadstat.read_dta(RAW / "gss7224_r3a.dta", usecols=cols, apply_value_formats=False, encoding="cp1252")
df["w"] = df.wtssps.fillna(df.wtssall)


def code(relig, other):
    if pd.isna(relig):
        return np.nan
    r = int(relig)
    if r in (1, 11, 13):
        return 2 if (not pd.isna(other) and int(other) in LDS) else 0
    return {2: 1, 3: 3, 4: 5}.get(r, 4 if r in (5, 6, 7, 8, 9, 10, 12) else np.nan)


df["rel"] = [code(a, b) for a, b in zip(df.relig, df.other)]
df["sprl"] = [code(a, b) for a, b in zip(df.sprel, df.spother)]


def band(a):
    for i, (lo, hi) in enumerate(BANDS):
        if lo <= a <= hi:
            return i
    return -1


# National: unmarried adults (widowed, divorced, separated, never married).
un = df[(df.year >= 2016) & df.marital.isin([2, 3, 4, 5]) & df.rel.notna() & df.age.between(18, 99) & (df.w > 0)].copy()
un["band"] = un.age.astype(int).apply(band)
national = {}
for sex in (1, 2):
    rows = []
    for b in range(len(BANDS)):
        g = un[(un.sex == sex) & (un.band == b)]
        v = np.array([g.w[g.rel == r].sum() for r in range(NREL)]) + 0.5  # small prior
        rows.append((v / v.sum()).round(4).tolist())
    national[str(sex)] = rows
print("national (women 25-34):", national["2"][1], "n unmarried:", len(un))

# Pairing: married respondents under 45 with both religions known.
cp = df[(df.year >= 2000) & (df.marital == 1) & df.rel.notna() & df.sprl.notna() & (df.age < 45) & (df.w > 0)]
pairing = {}
for resp_sex, key in ((2, "21"), (1, "12")):
    g = cp[cp.sex == resp_sex]
    m = np.zeros((NREL, NREL)) + 0.5
    for x, y, w in zip(g.rel.astype(int), g.sprl.astype(int), g.w):
        m[x, y] += w
    expected = np.outer(m.sum(1), m.sum(0)) / m.sum()
    aff = np.log(m / expected)
    pairing[key] = aff.round(3).tolist()
    print(key, "n", len(g), "diag", np.diag(aff).round(2))
# Same-sex couples aren't identifiable here; use the average of both directions.
avg = ((np.array(pairing["21"]) + np.array(pairing["12"])) / 2).round(3).tolist()
pairing["11"] = avg
pairing["22"] = avg

# Local shifts: log(local share / national share) from the Pew Religious
# Landscape Study 2023-24 (states and 34 metros; see README). Small samples
# are shrunk toward the national shares with a prior worth K respondents.
K = 100
CATS = ["protestant", "catholic", "lds", "jewish", "other_religion", "unaffiliated"]
pew = pd.read_csv(RAW / "pew_rls_2023_24.csv", dtype={"geo_code": str})
nat = pew[pew.geo_type == "nation"].iloc[0]
shift_of = {}
for r in pew.itertuples():
    n = r.n_unweighted
    shares = []
    for c in CATS:
        p_nat = nat[f"share_{c}"]
        p = (n * getattr(r, f"share_{c}") + K * p_nat) / (n + K)
        shares.append(round(math.log(max(p, 0.05) / max(p_nat, 0.05)), 3))
    shift_of[r.geo_code] = shares
idx = json.loads((OUT / "markets.json").read_text())
market_counties = json.loads((ROOT / "market_counties.json").read_text())
abbr = pd.read_csv(RAW / "Geos20245YR.txt", sep="|", dtype=str, usecols=["SUMLEVEL", "STATE", "STUSAB"])
fips_to_abbr = dict(abbr[abbr.SUMLEVEL == "040"][["STATE", "STUSAB"]].values)
markets = {}
src = {"metro": 0, "state": 0}
for m_ in idx["markets"]:
    cb = m_.get("cbsa")
    if cb in shift_of:
        markets[m_["id"]] = shift_of[cb]
        src["metro"] += 1
        continue
    sts = pd.Series([c[:2] for c in market_counties[m_["id"]]]).mode()
    st = fips_to_abbr.get(sts.iloc[0]) if len(sts) else None
    if st in shift_of:
        markets[m_["id"]] = shift_of[st]
        src["state"] += 1
print("local shifts:", src)

(OUT / "religion.json").write_text(json.dumps(
    dict(bands=BANDS, national=national, pairing=pairing, markets=markets), separators=(",", ":")))
print("wrote religion.json")
