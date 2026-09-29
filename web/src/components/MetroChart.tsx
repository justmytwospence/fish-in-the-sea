"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RankResponse, Sort } from "@/app/api/rank/route";
import { fmt, shortCity } from "@/lib/format";

type Row = RankResponse["all"][number];

const M = { top: 16, right: 16, bottom: 44, left: 48 };

// Every metro as a dot: pool size (log) across, fair share up. Big-and-fair
// is the top right. Your metro, its ranking neighbors and the leaders are
// emphasized; everything else stays recessive.
export default function MetroChart({
  data,
  sort,
  current,
  onPick,
}: {
  data: RankResponse;
  sort: Sort;
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
  const rows = useMemo(() => data.all.filter((r) => r[2] >= 1), [data]);
  const neighborIds = useMemo(() => new Set((data.around?.[sort] ?? []).map((x) => x.row.id)), [data, sort]);
  const topIds = useMemo(() => new Set((data.top?.[sort] ?? []).slice(0, 5).map((r) => r.id)), [data, sort]);

  const xMin = Math.max(1, Math.min(...rows.map((r) => r[2])));
  const xMax = Math.max(...rows.map((r) => r[2]));
  const lx0 = Math.floor(Math.log10(xMin));
  const lx1 = Math.ceil(Math.log10(xMax));
  const yMax = Math.max(0.1, ...rows.map((r) => r[3])) * 1.08;
  const px = (v: number) => M.left + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (w - M.left - M.right);
  const py = (v: number) => h - M.bottom - (v / yMax) * (h - M.top - M.bottom);
  const xTicks = Array.from({ length: lx1 - lx0 + 1 }, (_, i) => 10 ** (lx0 + i));
  const yStep = yMax > 1.5 ? 0.5 : yMax > 0.6 ? 0.25 : 0.1;
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => +(i * yStep).toFixed(2));

  // Draw order: background dots, then neighbors, then leaders, then you.
  const layer = (r: Row) => (r[0] === current ? 3 : topIds.has(r[0]) ? 2 : neighborIds.has(r[0]) ? 1 : 0);
  const ordered = [...rows].sort((a, b) => layer(a) - layer(b));
  // Greedy label placement: yours first, then the leaders; nudge up or down
  // once to dodge a collision, otherwise skip (the list below names them).
  const labeled: { r: Row; dy: number }[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const r of [...ordered].reverse().filter((r) => layer(r) >= 2)) {
    const x = px(r[2]);
    const right = x < w - 120;
    const text = r[0] === current ? `You: ${shortCity(r[1])}` : shortCity(r[1]);
    const tw = text.length * 6.6;
    const x0 = right ? x + 10 : x - 10 - tw;
    for (const dy of [0, -13, 13]) {
      const y0 = py(r[3]) + dy - 9;
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
      <svg width={w} height={h} role="img" aria-label="Every metro by pool size and fair share" className="block">
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={M.left} x2={w - M.right} y1={py(t)} y2={py(t)} className="stroke-rule" strokeWidth={1} />
            <text x={M.left - 8} y={py(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={px(t)} y={h - M.bottom + 18} textAnchor="middle" className="fill-muted text-[11px] tabular-nums">
            {fmt(t)}
          </text>
        ))}
        <text x={(M.left + w - M.right) / 2} y={h - 6} textAnchor="middle" className="fill-muted text-[11px]">
          People in your pool (log scale) →
        </text>
        <text transform={`translate(12 ${(M.top + h - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-[11px]">
          Your fair share →
        </text>

        {ordered.map((r) => {
          const L = layer(r);
          const x = px(r[2]);
          const y = py(r[3]);
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
                r={L === 3 ? 7 : L >= 1 ? 4.5 : 3.5}
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
              y={py(r[3]) + 4 + dy}
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
            top: Math.max(0, py(hover[3]) - 70),
          }}
        >
          <p className="font-medium text-ink">{hover[1]}</p>
          <p className="mt-1 text-muted">
            Pool <span className="text-ink tabular-nums">{fmt(hover[2])}</span> · #{hover[4]}
          </p>
          <p className="text-muted">
            Fair share <span className="text-ink tabular-nums">{hover[3].toFixed(2)}</span> · #{hover[5]}
          </p>
        </div>
      )}
    </div>
  );
}
