"use client";

import { useEffect, useState } from "react";
import type { RankResponse, RankRow, Sort } from "@/app/api/rank/route";
import { noun, type Query } from "@/lib/model";
import { fmt } from "@/lib/format";

const TABS: { key: Sort; label: string; by: string; blurb: string }[] = [
  { key: "value", label: "Most people", by: "pool size", blurb: "Biggest pool. Big metros win, obviously." },
  { key: "density", label: "Densest", by: "density", blurb: "Pool per 100,000 residents: where a random encounter is likeliest." },
  { key: "ratio", label: "Least competition", by: "least competition", blurb: "Fewest competitors per available person." },
];

function metric(sort: Sort, r: RankRow) {
  if (sort === "value") return fmt(r.value);
  if (sort === "density") return `${fmt(r.density)} per 100k`;
  return isFinite(r.ratio) ? `${Math.round(r.ratio * 100)} per 100` : "n/a";
}

export default function Leaderboard({ qs, query, onPick }: { qs: string; query: Query; onPick: (id: string) => void }) {
  const [data, setData] = useState<RankResponse | null>(null);
  const [sort, setSort] = useState<Sort>("density");

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/rank?${qs}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setData)
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [qs]);

  const tab = TABS.find((t) => t.key === sort)!;
  const rows = data?.top[sort] ?? [];

  return (
    <section aria-label="Other cities" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Elsewhere</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">Should you move?</h2>
      {data?.you && (
        <p className="mt-3 text-muted">
          For this exact search, your area ranks{" "}
          <strong className="text-ink">#{data.you.rank[sort]}</strong> of {data.total} metros for {tab.by}.
        </p>
      )}

      <div role="tablist" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === sort}
            onClick={() => setSort(t.key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              t.key === sort ? "border-ink bg-ink text-paper" : "border-rule hover:border-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">{tab.blurb}</p>

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
            <span className="shrink-0 tabular-nums">{r ? metric(sort, r) : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Metro areas only, same search ({noun(query.seek.sex)} {query.seek.lo}–{query.seek.hi}, same filters and
        assumptions). &ldquo;Least competition&rdquo; skips metros with fewer than 100 available people.
      </p>
    </section>
  );
}
