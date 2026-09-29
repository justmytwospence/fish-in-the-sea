import { compute } from "@/lib/model";
import { parseQuery } from "@/lib/query";
import { PARTS, type RankResponse, type RankRow } from "@/lib/rank";
import { loadChoice, loadGlobal, loadMarkets, loadShard } from "@/lib/server-data";

const MIN_POOL = 50; // odds are noise below this

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const query = parseQuery(params);
  const part = Math.min(PARTS - 1, Math.max(0, Number(params.get("part")) || 0));
  const [g, choice, idx] = await Promise.all([loadGlobal(), loadChoice(), loadMarkets()]);
  const markets = idx.markets.filter((_, i) => i % PARTS === part);

  const all: RankRow[] = [];
  await Promise.all(
    markets.map(async (m) => {
      const s = await loadShard(m.id);
      if (!s) return;
      const r = compute(s, g, { ...query, market: m.id }, choice, false);
      const value = r.final.value;
      const mult = r.competition?.multiplier ?? 0;
      const ok = value >= MIN_POOL;
      all.push([
        m.id,
        m.name,
        Math.round(value * 10) / 10,
        Math.round(value * mult * 10) / 10,
        ok ? Math.round(mult * 1000) / 1000 : 0,
        m.cbsa ?? `C${m.county}`,
        m.pop,
        ok ? Math.round((r.competition?.ratio ?? 0) * 1000) / 1000 : 0,
        m.tags ?? [],
      ]);
    }),
  );
  const body: RankResponse = { all };
  return Response.json(body, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
