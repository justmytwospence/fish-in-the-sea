"use client";

import { useState } from "react";
import { noun, type Query, type Result } from "@/lib/model";
import { fmt, pct, shortCity } from "@/lib/format";
import { PARTIES, RACES, RELIGIONS, WANT_KIDS } from "@/lib/types";

// Ordinal ramp from the accent hue: lightest = first level.
const RAMP = [22, 45, 70, 100];

function Stack({ title, labels, values }: { title: string; labels: string[]; values: number[] }) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const n = values.length;
  const shade = (i: number) => RAMP[n === 2 ? [1, 3][i] : n === 3 ? [0, 2, 3][i] : i];
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 flex h-4 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${pct(values[i] / total)}`).join(", ")}`}>
        {values.map((v, i) =>
          v / total > 0.001 ? (
            <div
              key={i}
              title={`${labels[i]}: ${pct(v / total)}`}
              style={{ width: `${(v / total) * 100}%`, background: `color-mix(in srgb, var(--accent) ${shade(i)}%, var(--card))` }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
        {values.map((v, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: `color-mix(in srgb, var(--accent) ${shade(i)}%, var(--card))` }}
            />
            {labels[i]} <span className="tabular-nums text-ink">{pct(v / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shares as a small table: label, bar, percent.
function Bars({ title, labels, values, est }: { title: string; labels: string[]; values: number[]; est?: boolean }) {
  const tot = values.reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <p className="text-sm font-medium">
        {title}
        {est && (
          <>
            {" "}
            <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">est.</span>
          </>
        )}
      </p>
      <table className="mt-2 w-full text-xs">
        <tbody>
          {labels.map((label, r) => {
            const v = values[r] / tot;
            return (
              <tr key={label} title={`${label}: ${pct(v)}`}>
                <th scope="row" className="whitespace-nowrap py-0.5 pr-3 text-left font-normal text-muted">
                  {label}
                </th>
                <td className="w-full py-0.5">
                  <span className="block h-2 overflow-hidden rounded-[4px] bg-rule/40">
                    <span className="block h-full rounded-[4px] bg-accent" style={{ width: `${v * 100}%` }} />
                  </span>
                </td>
                <td className="whitespace-nowrap py-0.5 pl-3 text-right tabular-nums">{pct(v)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgeHistogram({ lo, ages }: { lo: number; ages: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 110;
  const max = Math.max(...ages, 1);
  const bw = W / ages.length;
  const total = ages.reduce((a, b) => a + b, 0) || 1;
  const hi = lo + ages.length - 1;
  return (
    <div>
      <p className="text-sm font-medium">
        Age{" "}
        <span className="font-normal text-muted">
          {hover !== null ? `· ${lo + hover}: ${fmt(ages[hover])} (${pct(ages[hover] / total)})` : ""}
        </span>
      </p>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-2 w-full" role="img" aria-label={`Age distribution of your pool, ${lo} to ${hi}`}>
        {ages.map((v, i) => {
          const h = (v / max) * H;
          return (
            <g key={i} onPointerDown={() => setHover(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect
                x={i * bw + 1}
                y={H - h}
                width={Math.max(1, bw - 2)}
                height={h}
                rx={Math.min(4, bw / 3)}
                className={hover === i ? "fill-ink" : "fill-accent"}
              />
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-rule" />
        {[...new Set([0, Math.floor((ages.length - 1) / 2), ages.length - 1])].map((i) => (
          <text key={i} x={i * bw + bw / 2} y={H + 13} textAnchor="middle" className="fill-muted text-[10px]">
            {lo + i}
          </text>
        ))}
      </svg>
      <details className="mt-2 text-xs"><summary className="cursor-pointer">Age values as a table</summary><table className="mt-2 w-full"><caption className="sr-only">Estimated pre-spark pool by age</caption><thead><tr><th scope="col">Age</th><th scope="col">Estimated count</th><th scope="col">Share</th></tr></thead><tbody>{ages.map((v,i)=><tr key={i}><th scope="row">{lo+i===90?'90+':lo+i}</th><td className="text-center">{fmt(v)}</td><td className="text-center">{pct(v/total)}</td></tr>)}</tbody></table></details>
    </div>
  );
}

export default function WhoIsLeft({ result, query, dataYear }: { result: Result; query: Query; dataYear: string }) {
  const c = result.composition;
  const who = noun(query.seek.sex);
  const city = shortCity(result.market.name);
  const ctx = result.ctx;
  if (c.total < 0.5) return null;
  const f = query.filters;

  return (
    <section aria-label="Who's left" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Who&apos;s left</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">Meet the {fmt(c.total)}.</h2>
      <p className="mt-3 max-w-xl text-muted">
        The {who} who made it through your sieve in the {city} area, by the numbers. (Before any &ldquo;spark&rdquo; you
        dialed in; the mix doesn&apos;t change.)
      </p>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <AgeHistogram lo={c.ageLo} ages={c.ages} />
        <div className="space-y-5">
          <Stack title="Education" labels={["No degree", "Bachelor's", "Graduate"]} values={c.edu} />
          <Stack title="Income" labels={["Under $25k", "$25–60k", "$60–120k", "$120k+"]} values={c.inc} />
        </div>
        <Stack
          title="Marital history"
          labels={["Never married", "Divorced", "Widowed", "Separated"]}
          values={[c.marital.nm, c.marital.div, c.marital.wid, c.marital.sep]}
        />
        <Stack title="Kids at home" labels={["No kids", "Has kids"]} values={c.kids} />
        <Bars title="Race/ethnicity" labels={RACES} values={c.race} />
        <Bars title="Religion" est labels={RELIGIONS} values={c.religion} />
        <Bars title="Politics" est labels={PARTIES} values={c.politics} />
        {c.wantKids.some((v) => v > 0) && <Bars title="Kids someday" est labels={WANT_KIDS} values={c.wantKids} />}
        <Stack title="Living situation" labels={["On their own or with others", "With parents"]} values={c.parents} />
        {c.smoke !== null && c.obese !== null && c.over !== null && (
          <div>
            <p className="text-sm font-medium">
              Health <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">est.</span>
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Smoke</dt>
                <dd className="font-display text-2xl tabular-nums">{f.nonSmoker ? "0%" : pct(c.smoke)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">BMI 25–30</dt>
                <dd className="font-display text-2xl tabular-nums">{pct(Math.max(0, c.over - c.obese))}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">BMI 30+</dt>
                <dd className="font-display text-2xl tabular-nums">{pct(c.obese)}</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted">
              National rates for unpartnered adults by sex and age (NHANES, measured), adjusted to local 2024 BRFSS
              levels.
            </p>
          </div>
        )}
      </div>

      {ctx && (
        <div className="mt-8 rounded-xl border border-rule bg-card p-5 text-sm">
          <p className="text-xs uppercase tracking-widest text-muted">The {city} area, for context</p>
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-muted">2024 presidential vote</dt>
              <dd className="font-display text-xl">
                {ctx.dem != null ? (
                  <>
                    {pct(ctx.dem)} D · {pct(1 - ctx.dem)} R
                  </>
                ) : (
                  "not available"
                )}
              </dd>
              <dd className="text-xs text-muted">
                Two-party share, all voters. Young singles lean further left than their metro.
              </dd>
            </div>
            <div>
              <dt className="text-muted">Adults who smoke</dt>
              <dd className="font-display text-xl">{pct(ctx.localSmoke)}</dd>
              <dd className="text-xs text-muted">
                {ctx.src === 'metro' ? 'Metro/division adjustment' : ctx.src === 'state' ? 'State fallback' : 'US fallback'}, BRFSS {ctx.sourceYear ?? 'vintage unavailable'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Adults with obesity</dt>
              <dd className="font-display text-xl">{pct(ctx.localObese)}</dd>
              <dd className="text-xs text-muted">
                {ctx.src === 'metro' ? 'Metro/division adjustment' : ctx.src === 'state' ? 'State fallback' : 'US fallback'}, BRFSS {ctx.sourceYear ?? 'vintage unavailable'}, self-reported
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            Population {fmt(result.market.pop)} as of July 1, 2025. Counts: {dataYear}.
          </p>
        </div>
      )}
    </section>
  );
}
