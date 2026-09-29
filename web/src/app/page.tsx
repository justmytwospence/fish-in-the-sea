import type { Metadata } from "next";
import App from "@/components/App";
import { compute, noun } from "@/lib/model";
import { approx, shortCity } from "@/lib/format";
import { DEFAULT_MARKET, parseQuery, serializeQuery } from "@/lib/query";
import { loadGlobal, loadMarkets, loadShard } from "@/lib/server-data";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function resolve(props: Props) {
  const query = parseQuery(await props.searchParams);
  let shard = await loadShard(query.market);
  if (!shard) {
    query.market = DEFAULT_MARKET;
    shard = await loadShard(DEFAULT_MARKET);
  }
  const [g, markets] = await Promise.all([loadGlobal(), loadMarkets()]);
  return { query, result: compute(shard!, g, query), year: markets.year };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { query, result } = await resolve(props);
  const title = `${approx(result.final.value)} ${noun(query.seek.sex)} ${query.seek.lo}–${query.seek.hi} in ${shortCity(result.market.name)} · The Denominator`;
  const image = `/api/og?${serializeQuery(query)}`;
  return {
    title,
    openGraph: { title, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

export default async function Page(props: Props) {
  const { query, result, year } = await resolve(props);
  return <App initialQuery={query} initialResult={result} dataYear={year} />;
}
