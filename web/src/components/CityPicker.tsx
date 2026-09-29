"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shortCity } from "@/lib/format";
import { loadPlaceIndex, searchPlaces, type Hit, type PlaceIndex } from "@/lib/place-search";

export default function CityPicker({
  marketName,
  onPick,
}: {
  marketName: string;
  onPick: (market: string) => void;
}) {
  const [idx, setIdx] = useState<PlaceIndex | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (idx && text ? searchPlaces(idx, text) : []), [idx, text]);
  const display = `${shortCity(marketName).replace(/ County$/, " Co.")}, ${marketName.split(", ").pop()?.split("-")[0]}`;

  useEffect(() => {
    if (open) loadPlaceIndex().then(setIdx);
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
