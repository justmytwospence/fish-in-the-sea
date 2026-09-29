"use client";

import { noun, type Query, type Result } from "@/lib/model";
import { pct } from "@/lib/format";

function Bar({ label, value, max, accent }: { label: string; value: number; max: number; accent?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-3 rounded-sm bg-rule/40">
        <div
          className={`h-full rounded-sm transition-[width] duration-500 ${accent ? "bg-accent" : "bg-census"}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function Competition({ result, query }: { result: Result; query: Query }) {
  const them = noun(query.seek.sex);
  const us = noun(query.me.sex);
  const r = result.ratio;
  const per100 = isFinite(r) ? r * 100 : 0;
  const max = Math.max(100, per100);
  const same = query.me.sex === query.seek.sex;

  let verdict: string;
  if (!isFinite(r) || result.poolBeforeFilters < 1) verdict = "There's no one to compete over.";
  else if (r > 1.5) verdict = "The line is long.";
  else if (r > 1.1) verdict = "You're outnumbered.";
  else if (r >= 0.9) verdict = "Roughly even.";
  else verdict = "The math is on your side, for once.";

  return (
    <section aria-label="Competition" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">The competition</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">{verdict}</h2>
      <p className="mt-3 max-w-xl text-muted">
        For every 100 available {them} aged {query.seek.lo}–{query.seek.hi}, there are about{" "}
        <strong className="text-ink">{Math.round(per100)}</strong> available {same ? `${us} (any age)` : us} whose
        partners typically fall in that age range.
      </p>

      <div className="mt-6 max-w-xl space-y-3">
        <Bar label={`Available ${them}`} value={100} max={max} />
        <Bar label={`${same ? "Other " : ""}${us[0].toUpperCase()}${us.slice(1)} competing for them`} value={per100} max={max} accent />
      </div>

      <dl className="mt-6 grid max-w-xl gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Census steps only</dt>
          <dd className="font-display text-xl">
            {isFinite(result.censusRatio) ? `${Math.round(result.censusRatio * 100)} per 100` : "n/a"}
          </dd>
          <dd className="text-muted">
            Unpartnered people only, before the survey adjustments for orientation, relationships and who&apos;s
            looking. The survey steps move this a lot, mostly because single men say they&apos;re looking more often
            than single women do.
          </dd>
        </div>
        <div>
          <dt className="text-muted">Age fit</dt>
          <dd className="font-display text-xl">{pct(result.ageFit)}</dd>
          <dd className="text-muted">
            of your pool usually ends up with someone about your age ({query.me.age} falls in the middle half of
            partner ages for {them} their age).
          </dd>
        </div>
      </dl>
      <p className="mt-4 max-w-xl text-xs text-muted">
        Competitors are weighted by how often people their age actually pair with someone in your target range,
        using couples who married or moved in together within the last five years (ACS microdata).
        Your filters (degree, kids, never married) are ignored here, since the competition is for the same
        pool before your preferences kick in.
      </p>
    </section>
  );
}
