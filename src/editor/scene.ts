import { TABLE } from "../audio/audio";
import { categories, nodes } from "../generated/nodes";
import {
  mountNode,
  pollNode,
  unmountNode,
  type ParamInfo,
} from "../components/node/node";
import { ui } from "../components/node/node_ui";
import { STRIDE, type Scope } from "../gfx/overlay";
import type { ParamEdit } from "../components/param_edit/param_edit";
import type { Pt } from "../gfx/ropes";
import type { NodeInfo } from "../components/keyframes/keyframes";
import type { WasmExports } from "../wasm";
import knobCss from "../components/node/knob.module.css";
import nodeCss from "../components/node/node.module.css";

export type Sock = { node: number; out: boolean; j: number };

const KIND_AT = 16,
  FLAGS_AT = KIND_AT + 1;

const utf8 = new TextDecoder();

const WIDTH = 180,
  HEAD = 20,
  ROW = 20,
  FLAGS = 20,
  SCOPE = 56,
  GAP = 4,
  PAD = 12;

const sizeOf = (kind: number): [number, number] => {
  const n = nodes[kind];
  const custom = ui[n.name]?.size;
  if (custom) return custom;
  const parts = [
    HEAD,
    ...(n.params.length ? [n.params.length * ROW] : []),
    FLAGS,
    ...Array(1 + +n.hasWidget).fill(SCOPE),
  ];
  return [WIDTH, parts.reduce((a, b) => a + b + GAP, PAD - GAP)];
};
const OUTPUT = nodes.findIndex((n) => n.name === "Output");

const INPUTS = categories.indexOf("Inputs");
const OUTPUTS = categories.indexOf("Outputs");
const ROLE = nodes.map((n) => {
  const c: readonly number[] = n.category;
  return c.includes(INPUTS) ? 0 : c.includes(OUTPUTS) ? 1 : 2;
});
const GREEN: [number, number, number] = [0.3, 1, 0.45];
const ORANGE: [number, number, number] = [1, 0.6, 0.25];

const offsetIn = (s: HTMLElement, node: HTMLElement): Pt => {
  let x = node.clientLeft,
    y = node.clientTop;
  for (let e: HTMLElement | null = s; e && e !== node;) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return [x, y];
};

