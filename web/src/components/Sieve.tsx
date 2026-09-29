"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Step } from "@/lib/model";
import { fmt, pct } from "@/lib/format";
import { plan, SieveEngine } from "./sieve-engine";

const DWELL_MS = 900;

// Remount (via `key`) whenever the funnel changes; that rewinds everything.
export default function Sieve({ steps, thin = false }: { steps: Step[]; thin?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<SieveEngine | null>(null);
  const p = useMemo(() => plan(steps), [steps]);
  const last = steps.length - 1;
  // The sieve opens on the second step (everyone, with the sex you're after
  // lit), since "everyone" alone would be one undivided block. The total
  // population is still the field and still listed in the steps below.
  const first = Math.min(1, last);
  const [cur, setCur] = useState(first);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const planRef = useRef(p);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const e = new SieveEngine(canvas);
    engine.current = e;
    e.readColors();
    // Start still on step one (everyone, all in color).
    // Nothing moves until you step or press play.
    const start = Math.min(1, planRef.current.field.length - 1);
    e.set(planRef.current.field[start], planRef.current.keep[start]);
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = Math.round(Math.min(460, Math.max(300, w * (w < 640 ? 0.95 : 0.56))));
      e.resize(w, h);
    });
    ro.observe(wrap);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => {
      e.readColors();
      e.draw();
    };
    mq.addEventListener("change", recolor);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", recolor);
      e.destroy();
    };
  }, []);

  const jump = useCallback(
    (i: number) => {
      const e = engine.current;
      if (!e) return;
      setPlaying(false);
      setBusy(false);
      e.set(p.field[i], p.keep[i]);
      setCur(i);
    },
    [p],
  );

  // One animated step forward from `from`. The label switches to the new
  // step as its dots start falling.
  const forward = useCallback(
    (from: number) => {
      const e = engine.current;
      if (!e || from >= last) return;
      const next = from + 1;
      setBusy(true);
      setCur(next);
      e.transition(p.keep[next], () => {
        setBusy(false);
        if (next >= last) setPlaying(false);
      });
    },
    [p, last],
  );

  // One animated step back: the people removed rise back into the field.
  const back = useCallback(
    (from: number) => {
      const e = engine.current;
      if (!e || from <= first) return;
      const prev = from - 1;
      // Everyone this step had becomes a keeper again and the people the
      // previous step dropped rise back in.
      setBusy(true);
      setCur(prev);
      e.restore(p.field[prev], p.keep[prev], () => setBusy(false));
    },
    [p, first],
  );

  // Manual navigation pauses autoplay. Adjacent steps animate; mid-animation
  // or longer hops jump straight there.
  const goTo = useCallback(
    (i: number) => {
      const target = Math.max(first, Math.min(last, i));
      setPlaying(false);
      if (!busy && target === cur + 1) forward(cur);
      else if (!busy && target === cur - 1) back(cur);
      else if (target !== cur || busy) jump(target);
    },
    [busy, cur, first, last, forward, back, jump],
  );

  // Arrow keys step through the sieve while it's on screen.
  useEffect(() => {
    const wrap = wrapRef.current!;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tag = (ev.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const r = wrap.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (ev.key === "ArrowRight") goTo(cur + 1);
      else if (ev.key === "ArrowLeft") goTo(cur - 1);
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, goTo]);

  // Autoplay: advance after a pause on each step.
  useEffect(() => {
    if (!playing || busy || cur >= last) return;
    const timer = setTimeout(() => forward(cur), cur === first ? 400 : DWELL_MS);
    return () => clearTimeout(timer);
  }, [playing, busy, cur, first, last, forward]);

  const s = steps[cur];
  const prev = cur > 0 ? steps[cur - 1] : null;
  // This step's keepers as a share of everyone who reached it.
  const share = prev && prev.value > 0 ? s.value / prev.value : 1;
  const modeled = s.kind === "survey" || s.kind === "dial";
  const unit = p.units[cur];

  return (
    <section aria-label="The sieve" className="mt-12">
      <div className="rounded-xl border border-rule bg-card">
        <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-5">
          <div aria-live="polite">
            <p className="text-sm text-muted">
              Step {cur - first + 1} of {steps.length - first}
              {thin && s.kind === "microdata" && (
                <span
                  title="Few survey records behind this step here, so the estimate leans on regional rates. Treat it as rough."
                  className="ml-2 rounded border border-accent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent"
                >
                  thin data
                </span>
              )}
              {modeled && (
                <span className="ml-2 rounded bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">
                  est.
                </span>
              )}
            </p>
            <p className="font-display text-2xl leading-tight sm:text-3xl">{s.label}</p>
            <p className="font-display text-4xl tabular-nums tracking-tight sm:text-5xl">
              {modeled && s.value < 1e5 ? "≈" : ""}
              {fmt(s.value)}
            </p>
            <p className={`h-5 text-sm tabular-nums text-accent ${prev ? "" : "invisible"}`}>
              {prev && prev.value - s.value >= 0.5 ? `−${fmt(prev.value - s.value)} ${s.dropped}` : "nobody lost here"}
            </p>
          </div>
          <div className="shrink-0 text-right text-xs text-muted">
            <p>
              1 dot = {fmt(unit)} {unit === 1 ? "person" : "people"}
            </p>
            <p className="mt-1 flex items-center justify-end gap-1.5">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-accent" />
              <span>
                {prev ? (
                  <>
                    <span className="font-medium text-ink">{fmt(s.value)}</span> kept ({pct(share, share < 0.1 ? 1 : 0)} of{" "}
                    {fmt(prev.value)})
                  </>
                ) : (
                  "everyone, to start"
                )}
              </span>
            </p>
          </div>
        </div>
        <div ref={wrapRef} className="relative mt-2 w-full">
          <canvas ref={canvasRef} className="block max-w-full" role="img" aria-label={`${fmt(s.value)} people left after: ${s.label}`} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => {
              if (cur >= last) {
                jump(first);
                setPlaying(true);
              } else setPlaying(!playing);
            }}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper"
          >
            {playing ? "Pause" : cur >= last ? "Replay" : "Play all"}
          </button>
          <div className="flex overflow-hidden rounded-full border border-rule text-sm">
            <button
              type="button"
              onClick={() => goTo(cur - 1)}
              disabled={cur <= first}
              aria-label="Previous step"
              className="px-3 py-1.5 hover:bg-rule/40 disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => goTo(cur + 1)}
              disabled={cur >= last}
              aria-label="Next step"
              className="border-l border-rule px-3 py-1.5 hover:bg-rule/40 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
          <button type="button" onClick={() => goTo(last)} className="rounded-full border border-rule px-3 py-1.5 text-sm hover:border-muted">
            Skip to the end
          </button>
          <ol className="ml-auto flex max-w-full gap-1 overflow-x-auto py-1" aria-label="Steps">
            {steps.slice(first).map((st, k) => {
              const i = k + first;
              return (
                <li key={st.key}>
                  <button
                    type="button"
                    title={st.label}
                    aria-label={`Go to step ${k + 1}: ${st.label}`}
                    aria-current={i === cur ? "step" : undefined}
                    onClick={() => goTo(i)}
                    className={`block h-3 w-3 rounded-full transition-colors hover:ring-2 hover:ring-accent-soft ${
                      i === cur ? "bg-accent" : i < cur ? "bg-muted" : "bg-rule"
                    }`}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
