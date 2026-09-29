"use client";

import { useEffect, useState } from "react";
import type { RankResponse, RankRow, Sort } from "@/app/api/rank/route";
import { noun, type Query } from "@/lib/model";
import { fmt } from "@/lib/format";

const MODES: { key: Sort; label: string; blurb: string; by: string }[] = [
  {
    key: "raw",
    label: "Raw numbers",
    by: "pool size",
    blurb: "Most people who make it through your sieve. Big metros win, obviously.",
  },
  {
    key: "fair",
    label: "After competition",
    by: "fair share",
    blurb:
      "Your fair share: how many of them would pick you, given everyone else in the running and what they go for. Size mostly cancels out, so this is about the balance of the market.",
  },
];

const metric = (sort: Sort, r: RankRow) => (sort === "raw" ? fmt(r.value) : (r.fairShare ?? 0).toFixed(2));

export default function Leaderboard({ qs, query, onPick }: { qs: string; query: Query; onPick: (id: string) => void }) {
  const [data, setData] = useState<RankResponse | null>(null);
  const [sort, setSort] = useState<Sort>("fair");

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/rank?v=2&${qs}`, { signal: ctrl.signal })
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
  const rows = data?.top[sort] ?? [];

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
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              m.key === sort ? "bg-ink text-paper" : "text-muted hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-xl text-sm text-muted">{mode.blurb}</p>
      {data?.you && (
        <p className="mt-3">
          Your metro ranks <strong>#{data.you.rank[sort]}</strong> of {data.total} by {mode.by}
          {sort === "fair" ? (
            <> ({(data.you.fairShare ?? 0).toFixed(2)}; by raw numbers it&apos;s #{data.you.rank.raw}).</>
          ) : (
            <> ({fmt(data.you.value)}; after competition it&apos;s #{data.you.rank.fair}).</>
          )}
        </p>
      )}

      <ol className={`mt-4 divide-y divide-rule transition-opacity ${data ? "" : "opacity-40"}`}>
        {(rows.length ? rows : Array.from({ length: 10 }, () => null)).map((r, i) => (
          <li key={r?.id ?? i} className="flex items-baseline justify-between gap-3 py-2">
            <span className="flex items-baseline gap-3">
              <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 1}</span>
              {r ? (
                <button
                  type="button"
                  onClick={() => {
                    onPick(r.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`text-left hover:underline ${r.id === query.market ? "font-semibold text-accent" : ""}`}
                >
                  {r.name}
                </button>
              ) : (
                <span className="h-4 w-48 rounded bg-rule/50" />
              )}
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {r ? metric(sort, r) : ""}
              {r && sort === "fair" && <span className="ml-2 text-xs text-muted">{fmt(r.value)} in pool</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Metro areas only, same search ({noun(query.seek.sex)} {query.seek.lo}–{query.seek.hi}, same filters, same you).
        Fair share skips metros with fewer than 50 people in your pool.
      </p>
    </section>
  );
}
