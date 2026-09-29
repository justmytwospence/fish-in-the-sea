import type { Sex } from "./assumptions";
import type { Query } from "./model";

export const DEFAULT_MARKET = "new-york-newark-jersey-city-ny-nj-35620";

export const DEFAULT_QUERY: Query = {
  market: DEFAULT_MARKET,
  me: { sex: 1, age: 36 },
  seek: { sex: 2, lo: 30, hi: 39 },
  filters: { neverMarried: false, edu: 0, noKids: false, notWithParents: false, incomeMin: 0, nonSmoker: false, bmiMax: 0 },
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
  const me = get(p, "me")?.match(/^([mf])(\d{1,2})$/);
  if (me) q.me = { sex: sexOf(me[1], 1), age: clampAge(+me[2]) };
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
    height: f.has("hle") ? "le" : f.has("hge") ? "ge" : f.has("hany") ? "any" : undefined,
    notWithParents: f.has("nopar"),
    incomeMin: f.has("inc120") ? 3 : f.has("inc60") ? 2 : f.has("inc25") ? 1 : 0,
    nonSmoker: f.has("nosmoke"),
    bmiMax: f.has("bmi25") ? 25 : f.has("bmi30") ? 30 : 0,
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
    const m2 = part.match(/^([eikph])(\d{1,3})$/);
    if (!m2) continue;
    const v = +m2[2];
    if (m2[1] === "e" && v <= 2) q.you.edu = v;
    if (m2[1] === "i" && v <= 999) q.you.income = v;
    if (m2[1] === "k" && v <= 1) q.you.kids = v;
    if (m2[1] === "p" && v <= 1) q.you.prev = v;
    if (m2[1] === "h" && v >= 54 && v <= 84) q.you.height = v;
  }
  return q;
}

export function serializeQuery(q: Query): string {
  const s = (x: Sex) => (x === 1 ? "m" : "f");
  const p = new URLSearchParams();
  p.set("in", q.market);
  p.set("me", `${s(q.me.sex)}${q.me.age}`);
  p.set("seek", `${s(q.seek.sex)}${q.seek.lo}-${q.seek.hi}`);
  const f = [
    q.filters.neverMarried && "nm",
    q.filters.edu === 1 && "ba",
    q.filters.edu === 2 && "grad",
    q.filters.noKids && "nokids",
    q.filters.height && `h${q.filters.height}`,
    q.filters.notWithParents && "nopar",
    q.filters.incomeMin > 0 && `inc${[0, 25, 60, 120][q.filters.incomeMin]}`,
    q.filters.nonSmoker && "nosmoke",
    q.filters.bmiMax > 0 && `bmi${q.filters.bmiMax}`,
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
  ].filter(Boolean);
  if (you.length) p.set("you", you.join(","));
  return p.toString().replace(/%2C/g, ",");
}
