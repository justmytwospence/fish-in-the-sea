"use client";

import { Fragment, useState } from "react";
import type { Step, StepKind } from "@/lib/model";
import { fmt } from "@/lib/format";

const KIND: Record<StepKind, { tag: string; title: string }> = {
  census: { tag: "Census", title: "Counted directly in Census tables for this area" },
  microdata: { tag: "Census microdata", title: "Rate estimated from Census microdata for this area" },
  survey: { tag: "est.", title: "National survey rate, applied by age and sex" },
  dial: { tag: "your guess", title: "Your own assumption" },
};

const MIN_WIDTH = 0.06;

// Bars shrink fast, so whenever one would drop below MIN_WIDTH of the current
// scale, re-anchor the scale on the previous step and mark the zoom.
function zoomLayout(steps: Step[]) {
  let anchor = steps[0]?.value || 1;
  return steps.map((s, i) => {
    let zoom = 0;
    if (i > 0 && steps[i - 1].value > 0 && s.value / anchor < MIN_WIDTH) {
      zoom = anchor / steps[i - 1].value;
      anchor = steps[i - 1].value;
    }
    return { zoom, width: Math.max(s.value / anchor, 0.004) };
  });
}

export default function Funnel({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const layout = zoomLayout(steps);

  return (
    <section aria-label="The funnel" className="mt-12">
      <ol className="space-y-0">
        {steps.map((s, i) => {
          const { zoom, width } = layout[i];
          const factor = i > 0 && steps[i - 1].value > 0 ? s.value / steps[i - 1].value : null;
          const modeled = s.kind === "survey" || s.kind === "dial";
          const isOpen = open === s.key;
          return (
            <Fragment key={s.key}>
              {zoom > 0 && (
                <li aria-hidden className="flex items-center gap-2 py-1 text-[11px] uppercase tracking-widest text-muted">
                  <span className="h-px flex-1 border-t border-dashed border-rule" />
                  zooming in {zoom >= 10 ? Math.round(zoom) : zoom.toFixed(1)}×
                  <span className="h-px flex-1 border-t border-dashed border-rule" />
                </li>
              )}
              <li>
                {factor !== null && (
                  <div className="py-0.5 pl-1 text-xs tabular-nums text-muted">× {factor >= 0.995 ? "1.00" : factor.toFixed(2)}</div>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.key)}
                  aria-expanded={isOpen}
                  className="group block w-full text-left"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2">
                      <span className={i === 0 ? "font-medium" : ""}>{s.label}</span>
                      <span
                        title={KIND[s.kind].title}
                        className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                          modeled ? "bg-accent-soft text-accent" : "bg-rule/60 text-muted"
                        }`}
                      >
                        {KIND[s.kind].tag}
                      </span>
                    </span>
                    <span className="font-display text-xl tabular-nums">
                      {modeled && s.value < 1e5 ? "≈" : ""}
                      {fmt(s.value)}
                    </span>
                  </div>
                  <div className="mt-1 h-3 w-full overflow-hidden rounded-sm bg-rule/40">
                    <div
                      className={`h-full rounded-sm transition-[width] duration-500 ease-out ${modeled ? "hatch" : "bg-census"}`}
                      style={{ width: `${width * 100}%` }}
                    />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-2 rounded-md border border-rule bg-card p-3 text-sm text-muted">
                    <p className="text-ink">{s.note}</p>
                    {s.moe > 0 && (
                      <p className="mt-2">
                        90% range from sampling error: {fmt(Math.max(0, s.value - s.moe))} to {fmt(s.value + s.moe)}
                        {modeled && " (survey assumptions add uncertainty beyond this)"}.
                      </p>
                    )}
                    <ul className="mt-2 space-y-0.5">
                      {s.sources.map((src) => (
                        <li key={src.url}>
                          <a href={src.url} target="_blank" rel="noreferrer" className="underline">
                            {src.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-muted">
        Tap any step for its source and margin of error. Solid bars are Census counts or Census microdata;
        hatched bars are national survey estimates.
      </p>
    </section>
  );
}
