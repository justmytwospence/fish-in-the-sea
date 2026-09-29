"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RankResponse } from "@/lib/rank";
import { fmt, shortCity } from "@/lib/format";

type Row = RankResponse["all"][number];

const M = { top: 16, right: 16, bottom: 44, left: 48 };

// Every place as a dot: raw pool across (log), the competition multiplier up
// (x1 is a balanced market). Adjusted pool = raw x multiplier, so the faint
// curves are constant adjusted pools. Yours, its ranking neighbors, pinned
// places and the leaders are emphasized; everything else stays recessive.
export default function MetroChart({
  rows: input,
  topIds,
  neighborIds,
  pinIds,
  current,
  onPick,
}: {
  rows: Row[];
  topIds: Set<string>;
  neighborIds: Set<string>;
  pinIds: Set<string>;
  current: string;
  onPick: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<Row | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);

  const h = Math.round(Math.min(420, Math.max(300, w * 0.62)));
  const rows = useMemo(() => input.filter((r) => r[2] >= 1 && r[4] > 0), [input]);

  const lx0 = Math.floor(Math.log10(Math.max(1, Math.min(...rows.map((r) => r[2])))));
  const lx1 = Math.max(lx0 + 1, Math.ceil(Math.log10(Math.max(...rows.map((r) => r[2])))));
  const yMax = Math.max(1.2, ...rows.map((r) => r[4])) * 1.06;
  const px = (v: number) => M.left + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (w - M.left - M.right);
  const py = (v: number) => h - M.bottom - (v / yMax) * (h - M.top - M.bottom);
  const xTicks = Array.from({ length: lx1 - lx0 + 1 }, (_, i) => 10 ** (lx0 + i));
  const yTicks = Array.from({ length: Math.floor(yMax / 0.25) + 1 }, (_, i) => i * 0.25);
  // Curves of constant adjusted pool: multiplier = A / raw.
  const isos = xTicks.slice(1, -1).map((A) => {
    const pts: string[] = [];
    for (let t = 0; t <= 60; t++) {
      const x = 10 ** (lx0 + ((lx1 - lx0) * t) / 60);
      const y = A / x;
      if (y <= yMax && y >= 0.05) pts.push(`${px(x).toFixed(1)},${py(y).toFixed(1)}`);
    }
    return { A, d: pts.length > 1 ? `M${pts.join("L")}` : "" };
  });

  // Draw order: background dots, then neighbors, then leaders and pinned
  // places, then you.
  const layer = (r: Row) =>
    r[0] === current ? 3 : topIds.has(r[0]) || pinIds.has(r[0]) ? 2 : neighborIds.has(r[0]) ? 1 : 0;
  const ordered = [...rows].sort((a, b) => layer(a) - layer(b));
  // Greedy label placement: yours first, then pinned places, then the
  // leaders; nudge up or down
  // once to dodge a collision, otherwise skip (the list below names them).
  const labeled: { r: Row; dy: number }[] = [];
  const boxes: [number, number, number, number][] = [];
  const labelOrder = (r: Row) => (r[0] === current ? 0 : pinIds.has(r[0]) ? 1 : 2);
  for (const r of ordered.filter((r) => layer(r) >= 2).sort((a, b) => labelOrder(a) - labelOrder(b))) {
    const x = px(r[2]);
    const right = x < w - 120;
    const text = r[0] === current ? `You: ${shortCity(r[1])}` : shortCity(r[1]);
    const tw = text.length * 6.6;
    const x0 = right ? x + 10 : x - 10 - tw;
    for (const dy of [0, -13, 13]) {
      const y0 = py(r[4]) + dy - 9;
      const hit = boxes.some(([a, b, c, d]) => x0 < c && x0 + tw > a && y0 < d && y0 + 13 > b);
      if (!hit) {
        boxes.push([x0, y0, x0 + tw, y0 + 13]);
        labeled.push({ r, dy });
        break;
      }
    }
  }

  return (
    <div ref={ref} className="relative mt-6">
      <svg width={w} height={h} role="img" aria-label="Every place by raw pool and competition multiplier" className="block">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={M.left}
              x2={w - M.right}
              y1={py(t)}
              y2={py(t)}
              className={t === 1 ? "stroke-muted" : "stroke-rule"}
              strokeWidth={1}
              opacity={t === 1 ? 1 : 0.5}
            />
            <text x={M.left - 8} y={py(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              ×{t}
            </text>
          </g>
        ))}
        <text x={w - M.right} y={py(1) - 6} textAnchor="end" className="fill-muted text-[11px]">
          balanced market
        </text>
        {isos.map(({ A, d }) => (
          <g key={`iso${A}`}>
            <path d={d} fill="none" className="stroke-rule" strokeDasharray="3 4" strokeWidth={1} />
            {A / (yMax * 0.93) > 10 ** lx0 && (
              <text x={px(A / (yMax * 0.93)) + 4} y={py(yMax * 0.93)} className="fill-muted text-[10px]">
                {fmt(A)} adjusted
              </text>
            )}
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={px(t)} y={h - M.bottom + 18} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
            {fmt(t)}
          </text>
        ))}
        <text x={(M.left + w - M.right) / 2} y={h - 6} textAnchor="middle" className="fill-muted text-[11px]">
          Raw pool (log scale) →
        </text>
        <text transform={`translate(12 ${(M.top + h - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-[11px]">
          Competition multiplier →
        </text>

        {ordered.map((r) => {
          const L = layer(r);
          const x = px(r[2]);
          const y = py(r[4]);
          return (
            <g
              key={r[0]}
              onMouseEnter={() => setHover(r)}
              onMouseLeave={() => setHover((cur) => (cur === r ? null : cur))}
              onClick={() => onPick(r[0])}
              className="cursor-pointer"
            >
              <circle cx={x} cy={y} r={10} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={L === 3 ? 7 : pinIds.has(r[0]) ? 5.5 : L >= 1 ? 4.5 : 3.5}
                className={L === 3 ? "fill-accent stroke-card" : L >= 1 ? "fill-ink stroke-card" : "fill-muted"}
                strokeWidth={L >= 1 ? 2 : 0}
                opacity={L === 0 ? 0.45 : 1}
              />
            </g>
          );
        })}
        {labeled.map(({ r, dy }) => {
          const x = px(r[2]);
          const right = x < w - 120;
          return (
            <text
              key={`l${r[0]}`}
              x={x + (right ? 10 : -10)}
              y={py(r[4]) + 4 + dy}
              textAnchor={right ? "start" : "end"}
              className={`pointer-events-none text-[12px] ${r[0] === current ? "fill-accent font-semibold" : "fill-ink"}`}
              style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 3 }}
            >
              {r[0] === current ? `You: ${shortCity(r[1])}` : shortCity(r[1])}
            </text>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-md border border-rule bg-card p-2 text-xs shadow-md"
          style={{
            left: Math.min(w - 216, Math.max(0, px(hover[2]) + 12)),
            top: Math.max(0, py(hover[4]) - 70),
          }}
        >
          <p className="font-medium text-ink">{hover[1]}</p>
          <p className="mt-1 text-muted">
            Raw pool <span className="text-ink tabular-nums">{fmt(hover[2])}</span>
          </p>
          <p className="text-muted">
            Adjusted <span className="text-ink tabular-nums">{fmt(hover[3])}</span> (×{hover[4].toFixed(2)})
          </p>
        </div>
      )}
    </div>
  );
}
