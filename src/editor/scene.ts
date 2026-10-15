import { TABLE } from "../audio/audio";
import { categories, flagLabels, nodes } from "../generated/nodes";
import {
  mountNode,
  pollNode,
  unmountNode,
  type ParamInfo,
} from "../components/node/node";
import { ui } from "../components/node/node_ui";
import {
  STRIDE,
  type ImageDraw,
  type PanelDraw,
  type Scope,
} from "../gfx/overlay";
import { imageViews, panelViews } from "../components/node/data_asset";
import type { ParamEdit } from "../components/param_edit/param_edit";
import type { Pt } from "../gfx/ropes";
import type { NodeInfo } from "../components/keyframes/keyframes";
import type { bool } from "../generated/exports";
import type { WasmExports } from "../wasm";
import knobCss from "../components/node/knob.module.css";
import nodeCss from "../components/node/node.module.css";
import groupCss from "../components/group/group.module.css";

export type Sock = { node: number; out: boolean; j: number };

// A custom node is a definition (see scene) plus instances; ports and params are by element.
type Port = { el: HTMLElement; j: number; inv?: boolean }; // a param of a definition's node; inv: follows its master as 1 - value
export type GParam = { name: string; targets: Port[] }; // targets[0] is the knob shown on instances, the rest follow it
export type Def = { id: string; name: string; params: GParam[] };
export type Inst = {
  def: Def;
  pos: [number, number];
  members: HTMLElement[]; // the hidden copies of the definition's nodes
  ins: HTMLElement[]; // copies of its Input nodes, in order: the box's input sockets
  outs: HTMLElement[];
  copy: Map<HTMLElement, HTMLElement>; // definition node -> its copy
  vals: Map<GParam, number>; // param values to apply when (re)expanding
  el: HTMLElement;
  head: HTMLElement;
  body: HTMLElement;
  rect: [number, number, number, number];
};
export const NAME_MAX = 22;
// What the file stores, by node index (project.ts turns indices into ids).
export type DefSpec = {
  id: string;
  name: string;
  nodes: number[];
  params: { name: string; targets: { n: number; j: number; inv?: boolean }[] }[];
};
export type InstSpec = { def: string; x: number; y: number; flags: number; vals: number[] };
export type EndSpec = number | { i: number }; // a node index, or an instance (its port = the socket)
export type Restore = {
  defs: DefSpec[];
  insts: InstSpec[];
  links: [EndSpec, number, EndSpec, number][]; // links that touch an instance
};

