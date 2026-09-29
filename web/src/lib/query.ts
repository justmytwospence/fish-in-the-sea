import { HEIGHT_MAX, HEIGHT_MIN, type Sex } from "./assumptions";
import type { Query } from "./model";

export const DEFAULT_MARKET = "new-york-newark-jersey-city-ny-nj-35620";

export const DEFAULT_QUERY: Query = {
  market: DEFAULT_MARKET,
  me: { sex: 1, age: 36 },
  seek: { sex: 2, lo: 30, hi: 39 },
  filters: {
    neverMarried: false,
    edu: 0,
    noKids: false,
    notWithParents: false,
    incomeMin: 0,
    nonSmoker: false,
    bmiMax: 0,
    races: [],
    religions: [],
    politics: [],
    wantKids: [],
  },
  model: { separated: false, orientation: true, relationship: true, looking: false, spark: 0 },
  you: {},
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(p: Params, k: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(k) ?? undefined;
  const v = p[k];
  return Array.isArray(v) ? v[0] : v;
}

const clampAge = (n: number) => Math.max(18, Math.min(90, Math.round(n)));
const sexOf = (c: string | undefined, d: Sex): Sex => (c === "m" ? 1 : c === "f" ? 2 : d);

// ?in=<market>&me=m36&seek=f30-39&f=nm,ba,nokids&m=sep,-orient&spark=5
export function parseQuery(p: Params): Query {
  const q = structuredClone(DEFAULT_QUERY);
  const market = get(p, "in");
  if (market && /^[a-z0-9-]+$/.test(market)) q.market = market;
  const me = get(p, "me")?.match(/^([mf])(\d{1,2})?$/);
  if (me) q.me = { sex: sexOf(me[1], 1), age: me[2] ? clampAge(+me[2]) : undefined };
  const seek = get(p, "seek")?.match(/^([mf])(\d{1,2})-(\d{1,2})$/);
  if (seek) {
    const [a, b] = [clampAge(+seek[2]), clampAge(+seek[3])];
    q.seek = { sex: sexOf(seek[1], 2), lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  const f = new Set((get(p, "f") ?? "").split(",").filter(Boolean));
  q.filters = {
    neverMarried: f.has("nm"),
    edu: f.has("grad") ? 2 : f.has("ba") ? 1 : 0,
    noKids: f.has("nokids"),
    height: f.has("hany") ? "any" : undefined,
    notWithParents: f.has("nopar"),
    incomeMin: Math.min(250, Math.round(Number([...f].find((x) => /^inc\d+$/.test(x))?.slice(3) ?? 0) / 5) * 5),
    nonSmoker: f.has("nosmoke"),
    bmiMax: ((b) => (b >= 20 && b <= 40 ? b : 0))(Number([...f].find((x) => /^bmi\d+$/.test(x))?.slice(3) ?? 0)),
    races: [0, 1, 2, 3, 4].filter((r) => f.has(`race${r}`)),
    religions: [0, 1, 2, 3, 4, 5].filter((r) => f.has(`rel${r}`)),
    politics: [0, 1, 2].filter((r) => f.has(`pol${r}`)),
    wantKids: [0, 1, 2].filter((r) => f.has(`kw${r}`)),
  };
  const m = new Set((get(p, "m") ?? "").split(",").filter(Boolean));
  q.model = {
    separated: m.has("sep"),
    orientation: !m.has("-orient"),
    relationship: !m.has("-rel"),
    looking: m.has("look"),
    spark: Math.max(0, Math.min(100, Number(get(p, "spark") ?? 0) || 0)) / 100,
  };
  // you=e1,i85,k0,p0,h70: education, income ($k), kids, previously married, height
  q.you = {};
  for (const part of (get(p, "you") ?? "").split(",")) {
    const m2 = part.match(/^([eikphrgv])(\d{1,3})$/);
    if (!m2) continue;
    const v = +m2[2];
    if (m2[1] === "e" && v <= 2) q.you.edu = v;
    if (m2[1] === "i" && v <= 999) q.you.income = v;
    if (m2[1] === "k" && v <= 1) q.you.kids = v;
    if (m2[1] === "p" && v <= 1) q.you.prev = v;
    if (m2[1] === "h" && v >= 54 && v <= 84) q.you.height = v;
    if (m2[1] === "r" && v <= 4) q.you.race = v;
    if (m2[1] === "g" && v <= 5) q.you.religion = v;
    if (m2[1] === "v" && v <= 2) q.you.politics = v;
  }
  // Height range: h60-70 (inches), or the old relative rules hle/hge.
  const hr = [...f].map((x) => x.match(/^h(\d{2})-(\d{2})$/)).find(Boolean);
  const inch = (n: number) => Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, n));
  if (hr) q.filters.height = { lo: inch(Math.min(+hr[1], +hr[2])), hi: inch(Math.max(+hr[1], +hr[2])) };
  else if ((f.has("hle") || f.has("hge")) && q.you.height !== undefined)
    q.filters.height = f.has("hle") ? { lo: HEIGHT_MIN, hi: q.you.height } : { lo: q.you.height, hi: HEIGHT_MAX };
  return q;
}

export function serializeQuery(q: Query): string {
  const s = (x: Sex) => (x === 1 ? "m" : "f");
  const p = new URLSearchParams();
  p.set("in", q.market);
  p.set("me", `${s(q.me.sex)}${q.me.age ?? ""}`);
  p.set("seek", `${s(q.seek.sex)}${q.seek.lo}-${q.seek.hi}`);
  const f = [
    q.filters.neverMarried && "nm",
    q.filters.edu === 1 && "ba",
    q.filters.edu === 2 && "grad",
    q.filters.noKids && "nokids",
    q.filters.height && (q.filters.height === "any" ? "hany" : `h${q.filters.height.lo}-${q.filters.height.hi}`),
    q.filters.notWithParents && "nopar",
    q.filters.incomeMin > 0 && `inc${q.filters.incomeMin}`,
    q.filters.nonSmoker && "nosmoke",
    q.filters.bmiMax > 0 && `bmi${q.filters.bmiMax}`,
    ...[...q.filters.races].sort().map((r) => `race${r}`),
    ...[...q.filters.religions].sort().map((r) => `rel${r}`),
    ...[...q.filters.politics].sort().map((r) => `pol${r}`),
    ...[...q.filters.wantKids].sort().map((r) => `kw${r}`),
  ].filter(Boolean);
  if (f.length) p.set("f", f.join(","));
  const m = [
    q.model.separated && "sep",
    !q.model.orientation && "-orient",
    !q.model.relationship && "-rel",
    q.model.looking && "look",
  ].filter(Boolean);
  if (m.length) p.set("m", m.join(","));
  if (q.model.spark > 0) p.set("spark", String(Math.round(q.model.spark * 100)));
  const y = q.you;
  const you = [
    y.edu !== undefined && `e${y.edu}`,
    y.income !== undefined && `i${y.income}`,
    y.kids !== undefined && `k${y.kids}`,
    y.prev !== undefined && `p${y.prev}`,
    y.height !== undefined && `h${y.height}`,
    y.race !== undefined && `r${y.race}`,
    y.religion !== undefined && `g${y.religion}`,
    y.politics !== undefined && `v${y.politics}`,
  ].filter(Boolean);
  if (you.length) p.set("you", you.join(","));
  return p.toString().replace(/%2C/g, ",");
}
