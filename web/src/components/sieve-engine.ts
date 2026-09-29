// Canvas engine for the sieve: a field of dots (each one standing for `unit`
// people). At each step the field holds everyone who reached that step and
// the ones this step keeps ("keepers") sit together at the top in the accent
// color, so the step's proportion is visible at a glance. Stepping forward
// drops the non-keepers through the bottom, the rest regroup, and the next
// step's keepers light up. When too few dots would be left to read, the
// engine zooms in first: each survivor bursts into finer dots.

export interface SieveStep {
  value: number;
}

const MAX_DOTS = 9000;
const MIN_READABLE = 90; // zoom in when a step would leave fewer dots than this
const ZOOM_TARGET = 700; // aim for about this many dots after a zoom
const UNITS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const DROP_MS = 650;
const FADE_MS = 450; // one dot's color change
const WAVE_MS = 700; // spread of fade start times across the field
const SHADES = 12; // color buckets between neutral and accent
const MOVE_MS = 850;
const ZOOM_MS = 900;

const nice = (x: number) => UNITS.find((u) => u >= x) ?? UNITS[UNITS.length - 1];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dot {
  keep: boolean;
  c: number; // color: 0 = neutral, 1 = accent (tweened)
  c0: number;
  c1: number;
  t0: number; // fade start (ms) and per-dot delay
  dl: number;
  x: number;
  y: number;
  fx: number; // tween from
  fy: number;
  tx: number; // tween to
  ty: number;
}

interface Faller {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  r: number;
}

export interface Plan {
  units: number[]; // people per dot at each step
  zoomAt: boolean[]; // whether moving to step i zooms in
  field: number[]; // dots on screen at step i: everyone who reached it
  keep: number[]; // of those, dots this step keeps
}

export function plan(steps: SieveStep[]): Plan {
  const units: number[] = [];
  const zoomAt: boolean[] = [];
  const field: number[] = [];
  const keep: number[] = [];
  let unit = nice(Math.max(1, steps[0].value / MAX_DOTS));
  steps.forEach((s, i) => {
    const reached = i === 0 ? s.value : steps[i - 1].value;
    let zoom = false;
    if (i > 0 && unit > 1 && s.value / unit < MIN_READABLE) {
      const next = Math.max(nice(s.value / ZOOM_TARGET), nice(reached / MAX_DOTS));
      if (next < unit) {
        unit = next;
        zoom = true;
      }
    }
    const f = Math.round(reached / unit);
    // Anyone left at all gets at least one dot.
    const k = Math.min(f, s.value >= 0.5 ? Math.max(1, Math.round(s.value / unit)) : 0);
    units.push(unit);
    zoomAt.push(zoom);
    field.push(Math.max(f, k));
    keep.push(k);
  });
  return { units, zoomAt, field, keep };
}

type Phase = "zoom" | "drop" | "move" | "fade";

const dot = (x: number, y: number, keep: boolean, c: number): Dot => ({
  keep, c, c0: c, c1: c, t0: 0, dl: 0, x, y, fx: x, fy: y, tx: x, ty: y,
});

