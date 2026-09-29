"use client";

import { useEffect, useMemo, useState } from "react";
import type { RankResponse, Sort } from "@/app/api/rank/route";
import { noun, type Query } from "@/lib/model";
import { fmt } from "@/lib/format";
import { statesOf } from "@/lib/states";
import MetroChart from "./MetroChart";
import MetroMap from "./MetroMap";

export type Row = RankResponse["all"][number];

const MODES: { key: Sort; label: string; by: string; blurb: string }[] = [
  { key: "raw", label: "Raw pool", by: "raw pool", blurb: "Most people through your sieve, ignoring competition. Big metros win, obviously." },
  {
    key: "adjusted",
    label: "Adjusted pool",
    by: "adjusted pool",
    blurb: "Your pool after adjusting for competition: the number to compare if you're weighing a move.",
  },
  {
    key: "crowd",
    label: "Least crowded",
    by: "least crowded",
    blurb: "Fewest competitors in the running per person in your pool. This is the market alone; it doesn't depend on you.",
  },
  {
    key: "odds",
    label: "Best odds",
    by: "odds",
    blurb: "The whole adjustment (adjusted ÷ raw): how uncrowded the market is combined with how you stack up there.",
  },
];


const value = (sort: Sort, r: Row) => (sort === "raw" ? r[2] : sort === "adjusted" ? r[3] : sort === "odds" ? r[4] : r[7]);

function metric(sort: Sort, r: Row) {
  if (sort === "raw") return fmt(r[2]);
  if (sort === "adjusted") return fmt(r[3]);
  if (sort === "odds") return `×${r[4].toFixed(2)}`;
  return r[7] > 0 ? `${r[7].toFixed(2)} per person` : "n/a";
}

// Rank rows by the chosen measure (best first); metros too small to have
// odds or crowding go last.
function rank(rows: Row[], sort: Sort) {
  return [...rows].sort((a, b) => {
    const va = value(sort, a);
    const vb = value(sort, b);
    if (sort === "crowd") return (va || Infinity) - (vb || Infinity);
    return vb - va;
  });
}

