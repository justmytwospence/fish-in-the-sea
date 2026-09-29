import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Global, Shard } from "./model";

const DIR = path.join(process.cwd(), "public", "data");

let globalP: Promise<Global> | undefined;
let marketsP: Promise<MarketIndex> | undefined;
const shards = new Map<string, Promise<Shard>>();

export interface MarketIndex {
  year: string;
  markets: { id: string; name: string; kind: string; pop: number }[];
  places: [name: string, state: string, market: string, pop: number][];
}

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(DIR, file), "utf8")) as T;
}

export function loadGlobal() {
  return (globalP ??= json<Global>("global.json"));
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