const GW = 180,
  GHEAD = 20;

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
const GIN = nodes.findIndex((n) => n.id === "grpin");
const GOUT = nodes.findIndex((n) => n.id === "grpout");
// state that lives outside the params, so it can't be copied into an instance
const STATEFUL = new Set(
  nodes.flatMap((n, k) => (["data", "math", "wavshape", "drawfilt"].includes(n.id) ? [k] : [])),
);

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
  const changed = () => {
    retitle();
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

  // A socket of a node hidden in a collapsed group sits on the group's edge.
  const socketPos = ({ node, out, j }: Sock, els = byIndex()): Pt => {
    const g = shut(els.get(node));
    if (g) return edge(g, out, node, j);
    const p = wasm.get_node(node) >> 2;
    const [x, y, w, h] = f32().subarray(p, p + 4);
    return [x + (out ? w : 0), y + (h * (j + 1)) / (sockets(node)[+out] + 1)];
  };

  const mount = (i: number, p: number, kind: number) =>
    mountNode(root, { wasm, i, kind, p, redraw }, ui[nodes[kind].name]?.view);

  const dom = () => [...root.children] as HTMLElement[];
  // the main graph's nodes: definitions' and instances' are not for the keyframe panel
  const sorted = () => dom().filter((e) => !e.dataset.s).sort(byN);
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

  // ---- custom nodes -------------------------------------------------------------------------
  // A custom node is a definition (a tab: its own graph of real nodes, tagged `data-s` = its id) plus
  // instances in the main graph. An instance is hidden copies of the definition's nodes (`data-s` =
  // "i"), shown as one box; it is rebuilt from the definition when that tab is left. What belongs to
  // the instance itself: position, flags (on its Output copies) and its group params (param_follow).
  // Elements are tracked, not indices: they stay valid when nodes are removed.
  const defs: Def[] = [];
  const insts: Inst[] = [];
  const membership = new Map<HTMLElement, Inst>(); // hidden copy -> its instance
  const groupEl = new WeakMap<HTMLElement, Inst>();
  const rowOwner = new WeakMap<HTMLElement, HTMLElement>(); // instance knob -> the copy it edits
  const portSock = new WeakMap<HTMLElement, () => Sock>(); // instance socket -> the copy's socket
  const picked = new Set<HTMLElement>();
  let tab = ""; // "" = main, else the id of the definition being edited
  // Same transform as the grid (copied in sync). It has to sit after the grid, which covers the
  // whole area and would otherwise swallow every click meant for an instance.
  const layer = Object.assign(document.createElement("div"), {
    className: groupCss.layer,
  });
  root.after(layer);

  const spaceOf = (el: HTMLElement) => el.dataset.s ?? "";
  const byN = (a: HTMLElement, b: HTMLElement) => +a.dataset.n! - +b.dataset.n!;
  const shut = (el?: HTMLElement) => (el ? membership.get(el) : undefined);
  const shown = (el: HTMLElement) => !membership.has(el) && spaceOf(el) === tab;
  const visible = () => dom().filter(shown);
  const defOf = (el: HTMLElement) => defs.find((d) => d.id === spaceOf(el));
  const applyTab = () => {
    dom().forEach((e) => (e.style.display = shown(e) ? "" : "none"));
    layer.style.display = tab ? "none" : "";
  };
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

  // Input/Output nodes of a definition are numbered by their order in it: "Input #2".
  const retitle = () => {
    const seen = new Map<string, number>();
    for (const e of dom().sort(byN)) {
      const k = +e.dataset.k!;
      if (k !== GIN && k !== GOUT) continue;
      const key = `${spaceOf(e)}/${k}`;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      const t = e.querySelector(`.${nodeCss.title}`);
      if (t) t.textContent = `${k === GIN ? "Input" : "Output"} #${n}`;
    }
  };

  const hideSocks = (el: HTMLElement) => {
    const k = +el.dataset.k!;
    if (k === GIN || k === GOUT)
      el.querySelector(`.${nodeCss.socket}[data-o="${+(k === GOUT)}"]`)?.remove();
  };

  // A real node in space `sp` ("" main, a definition id, or "i" for an instance's copy).
  const spawn = (kind: number, x: number, y: number, sp: string) => {
    const p = wasm.add_node(kind, x, y, ...sizeOf(kind));
    if (p < 0) return;
    mount(wasm.nodes_len() - 1, p, kind);
    const el = root.lastElementChild as HTMLElement;
    if (sp) el.dataset.s = sp;
    hideSocks(el);
    el.style.display = sp === tab ? "" : "none";
    return el;
  };

  // Removes a node without any bookkeeping about what it belonged to.
  const drop = (el: HTMLElement) => {
    const n = +el.dataset.n!;
    wasm.remove_node(n);
    unmountNode(el);
    root
      .querySelectorAll<HTMLElement>(`.${nodeCss.node}, .${nodeCss.socket}`)
      .forEach((e) => {
        if (+e.dataset.n! > n) e.dataset.n = `${+e.dataset.n! - 1}`;
      });
  };

  const follow = (f: Port, m: Port, on: boolean) =>
    wasm.param_follow(+f.el.dataset.p!, f.j, +m.el.dataset.p!, m.j, +on as bool, +!!f.inv as bool);
  const sameKnob = (a: Port, b: Port) => a.el === b.el && a.j === b.j;

  // Drops the params' targets matching `gone`; when the master goes, the next one takes over.
  const unbind = (d: Def, gone: (p: Port) => boolean) => {
    for (const q of d.params) {
      const rest = q.targets.filter((t) => !gone(t));
      if (rest.length === q.targets.length) continue;
      const masterGone = gone(q.targets[0]);
      q.targets.filter(gone).forEach((t) => follow(t, t, false));
      q.targets = rest;
      if (masterGone && rest.length) {
        // the new master is shown as is; the others keep their relation to it
        const flip = !!rest[0].inv;
        rest.forEach((t, i) => (t.inv = i ? !!t.inv !== flip : false));
        follow(rest[0], rest[0], false);
        rest.slice(1).forEach((f) => follow(f, rest[0], true));
      }
    }
  };

  const masterOf = (g: Inst, q: GParam): Port | undefined => {
    const t = q.targets[0];
    const el = t && g.copy.get(t.el);
    return el && { el, j: t.j };
  };
  const slot = (p: Port) => wasm.get_param(+p.el.dataset.n!, p.j) >> 2;
  const flagsOf = (g: Inst) =>
    g.outs.reduce((m, e) => m & u8()[+e.dataset.p! + FLAGS_AT], 7) * +!!g.outs.length;
  const setFlags = (g: Inst, bits: number) =>
    g.outs.forEach((e) => (u8()[+e.dataset.p! + FLAGS_AT] = bits));

  const render = (g: Inst) => {
    g.head.textContent = g.def.name;
    g.el.querySelectorAll(`.${nodeCss.socket}`).forEach((e) => e.remove());
    g.body.replaceChildren();
    for (const out of [false, true]) {
      const list = out ? g.outs : g.ins;
      list.forEach((el, j) => {
        const t = (j + 1) / (list.length + 1);
        const s = div(nodeCss.socket);
        s.style.left = out ? "calc(100% + 2px)" : "-2px";
        s.style.top = `calc(${100 * t}% + ${4 * t - 2}px)`;
        portSock.set(s, () => ({ node: +el.dataset.n!, out, j: 0 }));
        g.el.append(s);
      });
    }
    for (const q of g.def.params) {
      const m = masterOf(g, q);
      if (!m) continue;
      const k = div(knobCss.knob);
      k.dataset.a = `${slot(m) << 2}`;
      k.dataset.j = `${m.j}`;
      k.append(div(knobCss.dial), div(knobCss.pname, q.name), div(knobCss.pval));
      rowOwner.set(k, m.el);
      g.body.append(k);
    }
    const flags = div(nodeCss.flags);
    flagLabels.forEach((l, b) => {
      const f = div(nodeCss.flag, l);
      f.dataset.b = `${b}`;
      flags.append(f);
    });
    g.body.append(flags);
    if (g.outs.length) {
      const sc = div(nodeCss.scope);
      sc.style.flex = "none";
      sc.style.height = `${SCOPE}px`;
      g.body.append(sc);
    }
    redraw();
  };

  // Fills the instance with copies of its definition's nodes and links, and wires its group params.
  const expand = (g: Inst) => {
    const d = g.def;
    const src = dom()
      .filter((e) => spaceOf(e) === d.id)
      .sort(byN);
    const idx = new Map<number, HTMLElement>(); // definition node index -> copy
    g.members = [];
    g.ins = [];
    g.outs = [];
    g.copy = new Map();
    for (const e of src) {
      const k = +e.dataset.k!;
      const [x, y] = f32().subarray(at(e), at(e) + 2);
      const el = spawn(k, x, y, "i");
      if (!el) continue;
      membership.set(el, g);
      g.members.push(el);
      g.copy.set(e, el);
      idx.set(+e.dataset.n!, el);
      for (let j = 0, a; (a = wasm.get_param(+e.dataset.n!, j)) >= 0; j++)
        f32()[wasm.get_param(+el.dataset.n!, j) >> 2] = f32()[a >> 2];
      u8()[+el.dataset.p! + FLAGS_AT] = u8()[+e.dataset.p! + FLAGS_AT];
      if (k === GIN) g.ins.push(el);
      if (k === GOUT) g.outs.push(el);
    }
    for (let i = 0, n = wasm.links_len(); i < n; i++) {
      const [s, ss, t, ts] = ends(i);
      const [a, b] = [idx.get(s), idx.get(t)];
      if (a && b) wasm.add_link(+a.dataset.n!, ss, +b.dataset.n!, ts);
    }
    for (const q of d.params) {
      const t = q.targets.flatMap((p): Port[] => {
        const el = g.copy.get(p.el);
        return el ? [{ el, j: p.j, inv: p.inv }] : [];
      });
      t.slice(1).forEach((f) => follow(f, t[0], true));
      const v = g.vals.get(q);
      if (v !== undefined && t[0]) f32()[slot(t[0])] = v;
    }
  };

  const teardown = (g: Inst) => {
    for (const m of [...g.members].sort(byN).reverse()) {
      membership.delete(m);
      drop(m);
    }
    g.members = [];
    g.ins = [];
    g.outs = [];
    g.copy = new Map();
  };

  // Rebuilds every instance of `d`, keeping what is theirs (params, flags) and the links into them.
  type End = HTMLElement | { g: Inst; out: boolean; i: number };
  const reexpand = (d: Def) => {
    const mine = insts.filter((g) => g.def === d);
    if (!mine.length) return;
    const els = byIndex();
    const endOf = (el: HTMLElement): End | undefined => {
      const g = membership.get(el);
      if (!g) return el;
      const [i, o] = [g.ins.indexOf(el), g.outs.indexOf(el)];
      return i >= 0 ? { g, out: false, i } : o >= 0 ? { g, out: true, i: o } : undefined;
    };
    const saved: [End, number, End, number][] = [];
    for (let l = 0; l < wasm.links_len(); l++) {
      const [s, ss, t, ts] = ends(l);
      const [a, b] = [els.get(s), els.get(t)];
      if (!a || !b) continue;
      const [ga, gb] = [membership.get(a), membership.get(b)];
      if ((!ga || !mine.includes(ga)) && (!gb || !mine.includes(gb))) continue;
      if (ga && ga === gb) continue; // inside one instance: expand() makes it again
      const [ea, eb] = [endOf(a), endOf(b)];
      if (ea && eb) saved.push([ea, ss, eb, ts]);
    }
    const flags = mine.map(flagsOf);
    for (const g of mine)
      for (const q of d.params) {
        const m = masterOf(g, q);
        if (m) g.vals.set(q, f32()[slot(m)]);
      }
    mine.forEach(teardown);
    mine.forEach(expand);
    mine.forEach((g, i) => setFlags(g, flags[i]));
    const resolve = (e: End, sock: number): [HTMLElement, number] | undefined => {
      if (e instanceof HTMLElement) return [e, sock];
      const el = (e.out ? e.g.outs : e.g.ins)[e.i];
      return el && [el, 0];
    };
    for (const [a, ss, b, ts] of saved) {
      const [x, y] = [resolve(a, ss), resolve(b, ts)];
      if (x && y) wasm.add_link(+x[0].dataset.n!, x[1], +y[0].dataset.n!, y[1]);
    }
    mine.forEach(render);
  };

  const addInst = (d: Def, x: number, y: number) => {
    const name = div(groupCss.name);
    const head = div(groupCss.head);
    head.append(name);
    const body = div(groupCss.body);
    const el = div(groupCss.group);
    el.append(head, body);
    // double-click on the grid opens the add menu, here it opens the definition
    el.ondblclick = (e) => {
      if ((e.target as HTMLElement).closest(`.${knobCss.knob}`)) return;
      e.stopPropagation();
      open(g.def.id);
    };
    const g: Inst = {
      def: d,
      pos: [x, y],
      members: [],
      ins: [],
      outs: [],
      copy: new Map(),
      vals: new Map(),
      el,
      head: name,
      body,
      rect: [x, y, GW, GHEAD],
    };
    insts.push(g);
    groupEl.set(el, g);
    layer.append(el);
    expand(g);
    render(g);
    return g;
  };

  const removeInst = (g: Inst) => {
    teardown(g);
    g.el.remove();
    insts.splice(insts.indexOf(g), 1);
    changed();
  };

  const deselect = () => {
    picked.forEach((e) => e.classList.remove(nodeCss.sel));
    picked.clear();
  };

  const open = (id: string) => {
    if (id === tab) return;
    const left = defs.find((d) => d.id === tab);
    if (left) reexpand(left);
    tab = id;
    deselect();
    applyTab();
    changed();
    redraw();
  };

  const newDef = (name?: string): Def => {
    let id: string;
    do id = `0x${Math.floor(Math.random() * 16 ** 5).toString(16).padStart(5, "0")}`;
    while (defs.some((d) => d.id === id));
    const d = { id, name: (name ?? `Node ${defs.length + 1}`).slice(0, NAME_MAX), params: [] };
    defs.push(d);
    changed();
    return d;
  };

  const removeDef = (d: Def) => {
    if (tab === d.id) {
      tab = "";
      applyTab();
    }
    insts.filter((g) => g.def === d).forEach(removeInst);
    dom()
      .filter((e) => spaceOf(e) === d.id)
      .sort(byN)
      .reverse()
      .forEach(drop);
    defs.splice(defs.indexOf(d), 1);
    changed();
    redraw();
  };

  const groupIn = (t: Element) => {
    const e = t.closest<HTMLElement>(`.${groupCss.group}`);
    return e ? groupEl.get(e) : undefined;
  };

  const edge = (g: Inst, out: boolean, node: number, _j: number): Pt => {
    const list = out ? g.outs : g.ins,
      [x, y, w, h] = g.rect;
    const i = list.findIndex((e) => +e.dataset.n! === node);
    return [x + (out ? w : 0), y + (h * (i + 1)) / (list.length + 1)];
  };

  // Input nodes only have an output in a definition, Output nodes only an input.
  const socks = (node: number, out: boolean): Sock[] => {
    const k = wasm.node_kind(node);
    if ((k === GIN && !out) || (k === GOUT && out)) return [];
    return Array.from({ length: sockets(node)[+out] }, (_, j) => ({ node, out, j }));
  };
  const portSocks = (g: Inst, out: boolean): Sock[] =>
    (out ? g.outs : g.ins).map((el) => ({ node: +el.dataset.n!, out, j: 0 }));

  const layout = (g: Inst, f: Float32Array, driven: Set<number>) => {
    g.body
      .querySelectorAll<HTMLElement>(`.${knobCss.knob}`)
      .forEach((k) => paint(k, rowOwner.get(k)!, f, driven));
    const bits = flagsOf(g);
    g.body
      .querySelectorAll<HTMLElement>(`.${nodeCss.flag}`)
      .forEach((b) => b.classList.toggle(nodeCss.active, !!(bits & (1 << +b.dataset.b!))));
    const s = g.el.style;
    s.width = `${GW}px`;
    s.minHeight = `${GHEAD + 16 * Math.max(g.ins.length, g.outs.length)}px`;
    g.rect = [g.pos[0], g.pos[1], GW, g.el.offsetHeight];
    s.transform = `translate(${g.pos[0]}px, ${g.pos[1]}px)`;
  };

  // The member node and param index a knob element stands for, with its definition.
  const knobPort = (k: HTMLElement) => {
    const el = k.closest<HTMLElement>(`.${nodeCss.node}`);
    const d = el && defOf(el);
    return d ? { d, p: { el, j: +k.dataset.j! } } : undefined;
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
      // Input/Output only make sense in a definition; its nodes can't hold state outside params
      const port = kind === GIN || kind === GOUT;
      if (tab ? STATEFUL.has(kind) || kind === OUTPUT : port) return;
      if (spawn(kind, x, y, tab)) changed();
    },

    load() {
      [...root.children].forEach(unmountNode);
      insts.splice(0).forEach((g) => g.el.remove());
      defs.length = 0;
      membership.clear();
      picked.clear();
      tab = "";
      applyTab();
      for (let i = 0; i < wasm.nodes_len(); i++) {
        const [p, k] = [wasm.get_node(i), wasm.node_kind(i)];
        // size is derived, not trusted
        f32().set(sizeOf(k), (p >> 2) + 2);
        mount(i, p, k);
        hideSocks(root.lastElementChild as HTMLElement);
      }
      changed();
    },

    sync(driven: Set<number>): Float32Array {
      const f = f32(),
        u = u8();
      layer.style.transform = root.style.transform;
      // params that follow another are driven too
      for (const d of defs)
        for (const q of d.params)
          for (const t of q.targets.slice(1))
            driven.add(wasm.get_param(+t.el.dataset.n!, t.j));
      // other tabs' nodes and instances' copies are skipped everywhere, so z-order = index here
      const els = visible();
      const inst = new Float32Array((els.length + insts.length) * STRIDE);
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const p = +el.dataset.p!;
        const auto = ui[nodes[+el.dataset.k!].name]?.auto;
        if (auto) {
          // dynamic height: the DOM decides, wasm (sockets, ropes, glow, groups) follows
          el.style.width = `${f[(p >> 2) + 2]}px`;
          el.style.height = "";
          f[(p >> 2) + 3] = el.offsetHeight;
        }
        const [x, y, w, h] = f.subarray(p >> 2, (p >> 2) + 4);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.width = `${w}px`;
        if (!auto) el.style.height = `${h}px`;
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
      // instances are drawn like nodes (occlude ropes, glow), after them
      let n = els.length;
      if (!tab)
        for (const g of insts) {
          layout(g, f, driven);
          inst.set([...g.rect, n++, 2], (n - 1) * STRIDE);
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
      // instances are drawn after the nodes: waveform of their first output
      let order = els.length;
      if (!tab)
        for (const g of insts) {
          const sc = g.body.querySelector<HTMLElement>(`.${nodeCss.scope}`);
          const o = g.outs[0];
          const len = sc && o ? wasm.scope_fill(+o.dataset.n!, 0) : 0;
          if (sc && len >= 2) {
            const [ox, oy] = offsetIn(sc, g.el);
            out.push({
              rect: [g.rect[0] + ox, g.rect[1] + oy, sc.offsetWidth, sc.offsetHeight],
              order,
              color: GREEN,
              pts: new Float32Array(wasm.memory.buffer, wasm.scope_ptr(), len).slice(),
            });
          }
          order++;
        }
      return out;
    },

    images(): ImageDraw[] {
      const out: ImageDraw[] = [];
      const els = visible();
      for (let order = 0; order < els.length; order++) {
        const el = els[order];
        const [x, y] = f32().subarray(at(el), at(el) + 2);
        el.querySelectorAll<HTMLElement>("[data-img]").forEach((c) => {
          const [ox, oy] = offsetIn(c, el);
          const cx = x + ox + c.clientLeft,
            cy = y + oy + c.clientTop;
          const v = imageViews.get(c)?.(c.clientWidth, c.clientHeight);
          if (!v) return;
          out.push({
            order,
            src: v.src,
            clip: [cx, cy, c.clientWidth, c.clientHeight],
            img: [cx + v.img[0], cy + v.img[1], v.img[2], v.img[3]],
            box: [cx + v.box[0], cy + v.box[1], cx + v.box[2], cy + v.box[3]],
          });
        });
      }
      return out;
    },

    panels(): PanelDraw[] {
      const out: PanelDraw[] = [];
      const els = visible();
      for (let order = 0; order < els.length; order++) {
        const el = els[order];
        const [x, y] = f32().subarray(at(el), at(el) + 2);
        el.querySelectorAll<HTMLElement>("[data-panel]").forEach((c) => {
          const [ox, oy] = offsetIn(c, el);
          const cx = x + ox + c.clientLeft,
            cy = y + oy + c.clientTop;
          const v = panelViews.get(c)?.(c.clientWidth, c.clientHeight);
          if (!v) return;
          const at = (r: number[]) => {
            const a = Float32Array.from(r);
            for (let i = 0; i < a.length; i += 8)
              ((a[i] += cx), (a[i + 1] += cy));
            return a;
          };
          out.push({
            order,
            clip: [cx, cy, c.clientWidth, c.clientHeight],
            peaks: v.peaks,
            color: v.color,
            under: at(v.under),
            over: at(v.over),
          });
        });
      }
      return out;
    },

    // null ends: no rope (inside an instance, or in another tab)
    *links(): Generator<[number, Pt | null, Pt | null]> {
      const els = byIndex();
      for (let i = 0; i < wasm.links_len(); i++) {
        const [s, ss, t, ts] = ends(i);
        const [a, b] = [els.get(s), els.get(t)];
        // no DOM here = a guide demo's link, parked in this graph
        const gs = shut(a);
        const gone = !a || !b || (gs && gs === shut(b));
        const host = (e?: HTMLElement) => (e && membership.has(e) ? !tab : e && shown(e));
        if (gone || !host(a) || !host(b)) {
          yield [i, null, null];
          continue;
        }
        yield [
          i,
          socketPos({ node: s, out: true, j: ss }, els),
          socketPos({ node: t, out: false, j: ts }, els),
        ];
      }
    },

    connect(a: Sock, b: Sock): number {
      const [s, t] = a.out ? [a, b] : [b, a];
      return a.out === b.out ? -1 : wasm.add_link(s.node, s.j, t.node, t.j);
    },

    // connect(), but a link already into that input is kept: both go through a new Add node
    // placed left of the input, which then replaces the old link (add_link overwrites in place).
    merge(a: Sock, b: Sock): number {
      const [s, t] = a.out ? [a, b] : [b, a];
      if (a.out === b.out) return -1;
      let old = -1;
      for (let i = 0; i < wasm.links_len(); i++)
        if (ends(i)[2] === t.node && ends(i)[3] === t.j) old = i;
      const kind = nodes.findIndex((n) => n.name === "Add");
      const n = wasm.nodes_len();
      if (old < 0) return this.connect(s, t);
      const [w, h] = sizeOf(kind);
      const [tx, ty] = socketPos(t);
      this.add(kind, tx - w - 48, ty - h / 2);
      if (wasm.nodes_len() === n) return this.connect(s, t);
      const [os, oj] = ends(old);
      wasm.add_link(os, oj, n, 0);
      wasm.add_link(s.node, s.j, n, 1);
      return wasm.add_link(n, 0, t.node, t.j);
    },

    unlink(i: number): number {
      const last = wasm.links_len() - 1;
      wasm.remove_link(i);
      return last;
    },

    // Closest free-side socket of whatever `hit` is (a node, or an instance) to world point `w`.
    nearest(from: Sock, hit: Element, [x, y]: Pt): Sock | null {
      const g = tab ? undefined : groupIn(hit);
      const el = hit.closest<HTMLElement>(`.${nodeCss.node}`);
      const list = g
        ? portSocks(g, !from.out)
        : el && shown(el)
          ? socks(+el.dataset.n!, !from.out)
          : [];
      const els = byIndex();
      let best: Sock | null = null,
        d = Infinity;
      for (const s of list) {
        if (s.node === from.node) continue;
        const [sx, sy] = socketPos(s, els);
        const e = (sx - x) ** 2 + (sy - y) ** 2;
        if (e < d) ((d = e), (best = s));
      }
      return best;
    },

    targets(from: Sock): Pt[] {
      const els = byIndex();
      const all = [...els]
        .filter(([, el]) => shown(el))
        .flatMap(([node]) => socks(node, !from.out));
      if (!tab) for (const g of insts) all.push(...portSocks(g, !from.out));
      return all.filter((s) => s.node !== from.node).map((s) => socketPos(s, els));
    },

    raise: (el: HTMLElement) => root.append(el),

    outputTable(): Float32Array<ArrayBuffer> {
      let first = -1;
      Array.from(root.children as HTMLCollectionOf<HTMLElement>).forEach(
        (el) => {
          const n = +el.dataset.n!;
          if (!spaceOf(el) && +el.dataset.k! === OUTPUT && (first < 0 || n < first))
            first = n;
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
      const g = membership.get(el);
      if (g) return removeInst(g); // a copy is not the user's to delete alone
      picked.delete(el);
      const d = defOf(el);
      if (d) unbind(d, (p) => p.el === el);
      drop(el);
      changed();
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

    // ---- custom nodes ----

    /** Which knob's real node: an instance's knob edits a hidden copy. */
    owner,
    defOf,
    groupAt: groupIn,
    picked: () => [...picked],
    select(el: HTMLElement) {
      picked.has(el) ? picked.delete(el) : picked.add(el);
      el.classList.toggle(nodeCss.sel, picked.has(el));
    },
    deselect,

    tab: () => tab,
    defs: () => defs,
    open,
    newDef,
    removeDef,
    renameDef(d: Def, name: string) {
      d.name = name.trim().slice(0, NAME_MAX) || d.name;
      insts.filter((g) => g.def === d).forEach(render);
      changed();
    },
    addParam(d: Def, name: string) {
      d.params.push({ name: name.trim().slice(0, NAME_MAX) || "Param", targets: [] });
      changed();
    },
    renameParam(q: GParam, name: string) {
      q.name = name.trim().slice(0, NAME_MAX) || q.name;
      changed();
    },
    removeParam(d: Def, q: GParam) {
      q.targets.forEach((t) => follow(t, t, false));
      d.params.splice(d.params.indexOf(q), 1);
      changed();
    },
    /** Make a definition's knob part of the param `name`; a knob is in one param. */
    linkParam(k: HTMLElement, name: string, inv = false) {
      const x = knobPort(k);
      if (!x) return;
      this.unlinkParam(k);
      const { d, p } = x;
      let q = d.params.find((q) => q.name === name);
      if (!q) d.params.push((q = { name: name.slice(0, NAME_MAX), targets: [] }));
      q.targets.push(q.targets.length ? { ...p, inv } : p); // the first one is the master
      if (q.targets.length > 1) follow(q.targets.at(-1)!, q.targets[0], true);
      changed();
    },
    unlinkParam(k: HTMLElement) {
      const x = knobPort(k);
      if (!x) return;
      unbind(x.d, (t) => sameKnob(t, x.p));
      changed();
    },
    paramOf(k: HTMLElement) {
      const x = knobPort(k);
      return x?.d.params.find((q) => q.targets.some((t) => sameKnob(t, x.p)));
    },

    // Why the selection can't become a custom node, if so.
    defineBlocked(): string | undefined {
      if (tab) return "Only from the main tab";
      if (!picked.size) return "Select nodes first";
      for (const e of picked) {
        const k = +e.dataset.k!;
        if (k === OUTPUT || k === GIN || k === GOUT || STATEFUL.has(k) || membership.has(e))
          return "Output, Data, Math, Waveshaper and Draw Filter can't be part of one";
      }
    },

    /** The selected nodes become a definition (a new tab) and are replaced by one instance. */
    define(): Inst | undefined {
      if (this.defineBlocked()) return;
      const sel = [...picked].sort(byN);
      const mine = new Set(sel);
      deselect();
      const d = newDef();
      const els = byIndex();
      const cross: [HTMLElement, number, HTMLElement, number][] = [];
      for (let i = 0; i < wasm.links_len(); i++) {
        const [s, ss, t, ts] = ends(i);
        const [a, b] = [els.get(s), els.get(t)];
        if (a && b && mine.has(a) !== mine.has(b)) cross.push([a, ss, b, ts]);
      }
      const box = sel.map((e) => f32().subarray(at(e), at(e) + 4));
      const x0 = Math.min(...box.map((b) => b[0])),
        y0 = Math.min(...box.map((b) => b[1])),
        x1 = Math.max(...box.map((b) => b[0] + b[2]));
      sel.forEach((e) => (e.dataset.s = d.id));
      // one Input per crossing link into the selection, one Output per distinct source out of it
      const ins: [HTMLElement, number][] = [],
        outs: [HTMLElement, number][] = [];
      for (const [a, ss, b, ts] of cross) {
        if (mine.has(b)) ins.push([b, ts]);
        else if (!outs.some(([e, j]) => e === a && j === ss)) outs.push([a, ss]);
      }
      ins.forEach(([b, ts], k) => {
        const p = spawn(GIN, x0 - 200, y0 + 70 * k, d.id);
        if (p) wasm.add_link(+p.dataset.n!, 0, +b.dataset.n!, ts);
      });
      outs.forEach(([a, ss], k) => {
        const p = spawn(GOUT, x1 + 40, y0 + 70 * k, d.id);
        if (p) wasm.add_link(+a.dataset.n!, ss, +p.dataset.n!, 0);
      });
      const g = addInst(d, x0, y0);
      // the old crossing links are overwritten: every one ends on a socket that gets a new source
      for (const [a, ss, b, ts] of cross) {
        if (mine.has(b)) {
          const k = ins.findIndex(([e, j]) => e === b && j === ts);
          if (g.ins[k]) wasm.add_link(+a.dataset.n!, ss, +g.ins[k].dataset.n!, 0);
        } else {
          const k = outs.findIndex(([e, j]) => e === a && j === ss);
          if (g.outs[k]) wasm.add_link(+g.outs[k].dataset.n!, 0, +b.dataset.n!, ts);
        }
      }
      applyTab();
      changed();
      return g;
    },

    addInst(d: Def, x: number, y: number) {
      if (tab) return;
      const g = addInst(d, x, y);
      changed();
      return g;
    },
    removeInst,
    duplicateInst(g: Inst) {
      const c = addInst(g.def, g.pos[0] + 24, g.pos[1] + 24);
      for (const q of g.def.params) {
        const [a, b] = [masterOf(g, q), masterOf(c, q)];
        if (a && b) f32()[slot(b)] = f32()[slot(a)];
      }
      setFlags(c, flagsOf(g));
      changed();
      return c;
    },
    instPos: (g: Inst): Pt => [g.pos[0], g.pos[1]],
    moveInst(g: Inst, x: number, y: number) {
      g.pos = [x, y];
    },

    // What the file stores. `space`: "" main, a definition id, "i" an instance's copy; `port`: which
    // instance port a copy is (its links are the instance's links).
    snapshot() {
      const spaces = new Map<number, string>();
      const port = new Map<number, { inst: number; out: boolean; port: number }>();
      for (const [n, e] of byIndex()) {
        const g = membership.get(e);
        spaces.set(n, g ? "i" : spaceOf(e));
        if (!g) continue;
        const [i, o] = [g.ins.indexOf(e), g.outs.indexOf(e)];
        const inst = insts.indexOf(g);
        if (i >= 0) port.set(n, { inst, out: false, port: i });
        if (o >= 0) port.set(n, { inst, out: true, port: o });
      }
      return {
        space: spaces,
        port,
        defs: defs.map(
          (d): DefSpec => ({
            id: d.id,
            name: d.name,
            nodes: dom()
              .filter((e) => spaceOf(e) === d.id)
              .sort(byN)
              .map((e) => +e.dataset.n!),
            params: d.params.map((q) => ({
              name: q.name,
              targets: q.targets.map((t) => ({ n: +t.el.dataset.n!, j: t.j, inv: t.inv })),
            })),
          }),
        ),
        insts: insts.map(
          (g): InstSpec => ({
            def: g.def.id,
            x: g.pos[0],
            y: g.pos[1],
            flags: flagsOf(g),
            vals: g.def.params.map((q) => {
              const m = masterOf(g, q);
              return m ? f32()[slot(m)] : 0;
            }),
          }),
        ),
      };
    },

    // After load(): node indices are valid again. Tags the definitions' nodes and expands the
    // instances; anything pointing at something missing is dropped.
    restore({ defs: ds, insts: is, links }: Restore) {
      const els = byIndex();
      for (const s of ds) {
        const d: Def = { id: s.id, name: s.name.slice(0, NAME_MAX), params: [] };
        const mine = new Set<HTMLElement>();
        for (const n of s.nodes) {
          const e = els.get(n);
          if (!e) continue;
          e.dataset.s = d.id;
          mine.add(e);
        }
        const used: Port[] = [];
        d.params = s.params.map((q) => ({
          name: q.name.slice(0, NAME_MAX),
          targets: q.targets.flatMap((t): Port[] => {
            const el = els.get(t.n);
            if (!el || !mine.has(el) || wasm.get_param(t.n, t.j) < 0) return [];
            const p = { el, j: t.j, inv: !!t.inv };
            if (used.some((u) => sameKnob(u, p))) return [];
            used.push(p);
            return [p];
          }),
        }));
        for (const q of d.params) {
          if (q.targets[0]) q.targets[0].inv = false;
          q.targets.slice(1).forEach((f) => follow(f, q.targets[0], true));
        }
        defs.push(d);
      }
      applyTab();
      const made = is.map((s) => {
        const d = defs.find((d) => d.id === s.def);
        if (!d) return;
        const g = addInst(d, s.x, s.y);
        d.params.forEach((q, k) => {
          const m = masterOf(g, q);
          const v = s.vals[k];
          if (m && Number.isFinite(v)) f32()[slot(m)] = Math.min(1, Math.max(0, v));
        });
        setFlags(g, s.flags & 7);
        return g;
      });
      const end = (e: EndSpec, out: boolean, sock: number): [HTMLElement, number] | undefined => {
        if (typeof e === "number") {
          const el = els.get(e);
          return el && [el, sock];
        }
        const g = made[e.i];
        const el = g && (out ? g.outs : g.ins)[sock];
        return el && [el, 0];
      };
      for (const [a, sa, b, sb] of links) {
        const [x, y] = [end(a, true, sa), end(b, false, sb)];
        if (x && y) wasm.add_link(+x[0].dataset.n!, x[1], +y[0].dataset.n!, y[1]);
      }
      changed();
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
      const bit = 1 << +b.dataset.b!;
      const g = groupIn(b);
      const els = g ? g.outs : [b.closest<HTMLElement>(`.${nodeCss.node}`)!];
      const on = !els.every((e) => u8()[+e.dataset.p! + FLAGS_AT] & bit);
      for (const e of els) {
        const p = +e.dataset.p! + FLAGS_AT;
        u8()[p] = on ? u8()[p] | bit : u8()[p] & ~bit;
      }
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

    socket: (el: HTMLElement): Sock =>
      portSock.get(el)?.() ?? {
        node: +el.dataset.n!,
        out: el.dataset.o === "1",
        j: +el.dataset.j!,
      },
  };
}

export type Scene = ReturnType<typeof createScene>;
