"use client";

import { SOURCES } from "@/lib/assumptions";
import { incomeWeights, type You } from "@/lib/competition";
import { noun, type Query, type Result } from "@/lib/model";
import { fmt, pct } from "@/lib/format";

const EDU = ["No degree", "Bachelor's", "Graduate"];
const INC = ["Under $25k", "$25–60k", "$60–120k", "$120k+"];
const YESNO = ["No", "Yes"];

const inches = (h: number) => `${Math.floor(h / 12)}′${Math.round(h % 12)}″`;

function YouSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | undefined;
  options: { v: number; label: string }[];
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        className="rounded-md border border-rule bg-card px-2 py-1.5 text-ink"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : +e.target.value)}
      >
        <option value="">Typical</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const INCOME_MAX = 250;

// Income in $1,000s; untouched means "typical for your age".
function IncomeSlider({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const shown = value === undefined ? "Typical" : value >= INCOME_MAX ? `$${INCOME_MAX}k+` : `$${value}k`;
  return (
    <label className="col-span-2 flex flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between">
        <span className="text-muted">Income</span>
        <span className="flex items-baseline gap-2">
          <span className={`font-medium tabular-nums ${value === undefined ? "text-muted" : "text-ink"}`}>{shown}</span>
          {value !== undefined && (
            <button type="button" onClick={() => onChange(undefined)} className="text-xs text-muted underline hover:text-ink">
              reset
            </button>
          )}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={INCOME_MAX}
        step={5}
        value={value ?? 50}
        aria-valuetext={shown}
        onChange={(e) => onChange(+e.target.value)}
        className={`accent-[var(--accent)] ${value === undefined ? "opacity-50" : ""}`}
      />
      <span className="flex justify-between text-[11px] text-muted">
        <span>$0</span>
        <span>$60k</span>
        <span>$120k</span>
        <span>$250k+</span>
      </span>
    </label>
  );
}

// A row of dots on a 0-1 appeal scale, one per level, with yours ringed.
function Scale({ title, levels, values, you }: { title: string; levels: string[]; values: number[]; you?: number }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <div className="relative mt-2 h-6">
        <div className="absolute inset-x-0 top-1/2 h-px bg-rule" />
        {values.map((v, i) => (
          <span
            key={i}
            title={`${levels[i]}: ${Math.round(v * 100)}%`}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              you === i ? "bg-accent ring-4 ring-accent-soft" : "bg-census"
            }`}
            style={{ left: `${v * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
        {values
          .map((v, i) => ({ v, i }))
          .sort((a, b) => b.v - a.v)
          .map(({ v, i }) => (
            <li key={i} className={you === i ? "font-semibold text-accent" : ""}>
              {levels[i]} {Math.round(v * 100)}
            </li>
          ))}
      </ul>
    </div>
  );
}

function Curve({
  title,
  xs,
  ys,
  you,
  fmtX,
}: {
  title: string;
  xs: number[];
  ys: number[];
  you?: number;
  fmtX: (x: number) => string;
}) {
  const W = 320;
  const H = 90;
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const px = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const py = (y: number) => H - 4 - y * (H - 12);
  const d = xs.map((x, i) => `${i ? "L" : "M"}${px(x).toFixed(1)},${py(ys[i]).toFixed(1)}`).join("");
  const peak = xs[ys.indexOf(Math.max(...ys))];
  let yv: number | null = null;
  if (you !== undefined && you >= x0 && you <= x1) {
    const i = xs.findIndex((x) => x >= you);
    yv = ys[Math.max(0, i)];
  }
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-1 w-full" role="img" aria-label={`${title}, peaking at ${fmtX(peak)}`}>
        <path d={`${d}L${W},${H}L0,${H}Z`} className="fill-accent-soft" />
        <path d={d} className="fill-none stroke-accent" strokeWidth={2} />
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-rule" />
        {[0, 0.5, 1].map((f) => {
          const x = x0 + f * (x1 - x0);
          return (
            <text key={f} x={px(x)} y={H + 13} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} className="fill-muted text-[10px]">
              {fmtX(x)}
            </text>
          );
        })}
        {yv !== null && you !== undefined && (
          <g>
            <line x1={px(you)} x2={px(you)} y1={py(yv)} y2={H} className="stroke-ink" strokeDasharray="2 2" />
            <circle cx={px(you)} cy={py(yv)} r={4.5} className="fill-ink" />
            <text x={Math.min(W - 40, px(you) + 6)} y={Math.max(10, py(yv) - 6)} className="fill-ink text-[11px] font-semibold">
              you: {Math.round(yv * 100)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default function Competition({
  result,
  query,
  onYou,
}: {
  result: Result;
  query: Query;
  onYou: (you: You) => void;
}) {
  const c = result.competition;
  if (!c) return null;
  const them = noun(query.seek.sex);
  const us = noun(query.me.sex);
  const you = query.you;
  const set = (patch: Partial<You>) => onYou({ ...you, ...patch });
  const fs = c.fairShare;

  let verdict: string;
  if (fs < 0.3) verdict = "On paper, you're a long shot.";
  else if (fs < 0.8) verdict = "You're in the running. Barely.";
  else if (fs < 1.5) verdict = "Roughly a fair share.";
  else verdict = "The market is tilted your way.";

  const heights = Array.from({ length: 31 }, (_, i) => 56 + i);
  const oppositeSex = query.me.sex !== query.seek.sex;

  return (
    <section aria-label="Competition" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">The competition</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">{verdict}</h2>
      <p className="mt-3 max-w-xl text-muted">
        You&apos;re not the only one sifting. Here&apos;s what {them} like the ones in your pool actually go for, who
        else is in the running, and where you land.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_1.1fr]">
        <div className="rounded-xl border border-rule bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted">Your fair share</p>
          <p className="mt-1 font-display text-6xl tracking-tight">{fs >= 10 ? fmt(fs) : fs.toFixed(2)}</p>
          <p className="mt-2 text-sm text-muted">
            If each of the {fmt(c.targets)} {them} in your pool picked one of the {us} in the running, with odds in
            proportion to what {them} like them go for, this is how many would pick you.
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted">You, on their scale</dt>
              <dd className="font-display text-2xl">{Math.round(c.score * 100)}/100</dd>
            </div>
            <div>
              <dt className="text-muted">You out-rank</dt>
              <dd className="font-display text-2xl">{pct(c.percentile)}</dd>
              <dd className="text-xs text-muted">of the competition that matters</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="text-sm font-medium">About you</p>
          <p className="text-xs text-muted">Leave anything on &ldquo;Typical&rdquo; to use the typical single {noun(query.me.sex, false)} your age.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <YouSelect label="Education" value={you.edu} options={EDU.map((l, v) => ({ v, label: l }))} onChange={(edu) => set({ edu })} />
            <IncomeSlider value={you.income} onChange={(income) => set({ income })} />
            <YouSelect label="Kids at home" value={you.kids} options={YESNO.map((l, v) => ({ v, label: l }))} onChange={(kids) => set({ kids })} />
            <YouSelect label="Been married" value={you.prev} options={YESNO.map((l, v) => ({ v, label: l }))} onChange={(prev) => set({ prev })} />
            {oppositeSex && (
              <YouSelect
                label="Height"
                value={you.height}
                options={heights.map((h) => ({ v: h, label: inches(h) }))}
                onChange={(height) => set({ height })}
              />
            )}
          </div>
        </div>
      </div>

      <h3 className="mt-12 font-display text-2xl tracking-tight">What they go for</h3>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Appeal to {them} like yours, as a share of their favorite (100). Age, education, income and marriage history
        are revealed preferences: who people like them actually paired up with in the last few years, relative to
        who was single at the time. Kids and height come from published studies.
      </p>
      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Curve title="Age" xs={c.prefs.ages} ys={c.prefs.age} you={query.me.age} fmtX={(x) => String(Math.round(x))} />
        {c.prefs.heights && c.prefs.height && (
          <Curve title="Height" xs={c.prefs.heights} ys={c.prefs.height} you={you.height} fmtX={inches} />
        )}
        <div>
          <p className="text-sm font-medium">Education (mostly, like goes with like)</p>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-left font-normal">Their education</th>
                {EDU.map((e, j) => (
                  <th key={e} className={`py-1 text-right font-normal ${you.edu === j ? "font-semibold text-accent" : ""}`}>
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.prefs.eduRows.map((row, i) => (
                <tr key={i} className="border-t border-rule/60">
                  <td className="py-1.5">
                    {EDU[i]} <span className="text-muted">({pct(row.share)})</span>
                  </td>
                  {row.appeal.map((v, j) => (
                    <td key={j} className="py-1.5 text-right tabular-nums">
                      <span
                        className={`inline-block min-w-9 rounded px-1 ${you.edu === j ? "ring-1 ring-accent" : ""}`}
                        style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(v * 45)}%, transparent)` }}
                      >
                        {Math.round(v * 100)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Scale
          title="Income"
          levels={INC}
          values={c.prefs.inc}
          you={you.income === undefined ? undefined : incomeWeights(you.income).reduce((b, w, i, ws) => (w > ws[b] ? i : b), 0)}
        />
        <Scale title="Kids at home" levels={["No kids", "Has kids"]} values={c.prefs.kids} you={you.kids} />
        <Scale title="Marriage history" levels={["Never married", "Been married"]} values={c.prefs.prev} you={you.prev} />
      </div>

      <h3 className="mt-12 font-display text-2xl tracking-tight">Their sieve</h3>
      <p className="mt-2 max-w-xl text-sm text-muted">
        The same exercise from their side: {us} who are single, looking and into {them}, weighted by how well each
        matches what {them} like them go for. Units are &ldquo;ideal-equivalents&rdquo;: two people at half-appeal
        count as one ideal.
      </p>
      <ol className="mt-4 max-w-xl divide-y divide-rule/60 text-sm">
        {c.steps.map((s) => (
          <li key={s.key} className="flex justify-between py-2">
            <span>{s.label}</span>
            <span className="tabular-nums">{fmt(s.value)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 max-w-xl text-sm">
        So each {noun(query.seek.sex, false)} in your pool is weighing roughly{" "}
        <strong>{fmt(c.perTarget)}</strong> ideal-equivalent {us}. You count as {Math.round(c.score * 100)}/100 of one.
      </p>

      <details className="mt-6 max-w-xl text-sm text-muted">
        <summary className="cursor-pointer select-none hover:text-ink">How the competition model works</summary>
        <div className="mt-3 space-y-3">
          <p>
            For every couple formed in the last one to three years in the ACS microdata, the partner someone actually
            ended up with is compared against 15 random single people of the right sex from the same state, drawn in
            proportion to how common they are and how likely they are to be into the chooser&apos;s sex. A conditional
            logit on those choices (sampling alternatives is consistent per{" "}
            <a className="underline" href={SOURCES.mcfadden.url} target="_blank" rel="noreferrer">McFadden 1978</a>)
            estimates how much age gap, education pairing, income and marriage history shift who ends up with whom,
            net of who was available. This is the choice-model cousin of the matching models in{" "}
            <a className="underline" href={SOURCES.choo.url} target="_blank" rel="noreferrer">Choo &amp; Siow (2006)</a> and
            the assortative-mating work of{" "}
            <a className="underline" href={SOURCES.schwartzMare.url} target="_blank" rel="noreferrer">Schwartz &amp; Mare (2005)</a>.
          </p>
          <p>
            Kids at home can&apos;t be measured this way (pre-existing children are nearly invisible in new ACS
            households), so they use repartnering odds from{" "}
            <a className="underline" href={SOURCES.diNallo.url} target="_blank" rel="noreferrer">Di Nallo (2019)</a>. Height
            isn&apos;t in the Census at all; it uses first-contact preferences from{" "}
            <a className="underline" href={SOURCES.hitsch.url} target="_blank" rel="noreferrer">Hitsch, Hortaçsu &amp; Ariely (2010)</a>,{" "}
            checked against{" "}
            <a className="underline" href={SOURCES.stulp.url} target="_blank" rel="noreferrer">Stulp et al. (2013)</a>, with
            heights from{" "}
            <a className="underline" href={SOURCES.nhanes.url} target="_blank" rel="noreferrer">NHANES</a>.
          </p>
          <p>
            Caveats: income is measured after the couple formed (married men tend to earn more afterward, so income
            effects may be overstated); same-sex estimates rest on smaller samples; and none of this sees looks,
            humor, politics or whether you text back.
          </p>
        </div>
      </details>
    </section>
  );
}
