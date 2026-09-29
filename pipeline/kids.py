"""Whether unpartnered adults want (more) children: NSFG 2022-2023.

RWANT, asked of men and women alike: "Do you, yourself, want to have
a(nother) baby at some time in the future?" Yes, no, or don't know (refusals
dropped). Unpartnered = not married and not cohabiting (RMARITAL 3-6).

Outputs web/public/data/kids.json:
  bands                          age bands (the NSFG covers ages 15-49)
  rates[sex][band][kids][edu]    [wants, unsure, doesn't want], where kids is
                                 whether they have any biological children
                                 (women PARITY, men NUMBIOKID) and edu is 0 no
                                 bachelor's, 1 bachelor's, 2 graduate degree
Each cell is shrunk toward its sex x band x kids margin, and that toward sex x
band, with K pseudo-observations.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"
BANDS = [(18, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 49)]
K = 20.0


def load(name: str, sex: int, kids_col: str) -> pd.DataFrame:
    cols = ["AGER", "RMARITAL", "HIEDUC", "RWANT", "WGT2022_2023", kids_col]
    d = pd.read_csv(RAW / f"NSFG_2022_2023_{name}RespPUFData.csv", usecols=cols)
    d = d[(d.RMARITAL >= 3) & d.AGER.between(18, 49) & d.RWANT.isin([1, 5, 9])].copy()
    d["sex"] = sex
    n = d[kids_col].fillna(0)
    d["kids"] = ((n >= 1) & (n < 98)).astype(int)
    d["edu"] = np.select([d.HIEDUC >= 9, d.HIEDUC == 8], [2, 1], 0)
    d["want"] = d.RWANT.map({1: 0, 9: 1, 5: 2})
    d["band"] = pd.cut(d.AGER, [lo - 1 for lo, _ in BANDS] + [BANDS[-1][1]], labels=False)
    return d.rename(columns={"WGT2022_2023": "w"})[["sex", "band", "kids", "edu", "want", "w"]]


d = pd.concat([load("Male", 1, "NUMBIOKID"), load("Fem", 2, "PARITY")])
print(f"unpartnered 18-49: {len(d)} respondents")


def dist(g: pd.DataFrame) -> tuple[np.ndarray, float]:
    """Weighted [wants, unsure, doesn't want] and Kish effective n."""
    v = np.array([g.w[g.want == k].sum() for k in range(3)])
    n = g.w.sum() ** 2 / (g.w**2).sum() if len(g) else 0.0
    return (v / v.sum() if v.sum() > 0 else np.full(3, 1 / 3)), n


def shrink(child: tuple[np.ndarray, float], parent: np.ndarray) -> np.ndarray:
    p, n = child
    return (n * p + K * parent) / (n + K)


rates: dict = {}
for sex in (1, 2):
    rates[str(sex)] = []
    for b in range(len(BANDS)):
        sb = d[(d.sex == sex) & (d.band == b)]
        top, _ = dist(sb)
        by_kids = []
        for kids in (0, 1):
            sk = sb[sb.kids == kids]
            mid = shrink(dist(sk), top)
            by_kids.append([shrink(dist(sk[sk.edu == e]), mid).round(4).tolist() for e in range(3)])
        rates[str(sex)].append(by_kids)
        print(f"  sex {sex} {BANDS[b]} n={len(sb):4d} all={top.round(2)} "
              f"no kids BA={by_kids[0][1]} kids noBA={by_kids[1][0]}")

(OUT / "kids.json").write_text(json.dumps(dict(bands=BANDS, rates=rates), separators=(",", ":")))
print("wrote kids.json")
