"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, shortCity } from "@/lib/format";

type Place = [name: string, state: string, market: string, pop: number];
interface Index {
  markets: { id: string; name: string; kind: string; pop: number }[];
  places: Place[];
}

let indexPromise: Promise<Index> | undefined;
const loadIndex = () => (indexPromise ??= fetch("/data/markets.json").then((r) => r.json()));

const ALIASES: Record<string, string> = {
  nyc: "new york",
  sf: "san francisco",
  la: "los angeles",
  dc: "washington",
  philly: "philadelphia",
  vegas: "las vegas",
  nola: "new orleans",
  atl: "atlanta",
  chi: "chicago",
  slc: "salt lake city",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Hit {
  label: string;
  sub: string;
  market: string;
  score: number;
}

function search(idx: Index, raw: string): Hit[] {
  const q = norm(ALIASES[norm(raw)] ?? raw);
  if (!q) return [];
  const byId = new Map(idx.markets.map((m) => [m.id, m]));
  const hits = new Map<string, Hit>();
  const consider = (label: string, sub: string, market: string, score: number) => {
    const key = `${label}|${market}`;
    if (!hits.has(key) || hits.get(key)!.score < score) hits.set(key, { label, sub, market, score });
  };
  for (const [name, st, market, pop] of idx.places) {
    const n = norm(`${name} ${st}`);
    const words = norm(name);
    let base = 0;
    if (words.startsWith(q) || n.startsWith(q)) base = 3;
    else if (n.split(" ").some((w) => w.startsWith(q.split(" ")[0])) && n.includes(q)) base = 1.5;
    else if (n.includes(q)) base = 1;
    if (!base) continue;
    const m = byId.get(market)!;
    const mname = m.name.split(",")[0].split("-")[0];
    const sub =
      mname === name
        ? `${m.kind === "metro" ? "Metro" : "Micro area"} · ${fmt(m.pop)} people`
        : `Part of the ${mname} ${m.kind === "metro" ? "metro" : "area"} · ${fmt(m.pop)}`;
    consider(`${name}, ${st}`, sub, market, base + Math.log10(pop) / 10);
  }
  for (const m of idx.markets) {
    const n = norm(m.name);
    if (n.startsWith(q) || n.includes(` ${q}`)) {
      consider(m.name, `${m.kind === "metro" ? "Metro" : "Micro area"} · ${fmt(m.pop)} people`, m.id, 2 + Math.log10(m.pop) / 10);
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

export default function CityPicker({
  marketName,
  onPick,
}: {
  marketName: string;
  onPick: (market: string) => void;
}) {
  const [idx, setIdx] = useState<Index | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (idx && text ? search(idx, text) : []), [idx, text]);
  const display = `${shortCity(marketName)}, ${marketName.split(", ").pop()?.split("-")[0]}`;

  useEffect(() => {
    if (open) loadIndex().then(setIdx);
  }, [open]);

  const pick = (h: Hit) => {
    onPick(h.market);
    setOpen(false);
    setText("");
    inputRef.current?.blur();
  };

  return (
    <span className="relative inline-block">
      <input
        ref={inputRef}
        className="field w-[min(13rem,70vw)]"
        title={marketName}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="city-list"
        aria-label="City or metro area"
        placeholder={display}
        value={open ? text : display}
        onFocus={() => {
          setOpen(true);
          setText("");
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && hits[active]) pick(hits[active]);
          else if (e.key === "Escape") inputRef.current?.blur();
          else return;
          e.preventDefault();
        }}
      />
      {open && hits.length > 0 && (
        <ul
          id="city-list"
          role="listbox"
          className="absolute left-0 top-full z-20 mt-2 w-[min(22rem,88vw)] overflow-hidden rounded-lg border border-rule bg-card font-sans text-base font-normal shadow-lg"
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
