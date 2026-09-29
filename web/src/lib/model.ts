import {
  attraction,
  inRelationship,
  looking,
  SOURCES,
  type Sex,
  type Source,
} from "./assumptions";

export type Marg = "nm" | "sep" | "wid" | "div" | "mar";

export interface Shard {
  id: string;
  name: string;
  kind: "metro" | "micro" | "city";
  division: number;
  pop: number;
  sexPop: Record<"1" | "2", number>;
  counts: Record<"1" | "2", Record<Marg, number[]>>;
  moe: Record<"1" | "2", Record<Marg, number[]>>;
  // Per unmarried group and age bin: 13 proportions. Cells 0..11 are
  // cohab*6 + edu*2 + kids (edu 0 = no BA, 1 = BA, 2 = graduate); 12 is
  // institutional group quarters.
  attrs: Record<"1" | "2", Record<Exclude<Marg, "mar">, number[][]>>;
  neff: Record<"1" | "2", Record<Exclude<Marg, "mar">, number[]>>;
}

export interface Global {
  bins: [number, number][];
  ageMin: number;
  ageMax: number;
  ageShares: Record<string, Record<"1" | "2", Record<Marg, number[][]>>>;
  // partnerCdf["12"][own - ageMin][partner - ageMin] = P(partner age <= x)
  partnerCdf: Record<string, number[][]>;
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
}

export type StepKind = "census" | "microdata" | "survey" | "dial";

export interface Step {
  key: string;
  label: string;
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
  competitors: number;
  ratio: number; // competitors per available target (before your filters)
  censusRatio: number; // same, using only Census-based steps
  poolBeforeFilters: number;
  ageFit: number; // share of your final pool whose middle-50% partner age range includes you
}

const UNMARRIED: Exclude<Marg, "mar">[] = ["nm", "wid", "div"];
const Z90 = 1.645;

function marital(q: Query): Exclude<Marg, "mar">[] {
  if (q.filters.neverMarried) return ["nm"];
  return q.model.separated ? [...UNMARRIED, "sep"] : UNMARRIED;
}

