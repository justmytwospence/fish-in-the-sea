"use client";

import { useState } from "react";
import type { Query } from "@/lib/model";
import type { WhatIf } from "@/lib/whatif";
import { fmt, pct } from "@/lib/format";

type By = "adjusted" | "raw";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

// Ranked one-notch loosenings of your search, by what they add.
export default function WhatIfs({
  base,
  options,
  onApply,
}: {
  base: { raw: number; adjusted: number };
  options: WhatIf[];
  onApply: (q: Query) => void;
}) {
  const [by, setBy] = useState<By>("adjusted");
  const gain = (o: WhatIf) => (by === "raw" ? o.dRaw : o.dAdjusted);
  const ranked = [...options].sort((a, b) => gain(b) - gain(a));
  const max = Math.max(1, ...ranked.map((o) => Math.abs(gain(o))));

  return (
    <section aria-label="What would help" className="mt-16 border-t border-rule pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Loosening up</p>
      <h2 className="mt-3 font-display text-3xl tracking-tight">What would help most?</h2>
      <p className="mt-3 max-w-xl text-muted">
        Every one-notch change to your search, ranked by how many people it adds. Tap one to try it.
      </p>

      <div role="radiogroup" aria-label="Rank by" className="mt-6 inline-flex rounded-full border border-rule p-1">
        {(
          [
            ["adjusted", "Adjusted pool"],
            ["raw", "Raw pool"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="radio"
            aria-checked={by === k}
            onClick={() => setBy(k)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${by === k ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ol className="mt-5 divide-y divide-rule/60">
        {ranked.map((o) => {
          const g = gain(o);
          const baseV = by === "raw" ? base.raw : base.adjusted;
          return (
            <li key={o.key}>
              <button type="button" onClick={() => onApply(o.query)} className="group block w-full py-3 text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="group-hover:underline">{o.label}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="font-display text-xl">{signed(g)}</span>
                    {baseV > 0 && <span className="ml-1 text-xs text-muted">({pct(g / baseV)})</span>}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-[4px] bg-rule/40">
                    <div className="h-full rounded-[4px] bg-accent" style={{ width: `${(Math.max(0, g) / max) * 100}%` }} />
                  </div>
                  <span className="w-44 shrink-0 text-right text-xs tabular-nums text-muted">
                    {by === "raw" ? `adjusted ${signed(o.dAdjusted)}` : `raw ${signed(o.dRaw)}`}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 max-w-xl text-xs text-muted">
        Raw is everyone who makes it through the sieve; adjusted accounts for competition (see above). Age options
        widen your range by one year at one end. Loosening a filter can lower the adjusted gain relative to the raw one when the
        people it lets in face more competition.
      </p>
    </section>
  );
}
