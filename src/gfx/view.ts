import type { Pt } from "./ropes";

export type View = [x: number, y: number, k: number];

const CELL = 144;

export function createView(nodes: HTMLElement, bg: HTMLElement) {
  const v: View = [0, 0, 1];
  return {
    v,

    apply() {
      nodes.style.transform = `translate(${v[0]}px, ${v[1]}px) scale(${v[2]})`;
      bg.style.backgroundSize = `${CELL * v[2]}px `.repeat(2);
      bg.style.backgroundPosition = `${v[0]}px ${v[1]}px`;
    },

    world(e: MouseEvent): Pt {
      const r = nodes.getBoundingClientRect();
      return [(e.clientX - r.left) / v[2], (e.clientY - r.top) / v[2]];
    },

    pan(dx: number, dy: number) {
      v[0] += dx;
      v[1] += dy;
    },

    // Two touches: scale by their distance ratio and follow their midpoint, from the view `s`
    // and touch points a0/b0 captured when the pinch began, so the content under the fingers stays put.
    pinch(s: View, a0: Pt, b0: Pt, a: Pt, b: Pt) {
      const r = bg.getBoundingClientRect(),
        mid = (p: Pt, q: Pt, i: 0 | 1) => (p[i] + q[i]) / 2 - (i ? r.top : r.left),
        k = Math.min(
          4,
          Math.max(0.2, (s[2] * Math.hypot(a[0] - b[0], a[1] - b[1])) / (Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) || 1)),
        );
      for (const i of [0, 1] as const)
        v[i] = mid(a, b, i) - ((mid(a0, b0, i) - s[i]) * k) / s[2];
      v[2] = k;
    },

    zoom(e: WheelEvent) {
      const r = bg.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      const k = v[2];
      const k2 = Math.min(
        4,
        Math.max(0.2, k * Math.exp((-e.deltaY * (e.deltaMode ? 33 : 1)) / 500)),
      );
      v[0] = mx - ((mx - v[0]) * k2) / k;
      v[1] = my - ((my - v[1]) * k2) / k;
      v[2] = k2;
    },
  };
}

export type ViewCtl = ReturnType<typeof createView>;