function attrMask(q: Query, stage: "partner" | "edu" | "kids"): boolean[] {
  const mask: boolean[] = [];
  for (let c = 0; c < 13; c++) {
    const cohab = c < 12 ? Math.floor(c / 6) : 1;
    const edu = Math.floor((c % 6) / 2);
    const kids = c % 2;
    let ok = c < 12 && cohab === 0;
    if (stage !== "partner") ok &&= edu >= q.filters.edu;
    if (stage === "kids") ok &&= !q.filters.noKids || kids === 0;
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

function acc(): Acc {
  return { value: 0, variance: 0 };
}

function add(a: Acc, C: number, varC: number, p: number, neff: number, mod: number) {
  a.value += C * p * mod;
  a.variance += (p * mod) ** 2 * varC;
  if (neff > 0 && p < 1) a.variance += (C * mod) ** 2 * (p * (1 - p)) / neff;
}

// P(partner age in [lo, hi] | own age, own sex, partner sex)
export function partnerIn(g: Global, own: Sex, partner: Sex, age: number, lo: number, hi: number) {
  const row = g.partnerCdf[`${own}${partner}`][Math.min(age, g.ageMax) - g.ageMin];
  const at = (x: number) => (x < g.ageMin ? 0 : row[Math.min(x, g.ageMax) - g.ageMin]);
  return Math.max(0, at(hi) - at(lo - 1));
}

function partnerRange(g: Global, own: Sex, partner: Sex, age: number): [number, number] {
  const row = g.partnerCdf[`${own}${partner}`][Math.min(age, g.ageMax) - g.ageMin];
  const lo = row.findIndex((c) => c >= 0.25);
  const hi = row.findIndex((c) => c >= 0.75);
  return [lo + g.ageMin, hi + g.ageMin];
}

// Count of available people of `sex` by single year of age, down to the
// "open to dating" stage, applying the requested attribute filters.
function pool(
  s: Shard,
  g: Global,
  q: Query,
  sex: Sex,
  towards: Sex,
  lo: number,
  hi: number,
  withFilters: boolean,
  weight: (age: number) => number = () => 1,
) {
  const sx = String(sex) as "1" | "2";
  const shares = g.ageShares[String(s.division)][sx];
  const qq: Query = withFilters
    ? q
    : { ...q, filters: { neverMarried: false, edu: 0, noKids: false } };
  const margs = marital(qq);
  const masks = {
    partner: attrMask(qq, "partner"),
    edu: attrMask(qq, "edu"),
    kids: attrMask(qq, "kids"),
  };
  const out = {
    age: acc(),
    unmarried: acc(),
    partner: acc(),
    partnerW: acc(),
    neverMarried: acc(),
    edu: acc(),
    kids: acc(),
    orientation: acc(),
    relationship: acc(),
    looking: acc(),
    spark: acc(),
    byAge: new Map<number, number>(),
  };

  g.bins.forEach(([blo, bhi], b) => {
    const ages: number[] = [];
    for (let a = Math.max(lo, blo); a <= Math.min(hi, bhi); a++) ages.push(a);
    if (!ages.length) return;
    const allMargs: Marg[] = ["nm", "sep", "wid", "div", "mar"];
    for (const mg of allMargs) {
      const sh = ages.map((a) => shares[mg][b][a - blo] ?? 0);
      const S = sh.reduce((x, y) => x + y, 0);
      if (S <= 0) continue;
      const C = s.counts[sx][mg][b] * S;
      const varC = ((s.moe[sx][mg][b] * S) / Z90) ** 2;
      add(out.age, C, varC, 1, 0, 1);
      if (mg === "mar" || !(UNMARRIED as Marg[]).concat(q.model.separated ? ["sep"] : []).includes(mg)) continue;
      const m = mg as Exclude<Marg, "mar">;
      add(out.unmarried, C, varC, 1, 0, 1);
      const p = s.attrs[sx][m][b];
      const n = s.neff[sx][m][b];
      const pPartner = sumMask(p, masks.partner);
      add(out.partner, C, varC, pPartner, n, 1);
      add(out.partnerW, C, varC, pPartner, n, ages.reduce((t, a, i) => t + sh[i] * weight(a), 0) / S);
      if (!margs.includes(m)) continue;
      add(out.neverMarried, C, varC, pPartner, n, 1);
      add(out.edu, C, varC, sumMask(p, masks.edu), n, 1);
      const pKids = sumMask(p, masks.kids);
      add(out.kids, C, varC, pKids, n, 1);

      // Survey-based factors vary by single year of age: average them over
      // the ages in this bin, weighted by the age shares.
      const avg = (f: (a: number) => number) =>
        ages.reduce((t, a, i) => t + sh[i] * f(a), 0) / S;
      const fo = (a: number) => (q.model.orientation ? attraction(sex, towards, a) : 1) * weight(a);
      const fr = (a: number) => fo(a) * (q.model.relationship ? 1 - inRelationship(a) : 1);
      const fl = (a: number) => fr(a) * (q.model.looking ? looking(sex, a) : 1);
      const fs = (a: number) => fl(a) * (q.model.spark > 0 ? q.model.spark : 1);
      add(out.orientation, C, varC, pKids, n, avg(fo));
      add(out.relationship, C, varC, pKids, n, avg(fr));
      add(out.looking, C, varC, pKids, n, avg(fl));
      add(out.spark, C, varC, pKids, n, avg(fs));
      ages.forEach((a, i) => {
        const v = s.counts[sx][m][b] * sh[i] * pKids * fs(a);
        out.byAge.set(a, (out.byAge.get(a) ?? 0) + v);
      });
    }
  });
  return out;
}

const SEX_NOUN: Record<Sex, [string, string]> = { 1: ["man", "men"], 2: ["woman", "women"] };
export const noun = (sex: Sex, plural = true) => SEX_NOUN[sex][plural ? 1 : 0];

export function compute(s: Shard, g: Global, q: Query): Result {
  const T = q.seek.sex;
  const M = q.me.sex;
  const lo = Math.max(g.ageMin, Math.min(q.seek.lo, q.seek.hi));
  const hi = Math.min(g.ageMax, Math.max(q.seek.lo, q.seek.hi));
  const t = pool(s, g, q, T, M, lo, hi, true);
  const who = noun(T);
  const steps: Step[] = [];
  const push = (key: string, label: string, a: Acc, kind: StepKind, sources: Source[], note: string) =>
    steps.push({ key, label, value: a.value, moe: Z90 * Math.sqrt(a.variance), kind, sources, note });

  push("pop", `Everyone in the ${s.kind === "micro" ? "area" : "metro"}`, { value: s.pop, variance: 0 }, "census", [SOURCES.pop],
    "Total population of the Census metropolitan or micropolitan statistical area, all ages.");
  push("sex", `${cap(who)}`, { value: s.sexPop[String(T) as "1" | "2"], variance: 0 }, "census", [SOURCES.pop],
    "Census asks about sex, not gender identity; this is the ACS sex variable.");
  push("age", `…aged ${lo}–${hi}`, t.age, "census", [SOURCES.acs, SOURCES.pums],
    "ACS publishes 5-year age bins; ranges that cut through a bin are split using single-year age shares from microdata for the same Census division, sex and marital status.");
  push("unmarried", q.model.separated ? "…not married (or separated)" : "…not married",
    t.unmarried, "census", [SOURCES.acs],
    q.model.separated
      ? "Never married, divorced, widowed, plus legally married but separated."
      : "Never married, divorced or widowed. Separated people are legally married and excluded by default.");
  push("partner", "…not living with a partner", t.partner, "microdata", [SOURCES.pums],
    "Removes unmarried people who live with a partner, plus people in institutions (prisons, nursing homes). Rates come from microdata for this area, shrunk toward the regional rate where the sample is thin.");
  if (q.filters.neverMarried)
    push("nm", "…never married", t.neverMarried, "census", [SOURCES.acs], "Excludes divorced and widowed people.");
  if (q.filters.edu > 0)
    push("edu", q.filters.edu === 1 ? "…with a bachelor's degree or more" : "…with a graduate degree",
      t.edu, "microdata", [SOURCES.pums],
      "Education rates measured among unpartnered people of this sex and age, so the correlation with marriage is preserved.");
  if (q.filters.noKids)
    push("kids", "…no kids living at home", t.kids, "microdata", [SOURCES.pums],
      M === 2 && T === 1
        ? "Own children under 18 in the household. For men this is inferred from household relationships and misses children who live elsewhere, which is common after divorce."
        : "Own children under 18 in the household. Children who live elsewhere don't show up.");
  if (q.model.orientation)
    push("orientation", `…attracted to ${noun(M)}`, t.orientation, "survey", [SOURCES.gallup, SOURCES.nsfg],
      "National rates by sex and age (not local). Bisexual people count as attracted to both.");
  if (q.model.relationship)
    push("relationship", "…not seeing someone", t.relationship, "survey", [SOURCES.pewSingles, SOURCES.hcmst],
      "About a quarter to a third of people who are neither married nor cohabiting are still in a committed relationship, more when young.");
  if (q.model.looking)
    push("looking", "…actually looking", t.looking, "survey", [SOURCES.pewLooking],
      "Share of singles currently looking for a relationship or dates, by age and sex. Many singles aren't.");
  if (q.model.spark > 0)
    push("spark", `…and there's mutual spark (${Math.round(q.model.spark * 100)}%)`, t.spark, "dial", [SOURCES.backus],
      "Your own assumption. Backus used 5% for mutual attraction.");

  for (let i = 1; i < steps.length; i++) steps[i].value = Math.min(steps[i].value, steps[i - 1].value);

  // Competition: available people of your sex, any age, weighted by how often
  // someone their age ends up with a partner inside your target range
  // (from couples formed in the last five years).
  const comp = pool(s, g, q, M, T, g.ageMin, g.ageMax, false, (a) => partnerIn(g, M, T, a, lo, hi));
  const base = pool(s, g, q, T, M, lo, hi, false);
  const competitors = comp.spark.value;
  const poolBeforeFilters = base.spark.value;

  // Of your final pool, how many usually partner with someone your age?
  let fit = 0;
  let tot = 0;
  t.byAge.forEach((v, a) => {
    const [plo, phi] = partnerRange(g, T, M, a);
    tot += v;
    if (q.me.age >= plo && q.me.age <= phi) fit += v;
  });

  return {
    market: { id: s.id, name: s.name, kind: s.kind, pop: s.pop },
    steps,
    final: steps[steps.length - 1],
    competitors,
    poolBeforeFilters,
    ratio: poolBeforeFilters > 0 ? competitors / poolBeforeFilters : Infinity,
    censusRatio: base.partner.value > 0 ? comp.partnerW.value / base.partner.value : Infinity,
    ageFit: tot > 0 ? fit / tot : 0,
  };
}

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}
