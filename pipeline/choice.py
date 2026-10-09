"""Estimate observed-pairing associations from recent marriages.

Cohabitation duration is unknown and excluded from the primary sample.
The contrast is relative to a state/year weighted available-population
baseline, not an identified one-sided preference or dating-outcome model.

For each direction (chooser sex -> partner sex) we fit a conditional logit in
which the chooser's actual partner is compared with K alternatives drawn at
random from the unpartnered adults of the partner's sex in the chooser's state
(McFadden 1978: sampling alternatives keeps the estimator consistent). Sampling
is proportional to person weight times the chance the alternative is attracted
to the chooser's sex, so the choice set mirrors the realistic dating pool.

Coefficients measure who ends up with whom relative to who was available,
the same idea as log-linear assortative-mating models (Schwartz & Mare 2005)
and Choo & Siow (2006), expressed as a one-sided choice model so the client
can ask "how appealing is candidate y to a chooser like x?".

Output: web/public/data/choice.json
"""

import json
import argparse
from pathlib import Path

import duckdb
import numpy as np
from choice_math import fit_contrast, loss

ROOT = Path(__file__).parent
PQ = ROOT / "raw" / "pums.parquet"
OUT = ROOT.parent / "web" / "public" / "data" / "choice.json"
parser = argparse.ArgumentParser()
parser.add_argument('--include-cohab', action='store_true', help='Separate sensitivity fit; unknown union duration, never the primary artifact')
args = parser.parse_args()
if args.include_cohab: OUT = OUT.with_name('choice-cohab-sensitivity.json')
K = 15  # sampled alternatives per observed choice
MAX_GROUPS = 80_000
RIDGE = 1.0
RNG = np.random.default_rng(20240928)

D_KNOTS = [-10, -5, -2, 0, 2, 5, 10]  # partner age minus chooser age
AGE_KNOTS = [25, 30, 35, 40, 45, 50, 60]  # partner age level

# Same attraction curves as web/src/lib/assumptions.ts (sex -> toward sex).
ATTRACTION = {
    (2, 1): [(21, 0.94), (27, 0.95), (32, 0.965), (37, 0.97), (45, 0.975), (57, 0.98), (72, 0.987)],
    (2, 2): [(21, 0.33), (27, 0.26), (32, 0.16), (37, 0.11), (45, 0.075), (57, 0.035), (72, 0.02)],
    (1, 2): [(21, 0.94), (27, 0.955), (32, 0.96), (37, 0.965), (45, 0.965), (57, 0.984), (72, 0.98)],
    (1, 1): [(21, 0.12), (27, 0.095), (32, 0.075), (37, 0.06), (45, 0.053), (57, 0.022), (72, 0.021)],
}


def attraction(sex, toward, age):
    xs, ys = zip(*ATTRACTION[(sex, toward)])
    return np.interp(age, xs, ys)


def age_features(ax, ay):
    ax = ax.astype(np.float32)
    ay = ay.astype(np.float32)
    d = ay - ax
    g = [d] + [np.maximum(0, d - k) for k in D_KNOTS]
    s = (ax - 35) / 10
    return np.stack(g + [x * s for x in g] + [np.maximum(0, ay - k) for k in AGE_KNOTS], -1) / 10


N_AGE = 2 * (1 + len(D_KNOTS)) + len(AGE_KNOTS)


def table_features(xv, yv, nx, ny):
    """One-hot of (x level, y level) for y level >= 1 (level 0 is the reference)."""
    out = np.zeros(xv.shape + (nx * (ny - 1),), np.float32)
    for i in range(nx):
        for j in range(1, ny):
            out[..., i * (ny - 1) + j - 1] = (xv == i) & (yv == j)
    return out


# Children are left out on purpose: ACS can only see pre-union children of a
# new couple when they are coded as stepchildren or are older than the union,
# so they are badly undercounted relative to singles (about 2% vs 11-41%).
# The kids effect comes from the literature instead (assumptions.ts).
DIMS = [("edu", 3), ("inc", 4), ("prev", 2), ("race", 5)]


def features(x, y):
    parts = [age_features(x["age"], y["age"])]
    for name, n in DIMS:
        parts.append(table_features(x[name], y[name], n, n))
    return np.concatenate(parts, -1)


con = duckdb.connect()
con.execute(f"""
create or replace table p as
with hh as (
  select SERIALNO,
    max(case when rel in (22,24) then 1 else 0 end) as has_partner,
    max(case when rel in (25,26,27) and age < 18 then 1 else 0 end) as has_hh_kid,
    max(case when rel = 30 and age < 18 then 1 else 0 end) as has_grandkid
  from '{PQ}' group by 1
)
select p.*, cast(substr(SERIALNO,1,4) as int) yr,
  case when rel in (22,24) or (rel = 20 and hh.has_partner = 1) then 1 else 0 end as cohab,
  case when schl >= 22 then 2 when schl = 21 then 1 else 0 end as edu,
  case when coalesce(pincp, 0) * adjinc / 1e6 >= 120000 then 3
       when coalesce(pincp, 0) * adjinc / 1e6 >= 60000 then 2
       when coalesce(pincp, 0) * adjinc / 1e6 >= 25000 then 1 else 0 end as inc,
  case when hisp <> 1 then 2 when rac1p = 1 then 0 when rac1p = 2 then 1 when rac1p = 6 then 3 else 4 end as race,
  case
    when sex = 2 then case when paoc in (1,2,3) then 1 else 0 end
    when rel in (20,21,23) and hh.has_hh_kid = 1 then 1
    when rel in (25,26,27) and hh.has_grandkid = 1 then 1
    else 0 end as kids_now
from '{PQ}' p join hh using (SERIALNO)
where age >= 18 and st <> 72
""")

