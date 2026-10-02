import { RADIUS, STRIDE } from "./overlay";
import type { Pt } from "./ropes";
import type { WasmExports } from "./wasm";

export type Sock = { node: number; out: boolean; j: number };

const KIND_NAMES = ["Basic Shapes", "Output", "Transform"];
const KIND_AT = 16;

const div = (cls: string, parent: Element) => {
  const el = document.createElement("div");
  el.className = cls;
  parent.append(el);
  return el;
};

export function createScene(wasm: WasmExports, root: HTMLElement) {
  const f32 = () => new Float32Array(wasm.memory.buffer);
  const u8 = () => new Uint8Array(wasm.memory.buffer);
  const u16 = () => new Uint16Array(wasm.memory.buffer);
  const at = (el: HTMLElement) => +el.dataset.p! >> 2;

  const sockets = (node: number) => {
    const n = wasm.node_sockets(node);
    return [n & 255, n >> 8];
  };

  const socketPos = ({ node, out, j }: Sock): Pt => {
    const p = wasm.get_node(node) >> 2;
    const [x, y, w, h] = f32().subarray(p, p + 4);
    return [x + (out ? w : 0), y + (h * (j + 1)) / (sockets(node)[+out] + 1)];
  };

  return {
    socketPos,

    add(kind: number, x: number, y: number, nParams: number) {
      const p = wasm.add_node(kind, x, y, 160, 80, nParams);
      if (p < 0) return;
      const i = wasm.nodes_len() - 1;
      const el = div("node", root);
      el.dataset.p = `${p}`;
      el.style.borderRadius = `${RADIUS}px`;
      el.append(KIND_NAMES[kind]);

      const knobs = div("knobs", el);
      for (let j = 0, a; (a = wasm.get_param(i, j)) >= 0; j++)
        div("knob", knobs).dataset.a = `${a}`;

      const [ins, outs] = sockets(i);
      for (const [out, count] of [
        [false, ins],
        [true, outs],
      ] as const)
        for (let j = 0; j < count; j++) {
          const s = div("socket", el);
          const t = (j + 1) / (count + 1);

          s.style.left = out ? "calc(100% + 2px)" : "-2px";
          s.style.top = `calc(${100 * t}% + ${4 * t - 2}px)`;
          s.dataset.n = `${i}`;
          s.dataset.o = out ? "1" : "0";
          s.dataset.j = `${j}`;
        }
    },

    sync(): Float32Array {
      const f = f32(),
        u = u8();
      const els = root.children;
      const inst = new Float32Array(els.length * STRIDE);
      for (let i = 0; i < els.length; i++) {
        const el = els[i] as HTMLElement;
        const p = +el.dataset.p!;
        const [x, y, w, h] = f.subarray(p >> 2, (p >> 2) + 4);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        inst.set([x, y, w, h, i, u[p + KIND_AT]], i * STRIDE);
        el.querySelectorAll<HTMLElement>(".knob").forEach((k) =>
          k.style.setProperty("--v", `${f[+k.dataset.a! >> 2]}`),
        );
      }
      return inst;
    },

    *links(): Generator<[number, Pt, Pt]> {
      const u = u8(),
        w = u16();
      for (let i = 0; i < wasm.links_len(); i++) {
        const p = wasm.get_link(i);
        yield [
          i,
          socketPos({ node: w[p >> 1], out: true, j: u[p + 2] }),
          socketPos({ node: w[(p >> 1) + 2], out: false, j: u[p + 6] }),
        ];
      }
    },

    connect(a: Sock, b: Sock): number {
      const [s, t] = a.out ? [a, b] : [b, a];
      return a.out === b.out ? -1 : wasm.add_link(s.node, s.j, t.node, t.j);
    },

    raise: (el: HTMLElement) => root.append(el),

    pos(el: HTMLElement): Pt {
      const f = f32(),
        i = at(el);
      return [f[i], f[i + 1]];
    },

    move(el: HTMLElement, x: number, y: number) {
      const f = f32(),
        i = at(el);
      f[i] = x;
      f[i + 1] = y;
    },

    knob(el: HTMLElement) {
      const a = +el.dataset.a! >> 2;
      return { get: () => f32()[a], set: (v: number) => void (f32()[a] = v) };
    },

    socket: (el: HTMLElement): Sock => ({
      node: +el.dataset.n!,
      out: el.dataset.o === "1",
      j: +el.dataset.j!,
    }),
  };
}

export type Scene = ReturnType<typeof createScene>;