export function createScene(
  wasm: WasmExports,
  root: HTMLElement,
  redraw: () => void = () => {},
) {
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((f) => f());
  const f32 = () => new Float32Array(wasm.memory.buffer);
  const u8 = () => new Uint8Array(wasm.memory.buffer);
  const u16 = () => new Uint16Array(wasm.memory.buffer);
  const at = (el: HTMLElement) => +el.dataset.p! >> 2;

  const numText = (node: number, j: number) =>
    utf8.decode(
      new Uint8Array(
        wasm.memory.buffer,
        wasm.param_text_ptr(),
        wasm.param_text(node, j),
      ),
    );

  const sockets = (node: number) => {
    const n = wasm.node_sockets(node);
    return [n & 255, n >> 8];
  };

  const socketPos = ({ node, out, j }: Sock): Pt => {
    const p = wasm.get_node(node) >> 2;
    const [x, y, w, h] = f32().subarray(p, p + 4);
    return [x + (out ? w : 0), y + (h * (j + 1)) / (sockets(node)[+out] + 1)];
  };

  const mount = (i: number, p: number, kind: number) =>
    mountNode(root, { wasm, i, kind, p, redraw }, ui[nodes[kind].name]?.view);

  return {
    socketPos,

    onChange: (f: () => void) => void listeners.push(f),

    nodes(): NodeInfo[] {
      const els = [...root.children] as HTMLElement[];
      els.sort((a, b) => +a.dataset.n! - +b.dataset.n!);
      const seen: Record<string, number> = {};
      return els.map((el) => {
        const kind = nodes[+el.dataset.k!];
        const nth = (seen[kind.name] = (seen[kind.name] ?? 0) + 1);
        const info = kind.params as readonly ParamInfo[];
        return {
          p: +el.dataset.p!,
          name: `${kind.name} ${nth}`,
          params: [...el.querySelectorAll<HTMLElement>(`.${knobCss.knob}`)].map(
            (k) => ({
              addr: +k.dataset.a!,
              j: +k.dataset.j!,
              name: info[+k.dataset.j!].n,
            }),
          ),
        };
      });
    },

    write: (addr: number, v: number) => void (f32()[addr >> 2] = v),

    add(kind: number, x: number, y: number) {
      const p = wasm.add_node(kind, x, y, ...sizeOf(kind));
      if (p < 0) return;
      mount(wasm.nodes_len() - 1, p, kind);
      changed();
    },

    load() {
      [...root.children].forEach(unmountNode);
      for (let i = 0; i < wasm.nodes_len(); i++) {
        const [p, k] = [wasm.get_node(i), wasm.node_kind(i)];
        // size is derived, not trusted
        f32().set(sizeOf(k), (p >> 2) + 2);
        mount(i, p, k);
      }
      changed();
    },

    sync(driven: Set<number>): Float32Array {
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
        inst.set([x, y, w, h, i, ROLE[u[p + KIND_AT]]], i * STRIDE);

        for (let j = 0, a; (a = wasm.get_param(+el.dataset.n!, j)) >= 0; j++)
          el.style.setProperty(`--p${j}`, `${f[a >> 2]}`);
        pollNode(el);
        el.querySelectorAll<HTMLElement>(`.${nodeCss.flag}`).forEach((b) =>
          b.classList.toggle(
            nodeCss.active,
            !!(u[p + FLAGS_AT] & (1 << +b.dataset.b!)),
          ),
        );
        const info = nodes[+el.dataset.k!].params as readonly ParamInfo[];
        el.querySelectorAll<HTMLElement>(`.${knobCss.knob}`).forEach((k) => {
          k.style.setProperty("--v", `${f[+k.dataset.a! >> 2]}`);
          k.classList.toggle(knobCss.driven, driven.has(+k.dataset.a!));
          const j = +k.dataset.j!;

          const v = numText(+el.dataset.n!, j);
          const p = info[j];
          const text = p.o?.[+v] ?? (p.u ? `${v} ${p.u}` : v);
          const out = k.querySelector(`.${knobCss.pval}`);
          if (out && out.textContent !== text) out.textContent = text;
        });
      }
      return inst;
    },

    scopes(): Scope[] {
      const out: Scope[] = [];
      for (let order = 0; order < root.children.length; order++) {
        const el = root.children.item(order) as HTMLElement;
        const [x, y] = f32().subarray(at(el), at(el) + 2);

        el.querySelectorAll<HTMLElement>(`.${nodeCss.scope}`).forEach((s) => {
          const len = wasm.scope_fill(+el.dataset.n!, +s.dataset.w!);
          if (len < 2) return;
          const [ox, oy] = offsetIn(s, el);
          out.push({
            rect: [x + ox, y + oy, s.offsetWidth, s.offsetHeight],
            order,
            color: s.dataset.w === "0" ? GREEN : ORANGE,
            pts: new Float32Array(
              wasm.memory.buffer,
              wasm.scope_ptr(),
              len,
            ).slice(),
          });
        });
      }
      return out;
    },

    *links(): Generator<[number, Pt, Pt]> {
      for (let i = 0; i < wasm.links_len(); i++) {
        const u = u8(),
          w = u16();
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

    unlink(i: number): number {
      const last = wasm.links_len() - 1;
      wasm.remove_link(i);
      return last;
    },

    // Closest free-side socket of `node` to world point `w`, or null (self / no sockets).
    nearest(from: Sock, node: number, [x, y]: Pt): Sock | null {
      let best: Sock | null = null,
        d = Infinity;
      if (node !== from.node)
        for (let j = 0; j < sockets(node)[+!from.out]; j++) {
          const s = { node, out: !from.out, j };
          const [sx, sy] = socketPos(s);
          const e = (sx - x) ** 2 + (sy - y) ** 2;
          if (e < d) ((d = e), (best = s));
        }
      return best;
    },

    targets(from: Sock): Pt[] {
      const out: Pt[] = [];
      for (let node = 0; node < wasm.nodes_len(); node++)
        if (node !== from.node)
          for (let j = 0; j < sockets(node)[+!from.out]; j++)
            out.push(socketPos({ node, out: !from.out, j }));
      return out;
    },

    raise: (el: HTMLElement) => root.append(el),

    outputTable(): Float32Array<ArrayBuffer> {
      let first = -1;
      Array.from(root.children as HTMLCollectionOf<HTMLElement>).forEach(
        (el) => {
          const n = +el.dataset.n!;
          if (+el.dataset.k! === OUTPUT && (first < 0 || n < first)) first = n;
        },
      );
      if (first < 0) return new Float32Array(TABLE);
      const len = wasm.scope_fill(first, 0);
      if (!len) return new Float32Array(TABLE);
      return new Float32Array(
        wasm.memory.buffer,
        wasm.scope_ptr(),
        len,
      ).slice();
    },

    remove(el: HTMLElement) {
      const n = +el.dataset.n!;
      wasm.remove_node(n);
      unmountNode(el);
      changed();

      root
        .querySelectorAll<HTMLElement>(`.${nodeCss.node}, .${nodeCss.socket}`)
        .forEach((e) => {
          if (+e.dataset.n! > n) e.dataset.n = `${+e.dataset.n! - 1}`;
        });
    },

    resetKnob(k: HTMLElement) {
      const info = nodes[
        +k.closest<HTMLElement>(`.${nodeCss.node}`)!.dataset.k!
      ].params as readonly ParamInfo[];
      f32()[+k.dataset.a! >> 2] = info[+k.dataset.j!].d;
    },

    notify: changed,

    reset(el: HTMLElement) {
      const info = nodes[+el.dataset.k!].params as readonly ParamInfo[];
      const f = f32();
      el.querySelectorAll<HTMLElement>(`.${knobCss.knob}`).forEach((k) => {
        f[+k.dataset.a! >> 2] = info[+k.dataset.j!].d;
      });
    },

    duplicate(el: HTMLElement) {
      const i = at(el);
      const count = root.children.length;
      this.add(+el.dataset.k!, f32()[i] + 24, f32()[i + 1] + 24);
      if (root.children.length === count) return;
      const copy = root.lastElementChild as HTMLElement;
      const f = f32(),
        u = u8();
      const src = el.querySelectorAll<HTMLElement>(`.${knobCss.knob}`);
      copy.querySelectorAll<HTMLElement>(`.${knobCss.knob}`).forEach((k, j) => {
        f[+k.dataset.a! >> 2] = f[+src[j].dataset.a! >> 2];
      });
      u[+copy.dataset.p! + FLAGS_AT] = u[+el.dataset.p! + FLAGS_AT];
    },

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

    flag(b: HTMLElement) {
      const p = +b.closest<HTMLElement>(`.${nodeCss.node}`)!.dataset.p!;
      u8()[p + FLAGS_AT] ^= 1 << +b.dataset.b!;
    },

    param(k: HTMLElement, after = () => {}): ParamEdit {
      const n = +k.closest<HTMLElement>(`.${nodeCss.node}`)!.dataset.n!,
        j = +k.dataset.j!;
      const kind = +k.closest<HTMLElement>(`.${nodeCss.node}`)!.dataset.k!;
      return {
        options: (nodes[kind].params as readonly ParamInfo[])[j].o,
        value: numText(n, j),
        commit: (v) => {
          const d = parseFloat(v);
          if (!isNaN(d)) wasm.param_set_denorm(n, j, d);
          after();
        },
      };
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
