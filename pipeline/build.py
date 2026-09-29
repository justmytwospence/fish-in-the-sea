"""Build static data for the dating-pool calculator.

Inputs (pipeline/raw/): ACS 2020-2024 5-year table-based summary files, the
2020-2024 5-year PUMS person file (as pums.parquet), the 2020 tract->PUMA
relationship file and the July 2023 CBSA delineation file.

Outputs (web/public/data/):
  markets.json   searchable index of markets and the places inside them
  global.json    division age shares, partner-age CDFs
  m/<id>.json    per-market counts (B12002) and PUMS attribute distributions
"""

import json
import math
import re
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"
YEAR = "2024"

# B12002 age bins (index 0 = 15-17 is dropped; we only model adults).
BINS = [(18, 19), (20, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 49),
        (50, 54), (55, 59), (60, 64), (65, 74), (75, 84), (85, 99)]
# Marital groups used throughout: never married, separated, widowed,
# divorced, married (spouse present or otherwise absent).
MARG = ["nm", "sep", "wid", "div", "mar"]
SHRINK_K = 20.0  # pseudo-observations pulling sparse markets toward division
MIN_STANDALONE_POP = 10_000

con = duckdb.connect()


def read_table(table: str) -> pd.DataFrame:
    path = RAW / f"acsdt5y{YEAR}-{table.lower()}.dat"
    return con.execute(
        f"select * from read_csv('{path}', delim='|', header=true, all_varchar=true)"
    ).df()


def num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def b12002_line(sex: int, marg: str, bin_i: int) -> list[int]:
    """Table line numbers for a sex (1 male, 2 female), marital group and bin."""
    base = 2 if sex == 1 else 95
    offsets = {"nm": [2], "sep": [34], "wid": [64], "div": [79], "mar": [18, 49]}
    # Offsets point at each block's 15-17 line; +1 skips it.
    return [base + o + 1 + bin_i for o in offsets[marg]]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------------------------------------------------------------- geography

print("geography")
geos = con.execute(
    f"select SUMLEVEL, COMPONENT, STATE, COUNTY, PLACE, CBSA, DIVISION, GEO_ID, NAME, STUSAB "
    f"from read_csv('{RAW}/Geos{YEAR}5YR.txt', delim='|', header=true, all_varchar=true) "
    f"where COMPONENT = '00' and SUMLEVEL in ('040','050','070','140','160','310')"
).df()
pop = read_table("B01003")[["GEO_ID", "B01003_E001"]].rename(columns={"B01003_E001": "pop"})
pop["pop"] = num(pop["pop"])
geos = geos.merge(pop, on="GEO_ID", how="left")

deline = pd.read_excel(RAW / "list1_2023.xlsx", header=2).dropna(subset=["FIPS County Code"])
deline["county"] = (deline["FIPS State Code"].astype(int).map("{:02d}".format)
                    + deline["FIPS County Code"].astype(int).map("{:03d}".format))
deline["cbsa"] = deline["CBSA Code"].astype(str)
county_cbsa = dict(zip(deline["county"], deline["cbsa"]))

# Census divisions (the Geos file leaves DIVISION blank on state rows).
DIVISIONS = {
    1: "09 23 25 33 44 50", 2: "34 36 42", 3: "17 18 26 39 55",
    4: "19 20 27 29 31 38 46", 5: "10 11 12 13 24 37 45 51 54",
    6: "01 21 28 47", 7: "05 22 40 48", 8: "04 08 16 30 32 35 49 56",
    9: "02 06 15 41 53",
}
state_div = {st: d for d, sts in DIVISIONS.items() for st in sts.split()}
state_abbr = {r.STATE: r.STUSAB for r in geos[geos.SUMLEVEL == "040"].itertuples()}

# Markets: every CBSA (outside Puerto Rico) plus sizable places outside CBSAs.
cbsas = geos[(geos.SUMLEVEL == "310") & ~geos.NAME.str.contains(", PR ")].copy()
cbsas = cbsas[~cbsas.NAME.str.endswith("PR Metro Area") & ~cbsas.NAME.str.endswith("PR Micro Area")]