# Pool of alternatives: unpartnered, non-institutional adults.
singles = con.execute("""
  select yr, st, sex, age, edu, inc, race, kids_now kids,
         case when mar in (2,3,4) then 1 else 0 end prev, w
  from p where mar <> 1 and cohab = 0 and rel <> 37 and age <= 85
  order by SERIALNO, sporder
""").df()

# Recently formed couples. Married: within 3 years of the survey (age and
# prior-marriage status rolled back to the wedding year). Cohabiting: assumed
# about a year in. Children count as pre-existing only if older than the union.
cohab_clause = 'or s.rel in (22,24)' if args.include_cohab else ''
couples = con.execute(f"""
with c as (
  select SERIALNO, rel, age, sex, edu, inc, race, w, st, mar, marht, marhyp, yr,
         case when rel in (21,23) then yr - marhyp else 1 end dur
  from p where rel in (20,21,22,23,24)
),
h as (select * from c where rel = 20),
s as (select * from c where rel in (21,22,23,24)),
k as (
  select SERIALNO,
    max(case when rel in (25,26) then age end) oldest_own,
    max(case when rel in (27,36) and age < 25 then age end) oldest_step
  from p group by 1
)
select
  h.SERIALNO household, h.yr, h.st, h.w hw, s.w sw,
  h.sex hs, h.age ha, h.edu he, h.inc hi, h.race hr,
  case when s.rel in (21,23) then (h.marht > 1)::int else (h.mar in (2,3,4))::int end hp,
  case when k.oldest_own > s.dur + 1 and k.oldest_own < 18 + s.dur then 1 else 0 end hk,
  s.sex ss, s.age sa, s.edu se, s.inc si, s.race sr,
  case when s.rel in (21,23) then (s.marht > 1)::int else (s.mar in (2,3,4))::int end sp,
  case when k.oldest_step < 18 + s.dur then 1 else 0 end sk
from h join s using (SERIALNO) left join k using (SERIALNO)
where ((s.rel in (21,23) and s.marhyp between s.yr - 3 and s.yr) {cohab_clause})
  and h.age between 18 and 85 and s.age between 18 and 85
order by h.SERIALNO, s.sex, s.age
""").df()
print("couples", len(couples))

by_state = {}
for (yr, st, sex), g in singles.groupby(["yr", "st", "sex"]):
    by_state[(yr, st, sex)] = g


def side(df, pre):
    return {"age": df[pre + "a"].values, "edu": df[pre + "e"].values, "inc": df[pre + "i"].values,
            "race": df[pre + "r"].values,
            "kids": df[pre + "k"].values, "prev": df[pre + "p"].values, "sex": df[pre + "s"].values}


def build(cs, ps):
    """Stack (chooser, chosen) rows for chooser sex cs and partner sex ps."""
    rows = []
    for a, b in (("h", "s"), ("s", "h")):
        # Opposite-sex couples match one orientation; same-sex couples match
        # both, so each partner counts once as a chooser.
        sub = couples[(couples[a + "s"] == cs) & (couples[b + "s"] == ps)]
        rows.append((side(sub, a), side(sub, b), sub.st.values, sub[a+'w'].values, sub.yr.values, sub.household.values))
    x = {k: np.concatenate([r[0][k] for r in rows]) for k in rows[0][0]}
    y = {k: np.concatenate([r[1][k] for r in rows]) for k in rows[0][1]}
    st = np.concatenate([r[2] for r in rows])
    w = np.concatenate([r[3] for r in rows]).astype(np.float64)
    yr = np.concatenate([r[4] for r in rows])
    household = np.concatenate([r[5] for r in rows])
    if len(st) > MAX_GROUPS:
        idx = RNG.choice(len(st), MAX_GROUPS, replace=False)
        x = {k: v[idx] for k, v in x.items()}
        y = {k: v[idx] for k, v in y.items()}
        st, w, yr, household = st[idx], w[idx], yr[idx], household[idx]
    return x, y, st, w, yr, household


def sample_alternatives(x, st, ps, cs, yr):
    n = len(st)
    alt = {k: np.zeros((n, K), np.int32) for k in ("age", "edu", "inc", "kids", "prev", "race")}
    for year, s in sorted(set(zip(yr, st))):
        pool = by_state.get((year, s, ps))
        if pool is None or not len(pool): raise ValueError(f'No alternatives in {year}, {s}, sex {ps}')
        mask = (st == s) & (yr == year)
        prob = pool.w.values * attraction(ps, cs, pool.age.values)
        prob = prob / prob.sum()
        draw = RNG.choice(len(pool), (mask.sum(), K), p=prob)
        for k in alt:
            alt[k][mask] = pool[k].values[draw]
    return alt


