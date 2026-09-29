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
// the target range shifted by the same amount and every other filter held
// fixed. Uses today's population, so each point is "someone that age today",
// not a forecast of your own cohort.
export function overTime(s: Shard, g: Global, q: Query, choice: Choice, span = 5): AgePoint[] {
  const out: AgePoint[] = [];
  for (let d = -span; d <= span; d++) {
    const age = q.me.age + d;
    if (age < MIN_AGE || age > MAX_AGE) continue;
    const lo = Math.max(MIN_AGE, q.seek.lo + d);
    const hi = Math.min(MAX_AGE, q.seek.hi + d);
    if (lo > hi) continue;
    const r = compute(s, g, { ...q, me: { ...q.me, age }, seek: { ...q.seek, lo, hi } }, choice, false);
    out.push({ age, lo, hi, raw: r.final.value, adjusted: r.competition?.adjusted ?? r.final.value });
  }
  return out;
}
