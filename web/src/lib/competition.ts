// Two-sided competition model.
//
// Appeal of candidate y to chooser x is a product of per-dimension factors:
//   w(x, y) = age(ax, ay) * edu(xe, ye) * income(xi, yi) * prev(xp, yp)
//             * kids(xk, yk) * height(x, y)
// Age, education, income and prior marriage come from a conditional logit
// fitted to couples formed in the last 1-3 years (pipeline/choice.py); kids
// and height come from the literature (assumptions.ts). Each factor is scaled
// so the chooser's favorite level is 1, so w is "fraction of their ideal".
//
// For every target x, the competing pull is the sum over available
// competitors y of w(x, y): the number of "ideal-equivalent" people in the
// running. Your fair share is the expected number of targets who would pick
// you if each picked one person with probability proportional to appeal.

import { heightDist, heightLogAppeal, KIDS_LOG, type Sex } from "./assumptions";
import type { Query } from "./model";
import { NPOL, NRACE, NREL, NTYPE, typeOf, type Typed } from "./types";

export interface ChoiceDir {
  n: number;
  age: number[];
  edu: number[][];
  inc: number[][];
  prev: number[][];
  race?: number[][]; // chooser race x candidate race
}

export interface Choice {
  dKnots: number[];
  ageKnots: number[];
  dirs: Record<string, ChoiceDir>;
}

export interface You {
  edu?: number; // 0 none, 1 BA, 2 graduate
  income?: number; // annual income in $1,000s
  kids?: number; // kids at home
  prev?: number; // been married before
  height?: number; // inches
  race?: number; // see RACES in types.ts
  religion?: number; // see RELIGIONS in types.ts
  politics?: number; // see PARTIES in types.ts
}

export interface CompStep {
  key: string;
  label: string;
  value: number;
}

export interface Competition {
  steps: CompStep[]; // their sieve, in ideal-equivalent competitors
  targets: number;
  perTarget: number; // ideal-equivalent competitors each target weighs
  // Competition-adjusted pool = pool / ratio * relative.
  inRunning: number; // competitors in the running, in "typical serious competitor" units
  ratio: number; // competitors in the running per person in your pool
  relative: number; // your appeal to your pool / a typical serious competitor's
  multiplier: number; // relative / ratio: 1 in a balanced market where you're typical
  adjusted: number; // your pool, adjusted for competition
  score: number; // you, as a fraction of their ideal
  percentile: number; // share of the competition (weighted by appeal) you out-rank on paper
  fairShare: number; // expected number of targets who'd pick you
  prefs: {
    ages: number[];
    age: number[];
    edu: number[];
    eduRows: { share: number; appeal: number[] }[];
    raceRows: { share: number; appeal: number[] }[] | null;
    religionRows: { share: number; appeal: number[] }[] | null;
    politicsRows: { share: number; appeal: number[] }[] | null;
    inc: number[];
    kids: number[];
    prev: number[];
    heights: number[] | null;
    height: number[] | null;
  };
}

type Dim = "edu" | "inc" | "kids" | "prev";

// Income brackets are <25k, 25-60k, 60-120k and 120k+. A specific income is
// spread over the two brackets whose midpoints it falls between, so appeal
// moves smoothly with the slider instead of jumping at bracket edges.
const INC_MID = [12.5, 42.5, 90, 160];
export function incomeWeights(k: number): number[] {
  const w = [0, 0, 0, 0];
  if (k <= INC_MID[0]) w[0] = 1;
  else if (k >= INC_MID[3]) w[3] = 1;
  else {
    const i = INC_MID.findIndex((m) => m > k) - 1;
    const t = (k - INC_MID[i]) / (INC_MID[i + 1] - INC_MID[i]);
    w[i] = 1 - t;
    w[i + 1] = t;
  }
  return w;
}
const DIMS: Dim[] = ["edu", "inc", "kids", "prev"];
const LEVELS: Record<Dim, number> = { edu: 3, inc: 4, kids: 2, prev: 2 };