def fit(cs, ps):
    x, y, st, w, yr, household = build(cs, ps)
    alt = sample_alternatives(x, st, ps, cs, yr)
    G = len(st)
    cand = {k: np.concatenate([y[k][:, None], alt[k]], 1) for k in alt}  # chosen at column 0
    xb = {k: np.repeat(x[k][:, None], K + 1, 1) for k in alt}
    X = features(xb, cand)  # (G, K+1, F)
    F = X.shape[-1]
    train, test = yr < 2024, yr == 2024
    if train.sum() < 100 or test.sum() < 50:
        return {'n': int(G), 'validation': {'status':'unsupported', 'reason':'Insufficient household holdout support'}}
    beta = fit_contrast(X[train], w[train], RIDGE)
    age_beta = fit_contrast(X[train, :, :N_AGE], w[train], RIDGE)
    full_loss = loss(beta, X[test], w[test])
    age_loss = loss(age_beta, X[test, :, :N_AGE], w[test])
    delta = age_loss - full_loss
    # Bootstrap households, not rows (same-sex pairs have two chooser rows).
    ids = household[test]
    unique = np.unique(ids)
    stats = np.array([[np.sum(w[test][ids == h] * delta[ids == h]), np.sum(w[test][ids == h])] for h in unique])
    draws = RNG.integers(0, len(unique), (200, len(unique)))
    sums = stats[draws].sum(1)
    ci = np.quantile(sums[:,0] / sums[:,1], [.025,.975])
    validation = {'status':'validated' if ci[0] > 0 else 'unsupported', 'trainRows':int(train.sum()),
                  'testRows':int(test.sum()), 'testHouseholds':int(len(unique)),
                  'fullLogLoss':float(np.average(full_loss, weights=w[test])),
                  'ageLogLoss':float(np.average(age_loss, weights=w[test])),
                  'availabilityLogLoss':float(np.log(K+1)), 'improvement95':ci.tolist(),
                  'scope':'Observed marriages/cohabitation with unknown duration (sensitivity only); not dating outcomes' if args.include_cohab else 'Observed recent marriages; not dating outcomes',
                  'ageSupport':[18,85], 'converged':True}
    if validation['fullLogLoss'] >= validation['availabilityLogLoss']:
        validation['status'] = 'unsupported'
    validation['ageBands'] = []
    for lo,hi in ((18,24),(25,34),(35,44),(45,54),(55,64),(65,85)):
        mask = (x['age'][test]>=lo) & (x['age'][test]<=hi)
        validation['ageBands'].append({'lo':lo,'hi':hi,'n':int(mask.sum()),'households':int(len(np.unique(ids[mask]))),'supported':bool(len(np.unique(ids[mask]))>=50),
          'logLoss':float(np.average(full_loss[mask],weights=w[test][mask])) if mask.any() else None})
    validation['sensitivityLogLoss'] = {}
    start = N_AGE
    for name,n in DIMS:
        removed = beta.copy(); removed[start:start+n*(n-1)] = 0; start += n*(n-1)
        validation['sensitivityLogLoss'][f'without_{name}'] = float(np.average(loss(removed,X[test],w[test]),weights=w[test]))
    # Observed partner age and conditional contrast-weighted age, for
    # descriptive calibration on the held-out sampled sets (not dating outcomes).
    utility = X[test] @ beta; utility -= utility.max(1,keepdims=True)
    probabilities = np.exp(utility); probabilities /= probabilities.sum(1,keepdims=True)
    validation['partnerAgeCheck'] = {'observed':float(np.average(y['age'][test],weights=w[test])),
      'contrastPredicted':float(np.average((probabilities*cand['age'][test]).sum(1),weights=w[test]))}
    print(f'  {cs}->{ps}: {validation}')
    out = {"n": int(G), "validation":validation, "age": beta[:N_AGE].round(5).tolist()}
    i = N_AGE
    for name, n in DIMS:
        tab = [[0.0] * n for _ in range(n)]
        for a in range(n):
            for b in range(1, n):
                tab[a][b] = round(float(beta[i]), 4)
                i += 1
        out[name] = tab
    return out


result = {"schemaVersion":2, "dKnots": D_KNOTS, "ageKnots": AGE_KNOTS, "dirs": {},
          'sample':'Recent marriages plus unknown-duration cohabitation (sensitivity only)' if args.include_cohab else 'Recent marriages only; unknown-duration cohabitation excluded', 'seed':20240928}
for cs, ps in ((2, 1), (1, 2), (1, 1), (2, 2)):
    result["dirs"][f"{cs}{ps}"] = fit(cs, ps)
OUT.write_text(json.dumps(result, separators=(",", ":")))
for k, d in result["dirs"].items():
    print(k, 'validation', d['validation'])
