"use client";

import { SOURCES } from "@/lib/assumptions";
import { incomeWeights, type You } from "@/lib/competition";
import { noun, type Query, type Result } from "@/lib/model";
import { approx, fmt, pct } from "@/lib/format";
import { PARTIES, RACES, RELIGIONS } from "@/lib/types";

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

// Chooser group x candidate group appeal (100 = their favorite), your column ringed.
function PairTable({
  title,
  labels,
  rows,
  you,
  note,
}: {
  title: string;
  labels: string[];
  rows: { share: number; appeal: number[] }[];
  you?: number;
  note: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <table className="mt-2 w-full text-[11px]">
        <thead>
          <tr className="text-muted">
            <th className="py-1 text-left font-normal">Theirs</th>
            {labels.map((e, j) => (
              <th key={e} className={`py-1 text-right font-normal ${you === j ? "font-semibold text-accent" : ""}`}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-rule/60">
              <td className="py-1.5">
                {labels[i]} <span className="text-muted">({pct(row.share)})</span>
              </td>
              {row.appeal.map((v, j) => (
                <td key={j} className="py-1.5 text-right tabular-nums">
                  <span
                    className={`inline-block min-w-9 rounded px-1 ${you === j ? "ring-1 ring-ink" : ""}`}
                    style={{ background: pairColor(v) }}
                    title={`${v.toFixed(2)}× as likely as a random pick`}
                  >
                    {fmtTimes(v)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
    </div>
  );
}

// Pairing relative to chance: warm above 1, cool below, stronger with distance.
function pairColor(v: number) {
  const s = Math.min(1, Math.abs(Math.log2(Math.max(v, 1e-3))) / 3);
  const token = v >= 1 ? "--warm" : "--cool";
  return `color-mix(in srgb, var(${token}) ${Math.round(s * 55)}%, transparent)`;
}

const fmtTimes = (v: number) => (v >= 10 ? `×${Math.round(v)}` : v >= 0.095 ? `×${v.toFixed(v >= 1 ? 1 : 2)}` : "<×0.1");

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
  const one = noun(query.seek.sex, false);
  const mult = c.multiplier;
  const x2c = (v: number) => (v >= 10 ? fmt(v) : v.toFixed(2));

  // Two separate questions: is the market itself crowded (competitors per
  // person, nothing to do with you), and how do you compare with a typical
  // serious competitor? The adjusted pool combines them.
  const market = c.ratio < 0.9 ? "open" : c.ratio <= 1.1 ? "even" : "crowded";
  const standing = c.relative > 1.1 ? "strong" : c.relative >= 0.9 ? "typical" : "weak";
  const VERDICTS: Record<string, string> = {
    "open-strong": "The market tilts your way, and you're a strong match.",
    "open-typical": "The market genuinely tilts your way.",
    "open-weak": "The market tilts your way, which helps: on paper, you're not their type.",
    "even-strong": "A fair market, and you stand out in it.",
    "even-typical": "About a fair fight.",
    "even-weak": "A fair market, but you're outmatched on paper.",
    "crowded-strong":
      mult >= 1 ? "A crowded market, but you out-compete it." : "A crowded market. You're above average, just not by enough.",
    "crowded-typical": "You're outnumbered.",
    "crowded-weak": mult < 0.5 ? "On paper, you're a long shot." : "Crowded, and you're not their type on paper.",
  };
  const verdict = VERDICTS[`${market}-${standing}`];
  const marketText = {
    open: `fewer ${us} in the running than ${them} (${x2c(c.ratio)} per ${one})`,
    even: `about one of ${us} in the running per ${one} (${x2c(c.ratio)})`,
    crowded: `${x2c(c.ratio)} ${us} in the running per ${one}`,
  }[market];
  const standingText = {
    strong: `${x2c(c.relative)}× a typical competitor's appeal`,
    typical: `about as appealing as a typical competitor (${x2c(c.relative)}×)`,
    weak: `${x2c(c.relative)}× a typical competitor's appeal`,
  }[standing];

  const heights = Array.from({ length: 31 }, (_, i) => 56 + i);
  const oppositeSex = query.me.sex !== query.seek.sex;
  const x2 = (v: number) => (v >= 10 ? fmt(v) : v.toFixed(2));

  return (
    <section aria-label="Competition" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">The competition</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">{verdict}</h2>
      <dl className="mt-4 grid max-w-2xl gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-rule bg-card p-3">
          <dt className="text-xs uppercase tracking-widest text-muted">
            The market:{" "}
            <span className={market === "open" ? "text-cool" : market === "crowded" ? "text-accent" : "text-ink"}>
              {market === "open" ? "tilted your way" : market === "even" ? "balanced" : "crowded"}
            </span>
          </dt>
          <dd className="mt-1">{marketText}. This part has nothing to do with you.</dd>
        </div>
        <div className="rounded-lg border border-rule bg-card p-3">
          <dt className="text-xs uppercase tracking-widest text-muted">
            You:{" "}
            <span className={standing === "strong" ? "text-cool" : standing === "weak" ? "text-accent" : "text-ink"}>
              {standing === "strong" ? "a strong match" : standing === "typical" ? "typical" : "a weaker match"}
            </span>
          </dt>
          <dd className="mt-1">{standingText}, based on what they go for.</dd>
        </div>
      </dl>
      <p className="mt-3 max-w-xl text-muted">
        A headcount pretends you&apos;re the only one looking. You&apos;re not. Here&apos;s your pool again, adjusted
        for how many other {us} are after the same {them} and how you stack up against them.
      </p>

      <div className="mt-8 rounded-xl border border-rule bg-card p-5">
        <p className="text-xs uppercase tracking-widest text-muted">Your pool, adjusted for competition</p>
        <p className="mt-1 font-display text-6xl tracking-tight">≈{approx(c.adjusted)}</p>
        <p className="mt-1 text-sm text-muted">
          {them}, or ×{mult.toFixed(2)} your headcount of {fmt(c.targets)}
        </p>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-x-2 gap-y-1 text-center sm:gap-x-4">
          <div>
            <p className="font-display text-2xl tabular-nums sm:text-3xl">{fmt(c.targets)}</p>
            <p className="text-xs text-muted">{them} in your pool</p>
          </div>
          <p className="pt-1 font-display text-2xl text-muted">÷</p>
          <div>
            <p className="font-display text-2xl tabular-nums sm:text-3xl">{x2(c.ratio)}</p>
            <p className="text-xs text-muted">
              {us} in the running per {one}
            </p>
          </div>
          <p className="pt-1 font-display text-2xl text-muted">×</p>
          <div>
            <p className="font-display text-2xl tabular-nums sm:text-3xl">{x2(c.relative)}</p>
            <p className="text-xs text-muted">you vs. a typical one of them</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 text-sm text-muted sm:grid-cols-3">
          <p>
            <strong className="text-ink">In the running:</strong> about {fmt(c.inRunning)} {us} are single, looking and
            into {them}, counted by how much {them} like yours go for them. A thousand long shots count for less than
            a hundred strong contenders.
          </p>
          <p>
            <strong className="text-ink">You vs. them:</strong> your appeal to your pool, relative to a typical serious
            competitor, from what {them} like yours actually go for (below). You out-rank {pct(c.percentile)} of the
            competition that matters.
          </p>
          <p>
            <strong className="text-ink">The benchmark:</strong> with exactly one serious competitor per {one} and you
            exactly typical, the adjusted pool equals the headcount. More competition shrinks it; being a better match
            than the typical competitor grows it back.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm font-medium">About you</p>
        <p className="text-xs text-muted">Leave anything on &ldquo;Typical&rdquo; to use the typical single {noun(query.me.sex, false)} your age
          {query.me.age === undefined ? " (with no age given at the top, a typical competitor in the running)" : ""}.</p>
        <div className="mt-3 grid max-w-xl grid-cols-2 gap-3">
          <YouSelect label="Education" value={you.edu} options={EDU.map((l, v) => ({ v, label: l }))} onChange={(edu) => set({ edu })} />
          <IncomeSlider value={you.income} onChange={(income) => set({ income })} />
          <YouSelect label="Kids at home" value={you.kids} options={YESNO.map((l, v) => ({ v, label: l }))} onChange={(kids) => set({ kids })} />
          <YouSelect label="Been married" value={you.prev} options={YESNO.map((l, v) => ({ v, label: l }))} onChange={(prev) => set({ prev })} />
          <YouSelect
            label="Politics"
            value={you.politics}
            options={PARTIES.map((l, v) => ({ v, label: l }))}
            onChange={(politics) => set({ politics })}
          />
          <YouSelect
            label="Religion"
            value={you.religion}
            options={RELIGIONS.map((l, v) => ({ v, label: l }))}
            onChange={(religion) => set({ religion })}
          />
          <YouSelect
            label="Race/ethnicity"
            value={you.race}
            options={RACES.map((l, v) => ({ v, label: l }))}
            onChange={(race) => set({ race })}
          />
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

      <h3 className="mt-12 font-display text-2xl tracking-tight">What they go for</h3>
      <p className="mt-2 max-w-xl text-sm text-muted">
        The curves and dots show appeal to {them} like yours as a share of their favorite (100). The tables show
        who ends up with whom: how much more (red) or less (blue) likely than a random pick from the {us} available
        here, so ×1 is pure chance. Age, education, income, marriage history and race are revealed preferences from
        couples formed in the last few years relative to who was single at the time; religion and politics come from
        couples in national surveys; kids and height from published studies.
      </p>
      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <Curve title="Age" xs={c.prefs.ages} ys={c.prefs.age} you={query.me.age} fmtX={(x) => String(Math.round(x))} />
        {c.prefs.heights && c.prefs.height && (
          <Curve title="Height" xs={c.prefs.heights} ys={c.prefs.height} you={you.height} fmtX={inches} />
        )}
        <PairTable
          title="Education"
          labels={["No degree", "Bachelor's", "Graduate"]}
          rows={c.prefs.eduRows}
          you={you.edu}
          note="From couples formed in the last few years in the Census microdata."
        />
        {c.prefs.politicsRows && (
          <PairTable
            title="Politics (who ends up with whom)"
            labels={["Dem.", "Ind.", "Rep."]}
            rows={c.prefs.politicsRows}
            you={you.politics}
            note="Party of both partners in Stanford's How Couples Meet and Stay Together 2017."
          />
        )}
        {c.prefs.religionRows && (
          <PairTable
            title="Religion (who ends up with whom)"
            labels={RELIGIONS.map((r) => r.replace("Latter-day Saint", "LDS").replace("Other religion", "Other").replace("Not religious", "None"))}
            rows={c.prefs.religionRows}
            you={you.religion}
            note="From married couples under 45 in the General Social Survey."
          />
        )}
        {c.prefs.raceRows && (
          <PairTable
            title="Race/ethnicity (who ends up with whom)"
            labels={RACES.map((e) => e.split("/")[0])}
            rows={c.prefs.raceRows}
            you={you.race}
            note="From couples formed in the last few years, relative to who was single at the time."
          />
        )}
        <Scale
          title="Income"
          levels={INC}
          values={c.prefs.inc}
          you={you.income === undefined ? undefined : incomeWeights(you.income).reduce((b, w, i, ws) => (w > ws[b] ? i : b), 0)}
        />
        <Scale title="Kids at home" levels={["No kids", "Has kids"]} values={c.prefs.kids} you={you.kids} />
        <Scale title="Marriage history" levels={["Never married", "Been married"]} values={c.prefs.prev} you={you.prev} />
      </div>

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
