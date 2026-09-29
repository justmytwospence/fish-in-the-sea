"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PARTS, type RankResponse, type Sort } from "@/lib/rank";
import { SOURCES } from "@/lib/assumptions";
import { noun, type Query } from "@/lib/model";
import { fmt } from "@/lib/format";
import { loadPlaceIndex, searchPlaces, type Hit, type PlaceIndex } from "@/lib/place-search";
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

// Preset sets of places, each from a published definition.
const has = (t: string) => (r: Row) => r[8].includes(t);
const SETS: { key: string; label: string; noun: string; test: (r: Row) => boolean; blurb: React.ReactNode }[] = [
  {
    key: "mountain",
    label: "Mountain towns",
    noun: "mountain towns",
    test: has("mountain"),
    blurb: (
      <>
        Places under 500,000 where most townspeople live in mountain terrain by the UNEP-WCMC definition
        (elevation, slope and relief within 7 km): <Src s={SOURCES.mountains} />, <Src s={SOURCES.terrainTiles} />.
      </>
    ),
  },
  {
    key: "ski",
    label: "Mountain resorts",
    noun: "mountain resort towns",
    test: (r) => r[8].includes("mountain") && r[8].includes("resort"),
    blurb: (
      <>
        Mountain towns that live on recreation (recreation-dependent in the <Src s={SOURCES.ersTypology} />): ski
        and outdoor towns.
      </>
    ),
  },
  {
    key: "resort",
    label: "Resort & vacation",
    noun: "resort areas",
    test: has("resort"),
    blurb: (
      <>
        Recreation-dependent in the <Src s={SOURCES.ersTypology} />: jobs, earnings and seasonal homes tied to
        recreation and tourism. Beach and lake towns as well as mountains.
      </>
    ),
  },
  {
    key: "college",
    label: "College towns",
    noun: "college towns",
    test: has("college"),
    blurb: <>College and graduate students make up 15% or more of residents (US: about 6%), from the ACS.</>,
  },
  {
    key: "retire",
    label: "Retirement havens",
    noun: "retirement destinations",
    test: has("retire"),
    blurb: (
      <>
        Retirement destinations in the <Src s={SOURCES.ersTypology} />: older residents growing fast through people
        moving in. Know your competition.
      </>
    ),
  },
  { key: "big", label: "Big cities", noun: "big cities", test: has("big"), blurb: <>Metro areas of a million or more.</> },
  {
    key: "small",
    label: "Small towns & rural",
    noun: "small-town areas",
    test: has("small"),
    blurb: <>Micropolitan areas and counties outside any metro or micro area.</>,
  },
];

function Src({ s }: { s: { label: string; url: string } }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
      {s.label}
    </a>
  );
}

const value = (sort: Sort, r: Row) => (sort === "raw" ? r[2] : sort === "adjusted" ? r[3] : sort === "odds" ? r[4] : r[7]);

function metric(sort: Sort, r: Row) {
  if (sort === "raw") return fmt(r[2]);
  if (sort === "adjusted") return fmt(r[3]);
  if (sort === "odds") return r[4] > 0 ? `×${r[4].toFixed(2)}` : "n/a";
  return r[7] > 0 ? `${r[7].toFixed(2)} per person` : "n/a";
}

// Rank rows by the chosen measure (best first); places too small to have
// odds or crowding go last.
function rank(rows: Row[], sort: Sort) {
  return [...rows].sort((a, b) => {
    const va = value(sort, a);
    const vb = value(sort, b);
    if (sort === "crowd") return (va || Infinity) - (vb || Infinity);
    return vb - va;
  });
}

interface Pin {
  market: string;
  label: string; // the town searched for
}

const STORE = "fish-in-the-sea:elsewhere";
const MAX_PINS = 6;
const TOP = 5;

