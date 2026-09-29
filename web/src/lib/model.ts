import {
  attraction,
  inRelationship,
  looking,
  SOURCES,
  type Sex,
  type Source,
} from "./assumptions";
import { compete, type Choice, type Competition, type You } from "./competition";
import { NTYPE, typeIndex, type Typed } from "./types";

export type Marg = "nm" | "sep" | "wid" | "div" | "mar";
type UMarg = Exclude<Marg, "mar">;

export interface Shard {
  id: string;
  name: string;
  kind: "metro" | "micro" | "city";
  division: number;
  pop: number;
  sexPop: Record<"1" | "2", number>;
  counts: Record<"1" | "2", Record<Marg, number[]>>;
  moe: Record<"1" | "2", Record<Marg, number[]>>;
  // Per unmarried group and age bin: 49 proportions. Cells 0..47 are
  // cohab*24 + edu*8 + kids*4 + inc (edu 0 none / 1 BA / 2 graduate; income
  // <25k / 25-60k / 60-120k / 120k+); 48 is institutional group quarters.
  attrs: Record<"1" | "2", Record<UMarg, number[][]>>;
  neff: Record<"1" | "2", Record<UMarg, number[]>>;
}

export interface Global {
  bins: [number, number][];
  ageMin: number;
  ageMax: number;
  ageShares: Record<string, Record<"1" | "2", Record<Marg, number[][]>>>;
}

export interface Query {
  market: string;
  me: { sex: Sex; age: number };
  seek: { sex: Sex; lo: number; hi: number };
  filters: { neverMarried: boolean; edu: 0 | 1 | 2; noKids: boolean };
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

export interface Result {
  market: Pick<Shard, "id" | "name" | "kind" | "pop">;
  steps: Step[];
  final: Step;
  competition: Competition | null;
}

export const NCELL = 49;
const INST = 48;
const UNMARRIED: UMarg[] = ["nm", "wid", "div"];
const Z90 = 1.645;

export const cellOf = (c: number) => ({
  cohab: Math.floor(c / 24),
  edu: Math.floor((c % 24) / 8),
  kids: Math.floor((c % 8) / 4),
  inc: c % 4,
});

function marital(q: Query, withFilters: boolean): UMarg[] {
  if (withFilters && q.filters.neverMarried) return ["nm"];
  return q.model.separated ? [...UNMARRIED, "sep"] : UNMARRIED;
}

type Stage = "partner" | "edu" | "kids";

function attrMask(q: Query, stage: Stage, withFilters: boolean): boolean[] {
  const mask: boolean[] = [];
  for (let c = 0; c < NCELL; c++) {
    const { cohab, edu, kids } = cellOf(c);
    let ok = c !== INST && cohab === 0;
    if (withFilters && stage !== "partner") ok &&= edu >= q.filters.edu;
    if (withFilters && stage === "kids") ok &&= !q.filters.noKids || kids === 0;
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
  const available = marital(q, false);
  const margs = marital(q, withFilters);
  const masks = {
    partner: attrMask(q, "partner", withFilters),
    edu: attrMask(q, "edu", withFilters),
    kids: attrMask(q, "kids", withFilters),
  };
  const out = {
    age: acc(),
    unmarried: acc(),
    partner: acc(),
    neverMarried: acc(),
    edu: acc(),
    kids: acc(),
    orientation: acc(),
    relationship: acc(),
    looking: acc(),
    spark: acc(),
    typed: { lo, hi, m: new Float64Array((hi - lo + 1) * NTYPE) } as Typed,
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
      const pKids = sumMask(p, masks.kids);
      add(out.kids, C, varC, pKids, n, 1);

      // Survey-based factors vary by single year of age: average them over
      // the ages in this bin, weighted by the age shares.
      const avg = (f: (a: number) => number) => ages.reduce((t, a, i) => t + sh[i] * f(a), 0) / S;
      const fo = (a: number) => (q.model.orientation ? attraction(sex, towards, a) : 1);
      const fr = (a: number) => fo(a) * (q.model.relationship ? 1 - inRelationship(a) : 1);
      const fl = (a: number) => fr(a) * (q.model.looking ? looking(sex, a) : 1);
      const spark = q.model.spark > 0 ? q.model.spark : 1;
      add(out.orientation, C, varC, pKids, n, avg(fo));
      add(out.relationship, C, varC, pKids, n, avg(fr));
      add(out.looking, C, varC, pKids, n, avg(fl));
      add(out.spark, C, varC, pKids, n, avg(fl) * spark);

      const prev = mg === "nm" ? 0 : 1;
      const base = s.counts[sx][mg][b];
      ages.forEach((a, i) => {
        const f = base * sh[i] * fl(a);
        const row = (a - lo) * NTYPE;
        for (let c = 0; c < NCELL; c++) {
          if (!masks.kids[c] || p[c] <= 0) continue;
          const { edu, kids, inc } = cellOf(c);
          out.typed.m[row + typeIndex(edu, inc, kids, prev)] += f * p[c];
        }
      });
    }
  });
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

  push("pop", `Everyone in the ${s.kind === "micro" ? "area" : "metro"}`, "", { value: s.pop, variance: 0 }, "census", [SOURCES.pop],
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
  if (q.model.orientation)
    push("orientation", `Into ${noun(M)}`, `not into ${noun(M)}`, t.orientation, "survey", [SOURCES.gallup, SOURCES.nsfg],
      "National rates by sex and age (not local). Bisexual people count as attracted to both.");
  if (q.model.relationship)
    push("relationship", "Not seeing anyone", "seeing someone", t.relationship, "survey", [SOURCES.pewSingles, SOURCES.hcmst],
      "About a quarter to a third of people who are neither married nor cohabiting are still in a committed relationship, more when young.");
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
    competition = compete(choice, t.typed, comp.typed, q, detail);
  }

  return {
    market: { id: s.id, name: s.name, kind: s.kind, pop: s.pop },
    steps,
    final: steps[steps.length - 1],
    competition,
  };
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
