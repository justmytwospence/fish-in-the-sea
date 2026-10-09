import type { Choice } from "./competition";
import { compute, type Global, type Query, type Shard } from "./model";

export interface AgePoint {
  age: number; // your age
  lo: number; // target range at that age
  hi: number;
  raw: number;
  adjusted: number;
}

const MIN_AGE = 18;
const MAX_AGE = 90;

// Your prospects at each age from `span` years younger to `span` older, with
// every other filter held fixed. By default the target range slides along
// with you; with `slide` off it stays exactly as it is now. Uses today's
// population, so each point is "someone that age today", not a forecast of
// your own cohort.
export function overTime(s: Shard, g: Global, q: Query, choice: Choice, slide = true, span = 5): AgePoint[] {
  const out: AgePoint[] = [];
  const me = q.me.age;
  if (me === undefined) return out;
  for (let d = -span; d <= span; d++) {
    const age = me + d;
    if (age < MIN_AGE || age > MAX_AGE) continue;
    const shift = slide ? d : 0;
    const lo = Math.max(MIN_AGE, q.seek.lo + shift);
    const hi = Math.min(MAX_AGE, q.seek.hi + shift);
    if (lo > hi) continue;
    const r = compute(s, g, { ...q, me: { ...q.me, age }, seek: { ...q.seek, lo, hi } }, choice, false);
    if (!r.competition || r.issues.length) return [];
    out.push({ age, lo, hi, raw: r.final.value, adjusted: r.competition.adjusted });
  }
  return out;
}
