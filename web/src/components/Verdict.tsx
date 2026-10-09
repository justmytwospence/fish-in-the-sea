"use client";

import { noun, type Query, type Result } from "@/lib/model";
import { approx, fmt, shortCity } from "@/lib/format";

const VENUES: [number, string][] = [
  [4, "the back seat of a rideshare"],
  [10, "a booth at a diner"],
  [24, "a dinner party"],
  [70, "a city bus"],
  [180, "a wedding reception"],
  [450, "a movie theater"],
  [1500, "a high-school gym"],
  [7000, "a minor-league ballpark"],
  [20000, "an NBA arena"],
  [70000, "an NFL stadium"],
  [107000, "Michigan Stadium, the largest in the country"],
];

export function venue(n: number): string {
  const v = VENUES.find(([cap]) => n <= cap);
  if (v) return `They'd all fit in ${v[1]}.`;
  return `You'd need ${Math.ceil(n / 70000)} NFL stadiums.`;
}

export default function Verdict({ result, query }: { result: Result; query: Query }) {
  const n = result.final.value;
  const who = noun(query.seek.sex);
  const city = shortCity(result.market.name);
  const oneIn = n > 0 ? result.market.pop / n : Infinity;
  const years = n / 52;
  const lo = Math.max(0, n - result.final.moe);
  const hi = n + result.final.moe;

  return (
    <section aria-label="The verdict" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">The verdict</p>
      <p className="mt-3 font-display text-6xl leading-none tracking-tight sm:text-7xl">
        {n >= 1 ? fmt(n) : n > 0 ? "less than one" : "zero"}
      </p>
      <p className="mt-3 text-lg">
        Estimated {who} aged {query.seek.lo}–{query.seek.hi} in the {city} statistical area who pass the enabled filters. Not a count of reachable or mutually interested partners.
      </p>
      {result.final.kind === 'census' && result.final.moe > 0 && n >= 10 && (
        <p className="mt-1 text-sm text-muted">
          Approximate ACS-only sampling range {fmt(lo)}–{fmt(hi)}. Model and allocation uncertainty are excluded.
        </p>
      )}

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <li className="rounded-lg border border-rule bg-card p-4">
          <p className="font-display text-xl">{venue(n)}</p>
        </li>
        <li className="rounded-lg border border-rule bg-card p-4">
          <p className="font-display text-xl">
            {isFinite(oneIn) ? <>1 in {fmt(oneIn)} people in the area.</> : "Nobody in the area."}
          </p>
          <p className="mt-1 text-sm text-muted">So the stranger on the train is almost certainly not the one.</p>
        </li>
        <li className="rounded-lg border border-rule bg-card p-4">
          <p className="font-display text-xl">
            {years >= 1 ? `${approx(years)} years` : `${approx(n)} weeks`} of weekly first dates
          </p>
          <p className="mt-1 text-sm text-muted">to meet every one of them, assuming you could find them.</p>
        </li>
        <li className="rounded-lg border border-rule bg-card p-4">
          <p className="font-display text-xl">
            {n >= 26 ? `${approx(n / 26)}× Peter Backus` : "Fewer than Peter Backus"}
          </p>
          <p className="mt-1 text-sm text-muted">
            In 2010, the economist calculated he had 26 potential girlfriends in the entire UK. He got married
            anyway.
          </p>
        </li>
      </ul>
      <p className="mt-8 font-display text-2xl italic">You only need one.</p>
    </section>
  );
}
