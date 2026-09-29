"use client";

import { useEffect, useRef, useState } from "react";
import type { AgePoint } from "@/lib/overtime";
import { noun, type Query } from "@/lib/model";
import { fmt, pct } from "@/lib/format";

const M = { top: 24, right: 72, bottom: 40, left: 56 };

// Raw and competition-adjusted pools across your age, current age marked.
export default function OverTime({ sliding, fixed, query }: { sliding: AgePoint[]; fixed: AgePoint[]; query: Query }) {
  const ref = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(true);
  const points = slide ? sliding : fixed;
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, e.contentRect.width)));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return null;
  const h = Math.round(Math.min(340, Math.max(240, w * 0.5)));
  const a0 = points[0].age;
  const a1 = points[points.length - 1].age;
  const yMax = Math.max(...points.map((p) => Math.max(p.raw, p.adjusted))) * 1.08;
  const px = (a: number) => M.left + ((a - a0) / (a1 - a0)) * (w - M.left - M.right);
  const py = (v: number) => h - M.bottom - (v / yMax) * (h - M.top - M.bottom);
  const line = (key: "raw" | "adjusted") => points.map((p, i) => `${i ? "L" : "M"}${px(p.age).toFixed(1)},${py(p[key]).toFixed(1)}`).join("");
  const step = 10 ** Math.floor(Math.log10(yMax / 2));
  const tick = [1, 2, 5, 10].map((m) => m * step).find((t) => yMax / t <= 5) ?? step * 10;
  const yTicks = Array.from({ length: Math.floor(yMax / tick) + 1 }, (_, i) => i * tick);
  const now = points.find((p) => p.age === query.me.age) ?? points[Math.floor(points.length / 2)];
  const first = points[0];
  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;
  const change = (p: AgePoint) => (now.adjusted > 0 ? p.adjusted / now.adjusted - 1 : 0);
  const them = noun(query.seek.sex);

  return (
    <section aria-label="Over time" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Over time</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">
        {last.adjusted < now.adjusted * 0.95
          ? "It gets harder from here."
          : last.adjusted > now.adjusted * 1.05
            ? "It gets easier from here. Probably."
            : "Roughly holding steady."}
      </h2>
      <div role="radiogroup" aria-label="Age range over time" className="mt-4 inline-flex rounded-full border border-rule p-1">
        {(
          [
            [true, "Sliding with you"],
            [false, `Fixed at ${query.seek.lo}–${query.seek.hi}`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={String(v)}
            role="radio"
            aria-checked={slide === v}
            onClick={() => setSlide(v)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${slide === v ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-xl text-muted">
        Your prospects from age {first.age} to {last.age},{" "}
        {slide ? (
          <>
            with the ages you&apos;re looking for sliding along with you (you&apos;re {query.me.age} seeking{" "}
            {query.seek.lo}–{query.seek.hi} now)
          </>
        ) : (
          <>
            still looking for {query.seek.lo}–{query.seek.hi} at every age, so only your own age (and how they see it)
            changes
          </>
        )}{" "}
        and everything else held the same.
        Five years from now your adjusted pool is {change(last) >= 0 ? "up" : "down"}{" "}
        <strong className="text-ink">{pct(Math.abs(change(last)))}</strong>; five years ago it was{" "}
        {change(first) >= 0 ? "up" : "down"} {pct(Math.abs(change(first)))}.
      </p>

      <div ref={ref} className="relative mt-6" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={h} role="img" aria-label={`Raw and adjusted pool of ${them} by your age, ${first.age} to ${last.age}`} className="block">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={w - M.right} y1={py(t)} y2={py(t)} className="stroke-rule" opacity={0.5} />
              <text x={M.left - 8} y={py(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                {t === 0 ? "0" : fmt(t)}
              </text>
            </g>
          ))}
          {points.map((p) => (
            <text key={p.age} x={px(p.age)} y={h - M.bottom + 16} textAnchor="middle" className={`text-[11px] tabular-nums ${p.age === query.me.age ? "fill-ink font-semibold" : "fill-muted"}`}>
              {p.age}
            </text>
          ))}
          <text x={(M.left + w - M.right) / 2} y={h - 4} textAnchor="middle" className="fill-muted text-[11px]">
            Your age
          </text>
          <line x1={px(now.age)} x2={px(now.age)} y1={M.top - 8} y2={h - M.bottom} className="stroke-muted" strokeDasharray="3 3" />
          <text x={px(now.age)} y={M.top - 12} textAnchor="middle" className="fill-muted text-[10px] uppercase tracking-widest">
            now
          </text>
          <path d={line("raw")} fill="none" className="stroke-muted" strokeWidth={2} />
          <path d={line("adjusted")} fill="none" className="stroke-accent" strokeWidth={2} />
          {[
            ["raw", "Raw pool", "fill-muted"],
            ["adjusted", "Adjusted", "fill-accent"],
          ].map(([k, label, cls]) => (
            <text key={k} x={px(last.age) + 8} y={py(last[k as "raw" | "adjusted"]) + 4} className={`text-[11px] font-medium ${cls}`}>
              {label}
            </text>
          ))}
          {points.map((p, i) => (
            <g key={p.age}>
              <circle cx={px(p.age)} cy={py(p.adjusted)} r={p.age === now.age || hover === i ? 5 : 3} className="fill-accent stroke-card" strokeWidth={2} />
              <circle cx={px(p.age)} cy={py(p.raw)} r={hover === i ? 4 : 2.5} className="fill-muted stroke-card" strokeWidth={1.5} />
              <rect
                x={px(p.age) - (w - M.left - M.right) / (points.length - 1) / 2}
                y={M.top}
                width={(w - M.left - M.right) / (points.length - 1)}
                height={h - M.top - M.bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
          {hp && <line x1={px(hp.age)} x2={px(hp.age)} y1={M.top} y2={h - M.bottom} className="stroke-ink" opacity={0.3} pointerEvents="none" />}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-md border border-rule bg-card p-2 text-xs shadow-md"
            style={{ left: Math.min(px(hp.age) + 12, w - 216), top: Math.max(0, py(hp.raw) - 10) }}
          >
            <p className="font-medium text-ink">
              At {hp.age}, seeking {hp.lo}–{hp.hi}
            </p>
            <p className="mt-1 text-muted">
              Raw pool <span className="tabular-nums text-ink">{fmt(hp.raw)}</span>
            </p>
            <p className="text-muted">
              Adjusted <span className="tabular-nums text-ink">{fmt(hp.adjusted)}</span>
              {hp.age !== now.age && <> ({change(hp) >= 0 ? "+" : "−"}{pct(Math.abs(change(hp)))} vs. now)</>}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 max-w-xl text-xs text-muted">
        Uses today&apos;s population: each point is what the market looks like right now for someone that age, not a
        forecast of how your own cohort will pair off.
      </p>
    </section>
  );
}
