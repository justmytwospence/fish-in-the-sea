"use client";

import type { Sex } from "@/lib/assumptions";
import type { Query } from "@/lib/model";
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
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
        <SexSelect label="Your sex" article value={query.me.sex} onChange={(sex) => set({ me: { ...query.me, sex } })} /> in{" "}
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
              ["looking", "Remove people who aren't looking"],
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
