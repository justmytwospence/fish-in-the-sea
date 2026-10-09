import {
  attraction,
  heightRangeShare, HEIGHT_MIN, HEIGHT_MAX,
  inRelationship,
  looking,
  SOURCES,
  type Sex,
  type Source,
} from "./assumptions";
import { compete, type Choice, type Competition, type You } from "./competition";
import { jointMargins } from "./distribution";
import { NPOL, NRACE, NREL, NTYPE, NWANT, PARTY_PLURAL, RACES, RELIGIONS, WANT_KIDS, typeIndex, type Typed } from "./types";

export type Marg = "nm" | "sep" | "wid" | "div" | "mar";
type UMarg = Exclude<Marg, "mar">;

export interface Shard {
  id: string;
  name: string;
  kind: "metro" | "micro" | "rural";
  division: number;
  pop: number;
  sexPop: Record<"1" | "2", number>;
  counts: Record<"1" | "2", Record<Marg, number[]>>;
  moe: Record<"1" | "2", Record<Marg, number[]>>;
  // Per unmarried group and age bin: 97 proportions. Cells 0..95 are
  // (((cohab*3 + edu)*2 + kids)*2 + parents)*4 + inc (edu 0 none / 1 BA /
  // 2 graduate; parents = lives with them; income <25k / 25-60k / 60-120k /
  // 120k+); 96 is institutional group quarters.
  attrs: Record<"1" | "2", Record<UMarg, number[][]>>;
  // Per unmarried group and age bin: race/ethnicity mix of available singles
  // (see types.ts for the order). Applied independently of attrs.
  race?: Record<"1" | "2", Record<UMarg, number[][]>>;
  neff: Record<"1" | "2", Record<UMarg, number[]>>;
}

export interface HealthNational {
  bands: [number, number][];
  smoke: Record<"1" | "2", number[]>;
  obese: Record<"1" | "2", number[]>;
  over: Record<"1" | "2", number[]>;
  bmiCuts?: number[]; // whole-number BMI thresholds
  bmiAbove?: Record<"1" | "2", number[][]>; // [band][cut]: share at or above
  // Unpartnered rates by degree (0 none, 1 bachelor's or more) and race, from
  // a national model (see context.py); height by race for all adults.
  cond?: {
    smoke: Record<"1" | "2", number[][][]>; // [band][degree][race]
    bmiAbove: Record<"1" | "2", number[][][][]>; // [band][degree][race][cut]
    height: Record<"1" | "2", number[][][]>; // [height band][race] = [mean, sd]
  };
}

export interface MarketCtx {
  src: "metro" | "state" | "us";
  sourceYear?: number;
  smoke: number; // log-odds shift vs. the US
  obese: number;
  over: number;
  localSmoke: number; // all-adult prevalence, for display
  localObese: number;
  dem?: number | null; // 2024 two-party Democratic share
  votes?: number;
}

export interface Global {
  bins: [number, number][];
  ageMin: number;
  ageMax: number;
  ageShares: Record<string, Record<"1" | "2", Record<Marg, number[][]>>>;
  // Income floors inside a bracket: share of the bracket at or above each cut
  // ($k), by sex, age bin and education (see build.py).
  incomeCuts?: number[];
  incomeAbove?: Record<"1" | "2", number[][][]>;
  // Race mix by education x income relative to the whole group, national:
  // [sex][age bin][marital nm/sep/wid/div][edu*4 + income][race].
  raceTilt?: Record<"1" | "2", number[][][][]>;
  // Merged in from context.json.
  health?: HealthNational;
  ctx?: Record<string, MarketCtx>;
  religion?: ReligionData;
  politics?: PoliticsData;
  kids?: KidsData;
  beliefs?: BeliefsData;
}

export interface Query {
  market: string;
  me: { sex: Sex; age?: number }; // age optional: unknown means a typical competitor
  seek: { sex: Sex; lo: number; hi: number };
  // height: an inclusive range in inches, "any", or undefined for the default
  // rule relative to your height, if you gave it (see heightFilter).
  filters: {
    neverMarried: boolean;
    edu: 0 | 1 | 2;
    noKids: boolean;
    height?: { lo: number; hi: number } | "any";
    notWithParents: boolean;
    incomeMin: number; // personal income floor in $1,000s (steps of 5), 0 = none
    races: number[]; // race/ethnicity codes to include; empty = any
    religions: number[]; // religion codes to include; empty = any
    politics: number[]; // party codes to include; empty = any
    wantKids: number[]; // WANT_KIDS groups to include; empty = any
    nonSmoker: boolean;
    bmiMax: number; // BMI below this (20-40), 0 = no BMI filter
  };
  model: {
    separated: boolean; // count separated people as available
    orientation: boolean;
    relationship: boolean;
    looking: boolean;
    spark: number | null; // null = disabled; explicit zero is a zero-probability scenario
  };
  you: You;
}

export type StepKind = "census" | "microdata" | "survey" | "dial";
// Single presentation contract. Receipts and the sieve consume these computed steps.
export const FUNNEL_ORDER = ['pop','sex','age','unmarried','partner','nm','edu','kids','parents','income','race','height','smoke','religion','politics','wantKids','bmi','orientation','relationship','looking','spark'] as const;

export interface Step {
  key: string;
  label: string;
  dropped: string; // who this step removes, for the sieve
  value: number;
  moe: number; // 90% margin, same convention as the ACS
  kind: StepKind;
  sources: Source[];
  note: string;
}

// What's left in the final pool, for the "who's left" breakdown.
export interface Composition {
  ageLo: number;
  ages: number[]; // count by single year of age from ageLo
  edu: number[]; // no degree, bachelor's, graduate
  inc: number[]; // <25k, 25-60k, 60-120k, 120k+
  marital: Record<"nm" | "div" | "wid" | "sep", number>;
  kids: number[]; // no, yes
  parents: number[]; // lives on own, with parents
  race: number[]; // by race/ethnicity code
  religion: number[]; // by religion code
  politics: number[]; // by party code
  wantKids: number[]; // by WANT_KIDS group
  smoke: number | null; // estimated share, when health data is available
  obese: number | null;
  over: number | null;
  total: number;
}

export interface Result {
  market: Pick<Shard, "id" | "name" | "kind" | "pop">;
  steps: Step[];
  final: Step;
  competition: Competition | null;
  composition: Composition;
  effectiveSupport: number; // approximate Kish support, not a respondent count
  demographicPool: number;
  scenarioPool: number;
  issues: string[];
  ctx: MarketCtx | null;
}

