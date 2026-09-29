"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Step } from "@/lib/model";
import { fmt } from "@/lib/format";
import { plan, SieveEngine } from "./sieve-engine";

const DWELL_MS = 900;

// Remount (via `key`) whenever the funnel changes; that rewinds everything.
export default function Sieve({ steps }: { steps: Step[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<SieveEngine | null>(null);
  const p = useMemo(() => plan(steps), [steps]);
  const last = steps.length - 1;
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const planRef = useRef(p);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const e = new SieveEngine(canvas);
    engine.current = e;
    e.readColors();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const counts = planRef.current.counts;
    // With reduced motion, wait for a click instead of autoplaying.
    e.set(counts[0]);
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
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        if (!reduced) setPlaying(true);
      },
      { threshold: 0.35 },
    );
    io.observe(wrap);
    return () => {
      ro.disconnect();
      io.disconnect();
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
      setZoomed(null);
      e.highlight = i === last;
      e.set(p.counts[i]);
      setCur(i);
    },
    [p, last],
  );

  // Advance one step at a time while playing. The label switches to the new
  // step as its dots start falling.
  useEffect(() => {
    const e = engine.current;
    if (!playing || busy || !e || cur >= last) return;
    const next = cur + 1;
    const timer = setTimeout(
      () => {
        const zoomTo = p.zoomAt[next] ? Math.round(steps[cur].value / p.units[next]) : null;
        setZoomed(zoomTo !== null ? p.units[cur] / p.units[next] : null);
        setBusy(true);
        setCur(next);
        e.transition(p.counts[next], zoomTo, () => {
          setBusy(false);
          setZoomed(null);
          if (next >= last) {
            setPlaying(false);
            e.highlight = true;
            e.draw();
          }
        });
      },
      cur === 0 ? 400 : DWELL_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, busy, cur, last, p, steps]);

  const s = steps[cur];
  const prev = cur > 0 ? steps[cur - 1] : null;
  const modeled = s.kind === "survey" || s.kind === "dial";
  const unit = zoomed ? p.units[Math.max(0, cur - 1)] : p.units[cur];

  return (
    <section aria-label="The sieve" className="mt-12">
      <div className="rounded-xl border border-rule bg-card">
        <div className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-5">
          <div aria-live="polite">
            <p className="text-sm text-muted">
              Step {cur + 1} of {steps.length}
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
            {zoomed && <p className="mt-1 font-semibold uppercase tracking-widest text-accent">zooming in {Math.round(zoomed)}×</p>}
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
                jump(0);
                setPlaying(true);
              } else setPlaying(!playing);
            }}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-paper"
          >
            {playing ? "Pause" : cur >= last ? "Replay" : cur === 0 ? "Start sifting" : "Resume"}
          </button>
          <button type="button" onClick={() => jump(last)} className="rounded-full border border-rule px-3 py-1.5 text-sm hover:border-muted">
            Skip to the end
          </button>
          <ol className="ml-auto flex max-w-full gap-1 overflow-x-auto py-1" aria-label="Steps">
            {steps.map((st, i) => (
              <li key={st.key}>
                <button
                  type="button"
                  title={st.label}
                  aria-label={`Go to step ${i + 1}: ${st.label}`}
                  aria-current={i === cur ? "step" : undefined}
                  onClick={() => jump(i)}
                  className={`block h-2.5 w-2.5 rounded-full transition-colors ${
                    i === cur ? "bg-accent" : i < cur ? "bg-muted" : "bg-rule"
                  }`}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
