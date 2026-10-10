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
import groupCss from "../components/group/group.module.css";

export type Sock = { node: number; out: boolean; j: number };

// A group is only a view over real nodes: wasm never hears about it. Mode 0 draws a frame around
// the members, 1 hides them behind a list of their params, 2 behind just a name and some info.
// Members are tracked by element (stable across removals, unlike node indices).
export type Mode = 0 | 1 | 2;
export type Group = {
  name: string;
  mode: Mode;
  members: HTMLElement[];
  el: HTMLElement;
  body: HTMLElement;
  rect: [number, number, number, number];
  ins: string[]; // external links of a collapsed group, one slot per socket on its edge
  outs: string[];
};
export const NAME_MAX = 22;

const GW = 180,
  GHEAD = 20,
  GPAD = 16;

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
  // node names in a param list depend on the other nodes, so rebuild those on any change
  const changed = () => {
    groups.forEach((g) => g.mode === 1 && setMode(g, 1));
    listeners.forEach((f) => f());
  };
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

  const dom = () => [...root.children] as HTMLElement[];
  const sorted = () => dom().sort((a, b) => +a.dataset.n! - +b.dataset.n!);
  const byIndex = () =>
    new Map(dom().map((e): [number, HTMLElement] => [+e.dataset.n!, e]));
  // "Gain 2": kind plus its rank among nodes of that kind; shared with the keyframe panel
  const names = () => {
    const seen: Record<string, number> = {};
    return new Map(
      sorted().map((el): [HTMLElement, string] => {
        const k = nodes[+el.dataset.k!].name;
        return [el, `${k} ${(seen[k] = (seen[k] ?? 0) + 1)}`];
      }),
    );
  };
  const ends = (i: number) => {
    const w = u16(),
      u = u8(),
      p = wasm.get_link(i);
    return [w[p >> 1], u[p + 2], w[(p >> 1) + 2], u[p + 6]] as const;
  };

  // ---- groups -------------------------------------------------------------------------------
  const groups: Group[] = [];
  const membership = new Map<HTMLElement, Group>();
  const groupEl = new WeakMap<HTMLElement, Group>();
  const rowOwner = new WeakMap<HTMLElement, HTMLElement>(); // param-list knob -> its real node
  const picked = new Set<HTMLElement>();
  // Same transform as the grid (copied in sync). It has to sit after the grid, which covers the
  // whole area and would otherwise swallow every click meant for a group.
  const layer = Object.assign(document.createElement("div"), {
    className: groupCss.layer,
  });
  root.after(layer);

  const shut = (el?: HTMLElement) => {
    const g = el && membership.get(el);
    return g && g.mode ? g : undefined;
  };
  const visible = () => dom().filter((e) => !shut(e));
  const owner = (k: HTMLElement) =>
    rowOwner.get(k) ?? k.closest<HTMLElement>(`.${nodeCss.node}`)!;

  const paint = (
    k: HTMLElement,
    node: HTMLElement,
    f: Float32Array,
    driven: Set<number>,
  ) => {
    const info = nodes[+node.dataset.k!].params as readonly ParamInfo[];
    k.style.setProperty("--v", `${f[+k.dataset.a! >> 2]}`);
    k.classList.toggle(knobCss.driven, driven.has(+k.dataset.a!));
    const j = +k.dataset.j!;
    const v = numText(+node.dataset.n!, j);
    const p = info[j];
    const text = p.o?.[+v] ?? (p.u ? `${v} ${p.u}` : v);
    const out = k.querySelector(`.${knobCss.pval}`);
    if (out && out.textContent !== text) out.textContent = text;
  };

  const div = (cls: string, text = "") =>
    Object.assign(document.createElement("div"), {
      className: cls,
      textContent: text,
    });

  const MODES = ["Show parameters only", "Show name only", "Expand"];
  const setMode = (g: Group, mode: Mode) => {
    g.mode = mode;
    g.el.dataset.mode = `${mode}`;
    g.members.forEach((m) => (m.style.display = mode ? "none" : ""));
    const btn = g.el.querySelector<HTMLElement>(`.${groupCss.mode}`)!;
    btn.textContent = ["▾", "☰", "▸"][mode];
    btn.title = MODES[mode];
    g.body.replaceChildren();
    if (mode === 1) {
      const label = names();
      for (const m of g.members) {
        g.body.append(div(groupCss.member, label.get(m)));
        const info = nodes[+m.dataset.k!].params as readonly ParamInfo[];
        for (const src of m.querySelectorAll<HTMLElement>(`.${knobCss.knob}`)) {
          const k = div(knobCss.knob);
          k.dataset.a = src.dataset.a;
          k.dataset.j = src.dataset.j;
          k.append(
            div(knobCss.dial),
            div(knobCss.pname, info[+src.dataset.j!].n),
            div(knobCss.pval),
          );
          rowOwner.set(k, m);
          g.body.append(k);
        }
      }
    } else if (mode === 2) g.body.append(div(groupCss.info));
    redraw();
  };

  const makeGroup = (members: HTMLElement[], name: string, mode: Mode) => {
    const nameBox = Object.assign(document.createElement("input"), {
      className: groupCss.name,
      value: name,
      maxLength: NAME_MAX,
      spellcheck: false,
      autocomplete: "off",
    });
    const btn = Object.assign(document.createElement("button"), {
      className: groupCss.mode,
      type: "button",
    });
    const head = div(groupCss.head);
    head.append(nameBox, btn);
    const body = div(groupCss.body);
    const el = div(groupCss.group);
    el.append(head, body);
    const g: Group = {
      name,
      mode,
      members,
      el,
      body,
      rect: [0, 0, 0, 0],
      ins: [],
      outs: [],
    };
    nameBox.oninput = () => (g.name = nameBox.value);
    btn.onclick = () => setMode(g, ((g.mode + 1) % 3) as Mode);
    groups.push(g);
    groupEl.set(el, g);
    members.forEach((m) => membership.set(m, g));
    layer.append(el);
    setMode(g, mode);
    return g;
  };

  const dissolve = (g: Group) => {
    g.members.forEach((m) => {
      membership.delete(m);
      m.style.display = "";
    });
    groups.splice(groups.indexOf(g), 1);
    g.el.remove();
    redraw();
  };

  const leave = (el: HTMLElement) => {
    picked.delete(el);
    const g = membership.get(el);
    if (!g) return;
    membership.delete(el);
    g.members.splice(g.members.indexOf(el), 1);
    if (!g.members.length) dissolve(g);
  };

  const deselect = () => {
    picked.forEach((e) => e.classList.remove(nodeCss.sel));
    picked.clear();
  };

  // External links of every collapsed group, one slot per socket, so the ropes can end on its edge.
  // Runs at the top of sync; links() relies on it.
  const ports = () => {
    for (const g of groups) ((g.ins = []), (g.outs = []));
    if (!groups.some((g) => g.mode)) return;
    const els = byIndex();
    const add = (list: string[], key: string) => {
      if (!list.includes(key)) list.push(key);
    };
    for (let i = 0; i < wasm.links_len(); i++) {
      const [s, ss, t, ts] = ends(i);
      const [gs, gt] = [shut(els.get(s)), shut(els.get(t))];
      if (gs === gt) continue; // both outside, or a link inside one group
      if (gs) add(gs.outs, `${s}:${ss}`);
      if (gt) add(gt.ins, `${t}:${ts}`);
    }
  };

  const edge = (g: Group, out: boolean, node: number, j: number): Pt => {
    const list = out ? g.outs : g.ins,
      [x, y, w, h] = g.rect;
    return [
      x + (out ? w : 0),
      y + (h * (list.indexOf(`${node}:${j}`) + 1)) / (list.length + 1),
    ];
  };

  const layout = (g: Group, f: Float32Array, driven: Set<number>) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const m of g.members) {
      const i = at(m);
      x0 = Math.min(x0, f[i]);
      y0 = Math.min(y0, f[i + 1]);
      x1 = Math.max(x1, f[i] + f[i + 2]);
      y1 = Math.max(y1, f[i + 1] + f[i + 3]);
    }
    // fill in the text first: the collapsed box is measured below, and the info line has no height until it has text
    if (g.mode === 1)
      g.body
        .querySelectorAll<HTMLElement>(`.${knobCss.knob}`)
        .forEach((k) => paint(k, rowOwner.get(k)!, f, driven));
    if (g.mode === 2) {
      const text = `${g.members.length} nodes · ${g.ins.length} in · ${g.outs.length} out`;
      const info = g.body.firstElementChild!;
      if (info.textContent !== text) info.textContent = text;
    }
    const s = g.el.style;
    if (g.mode) {
      s.width = `${GW}px`;
      s.height = "";
      g.rect = [x0, y0, GW, g.el.offsetHeight];
    } else {
      g.rect = [
        x0 - GPAD,
        y0 - GPAD - GHEAD,
        x1 - x0 + 2 * GPAD,
        y1 - y0 + 2 * GPAD + GHEAD,
      ];
      s.width = `${g.rect[2]}px`;
      s.height = `${g.rect[3]}px`;
    }
    s.transform = `translate(${g.rect[0]}px, ${g.rect[1]}px)`;
  };

  return {
    socketPos,

    onChange: (f: () => void) => void listeners.push(f),

    nodes(): NodeInfo[] {
      const els = sorted();
      const label = names();
      return els.map((el) => {
        const kind = nodes[+el.dataset.k!];
        const info = kind.params as readonly ParamInfo[];
        return {
          p: +el.dataset.p!,
          n: +el.dataset.n!,
          name: label.get(el)!,
          params: [...el.querySelectorAll<HTMLElement>(`.${knobCss.knob}`)].map(
            (k) => ({
              addr: +k.dataset.a!,
              j: +k.dataset.j!,
              name: info[+k.dataset.j!].n,
              o: info[+k.dataset.j!].o,
              u: info[+k.dataset.j!].u,
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
      groups.splice(0).forEach((g) => g.el.remove());
      membership.clear();
      picked.clear();
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
      layer.style.transform = root.style.transform;
      ports();
      // nodes hidden inside a collapsed group are skipped everywhere, so z-order = index here
      const els = visible();
      const inst = new Float32Array((els.length + groups.length) * STRIDE);
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
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
        el.querySelectorAll<HTMLElement>(`.${knobCss.knob}`).forEach((k) =>
          paint(k, el, f, driven),
        );
      }
      // collapsed groups are drawn like nodes (occlude ropes, glow); open ones are plain frames
      let n = els.length;
      for (const g of groups) {
        layout(g, f, driven);
        if (g.mode) inst.set([...g.rect, n++, 2], (n - 1) * STRIDE);
      }
      return inst.subarray(0, n * STRIDE);
    },

    scopes(): Scope[] {
      const out: Scope[] = [];
      const els = visible();
      for (let order = 0; order < els.length; order++) {
        const el = els[order];
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

    // null ends: the link lies inside a collapsed group, so it has no rope
    *links(): Generator<[number, Pt | null, Pt | null]> {
      const els = byIndex();
      for (let i = 0; i < wasm.links_len(); i++) {
        const [s, ss, t, ts] = ends(i);
        const [gs, gt] = [shut(els.get(s)), shut(els.get(t))];
        if (gs && gs === gt) {
          yield [i, null, null];
          continue;
        }
        yield [
          i,
          gs ? edge(gs, true, s, ss) : socketPos({ node: s, out: true, j: ss }),
          gt
            ? edge(gt, false, t, ts)
            : socketPos({ node: t, out: false, j: ts }),
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
      const els = byIndex();
      for (let node = 0; node < wasm.nodes_len(); node++)
        if (node !== from.node && !shut(els.get(node)))
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
      leave(el);
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
      const info = nodes[+owner(k).dataset.k!].params as readonly ParamInfo[];
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

    duplicate(el: HTMLElement): HTMLElement | undefined {
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
      return copy;
    },

    // ---- groups ----

    /** Which knob's real node: a param-list knob inside a collapsed group belongs to a hidden one. */
    owner,
    groupOf: (el: HTMLElement) => membership.get(el),
    groupAt(t: Element) {
      const e = t.closest<HTMLElement>(`.${groupCss.group}`);
      return e ? groupEl.get(e) : undefined;
    },
    picked: () => [...picked],
    select(el: HTMLElement) {
      picked.has(el) ? picked.delete(el) : picked.add(el);
      el.classList.toggle(nodeCss.sel, picked.has(el));
    },
    deselect,

    /** Group the selected nodes (all must be ungrouped). */
    group(): Group | undefined {
      const m = [...picked].sort((a, b) => +a.dataset.n! - +b.dataset.n!);
      if (!m.length || m.some((e) => membership.has(e))) return;
      deselect();
      return makeGroup(m, `Group ${groups.length + 1}`, 0);
    },

    ungroup: dissolve,
    setMode,

    // Copies the members (params, flags) and the links between them, as one new group.
    duplicateGroup(g: Group) {
      const copies = new Map<number, HTMLElement>(); // old node index -> copy
      for (const m of g.members) {
        const c = this.duplicate(m);
        if (c) copies.set(+m.dataset.n!, c);
      }
      for (let i = 0, n = wasm.links_len(); i < n; i++) {
        const [s, ss, t, ts] = ends(i);
        const [a, b] = [copies.get(s), copies.get(t)];
        if (a && b) wasm.add_link(+a.dataset.n!, ss, +b.dataset.n!, ts);
      }
      if (copies.size)
        makeGroup(
          [...copies.values()],
          `${g.name} copy`.slice(0, NAME_MAX),
          g.mode,
        );
    },

    list: () =>
      groups.map((g) => ({
        name: g.name,
        mode: g.mode,
        nodes: g.members.map((m) => +m.dataset.n!),
      })),

    // After load(): node indices are valid again, so groups can be rebuilt over them.
    restore(list: { name: string; mode: number; nodes: number[] }[]) {
      const els = byIndex();
      for (const { name, mode, nodes: ns } of list) {
        const m = [...new Set(ns)]
          .map((n) => els.get(n))
          .filter((e): e is HTMLElement => !!e && !membership.has(e));
        if (m.length)
          makeGroup(
            m,
            name.slice(0, NAME_MAX),
            Math.min(2, Math.max(0, mode)) as Mode,
          );
      }
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
      const node = owner(k);
      const n = +node.dataset.n!,
        j = +k.dataset.j!;
      const kind = +node.dataset.k!;
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
