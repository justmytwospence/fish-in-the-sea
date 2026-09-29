"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Geometry, Position } from "geojson";
import type { RankResponse, Sort } from "@/app/api/rank/route";
import { statesOf } from "@/lib/states";
import { fmt } from "@/lib/format";

type Row = RankResponse["all"][number];

interface Shape {
  id: string; // CBSA code or state postal code
  d: string;
  box: [number, number, number, number]; // x0, y0, x1, y1 in map units
}

let mapPromise: Promise<{ cbsa: Shape[]; states: Shape[]; w: number; h: number }> | undefined;

// The boundary file is pre-projected (Albers USA, meters); scale to km and
// flip y for SVG.
function loadMap() {
  return (mapPromise ??= fetch("/data/map.json")
    .then((r) => r.json())
    .then((topo: Topology) => {
      const [x0, y0, x1, y1] = topo.bbox!;
      const k = 1000;
      const pt = ([x, y]: Position) => `${((x - x0) / k).toFixed(1)},${((y1 - y) / k).toFixed(1)}`;
      const ring = (r: Position[]) => `M${r.map(pt).join("L")}Z`;
      const path = (g: Geometry | null): string => {
        if (!g) return "";
        if (g.type === "Polygon") return g.coordinates.map(ring).join("");
        if (g.type === "MultiPolygon") return g.coordinates.map((p) => p.map(ring).join("")).join("");
        return "";
      };
      const boxOf = (g: Geometry | null): Shape["box"] => {
        const b: Shape["box"] = [Infinity, Infinity, -Infinity, -Infinity];
        const visit = (p: Position) => {
          const x = (p[0] - x0) / k;
          const y = (y1 - p[1]) / k;
          b[0] = Math.min(b[0], x);
          b[1] = Math.min(b[1], y);
          b[2] = Math.max(b[2], x);
          b[3] = Math.max(b[3], y);
        };
        if (g?.type === "Polygon") g.coordinates.forEach((r) => r.forEach(visit));
        if (g?.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((r) => r.forEach(visit)));
        return b;
      };
      const layer = (name: string, key: string) =>
        feature(topo, topo.objects[name] as GeometryCollection).features.map((f) => ({
          id: String((f.properties as Record<string, string>)[key]),
          d: path(f.geometry),
          box: boxOf(f.geometry),
        }));
      return { cbsa: layer("cbsa", "GEOID"), states: layer("states", "STUSPS"), w: (x1 - x0) / k, h: (y1 - y0) / k };
    }));
}

