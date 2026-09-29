"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compute, noun, type Global, type Query, type Result, type Shard } from "@/lib/model";
import { approx, shortCity } from "@/lib/format";
import { serializeQuery } from "@/lib/query";
import QueryForm from "./QueryForm";
import Funnel from "./Funnel";
import Verdict from "./Verdict";
import Competition from "./Competition";
import Leaderboard from "./Leaderboard";
import Method from "./Method";

const shardCache = new Map<string, Promise<Shard>>();
let globalPromise: Promise<Global> | undefined;

function fetchShard(id: string) {
  let p = shardCache.get(id);
  if (!p) {
    p = fetch(`/data/m/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`no data for ${id}`);
      return r.json();
    });
    shardCache.set(id, p);
  }
  return p;
}

export default function App({
  initialQuery,
  initialResult,
  dataYear,
}: {
  initialQuery: Query;
  initialResult: Result;
  dataYear: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState(initialResult);
  const [global, setGlobal] = useState<Global | null>(null);
  const reqId = useRef(0);
  const qs = useMemo(() => serializeQuery(query), [query]);

  useEffect(() => {
    (globalPromise ??= fetch("/data/global.json").then((r) => r.json())).then(setGlobal);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", `?${qs}`);
    if (!global) return;
    const id = ++reqId.current;
    fetchShard(query.market)
      .then((s) => {
        if (id === reqId.current) setResult(compute(s, global, query));
      })
      .catch(() => {});
  }, [query, qs, global]);

  useEffect(() => {
    document.title = `${approx(result.final.value)} ${noun(query.seek.sex)} ${query.seek.lo}–${query.seek.hi} in ${shortCity(result.market.name)} · The Denominator`;
  }, [result, query.seek]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          The Denominator
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
          How many people could you actually date?
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Start with everyone in your metro. Apply the Census, then a few survey-based facts of
          life. See who&apos;s left.
        </p>
      </header>

      <QueryForm query={query} marketName={result.market.name} onChange={setQuery} />
      <Funnel steps={result.steps} />
      <Verdict result={result} query={query} />
      <Competition result={result} query={query} />
      <Leaderboard qs={qs} query={query} onPick={(market) => setQuery({ ...query, market })} />
      <Method dataYear={dataYear} />
    </main>
  );
}
