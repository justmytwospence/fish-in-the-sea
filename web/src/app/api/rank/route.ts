import { compute } from "@/lib/model";
import { parseQuery } from "@/lib/query";
import { loadGlobal, loadMarkets, loadShard } from "@/lib/server-data";

export interface RankRow {
  id: string;
  name: string;
  value: number;
  ratio: number;
  density: number; // per 100k residents
}

export interface RankResponse {
  total: number;
  you: (RankRow & { rank: Record<Sort, number> }) | null;
  top: Record<Sort, RankRow[]>;
}

export type Sort = "value" | "ratio" | "density";
const MIN_POOL_FOR_RATIO = 100;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const query = parseQuery(params);
  const [g, idx] = await Promise.all([loadGlobal(), loadMarkets()]);
  const metros = idx.markets.filter((m) => m.kind === "metro" || m.id === query.market);

  const rows: RankRow[] = [];
  await Promise.all(
    metros.map(async (m) => {
      const s = await loadShard(m.id);
      if (!s) return;
      const r = compute(s, g, { ...query, market: m.id });
      rows.push({
        id: m.id,
        name: m.name,
        value: r.final.value,
        ratio: r.poolBeforeFilters >= MIN_POOL_FOR_RATIO ? r.ratio : Infinity,
        density: (r.final.value / m.pop) * 1e5,
      });
    }),
  );

  const sorted: Record<Sort, RankRow[]> = {
    value: [...rows].sort((a, b) => b.value - a.value),
    ratio: [...rows].sort((a, b) => a.ratio - b.ratio),
    density: [...rows].sort((a, b) => b.density - a.density),
  };
  const mine = rows.find((r) => r.id === query.market);
  const body: RankResponse = {
    total: rows.length,
    you: mine
      ? {
          ...mine,
          rank: {
            value: sorted.value.indexOf(mine) + 1,
            ratio: sorted.ratio.indexOf(mine) + 1,
            density: sorted.density.indexOf(mine) + 1,
          },
        }
      : null,
    top: {
      value: sorted.value.slice(0, 10),
      ratio: sorted.ratio.slice(0, 10),
      density: sorted.density.slice(0, 10),
    },
  };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