const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, var(--card))`;

interface Scale {
  color: (r: Row) => string;
  legend: { color: string; label: string }[];
  describe: (r: Row) => string;
}

function scaleFor(sort: Sort, rows: Row[]): Scale {
  if (sort === "crowd") {
    // Competitors per person: under 1 is good for you (cool), over 1 crowded.
    const cuts = [0.75, 0.9, 1.1, 1.5, 2];
    const colors = [mix("--cool", 100), mix("--cool", 50), "var(--rule)", mix("--warm", 35), mix("--warm", 65), mix("--warm", 100)];
    const labels = ["under 0.75", "0.75–0.9", "0.9–1.1", "1.1–1.5", "1.5–2", "over 2"];
    const cls = (v: number) => cuts.filter((c) => v >= c).length;
    return {
      color: (r) => (r[7] > 0 ? colors[cls(r[7])] : "var(--rule)"),
      legend: colors.map((color, i) => ({ color, label: labels[i] })),
      describe: (r) => (r[7] > 0 ? `${r[7].toFixed(2)} competitors per person` : "too few people to say"),
    };
  }
  if (sort === "odds") {
    const cuts = [0.5, 0.75, 0.9, 1.1, 1.33];
    const colors = [mix("--warm", 100), mix("--warm", 65), mix("--warm", 35), "var(--rule)", mix("--cool", 50), mix("--cool", 100)];
    const labels = ["under ×0.5", "×0.5–0.75", "×0.75–0.9", "×0.9–1.1", "×1.1–1.33", "over ×1.33"];
    const cls = (v: number) => cuts.filter((c) => v >= c).length;
    return {
      color: (r) => colors[cls(r[4])],
      legend: colors.map((color, i) => ({ color, label: labels[i] })),
      describe: (r) => `×${r[4].toFixed(2)} competition multiplier`,
    };
  }
  const idx = sort === "raw" ? 2 : 3;
  const per = (r: Row) => (r[6] > 0 ? (r[idx] / r[6]) * 1000 : 0);
  const vals = rows.map(per).sort((a, b) => a - b);
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => vals[Math.floor(p * (vals.length - 1))]);
  const shades = [20, 40, 60, 80, 100];
  const cls = (v: number) => q.filter((c) => v >= c).length;
  const edges = [0, ...q];
  return {
    color: (r) => mix("--accent", shades[cls(per(r))]),
    legend: shades.map((s, i) => ({
      color: mix("--accent", s),
      label: i < 4 ? `${edges[i].toFixed(1)}–${q[i].toFixed(1)}` : `${q[3].toFixed(1)}+`,
    })),
    describe: (r) => `${per(r).toFixed(1)} per 1,000 residents${sort === "adjusted" ? " (adjusted)" : ""}`,
  };
}

// Choropleth of every metro for the current search and ranking mode.
export default function MetroMap({
  rows,
  states,
  sort,
  current,
  onPick,
}: {
  rows: Row[];
  states: string[];
  sort: Sort;
  current: string;
  onPick: (id: string) => void;
}) {
  const [map, setMap] = useState<Awaited<ReturnType<typeof loadMap>> | null>(null);
  const [hover, setHover] = useState<{ row: Row; x: number; y: number; w: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMap().then(setMap);
  }, []);

  const byCbsa = useMemo(() => new Map(rows.map((r) => [r[5], r])), [rows]);
  const scale = useMemo(() => scaleFor(sort, rows), [sort, rows]);
  const mine = rows.find((r) => r[0] === current);
  const inStates = (r: Row) => !states.length || statesOf(r[1]).some((s) => states.includes(s));

  if (!map) return <div className="mt-6 aspect-[1.6] w-full rounded-lg bg-rule/20" />;

  // Zoom to the selected states (keeping the map's aspect ratio).
  let viewBox = `0 0 ${map.w} ${map.h}`;
  const sel = map.states.filter((s) => states.includes(s.id));
  if (sel.length) {
    let [x0, y0, x1, y1] = sel.reduce<Shape["box"]>(
      (b, s) => [Math.min(b[0], s.box[0]), Math.min(b[1], s.box[1]), Math.max(b[2], s.box[2]), Math.max(b[3], s.box[3])],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
    [x0, y0, x1, y1] = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    const aspect = map.w / map.h;
    let w = x1 - x0;
    let h = y1 - y0;
    if (w / h < aspect) {
      const nw = h * aspect;
      x0 -= (nw - w) / 2;
      w = nw;
    } else {
      const nh = w / aspect;
      y0 -= (nh - h) / 2;
      h = nh;
    }
    viewBox = `${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  }

  return (
    <figure className="mt-6">
      <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
        <svg viewBox={viewBox} className="block w-full" role="img" aria-label="Map of metro areas colored by the current ranking">
          <g>
            {map.cbsa.map((s) => {
              const r = byCbsa.get(s.id);
              return (
                <path
                  key={s.id}
                  d={s.d}
                  fill={r ? scale.color(r) : "var(--rule)"}
                  opacity={r ? (inStates(r) ? 1 : 0.18) : 0.35}
                  className={r ? "cursor-pointer" : ""}
                  onMouseMove={(e) => {
                    if (!r || !wrap.current) return;
                    const b = wrap.current.getBoundingClientRect();
                    setHover({ row: r, x: e.clientX - b.left, y: e.clientY - b.top, w: b.width });
                  }}
                  onClick={() => r && onPick(r[0])}
                />
              );
            })}
          </g>
          <g fill="none" className="stroke-muted" strokeWidth={0.8} opacity={0.5} pointerEvents="none">
            {map.states.map((s) => (
              <path key={s.id} d={s.d} />
            ))}
          </g>
          {mine && (
            <path
              d={map.cbsa.find((s) => s.id === mine[5])?.d ?? ""}
              fill="none"
              className="stroke-ink"
              strokeWidth={3}
              pointerEvents="none"
            />
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-56 rounded-md border border-rule bg-card p-2 text-xs shadow-md"
            style={{ left: Math.max(0, Math.min(hover.x + 12, hover.w - 232)), top: hover.y + 12 }}
          >
            <p className="font-medium text-ink">{hover.row[1]}</p>
            <p className="mt-1 text-muted">{scale.describe(hover.row)}</p>
            <p className="text-muted">
              Pool {fmt(hover.row[2])} · adjusted {fmt(hover.row[3])}
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          {sort === "odds"
            ? "Competition multiplier:"
            : sort === "crowd"
              ? "Competitors per person:"
              : sort === "raw"
                ? "Raw pool per 1,000 residents:"
                : "Adjusted pool per 1,000 residents:"}
        </span>
        {scale.legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm bg-rule opacity-40" />
          micro areas (not ranked)
        </span>
      </figcaption>
    </figure>
  );
}
