import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Choice } from "./competition";
import {
  mergeContext,
  type BeliefsData,
  type Context,
  type Global,
  type KidsData,
  type PoliticsData,
  type ReligionData,
  type Shard,
} from "./model";

const DIR = path.join(process.cwd(), "public", "data");

let globalP: Promise<Global> | undefined;
let choiceP: Promise<Choice> | undefined;
let marketsP: Promise<MarketIndex> | undefined;
const shards = new Map<string, Promise<Shard>>();

export interface MarketIndex {
  year: string;
  markets: { id: string; name: string; kind: string; pop: number; cbsa?: string; county?: string; tags?: string[] }[];
  places: [name: string, state: string, market: string, pop: number, lat: number | null, lon: number | null][];
}

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DIR, file), "utf8")) as T;
}

// Census tables plus context.json (health rates, per-metro context).
export function loadGlobal() {
  return (globalP ??= Promise.all([
    json<Global>("global.json"),
    json<Context>("context.json"),
    json<ReligionData>("religion.json"),
    json<PoliticsData>("politics.json"),
    json<KidsData>("kids.json"),
    json<BeliefsData>("beliefs.json"),
  ]).then(([g, c, r, p, k, b]) => mergeContext(g, c, r, p, k, b)));
}

export function loadChoice() {
  return (choiceP ??= json<Choice>("choice.json"));
}

export function loadMarkets() {
  return (marketsP ??= json<MarketIndex>("markets.json"));
}

export function loadShard(id: string): Promise<Shard | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return Promise.resolve(null);
  let p = shards.get(id);
  if (!p) {
    p = json<Shard>(`m/${id}.json`);
    shards.set(id, p);
  }
  return p.catch(() => {
    shards.delete(id);
    return null;
  });
}

// Nearest sizable place to a coordinate, and the market it belongs to.
export async function nearestMarket(lat: number, lon: number) {
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const { places } = await loadMarkets();
  const cos = Math.cos((lat * Math.PI) / 180);
  let best: MarketIndex["places"][number] | null = null;
  let bestD = Infinity;
  for (const p of places) {
    if (p[4] === null || p[5] === null) continue;
    const d = (p[4] - lat) ** 2 + ((p[5] - lon) * cos) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  // About 60 miles: beyond that we're probably outside the US.
  if (!best || Math.sqrt(bestD) > 1) return null;
  return { market: best[2], place: `${best[0]}, ${best[1]}` };
}
