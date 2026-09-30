"""Which national survey rates would change most if made conditional?

For each filter the site applies as a national rate by sex and age only, and
each attribute it could be conditioned on, this reports how wrong the kept
share is for people in each group of that attribute, as a population-weighted
average of |log(kept share in the group / kept share overall)| ("typical
error"), plus the worst group. The comparison is within sex and age band
(unpartnered adults 25-44, or unmarried for the GSS), so it isolates what
conditioning would add on top of what the site already does.

Run from pipeline/: uv run python audit_conditioning.py
"""

import duckdb
import numpy as np
import pandas as pd
import pyreadstat

RAW = "raw/"
rows = []


def audit(target, by, df, keep, group, w="w", strata=("sex",)):
    """keep: 0/1 column (kept by the filter); group: conditioning column."""
    df = df[df[keep].notna() & df[group].notna() & (df[w] > 0)]
    errs, worst, worst_g = [], 0.0, ""
    for _, s in df.groupby(list(strata)):
        base = np.average(s[keep], weights=s[w])
        tot = s[w].sum()
        for gname, gg in s.groupby(group):
            if gg[w].sum() / tot < 0.02 or len(gg) < 30:
                continue
            k = np.average(gg[keep], weights=gg[w])
            e = abs(np.log(max(k, 1e-3) / max(base, 1e-3)))
            errs.append((e, gg[w].sum()))
            if e > worst:
                worst, worst_g = e, f"{gname}: {k:.0%} vs {base:.0%}"
    typ = sum(e * ww for e, ww in errs) / sum(ww for _, ww in errs)
    rows.append((target, by, typ, worst, worst_g))


# ---------------------------------------------------------------- NHANES
def load(pre, sfx, wcol, share):
    d = pd.read_sas(RAW + f"{pre}DEMO{sfx}.xpt")
    for f in ("BMX", "SMQ"):
        d = d.merge(pd.read_sas(RAW + f"{pre}{f}{sfx}.xpt"), on="SEQN", how="left")
    d["w"] = d[wcol] * share
    return d


nh = pd.concat([load("", "_L", "WTMEC2YR", 2 / 5.2), load("P_", "", "WTMECPRP", 3.2 / 5.2)])
nh = nh[nh.DMDMARTZ.isin([2, 3]) & nh.RIDAGEYR.between(25, 44)].copy()
nh["sex"] = nh.RIAGENDR
nh["race"] = nh.RIDRETH3.map({1: "Hispanic", 2: "Hispanic", 3: "White", 4: "Black", 6: "Asian", 7: "Other"})
nh["edu"] = nh.DMDEDUC2.map({1: "no BA", 2: "no BA", 3: "no BA", 4: "no BA", 5: "BA+"})
nh["inc"] = pd.cut(nh.INDFMPIR, [-1, 1.3, 3.5, 99], labels=["low", "mid", "high"])
nh["nonsmoker"] = np.where(nh.SMQ020.isna(), np.nan, 1.0 - ((nh.SMQ020 == 1) & nh.SMQ040.isin([1, 2])))
nh["bmi30"] = np.where(nh.BMXBMI.isna(), np.nan, (nh.BMXBMI < 30).astype(float))
nh["bmi25"] = np.where(nh.BMXBMI.isna(), np.nan, (nh.BMXBMI < 25).astype(float))
# Height: a typical filter in each direction (women no taller than 5'6",
# men at least 5'10"), as the share passing.
h = nh.BMXHT / 2.54
nh["height"] = np.where(h.isna(), np.nan, np.where(nh.sex == 2, (h < 66.5).astype(float), (h >= 69.5).astype(float)))
for target in ("nonsmoker", "bmi30", "bmi25", "height"):
    for by in ("edu", "race", "inc"):
        audit(target, by, nh, target, by)

# ------------------------------------------------------------------- GSS
g, _ = pyreadstat.read_dta(RAW + "gss7224_r3a.dta", usecols=["year", "age", "sex", "marital", "partyid", "race", "hispanic", "degree", "relig", "wtssps", "wtssall"],
                           apply_value_formats=False, encoding="cp1252")
g["w"] = g.wtssps.fillna(g.wtssall)
g = g[(g.year >= 2016) & g.marital.isin([2, 3, 4, 5]) & g.age.between(25, 44)].copy()
g["race"] = np.select([g.hispanic.fillna(1) > 1, g.race == 2, g.race == 1], ["Hispanic", "Black", "White"], "Other")
g["edu"] = np.select([g.degree >= 3, g.degree == 2], ["grad", "BA"], "no BA")
g["relg"] = g.relig.map({1: "Protestant", 2: "Catholic", 3: "Jewish", 4: "None"}).fillna("Other")
g.loc[g.relig.isna(), "relg"] = np.nan
g["party"] = np.select([g.partyid <= 2, g.partyid.between(4, 6)], ["D", "R"], "I")
g.loc[g.partyid.isna() | (g.partyid > 6), "party"] = np.nan
g["noR"] = np.where(g.party.isna(), np.nan, (g.party != "R").astype(float))
g["noD"] = np.where(g.party.isna(), np.nan, (g.party != "D").astype(float))
g["isNone"] = np.where(g.relg.isna(), np.nan, (g.relg == "None").astype(float))
g["isChristian"] = np.where(g.relg.isna(), np.nan, g.relg.isin(["Protestant", "Catholic"]).astype(float))
for target in ("noR", "noD"):
    for by in ("race", "relg", "edu"):
        audit(f"politics:{target}", by, g, target, by)
