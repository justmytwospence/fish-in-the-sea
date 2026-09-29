import {
  attraction,
  heightShare,
  inRelationship,
  looking,
  SOURCES,
  type Sex,
  type Source,
} from "./assumptions";
import { compete, type Choice, type Competition, type You } from "./competition";
import { NPOL, NRACE, NREL, NTYPE, PARTY_PLURAL, RACES, RELIGIONS, typeIndex, type Typed } from "./types";

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
}

export interface MarketCtx {
  src: "metro" | "state" | "us";
  smoke: number; // log-odds shift vs. the US
  obese: number;
  over: number;
  localSmoke: number; // all-adult prevalence, for display
  localObese: number;
  dem?: number; // 2024 two-party Democratic share
  votes?: number;
}

export interface Global {
  bins: [number, number][];
  ageMin: number;
  ageMax: number;
  ageShares: Record<string, Record<"1" | "2", Record<Marg, number[][]>>>;
  // Merged in from context.json.
  health?: HealthNational;
  ctx?: Record<string, MarketCtx>;
  religion?: ReligionData;
  politics?: PoliticsData;
}

export interface Query {
  market: string;
  me: { sex: Sex; age: number };
  seek: { sex: Sex; lo: number; hi: number };
  // height: whether they must be no taller (le) or no shorter (ge) than you;
  // undefined means the default for this pairing (see heightFilter).
  filters: {
    neverMarried: boolean;
    edu: 0 | 1 | 2;
    noKids: boolean;
    height?: "le" | "ge" | "any";
    notWithParents: boolean;
    incomeMin: 0 | 1 | 2 | 3; // income bracket floor: none, $25k+, $60k+, $120k+
    races: number[]; // race/ethnicity codes to include; empty = any
    religions: number[]; // religion codes to include; empty = any
    politics: number[]; // party codes to include; empty = any
    nonSmoker: boolean;
    bmiMax: 0 | 25 | 30; // 0 = no BMI filter
  };
  model: {
    separated: boolean; // count separated people as available
    orientation: boolean;
    relationship: boolean;
    looking: boolean;
    spark: number; // Backus-style mutual attraction, 0 = off
  };
  you: You;
}

export type StepKind = "census" | "microdata" | "survey" | "dial";

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
  records: number; // approx. survey records behind the microdata steps
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

export function mergeContext(g: Global, c: Context, r?: ReligionData, pol?: PoliticsData): Global {
  return { ...g, health: c.health, ctx: c.markets, religion: r, politics: pol };
}

export const NCELL = 97;
const INST = 96;
const UNMARRIED: UMarg[] = ["nm", "wid", "div"];
const Z90 = 1.645;

export const cellOf = (c: number) => ({
  cohab: Math.floor(c / 48),
  edu: Math.floor((c % 48) / 16),
  kids: Math.floor((c % 16) / 8),
  par: Math.floor((c % 8) / 4),
  inc: c % 4,
});

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));

// National rate for unpartnered adults of this sex and age (NHANES), shifted
// by the metro's (or state's) difference from the US on the log-odds scale.
function healthRate(g: Global, key: "smoke" | "obese" | "over", sex: Sex, age: number, marketId: string) {
  const h = g.health;
  if (!h) return null;
  const i = Math.max(0, h.bands.findIndex(([lo, hi]) => age >= lo && age <= hi));
  const base = h[key][String(sex) as "1" | "2"][i];
  const shift = g.ctx?.[marketId]?.[key] ?? 0;
  return sigmoid(logit(Math.min(0.98, Math.max(0.02, base))) + shift);
}

// Default height rule: men seeking women want them no taller, women seeking
// men want them no shorter; no default for same-sex searches.
export function heightDefault(q: Query): "le" | "ge" | "any" {
  if (q.me.sex === 1 && q.seek.sex === 2) return "le";
  if (q.me.sex === 2 && q.seek.sex === 1) return "ge";
  return "any";
}