# Place -> county with the largest share of the place's population (SL 070
# rows are state-county-cousub-place pieces).
parts = geos[geos.SUMLEVEL == "070"].copy()
parts["place"] = parts.STATE + parts.PLACE
parts["county"] = parts.STATE + parts.COUNTY
parts = parts.groupby(["place", "county"], as_index=False)["pop"].sum()
place_county = parts.sort_values("pop").groupby("place").tail(1).set_index("place")["county"]

places = geos[(geos.SUMLEVEL == "160") & (geos.STATE != "72")].copy()
places["place"] = places.STATE + places.PLACE
places["county"] = places.place.map(place_county)
places["cbsa"] = places.county.map(county_cbsa)

markets = []
for r in cbsas.itertuples():
    kind = "metro" if r.NAME.endswith("Metro Area") else "micro"
    name = re.sub(r" (Metro|Micro) Area$", "", r.NAME)
    counties = [c for c, cb in county_cbsa.items() if cb == r.CBSA]
    divs = pd.Series([state_div[c[:2]] for c in counties])
    if not counties:
        print("  no counties:", r.CBSA, r.NAME); continue
    markets.append(dict(id=f"{slug(name)}-{r.CBSA}", geo_id=r.GEO_ID, name=name, kind=kind,
                        pop=int(r.pop), counties=counties, division=divs.mode()[0],
                        cbsa=r.CBSA))
standalone = places[places.cbsa.isna() & (places["pop"] >= MIN_STANDALONE_POP)]
for r in standalone.itertuples():
    name = re.sub(r" (city|town|village|borough|CDP|municipality)(?=,)", "", r.NAME)
    st = state_abbr[r.STATE]
    name = name.split(",")[0] + f", {st}"
    markets.append(dict(id=f"{slug(name)}-{r.place}", geo_id=r.GEO_ID, name=name, kind="city",
                        pop=int(r.pop), counties=[r.county], division=state_div[r.STATE],
                        place=r.place))
mk = pd.DataFrame(markets)
print(f"  {len(mk)} markets ({(mk.kind == 'metro').sum()} metro, "
      f"{(mk.kind == 'micro').sum()} micro, {(mk.kind == 'city').sum()} standalone places)")

# ------------------------------------------------------ PUMA -> market weights

print("puma weights")
tp = pd.read_csv(RAW / "2020_Census_Tract_to_2020_PUMA.txt", dtype=str, encoding="utf-8-sig")
tracts = geos[geos.SUMLEVEL == "140"][["GEO_ID", "pop"]].copy()
tracts["st"] = tracts.GEO_ID.str[9:11]
tracts["county"] = tracts.GEO_ID.str[9:14]
tracts["tract"] = tracts.GEO_ID.str[14:20]
# Connecticut's county equivalents changed after 2020 but tract codes did not,
# so join on state + tract.
tp["st"] = tp.STATEFP
tp["tract"] = tp.TRACTCE
tracts = tracts.merge(tp[["st", "tract", "PUMA5CE"]], on=["st", "tract"], how="inner")
tracts["puma"] = tracts.st.astype(int) * 100000 + tracts.PUMA5CE.astype(int)
puma_county = tracts.groupby(["puma", "county"], as_index=False)["pop"].sum()
puma_tot = puma_county.groupby("puma")["pop"].transform("sum")
puma_county["frac"] = puma_county["pop"] / puma_tot  # share of PUMA pop in county

rows = []
for m in markets:
    sub = puma_county[puma_county.county.isin(m["counties"])]
    f = sub.groupby("puma")["frac"].sum()
    for puma, frac in f.items():
        rows.append((m["id"], int(puma), float(frac)))
pw = pd.DataFrame(rows, columns=["market", "stpuma", "f"])
con.register("pw", pw)

# ------------------------------------------------------------- PUMS persons

