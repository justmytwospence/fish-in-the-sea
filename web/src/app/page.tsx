import type { Metadata } from "next";
import { headers } from "next/headers";
import App from "@/components/App";
import { compute, noun } from "@/lib/model";
import { approx, shortCity } from "@/lib/format";
import { DEFAULT_MARKET, parseQuery, serializeQuery } from "@/lib/query";
import { loadChoice, loadGlobal, loadMarkets, loadShard, nearestMarket } from "@/lib/server-data";

type Params = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Params> };

// With no city in the URL, guess one from Vercel's IP geolocation headers.
async function guessMarket(): Promise<{ market: string; place: string } | null> {
  const h = await headers();
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lon = Number(h.get("x-vercel-ip-longitude"));
  if (!h.get("x-vercel-ip-latitude") || !h.get("x-vercel-ip-longitude")) return null;
  return nearestMarket(lat, lon);
}

async function resolve(props: Props) {
  const params = await props.searchParams;
  const query = parseQuery(params);
  let located: string | null = null;
  if (!params.in) {
    const guess = await guessMarket();
    if (guess) {
      query.market = guess.market;
      located = guess.place;
    }
  }
  let shard = await loadShard(query.market);
  if (!shard) {
    query.market = DEFAULT_MARKET;
    shard = await loadShard(DEFAULT_MARKET);
  }
  const [g, choice, markets] = await Promise.all([loadGlobal(), loadChoice(), loadMarkets()]);
  // Name the metro rather than the nearest small place (IP locations are fuzzy).
  if (located && shard) located = `the ${shortCity(shard.name)} area`;
  return { query, result: compute(shard!, g, query, choice), year: markets.year, located };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { query, result } = await resolve(props);
  const title = `${approx(result.final.value)} ${noun(query.seek.sex)} ${query.seek.lo}–${query.seek.hi} in ${shortCity(result.market.name)} · Fish in the Sea`;
  const image = `/api/og?${serializeQuery(query)}`;
  return {
    title,
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function Page(props: Props) {
  const { query, result, year, located } = await resolve(props);
  return <App initialQuery={query} initialResult={result} dataYear={year} located={located} />;
}