const TYPES = Array.from({ length: NTYPE }, (_, t) => typeOf(t));

function ageUtil(c: Choice, dir: ChoiceDir, ax: number, ay: number) {
  const d = ay - ax;
  const s = (ax - 35) / 10;
  const g = [d, ...c.dKnots.map((k) => Math.max(0, d - k))];
  let u = 0;
  let i = 0;
  for (const v of g) u += (dir.age[i++] * v) / 10;
  for (const v of g) u += (dir.age[i++] * v * s) / 10;
  for (const k of c.ageKnots) u += (dir.age[i++] * Math.max(0, ay - k)) / 10;
  return u;
}

// Log appeal tables [chooser level][candidate level], each row shifted so its
// best candidate level is 0.
function tables(dir: ChoiceDir, candidate: Sex): Record<Dim, number[][]> {
  const kids = [
    [0, KIDS_LOG[candidate][0]],
    [0, KIDS_LOG[candidate][1]],
  ];
  const raw: Record<Dim, number[][]> = { edu: dir.edu, inc: dir.inc, prev: dir.prev, kids };
  const out = {} as Record<Dim, number[][]>;
  for (const d of DIMS) out[d] = raw[d].map((row) => row.map((v) => v - Math.max(...row)));
  return out;
}

function phi(L: Record<Dim, number[][]>, dims: Dim[]): Float64Array {
  const out = new Float64Array(NTYPE * NTYPE);
  for (let x = 0; x < NTYPE; x++) {
    const tx = TYPES[x];
    for (let y = 0; y < NTYPE; y++) {
      const ty = TYPES[y];
      let u = 0;
      for (const d of dims) u += L[d][tx[d]][ty[d]];
      out[x * NTYPE + y] = Math.exp(u);
    }
  }
  return out;
}

// Discretized normal over heights in half-inch steps.
function heightGrid(mean: number, sd: number) {
  const hs: number[] = [];
  const ws: number[] = [];
  for (let h = mean - 3 * sd; h <= mean + 3 * sd; h += 0.5) {
    hs.push(h);
    ws.push(Math.exp(-0.5 * ((h - mean) / sd) ** 2));
  }
  const tot = ws.reduce((a, b) => a + b, 0);
  return { hs, ws: ws.map((w) => w / tot) };
}

const CAND_HEIGHTS = Array.from({ length: 49 }, (_, i) => 56 + i * 0.5); // 4'8" to 6'8"

