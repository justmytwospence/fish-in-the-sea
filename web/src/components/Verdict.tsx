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

const UNITS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function DotGrid({ n }: { n: number }) {
  const count = Math.round(n);
  const unit = UNITS.find((u) => count / u <= 500) ?? 10000;
  const dots = Math.max(0, Math.round(count / unit));
  const cols = dots <= 100 ? Math.max(10, Math.ceil(Math.sqrt(dots * 2.5))) : 50;
  const rows = Math.ceil(dots / cols);
  const cell = 10;
  return (
    <figure className="mt-6">
      <svg
        viewBox={`0 0 ${cols * cell} ${Math.max(rows, 1) * cell}`}
        className="w-full"
        style={{ maxHeight: 360 }}
        role="img"
        aria-label={`${dots} dots, each one ${unit === 1 ? "person" : `${unit} people`}`}
      >
        {Array.from({ length: dots }, (_, i) => (
          <circle
            key={i}
            cx={(i % cols) * cell + cell / 2}
            cy={Math.floor(i / cols) * cell + cell / 2}
            r={cell * 0.34}
            className="fill-accent"
          />
        ))}
      </svg>
      <figcaption className="mt-2 text-xs text-muted">
        {dots === 0 ? "Not even one dot." : unit === 1 ? "One dot per person." : `One dot per ${fmt(unit)} people.`}
      </figcaption>
    </figure>
  );
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
        {who} aged {query.seek.lo}–{query.seek.hi} in the {city} area who might, in theory, date you.
      </p>
      {result.final.moe > 0 && n >= 10 && (
        <p className="mt-1 text-sm text-muted">
          Sampling range {fmt(lo)}–{fmt(hi)}. The survey-based steps are rougher than that.
        </p>
      )}

      <DotGrid n={n} />

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
