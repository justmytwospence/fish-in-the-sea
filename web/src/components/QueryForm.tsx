"use client";

import { HEIGHT_MAX, HEIGHT_MIN, type Sex } from "@/lib/assumptions";
import { heightFilter, type Query } from "@/lib/model";
import { NPOL, PARTY_PLURAL, RACES, RELIGIONS } from "@/lib/types";

// Kids someday: rule out the ones set on kids or the ones set against them;
// the unsure are always kept.
const WANT_RULE_OUT: [number, string][] = [
  [0, "Want kids"],
  [2, "Don't want kids"],
];
import CityPicker from "./CityPicker";

const ages = Array.from({ length: 73 }, (_, i) => i + 18);

function AgeSelect({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <select className="field" aria-label={label} value={value} onChange={(e) => onChange(+e.target.value)}>
      {ages.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}

// Your own age is optional: without it the competition section treats you
// as a typical competitor and the over-time section waits for it.
function MyAgeSelect({ value, onChange }: { value: number | undefined; onChange: (n: number | undefined) => void }) {
  return (
    <select
      className="field"
      aria-label="Your age (optional)"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : +e.target.value)}
    >
      <option value="">age?</option>
      {ages.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}

// A filter row with a slider: label, the control, and its current value.
function SliderRow({
  label,
  shown,
  active,
  onReset,
  children,
}: {
  label: string;
  shown: string;
  active: boolean;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex w-full items-baseline gap-2 text-sm text-muted sm:w-40">
        {label}
        {active && (
          <button type="button" onClick={onReset} className="text-xs underline hover:text-ink">
            any
          </button>
        )}
      </span>
      <div className="min-w-0 flex-1 sm:max-w-xs">{children}</div>
      <span className={`shrink-0 text-sm tabular-nums sm:w-28 ${active ? "font-medium text-ink" : "text-muted"}`}>{shown}</span>
    </div>
  );
}

// Two thumbs over one rail; the span between them is the kept range.
function DualRange({
  min,
  max,
  lo,
  hi,
  label,
  format,
  onChange,
}: {
  min: number;
  max: number;
  lo: number;
  hi: number;
  label: string;
  format: (v: number) => string;
  onChange: (lo: number, hi: number) => void;
}) {
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="dual-range">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-rule" />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
        style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={lo}
        aria-label={`${label}: shortest`}
        aria-valuetext={format(lo)}
        onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={hi}
        aria-label={`${label}: tallest`}
        aria-valuetext={format(hi)}
        onChange={(e) => onChange(lo, Math.max(+e.target.value, lo))}
      />
    </div>
  );
}

function SexSelect({ value, onChange, label, article }: { value: Sex; onChange: (s: Sex) => void; label: string; article?: boolean }) {
  return (
    <select className="field" aria-label={label} value={value} onChange={(e) => onChange(+e.target.value as Sex)}>
      <option value={1}>{article ? "man" : "men"}</option>
      <option value={2}>{article ? "woman" : "women"}</option>
    </select>
  );
}

const ft = (h: number) => `${Math.floor(h / 12)}′${h % 12}″`;

function Chip({
  on,
  onClick,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-accent bg-accent text-paper" : "border-rule text-ink hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function QueryForm({
  query,
  marketName,
  onChange,
}: {
  query: Query;
  marketName: string;
  onChange: (q: Query) => void;
}) {
  const set = (patch: Partial<Query>) => onChange({ ...query, ...patch });
  const f = query.filters;
  const m = query.model;
  const hr = heightFilter(query);

  return (
    <section aria-label="Your search">
      <div className="font-display text-2xl leading-[1.7] sm:text-[1.7rem]">
        I&apos;m a <MyAgeSelect value={query.me.age} onChange={(age) => set({ me: { ...query.me, age } })} />
        {query.me.age !== undefined ? "-year-old " : " "}
        <SexSelect label="Your sex" article value={query.me.sex} onChange={(sex) => set({ me: { ...query.me, sex } })} />
        {" "}in{" "}
        <CityPicker marketName={marketName} onPick={(market) => set({ market })} /> looking for{" "}
        <SexSelect label="Who you're looking for" value={query.seek.sex} onChange={(sex) => set({ seek: { ...query.seek, sex } })} /> aged{" "}
        <AgeSelect label="Youngest" value={query.seek.lo} onChange={(lo) => set({ seek: { ...query.seek, lo, hi: Math.max(lo, query.seek.hi) } })} />
        {" to "}
        <AgeSelect label="Oldest" value={query.seek.hi} onChange={(hi) => set({ seek: { ...query.seek, hi, lo: Math.min(hi, query.seek.lo) } })} />.
      </div>

      <details className="mt-6">
      <summary className="cursor-pointer text-sm">Partner preferences (expand to edit)</summary>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Must be:</span>
        <Chip on={f.neverMarried} onClick={() => set({ filters: { ...f, neverMarried: !f.neverMarried } })}>
          never married
        </Chip>
        <Chip on={f.edu === 1} onClick={() => set({ filters: { ...f, edu: f.edu === 1 ? 0 : 1 } })}>
          college grad
        </Chip>
        <Chip on={f.edu === 2} onClick={() => set({ filters: { ...f, edu: f.edu === 2 ? 0 : 2 } })}>
          grad degree
        </Chip>
        <Chip on={f.noKids} onClick={() => set({ filters: { ...f, noKids: !f.noKids } })}>
          no kids at home
        </Chip>
        <Chip on={f.notWithParents} onClick={() => set({ filters: { ...f, notWithParents: !f.notWithParents } })}>
          not living with parents
        </Chip>
        <Chip on={f.nonSmoker} onClick={() => set({ filters: { ...f, nonSmoker: !f.nonSmoker } })}>
          non-smoker
        </Chip>
      </div>

      <SliderRow
        label="Earning at least"
        shown={f.incomeMin ? `$${f.incomeMin}k+` : "any"}
        active={f.incomeMin > 0}
        onReset={() => set({ filters: { ...f, incomeMin: 0 } })}
      >
        <input
          type="range"
          min={0}
          max={250}
          step={5}
          value={f.incomeMin}
          aria-label="Earning at least"
          aria-valuetext={f.incomeMin ? `$${f.incomeMin}k` : "any"}
          onChange={(e) => set({ filters: { ...f, incomeMin: +e.target.value } })}
          className="w-full accent-[var(--accent)]"
        />
      </SliderRow>

      <SliderRow
        label="Their height"
        shown={
          !hr
            ? "any"
            : hr.lo <= HEIGHT_MIN
              ? `up to ${ft(hr.hi)}`
              : hr.hi >= HEIGHT_MAX
                ? `${ft(hr.lo)} or taller`
                : `${ft(hr.lo)}–${ft(hr.hi)}`
        }
        active={hr !== null}
        onReset={() => set({ filters: { ...f, height: "any" } })}
      >
        <DualRange
          min={HEIGHT_MIN}
          max={HEIGHT_MAX}
          lo={hr?.lo ?? HEIGHT_MIN}
          hi={hr?.hi ?? HEIGHT_MAX}
          label="Their height"
          format={ft}
          onChange={(lo, hi) =>
            set({ filters: { ...f, height: lo <= HEIGHT_MIN && hi >= HEIGHT_MAX ? "any" : { lo, hi } } })
          }
        />
      </SliderRow>
      {query.you.height !== undefined && (
        <div className="mt-2 flex flex-wrap gap-2 sm:pl-[10.75rem]">
          <Chip
            on={hr?.lo === HEIGHT_MIN && hr.hi === query.you.height}
            onClick={() => set({ filters: { ...f, height: { lo: HEIGHT_MIN, hi: query.you.height! } } })}
          >
            no taller than me
          </Chip>
          <Chip
            on={hr?.hi === HEIGHT_MAX && hr.lo === query.you.height}
            onClick={() => set({ filters: { ...f, height: { lo: query.you.height!, hi: HEIGHT_MAX } } })}
          >
            at least as tall as me
          </Chip>
        </div>
      )}

      <SliderRow
        label="BMI under"
        shown={f.bmiMax ? `under ${f.bmiMax}` : "any"}
        active={f.bmiMax > 0}
        onReset={() => set({ filters: { ...f, bmiMax: 0 } })}
      >
        <input
          type="range"
          min={20}
          max={41}
          step={1}
          value={f.bmiMax || 41}
          aria-label="BMI under"
          aria-valuetext={f.bmiMax ? `under ${f.bmiMax}` : "any"}
          onChange={(e) => set({ filters: { ...f, bmiMax: +e.target.value > 40 ? 0 : +e.target.value } })}
          className="w-full accent-[var(--accent)]"
        />
      </SliderRow>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Race/ethnicity:</span>
        <Chip on={f.races.length === 0} onClick={() => set({ filters: { ...f, races: [] } })}>
          any
        </Chip>
        {RACES.map((label, r) => (
          <Chip
            key={label}
            on={f.races.includes(r)}
            onClick={() =>
              set({ filters: { ...f, races: f.races.includes(r) ? f.races.filter((x) => x !== r) : [...f.races, r] } })
            }
          >
            {label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Religion:</span>
        <Chip on={f.religions.length === 0} onClick={() => set({ filters: { ...f, religions: [] } })}>
          any
        </Chip>
        {RELIGIONS.map((label, r) => (
          <Chip
            key={label}
            on={f.religions.includes(r)}
            onClick={() =>
              set({
                filters: {
                  ...f,
                  religions: f.religions.includes(r) ? f.religions.filter((x) => x !== r) : [...f.religions, r],
                },
              })
            }
          >
            {label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Kids someday, rule out:</span>
        <Chip on={f.wantKids.length === 0} onClick={() => set({ filters: { ...f, wantKids: [] } })}>
          nobody
        </Chip>
        {WANT_RULE_OUT.map(([r, label]) => {
          const excluded = f.wantKids.length ? [0, 1, 2].filter((x) => !f.wantKids.includes(x)) : [];
          const on = excluded.includes(r);
          const next = on ? excluded.filter((x) => x !== r) : [...excluded, r];
          return (
            <Chip
              key={label}
              on={on}
              disabled={next.length > 1}
              onClick={() =>
                set({ filters: { ...f, wantKids: next.length ? [0, 1, 2].filter((x) => !next.includes(x)) : [] } })
              }
            >
              {label}
            </Chip>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Politics, rule out:</span>
        <Chip on={f.politics.length === 0} onClick={() => set({ filters: { ...f, politics: [] } })}>
          nobody
        </Chip>
        {PARTY_PLURAL.map((label, r) => {
          // Stored as the parties kept (empty = everyone); shown as dealbreakers.
          const excluded = f.politics.length ? [0, 1, 2].filter((x) => !f.politics.includes(x)) : [];
          const on = excluded.includes(r);
          const next = on ? excluded.filter((x) => x !== r) : [...excluded, r];
          return (
            <Chip
              key={label}
              on={on}
              disabled={next.length >= NPOL}
              onClick={() =>
                set({
                  filters: {
                    ...f,
                    politics: next.length ? [0, 1, 2].filter((x) => !next.includes(x)) : [],
                  },
                })
              }
            >
              {label}
            </Chip>
          );
        })}
      </div>


      </details>
      <details className="group mt-4 text-sm">
        <summary className="cursor-pointer select-none text-muted hover:text-ink">
          Adjust the assumptions
        </summary>
        <div className="mt-3 grid gap-3 rounded-lg border border-rule bg-card p-4 sm:grid-cols-2">
          {(
            [
              ["orientation", "Account for sexual orientation"],
              ["relationship", "Remove people seeing someone"],
              ["looking", "Remove people who say they aren\u2019t looking (one Pew question; rough)"],
              ["separated", "Count separated people as available"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={m[k]}
                onChange={() => set({ model: { ...m, [k]: !m[k] } })}
              />
              {label}
            </label>
          ))}
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span>
              Mutual spark:{" "}
              <strong>{m.spark !== null ? `${Math.round(m.spark * 100)}% of them` : "off"}</strong>{" "}
              <span className="text-muted">(Backus used 5%)</span>
            </span>
            <label><input type="checkbox" checked={m.spark !== null} onChange={() => set({ model: { ...m, spark: m.spark === null ? .05 : null } })} /> Enable spark scenario</label>
            <input
              type="range"
              aria-label="Mutual spark probability"
              disabled={m.spark === null}
              min={0}
              max={100}
              step={1}
              value={Math.round((m.spark ?? .05) * 100)}
              className="accent-[var(--accent)]"
              onChange={(e) => set({ model: { ...m, spark: +e.target.value / 100 } })}
            />
          </label>
        </div>
      </details>
    </section>
  );
}
