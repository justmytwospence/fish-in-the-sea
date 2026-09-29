"use client";

import { useEffect, useState } from "react";
import type { RankResponse, RankRow, Sort } from "@/app/api/rank/route";
import { noun, type Query } from "@/lib/model";
import { fmt } from "@/lib/format";
import MetroChart from "./MetroChart";
import MetroMap from "./MetroMap";

const MODES: { key: Sort; label: string; by: string; blurb: string }[] = [
  {
    key: "raw",
    label: "Raw pool",
    by: "raw pool",
    blurb: "Most people through your sieve, ignoring competition. Big metros win, obviously.",
  },
  {
    key: "adjusted",
    label: "Adjusted pool",
    by: "adjusted pool",
    blurb: "Your pool after adjusting for competition: the number to compare if you're weighing a move.",
  },
  {
    key: "odds",
    label: "Best odds",
    by: "odds",
    blurb:
      "The adjustment alone (adjusted ÷ raw): where the competition for your pool is lightest, regardless of size.",
  },
];

function metric(sort: Sort, r: RankRow) {
  if (sort === "raw") return fmt(r.value);
  if (sort === "adjusted") return fmt(r.adjusted);
  return `×${(r.multiplier ?? 0).toFixed(2)}`;
}

export default function Leaderboard({ qs, query, onPick }: { qs: string; query: Query; onPick: (id: string) => void }) {
  const [data, setData] = useState<RankResponse | null>(null);
  const [sort, setSort] = useState<Sort>("adjusted");

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/rank?v=6&${qs}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [qs]);

  const mode = MODES.find((m) => m.key === sort)!;

  // Top 5, then your metro with five neighbors on either side (merged when
  // they overlap).
  const TOP = 5;
  const list: ({ rank: number; row: RankRow } | "gap")[] = [];
  if (data?.top?.[sort]) {
    const top = data.top[sort].slice(0, TOP).map((row, i) => ({ rank: i + 1, row }));
    const around = (data.around?.[sort] ?? []).filter((x) => x.rank > TOP);
    list.push(...top);
    if (around.length && around[0].rank > TOP + 1) list.push("gap");
    list.push(...around);
  }

  const pick = (id: string) => {
    onPick(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section aria-label="Other cities" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Elsewhere</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">Should you move?</h2>

      <div role="radiogroup" aria-label="Ranking" className="mt-6 inline-flex rounded-full border border-rule p-1">
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
      {data?.you?.rank && (
        <p className="mt-3">
          Your metro ranks <strong>#{data.you.rank[sort]}</strong> of {data.total} by {mode.by} (raw #{data.you.rank.raw},
          adjusted #{data.you.rank.adjusted}, odds #{data.you.rank.odds}).
        </p>
      )}

      {data?.all?.length ? (
        <MetroMap data={data} sort={sort} current={query.market} onPick={pick} />
      ) : (
        <div className="mt-6 aspect-[1.6] w-full rounded-lg bg-rule/20" />
      )}
      <p className="mt-2 max-w-xl text-xs text-muted">
        Every metro for your exact search. Your metro is outlined. Hover for numbers; click to go there.
      </p>

      {data?.all?.length ? (
        <MetroChart data={data} sort={sort} current={query.market} onPick={pick} />
      ) : (
        <div className="mt-6 h-[300px] rounded-lg bg-rule/20" />
      )}
      <p className="mt-2 max-w-xl text-xs text-muted">
        Each dot is a metro. Across: your raw pool. Up: the competition multiplier (above ×1, less competition
        than a balanced market; below, more). Adjusted pool is the two multiplied, so dots on the same dashed curve
        have the same adjusted pool. Highlighted: you, the five metros ranked on either side of you and the top five
        by {mode.by}. Click a dot to go there.
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
          const mine = r?.id === query.market;
          return (
            <li
              key={r?.id ?? i}
              className={`flex items-baseline justify-between gap-3 py-2 ${mine ? "-mx-2 rounded bg-accent-soft/60 px-2" : ""}`}
            >
              <span className="flex items-baseline gap-3">
                <span className="w-8 text-right text-sm tabular-nums text-muted">{item?.rank ?? ""}</span>
                {r ? (
                  <button
                    type="button"
                    onClick={() => pick(r.id)}
                    className={`text-left hover:underline ${mine ? "font-semibold text-accent" : ""}`}
                  >
                    {r.name}
                  </button>
                ) : (
                  <span className="h-4 w-48 rounded bg-rule/50" />
                )}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {r ? metric(sort, r) : ""}
                {r && sort !== "raw" && <span className="ml-2 text-xs text-muted">of {fmt(r.value)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Metro areas only, same search ({noun(query.seek.sex)} {query.seek.lo}–{query.seek.hi}, same filters, same
        you). Odds skip metros with fewer than 50 people in your pool.
      </p>
    </section>
  );
}
