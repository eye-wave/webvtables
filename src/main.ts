import "./style.css";
import { RADIUS, STRIDE, createOverlay } from "./overlay";
import { loadWasm } from "./wasm";

declare const nodeGrid: HTMLDivElement;
declare const canvas: HTMLCanvasElement;

const draw = createOverlay(canvas);
const KIND_NAMES = ["Basic Shapes", "Output"];

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
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLElement;
      const p = +el.dataset.p!;
      const [x, y, w, h] = f.subarray(p >> 2, (p >> 2) + 4);
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      inst.set([x, y, w, h, i, u[p + 16]], i * STRIDE);
    }
    draw(inst);
  }

  let drag: { p: number; dx: number; dy: number } | null = null;

  nodeGrid.addEventListener("pointerdown", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".node");
    if (!el) return;
    const p = +el.dataset.p!;
    const r = nodeGrid.getBoundingClientRect();
    drag = {
      p,
      dx: e.clientX - r.left - f32()[p >> 2],
      dy: e.clientY - r.top - f32()[(p >> 2) + 1],
    };
    nodeGrid.append(el);
    schedule();
  });

  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = nodeGrid.getBoundingClientRect();
    const f = f32();
    f[drag.p >> 2] = e.clientX - r.left - drag.dx;
    f[(drag.p >> 2) + 1] = e.clientY - r.top - drag.dy;
    schedule();
  });
  addEventListener("pointerup", () => (drag = null));
  new ResizeObserver(schedule).observe(nodeGrid);

  schedule();
});
