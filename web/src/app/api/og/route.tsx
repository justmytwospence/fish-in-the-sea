import { ImageResponse } from "next/og";
import { compute, noun } from "@/lib/model";
import { fmt, shortCity } from "@/lib/format";
import { DEFAULT_MARKET, parseQuery } from "@/lib/query";
import { loadChoice, loadGlobal, loadShard } from "@/lib/server-data";

const PAPER = "#f5f0e6";
const INK = "#1d1a16";
const MUTED = "#6d665b";
const ACCENT = "#c8412a";

export async function GET(req: Request) {
  const query = parseQuery(new URL(req.url).searchParams);
  const shard = (await loadShard(query.market)) ?? (await loadShard(DEFAULT_MARKET));
  const r = compute(shard!, await loadGlobal(), query, await loadChoice(), false);
  const city = shortCity(r.market.name);
  const steps = r.steps.slice(2);
  const max = steps[0]?.value || 1;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 620 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, color: MUTED }}>THE DENOMINATOR</div>
          <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1, marginTop: 40, color: ACCENT }}>
            {fmt(r.final.value)}
          </div>
          <div style={{ fontSize: 36, marginTop: 24, lineHeight: 1.25 }}>
            {`${noun(query.seek.sex)} ${query.seek.lo}–${query.seek.hi} in ${city} who might date a ${query.me.age}-year-old ${noun(query.me.sex, false)}.`}
          </div>
          <div style={{ fontSize: 26, marginTop: "auto", color: MUTED }}>
            {`≈${fmt(r.competition?.adjusted ?? 0)} after competition · Census ACS 2020–24`}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 48, flex: 1, gap: 14 }}>
          {steps.map((s) => (
            <div key={s.key} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: MUTED }}>
                <span>{s.label.replace("…", "")}</span>
                <span>{fmt(s.value)}</span>
              </div>
              <div style={{ display: "flex", height: 14, background: "#e6ddcd", marginTop: 4 }}>
                <div
                  style={{
                    width: `${Math.max(0.8, (s.value / max) * 100)}%`,
                    background: s.kind === "survey" || s.kind === "dial" ? ACCENT : INK,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    },
  );
}