export const LOW_RECORDS = 30;

// Shape of context.json (see pipeline/context.py).
export interface Context {
  health: HealthNational;
  markets: Record<string, MarketCtx>;
}

// Shape of religion.json (see pipeline/religion.py).
export interface ReligionData {
  bands: [number, number][];
  national: Record<"1" | "2", number[][]>; // [band][religion], unmarried adults
  pairing: Record<string, number[][]>; // log affinity [chooser][candidate]
  markets: Record<string, number[]>; // log shift of local vs. national shares
}

// Shape of politics.json (see pipeline/politics.py).
export interface PoliticsData {
  bands: [number, number][];
  national: Record<"1" | "2", number[][]>; // [band][party], unmarried adults
  pairing: Record<string, number[][]>;
  markets: Record<string, number>; // log-odds shift of the 2024 two-party D share
}

// Shape of kids.json (see pipeline/kids.py).
export interface KidsData {
  bands: [number, number][];
  schemaVersion: 2;
  rates: Record<"1" | "2", number[][][][]>; // [band][edu][race][WANT_KIDS]; parity marginalized
}

// Shape of beliefs.json (see pipeline/beliefs.py): religion x party.
export interface BeliefsData {
  bands: [number, number][];
  joint: Record<"1" | "2", number[][][][]>; // [band][edu][race][religion * 3 + party], unmarried
  rel: Record<string, number[]>; // local log shift per religion
  pol: Record<string, number>; // local log-odds shift, Democratic vs Republican
}

export function mergeContext(
  g: Global,
  c: Context,
  r?: ReligionData,
  pol?: PoliticsData,
  kids?: KidsData,
  beliefs?: BeliefsData,
): Global {
  return { ...g, health: c.health, ctx: c.markets, religion: r, politics: pol, kids, beliefs };
}

export const NCELL = 97;
const INST = 96;
const UNMARRIED: UMarg[] = ["nm", "wid", "div"];
const Z90 = 1.645;

// Survey steps run over groups of (education, kids at home, race/ethnicity),
// so any of them can depend on those as well as on sex and age.
const NGROUP = 3 * 2 * NRACE;
const groupOf = (edu: number, kids: number, race: number) => (edu * 2 + kids) * NRACE + race;
const GROUPS = Array.from({ length: NGROUP }, (_, gi) => ({
  edu: Math.floor(gi / (2 * NRACE)),
  kids: Math.floor(gi / NRACE) % 2,
  race: gi % NRACE,
}));
const MARG_INDEX: Record<string, number> = { nm: 0, sep: 1, wid: 2, div: 3 };

export const cellOf = (c: number) => ({
  cohab: Math.floor(c / 48),
  edu: Math.floor((c % 48) / 16),
  kids: Math.floor((c % 16) / 8),
  par: Math.floor((c % 8) / 4),
  inc: c % 4,
});

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));

// Rate for unpartnered adults of this sex and age (NHANES), and of this
// degree and race when given, shifted by how the place differs from the US
// beyond its make-up, on the log-odds scale (see context.py).
function healthRate(g: Global, key: "smoke" | "obese" | "over", sex: Sex, age: number, marketId: string, ba?: number, race?: number) {
  const h = g.health;
  if (!h) return null;
  const sx = String(sex) as "1" | "2";
  const i = Math.max(0, h.bands.findIndex(([lo, hi]) => age >= lo && age <= hi));
  let base = h[key][sx][i];
  if (h.cond && ba !== undefined && race !== undefined) {
    if (key === "smoke") base = h.cond.smoke[sx][i][ba][race];
    else {
      const k = h.bmiCuts?.indexOf(key === "obese" ? 30 : 25) ?? -1;
      if (k >= 0) base = h.cond.bmiAbove[sx][i][ba][race][k];
    }
  }
  const shift = g.ctx?.[marketId]?.[key] ?? 0;
  return sigmoid(logit(Math.min(0.98, Math.max(0.02, base))) + shift);
}

// Measured height distribution for this sex, age and race (NHANES).
function heightFor(g: Global, sex: Sex, age: number, race: number) {
  const t = g.health?.cond?.height?.[String(sex) as "1" | "2"];
  if (!t) return undefined;
  const [mean, sd] = t[age < 40 ? 0 : age < 60 ? 1 : 2][race];
  return { mean, sd };
}

// Default height rule: men seeking women want them no taller, women seeking
// men want them no shorter; no default for same-sex searches.
export function heightDefault(q: Query): "le" | "ge" | "any" {
  if (q.me.sex === 1 && q.seek.sex === 2) return "le";
  if (q.me.sex === 2 && q.seek.sex === 1) return "ge";
  return "any";
}

// The height range in force, or null for none. Without an explicit range,
// the default rule applies relative to your height when you gave it.
export function heightFilter(q: Query): { lo: number; hi: number } | null {
  const h = q.filters.height;
  if (h === "any") return null;
  if (h) return h.lo <= HEIGHT_MIN && h.hi >= HEIGHT_MAX ? null : h;
  return null;
}

// Income brackets in the attribute cells, by floor in $1,000s.
const INC_FLOORS = [0, 25, 60, 120];
const incomeBracket = (k: number) => INC_FLOORS.filter((e) => k >= e).length - 1;

// Share of people at or above BMI `t` (a whole number, 20-40) for this sex and
// age: NHANES, shifted like the obesity and overweight rates (the overweight
// shift at 25 and below, the obesity shift at 30 and above, blended between).
function bmiRate(g: Global, sex: Sex, age: number, marketId: string, t: number, ba?: number, race?: number) {
  const h = g.health;
  const k = h?.bmiCuts?.indexOf(t) ?? -1;
  if (!h?.bmiAbove || k < 0) return null;
  const sx = String(sex) as "1" | "2";
  const i = Math.max(0, h.bands.findIndex(([lo, hi]) => age >= lo && age <= hi));
  const base =
    h.cond && ba !== undefined && race !== undefined ? h.cond.bmiAbove[sx][i][ba][race][k] : h.bmiAbove[sx][i][k];
  const c = g.ctx?.[marketId];
  const so = c?.over ?? 0;
  const sb = c?.obese ?? 0;
  const shift = t <= 25 ? so : t >= 30 ? sb : so + ((sb - so) * (t - 25)) / 5;
  return sigmoid(logit(Math.min(0.98, Math.max(0.02, base))) + shift);
}

