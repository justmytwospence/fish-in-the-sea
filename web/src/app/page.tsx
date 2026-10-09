import type { Metadata } from "next";
import Link from 'next/link';
import { headers } from "next/headers";
import App from "@/components/App";
import { compute } from "@/lib/model";
import { shortCity } from "@/lib/format";
import { DEFAULT_MARKET, parseQuery, queryEncodingSupported } from "@/lib/query";
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Fish in the Sea · Explore your dating market', description: 'Population estimates and qualified competition comparisons—not dating predictions.' };
}

export default async function Page(props: Props) {
  if(!queryEncodingSupported(await props.searchParams)) return <main className="mx-auto max-w-xl p-8"><h1 className="font-display text-3xl">Unsupported share-link format</h1><p className="mt-4">This version of the app cannot interpret that search.</p><Link className="mt-4 inline-block underline" href="/" prefetch={false} replace>Start a new search</Link></main>;
  const { query, result, year, located } = await resolve(props);
  return <App initialQuery={query} initialResult={result} dataYear={year} located={located} />;
}
