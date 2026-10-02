import "./style.css";
import { RADIUS, STRIDE, createOverlay, type View } from "./overlay";
import { loadWasm } from "./wasm";

declare const nodeGrid: HTMLDivElement;
declare const gridBg: HTMLDivElement;
declare const canvas: HTMLCanvasElement;

const draw = createOverlay(canvas);
const KIND_NAMES = ["Basic Shapes", "Output"];
const view = new Float32Array([0, 0, 1]) as unknown as View;

loadWasm().then((wasm) => {
  const f32 = () => new Float32Array(wasm.memory.buffer);

  wasm.add_node(0, 40, 40, 160, 80, 3);
  wasm.add_node(0, 120, 90, 160, 80, 3);
  wasm.add_node(1, 400, 60, 160, 80, 0);

  const kinds = new Uint8Array(wasm.memory.buffer);
  for (let i = 0; i < wasm.nodes_len(); i++) {
    const ptr = wasm.get_node(i);
    const el = document.createElement("div");
    el.className = "node";
    el.dataset.p = `${ptr}`;
    el.style.borderRadius = `${RADIUS}px`;
    el.textContent = KIND_NAMES[kinds[ptr + 16]];
    const knobs = el.appendChild(document.createElement("div"));
    knobs.className = "knobs";
    for (let j = 0, a; (a = wasm.get_param(i, j)) >= 0; j++) {
      const k = knobs.appendChild(document.createElement("div"));
      k.className = "knob";
      k.dataset.a = `${a}`;
    }
    nodeGrid.append(el);
  }

  let queued = false;
  const schedule = () =>
    queued || ((queued = true), requestAnimationFrame(frame));

  function frame() {
    queued = false;
    const f = f32();
    const u = new Uint8Array(wasm.memory.buffer);
    const els = nodeGrid.children;
    const inst = new Float32Array(els.length * STRIDE);
    nodeGrid.style.transform = `translate(${view[0]}px, ${view[1]}px) scale(${view[2]})`;
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLElement;
      const p = +el.dataset.p!;
      const [x, y, w, h] = f.subarray(p >> 2, (p >> 2) + 4);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      inst.set([x, y, w, h, i, u[p + 16]], i * STRIDE);
      el.querySelectorAll<HTMLElement>(".knob").forEach((k) => {
        k.style.setProperty("--v", `${f[+k.dataset.a! >> 2]}`);
      });
    }
    gridBg.style.backgroundSize = `${128 * view[2]}px `.repeat(2);
    gridBg.style.backgroundPosition = `${view[0]}px ${view[1]}px`;
    draw(inst, view);
  }

  const grid = canvas.parentElement!;
  const world = (e: PointerEvent) => {
    const r = nodeGrid.getBoundingClientRect();
    return [(e.clientX - r.left) / view[2], (e.clientY - r.top) / view[2]];
  };
  let drag: ((e: PointerEvent) => void) | null = null;

  grid.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    const knob = t.closest<HTMLElement>(".knob");
    const el = t.closest<HTMLElement>(".node");
    if (knob) {
      const a = +knob.dataset.a! >> 2,
        y0 = e.clientY,
        v0 = f32()[a];
      drag = (e) => {
        f32()[a] = Math.min(1, Math.max(0, v0 + (y0 - e.clientY) / 150));
      };
    } else if (el) {
      const p = +el.dataset.p! >> 2;
      const [wx, wy] = world(e);
      const dx = wx - f32()[p],
        dy = wy - f32()[p + 1];
      nodeGrid.append(el);
      drag = (e) => {
        const [x, y] = world(e);
        const f = f32();
        f[p] = x - dx;
        f[p + 1] = y - dy;
      };
    } else {
      const x0 = view[0] - e.clientX,
        y0 = view[1] - e.clientY;
      drag = (e) => {
        view[0] = x0 + e.clientX;
        view[1] = y0 + e.clientY;
      };
    }
    schedule();
  });

  addEventListener("pointermove", (e) => drag && (drag(e), schedule()));
  addEventListener("pointerup", () => (drag = null));

  grid.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      const k = view[2];
      const k2 = Math.min(
        4,
        Math.max(0.2, k * Math.exp((-e.deltaY * (e.deltaMode ? 33 : 1)) / 500)),
      );
      view[0] = mx - ((mx - view[0]) * k2) / k;
      view[1] = my - ((my - view[1]) * k2) / k;
      view[2] = k2;
      schedule();
    },
    { passive: false },
  );
  new ResizeObserver(schedule).observe(nodeGrid);

  schedule();
});