function marital(q: Query, withFilters: boolean): UMarg[] {
  if (withFilters && q.filters.neverMarried) return ["nm"];
  return q.model.separated ? [...UNMARRIED, "sep"] : UNMARRIED;
}

// Microdata stages in sieve order; each mask applies every earlier filter.
const STAGES = ["partner", "edu", "kids", "parents", "income"] as const;
type Stage = (typeof STAGES)[number];

function attrMask(q: Query, stage: Stage, withFilters: boolean): boolean[] {
  const k = STAGES.indexOf(stage);
  const f = q.filters;
  const mask: boolean[] = [];
  for (let c = 0; c < NCELL; c++) {
    const { cohab, edu, kids, par, inc } = cellOf(c);
    let ok = c !== INST && cohab === 0;
    if (withFilters) {
      if (k >= 1) ok &&= edu >= f.edu;
      if (k >= 2) ok &&= !f.noKids || kids === 0;
      if (k >= 3) ok &&= !f.notWithParents || par === 0;
      if (k >= 4) ok &&= inc >= incomeBracket(f.incomeMin);
    }
    mask.push(ok);
  }
  return mask;
}

function sumMask(p: number[], mask: boolean[]): number {
  let s = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) s += p[i];
  return s;
}

interface Acc {
  value: number;
  variance: number;
}

const acc = (): Acc => ({ value: 0, variance: 0 });

function add(a: Acc, C: number, varC: number, p: number, neff: number, mod: number) {
  a.value += C * p * mod;
  a.variance += (p * mod) ** 2 * varC;
  // ACS-only approximate sampling variance. Synthetic-rate uncertainty
  // is not a design-based ACS confidence interval.
  void neff;
}

