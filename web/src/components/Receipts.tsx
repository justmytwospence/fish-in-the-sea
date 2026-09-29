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

// The receipts: every step of the sieve as a table, with sources and margins.
export default function Receipts({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <details className="mt-4">
      <summary className="cursor-pointer select-none text-sm text-muted hover:text-ink">
        Show the receipts: every step, its source and margin of error
      </summary>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 font-medium">Step</th>
            <th className="py-2 text-right font-medium">Kept</th>
            <th className="py-2 text-right font-medium">Left</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const factor = i > 0 && steps[i - 1].value > 0 ? s.value / steps[i - 1].value : null;
            const modeled = s.kind === "survey" || s.kind === "dial";
            const isOpen = open === s.key;
            return (
              <Fragment key={s.key}>
                <tr
                  className="cursor-pointer border-b border-rule/60 hover:bg-rule/20"
                  onClick={() => setOpen(isOpen ? null : s.key)}
                  aria-expanded={isOpen}
                >
                  <td className="py-2 pr-2">
                    {s.label}{" "}
                    <span
                      title={KIND[s.kind].title}
                      className={`ml-1 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                        modeled ? "bg-accent-soft text-accent" : "bg-rule/60 text-muted"
                      }`}
                    >
                      {KIND[s.kind].tag}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">
                    {factor === null ? "" : `${Math.round(Math.min(1, factor) * 100)}%`}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{fmt(s.value)}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-muted">
                      <p className="text-ink">{s.note}</p>
                      {s.moe > 0 && (
                        <p className="mt-1">
                          90% range from sampling error: {fmt(Math.max(0, s.value - s.moe))} to {fmt(s.value + s.moe)}
                          {modeled && " (the survey assumption itself adds more uncertainty)"}.
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
    </details>
  );
}
