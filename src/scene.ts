import { TABLE } from "./audio";
import { flagLabels, nodes } from "./generated/nodes";
import { RADIUS, STRIDE, type Scope } from "./overlay";
import type { Pt } from "./ropes";
import type { NodeInfo } from "./keyframes";
import type { WasmExports } from "./wasm";

export type Sock = { node: number; out: boolean; j: number };

const KIND_AT = 16,
  FLAGS_AT = KIND_AT + 1;

type ParamInfo = {
  name: string;
  options?: readonly string[];
  unit?: string;
  default: number;
};
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
  const parts = [
    HEAD,
    ...(n.params.length ? [n.params.length * ROW] : []),
    FLAGS,
    ...Array(1 + +n.hasWidget).fill(SCOPE),
  ];
  return [WIDTH, parts.reduce((a, b) => a + b + GAP, PAD - GAP)];
};
const OUTPUT = nodes.findIndex((n) => n.name === "Output");

const ROLE = nodes.map((n) => {
  const c: readonly string[] = n.category;
  return c.includes("Inputs") ? 0 : c.includes("Outputs") ? 1 : 2;
});
const GREEN: [number, number, number] = [0.3, 1, 0.45];
const ORANGE: [number, number, number] = [1, 0.6, 0.25];

const div = (cls: string, parent: Element) => {
  const el = document.createElement("div");
  el.className = cls;
  parent.append(el);
  return el;
};

export function createScene(wasm: WasmExports, root: HTMLElement) {
  const listeners: (() => void)[] = [];
  const changed = () => listeners.forEach((f) => f());
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

  const mount = (i: number, p: number, kind: number) => {
    const el = div("node", root);
    el.dataset.p = `${p}`;
    el.dataset.n = `${i}`;
    el.dataset.k = `${kind}`;
    el.style.borderRadius = `${RADIUS}px`;

    const head = div("head", el);
    div("title", head).textContent = nodes[kind].name;

    const knobs = div("knobs", el);
    for (let j = 0, a; (a = wasm.get_param(i, j)) >= 0; j++) {
      const k = div("knob", knobs);
      k.dataset.a = `${a}`;
      k.dataset.j = `${j}`;
      div("dial", k);
      div("pname", k).textContent = (
        nodes[kind].params as readonly ParamInfo[]
      )[j].name;
      div("pval", k);
    }

    const flags = div("flags", el);
    flagLabels.forEach((label, b) => {
      const f = div("flag", flags);
      f.dataset.b = `${b}`;
      f.textContent = label;
    });

    for (let j = 0; j < 1 + +wasm.node_has_widget(i); j++)
      div("scope", el).dataset.w = `${j}`;

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
  };

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
          params: [...el.querySelectorAll<HTMLElement>(".knob")].map((k) => ({
            addr: +k.dataset.a!,
            j: +k.dataset.j!,
            name: info[+k.dataset.j!].name,
          })),
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
      root.replaceChildren();
      for (let i = 0; i < wasm.nodes_len(); i++)
        mount(i, wasm.get_node(i), wasm.node_kind(i));
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
        el.querySelectorAll<HTMLElement>(".flag").forEach((b) =>
          b.classList.toggle(
            "active",
            !!(u[p + FLAGS_AT] & (1 << +b.dataset.b!)),
          ),
        );
        const info = nodes[+el.dataset.k!].params as readonly ParamInfo[];
        el.querySelectorAll<HTMLElement>(".knob").forEach((k) => {
          k.style.setProperty("--v", `${f[+k.dataset.a! >> 2]}`);
          k.classList.toggle("driven", driven.has(+k.dataset.a!));
          const j = +k.dataset.j!;

          const len = wasm.param_text(+el.dataset.n!, j);
          const v = utf8.decode(
            new Uint8Array(wasm.memory.buffer, wasm.param_text_ptr(), len),
          );
          const p = info[j];
          const text = p.options?.[+v] ?? (p.unit ? `${v} ${p.unit}` : v);
          const out = k.lastElementChild!;
          if (out.textContent !== text) out.textContent = text;
        });
      }
      return inst;
    },

    scopes(): Scope[] {
      const out: Scope[] = [];
      for (let order = 0; order < root.children.length; order++) {
        const el = root.children.item(order) as HTMLElement;
        const [x, y] = f32().subarray(at(el), at(el) + 2);

        el.querySelectorAll<HTMLElement>(".scope").forEach((s) => {
          const len = wasm.scope_fill(+el.dataset.n!, +s.dataset.w!);
          if (len < 2) return;
          out.push({
            rect: [
              x + el.clientLeft + s.offsetLeft,
              y + el.clientTop + s.offsetTop,
              s.offsetWidth,
              s.offsetHeight,
            ],
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
      el.remove();
      changed();

      root.querySelectorAll<HTMLElement>(".node, .socket").forEach((e) => {
        if (+e.dataset.n! > n) e.dataset.n = `${+e.dataset.n! - 1}`;
      });
    },

    resetKnob(k: HTMLElement) {
      const info = nodes[+k.closest<HTMLElement>(".node")!.dataset.k!]
        .params as readonly ParamInfo[];
      f32()[+k.dataset.a! >> 2] = info[+k.dataset.j!].default;
    },

    notify: changed,

    reset(el: HTMLElement) {
      const info = nodes[+el.dataset.k!].params as readonly ParamInfo[];
      const f = f32();
      el.querySelectorAll<HTMLElement>(".knob").forEach((k) => {
        f[+k.dataset.a! >> 2] = info[+k.dataset.j!].default;
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
      const src = el.querySelectorAll<HTMLElement>(".knob");
      copy.querySelectorAll<HTMLElement>(".knob").forEach((k, j) => {
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
      const p = +b.closest<HTMLElement>(".node")!.dataset.p!;
      u8()[p + FLAGS_AT] ^= 1 << +b.dataset.b!;
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
