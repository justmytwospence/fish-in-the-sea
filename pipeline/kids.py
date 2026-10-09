"""Whether unpartnered adults want (more) children: NSFG 2022-2023.

RWANT, asked of men and women alike: "Do you, yourself, want to have
a(nother) baby at some time in the future?" Yes, no, or don't know (refusals
dropped). Unpartnered = not married and not cohabiting (RMARITAL 3-6).

Outputs web/public/data/kids.json:
  bands                          age bands (the NSFG covers ages 15-49)
  rates[sex][band][edu][race]      [wants, unsure, doesn't want], where edu is 0 no
                                 bachelor's, 1 bachelor's, 2 graduate degree,
                                 and race follows the site (0 White, 1 Black,
                                 2 Hispanic, 3 Asian, 4 other; the public NSFG
                                 only separates Hispanic, White, Black and
                                 other, so Asian and other share a rate)
Biological parenthood is marginalized, not substituted for ACS children at home.
Each cell is shrunk toward its parent (race toward sex x band x education,
then toward sex x band) with K
pseudo-observations.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from survey_codes import nsfg_valid_mask

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"
BANDS = [(18, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 49)]
K = 20.0


def load(name: str, sex: int) -> pd.DataFrame:
    cols = ['AGER','RMARITAL','HIEDUC','RWANT','HISPRACE2','WGT2022_2023']
    d = pd.read_csv(RAW / f"NSFG_2022_2023_{name}RespPUFData.csv", usecols=cols)
    d = d[nsfg_valid_mask(d)].copy()
    d['sex'] = sex
    d["edu"] = np.select([d.HIEDUC >= 9, d.HIEDUC == 8], [2, 1], 0)
    d["want"] = d.RWANT.map({1: 0, 9: 1, 5: 2})
    d["band"] = pd.cut(d.AGER, [lo - 1 for lo, _ in BANDS] + [BANDS[-1][1]], labels=False)
    d["nrace"] = d.HISPRACE2.map({1: 2, 2: 0, 3: 1, 4: 3})  # NSFG: Hispanic, White, Black, other
    return d.rename(columns={"WGT2022_2023": "w"})[['sex','band','edu','nrace','want','w']]


d = pd.concat([load('Male',1),load('Fem',2)])
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
        # Marginalize biological parenthood. Children currently at home in
        # ACS is not the same variable, so it must not index NSFG parity.
        by_edu = []
        for e in range(3):
            se = sb[sb.edu == e]
            ke = shrink(dist(se), top)
            by_edu.append([shrink(dist(se[se.nrace == min(r, 3)]), ke).tolist() for r in range(5)])
        rates[str(sex)].append(by_edu)
        print(f"  sex {sex} {BANDS[b]} n={len(sb):4d} all={top.round(2)}")

(OUT / "kids.json").write_text(json.dumps(dict(schemaVersion=2, bands=BANDS, rates=rates, conditioning=['sex', 'age', 'education', 'race'],
         limitation='Biological parenthood marginalized; not conditioned on children at home. Ages 18-49 only.'), separators=(",", ":")))
print("wrote kids.json")
