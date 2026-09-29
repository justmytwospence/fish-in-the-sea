// Canvas engine for the sieve: a field of dots (each one standing for `unit`
// people) that loses the people filtered out at each step. Dropped dots fall
// through the bottom; survivors regroup. When too few dots are left to read,
// the engine zooms in: each survivor bursts into finer dots at a smaller unit.

export interface SieveStep {
  value: number;
}

const MAX_DOTS = 9000;
const MIN_READABLE = 90; // zoom in when a step would leave fewer dots than this
const ZOOM_TARGET = 700; // aim for about this many dots after a zoom
const UNITS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const DROP_MS = 650;
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
  zoomAt: boolean[]; // whether step i starts with a zoom
  counts: number[]; // dots at each step
}

export function plan(steps: SieveStep[]): Plan {
  const units: number[] = [];
  const zoomAt: boolean[] = [];
  const counts: number[] = [];
  let unit = nice(Math.max(1, steps[0].value / MAX_DOTS));
  steps.forEach((s, i) => {
    let zoom = false;
    if (i > 0 && unit > 1 && s.value / unit < MIN_READABLE) {
      const prev = steps[i - 1].value;
      const next = Math.max(nice(s.value / ZOOM_TARGET), nice(prev / MAX_DOTS));
      if (next < unit) {
        unit = next;
        zoom = true;
      }
    }
    units.push(unit);
    zoomAt.push(zoom);
    counts.push(Math.round(s.value / unit));
  });
  return { units, zoomAt, counts };
}

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
  private anim: { start: number; phase: "zoom" | "drop" | "move"; done: () => void } | null = null;
  private rand = rng(7);
  private colors = { ink: "#222", accent: "#c8412a", final: "#c8412a" };
  highlight = false;

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
    this.colors.final = this.colors.accent;
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

  private relayout(tween: boolean) {
    // Keep reading order stable so survivors slide rather than shuffle.
    this.dots.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
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
  set(count: number, seed = 7) {
    this.cancel();
    this.rand = rng(seed);
    this.fallers = [];
    this.dots = Array.from({ length: count }, () => ({ x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0 }));
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

  // Animate to a new dot count, optionally zooming to `zoomTo` dots first.
  transition(count: number, zoomTo: number | null, onDone: () => void) {
    this.cancel();
    const run = (phase: "zoom" | "drop" | "move", after: () => void) => {
      this.anim = { start: performance.now(), phase, done: after };
      if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    };
    const drop = () => {
      const n = this.dots.length;
      const k = Math.max(0, Math.min(n, count));
      if (k < n) {
        // Pick who falls through, at random.
        const idx = this.dots.map((_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(this.rand() * (i + 1));
          [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        const gone = new Set(idx.slice(0, n - k));
        const keep: Dot[] = [];
        this.dots.forEach((d, i) => {
          if (gone.has(i))
            this.fallers.push({
              x: d.x,
              y: d.y,
              vx: (this.rand() - 0.5) * 40,
              vy: this.rand() * 120,
              a: 1,
              r: this.radius,
            });
          else keep.push(d);
        });
        this.dots = keep;
      }
      run("drop", () => {
        this.relayout(true);
        run("move", onDone);
      });
    };
    if (zoomTo !== null && this.dots.length > 0) {
      // Each survivor bursts into finer dots.
      const src = this.dots;
      const next: Dot[] = [];
      for (let i = 0; i < zoomTo; i++) {
        const s = src[i % src.length];
        next.push({ x: s.x, y: s.y, fx: s.x, fy: s.y, tx: s.x, ty: s.y });
      }
      this.dots = next;
      this.relayout(true);
      run("zoom", drop);
    } else if (zoomTo !== null) {
      this.set(zoomTo);
      drop();
    } else drop();
  }

  // Step backward: the people this step removed rise back up from below. When
  // the previous step used a coarser unit, first merge down to `collapseTo`
  // dots at that unit.
  restore(count: number, collapseTo: number | null, onDone: () => void) {
    this.cancel();
    this.fallers = [];
    if (collapseTo !== null) this.dots = this.dots.slice(0, Math.max(0, collapseTo));
    for (let i = this.dots.length; i < count; i++) {
      const x = this.rand() * this.w;
      const y = this.h + 10 + this.rand() * this.h * 0.6;
      this.dots.push({ x, y, fx: x, fy: y, tx: x, ty: y });
    }
    this.relayout(true);
    this.anim = { start: performance.now(), phase: "move", done: onDone };
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
      const dur = a.phase === "zoom" ? ZOOM_MS : a.phase === "drop" ? DROP_MS : MOVE_MS;
      const t = Math.min(1, (now - a.start) / dur);
      if (a.phase !== "drop") {
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
    // Falling dots first, so survivors stay crisp on top.
    ctx.fillStyle = this.colors.accent;
    for (const f of this.fallers) {
      ctx.globalAlpha = Math.max(0, f.a) * 0.8;
      const r = Math.min(f.r, 6);
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.highlight ? this.colors.final : this.colors.ink;
    const r = this.radius;
    if (r < 1.6) {
      for (const d of this.dots) ctx.fillRect(d.x - r, d.y - r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      for (const d of this.dots) {
        ctx.moveTo(d.x + r, d.y);
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  destroy() {
    this.cancel();
  }
}