export default function Leaderboard({ qs, query, onPick }: { qs: string; query: Query; onPick: (id: string) => void }) {
  const [data, setData] = useState<RankResponse | null>(null);
  const [sort, setSort] = useState<Sort>("adjusted");
  const [states, setStates] = useState<string[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/rank?v=8&${qs}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [qs]);

  const all = useMemo(() => data?.all ?? [], [data]);
  const allStates = useMemo(() => [...new Set(all.flatMap((r) => statesOf(r[1])))].sort(), [all]);
  const rows = useMemo(
    () => (states.length ? all.filter((r) => statesOf(r[1]).some((s) => states.includes(s))) : all),
    [all, states],
  );
  const ranked = useMemo(() => rank(rows, sort), [rows, sort]);
  const mode = MODES.find((m) => m.key === sort)!;
  const mineIdx = ranked.findIndex((r) => r[0] === query.market);

  // Top 5, then your metro with five on either side (merged when they overlap).
  const TOP = 5;
  const list: ({ rank: number; row: Row } | "gap")[] = ranked.slice(0, TOP).map((row, i) => ({ rank: i + 1, row }));
  if (mineIdx >= 0) {
    const start = Math.max(TOP, mineIdx - 5);
    const around = ranked.slice(start, mineIdx + 6).map((row, k) => ({ rank: start + k + 1, row }));
    if (around.length && start > TOP) list.push("gap");
    list.push(...around);
  }
  const topIds = new Set(ranked.slice(0, TOP).map((r) => r[0]));
  const neighborIds = new Set(mineIdx >= 0 ? ranked.slice(Math.max(0, mineIdx - 5), mineIdx + 6).map((r) => r[0]) : []);

  const pick = (id: string) => {
    onPick(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section aria-label="Other cities" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Elsewhere</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">Should you move?</h2>

      <div role="radiogroup" aria-label="Ranking" className="mt-6 inline-flex flex-wrap rounded-full border border-rule p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="radio"
            aria-checked={m.key === sort}
            onClick={() => setSort(m.key)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors sm:px-4 ${
              m.key === sort ? "bg-ink text-paper" : "text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted">{mode.blurb}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">States:</span>
        {states.length === 0 && <span className="text-muted">all</span>}
        {states.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStates(states.filter((x) => x !== s))}
            className="rounded-full border border-accent bg-accent px-2.5 py-0.5 text-paper"
            aria-label={`Remove ${s}`}
          >
            {s} ×
          </button>
        ))}
        <select
          aria-label="Add a state"
          className="rounded-md border border-rule bg-card px-2 py-1 text-ink"
          value=""
          onChange={(e) => e.target.value && setStates([...states, e.target.value])}
        >
          <option value="">Add a state…</option>
          {allStates
            .filter((s) => !states.includes(s))
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </select>
        {states.length > 0 && (
          <button type="button" onClick={() => setStates([])} className="text-muted underline hover:text-ink">
            clear
          </button>
        )}
      </div>

      {data && (
        <p className="mt-3">
          {mineIdx >= 0 ? (
            <>
              Your metro ranks <strong>#{mineIdx + 1}</strong> of {ranked.length}
              {states.length ? ` in ${states.join(", ")}` : ""} by {mode.by}.
            </>
          ) : (
            <>
              {ranked.length} metros{states.length ? ` in ${states.join(", ")}` : ""}. Yours isn&apos;t among them.
            </>
          )}
        </p>
      )}

      {all.length ? (
        <MetroMap rows={all} states={states} sort={sort} current={query.market} onPick={pick} />
      ) : (
        <div className="mt-6 aspect-[1.6] w-full rounded-lg bg-rule/20" />
      )}
      <p className="mt-2 max-w-xl text-xs text-muted">
        Every metro for your exact search. Your metro is outlined. Hover for numbers; click to go there.
      </p>

      {rows.length ? (
        <MetroChart rows={rows} topIds={topIds} neighborIds={neighborIds} current={query.market} onPick={pick} />
      ) : null}
      <p className="mt-2 max-w-xl text-xs text-muted">
        Each dot is a metro. Across: your raw pool. Up: the competition multiplier (above ×1, less competition than a
        balanced market; below, more). Adjusted pool is the two multiplied, so dots on the same dashed curve have the
        same adjusted pool. Highlighted: you, the five metros ranked on either side of you and the top five by{" "}
        {mode.by}. Click a dot to go there.
      </p>

      <ol className={`mt-6 divide-y divide-rule transition-opacity ${data ? "" : "opacity-40"}`}>
        {(list.length ? list : Array.from({ length: 10 }, () => null)).map((item, i) => {
          if (item === "gap")
            return (
              <li key="gap" aria-hidden className="py-1 pl-11 text-muted">
                ⋯
              </li>
            );
          const r = item?.row ?? null;
          const mine = r?.[0] === query.market;
          return (
            <li
              key={r?.[0] ?? i}
              className={`flex items-baseline justify-between gap-3 py-2 ${mine ? "-mx-2 rounded bg-accent-soft/60 px-2" : ""}`}
            >
              <span className="flex items-baseline gap-3">
                <span className="w-8 text-right text-sm tabular-nums text-muted">{item?.rank ?? ""}</span>
                {r ? (
                  <button
                    type="button"
                    onClick={() => pick(r[0])}
                    className={`text-left hover:underline ${mine ? "font-semibold text-accent" : ""}`}
                  >
                    {r[1]}
                  </button>
                ) : (
                  <span className="h-4 w-48 rounded bg-rule/50" />
                )}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {r ? metric(sort, r) : ""}
                {r && sort !== "raw" && <span className="ml-2 text-xs text-muted">of {fmt(r[2])}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Metro areas only, same search ({noun(query.seek.sex)} {query.seek.lo}–{query.seek.hi}, same filters, same
        you). Odds and crowding skip metros with fewer than 50 people in your pool.
      </p>
    </section>
  );
}