function loadPrefs(): { sort?: Sort; set?: string | null; pins?: Pin[] } {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

export default function Leaderboard({ qs, query, onPick }: { qs: string; query: Query; onPick: (id: string) => void }) {
  const [data, setData] = useState<{ qs: string; all: Row[] } | null>(null);
  const [sort, setSort] = useState<Sort>("adjusted");
  const [states, setStates] = useState<string[]>([]);
  const [set, setSet] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const restored = useRef(false);

  // Restore the viewer's last ranking, set and pins (after hydration).
  useEffect(() => {
    const p = loadPrefs();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p.sort && MODES.some((m) => m.key === p.sort)) setSort(p.sort);
    if (p.set && SETS.some((s) => s.key === p.set)) setSet(p.set);
    if (Array.isArray(p.pins)) setPins(p.pins.slice(0, MAX_PINS));
    /* eslint-enable react-hooks/set-state-in-effect */
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ sort, set, pins }));
    } catch {}
  }, [sort, set, pins]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      Promise.all(
        Array.from({ length: PARTS }, (_, part) =>
          fetch(`/api/rank?v=9&part=${part}&${qs}`, { signal: ctrl.signal }).then((r) => r.json() as Promise<RankResponse>),
        ),
      )
        .then((parts) => setData({ qs, all: parts.flatMap((p) => p.all) }))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [qs]);

  const loading = !data || data.qs !== qs;
  const all = useMemo(() => data?.all ?? [], [data]);
  const allStates = useMemo(() => [...new Set(all.flatMap((r) => statesOf(r[1])))].sort(), [all]);
  const preset = SETS.find((s) => s.key === set) ?? null;
  const inView = useMemo(() => {
    const st = (r: Row) => !states.length || statesOf(r[1]).some((s) => states.includes(s));
    return (r: Row) => st(r) && (!preset || preset.test(r));
  }, [states, preset]);
  const rows = useMemo(() => all.filter(inView), [all, inView]);
  const ranked = useMemo(() => rank(rows, sort), [rows, sort]);
  const rankOf = useMemo(() => new Map(ranked.map((r, i) => [r[0], i])), [ranked]);
  const byId = useMemo(() => new Map(all.map((r) => [r[0], r])), [all]);
  const mode = MODES.find((m) => m.key === sort)!;
  const mineIdx = rankOf.get(query.market) ?? -1;
  const pinIds = new Set(pins.map((p) => p.market));

  // Top five, then your place and each pinned place with its neighbors, in
  // rank order with gaps between runs.
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(TOP, ranked.length); i++) keep.add(i);
  const around = (i: number, k: number) => {
    for (let j = Math.max(0, i - k); j <= Math.min(ranked.length - 1, i + k); j++) keep.add(j);
  };
  if (mineIdx >= 0) around(mineIdx, pins.length ? 2 : 5);
  for (const p of pins) {
    const i = rankOf.get(p.market);
    if (i !== undefined) around(i, 2);
  }
  const list: ({ rank: number; row: Row } | "gap")[] = [];
  let prev = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (prev >= 0 && i > prev + 1) list.push("gap");
    list.push({ rank: i + 1, row: ranked[i] });
    prev = i;
  }
  const topIds = new Set(ranked.slice(0, TOP).map((r) => r[0]));
  const neighborIds = new Set(mineIdx >= 0 ? ranked.slice(Math.max(0, mineIdx - 5), mineIdx + 6).map((r) => r[0]) : []);

  const pick = (id: string) => {
    onPick(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addPin = (h: Hit) => {
    setPins((ps) => [...ps.filter((p) => p.market !== h.market), { market: h.market, label: h.label }].slice(-MAX_PINS));
  };
  const where = `${preset ? preset.noun : "places"}${states.length ? ` in ${states.join(", ")}` : ""}`;

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

      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="Kind of place">
        <span className="text-muted">Only:</span>
        {[{ key: null, label: "Everywhere" }, ...SETS].map((s) => (
          <button
            key={s.key ?? "all"}
            type="button"
            role="radio"
            aria-checked={set === s.key}
            onClick={() => setSet(s.key)}
            className={`rounded-full border px-2.5 py-0.5 transition-colors ${
              set === s.key ? "border-ink bg-ink text-paper" : "border-rule text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {preset && <p className="mt-2 max-w-xl text-xs text-muted">{preset.blurb}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Compare:</span>
        <TownSearch onPick={addPin} />
        {pins.map((p) => {
          const r = byId.get(p.market);
          const i = rankOf.get(p.market);
          const town = p.label.split(",")[0];
          return (
            <span key={p.market} className="inline-flex items-center gap-1.5 rounded-full border border-ink py-0.5 pl-2.5 pr-1">
              <button type="button" onClick={() => pick(p.market)} className="hover:underline" title={r?.[1] ?? p.label}>
                {town}
              </button>
              <span className="tabular-nums text-muted">
                {loading ? "…" : i !== undefined ? `#${i + 1}` : r ? "not in view" : ""}
              </span>
              <button
                type="button"
                onClick={() => setPins(pins.filter((x) => x.market !== p.market))}
                className="rounded-full px-1 text-muted hover:text-ink"
                aria-label={`Stop comparing ${town}`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {data && (
        <p className="mt-4" aria-live="polite">
          {mineIdx >= 0 ? (
            <>
              Yours ranks <strong>#{mineIdx + 1}</strong> of {fmt(ranked.length)} {where} by {mode.by}.
            </>
          ) : (
            <>
              {fmt(ranked.length)} {where}. Yours isn&apos;t among them.
            </>
          )}
          {pins
            .filter((p) => rankOf.has(p.market))
            .map((p) => {
              const r = byId.get(p.market)!;
              const town = p.label.split(",")[0];
              const same = r[1].startsWith(town);
              return (
                <span key={p.market}>
                  {" "}
                  {same ? r[1] : `${town} (${r[1]})`} is <strong>#{rankOf.get(p.market)! + 1}</strong>.
                </span>
              );
            })}
        </p>
      )}

      {all.length ? (
        <MetroMap rows={all} inView={inView} zoomStates={states} sort={sort} current={query.market} pins={pinIds} onPick={pick} />
      ) : (
        <div className="mt-6 aspect-[1.6] w-full rounded-lg bg-rule/20" />
      )}
      <p className="mt-2 max-w-xl text-xs text-muted">
        Every metro, micro area and rural county for your exact search. Yours is outlined; places you&apos;re comparing
        are dashed. Hover for numbers; click to go there.
      </p>

      {rows.length ? (
        <MetroChart
          rows={rows}
          topIds={topIds}
          neighborIds={neighborIds}
          pinIds={pinIds}
          current={query.market}
          onPick={pick}
        />
      ) : null}
      <p className="mt-2 max-w-xl text-xs text-muted">
        Each dot is a place. Across: your raw pool. Up: fewer competitors in the running per person in it (the market
        alone, before how you stack up). Bigger and less crowded is up and to the right. Pool ÷ competitors is the
        adjusted pool for someone of typical appeal, so dots on the same dashed diagonal tie on that; hover for your
        own adjusted pool, which also counts how you compare with the competition there. Highlighted: you, the places you&apos;re comparing, the five ranked on either side of you and
        the top five by {mode.by}. Click a dot to go there.
      </p>

      <ol className={`mt-6 divide-y divide-rule transition-opacity ${loading ? "opacity-40" : ""}`}>
        {(list.length ? list : Array.from({ length: 10 }, () => null)).map((item, i) => {
          if (item === "gap")
            return (
              <li key={`gap${i}`} aria-hidden className="py-1 pl-11 text-muted">
                ⋯
              </li>
            );
          const r = item?.row ?? null;
          const mine = r?.[0] === query.market;
          const pinned = r ? pinIds.has(r[0]) : false;
          return (
            <li
              key={r?.[0] ?? i}
              className={`flex items-baseline justify-between gap-3 py-2 ${
                mine ? "-mx-2 rounded bg-accent-soft/60 px-2" : pinned ? "-mx-2 rounded bg-rule/40 px-2" : ""
              }`}
            >
              <span className="flex items-baseline gap-3">
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted">{item?.rank ?? ""}</span>
                {r ? (
                  <button
                    type="button"
                    onClick={() => pick(r[0])}
                    className={`text-left hover:underline ${mine ? "font-semibold text-accent" : pinned ? "font-semibold" : ""}`}
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
        Same search everywhere ({noun(query.seek.sex)} {query.seek.lo}–{query.seek.hi}, same filters, same you).
        Towns outside metro and micro areas are counted by county. Odds and crowding skip places with fewer than 50
        people in your pool; rural counts rest on small samples.
      </p>
    </section>
  );
}

function TownSearch({ onPick }: { onPick: (h: Hit) => void }) {
  const [idx, setIdx] = useState<PlaceIndex | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => (idx && text ? searchPlaces(idx, text, 6) : []), [idx, text]);

  useEffect(() => {
    if (open) loadPlaceIndex().then(setIdx);
  }, [open]);

  const pick = (h: Hit) => {
    onPick(h);
    setText("");
    setActive(0);
  };

  return (
    <span className="relative">
      <input
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="town-list"
        aria-label="Find a town to compare"
        placeholder="Find a town…"
        className="w-44 rounded-md border border-rule bg-card px-2 py-1 text-ink placeholder:text-muted"
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && hits[active]) pick(hits[active]);
          else if (e.key === "Escape") setText("");
          else return;
          e.preventDefault();
        }}
      />
      {open && hits.length > 0 && (
        <ul
          id="town-list"
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 w-[min(20rem,88vw)] overflow-hidden rounded-lg border border-rule bg-card shadow-lg"
        >
          {hits.map((h, i) => (
            <li
              key={`${h.label}|${h.market}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-accent-soft" : ""}`}
            >
              <div className="text-ink">{h.label}</div>
              <div className="text-xs text-muted">{h.sub}</div>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
