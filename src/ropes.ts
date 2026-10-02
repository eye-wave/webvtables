export type Pt = [x: number, y: number];

const SEG = 10;
const STEP = 1 / 60;
const GRAV = 0.35;
const DAMP = 0.97;
const ITER = 8;
const SLEEP = 0.02;

type Rope = { p: Float64Array; q: Float64Array; awake: boolean };

function sim({ p, q }: Rope): boolean {
  const e = 2 * SEG;

  const rest = (Math.hypot(p[e] - p[0], p[e + 1] - p[1]) * 1.03 + 12) / SEG;

  for (let i = 2; i < e; i += 2) {
    const x = p[i],
      y = p[i + 1];
    p[i] += (x - q[i]) * DAMP;
    p[i + 1] += (y - q[i + 1]) * DAMP + GRAV;
    q[i] = x;
    q[i + 1] = y;
  }
  for (let k = 0; k < ITER; k++)
    for (let i = 0; i < e; i += 2) {
      const dx = p[i + 2] - p[i],
        dy = p[i + 3] - p[i + 1],
        d = Math.hypot(dx, dy);
      if (d <= rest) continue;
      const m = (d - rest) / d;
      const a = i === 0 ? 0 : i + 2 === e ? 1 : 0.5;
      p[i] += dx * m * a;
      p[i + 1] += dy * m * a;
      p[i + 2] -= dx * m * (1 - a);
      p[i + 3] -= dy * m * (1 - a);
    }

  let moved = 0;
  for (let i = 2; i < e; i++) moved = Math.max(moved, Math.abs(p[i] - q[i]));
  return moved > SLEEP;
}

function dist(pt: Pt, p: Float64Array, i: number) {
  const ax = p[i],
    ay = p[i + 1],
    bx = p[i + 2] - ax,
    by = p[i + 3] - ay;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((pt[0] - ax) * bx + (pt[1] - ay) * by) / (bx * bx + by * by || 1),
    ),
  );
  return Math.hypot(pt[0] - ax - bx * t, pt[1] - ay - by * t);
}

export function createRopes() {
  const ropes = new Map<number, Rope>();
  let acc = 0;
  let hot = -1;

  return {
    pin(id: number, a: Pt, b: Pt) {
      let r = ropes.get(id);
      if (!r) {
        const p = new Float64Array(2 * (SEG + 1));
        for (let i = 0; i <= SEG; i++) {
          p[2 * i] = a[0] + ((b[0] - a[0]) * i) / SEG;
          p[2 * i + 1] = a[1] + ((b[1] - a[1]) * i) / SEG;
        }
        ropes.set(id, (r = { p, q: p.slice(), awake: true }));
      }
      const { p } = r,
        e = 2 * SEG;
      if (
        p[0] !== a[0] ||
        p[1] !== a[1] ||
        p[e] !== b[0] ||
        p[e + 1] !== b[1]
      ) {
        [p[0], p[1], p[e], p[e + 1]] = [a[0], a[1], b[0], b[1]];
        r.awake = true;
      }
    },

    drop: (id: number) => ropes.delete(id),

    rename(from: number, to: number) {
      const r = ropes.get(from);
      if (r) ropes.set(to, r);
      ropes.delete(from);
    },

    step(dt: number): boolean {
      acc = Math.min(acc + dt, 0.1);
      for (; acc >= STEP; acc -= STEP)
        for (const r of ropes.values()) if (r.awake) r.awake = sim(r);
      return [...ropes.values()].some((r) => r.awake);
    },

    hit(pt: Pt, r: number): number {
      let best = -1;
      for (const [id, { p }] of ropes)
        if (id >= 0)
          for (let i = 0; i < SEG; i++) {
            const d = dist(pt, p, 2 * i);
            if (d < r) [best, r] = [id, d];
          }
      return best;
    },

    highlight(id: number): boolean {
      const changed = id !== hot;
      hot = id;
      return changed;
    },

    segments(): Float32Array {
      const out = new Float32Array(ropes.size * SEG * 5);
      let o = 0;
      for (const [id, { p }] of ropes)
        for (let i = 0; i < SEG; i++, o += 5) {
          out.set(p.subarray(2 * i, 2 * i + 4), o);
          out[o + 4] = +(id === hot);
        }
      return out;
    },
  };
}

export type Ropes = ReturnType<typeof createRopes>;