for target in ("isNone", "isChristian"):
    for by in ("race", "party", "edu"):
        audit(f"religion:{target}", by, g, target, by)

# ------------------------------------------------------------------ NSFG
parts = []
for name, sex, kc in (("Male", 1, "NUMBIOKID"), ("Fem", 2, "PARITY")):
    d = pd.read_csv(RAW + f"NSFG_2022_2023_{name}RespPUFData.csv", usecols=["AGER", "RMARITAL", "HIEDUC", "RWANT", "HISPRACE2", "RELIGION", "WGT2022_2023", kc])
    d = d[(d.RMARITAL >= 3) & d.AGER.between(25, 44) & d.RWANT.isin([1, 5, 9])].copy()
    d["sex"] = sex
    d["kids"] = ((d[kc].fillna(0) >= 1) & (d[kc].fillna(0) < 98)).astype(int)
    parts.append(d)
k = pd.concat(parts).rename(columns={"WGT2022_2023": "w"})
k["open"] = (k.RWANT != 5).astype(float)  # "rule out don't want kids" keeps these
k["race"] = k.HISPRACE2.map({1: "Hispanic", 2: "White", 3: "Black", 4: "Other"})
k["relg"] = k.RELIGION.map({1: "None", 2: "Catholic", 3: "Protestant", 4: "Other"})
k["edu"] = np.select([k.HIEDUC >= 9, k.HIEDUC == 8], ["grad", "BA"], "no BA")
for by in ("race", "relg", "edu", "kids"):
    audit("kids someday:open", by, k, "open", by)

# ------------------------------------------------------------------ PUMS
con = duckdb.connect()
p = con.execute(f"""
  select sex, pwgtp w,
    case when hisp <> 1 then 'Hispanic' when rac1p = 1 then 'White' when rac1p = 2 then 'Black' when rac1p = 6 then 'Asian' else 'Other' end race,
    case when schl >= 22 then 'grad' when schl = 21 then 'BA' else 'no BA' end edu,
    case when coalesce(pincp,0)*adjinc/1e6 >= 120000 then 3 when coalesce(pincp,0)*adjinc/1e6 >= 60000 then 2
         when coalesce(pincp,0)*adjinc/1e6 >= 25000 then 1 else 0 end inc,
    coalesce(pincp,0)*adjinc/1e9 k
  from (select *, pwgtp from '{RAW}pums.parquet') where age between 25 and 44 and mar <> 1
""").df() if False else None
# pums.parquet keeps w (person weight) under the name w.
p = con.execute(f"""
  select sex, w,
    case when hisp <> 1 then 'Hispanic' when rac1p = 1 then 'White' when rac1p = 2 then 'Black' when rac1p = 6 then 'Asian' else 'Other' end race,
    case when schl >= 22 then 'grad' when schl = 21 then 'BA' else 'no BA' end edu,
    case when coalesce(pincp,0)*adjinc/1e6 >= 120000 then 3 when coalesce(pincp,0)*adjinc/1e6 >= 60000 then 2
         when coalesce(pincp,0)*adjinc/1e6 >= 25000 then 1 else 0 end inc,
    coalesce(pincp,0)*adjinc/1e9 k
  from '{RAW}pums.parquet' where age between 25 and 44 and mar <> 1
""").df()
for r in ("White", "Black", "Hispanic", "Asian"):
    p[f"is{r}"] = (p.race == r).astype(float)
    for by in ("edu", "inc"):
        audit(f"race:{r}", by, p, f"is{r}", by)
b = p[p.inc == 2].copy()  # the $60-120k bracket
b["over85"] = (b.k >= 85).astype(float)
audit("income:$85k+ within $60-120k", "edu", b, "over85", "edu")

out = pd.DataFrame(rows, columns=["filter", "conditioned on", "typical", "worst", "worst group"])
out["typical ×"] = np.exp(out.typical).round(2)
out["worst ×"] = np.exp(out.worst).round(2)
pd.set_option("display.width", 200)
print(out.sort_values("typical", ascending=False)[["filter", "conditioned on", "typical ×", "worst ×", "worst group"]].to_string(index=False))
