"""Political leaning: national rates, pairing, and local shifts.

Categories (party identification, leaners counted with their party):
0 Democrat, 1 independent/other, 2 Republican.

Outputs web/public/data/politics.json:
  bands, national[sex][band][3]  P(party | sex, age band) among unmarried
                                 adults, GSS 2016-2024 (weighted)
  pairing[dir][3][3]             log affinity of chooser party x partner
                                 party among couples in HCMST 2017, relative
                                 to random pairing
  markets[id]                    log-odds shift of the 2024 two-party
                                 Democratic share vs. the national share
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
NPOL = 3


def band(a):
    for i, (lo, hi) in enumerate(BANDS):
        if lo <= a <= hi:
            return i
    return -1


# National: GSS unmarried adults.
g, _ = pyreadstat.read_dta(RAW / "gss7224_r3a.dta", usecols=["year", "age", "sex", "marital", "partyid", "wtssps", "wtssall"],
                           apply_value_formats=False, encoding="cp1252")
g["w"] = g.wtssps.fillna(g.wtssall)
g = g[(g.year >= 2016) & g.marital.isin([2, 3, 4, 5]) & g.partyid.notna() & g.age.between(18, 99) & (g.w > 0)].copy()
g["pol"] = g.partyid.astype(int).map(lambda v: 0 if v <= 2 else 2 if 4 <= v <= 6 else 1)
g["band"] = g.age.astype(int).apply(band)
national = {}
for sex in (1, 2):
    rows = []
    for b in range(len(BANDS)):
        s = g[(g.sex == sex) & (g.band == b)]
        v = np.array([s.w[s.pol == k].sum() for k in range(NPOL)]) + 0.5
        rows.append((v / v.sum()).round(4).tolist())
    national[str(sex)] = rows
print("national (women 25-34 D/I/R):", national["2"][1], "n:", len(g))

# Pairing: HCMST 2017 couples, respondent party x partner party.
h, _ = pyreadstat.read_dta(RAW / "hcmst2017.dta", usecols=["w1_partyid7", "w1_q12", "w1_ppgender", "w1_ppage", "w1_weight_combo"],
                           apply_value_formats=False, encoding="cp1252")
h = h[(h.w1_partyid7 > 0) & (h.w1_q12 > 0) & (h.w1_ppage < 60) & (h.w1_weight_combo > 0)]
code7 = lambda v: 0 if v >= 5 else 2 if v <= 3 else 1  # noqa: E731
pairing = {}
for gender, key in ((2, "21"), (1, "12")):
    s = h[h.w1_ppgender == gender]
    m = np.zeros((NPOL, NPOL)) + 0.5
    for a, b, w in zip(s.w1_partyid7, s.w1_q12, s.w1_weight_combo):
        m[code7(int(a)), code7(int(b))] += w
    expected = np.outer(m.sum(1), m.sum(0)) / m.sum()
    pairing[key] = np.log(m / expected).round(3).tolist()
    print(key, "n", len(s), "diag", np.diag(np.log(m / expected)).round(2))
avg = ((np.array(pairing["21"]) + np.array(pairing["12"])) / 2).round(3).tolist()
pairing["11"] = avg
pairing["22"] = avg

# Local: 2024 two-party vote by metro vs. national.
ctx = json.loads((OUT / "context.json").read_text())
pres = pd.read_csv(RAW / "pres2024_county.csv")
nat_dem = pres.votes_dem.sum() / (pres.votes_dem.sum() + pres.votes_gop.sum())
logit = lambda p: math.log(p / (1 - p))  # noqa: E731
markets = {k: round(logit(v["dem"]) - logit(nat_dem), 3) for k, v in ctx["markets"].items() if "dem" in v}
print(f"national two-party D {nat_dem:.3f}; {len(markets)} markets with local vote")

(OUT / "politics.json").write_text(json.dumps(
    dict(bands=BANDS, national=national, pairing=pairing, markets=markets, nationalDem=round(float(nat_dem), 4)),
    separators=(",", ":")))
print("wrote politics.json")
