import { compute } from "@/lib/model";
import { parseQuery } from "@/lib/query";
import { loadChoice, loadGlobal, loadMarkets, loadShard } from "@/lib/server-data";

// raw: people through your sieve; adjusted: that pool adjusted for
// competition; odds: the adjustment itself (adjusted / raw).
// crowd: fewest competitors in the running per person (the market alone).
export type Sort = "raw" | "adjusted" | "crowd" | "odds";

export interface RankRow {
  id: string;
  name: string;
  cbsa: string;
  pop: number;
  value: number; // your pool
  adjusted: number; // your pool, adjusted for competition
  multiplier: number; // adjusted / value
  ratio: number; // competitors in the running per person in your pool
}

export interface RankResponse {
  total: number;
  you: (RankRow & { rank: Record<Sort, number> }) | null;
  top: Record<Sort, RankRow[]>;
  // Your metro and the NEIGHBORS on either side of it, with ranks.
  around: Record<Sort, { rank: number; row: RankRow }[]>;
  // Every metro, for the chart, map and list:
  // [id, name, pool, adjusted, multiplier, cbsa, population, competitors per person]
  all: [string, string, number, number, number, string, number, number][];
}

const NEIGHBORS = 5;
const MIN_POOL = 50; // odds are noise below this

function neighbors(list: RankRow[], mine: RankRow | undefined) {
  const i = mine ? list.indexOf(mine) : -1;
  if (i < 0) return [];
  const start = Math.max(0, i - NEIGHBORS);
  return list.slice(start, i + NEIGHBORS + 1).map((row, k) => ({ rank: start + k + 1, row }));
}

export async function GET(req: Request) {
  const query = parseQuery(new URL(req.url).searchParams);
  const [g, choice, idx] = await Promise.all([loadGlobal(), loadChoice(), loadMarkets()]);
  const metros = idx.markets.filter((m) => m.kind === "metro" || m.id === query.market);

  const rows: RankRow[] = [];
  await Promise.all(
    metros.map(async (m) => {
      const s = await loadShard(m.id);
      if (!s) return;
      const r = compute(s, g, { ...query, market: m.id }, choice, false);
      const mult = r.competition?.multiplier ?? 0;
      rows.push({
        id: m.id,
        name: m.name,
        cbsa: m.cbsa ?? "",
        pop: m.pop,
        value: r.final.value,
        adjusted: r.final.value * mult,
        multiplier: r.final.value >= MIN_POOL ? mult : 0,
        ratio: r.final.value >= MIN_POOL ? (r.competition?.ratio ?? 0) : 0,
      });
    }),
  );

  const sorted: Record<Sort, RankRow[]> = {
    raw: [...rows].sort((a, b) => b.value - a.value),
    adjusted: [...rows].sort((a, b) => b.adjusted - a.adjusted),
    crowd: [...rows].sort((a, b) => (a.ratio || Infinity) - (b.ratio || Infinity)),
    odds: [...rows].sort((a, b) => b.multiplier - a.multiplier),
  };
  const mine = rows.find((r) => r.id === query.market);
  const rankOf = (r: RankRow) => ({
    raw: sorted.raw.indexOf(r) + 1,
    adjusted: sorted.adjusted.indexOf(r) + 1,
    crowd: sorted.crowd.indexOf(r) + 1,
    odds: sorted.odds.indexOf(r) + 1,
  });
  const body: RankResponse = {
    total: rows.length,
    you: mine ? { ...mine, rank: rankOf(mine) } : null,
    top: {
      raw: sorted.raw.slice(0, 10),
      adjusted: sorted.adjusted.slice(0, 10),
      crowd: sorted.crowd.slice(0, 10),
      odds: sorted.odds.slice(0, 10),
    },
    around: {
      raw: neighbors(sorted.raw, mine),
      adjusted: neighbors(sorted.adjusted, mine),
      crowd: neighbors(sorted.crowd, mine),
      odds: neighbors(sorted.odds, mine),
    },
    all: rows.map((r) => [
      r.id,
      r.name,
      Math.round(r.value * 10) / 10,
      Math.round(r.adjusted * 10) / 10,
      Math.round(r.multiplier * 1000) / 1000,
      r.cbsa,
      r.pop,
      Math.round(r.ratio * 1000) / 1000,
    ]),
  };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
