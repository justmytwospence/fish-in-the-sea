import type { Choice } from "./competition";
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

const INCOME = ["", "$25k", "$60k", "$120k"];
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
  if (f.incomeMin > 0)
    cands.push({
      key: "inc",
      label: f.incomeMin === 1 ? "Drop the income floor" : `Lower the income floor to ${INCOME[f.incomeMin - 1]}`,
      query: withF({ incomeMin: (f.incomeMin - 1) as 0 | 1 | 2 }),
    });
  if (f.nonSmoker) cands.push({ key: "smoke", label: "Accept smokers", query: withF({ nonSmoker: false }) });
  if (f.bmiMax === 25) cands.push({ key: "bmi", label: "Loosen BMI to under 30", query: withF({ bmiMax: 30 }) });
  if (f.bmiMax === 30) cands.push({ key: "bmi", label: "Drop the BMI filter", query: withF({ bmiMax: 0 }) });
  if (heightFilter(q)) cands.push({ key: "height", label: "Drop the height rule", query: withF({ height: "any" }) });
  if (q.seek.lo > 18) {
    const lo = Math.max(18, q.seek.lo - AGE_STEP);
    cands.push({ key: "younger", label: `Widen to ${lo}–${q.seek.hi}`, query: { ...q, seek: { ...q.seek, lo } } });
  }
  if (q.seek.hi < 90) {
    const hi = Math.min(90, q.seek.hi + AGE_STEP);
    cands.push({ key: "older", label: `Widen to ${q.seek.lo}–${hi}`, query: { ...q, seek: { ...q.seek, hi } } });
  }

  const options = cands.map((c) => {
    const r = run(c.query);
    return { ...c, ...r, dRaw: r.raw - base.raw, dAdjusted: r.adjusted - base.adjusted };
  });
  return { base, options };
}
