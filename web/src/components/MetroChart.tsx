"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RankResponse } from "@/lib/rank";
import { fmt, shortCity } from "@/lib/format";

type Row = RankResponse["all"][number];

const M = { top: 16, right: 16, bottom: 44, left: 48 };

// Every place as a dot: raw pool across, competitors in the running per person
// up (both log; fewer competitors is higher, so better is up and to the
// right). Pool / competitors is the adjusted pool for someone of typical
// appeal, so the faint diagonals are constant typical adjusted pools; your own
// appeal moves you off them (see the tooltip). Yours, its ranking neighbors,
// pinned places and the leaders are emphasized; everything else stays
// recessive.
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
  const rows = useMemo(() => input.filter((r) => r[2] >= 1 && r[7] > 0), [input]);

  const lx0 = Math.floor(Math.log10(Math.max(1, Math.min(...rows.map((r) => r[2])))));
  const lx1 = Math.max(lx0 + 1, Math.ceil(Math.log10(Math.max(...rows.map((r) => r[2])))));
  // Competitors per person, log scale, fewest at the top; always show 1.
  const ys = rows.map((r) => r[7]);
  const yLo = Math.min(0.9, ...ys) / 1.08;
  const yHi = Math.max(1.1, ...ys) * 1.08;
  const px = (v: number) => M.left + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (w - M.left - M.right);
  const py = (v: number) =>
    M.top + ((Math.log10(v) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo))) * (h - M.top - M.bottom);
  const xTicks = Array.from({ length: lx1 - lx0 + 1 }, (_, i) => 10 ** (lx0 + i));
  const yTicks = [0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 20].filter((t) => t >= yLo && t <= yHi);
  // Lines of constant typical adjusted pool: competitors = raw / A.
  const isos = xTicks.slice(1).map((A) => {
    const x0 = Math.max(10 ** lx0, A * yLo);
    const x1 = Math.min(10 ** lx1, A * yHi);
    const d = x1 > x0 ? `M${px(x0).toFixed(1)},${py(x0 / A).toFixed(1)}L${px(x1).toFixed(1)},${py(x1 / A).toFixed(1)}` : "";
    return { A, d, lx: x0 };
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
      const y0 = py(r[7]) + dy - 9;
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
      <svg width={w} height={h} role="img" aria-label="Every place by raw pool and competitors per person" className="block">
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
              {t}
            </text>
          </g>
        ))}
        <text x={w - M.right} y={py(1) - 6} textAnchor="end" className="fill-muted text-[11px]">
          one competitor per person
        </text>
        {isos.map(({ A, d, lx }) =>
          d ? (
            <g key={`iso${A}`}>
              <path d={d} fill="none" className="stroke-rule" strokeDasharray="3 4" strokeWidth={1} />
              {lx === A * yLo && px(lx) + 80 < w - M.right && (
                <text x={px(lx) + 4} y={M.top + 10} className="fill-muted text-[10px]">
                  {fmt(A)} typical adjusted
                </text>
              )}
            </g>
          ) : null,
        )}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={px(t)} y={h - M.bottom + 18} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
            {fmt(t)}
          </text>
        ))}
        <text x={(M.left + w - M.right) / 2} y={h - 6} textAnchor="middle" className="fill-muted text-[11px]">
          Raw pool (log scale) →
        </text>
        <text transform={`translate(12 ${(M.top + h - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-[11px]">
          Fewer competitors per person →
        </text>

        {ordered.map((r) => {
          const L = layer(r);
          const x = px(r[2]);
          const y = py(r[7]);
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
              y={py(r[7]) + 4 + dy}
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
            top: Math.max(0, py(hover[7]) - 86),
          }}
        >
          <p className="font-medium text-ink">{hover[1]}</p>
          <p className="mt-1 text-muted">
            Raw pool <span className="text-ink tabular-nums">{fmt(hover[2])}</span>
          </p>
          <p className="text-muted">
            Competitors per person <span className="text-ink tabular-nums">{hover[7].toFixed(2)}</span>
          </p>
          <p className="text-muted">
            Your adjusted pool <span className="text-ink tabular-nums">{fmt(hover[3])}</span> (×{hover[4].toFixed(2)})
          </p>
        </div>
      )}
    </div>
  );
}
