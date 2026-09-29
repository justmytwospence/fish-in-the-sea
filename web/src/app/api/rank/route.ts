import { compute } from "@/lib/model";
import { parseQuery } from "@/lib/query";
import { loadChoice, loadGlobal, loadMarkets, loadShard } from "@/lib/server-data";

export type Sort = "raw" | "fair";

export interface RankRow {
  id: string;
  name: string;
  value: number; // your final pool
  fairShare: number; // expected number of them who'd pick you
  perTarget: number; // ideal-equivalent competitors each of them weighs
}

export interface RankResponse {
  total: number;
  you: (RankRow & { rank: Record<Sort, number> }) | null;
  top: Record<Sort, RankRow[]>;
  // Your metro and the NEIGHBORS on either side of it, with ranks.
  around: Record<Sort, { rank: number; row: RankRow }[]>;
}

const NEIGHBORS = 5;

const MIN_POOL = 50;

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
      rows.push({
        id: m.id,
        name: m.name,
        value: r.final.value,
        fairShare: r.final.value >= MIN_POOL ? (r.competition?.fairShare ?? 0) : 0,
        perTarget: r.competition?.perTarget ?? 0,
      });
    }),
  );

  const sorted: Record<Sort, RankRow[]> = {
    raw: [...rows].sort((a, b) => b.value - a.value),
    fair: [...rows].sort((a, b) => b.fairShare - a.fairShare),
  };
  const mine = rows.find((r) => r.id === query.market);
  const body: RankResponse = {
    total: rows.length,
    you: mine
      ? { ...mine, rank: { raw: sorted.raw.indexOf(mine) + 1, fair: sorted.fair.indexOf(mine) + 1 } }
      : null,
    top: { raw: sorted.raw.slice(0, 10), fair: sorted.fair.slice(0, 10) },
    around: { raw: neighbors(sorted.raw, mine), fair: neighbors(sorted.fair, mine) },
  };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