export function heightFilter(q: Query): "le" | "ge" | null {
  if (q.you.height === undefined) return null;
  const dir = q.filters.height ?? heightDefault(q);
  return dir === "any" ? null : dir;
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
      if (k >= 4) ok &&= inc >= f.incomeMin;
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
  if (neff > 0 && p < 1) a.variance += (C * mod) ** 2 * (p * (1 - p)) / neff;
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
  const rate = (key: "smoke" | "obese" | "over", a: number) => healthRate(g, key, sex, a, s.id);
  // Health filters: independent of the Census attributes given sex and age.
  const fSmoke = (a: number) => (withFilters && f.nonSmoker ? 1 - (rate("smoke", a) ?? 0) : 1);
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
  const fPol = (a: number) => {
    if (!polPicked) return 1;
    const m = polMix(a);
    return m ? polPicked.reduce((t, r) => t + m[r], 0) : 1;
  };
  const fBmi = (a: number) =>
    withFilters && f.bmiMax ? 1 - (rate(f.bmiMax === 30 ? "obese" : "over", a) ?? 0) : 1;
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
      const pIncome = sumMask(p, masks.income);
      add(out.income, C, varC, pIncome, n, 1);
      // Race/ethnicity: this group's mix, restricted to the races you picked.
      const rs = s.race?.[sx]?.[mg]?.[b] ?? new Array(NRACE).fill(1 / NRACE);
      const picked = withFilters && f.races.length ? f.races : null;
      const rsKept = rs.map((v, r) => (!picked || picked.includes(r) ? v : 0));
      const raceKept = picked ? rsKept.reduce((a, v) => a + v, 0) : 1;
      const pFinal = pIncome * raceKept;
      add(out.race, C, varC, pFinal, n, 1);
      records += n * pFinal * S;

      // Survey-based factors vary by single year of age: average them over
      // the ages in this bin, weighted by the age shares.
      const avg = (f: (a: number) => number) => ages.reduce((t, a, i) => t + sh[i] * f(a), 0) / S;
      const fh = (a: number) => (hf ? heightShare(sex, a, q.you.height!, hf) : 1);
      const fs = (a: number) => fh(a) * fSmoke(a);
      const fb = (a: number) => fs(a) * fBmi(a);
      const fg = (a: number) => fb(a) * fRel(a);
      const fp = (a: number) => fg(a) * fPol(a);
      const fo = (a: number) => fp(a) * (q.model.orientation ? attraction(sex, towards, a) : 1);
      const fr = (a: number) => fo(a) * (q.model.relationship ? 1 - inRelationship(sex, a) : 1);
      const fl = (a: number) => fr(a) * (q.model.looking ? looking(sex, a) : 1);
      const spark = q.model.spark > 0 ? q.model.spark : 1;
      add(out.height, C, varC, pFinal, n, avg(fh));
      add(out.smoke, C, varC, pFinal, n, avg(fs));
      add(out.bmi, C, varC, pFinal, n, avg(fb));
      add(out.religion, C, varC, pFinal, n, avg(fg));
      add(out.politics, C, varC, pFinal, n, avg(fp));
      add(out.orientation, C, varC, pFinal, n, avg(fo));
      add(out.relationship, C, varC, pFinal, n, avg(fr));
      add(out.looking, C, varC, pFinal, n, avg(fl));
      add(out.spark, C, varC, pFinal, n, avg(fl) * spark);

      const prev = mg === "nm" ? 0 : 1;
      const base = s.counts[sx][mg][b];
      ages.forEach((a, i) => {
        const w = base * sh[i] * fl(a) * raceKept;
        const row = (a - lo) * NTYPE;
        const rrow = (a - lo) * NRACE;
        const inPool = base * sh[i] * fl(a) * pIncome;
        for (let r = 0; r < NRACE; r++) {
          out.typed.race[rrow + r] += inPool * rsKept[r];
          comp.race[r] += inPool * rsKept[r];
        }
        // Religion among those left: the mix, restricted to your picks.
        const rm = relMix(a) ?? new Array(NREL).fill(1 / NREL);
        const kept = relPicked ? rm.map((v, r) => (relPicked.includes(r) ? v : 0)) : rm;
        const keptSum = kept.reduce((x, y) => x + y, 0) || 1;
        for (let r = 0; r < NREL; r++) {
          const v = inPool * raceKept * (kept[r] / keptSum);
          out.typed.rel[(a - lo) * NREL + r] += v;
          comp.religion[r] += v;
        }
        // Political leaning among those left.
        const pm = polMix(a) ?? new Array(NPOL).fill(1 / NPOL);
        const pk = polPicked ? pm.map((v, r) => (polPicked.includes(r) ? v : 0)) : pm;
        const pkSum = pk.reduce((x, y) => x + y, 0) || 1;
        for (let r = 0; r < NPOL; r++) {
          const v = inPool * raceKept * (pk[r] / pkSum);
          out.typed.pol[(a - lo) * NPOL + r] += v;
          comp.politics[r] += v;
        }
        // Health shares among those left (zero for anything filtered out).
        const sm = f.nonSmoker && withFilters ? 0 : (rate("smoke", a) ?? 0);
        const obRaw = rate("obese", a) ?? 0;
        const ovRaw = rate("over", a) ?? 0;
        const ob = f.bmiMax && withFilters ? 0 : obRaw;
        const ov = !withFilters || !f.bmiMax ? ovRaw : f.bmiMax === 25 ? 0 : (ovRaw - obRaw) / Math.max(0.01, 1 - obRaw);
        for (let c = 0; c < NCELL; c++) {
          if (!masks.income[c] || p[c] <= 0) continue;
          const { edu, kids, inc, par } = cellOf(c);
          const v = w * p[c];
          out.typed.m[row + typeIndex(edu, inc, kids, prev)] += v;
          comp.ages[a - lo] += v;
          comp.edu[edu] += v;
          comp.inc[inc] += v;
          comp.kids[kids] += v;
          comp.parents[par] += v;
          comp.marital[mg as "nm" | "div" | "wid" | "sep"] += v;
          comp.total += v;
          if (comp.smoke !== null) comp.smoke += v * sm;
          if (comp.obese !== null) comp.obese += v * ob;
          if (comp.over !== null) comp.over += v * Math.max(0, ov);
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

export function compute(s: Shard, g: Global, q: Query, choice?: Choice, detail = true): Result {
  const T = q.seek.sex;
  const M = q.me.sex;
  const lo = Math.max(g.ageMin, Math.min(q.seek.lo, q.seek.hi));
  const hi = Math.min(g.ageMax, Math.max(q.seek.lo, q.seek.hi));
  const t = pool(s, g, q, T, M, lo, hi, true);
  const who = noun(T);
  const steps: Step[] = [];
  const push = (key: string, label: string, dropped: string, a: Acc, kind: StepKind, sources: Source[], note: string) =>
    steps.push({ key, label, dropped, value: a.value, moe: Z90 * Math.sqrt(a.variance), kind, sources, note });

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
    push("nm", "Never married", "divorced or widowed", t.neverMarried, "census", [SOURCES.acs], "Excludes divorced and widowed people.");
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
  if (q.filters.races.length) {
    const names = [...q.filters.races].sort().map((r) => RACES[r]);
    push("race", `${names.join(", ")}`, "other races and ethnicities", t.race, "microdata", [SOURCES.pums],
      "Race and ethnicity mix of available singles of this sex, age and marital status in this metro (Hispanic of any race; other groups non-Hispanic). Applied as independent of the education, kids, living-situation and income filters, which it isn't quite.");
  }
  if (q.filters.incomeMin > 0)
    push("income", `Earning ${["", "$25k", "$60k", "$120k"][q.filters.incomeMin]}+`, "earning less",
      t.income, "microdata", [SOURCES.pums],
      "Personal income (all sources, 2024 dollars), not household income. Measured jointly with education, kids and living situation, so the correlations hold. Not adjusted for local cost of living.");
  const hf = heightFilter(q);
  if (hf) {
    const h = q.you.height!;
    const ht = `${Math.floor(h / 12)}′${h % 12}″`;
    push("height", hf === "le" ? `No taller than you (${ht})` : `At least as tall as you (${ht})`,
      hf === "le" ? "taller than you" : "shorter than you", t.height, "survey", [SOURCES.nhanes],
      "Share of this sex and age at or under (or over) your height, from CDC NHANES 2015-2018 height distributions. Assumes height is unrelated to the other steps.");
  }
  if (q.filters.nonSmoker && g.health)
    push("smoke", "Non-smokers", "smoke", t.smoke, "survey", [SOURCES.nhanes, SOURCES.brfss],
      "Removes current cigarette smokers. National rates for unpartnered adults by sex and age (NHANES 2017-2023), shifted up or down by how this metro (or its state) compares with the US in the 2024 BRFSS. Assumes smoking is unrelated to the Census filters above; it actually falls with education.");
  if (q.filters.religions.length && g.religion) {
    const names = [...q.filters.religions].sort().map((r) => RELIGIONS[r]);
    push("religion", names.join(", "), "other religions (or none)", t.religion, "survey", [SOURCES.gss, SOURCES.religionLocal],
      "National religious identification of unmarried adults by sex and age (General Social Survey 2016-2024), shifted by how this state or metro differs from the US. Applied as independent of every other filter.");
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
    push("politics", label, gone, t.politics, "survey", [SOURCES.gss, SOURCES.election],
      "Party identification of unmarried adults by sex and age (General Social Survey 2016-2024, leaners counted with their party), with Democratic vs. Republican odds shifted by how this metro voted in 2024 relative to the country. Applied as independent of every other filter.");
  }
  if (q.filters.bmiMax && g.health)
    push("bmi", q.filters.bmiMax === 25 ? "BMI under 25" : "BMI under 30", q.filters.bmiMax === 25 ? "BMI 25 or higher" : "BMI 30 or higher",
      t.bmi, "survey", [SOURCES.nhanes, SOURCES.brfss],
      "Measured (not self-reported) BMI for unpartnered adults by sex and age from NHANES 2017-2023, shifted by how this metro (or its state) compares with the US on 2024 BRFSS obesity. BMI is a blunt instrument; this is a population estimate, not a judgment.");
  if (q.model.orientation)
    push("orientation", `Into ${noun(M)}`, `not into ${noun(M)}`, t.orientation, "survey", [SOURCES.gallup, SOURCES.nsfg],
      "National rates by sex and age (not local). Bisexual people count as attracted to both.");
  if (q.model.relationship)
    push("relationship", "Not seeing anyone", "seeing someone", t.relationship, "survey", [SOURCES.gss, SOURCES.hcmst, SOURCES.nsfg2022],
      "Removes unpartnered people who have a boyfriend, girlfriend or partner they don't live with. Estimated by sex and age from survey microdata: strict 'steady partner' questions (GSS) find about 15%, broad 'romantic partner' questions (HCMST, GSS 1996/98) 32-38%; we use the middle. Unpartnered women under 50 report more of these relationships than men; after 55 it flips.");
  if (q.model.looking)
    push("looking", "Actually looking", "not looking", t.looking, "survey", [SOURCES.pewLooking],
      "Share of singles currently looking for a relationship or dates, by age and sex. Many singles aren't.");
  if (q.model.spark > 0)
    push("spark", `Mutual spark (${Math.round(q.model.spark * 100)}%)`, "no spark", t.spark, "dial", [SOURCES.backus],
      "Your own assumption. Backus used 5% for mutual attraction.");

  for (let i = 1; i < steps.length; i++) steps[i].value = Math.min(steps[i].value, steps[i - 1].value);

  let competition: Competition | null = null;
  if (choice) {
    // Competitors: available people of your sex at every age, into the sex
    // you're seeking, not seeing anyone and looking. Your filters don't apply.
    const comp = pool(s, g, q, M, T, g.ageMin, g.ageMax, false);
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
      heightFilter(q) !== null;
    const base = filtered ? pool(s, g, q, T, M, lo, hi, false) : t;
    const relPairing = g.religion?.pairing[`${T}${M}`];
    const polPairing = g.politics?.pairing[`${T}${M}`];
    const market = compete(choice, base.typed, comp.typed, q, detail, relPairing, polPairing);
    const mine = filtered ? compete(choice, t.typed, comp.typed, q, detail, relPairing, polPairing) : market;
    if (market && mine) {
      const multiplier = market.ratio > 0 ? mine.relative / market.ratio : 0;
      competition = {
        ...mine,
        inRunning: market.inRunning,
        ratio: market.ratio,
        multiplier,
        adjusted: mine.targets * multiplier,
      };
    }
  }

  return {
    market: { id: s.id, name: s.name, kind: s.kind, pop: s.pop },
    steps,
    final: steps[steps.length - 1],
    competition,
    composition: t.comp,
    records: t.records,
    ctx: g.ctx?.[s.id] ?? null,
  };
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