print("pums")
PQ = RAW / "pums.parquet"
con.execute(f"""
create or replace table p as
with hh as (
  select SERIALNO,
    max(case when rel in (22,24) then 1 else 0 end) as has_partner,
    max(case when rel in (25,26,27) and age < 18 then 1 else 0 end) as has_hh_kid,
    max(case when rel = 30 and age < 18 then 1 else 0 end) as has_grandkid
  from '{PQ}' group by 1
)
select p.*, st*100000 + puma as stpuma,
  case mar when 5 then 0 when 4 then 1 when 2 then 2 when 3 then 3 else 4 end as marg,
  case when rel = 37 then 1 else 0 end as inst,
  case when rel in (22,24) or (rel = 20 and hh.has_partner = 1) then 1 else 0 end as cohab,
  case when schl >= 22 then 2 when schl = 21 then 1 else 0 end as edu,
  case
    when sex = 2 then case when paoc in (1,2,3) then 1 else 0 end
    when rel in (20,21,23) and hh.has_hh_kid = 1 then 1
    when rel in (25,26,27) and hh.has_grandkid = 1 then 1
    else 0 end as kids,
  case when coalesce(pincp, 0) * adjinc / 1e6 >= 120000 then 3
       when coalesce(pincp, 0) * adjinc / 1e6 >= 60000 then 2
       when coalesce(pincp, 0) * adjinc / 1e6 >= 25000 then 1 else 0 end as inc,
  case when rel in (25,26,27) then 1 else 0 end as par,
  case {' '.join(f"when age between {lo} and {hi} then {i}" for i, (lo, hi) in enumerate(BINS))}
       else -1 end as bin
from '{PQ}' p join hh using (SERIALNO)
where age >= 18
""")
div_of_state = {int(k): int(v) for k, v in state_div.items()}
con.execute("create or replace table stdiv (st int, division int)")
con.executemany("insert into stdiv values (?, ?)", list(div_of_state.items()))

# Attribute cell: 0..95 = (((cohab*3 + edu)*2 + kids)*2 + par)*4 + inc, where
# par = lives with parents (child of the householder) and inc is the income
# bracket (<25k, 25-60k, 60-120k, 120k+ in 2024 dollars); 96 = institutional
# group quarters.
CELL = "case when inst = 1 then 96 else (((cohab*3 + edu)*2 + kids)*2 + par)*4 + inc end"
NCELL = 97


def dist(df: pd.DataFrame, keys: list[str]) -> dict:
    """Pivot weighted cell sums to {key tuple: (proportions[NCELL], n_eff)}."""
    out = {}
    for k, g in df.groupby(keys):
        w = np.zeros(NCELL)
        w[g.cell.values] = g.w.values
        sw, sw2 = g.w.sum(), g.w2.sum()
        if sw <= 0:
            continue
        out[k if isinstance(k, tuple) else (k,)] = (w / sw, sw * sw / sw2)
    return out


unmarried = "marg < 4"
nat = dist(con.execute(f"""
  select sex, bin, marg, {CELL} cell, sum(w) w, sum(w*w) w2 from p
  where {unmarried} group by all""").df(), ["sex", "bin", "marg"])
divd = dist(con.execute(f"""
  select division, sex, bin, marg, {CELL} cell, sum(w) w, sum(w*w) w2 from p join stdiv using (st)
  where {unmarried} group by all""").df(), ["division", "sex", "bin", "marg"])
mkt = con.execute(f"""
  select market, sex, bin, marg, {CELL} cell, sum(w*f) w, sum(w*w*f*f) w2
  from p join pw using (stpuma) where {unmarried} group by all""").df()
mktd = dist(mkt, ["market", "sex", "bin", "marg"])


def shrink(child, parent, k=SHRINK_K):
    if child is None:
        return parent[0], 0.0
    p, n = child
    return (n * p + k * parent[0]) / (n + k), n


# Single-year age share within each bin, by division x sex x marital group.
ages = con.execute("""
  select division, sex, marg, bin, age, sum(w) w from p join stdiv using (st)
  where bin >= 0 group by all""").df()
ages["share"] = ages.w / ages.groupby(["division", "sex", "marg", "bin"]).w.transform("sum")
age_shares = {}
for (d, s, mg), g in ages.groupby(["division", "sex", "marg"]):
    arr = []
    for i, (lo, hi) in enumerate(BINS):
        gg = g[g.bin == i].set_index("age").share
        arr.append([round(float(gg.get(a, 0.0)), 5) for a in range(lo, hi + 1)])
    age_shares.setdefault(str(d), {}).setdefault(str(s), {})[MARG[mg]] = arr

