"use client";

import { Fragment, useState } from "react";
import type { Step, StepKind } from "@/lib/model";
import { fmt } from "@/lib/format";

const KIND: Record<StepKind, { tag: string; title: string }> = {
  census: { tag: "Census", title: "Counted directly in Census tables for this area" },
  microdata: { tag: "microdata", title: "Rate estimated from Census microdata for this area" },
  survey: { tag: "est.", title: "National survey rate, applied by age and sex" },
  dial: { tag: "your guess", title: "Your own assumption" },
};

// Every step of the sieve, each with its own small expander for the source,
// method and margin of error.
export default function Receipts({ steps, thin = false, effectiveSupport = 0 }: { steps: Step[]; thin?: boolean; effectiveSupport?: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  return (
    <section aria-label="Every step" className="mt-6">
      {thin && (
        <p className="mt-3 rounded-md border border-accent/40 bg-accent-soft/40 p-3 text-sm">
          Approximate effective microdata support: {Math.round(effectiveSupport)} (not a local respondent count). Sparse areas borrow regional information. Both the magnitude and direction can be uncertain.
        </p>
      )}
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 font-medium">Every step</th>
            <th className="py-2 pl-3 text-right font-medium">Kept</th>
            <th className="py-2 pl-3 text-right font-medium">Left</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const factor = i > 0 && steps[i - 1].value > 0 ? s.value / steps[i - 1].value : null;
            const modeled = s.kind === "survey" || s.kind === "dial";
            const isOpen = open.has(s.key);
            return (
              <Fragment key={s.key}>
                <tr className={`border-b border-rule/60 ${isOpen ? "" : "hover:bg-rule/20"}`}>
                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={() => toggle(s.key)}
                      aria-expanded={isOpen}
                      aria-controls={`step-${s.key}`}
                      className="group inline-flex items-baseline gap-1.5 text-left"
                    >
                      <span
                        aria-hidden
                        className={`inline-block w-3 text-[10px] text-muted transition-transform group-hover:text-ink ${isOpen ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                      <span className="group-hover:underline">{s.label}</span>
                    </button>{" "}
                    <span
                      title={KIND[s.kind].title}
                      className={`ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                        modeled ? "bg-accent-soft text-accent" : "bg-rule/60 text-muted"
                      }`}
                    >
                      {KIND[s.kind].tag}
                    </span>
                    {thin && s.kind === "microdata" && (
                      <span
                        title="Low effective weighted support: estimates borrow regional information. This is not a count of local respondents."
                        className="ml-1 rounded border border-accent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent"
                      >
                        thin data
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-muted">
                    {factor === null ? "" : `${Math.round(Math.min(1, factor) * 100)}%`}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right font-medium tabular-nums">{fmt(s.value)}</td>
                </tr>
                {isOpen && (
                  <tr id={`step-${s.key}`} className="border-b border-rule/60 bg-rule/10">
                    <td colSpan={3} className="py-3 pl-6 pr-2 text-muted">
                      <p className="text-ink">{s.note}</p>
                      {s.moe > 0 && s.kind === 'census' && (
                        <p className="mt-1">
                          Approximate ACS-only sampling range (excludes model and geographic allocation uncertainty): {fmt(Math.max(0, s.value - s.moe))} to {fmt(s.value + s.moe)}
                          .
                        </p>
                      )}
                      <ul className="mt-1">
                        {s.sources.map((src) => (
                          <li key={src.url}>
                            <a href={src.url} target="_blank" rel="noreferrer" className="underline">
                              {src.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
