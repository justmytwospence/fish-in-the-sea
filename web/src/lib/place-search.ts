import { fmt } from "./format";

type Place = [name: string, state: string, market: string, pop: number];
export interface PlaceIndex {
  markets: { id: string; name: string; kind: string; pop: number }[];
  places: Place[];
}

let indexPromise: Promise<PlaceIndex> | undefined;
export const loadPlaceIndex = () => (indexPromise ??= fetch('/data/markets.json').then((r) => {
  if (!r.ok) throw new Error('Places unavailable');
  return r.json();
}).catch((e) => { indexPromise = undefined; throw e; }));

const ALIASES: Record<string, string> = {
  nyc: "new york",
  sf: "san francisco",
  la: "los angeles",
  dc: "washington",
  philly: "philadelphia",
  vegas: "las vegas",
  nola: "new orleans",
  atl: "atlanta",
  chi: "chicago",
  slc: "salt lake city",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/\bmt\.?\s/g, "mount ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const KIND_LABEL: Record<string, string> = { metro: "Metro", micro: "Micro area", rural: "Rural county" };

export interface Hit {
  label: string; // what was matched: a town, or the market itself
  sub: string;
  market: string;
  score: number;
}

// Towns (and markets by name) matching free text, best first.
export function searchPlaces(idx: PlaceIndex, raw: string, limit = 8): Hit[] {
  const q = norm(ALIASES[norm(raw)] ?? raw);
  if (!q) return [];
  const byId = new Map(idx.markets.map((m) => [m.id, m]));
  const hits = new Map<string, Hit>();
  const consider = (label: string, sub: string, market: string, score: number) => {
    const key = `${label}|${market}`;
    if (!hits.has(key) || hits.get(key)!.score < score) hits.set(key, { label, sub, market, score });
  };
  for (const [name, st, market, pop] of idx.places) {
    const n = norm(`${name} ${st}`);
    const words = norm(name);
    let base = 0;
    if (words.startsWith(q) || n.startsWith(q)) base = 3;
    else if (n.split(" ").some((w) => w.startsWith(q.split(" ")[0])) && n.includes(q)) base = 1.5;
    else if (n.includes(q)) base = 1;
    if (!base) continue;
    const m = byId.get(market)!;
    const mname = m.kind === "rural" ? m.name : m.name.split(",")[0].split("-")[0];
    const sub =
      mname === name
        ? `${KIND_LABEL[m.kind]} · ${fmt(m.pop)} people`
        : m.kind === "rural"
          ? `In ${m.name} (rural) · ${fmt(m.pop)}`
          : `Part of the ${mname} ${m.kind === "metro" ? "metro" : "area"} · ${fmt(m.pop)}`;
    consider(`${name}, ${st}`, sub, market, base + Math.log10(pop) / 10);
  }
  for (const m of idx.markets) {
    const n = norm(m.name);
    if (n.startsWith(q) || n.includes(` ${q}`)) {
      consider(m.name, `${KIND_LABEL[m.kind]} · ${fmt(m.pop)} people`, m.id, 2 + Math.log10(m.pop) / 10);
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