export class SieveEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private dots: Dot[] = [];
  private fallers: Faller[] = [];
  private radius = 2;
  private fromR = 2;
  private toR = 2;
  private lastT = 0;
  private raf = 0;
  private anim: { start: number; phase: Phase; done: () => void } | null = null;
  private rand = rng(7);
  private colors = { ink: "#222", accent: "#c8412a", muted: "#888" };
  private shades: { fill: string; alpha: number }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(w: number, h: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = "100%";
    this.canvas.style.height = `${h}px`;
    this.relayout(false);
    this.draw();
  }

  readColors() {
    const cs = getComputedStyle(this.canvas);
    this.colors.ink = cs.getPropertyValue("--census").trim() || this.colors.ink;
    this.colors.accent = cs.getPropertyValue("--accent").trim() || this.colors.accent;
    this.colors.muted = cs.getPropertyValue("--muted").trim() || this.colors.muted;
    // Precompute the color ramp from neutral to accent. The canvas normalizes
    // any CSS color to #rrggbb, which makes it easy to parse.
    const rgb = (color: string) => {
      this.ctx.fillStyle = color;
      const h = String(this.ctx.fillStyle);
      return h.startsWith("#") ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : [128, 128, 128];
    };
    const a = rgb(this.colors.muted);
    const b = rgb(this.colors.accent);
    this.shades = Array.from({ length: SHADES }, (_, i) => {
      const t = i / (SHADES - 1);
      const m = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      return { fill: `rgb(${m[0]},${m[1]},${m[2]})`, alpha: 0.55 + 0.45 * t };
    });
  }

  // Start a color change for one dot.
  private fadeTo(d: Dot, target: number, now: number, delay: number) {
    d.c0 = d.c;
    d.c1 = target;
    d.t0 = now;
    d.dl = delay;
  }

  // Grid positions for n dots, centered, sized to fill the canvas.
  private layout(n: number): { pts: [number, number][]; r: number } {
    const pad = 8;
    const W = this.w - 2 * pad;
    const H = this.h - 2 * pad;
    if (n <= 0) return { pts: [], r: 2 };
    if (W <= 0 || H <= 0) return { pts: Array.from({ length: n }, () => [0, 0]), r: 1 };
    let cell = Math.sqrt((W * H * 0.8) / n);
    cell = Math.min(cell, 26);
    const cols = Math.max(1, Math.floor(W / cell));
    const rows = Math.ceil(n / cols);
    if (rows * cell > H) cell = H / rows;
    const gw = Math.min(cols, n) * cell;
    const gh = rows * cell;
    const x0 = pad + (W - gw) / 2 + cell / 2;
    const y0 = pad + (H - gh) / 2 + cell / 2;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) pts.push([x0 + (i % cols) * cell, y0 + Math.floor(i / cols) * cell]);
    return { pts, r: Math.max(0.7, cell * 0.36) };
  }

  // Flag the first k dots in reading order (the top of the field) as keepers.
  private markKeep(k: number) {
    this.dots.forEach((d, i) => (d.keep = i < k));
  }

  private relayout(tween: boolean) {
    // Keepers first, then reading order, so keepers stay a block at the top
    // and survivors slide rather than shuffle.
    this.dots.sort((a, b) => Number(b.keep) - Number(a.keep) || a.ty - b.ty || a.tx - b.tx);
    const { pts, r } = this.layout(this.dots.length);
    this.fromR = tween ? this.radius : r;
    this.toR = r;
    if (!tween) this.radius = r;
    this.dots.forEach((d, i) => {
      d.fx = tween ? d.x : pts[i][0];
      d.fy = tween ? d.y : pts[i][1];
      d.tx = pts[i][0];
      d.ty = pts[i][1];
      if (!tween) {
        d.x = d.tx;
        d.y = d.ty;
      }
    });
  }

  // Jump straight to a dot count with no animation.
  set(count: number, keep: number, seed = 7) {
    this.cancel();
    this.rand = rng(seed);
    this.fallers = [];
    this.dots = Array.from({ length: count }, (_, i) => dot(0, 0, i < keep, i < keep ? 1 : 0));
    const { pts, r } = this.layout(count);
    this.radius = this.fromR = this.toR = r;
    this.dots.forEach((d, i) => {
      d.x = d.fx = d.tx = pts[i][0];
      d.y = d.fy = d.ty = pts[i][1];
    });
    this.draw();
  }

  cancel() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.anim = null;
  }

  // Step forward: the non-keepers fall through and survivors regroup (all
  // still in color). Then, after zooming to `zoomTo` dots if the unit
  // shrinks, the next step's keepers stay lit as the top block while the rest
  // fade to neutral in a wave rising from the bottom.
  transition(zoomTo: number | null, keep: number, onDone: () => void) {
    this.cancel();
    const run = (phase: Phase, after: () => void) => {
      this.anim = { start: performance.now(), phase, done: after };
      if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    };
    const recolor = () => {
      this.markKeep(keep);
      const now = performance.now();
      const n = this.dots.length;
      this.dots.forEach((d, i) => {
        if (!d.keep) this.fadeTo(d, 0, now, (1 - i / n) * WAVE_MS + this.rand() * 120);
      });
      run("fade", onDone);
    };
    const zoom = () => {
      if (zoomTo === null) return recolor();
      const src = this.dots;
      if (!src.length) {
        this.set(zoomTo, 0);
        return recolor();
      }
      const next: Dot[] = [];
      for (let i = 0; i < zoomTo; i++) {
        const s = src[i % src.length];
        next.push(dot(s.x, s.y, false, 1));
      }
      this.dots = next;
      this.relayout(true);
      run("zoom", recolor);
    };
    const survivors: Dot[] = [];
    let dropped = 0;
    for (const d of this.dots) {
      if (d.keep) {
        survivors.push(d);
        continue;
      }
      dropped++;
      this.fallers.push({ x: d.x, y: d.y, vx: (this.rand() - 0.5) * 40, vy: this.rand() * 120, a: 1, r: this.radius });
    }
    this.dots = survivors;
    if (!dropped) return zoom();
    run("drop", () => {
      this.relayout(true);
      run("move", zoom);
    });
  }

  // Step backward: the people this step removed rise back up from below. When
  // the previous step used a coarser unit, first merge down to `collapseTo`
  // dots at that unit.
  restore(count: number, collapseTo: number | null, keep: number, onDone: () => void) {
    this.cancel();
    this.fallers = [];
    if (collapseTo !== null) this.dots = this.dots.slice(0, Math.max(0, collapseTo));
    for (let i = this.dots.length; i < count; i++) {
      const x = this.rand() * this.w;
      const y = this.h + 10 + this.rand() * this.h * 0.6;
      this.dots.push(dot(x, y, false, 0));
    }
    this.markKeep(keep);
    const now = performance.now();
    const n = this.dots.length;
    this.dots.forEach((d, i) => {
      if (d.keep && d.c1 < 1) this.fadeTo(d, 1, now, (i / n) * WAVE_MS * 0.6);
    });
    this.relayout(true);
    this.anim = { start: now, phase: "move", done: onDone };
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  private loop = () => {
    this.raf = 0;
    const now = performance.now();
    const dt = Math.min(0.05, this.lastT ? (now - this.lastT) / 1000 : 1 / 60);
    this.lastT = now;
    const a = this.anim;
    let busy = this.fallers.length > 0;
    if (a) {
      const dur =
        a.phase === "zoom" ? ZOOM_MS : a.phase === "drop" ? DROP_MS : a.phase === "fade" ? FADE_MS + WAVE_MS + 120 : MOVE_MS;
      const t = Math.min(1, (now - a.start) / dur);
      if (a.phase === "zoom" || a.phase === "move") {
        const e = ease(t);
        this.radius = this.fromR + (this.toR - this.fromR) * e;
        for (const d of this.dots) {
          d.x = d.fx + (d.tx - d.fx) * e;
          d.y = d.fy + (d.ty - d.fy) * e;
        }
      }
      if (t >= 1) {
        this.anim = null;
        a.done();
      }
      busy = true;
    }
    for (const d of this.dots) {
      if (d.c === d.c1) continue;
      const t = (now - d.t0 - d.dl) / FADE_MS;
      if (t <= 0) {
        busy = true;
        continue;
      }
      d.c = t >= 1 ? d.c1 : d.c0 + (d.c1 - d.c0) * ease(t);
      busy = true;
    }
    this.stepFallers(dt);
    this.draw();
    if ((busy || this.anim) && !this.raf) this.raf = requestAnimationFrame(this.loop);
    if (!this.raf) this.lastT = 0;
  };

  private stepFallers(dt: number) {
    const g = 2200;
    this.fallers = this.fallers.filter((f) => {
      f.vy += g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.a -= dt * 1.8;
      return f.a > 0 && f.y < this.h + 20;
    });
  }

  draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    // Falling dots first (neutral: red is reserved for keepers).
    ctx.fillStyle = this.colors.muted;
    for (const f of this.fallers) {
      ctx.globalAlpha = Math.max(0, f.a) * 0.8;
      const r = Math.min(f.r, 6);
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    const r = this.radius;
    const buckets: Dot[][] = Array.from({ length: SHADES }, () => []);
    for (const d of this.dots) buckets[Math.round(d.c * (SHADES - 1))].push(d);
    buckets.forEach((ds, i) => {
      if (!ds.length) return;
      const shade = this.shades[i] ?? { fill: this.colors.muted, alpha: 0.55 };
      ctx.fillStyle = shade.fill;
      ctx.globalAlpha = shade.alpha;
      if (r < 1.6) {
        for (const d of ds) ctx.fillRect(d.x - r, d.y - r, r * 2, r * 2);
        return;
      }
      ctx.beginPath();
      for (const d of ds) {
        ctx.moveTo(d.x + r, d.y);
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.cancel();
  }
}
