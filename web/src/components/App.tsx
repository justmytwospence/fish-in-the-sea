"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Choice } from "@/lib/competition";
import { compute, LOW_RECORDS, mergeContext, noun, type Global, type Query, type Result, type Shard } from "@/lib/model";
import { approx, shortCity } from "@/lib/format";
import { serializeQuery } from "@/lib/query";
import QueryForm from "./QueryForm";
import Sieve from "./Sieve";
import Receipts from "./Receipts";
import Verdict from "./Verdict";
import WhoIsLeft from "./WhoIsLeft";
import WhatIfs from "./WhatIfs";
import { whatIfs } from "@/lib/whatif";
import { overTime, type AgePoint } from "@/lib/overtime";
import OverTime from "./OverTime";
import Competition from "./Competition";
import Leaderboard from "./Leaderboard";
import Method from "./Method";

const shardCache = new Map<string, Promise<Shard>>();
let staticPromise: Promise<[Global, Choice]> | undefined;

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

function LocateLine({ located, onMarket }: { located: string | null; onMarket: (id: string) => void }) {
  const [state, setState] = useState<"idle" | "busy" | "failed" | "done">("idle");
  const [place, setPlace] = useState<string | null>(null);
  const locate = () => {
    if (!navigator.geolocation) return setState("failed");
    setState("busy");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        // Round to about a kilometer before it leaves the browser.
        const r = await fetch(`/api/locate?lat=${coords.latitude.toFixed(2)}&lon=${coords.longitude.toFixed(2)}`);
        if (!r.ok) return setState("failed");
        const hit = (await r.json()) as { market: string; place: string };
        setPlace(hit.place);
        onMarket(hit.market);
        setState("done");
      },
      () => setState("failed"),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };
  return (
    <p className="mt-3 text-xs text-muted">
      {state === "done" && place ? (
        <>Located you near {place}.</>
      ) : located ? (
        <>Guessed from your connection: {located}. </>
      ) : null}
      {state !== "done" && (
        <button type="button" onClick={locate} className="underline hover:text-ink" disabled={state === "busy"}>
          {state === "busy" ? "Locating…" : state === "failed" ? "Couldn't locate you; try again" : "Use my precise location"}
        </button>
      )}
    </p>
  );
}

export default function App({
  initialQuery,
  initialResult,
  dataYear,
  located,
}: {
  initialQuery: Query;
  initialResult: Result;
  dataYear: string;
  located: string | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState(initialResult);
  const [data, setData] = useState<[Global, Choice] | null>(null);
  const [loosen, setLoosen] = useState<ReturnType<typeof whatIfs> | null>(null);
  const [timeline, setTimeline] = useState<AgePoint[] | null>(null);
  const reqId = useRef(0);
  const qs = useMemo(() => serializeQuery(query), [query]);

  useEffect(() => {
    (staticPromise ??= Promise.all([
      Promise.all([
        fetch("/data/global.json").then((r) => r.json()),
        fetch("/data/context.json").then((r) => r.json()),
        fetch("/data/religion.json").then((r) => r.json()),
      ]).then(([g, c, r]) => mergeContext(g, c, r)),
      fetch("/data/choice.json").then((r) => r.json()),
    ])).then(setData);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", `?${qs}`);
    if (!data) return;
    const id = ++reqId.current;
    fetchShard(query.market)
      .then((s) => {
        if (id !== reqId.current) return;
        setResult(compute(s, data[0], query, data[1]));
        setLoosen(whatIfs(s, data[0], query, data[1]));
        setTimeline(overTime(s, data[0], query, data[1]));
      })
      .catch(() => {});
  }, [query, qs, data]);

  useEffect(() => {
    document.title = `${approx(result.final.value)} ${noun(query.seek.sex)} ${query.seek.lo}–${query.seek.hi} in ${shortCity(result.market.name)} · The Denominator`;
  }, [result, query.seek]);

  // Replay the sieve only when the funnel itself changes, not when you edit
  // your own attributes in the competition section.
  const sieveKey = useMemo(() => {
    const { you: _you, ...rest } = query;
    void _you;
    return JSON.stringify(rest);
  }, [query]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">The Denominator</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
          How many people could you actually date?
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          Pour everyone in your metro into the sieve. Shake out the Census, then a few survey-based facts of life. See
          who&apos;s left.
        </p>
      </header>

      <QueryForm query={query} marketName={result.market.name} onChange={setQuery} />
      <LocateLine located={located} onMarket={(market) => setQuery((q) => ({ ...q, market }))} />
      <Sieve key={sieveKey} steps={result.steps} thin={result.records < LOW_RECORDS} />
      <Receipts steps={result.steps} thin={result.records < LOW_RECORDS} records={result.records} />
      <Verdict result={result} query={query} />
      <WhoIsLeft result={result} query={query} dataYear={dataYear} />
      <Competition result={result} query={query} onYou={(you) => setQuery((q) => ({ ...q, you }))} />
      {loosen && loosen.options.length > 0 && (
        <WhatIfs base={loosen.base} options={loosen.options} onApply={(q) => setQuery(q)} />
      )}
      {timeline && <OverTime points={timeline} query={query} />}
      <Leaderboard qs={qs} query={query} onPick={(market) => setQuery((q) => ({ ...q, market }))} />
      <Method dataYear={dataYear} />
    </main>
  );
}
