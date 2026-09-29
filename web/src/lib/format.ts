export function fmt(n: number): string {
  if (!isFinite(n)) return "∞";
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1000) return Math.round(n).toLocaleString("en-US");
  if (n >= 10) return String(Math.round(n));
  if (n >= 1) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2);
}

// Round to two significant figures for "about N" style copy.
export function approx(n: number): string {
  if (n < 10) return fmt(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return fmt(Math.round(n / mag) * mag);
}

export function pct(x: number, digits = 0): string {
  const v = x * 100;
  if (v > 0 && v < 1 && digits === 0) return `${v.toFixed(1)}%`;
  return `${v.toFixed(digits)}%`;
}

// "Austin-Round Rock-San Marcos, TX" -> "Austin". Metro titles join principal
// cities with hyphens, so keep the few cities whose own names contain one.
const HYPHENATED = ["Winston-Salem", "Wilkes-Barre", "Sedro-Woolley"];
export function shortCity(market: string): string {
  const first = market.split(",")[0];
  return HYPHENATED.find((h) => first.startsWith(h)) ?? first.split("-")[0];
}