# Partner-age CDFs from recently formed couples (married within 5 years of
# the survey year, or cohabiting), national, both members of each couple.
couples = con.execute("""
  with c as (
    select SERIALNO, rel, age, sex, w, marhyp, cast(substr(SERIALNO,1,4) as int) yr
    from p where rel in (20,21,22,23,24)
  ), h as (select * from c where rel = 20), s as (select * from c where rel in (21,22,23,24))
  select h.age a1, h.sex s1, s.age a2, s.sex s2, h.w w
  from h join s using (SERIALNO)
  where s.rel in (22,24) or (s.marhyp >= s.yr - 5)
""").df()
both = pd.concat([
    couples.rename(columns={"a1": "own", "s1": "osex", "a2": "pa", "s2": "psex"}),
    couples.rename(columns={"a2": "own", "s2": "osex", "a1": "pa", "s1": "psex"}),
])[["own", "osex", "pa", "psex", "w"]]
AGE_MIN, AGE_MAX = 18, 90
both["pa"] = both.pa.clip(AGE_MIN, AGE_MAX)
cdfs = {}
for (os_, ps), g in both.groupby(["osex", "psex"]):
    bw = 2 if os_ != ps else 5  # wider pooling for thinner same-sex samples
    tab = g.groupby(["own", "pa"]).w.sum().unstack(fill_value=0).reindex(
        index=range(AGE_MIN, 100), columns=range(AGE_MIN, AGE_MAX + 1), fill_value=0)
    m = tab.values.astype(float)
    rowsout = []
    for i, own in enumerate(range(AGE_MIN, AGE_MAX + 1)):
        lo, hi = max(0, i - bw), min(m.shape[0], i + bw + 1)
        # Pool neighbouring own-ages after shifting so the age *gap* is kept.
        acc = np.zeros(m.shape[1])
        for j in range(lo, hi):
            shift = i - j
            row = np.roll(m[j], shift)
            if shift > 0:
                row[:shift] = 0
            elif shift < 0:
                row[shift:] = 0
            acc += row * (1 - abs(shift) / (bw + 1))
        c = np.cumsum(acc) / acc.sum()
        rowsout.append([round(float(x), 4) for x in c])
    cdfs[f"{os_}{ps}"] = rowsout
print("  couples:", len(couples), {k: len(g) for k, g in both.groupby(['osex', 'psex'])})

# ----------------------------------------------------------- market counts

print("counts")
want = {m["geo_id"] for m in markets}
b12 = read_table("B12002")
b12 = b12[b12.GEO_ID.isin(want)].set_index("GEO_ID").apply(num)
b01 = read_table("B01001")
b01 = b01[b01.GEO_ID.isin(want)].set_index("GEO_ID").apply(num)


# Vintage 2025 population estimates (July 1, 2025) by CBSA, sex and single
# year of age. ACS 5-year counts are centered around 2022; we rake each
# sex x age bin to the 2025 total and keep the ACS marital-status mix.
pep = con.execute(f"""
  select lpad(CBSA::varchar, 5, '0') cbsa, AGE age, TOT_MALE m, TOT_FEMALE f
  from read_csv('{RAW}/cbsa-est2025-syasex.csv') where SUMLEV = 310 and YEAR = 7
""").df()
pep_by = {c: g.set_index("age") for c, g in pep.groupby("cbsa")}
PEP_VINTAGE = "Vintage 2025 population estimates (July 1, 2025)"


def cell_est(geo: str, sex: int, marg: str, bin_i: int) -> tuple[float, float]:
    est = moe2 = 0.0
    for ln in b12002_line(sex, marg, bin_i):
        e = b12.at[geo, f"B12002_E{ln:03d}"]
        mo = b12.at[geo, f"B12002_M{ln:03d}"]
        est += 0 if math.isnan(e) else e
        moe2 += 0 if (math.isnan(mo) or mo < 0) else mo * mo
    return est, math.sqrt(moe2)


