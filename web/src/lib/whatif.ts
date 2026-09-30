import type { Choice } from "./competition";
import { HEIGHT_MAX, HEIGHT_MIN } from "./assumptions";
import { compute, heightFilter, type Global, type Query, type Shard } from "./model";

export interface WhatIf {
  key: string;
  label: string;
  query: Query;
  raw: number;
  adjusted: number;
  dRaw: number; // change vs. your current search
  dAdjusted: number;
}

const AGE_STEP = 1;

// Every one-notch loosening of your current search, with what it does to
// the raw and competition-adjusted pools.
export function whatIfs(s: Shard, g: Global, q: Query, choice: Choice): { base: { raw: number; adjusted: number }; options: WhatIf[] } {
  const run = (qq: Query) => {
    const r = compute(s, g, qq, choice, false);
    return { raw: r.final.value, adjusted: r.competition?.adjusted ?? r.final.value };
  };
  const base = run(q);
  const f = q.filters;
  const cands: { key: string; label: string; query: Query }[] = [];
  const withF = (patch: Partial<Query["filters"]>): Query => ({ ...q, filters: { ...f, ...patch } });

  if (f.neverMarried) cands.push({ key: "nm", label: "Include divorced and widowed", query: withF({ neverMarried: false }) });
  if (f.edu === 2) cands.push({ key: "edu", label: "Accept a bachelor's, not just a grad degree", query: withF({ edu: 1 }) });
  if (f.edu === 1) cands.push({ key: "edu", label: "Drop the degree requirement", query: withF({ edu: 0 }) });
  if (f.noKids) cands.push({ key: "kids", label: "Accept kids at home", query: withF({ noKids: false }) });
  if (f.notWithParents) cands.push({ key: "par", label: "Accept living with parents", query: withF({ notWithParents: false }) });
  if (f.incomeMin > 0) {
    const lower = Math.max(0, f.incomeMin - 10);
    cands.push({
      key: "inc",
      label: lower === 0 ? "Drop the income floor" : `Lower the income floor to $${lower}k`,
      query: withF({ incomeMin: lower }),
    });
  }
  if (f.races.length) cands.push({ key: "race", label: "Drop the race/ethnicity filter", query: withF({ races: [] }) });
  if (f.religions.length) cands.push({ key: "religion", label: "Drop the religion filter", query: withF({ religions: [] }) });
  if (f.politics.length) cands.push({ key: "politics", label: "Drop the politics filter", query: withF({ politics: [] }) });
  if (f.wantKids.length) cands.push({ key: "wantKids", label: "Drop the kids-someday filter", query: withF({ wantKids: [] }) });
  if (f.nonSmoker) cands.push({ key: "smoke", label: "Accept smokers", query: withF({ nonSmoker: false }) });
  if (f.bmiMax) {
    const up = f.bmiMax + 2;
    cands.push(
      up > 40
        ? { key: "bmi", label: "Drop the BMI filter", query: withF({ bmiMax: 0 }) }
        : { key: "bmi", label: `Loosen BMI to under ${up}`, query: withF({ bmiMax: up }) },
    );
  }
  const hr = heightFilter(q);
  if (hr) {
    const wider = { lo: Math.max(HEIGHT_MIN, hr.lo - 1), hi: Math.min(HEIGHT_MAX, hr.hi + 1) };
    cands.push({ key: "height", label: "Widen the height range by an inch each way", query: withF({ height: wider }) });
    cands.push({ key: "height0", label: "Drop the height range", query: withF({ height: "any" }) });
  }
  if (q.seek.lo > 18) {
    const lo = Math.max(18, q.seek.lo - AGE_STEP);
    cands.push({ key: "younger", label: `Lower the age floor by a year (to ${lo})`, query: { ...q, seek: { ...q.seek, lo } } });
  }
  if (q.seek.hi < 90) {
    const hi = Math.min(90, q.seek.hi + AGE_STEP);
    cands.push({ key: "older", label: `Raise the age ceiling by a year (to ${hi})`, query: { ...q, seek: { ...q.seek, hi } } });
  }

  const options = cands.map((c) => {
    const r = run(c.query);
    return { ...c, ...r, dRaw: r.raw - base.raw, dAdjusted: r.adjusted - base.adjusted };
  });
  return { base, options };
}