// Walk one sex down the funnel. Returns accumulated counts at every stage
// and, at the final (pre-spark) stage, counts by single year of age x type.
function pool(
  s: Shard,
  g: Global,
  q: Query,
  sex: Sex,
  towards: Sex,
  lo: number,
  hi: number,
  withFilters: boolean,
  lean = false, // skip the who's-left breakdowns (rankings don't show them)
) {
  const sx = String(sex) as "1" | "2";
  const shares = g.ageShares[String(s.division)][sx];
  const hf = withFilters ? heightFilter(q) : null;
  const available = marital(q, false);
  const margs = marital(q, withFilters);
  const masks = {
    partner: attrMask(q, "partner", withFilters),
    edu: attrMask(q, "edu", withFilters),
    kids: attrMask(q, "kids", withFilters),
    parents: attrMask(q, "parents", withFilters),
    income: attrMask(q, "income", withFilters),
  };
  const f = q.filters;
  // Health rates by age, degree (0 none, 1 bachelor's or more) and race.
  const rate = (key: "smoke" | "obese" | "over", a: number, ba: number, race: number) =>
    healthRate(g, key, sex, a, s.id, ba, race);
  const fSmoke = (a: number, ba: number, race: number) =>
    withFilters && f.nonSmoker ? 1 - (rate("smoke", a, ba, race) ?? 0) : 1;
  // Religion mix for this sex and age: national GSS rates shifted by the
  // metro's (or state's) composition. Independent of everything else.
  const relMix = (a: number) => {
    const R = g.religion;
    if (!R) return null;
    const i = Math.max(0, R.bands.findIndex(([lo, hi]) => a >= lo && a <= hi));
    const shift = R.markets[s.id];
    const v = R.national[sx][i].map((p, r) => p * Math.exp(shift?.[r] ?? 0));
    const tot = v.reduce((x, y) => x + y, 0);
    return v.map((x) => x / tot);
  };
  const relPicked = withFilters && f.religions.length ? f.religions : null;
  const fRel = (a: number) => {
    if (!relPicked) return 1;
    const m = relMix(a);
    return m ? relPicked.reduce((t, r) => t + m[r], 0) : 1;
  };
  // Political leaning: national GSS rates by sex and age, with the
  // Democratic vs. Republican odds shifted by the metro's 2024 vote.
  const polMix = (a: number) => {
    const P = g.politics;
    if (!P) return null;
    const i = Math.max(0, P.bands.findIndex(([lo, hi]) => a >= lo && a <= hi));
    const d = (P.markets[s.id] ?? 0) / 2;
    const v = P.national[sx][i].map((p, k) => p * Math.exp(k === 0 ? d : k === 2 ? -d : 0));
    const tot = v.reduce((x, y) => x + y, 0);
    return v.map((x) => x / tot);
  };
  const polPicked = withFilters && f.politics.length ? f.politics : null;
  // Religion and party together (CES 2024), by age band, education and race,
  // with this place's shifts beyond its make-up: joint[religion * 3 + party].
  const B = g.beliefs;
  const beliefCache = new Map<number, Float64Array>();
  const beliefsFor = (a: number, edu: number, race: number) => {
    if (!B) return null;
    const bi = Math.max(0, B.bands.findIndex(([blo, bhi]) => a >= blo && a <= bhi));
    const k = (bi * 3 + edu) * NRACE + race;
    let j = beliefCache.get(k);
    if (j) return j;
    const base = B.joint[sx][bi][edu][race];
    const rs = B.rel[s.id];
    const ps = (B.pol[s.id] ?? 0) / 2;
    j = new Float64Array(NREL * NPOL);
    let tot = 0;
    for (let r = 0; r < NREL; r++) {
      let pr = 0;
      for (let pt = 0; pt < NPOL; pt++) pr += base[r * NPOL + pt];
      // Party within religion, tilted by the local vote; religion by the
      // local mix.
      const t = [base[r * NPOL] * Math.exp(ps), base[r * NPOL + 1], base[r * NPOL + 2] * Math.exp(-ps)];
      const ts = t[0] + t[1] + t[2] || 1;
      const rr = pr * Math.exp(rs?.[r] ?? 0);
      for (let pt = 0; pt < NPOL; pt++) {
        j[r * NPOL + pt] = (rr * t[pt]) / ts;
        tot += j[r * NPOL + pt];
      }
    }
    for (let x = 0; x < j.length; x++) j[x] /= tot || 1;
    beliefCache.set(k, j);
    return j;
  };
  const relKeep = Array.from({ length: NREL }, (_, r) => !relPicked || relPicked.includes(r));
  const polKeep = Array.from({ length: NPOL }, (_, pt) => !polPicked || polPicked.includes(pt));
  const relOk = (r: number) => relKeep[r];
  const polOk = (pt: number) => polKeep[pt];
  // Religion and party shares among those who pass your picks, by age band,
  // education and race (for who's left and the competition model).
  const leftCache = new Map<number, [Float64Array, Float64Array] | null>();
  const beliefsLeft = (a: number, edu: number, race: number) => {
    const bi = Math.max(0, B!.bands.findIndex(([blo, bhi]) => a >= blo && a <= bhi));
    const k = (bi * 3 + edu) * NRACE + race;
    if (leftCache.has(k)) return leftCache.get(k)!;
    const j = beliefsFor(a, edu, race)!;
    const rel = new Float64Array(NREL);
    const pol = new Float64Array(NPOL);
    let tot = 0;
    for (let r = 0; r < NREL; r++) {
      if (!relKeep[r]) continue;
      for (let pt = 0; pt < NPOL; pt++) {
        if (!polKeep[pt]) continue;
        const x = j[r * NPOL + pt];
        rel[r] += x;
        pol[pt] += x;
        tot += x;
      }
    }
    const res: [Float64Array, Float64Array] | null = tot > 0 ? [rel.map((x) => x / tot), pol.map((x) => x / tot)] : null;
    leftCache.set(k, res);
    return res;
  };
  const fPol = (a: number) => {
    if (!polPicked) return 1;
    const m = polMix(a);
    return m ? polPicked.reduce((t, r) => t + m[r], 0) : 1;
  };
  // Wanting kids someday: national NSFG rates by sex, age, education and
  // whether they have kids, so it follows each cell's education and kids.
  // The NSFG stops at 49; older ages use the 45-49 rates.
  const K = g.kids;
  const wantPicked = withFilters && f.wantKids.length && K ? f.wantKids : null;
  const wantMix = (a: number, edu: number, kids: number, race: number) => {
    if (!K) return null;
    const i = K.bands.findIndex(([lo, hi]) => a >= lo && a <= hi);
    void kids;
    if (i < 0 || K.schemaVersion !== 2) return null;
    return K.rates[sx][i][edu][race];
  };
  const fBmi = (a: number, ba: number, race: number) =>
    withFilters && f.bmiMax ? 1 - (bmiRate(g, sex, a, s.id, f.bmiMax, ba, race) ?? 0) : 1;
  // An income floor inside a bracket keeps that bracket's share at or above
  // it (national, by sex, age bin and education); other brackets are all in
  // or all out.
  const incBr = incomeBracket(f.incomeMin);
  const incomeWeights = (b: number) => {
    const cut = g.incomeCuts?.indexOf(f.incomeMin) ?? -1;
    const partial = withFilters && f.incomeMin > INC_FLOORS[incBr] && cut >= 0;
    const frac = (edu: number) => (partial ? (g.incomeAbove?.[sx]?.[b]?.[edu]?.[cut] ?? 1) : 1);
    return masks.income.map((ok, c) => {
      if (!ok) return 0;
      const { inc, edu } = cellOf(c);
      return withFilters && inc === incBr ? frac(edu) : 1;
    });
  };
  const comp: Composition = {
    ageLo: lo,
    ages: new Array(hi - lo + 1).fill(0),
    edu: [0, 0, 0],
    inc: [0, 0, 0, 0],
    marital: { nm: 0, div: 0, wid: 0, sep: 0 },
    kids: [0, 0],
    parents: [0, 0],
    race: new Array(NRACE).fill(0),
    religion: new Array(NREL).fill(0),
    politics: new Array(NPOL).fill(0),
    wantKids: new Array(NWANT).fill(0),
    smoke: g.health ? 0 : null,
    obese: g.health ? 0 : null,
    over: g.health ? 0 : null,
    total: 0,
  };
  let records = 0;
  const out = {
    age: acc(),
    unmarried: acc(),
    partner: acc(),
    neverMarried: acc(),
    edu: acc(),
    kids: acc(),
    parents: acc(),
    income: acc(),
    height: acc(),
    smoke: acc(),
    bmi: acc(),
    religion: acc(),
    politics: acc(),
    wantKids: acc(),
    orientation: acc(),
    relationship: acc(),
    looking: acc(),
    spark: acc(),
    typed: {
      lo,
      hi,
      m: new Float64Array((hi - lo + 1) * NTYPE),
      race: new Float64Array((hi - lo + 1) * NRACE),
      rel: new Float64Array((hi - lo + 1) * NREL),
      pol: new Float64Array((hi - lo + 1) * NPOL),
    } as Typed,
    race: acc(),
    comp,
    records: 0,
  };

  g.bins.forEach(([blo, bhi], b) => {
    const ages: number[] = [];
    for (let a = Math.max(lo, blo); a <= Math.min(hi, bhi); a++) ages.push(a);
    if (!ages.length) return;
    for (const mg of ["nm", "sep", "wid", "div", "mar"] as Marg[]) {
      const sh = ages.map((a) => shares[mg][b][a - blo] ?? 0);
      const S = sh.reduce((x, y) => x + y, 0);
      if (S <= 0) continue;
      const C = s.counts[sx][mg][b] * S;
      const varC = ((s.moe[sx][mg][b] * S) / Z90) ** 2;
      add(out.age, C, varC, 1, 0, 1);
      if (mg === "mar" || !available.includes(mg)) continue;
      add(out.unmarried, C, varC, 1, 0, 1);
      const p = s.attrs[sx][mg][b];
      const n = s.neff[sx][mg][b];
      add(out.partner, C, varC, sumMask(p, masks.partner), n, 1);
      if (!margs.includes(mg)) continue;
      const pPartner = sumMask(p, masks.partner);
      add(out.neverMarried, C, varC, pPartner, n, 1);
      add(out.edu, C, varC, sumMask(p, masks.edu), n, 1);
      add(out.kids, C, varC, sumMask(p, masks.kids), n, 1);
      add(out.parents, C, varC, sumMask(p, masks.parents), n, 1);
      const iw = incomeWeights(b);
      const pIncome = p.reduce((t, v, c) => t + v * iw[c], 0);
      add(out.income, C, varC, pIncome, n, 1);
      // Race/ethnicity: this group's local mix, tilted for each education x
      // income cell by the national association, then restricted to the
      // races you picked.
      const rs = s.race?.[sx]?.[mg]?.[b] ?? new Array(NRACE).fill(1 / NRACE);
      const tilt = g.raceTilt?.[sx]?.[b]?.[MARG_INDEX[mg]];
      const eiMass = new Array(12).fill(0);
      for (let c = 0; c < INST; c++) {
        const { cohab, edu, inc } = cellOf(c);
        if (cohab === 0) eiMass[edu * 4 + inc] += p[c];
      }
      const calibrated = jointMargins(eiMass, rs, tilt);
      const mixes = calibrated.map((row) => {
        const mass = row.reduce((x, y) => x + y, 0);
        return mass > 0 ? row.map((v) => v / mass) : rs;
      });
      const picked = withFilters && f.races.length ? f.races : null;
      const kr = Array.from({ length: NRACE }, (_, r) => (!picked || picked.includes(r) ? 1 : 0));
      // Share of this group left after the Census steps, by (education,
      // kids, race).
      const G = new Float64Array(NGROUP);
      for (let c = 0; c < NCELL; c++) {
        if (!(p[c] > 0) || !iw[c]) continue;
        const { edu, kids, inc } = cellOf(c);
        const mix = mixes[edu * 4 + inc];
        for (let r = 0; r < NRACE; r++) if (kr[r]) G[groupOf(edu, kids, r)] += p[c] * iw[c] * mix[r];
      }
      const pFinal = G.reduce((x, y) => x + y, 0);
      add(out.race, C, varC, pFinal, n, 1);
      records += n * pFinal * S;

      // Survey steps, in sieve order: the share kept at a given age, either
      // the same for everyone ("age") or per group ("group"). For one age,
      // `chain` gives the share of pFinal left after each step, and what's
      // left of each group after all of them.
      // Group steps name the few attributes they depend on (`key`, up to
      // `keys` values), so each value is computed once per age.
      type Gr = (typeof GROUPS)[number];
      type SurveyStep =
        | { age: (a: number) => number }
        | { group: (a: number, gr: Gr) => number; key: (gr: Gr) => number; keys: number };
      const byRace = { key: (gr: Gr) => gr.race, keys: NRACE };
      const byDegreeRace = { key: (gr: Gr) => (gr.edu >= 1 ? NRACE : 0) + gr.race, keys: 2 * NRACE };
      const off = { age: () => 1 };
      const surveySteps: SurveyStep[] = [
        hf ? { group: (a, gr) => heightRangeShare(sex, a, hf.lo, hf.hi, heightFor(g, sex, a, gr.race)), ...byRace } : off,
        withFilters && f.nonSmoker ? { group: (a, gr) => fSmoke(a, gr.edu >= 1 ? 1 : 0, gr.race), ...byDegreeRace } : off,
        B
          ? relPicked
            ? {
                group: (a, gr) => {
                  const j = beliefsFor(a, gr.edu, gr.race)!;
                  let t = 0;
                  for (const r of relPicked) for (let pt = 0; pt < NPOL; pt++) t += j[r * NPOL + pt];
                  return t;
                },
                key: (gr) => gr.edu * NRACE + gr.race,
                keys: 3 * NRACE,
              }
            : off
          : { age: (a) => fRel(a) },
        B
          ? polPicked
            ? {
                // Among those who passed the religion step.
                group: (a, gr) => {
                  const j = beliefsFor(a, gr.edu, gr.race)!;
                  let num = 0;
                  let den = 0;
                  for (let r = 0; r < NREL; r++) {
                    if (!relOk(r)) continue;
                    for (let pt = 0; pt < NPOL; pt++) {
                      den += j[r * NPOL + pt];
                      if (polOk(pt)) num += j[r * NPOL + pt];
                    }
                  }
                  return den > 0 ? num / den : 1;
                },
                key: (gr) => gr.edu * NRACE + gr.race,
                keys: 3 * NRACE,
              }
            : off
          : { age: (a) => fPol(a) },
        wantPicked
          ? {
              group: (a, gr) => {
                const m = wantMix(a, gr.edu, gr.kids, gr.race);
                return m ? wantPicked.reduce((t, r) => t + m[r], 0) : 1;
              },
              key: (gr) => (gr.edu * 2 + gr.kids) * NRACE + gr.race,
              keys: 6 * NRACE,
            }
          : off,
        withFilters && f.bmiMax ? { group: (a, gr) => fBmi(a, gr.edu >= 1 ? 1 : 0, gr.race), ...byDegreeRace } : off,
        { age: (a) => (q.model.orientation ? attraction(sex, towards, a) : 1) },
        { age: (a) => (q.model.relationship ? 1 - inRelationship(sex, a) : 1) },
        { age: (a) => (q.model.looking ? looking(sex, a) : 1) },
      ];
      const chain = (a: number) => {
        const left = Float64Array.from(G);
        let total = pFinal;
        const byStep = surveySteps.map((step) => {
          if ("age" in step) {
            const k = step.age(a);
            if (k !== 1) for (let gi = 0; gi < NGROUP; gi++) left[gi] *= k;
            total *= k;
            return total;
          }
          total = 0;
          const memo = new Float64Array(step.keys).fill(NaN);
          for (let gi = 0; gi < NGROUP; gi++) {
            if (left[gi] <= 0) continue;
            const k = step.key(GROUPS[gi]);
            if (Number.isNaN(memo[k])) memo[k] = step.group(a, GROUPS[gi]);
            left[gi] *= memo[k];
            total += left[gi];
          }
          return total;
        });
        return { byStep, left };
      };
      const chains = ages.map(chain);
      const avgStep = (k: number) =>
        pFinal > 0 ? chains.reduce((t, ch, i) => t + sh[i] * ch.byStep[k], 0) / S / pFinal : 0;
      const spark = q.model.spark ?? 1;
      const accs = [out.height, out.smoke, out.religion, out.politics, out.wantKids, out.bmi, out.orientation, out.relationship, out.looking];
      accs.forEach((ac, k) => add(ac, C, varC, pFinal, n, avgStep(k)));
      add(out.spark, C, varC, pFinal, n, avgStep(accs.length - 1) * spark);

      const prev = mg === "nm" ? 0 : 1;
      const base = s.counts[sx][mg][b];
      ages.forEach((a, i) => {
        const { left } = chains[i];
        const row = (a - lo) * NTYPE;
        const rrow = (a - lo) * NRACE;
        // Everyone left at this age.
        let inPool = 0;
        for (let gi = 0; gi < NGROUP; gi++) {
          const v = base * sh[i] * left[gi];
          if (!(v > 0)) continue;
          inPool += v;
          const { race } = GROUPS[gi];
          out.typed.race[rrow + race] += v;
          comp.race[race] += v;
        }
        // What's left of each group relative to its size after the Census
        // steps, to carry down to the cells inside it; and kids someday by
        // group (it depends on education and kids).
        const ratio = new Float64Array(NGROUP);
        const cap = withFilters && f.bmiMax ? f.bmiMax : 0;
        const health = new Map<number, [number, number, number, number]>();
        const healthOf = (ba: number, race: number) => {
          const k = ba * NRACE + race;
          let h = health.get(k);
          if (!h) {
            h = [
              f.nonSmoker && withFilters ? 0 : (rate("smoke", a, ba, race) ?? 0),
              rate("obese", a, ba, race) ?? 0,
              rate("over", a, ba, race) ?? 0,
              cap ? (bmiRate(g, sex, a, s.id, cap, ba, race) ?? 0) : 0,
            ];
            health.set(k, h);
          }
          return h;
        };
        for (let gi = 0; gi < NGROUP; gi++) {
          ratio[gi] = G[gi] > 0 ? left[gi] / G[gi] : 0;
          const v = base * sh[i] * left[gi];
          if (!(v > 0)) continue;
          if (B) {
            // Religion and party among those left in this group: the joint,
            // restricted to your picks.
            const bl = beliefsLeft(a, GROUPS[gi].edu, GROUPS[gi].race);
            if (bl) {
              for (let r = 0; r < NREL; r++) {
                out.typed.rel[(a - lo) * NREL + r] += v * bl[0][r];
                comp.religion[r] += v * bl[0][r];
              }
              for (let pt = 0; pt < NPOL; pt++) {
                out.typed.pol[(a - lo) * NPOL + pt] += v * bl[1][pt];
                comp.politics[pt] += v * bl[1][pt];
              }
            }
          }
          if (lean) continue;
          // Health shares among those left (zero for anything filtered out);
          // under a BMI cap, the share still over 25 (or 30) among those kept.
          const gr = GROUPS[gi];
          const [sm, obRaw, ovRaw, capAbove] = healthOf(gr.edu >= 1 ? 1 : 0, gr.race);
          const keptB = Math.max(0.01, 1 - capAbove);
          if (comp.smoke !== null) comp.smoke += v * sm;
          if (comp.obese !== null) comp.obese += (v * (cap ? Math.max(0, obRaw - capAbove) : obRaw)) / (cap ? keptB : 1);
          if (comp.over !== null) comp.over += (v * (cap ? Math.max(0, ovRaw - capAbove) : ovRaw)) / (cap ? keptB : 1);
          const wm = wantMix(a, GROUPS[gi].edu, GROUPS[gi].kids, GROUPS[gi].race);
          if (!wm) continue;
          let wkSum = 0;
          for (let r = 0; r < NWANT; r++) if (!wantPicked || wantPicked.includes(r)) wkSum += wm[r];
          if (wkSum > 0)
            for (let r = 0; r < NWANT; r++) if (!wantPicked || wantPicked.includes(r)) comp.wantKids[r] += (v * wm[r]) / wkSum;
        }
        // Without the joint table: religion and party by age only.
        if (!B) {
          const rm = relMix(a) ?? new Array(NREL).fill(1 / NREL);
          const kept = relPicked ? rm.map((v, r) => (relPicked.includes(r) ? v : 0)) : rm;
          const keptSum = kept.reduce((x, y) => x + y, 0) || 1;
          for (let r = 0; r < NREL; r++) {
            const v = inPool * (kept[r] / keptSum);
            out.typed.rel[(a - lo) * NREL + r] += v;
            comp.religion[r] += v;
          }
          // Political leaning among those left.
          const pm = polMix(a) ?? new Array(NPOL).fill(1 / NPOL);
          const pk = polPicked ? pm.map((v, r) => (polPicked.includes(r) ? v : 0)) : pm;
          const pkSum = pk.reduce((x, y) => x + y, 0) || 1;
          for (let r = 0; r < NPOL; r++) {
            const v = inPool * (pk[r] / pkSum);
            out.typed.pol[(a - lo) * NPOL + r] += v;
            comp.politics[r] += v;
          }
        }
        for (let c = 0; c < NCELL; c++) {
          if (!(p[c] > 0) || !iw[c]) continue;
          const { edu, kids, inc, par } = cellOf(c);
          const mix = mixes[edu * 4 + inc];
          const g0 = groupOf(edu, kids, 0);
          let share = 0;
          for (let r = 0; r < NRACE; r++) if (kr[r]) share += mix[r] * ratio[g0 + r];
          const v = base * sh[i] * p[c] * iw[c] * share;
          if (!(v > 0)) continue;
          out.typed.m[row + typeIndex(edu, inc, kids, prev)] += v;
          comp.ages[a - lo] += v;
          comp.edu[edu] += v;
          comp.inc[inc] += v;
          comp.kids[kids] += v;
          comp.parents[par] += v;
          comp.marital[mg as "nm" | "div" | "wid" | "sep"] += v;
          comp.total += v;
        }
      });
    }
  });
  out.records = records;
  if (comp.total > 0) {
    if (comp.smoke !== null) comp.smoke /= comp.total;
    if (comp.obese !== null) comp.obese /= comp.total;
    if (comp.over !== null) comp.over /= comp.total;
  }
  return out;
}

