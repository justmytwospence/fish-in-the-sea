"use client";

import type { Sex } from "@/lib/assumptions";
import { heightDefault, type Query } from "@/lib/model";
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

function SexSelect({ value, onChange, label, article }: { value: Sex; onChange: (s: Sex) => void; label: string; article?: boolean }) {
  return (
    <select className="field" aria-label={label} value={value} onChange={(e) => onChange(+e.target.value as Sex)}>
      <option value={1}>{article ? "man" : "men"}</option>
      <option value={2}>{article ? "woman" : "women"}</option>
    </select>
  );
}

const heights = Array.from({ length: 31 }, (_, i) => i + 56); // 4'8" to 7'2"
const ft = (h: number) => `${Math.floor(h / 12)}′${h % 12}″`;

function HeightSelect({ value, onChange }: { value: number | undefined; onChange: (h: number | undefined) => void }) {
  return (
    <select
      className={`field ${value === undefined ? "opacity-60" : ""}`}
      aria-label="Your height (optional)"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : +e.target.value)}
    >
      <option value="">height?</option>
      {heights.map((h) => (
        <option key={h} value={h}>
          {ft(h)}
        </option>
      ))}
    </select>
  );
}

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

  return (
    <section aria-label="Your search">
      <p className="font-display text-2xl leading-[1.7] sm:text-[1.7rem]">
        I&apos;m a <AgeSelect label="Your age" value={query.me.age} onChange={(age) => set({ me: { ...query.me, age } })} />
        -year-old{" "}
        <SexSelect label="Your sex" article value={query.me.sex} onChange={(sex) => set({ me: { ...query.me, sex } })} />
        {query.you.height !== undefined ? ", " : " "}
        <HeightSelect value={query.you.height} onChange={(height) => set({ you: { ...query.you, height } })} />
        {query.you.height !== undefined ? " tall," : ""} in{" "}
        <CityPicker marketName={marketName} onPick={(market) => set({ market })} /> looking for{" "}
        <SexSelect label="Who you're looking for" value={query.seek.sex} onChange={(sex) => set({ seek: { ...query.seek, sex } })} /> aged{" "}
        <AgeSelect label="Youngest" value={query.seek.lo} onChange={(lo) => set({ seek: { ...query.seek, lo, hi: Math.max(lo, query.seek.hi) } })} />
        {" to "}
        <AgeSelect label="Oldest" value={query.seek.hi} onChange={(hi) => set({ seek: { ...query.seek, hi, lo: Math.min(hi, query.seek.lo) } })} />.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Earning at least:</span>
        {(["any", "$25k", "$60k", "$120k"] as const).map((label, i) => (
          <Chip
            key={label}
            on={f.incomeMin === i}
            onClick={() => set({ filters: { ...f, incomeMin: (f.incomeMin === i ? 0 : i) as 0 | 1 | 2 | 3 } })}
          >
            {label}
          </Chip>
        ))}
      </div>

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">BMI:</span>
        {(
          [
            [0, "any"],
            [30, "under 30"],
            [25, "under 25"],
          ] as const
        ).map(([v, label]) => (
          <Chip key={v} on={f.bmiMax === v} onClick={() => set({ filters: { ...f, bmiMax: f.bmiMax === v ? 0 : v } })}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted">Their height:</span>
        {query.you.height === undefined ? (
          <span className="text-sm text-muted">pick your height above to filter by it</span>
        ) : (
          (
            [
              ["le", `no taller than ${ft(query.you.height)}`],
              ["ge", `at least ${ft(query.you.height)}`],
              ["any", "doesn't matter"],
            ] as const
          ).map(([dir, label]) => (
            <Chip
              key={dir}
              on={(f.height ?? heightDefault(query)) === dir}
              onClick={() => set({ filters: { ...f, height: dir === heightDefault(query) ? undefined : dir } })}
            >
              {label}
            </Chip>
          ))
        )}
      </div>

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
              <strong>{m.spark > 0 ? `${Math.round(m.spark * 100)}% of them` : "off"}</strong>{" "}
              <span className="text-muted">(Backus used 5%)</span>
            </span>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={Math.round(m.spark * 100)}
              className="accent-[var(--accent)]"
              onChange={(e) => set({ model: { ...m, spark: +e.target.value / 100 } })}
            />
          </label>
        </div>
      </details>
    </section>
  );
}