OUT.mkdir(parents=True, exist_ok=True)
(OUT / "m").mkdir(exist_ok=True)
index = []
for m in markets:
    geo = m["geo_id"]
    if geo not in b12.index:
        print("  missing", m["name"])
        continue
    d = int(m["division"])
    pe = pep_by.get(m.get("cbsa"))
    shard = dict(id=m["id"], name=m["name"], kind=m["kind"], division=d,
                 pop=int(pe.m.sum() + pe.f.sum()) if pe is not None else m["pop"],
                 sexPop={"1": int(pe.m.sum()) if pe is not None else int(b01.at[geo, "B01001_E002"]),
                         "2": int(pe.f.sum()) if pe is not None else int(b01.at[geo, "B01001_E026"])},
                 counts={}, moe={}, attrs={}, neff={})
    for sex in (1, 2):
        s = str(sex)
        shard["counts"][s], shard["moe"][s] = {}, {}
        shard["attrs"][s], shard["neff"][s] = {}, {}
        # 2025 / ACS factor per age bin for this sex.
        factor = []
        for i, (lo, hi) in enumerate(BINS):
            acs = sum(cell_est(geo, sex, mg, i)[0] for mg in MARG)
            if pe is None or acs <= 0:
                factor.append(1.0)
                continue
            col = pe["m" if sex == 1 else "f"]
            factor.append(float(col.loc[lo:min(hi, 85)].sum()) / acs)
        for mi, mg in enumerate(MARG):
            est_moe = [cell_est(geo, sex, mg, i) for i in range(len(BINS))]
            shard["counts"][s][mg] = [round(e * factor[i]) for i, (e, _) in enumerate(est_moe)]
            shard["moe"][s][mg] = [round(mo * factor[i]) for i, (_, mo) in enumerate(est_moe)]
            if mg == "mar":
                continue
            A, N = [], []
            for i in range(len(BINS)):
                parent = shrink(divd.get((d, sex, i, mi)), nat[(sex, i, mi)], k=5)
                p, n = shrink(mktd.get((m["id"], sex, i, mi)), parent)
                A.append([round(float(x), 4) for x in p])
                N.append(round(n))
            shard["attrs"][s][mg] = A
            shard["neff"][s][mg] = N
    (OUT / "m" / f"{m['id']}.json").write_text(json.dumps(shard, separators=(",", ":")))
    index.append(dict(id=m["id"], name=m["name"], kind=m["kind"], pop=shard["pop"], cbsa=m.get("cbsa")))

# Searchable places: every place >= 2,500 people that maps to a market.
by_cbsa = {m["cbsa"]: m["id"] for m in markets if "cbsa" in m}
by_place = {m["place"]: m["id"] for m in markets if "place" in m}
gaz = pd.read_csv(RAW / "2026_Gaz_place_national.txt", sep="|", dtype={"GEOID": str})
gaz.columns = [c.strip() for c in gaz.columns]
latlon = {g: (round(la, 3), round(lo, 3)) for g, la, lo in zip(gaz.GEOID, gaz.INTPTLAT, gaz.INTPTLONG)}
plist = []
for r in places[places["pop"] >= 2500].itertuples():
    mid = by_place.get(r.place) or (by_cbsa.get(r.cbsa) if isinstance(r.cbsa, str) else None)
    if not mid:
        continue
    nm = re.sub(r" (city|town|village|borough|CDP|municipality|city and borough|"
                r"urban county|metropolitan government \(balance\)|"
                r"consolidated government \(balance\)|unified government \(balance\))(?=,)",
                "", r.NAME)
    nm = re.sub(r"\s*\(balance\)", "", nm)
    la, lo = latlon.get(r.place, (None, None))
    plist.append([nm.split(",")[0], state_abbr[r.STATE], mid, int(r.pop), la, lo])
plist.sort(key=lambda x: -x[3])

(OUT / "markets.json").write_text(json.dumps(
    dict(year=f"ACS 2020-{YEAR} 5-year, scaled to {PEP_VINTAGE}", markets=index, places=plist),
    separators=(",", ":")))
(OUT / "global.json").write_text(json.dumps(
    dict(bins=BINS, marg=MARG, ageMin=AGE_MIN, ageMax=AGE_MAX,
         ageShares=age_shares, partnerCdf=cdfs), separators=(",", ":")))
print(f"  wrote {len(index)} markets, {len(plist)} places")