const SEX_NOUN: Record<Sex, [string, string]> = { 1: ["man", "men"], 2: ["woman", "women"] };
export const noun = (sex: Sex, plural = true) => SEX_NOUN[sex][plural ? 1 : 0];

export function compute(s: Shard, g: Global, q: Query, choice?: Choice, detail = true, omitHeight = false, omitKids = false): Result {
  const issues: string[] = [];
  if (q.filters.wantKids.length && (q.seek.hi > 49 || g.kids?.schemaVersion !== 2)) {
    issues.push('Kids-someday estimates support ages 18–49 only. Narrow the range or remove this filter.');
    q = { ...q, filters: { ...q.filters, wantKids: [] } };
  }
  const T = q.seek.sex;
  const M = q.me.sex;
  const lo = Math.max(g.ageMin, Math.min(q.seek.lo, q.seek.hi));
  const hi = Math.min(g.ageMax, Math.max(q.seek.lo, q.seek.hi));
  const t = pool(s, g, q, T, M, lo, hi, true, !detail);
  const who = noun(T);
  const steps: Step[] = [];
  const push = (key: typeof FUNNEL_ORDER[number], label: string, dropped: string, a: Acc, kind: StepKind, sources: Source[], note: string) => {
    if (steps.length && FUNNEL_ORDER.indexOf(key) <= FUNNEL_ORDER.indexOf(steps[steps.length-1].key as typeof key)) throw new Error('Funnel registry order mismatch');
    steps.push({ key, label, dropped, value: a.value, moe: Z90 * Math.sqrt(a.variance), kind, sources, note });
  };

  push("pop", `Everyone in the ${s.kind === "micro" ? "area" : s.kind === "rural" ? "county" : "metro"}`, "", { value: s.pop, variance: 0 }, "census", [SOURCES.pop],
    "Total population of the Census metropolitan or micropolitan statistical area, all ages.");
  push("sex", cap(who), noun(M === T ? (T === 1 ? 2 : 1) : M), { value: s.sexPop[String(T) as "1" | "2"], variance: 0 }, "census", [SOURCES.pop],
    "Census asks about sex, not gender identity; this is the ACS sex variable.");
  push("age", `Aged ${lo}–${hi}`, `too young or too old`, t.age, "census", [SOURCES.acs, SOURCES.pums],
    "ACS publishes 5-year age bins; ranges that cut through a bin are split using single-year age shares from microdata for the same Census division, sex and marital status.");
  push("unmarried", q.model.separated ? "Not married (or separated)" : "Not married", "married",
    t.unmarried, "census", [SOURCES.acs],
    q.model.separated
      ? "Never married, divorced, widowed, plus legally married but separated."
      : "Never married, divorced or widowed. Separated people are legally married and excluded by default.");
  push("partner", "Not living with a partner", "living with a partner", t.partner, "microdata", [SOURCES.pums],
    "Removes unmarried people who live with a partner, plus people in institutions (prisons, nursing homes). Rates come from microdata for this area, shrunk toward the regional rate where the sample is thin.");
  if (q.filters.neverMarried)
    push("nm", "Never married", "divorced or widowed", t.neverMarried, "microdata", [SOURCES.acs, SOURCES.pums], "Excludes divorced and widowed people.");
  if (q.filters.edu > 0)
    push("edu", q.filters.edu === 1 ? "College grads" : "Graduate degrees", "not enough degree",
      t.edu, "microdata", [SOURCES.pums],
      "Education rates measured among unpartnered people of this sex and age, so the correlation with marriage is preserved.");
  if (q.filters.noKids)
    push("kids", "No kids at home", "kids at home", t.kids, "microdata", [SOURCES.pums],
      T === 1
        ? "Own children under 18 in the household. For men this is inferred from household relationships and misses children who live elsewhere, which is common after divorce."
        : "Own children under 18 in the household. Children who live elsewhere don't show up.");
  if (q.filters.notWithParents)
    push("parents", "Not living with their parents", "living with their parents", t.parents, "microdata", [SOURCES.pums],
      "Removes adult children of the householder: people living in a parent's (or step-parent's) home. Roommates and people whose parents live with them count as independent.");
  if (q.filters.incomeMin > 0)
    push("income", `Earning $${q.filters.incomeMin}k+`, "earning less",
      t.income, "microdata", [SOURCES.pums],
      "Personal income (all sources, 2024 dollars), not household income. Measured jointly with education, kids and living situation, so the correlations hold. The microdata here come in four brackets ($25k, $60k, $120k); a floor inside one keeps the national share of that bracket at or above it, by sex, age and education. Not adjusted for local cost of living.");
  if (q.filters.races.length) {
    const names = [...q.filters.races].sort().map((r) => RACES[r]);
    push('race', names.join(', '), 'other races and ethnicities', t.race, 'microdata', [SOURCES.pums],
      'Local race and education/income margins calibrated jointly using national associations. Other unmeasured correlations remain assumptions.');
  }
  const hf = heightFilter(q);
  if (hf) {
    const ft = (h: number) => `${Math.floor(h / 12)}′${h % 12}″`;
    const [label, gone] =
      hf.lo <= HEIGHT_MIN
        ? [`No taller than ${ft(hf.hi)}`, "taller"]
        : hf.hi >= HEIGHT_MAX
          ? [`At least ${ft(hf.lo)}`, "shorter"]
          : [`Between ${ft(hf.lo)} and ${ft(hf.hi)}`, "outside that range"];
    push("height", label, gone, t.height, "survey", [SOURCES.nhanes],
      "Share in the height range for each sex, age and race/ethnicity, from measured heights in CDC NHANES (normal distributions). Depends on race among who's left; assumed unrelated to education and everything else. National.");
  }
  if (q.filters.nonSmoker && g.health)
    push("smoke", "Non-smokers", "smoke", t.smoke, "survey", [SOURCES.nhanes, SOURCES.brfss],
      "Current cigarette smoking for unpartnered adults, modeled from NHANES 2017–2023 by sex, age, degree and race. Local or state BRFSS shifts use the latest supported vintage, disclosed in area context. Adjustments are ecological and net of composition. Residual associations with income and other filters are unmodeled.");
  if (q.filters.religions.length && g.religion) {
    const names = [...q.filters.religions].sort().map((r) => RELIGIONS[r]);
    push("religion", names.join(", "), "other religions (or none)", t.religion, "survey", [SOURCES.ces, SOURCES.religionLocal],
      "Religion of unmarried adults by sex, age, education and race/ethnicity, estimated jointly with party from the 2024 Cooperative Election Study and calibrated to Pew's national shares, then shifted by how this place's religious mix (Pew metro or state, plus CES respondents living there) differs from the US beyond its make-up. Follows the education and race mix of who's left; assumed unrelated to kids, income and health.");
  }
  if (q.filters.politics.length && g.politics) {
    // Shown as dealbreakers: "No Republicans" rather than "Democratic or
    // Independent/other".
    const out = PARTY_PLURAL.map((_, r) => r).filter((r) => !q.filters.politics.includes(r));
    const kept = [...q.filters.politics].sort();
    const [label, gone] =
      out.length === 1
        ? [`No ${PARTY_PLURAL[out[0]]}`, PARTY_PLURAL[out[0]]]
        : [`${kept.map((r) => PARTY_PLURAL[r]).join(" and ")} only`, out.map((r) => PARTY_PLURAL[r]).join(" and ")];
    push("politics", label, gone, t.politics, "survey", [SOURCES.ces, SOURCES.election],
      "Party identification of unmarried adults (leaners counted with their party) by sex, age, education, race/ethnicity and religion, from the 2024 Cooperative Election Study, with Democratic vs. Republican odds shifted by how this place voted in 2024 beyond what its make-up explains. Because it's joint with religion, a religion filter changes who's left politically. Assumed unrelated to kids, income and health.");
  }
  if (q.filters.wantKids.length && g.kids) {
    const out = WANT_KIDS.map((_, r) => r).filter((r) => !q.filters.wantKids.includes(r));
    const label = out.length === 1 ? `Not "${WANT_KIDS[out[0]].toLowerCase()}"` : q.filters.wantKids.map((r) => WANT_KIDS[r]).join(" or ");
    push("wantKids", out.length === 1 && out[0] === 2 ? "Open to kids" : out.length === 1 && out[0] === 0 ? "Not set on kids" : label,
      out.map((r) => WANT_KIDS[r].toLowerCase()).join(" and "), t.wantKids, "survey", [SOURCES.nsfgWant],
      "Whether unpartnered adults ages 18–49 want a(nother) baby someday, by sex, age, education and race (NSFG 2022–2023). Biological parenthood is marginalized; children-at-home status does not condition this estimate. Above age 49 is unsupported. Intentions change; residual associations with religion, income and children at home are not modeled.");
  }
  if (q.filters.bmiMax && g.health)
    push("bmi", `BMI under ${q.filters.bmiMax}`, `BMI ${q.filters.bmiMax} or higher`,
      t.bmi, "survey", [SOURCES.nhanes, SOURCES.brfss],
      "Measured BMI modeled from NHANES 2017–2023 by sex, age, degree and race. Local/state BRFSS shifts use the disclosed supported vintage, net of composition (overweight for cutoffs through 25, obesity above 30, blended between). Residual associations with income and other filters are unmodeled. This is a population estimate, not a judgment.");
  if (q.model.orientation)
    push("orientation", `Into ${noun(M)}`, `not into ${noun(M)}`, t.orientation, "survey", [SOURCES.gallup, SOURCES.nsfg],
      "National rates by sex and age (not local). Bisexual people count as attracted to both.");
  if (q.model.relationship)
    push("relationship", "Not seeing anyone", "seeing someone", t.relationship, "survey", [SOURCES.gss, SOURCES.hcmst, SOURCES.nsfg2022],
      "Removes unpartnered people who have a boyfriend, girlfriend or partner they don't live with. Estimated by sex and age from survey microdata: strict 'steady partner' questions (GSS) find about 15%, broad 'romantic partner' questions (HCMST, GSS 1996/98) 32-38%; we use the middle. Unpartnered women under 50 report more of these relationships than men; after 55 it flips.");
  if (q.model.looking)
    push("looking", "Actually looking", "not looking", t.looking, "survey", [SOURCES.pewLooking],
      "Share of singles currently looking for a relationship or dates, by age and sex. Many singles aren't.");
  if (q.model.spark !== null)
    push("spark", `Mutual spark (${Math.round(q.model.spark * 100)}%)`, "no spark", t.spark, "dial", [SOURCES.backus],
      "Your own assumption. Backus used 5% for mutual attraction.");

  for (let i = 1; i < steps.length; i++) {
    if (!Number.isFinite(steps[i].value) || steps[i].value < 0 || steps[i].value > steps[i - 1].value + Math.max(1, s.pop) * 1e-5)
      throw new Error(`Invalid funnel stage: ${steps[i].key}`);
  }

  let competition: Competition | null = null;
  if (choice && !issues.length) {
    // Competitors: available people of your sex at every age, into the sex
    // you're seeking, not seeing anyone and looking. Your filters don't apply.
    const comp = pool(s, g, q, M, T, g.ageMin, Math.min(85,g.ageMax), false, !detail);
    // Your filters are your preferences, not your competitors'. How crowded
    // the market is comes from the whole pool before your filters; how you
    // stack up comes from what your filtered pool goes for. The adjusted pool
    // is then your filtered pool x (your relative appeal / competitors per
    // person), assuming competitors spread their attention across the pool.
    const f = q.filters;
    const filtered =
      f.neverMarried || f.edu > 0 || f.noKids || f.notWithParents || f.incomeMin > 0 || f.nonSmoker || f.bmiMax > 0 ||
      f.races.length > 0 ||
      f.religions.length > 0 ||
      f.politics.length > 0 ||
      f.wantKids.length > 0 ||
      heightFilter(q) !== null;
    const base = filtered ? pool(s, g, q, T, M, lo, hi, false, !detail) : t;
    const relPairing = T === M ? undefined : g.religion?.pairing[`${T}${M}`];
    const polPairing = g.politics?.pairing[`${T}${M}`];
    const market = compete(choice, base.typed, comp.typed, { ...q, filters: { ...q.filters, height: 'any' } }, detail, relPairing, polPairing, omitHeight, omitKids, g.health?.cond?.height);
    const mine = filtered ? compete(choice, t.typed, comp.typed, q, detail, relPairing, polPairing, omitHeight, omitKids, g.health?.cond?.height) : market;
    if (market && mine) {
      const multiplier = market.ratio > 0 ? mine.relative / market.ratio : 0;
      competition = {
        ...mine,
        inRunning: market.inRunning,
        ratio: market.ratio,
        multiplier,
        adjusted: mine.targets * multiplier * (q.model.spark ?? 1),
      };
    }
  }

  return {
    market: { id: s.id, name: s.name, kind: s.kind, pop: s.pop },
    steps,
    final: steps[steps.length - 1],
    competition,
    composition: t.comp,
    effectiveSupport: t.records,
    demographicPool: t.looking.value,
    scenarioPool: t.spark.value,
    issues,
    ctx: g.ctx?.[s.id] ?? null,
  };
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