export function compete(
  c: Choice,
  targets: Typed,
  comps: Typed,
  q: Query,
  detail = true,
  religionPairing?: number[][],
  politicsPairing?: number[][],
): Competition | null {
  const T = q.seek.sex; // chooser: your target
  const M = q.me.sex; // candidate: you and your competitors
  const dir = c.dirs[`${T}${M}`];
  if (!dir) return null;
  const L = tables(dir, M);
  const nAx = targets.hi - targets.lo + 1;
  const nAy = comps.hi - comps.lo + 1;

  // Target mass by age and type.
  const Nage = new Float64Array(nAx);
  const Ntype = new Float64Array(NTYPE);
  let Ntot = 0;
  for (let i = 0; i < nAx; i++)
    for (let t = 0; t < NTYPE; t++) {
      const v = targets.m[i * NTYPE + t];
      Nage[i] += v;
      Ntype[t] += v;
      Ntot += v;
    }
  if (Ntot <= 0) return null;

  // Age appeal, scaled so each target age's favorite partner age is 1.
  const A = new Float64Array(nAx * nAy);
  for (let i = 0; i < nAx; i++) {
    let mx = -Infinity;
    const row = new Float64Array(nAy);
    for (let j = 0; j < nAy; j++) {
      row[j] = ageUtil(c, dir, targets.lo + i, comps.lo + j);
      mx = Math.max(mx, row[j]);
    }
    for (let j = 0; j < nAy; j++) A[i * nAy + j] = Math.exp(row[j] - mx);
  }

  // Height appeal (opposite-sex only): per target age, normalized appeal of
  // each candidate height, and the average over competitors' heights.
  const useHeight = T !== M;
  const hn: Float64Array[] = [];
  const compH = new Float64Array(nAx).fill(1);
  const youH = new Float64Array(nAx).fill(1);
  if (useHeight) {
    const comp = heightDist(M, q.me.age);
    const cg = heightGrid(comp.mean, comp.sd);
    for (let i = 0; i < nAx; i++) {
      const td = heightDist(T, targets.lo + i);
      const tg = heightGrid(td.mean, td.sd);
      const appeal = (hc: number) =>
        tg.hs.reduce((s, ht, k) => s + tg.ws[k] * Math.exp(heightLogAppeal(T, ht, hc)), 0);
      const curve = CAND_HEIGHTS.map(appeal);
      const mx = Math.max(...curve);
      hn.push(Float64Array.from(curve, (v) => v / mx));
      compH[i] = cg.hs.reduce((s, h, k) => s + cg.ws[k] * appeal(h), 0) / mx;
      youH[i] = q.you.height ? appeal(q.you.height) / mx : compH[i];
    }
  }

  // Categorical traits carried as per-age mixes, independent of the types
  // above: race/ethnicity (pairing from ACS couples) and religion (GSS
  // couples). For each, R[x][y] is scaled so each target group's favorite
  // candidate group is 1; rb[i][y] is the appeal of group y to targets aged
  // i; kappa[i][j] is the average appeal of competitors aged j to them.
  const a0 = Math.min(comps.hi, Math.max(comps.lo, q.me.age)) - comps.lo;
  interface Mixed {
    key: "race" | "religion" | "politics";
    n: number;
    rsC: number[][];
    rb: number[][];
    kappa: Float64Array;
    youRb: number[];
    rows: { share: number; appeal: number[] }[];
  }
  const mixed = (key: Mixed["key"], table: number[][] | undefined, n: number, youCode: number | undefined): Mixed | null => {
    if (!table) return null;
    const field = key === "race" ? "race" : key === "religion" ? "rel" : "pol";
    const R = table.map((row) => {
      const mx = Math.max(...row);
      return row.map((v) => Math.exp(v - mx));
    });
    const mix = (t: Typed, i: number) => {
      const row = t[field].subarray(i * n, (i + 1) * n);
      const sum = row.reduce((a, b) => a + b, 0);
      return Array.from(row, (v) => (sum > 0 ? v / sum : 1 / n));
    };
    const rsT = Array.from({ length: nAx }, (_, i) => mix(targets, i));
    const rsC = Array.from({ length: nAy }, (_, j) => mix(comps, j));
    const rb = rsT.map((t) => Array.from({ length: n }, (_, y) => t.reduce((a, v, x) => a + v * R[x][y], 0)));
    const kappa = new Float64Array(nAx * nAy);
    for (let i = 0; i < nAx; i++)
      for (let j = 0; j < nAy; j++) kappa[i * nAy + j] = rsC[j].reduce((a, v, y) => a + v * rb[i][y], 0);
    // You: as given, or the mix of available people your age.
    const you = youCode !== undefined ? Array.from({ length: n }, (_, k) => (k === youCode ? 1 : 0)) : rsC[a0];
    const youRb = rb.map((row) => row.reduce((a, v, y) => a + v * you[y], 0));
    // For display: each pairing relative to picking at random from the
    // competitors actually available here (1 = chance).
    const avail = new Array(n).fill(0);
    for (let j = 0; j < nAy; j++) for (let y = 0; y < n; y++) avail[y] += comps[field][j * n + y];
    const rows = R.map((row, x) => ({
      share: rsT.reduce((a, t, i) => a + (Nage[i] / Ntot) * t[x], 0),
      appeal: vsRandom(row, avail),
    }));
    return { key, n, rsC, rb, kappa, youRb, rows };
  };
  const dims = [
    mixed("race", dir.race, NRACE, q.you.race),
    mixed("religion", religionPairing, NREL, q.you.religion),
    mixed("politics", politicsPairing, NPOL, q.you.politics),
  ].filter(
    (d): d is Mixed => d !== null,
  );
  const kappaOf = (ds: Mixed[]) => {
    if (!ds.length) return null;
    const k = new Float64Array(nAx * nAy).fill(1);
    for (const d of ds) for (let x = 0; x < k.length; x++) k[x] *= d.kappa[x];
    return k;
  };
  const kappaAll = kappaOf(dims);

  // Effective competitors for a given set of non-age dimensions.
  const pull = (P: Float64Array | null, withHeight: boolean, kappa: Float64Array | null = null) => {
    const G = new Float64Array(nAy * NTYPE);
    for (let j = 0; j < nAy; j++) {
      const off = j * NTYPE;
      if (!P) {
        let r = 0;
        for (let y = 0; y < NTYPE; y++) r += comps.m[off + y];
        for (let x = 0; x < NTYPE; x++) G[off + x] = r;
        continue;
      }
      for (let x = 0; x < NTYPE; x++) {
        let s = 0;
        for (let y = 0; y < NTYPE; y++) s += comps.m[off + y] * P[x * NTYPE + y];
        G[off + x] = s;
      }
    }
    const D = new Float64Array(nAx * NTYPE);
    let E = 0;
    for (let i = 0; i < nAx; i++) {
      const h = withHeight ? compH[i] : 1;
      for (let x = 0; x < NTYPE; x++) {
        let s = 0;
        for (let j = 0; j < nAy; j++) s += A[i * nAy + j] * (kappa ? kappa[i * nAy + j] : 1) * G[j * NTYPE + x];
        D[i * NTYPE + x] = s * h;
        E += targets.m[i * NTYPE + x] * s * h;
      }
    }
    return { D, E: E / Ntot };
  };

  let raw = 0;
  for (let k = 0; k < comps.m.length; k++) raw += comps.m[k];
  const cand = noun(M);
  const steps: CompStep[] = [{ key: "all", label: `Available ${cand}, any age`, value: raw }];
  if (detail) steps.push({ key: "age", label: "…weighted by the ages they go for", value: pull(null, false).E });
  const labels: Record<Dim, string> = {
    edu: "…and education",
    inc: "…and income",
    kids: "…and kids at home",
    prev: "…and marriage history",
  };
  const used: Dim[] = [];
  const Pall = phi(L, DIMS);
  const last = pull(Pall, useHeight, kappaAll);
  if (detail) {
    for (const d of DIMS) {
      used.push(d);
      steps.push({ key: d, label: labels[d], value: pull(phi(L, used), false).E });
    }
    if (useHeight) steps.push({ key: "height", label: "…and height", value: pull(Pall, true).E });
    dims.forEach((d, k) => {
      const label = { race: "…and race/ethnicity", religion: "…and religion", politics: "…and politics" }[d.key];
      steps.push({ key: d.key, label, value: k === dims.length - 1 ? last.E : pull(Pall, useHeight, kappaOf(dims.slice(0, k + 1))).E });
    });
  }
  const Dall = last.D;

  // You: specified attributes, with anything unspecified filled in from
  // available people your age.
  const pYou = new Float64Array(NTYPE);
  const incW = q.you.income === undefined ? null : incomeWeights(q.you.income);
  const fit = (t: number) => {
    const ty = TYPES[t];
    if (q.you.edu !== undefined && q.you.edu !== ty.edu) return 0;
    if (q.you.kids !== undefined && q.you.kids !== ty.kids) return 0;
    if (q.you.prev !== undefined && q.you.prev !== ty.prev) return 0;
    return incW ? incW[ty.inc] : 1;
  };
  let tot = 0;
  for (let y = 0; y < NTYPE; y++) {
    const f = fit(y);
    if (!f) continue;
    pYou[y] = comps.m[a0 * NTYPE + y] * f;
    tot += pYou[y];
  }
  if (tot <= 0) {
    for (let y = 0; y < NTYPE; y++) pYou[y] = fit(y);
    tot = pYou.reduce((a, b) => a + b, 0);
  }
  for (let y = 0; y < NTYPE; y++) pYou[y] /= tot;

  const youMixed = (i: number) => dims.reduce((a, d) => a * d.youRb[i], 1);

  let score = 0;
  let fairShare = 0;
  for (let i = 0; i < nAx; i++) {
    const ageW = A[i * nAy + a0] * (useHeight ? youH[i] : 1) * youMixed(i);
    for (let x = 0; x < NTYPE; x++) {
      const n = targets.m[i * NTYPE + x];
      if (n <= 0) continue;
      let w = 0;
      for (let y = 0; y < NTYPE; y++) w += pYou[y] * Pall[x * NTYPE + y];
      w *= ageW;
      score += n * w;
      const d = Dall[i * NTYPE + x];
      if (d > 0) fairShare += (n * w) / (d + w);
    }
  }
  score /= Ntot;

  // Where you rank: each competitor type's average appeal to the targets.
  const H = new Float64Array(nAx * NTYPE);
  for (let i = 0; i < nAx; i++)
    for (let y = 0; y < NTYPE; y++) {
      let s = 0;
      for (let x = 0; x < NTYPE; x++) s += targets.m[i * NTYPE + x] * Pall[x * NTYPE + y];
      H[i * NTYPE + y] = s / Ntot;
    }
  // Each competitor's appeal s to your pool (same scale as your score).
  // Competitors "in the running" are counted in units of a typical serious
  // competitor: total appeal divided by the appeal-weighted average appeal,
  // i.e. (sum m*s)^2 / sum m*s^2. A thousand long shots count for far less
  // than a hundred strong contenders. Your percentile is also appeal-weighted,
  // so 22-year-olds chasing 35-year-olds don't pad it.
  // Every combination of categorical groups (e.g. race x religion), with its
  // appeal averaged over your pool's ages (the group mixes barely move
  // within an age range, and this keeps the loop fast).
  let combos: number[][] = [[]];
  for (const d of dims) combos = combos.flatMap((c) => Array.from({ length: d.n }, (_, k) => [...c, k]));
  const rbAvg = dims.map((d) => Array.from({ length: d.n }, (_, k) => d.rb.reduce((a, row, i) => a + (Nage[i] / Ntot) * row[k], 0)));
  const comboAppeal = combos.map((combo) => combo.reduce((a, k, d) => a * rbAvg[d][k], 1));
  let below = 0;
  let sumW = 0;
  let sumW2 = 0;
  // The totals factor by trait (each competitor's appeal and mix are products
  // across traits), so they don't need the full cross of groups; only the
  // percentile, shown on the page but not in rankings, walks every combination.
  const mom1 = Array.from({ length: nAy }, (_, j) =>
    dims.reduce((a, d, di) => a * d.rsC[j].reduce((t, v, k) => t + v * rbAvg[di][k], 0), 1),
  );
  const mom2 = Array.from({ length: nAy }, (_, j) =>
    dims.reduce((a, d, di) => a * d.rsC[j].reduce((t, v, k) => t + v * rbAvg[di][k] ** 2, 0), 1),
  );
  for (let j = 0; j < nAy; j++)
    for (let y = 0; y < NTYPE; y++) {
      const m0 = comps.m[j * NTYPE + y];
      if (m0 <= 0) continue;
      let s0 = 0;
      for (let i = 0; i < nAx; i++) s0 += A[i * nAy + j] * compH[i] * H[i * NTYPE + y];
      sumW += m0 * s0 * mom1[j];
      sumW2 += m0 * s0 * s0 * mom2[j];
      if (!detail) continue;
      for (let ci = 0; ci < combos.length; ci++) {
        let m = m0;
        combos[ci].forEach((k, d) => (m *= dims[d].rsC[j][k]));
        if (m <= 0) continue;
        const sc = s0 * comboAppeal[ci];
        if (sc < score) below += m * sc;
      }
    }
  const typical = sumW > 0 ? sumW2 / sumW : 0;
  const inRunning = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;
  const ratio = inRunning / Ntot;
  const relative = typical > 0 ? score / typical : 0;
  const multiplier = ratio > 0 ? relative / ratio : 0;

  // Education is mostly about matching: appeal of each candidate level for
  // targets at each level, plus how common each target level is.
  const eduAvail = [0, 0, 0];
  for (let j = 0; j < nAy; j++) for (let y = 0; y < NTYPE; y++) eduAvail[TYPES[y].edu] += comps.m[j * NTYPE + y];
  const eduRows = [0, 1, 2].map((xe) => {
    let share = 0;
    for (let x = 0; x < NTYPE; x++) if (TYPES[x].edu === xe) share += Ntype[x] / Ntot;
    return { share, appeal: vsRandom(L.edu[xe].map((v) => Math.exp(v)), eduAvail) };
  });

  const raceRows = dims.find((d) => d.key === "race")?.rows ?? null;
  const religionRows = dims.find((d) => d.key === "religion")?.rows ?? null;
  const politicsRows = dims.find((d) => d.key === "politics")?.rows ?? null;

  // Preference profiles for display.
  const ages: number[] = [];
  const ageCurve: number[] = [];
  for (let j = 0; j < nAy && comps.lo + j <= 75; j++) {
    let s = 0;
    for (let i = 0; i < nAx; i++) s += Nage[i] * A[i * nAy + j];
    ages.push(comps.lo + j);
    ageCurve.push(s / Ntot);
  }
  const level = (d: Dim) => {
    const out = new Array(LEVELS[d]).fill(0);
    for (let x = 0; x < NTYPE; x++)
      for (let j = 0; j < LEVELS[d]; j++) out[j] += (Ntype[x] / Ntot) * Math.exp(L[d][TYPES[x][d]][j]);
    return norm(out);
  };
  let heights: number[] | null = null;
  let heightCurve: number[] | null = null;
  if (useHeight) {
    heights = CAND_HEIGHTS;
    heightCurve = norm(CAND_HEIGHTS.map((_, k) => hn.reduce((s, row, i) => s + (Nage[i] / Ntot) * row[k], 0)));
  }

  return {
    steps,
    targets: Ntot,
    perTarget: last.E,
    score,
    percentile: sumW > 0 ? below / sumW : 0,
    inRunning,
    ratio,
    relative,
    multiplier,
    adjusted: Ntot * multiplier,
    fairShare,
    prefs: {
      ages,
      age: norm(ageCurve),
      edu: level("edu"),
      eduRows,
      raceRows,
      religionRows,
      politicsRows,
      inc: level("inc"),
      kids: level("kids"),
      prev: level("prev"),
      heights,
      height: heightCurve,
    },
  };
}

// Appeal of each candidate group relative to a random pick from the
// available candidates (weights `avail`): 1 means exactly chance.
function vsRandom(appeal: number[], avail: number[]) {
  const tot = avail.reduce((a, b) => a + b, 0);
  const mean = tot > 0 ? appeal.reduce((a, v, k) => a + (v * avail[k]) / tot, 0) : 0;
  return mean > 0 ? appeal.map((v) => v / mean) : appeal;
}

function norm(xs: number[]) {
  const mx = Math.max(...xs);
  return mx > 0 ? xs.map((x) => x / mx) : xs;
}

function noun(sex: Sex) {
  return sex === 1 ? "men" : "women";
}
