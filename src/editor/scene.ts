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

// A group is a custom node built over real nodes. Wasm never hears about the group itself, only
// about params that mirror each other (param_follow). Expanded it is an outline round the members;
// collapsed (`shut`) it is one box with the sockets and params it exposes.
// Members are tracked by element (stable across removals, unlike node indices).
type Port = { el: HTMLElement; j: number }; // a socket or param of a member node
type GParam = { name: string; targets: Port[] }; // targets[0] is the knob shown, the rest follow it
export type Group = {
  name: string;
  shut: boolean;
  members: HTMLElement[];
  ins: Port[]; // inner input sockets, in order
  outs: Port[];
  params: GParam[];
  el: HTMLElement;
  body: HTMLElement;
  rect: [number, number, number, number];
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
  const changed = () => {
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
  const portSock = new WeakMap<HTMLElement, () => Sock>(); // collapsed group's socket -> inner socket
  const picked = new Set<HTMLElement>();
  // Same transform as the grid (copied in sync). It has to sit after the grid, which covers the
  // whole area and would otherwise swallow every click meant for a group.
  const layer = Object.assign(document.createElement("div"), {
    className: groupCss.layer,
  });
  root.after(layer);

  const shut = (el?: HTMLElement) => {
    const g = el && membership.get(el);
    return g?.shut ? g : undefined;
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

  const follow = (f: Port, m: Port, on: boolean) =>
    wasm.param_follow(+f.el.dataset.p!, f.j, +m.el.dataset.p!, m.j, +on as bool);
  const sameKnob = (a: Port, b: Port) => a.el === b.el && a.j === b.j;

  // Drops the params' targets matching `gone`; when the master goes, the next one takes over.
  const unbind = (g: Group, gone: (p: Port) => boolean) => {
    for (const q of g.params) {
      const rest = q.targets.filter((t) => !gone(t));
      if (rest.length === q.targets.length) continue;
      const masterGone = gone(q.targets[0]);
      q.targets.filter(gone).forEach((t) => follow(t, t, false));
      q.targets = rest;
      if (masterGone && rest.length) {
        follow(rest[0], rest[0], false);
        rest.slice(1).forEach((f) => follow(f, rest[0], true));
      }
    }
    g.params = g.params.filter((q) => q.targets.length);
  };

  // Every link crossing the group's border gets a port, so a collapsed group never hides a link.
  const adopt = (g: Group) => {
    const els = byIndex();
    const inside = new Set(g.members);
    const add = (list: Port[], p: Port) =>
      list.some((x) => sameKnob(x, p)) || list.push(p);
    for (let i = 0; i < wasm.links_len(); i++) {
      const [s, ss, t, ts] = ends(i);
      const [a, b] = [els.get(s), els.get(t)];
      if (!a || !b || inside.has(a) === inside.has(b)) continue;
      inside.has(a) ? add(g.outs, { el: a, j: ss }) : add(g.ins, { el: b, j: ts });
    }
  };

  const render = (g: Group) => {
    g.el.toggleAttribute("data-shut", g.shut);
    g.members.forEach((m) => (m.style.display = g.shut ? "none" : ""));
    const btn = g.el.querySelector<HTMLElement>(`.${groupCss.mode}`)!;
    btn.textContent = g.shut ? "▸" : "▾";
    btn.title = g.shut ? "Expand" : "Collapse";
    g.el.querySelectorAll(`.${nodeCss.socket}`).forEach((e) => e.remove());
    g.body.replaceChildren();
    if (g.shut) {
      for (const out of [false, true]) {
        const list = out ? g.outs : g.ins;
        list.forEach((p, j) => {
          const t = (j + 1) / (list.length + 1);
          const s = div(nodeCss.socket);
          s.style.left = out ? "calc(100% + 2px)" : "-2px";
          s.style.top = `calc(${100 * t}% + ${4 * t - 2}px)`;
          portSock.set(s, () => ({ node: +p.el.dataset.n!, out, j: p.j }));
          g.el.append(s);
        });
      }
      for (const q of g.params) {
        const m = q.targets[0];
        const k = div(knobCss.knob);
        k.dataset.a = `${wasm.get_param(+m.el.dataset.n!, m.j)}`;
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
    }
    redraw();
  };

  const makeGroup = (members: HTMLElement[], name: string, shut: boolean) => {
    const nameBox = Object.assign(document.createElement("input"), {
      className: groupCss.name,
      value: name,
      maxLength: NAME_MAX,
      spellcheck: false,
      autocomplete: "off",
      readOnly: true, // the title bar drags the group; "Rename" in its menu edits the name
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
      shut,
      members,
      ins: [],
      outs: [],
      params: [],
      el,
      body,
      rect: [0, 0, 0, 0],
    };
    nameBox.oninput = () => (g.name = nameBox.value);
    // double-click on the grid opens the add menu; knobs still need it to reset
    el.ondblclick = (e) => {
      if (!(e.target as HTMLElement).closest(`.${knobCss.knob}`)) e.stopPropagation();
    };
    nameBox.onblur = () => (nameBox.readOnly = true);
    nameBox.onkeydown = (e) => {
      e.stopPropagation(); // no hotkeys while typing
      if (e.key === "Enter" || e.key === "Escape") nameBox.blur();
    };
    btn.onclick = () => fold(g);
    groups.push(g);
    groupEl.set(el, g);
    members.forEach((m) => membership.set(m, g));
    layer.append(el);
    adopt(g); // the starting interface: whatever is wired across the border
    render(g);
    return g;
  };

  const groupIn = (t: Element) => {
    const e = t.closest<HTMLElement>(`.${groupCss.group}`);
    return e ? groupEl.get(e) : undefined;
  };
  // Flags act on the nodes behind the group's outputs.
  const outNodes = (g: Group) => [...new Set(g.outs.map((p) => p.el))];

  const rename = (g: Group) => {
    const b = g.el.querySelector<HTMLInputElement>(`.${groupCss.name}`)!;
    b.readOnly = false;
    // after the menu click has finished, or its mouseup takes the focus back
    setTimeout(() => (b.focus(), b.select()));
  };

  const fold = (g: Group) => {
    g.shut = !g.shut;
    if (g.shut) adopt(g); // links made while it was open
    render(g);
  };

  const dissolve = (g: Group) => {
    unbind(g, () => true);
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
    unbind(g, (p) => p.el === el);
    g.ins = g.ins.filter((p) => p.el !== el);
    g.outs = g.outs.filter((p) => p.el !== el);
    g.members.length ? render(g) : dissolve(g);
  };

  const deselect = () => {
    picked.forEach((e) => e.classList.remove(nodeCss.sel));
    picked.clear();
  };

  const edge = (g: Group, out: boolean, node: number, j: number): Pt => {
    const list = out ? g.outs : g.ins,
      [x, y, w, h] = g.rect;
    const i = list.findIndex((p) => +p.el.dataset.n! === node && p.j === j);
    return [x + (out ? w : 0), y + (h * (i + 1)) / (list.length + 1)];
  };

  const socks = (node: number, out: boolean): Sock[] =>
    Array.from({ length: sockets(node)[+out] }, (_, j) => ({ node, out, j }));
  const portSocks = (g: Group, out: boolean): Sock[] =>
    (out ? g.outs : g.ins).map((p) => ({ node: +p.el.dataset.n!, out, j: p.j }));

  const layout = (g: Group, f: Float32Array, driven: Set<number>) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const m of g.members) {
      const i = at(m);
      x0 = Math.min(x0, f[i]);
      y0 = Math.min(y0, f[i + 1]);
      x1 = Math.max(x1, f[i] + f[i + 2]);
      y1 = Math.max(y1, f[i + 1] + f[i + 3]);
    }
    const s = g.el.style;
    if (g.shut) {
      g.body
        .querySelectorAll<HTMLElement>(`.${knobCss.knob}`)
        .forEach((k) => paint(k, rowOwner.get(k)!, f, driven));
      const ns = outNodes(g);
      g.body.querySelectorAll<HTMLElement>(`.${nodeCss.flag}`).forEach((b) =>
        b.classList.toggle(
          nodeCss.active,
          !!ns.length && ns.every((e) => u8()[+e.dataset.p! + FLAGS_AT] & (1 << +b.dataset.b!)),
        ),
      );
      s.width = `${GW}px`;
      s.height = "";
      s.minHeight = `${GHEAD + 16 * Math.max(g.ins.length, g.outs.length)}px`;
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

  // The member node and param index a knob element stands for, with its group.
  const knobPort = (k: HTMLElement) => {
    const el = k.closest<HTMLElement>(`.${nodeCss.node}`);
    const g = el && membership.get(el);
    return g ? { g, p: { el, j: +k.dataset.j! } } : undefined;
  };
  const sockPort = (s: HTMLElement) => {
    const el = s.closest<HTMLElement>(`.${nodeCss.node}`);
    const g = el && membership.get(el);
    return g
      ? { g, out: s.dataset.o === "1", p: { el, j: +s.dataset.j! } }
      : undefined;
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
      // params that follow another are driven too
      for (const g of groups)
        for (const q of g.params)
          for (const t of q.targets.slice(1))
            driven.add(wasm.get_param(+t.el.dataset.n!, t.j));
      // nodes hidden inside a collapsed group are skipped everywhere, so z-order = index here
      const els = visible();
      const inst = new Float32Array((els.length + groups.length) * STRIDE);
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
      // collapsed groups are drawn like nodes (occlude ropes, glow); open ones are plain frames
      let n = els.length;
      for (const g of groups) {
        layout(g, f, driven);
        if (g.shut) inst.set([...g.rect, n++, 2], (n - 1) * STRIDE);
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
      // collapsed groups are drawn after the nodes: waveform of their first output
      let order = els.length;
      for (const g of groups) {
        if (!g.shut) continue;
        const sc = g.body.querySelector<HTMLElement>(`.${nodeCss.scope}`);
        const o = g.outs[0];
        if (sc && o) {
          const len = wasm.scope_fill(+o.el.dataset.n!, 2 + o.j);
          if (len >= 2) {
            const [ox, oy] = offsetIn(sc, g.el);
            out.push({
              rect: [g.rect[0] + ox, g.rect[1] + oy, sc.offsetWidth, sc.offsetHeight],
              order,
              color: GREEN,
              pts: new Float32Array(wasm.memory.buffer, wasm.scope_ptr(), len).slice(),
            });
          }
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

    // null ends: the link lies inside a collapsed group, so it has no rope
    *links(): Generator<[number, Pt | null, Pt | null]> {
      const els = byIndex();
      for (let i = 0; i < wasm.links_len(); i++) {
        const [s, ss, t, ts] = ends(i);
        const [gs, gt] = [shut(els.get(s)), shut(els.get(t))];
        // no DOM here = a guide demo's link, parked in this graph: no rope
        if ((gs && gs === gt) || !els.has(s) || !els.has(t)) {
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

    // Closest free-side socket of whatever `hit` is (a node, or a collapsed group) to world point `w`.
    nearest(from: Sock, hit: Element, [x, y]: Pt): Sock | null {
      const g = groupIn(hit);
      const el = hit.closest<HTMLElement>(`.${nodeCss.node}`);
      const list = g?.shut
        ? portSocks(g, !from.out)
        : el
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
        .filter(([, el]) => !shut(el))
        .flatMap(([node]) => socks(node, !from.out));
      for (const g of groups) if (g.shut) all.push(...portSocks(g, !from.out));
      return all.filter((s) => s.node !== from.node).map((s) => socketPos(s, els));
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
    groupAt: groupIn,
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
      return makeGroup(m, `Node ${groups.length + 1}`, false);
    },

    ungroup: dissolve,
    fold,
    rename,

    // ---- the group's interface: right-click a member's socket / knob ----
    exposed(s: HTMLElement) {
      const x = sockPort(s);
      return !!x && (x.out ? x.g.outs : x.g.ins).some((p) => sameKnob(p, x.p));
    },
    expose(s: HTMLElement) {
      const x = sockPort(s);
      if (!x) return;
      const list = x.out ? x.g.outs : x.g.ins;
      const i = list.findIndex((p) => sameKnob(p, x.p));
      i < 0 ? list.push(x.p) : list.splice(i, 1);
      render(x.g);
    },
    paramOf(k: HTMLElement) {
      const x = knobPort(k);
      return x?.g.params.find((q) => q.targets.some((t) => sameKnob(t, x.p)));
    },
    /** Make a member's knob part of the group param `name` (new if there is none); a knob is in one param. */
    linkParam(k: HTMLElement, name: string) {
      const x = knobPort(k);
      if (!x) return;
      this.unlinkParam(k);
      const { g, p } = x;
      let q = g.params.find((q) => q.name === name);
      if (!q) g.params.push((q = { name: name.slice(0, NAME_MAX), targets: [] }));
      q.targets.push(p);
      if (q.targets.length > 1) follow(p, q.targets[0], true);
      render(g);
    },
    unlinkParam(k: HTMLElement) {
      const x = knobPort(k);
      if (!x) return;
      unbind(x.g, (t) => sameKnob(t, x.p));
      render(x.g);
    },

    // Copies the members (params, flags), the links between them and the interface, as one new group.
    duplicateGroup(g: Group) {
      const copies = new Map<HTMLElement, HTMLElement>(); // member -> copy
      for (const m of g.members) {
        const c = this.duplicate(m);
        if (c) copies.set(m, c);
      }
      const idx = (e: HTMLElement) => +e.dataset.n!;
      const was = new Map([...copies].map(([m, c]) => [idx(m), c]));
      for (let i = 0, n = wasm.links_len(); i < n; i++) {
        const [s, ss, t, ts] = ends(i);
        const [a, b] = [was.get(s), was.get(t)];
        if (a && b) wasm.add_link(idx(a), ss, idx(b), ts);
      }
      if (!copies.size) return;
      const c = makeGroup(
        [...copies.values()],
        `${g.name} copy`.slice(0, NAME_MAX),
        g.shut,
      );
      const map = (ps: Port[]) =>
        ps.flatMap((p) => (copies.has(p.el) ? { el: copies.get(p.el)!, j: p.j } : []));
      c.ins = map(g.ins);
      c.outs = map(g.outs);
      c.params = g.params
        .map((q) => ({ name: q.name, targets: map(q.targets) }))
        .filter((q) => q.targets.length);
      c.params.forEach((q) => q.targets.slice(1).forEach((f) => follow(f, q.targets[0], true)));
      render(c);
    },

    // The file still stores the old group shape: name, 0 open / 1 collapsed, members.
    // The interface (ports, params) is not saved yet; restore() derives ports again.
    list: () =>
      groups.map((g) => ({
        name: g.name,
        mode: +g.shut,
        nodes: g.members.map((m) => +m.dataset.n!),
      })),

    // After load(): node indices are valid again, so groups can be rebuilt over them.
    restore(list: { name: string; mode: number; nodes: number[] }[]) {
      const els = byIndex();
      for (const { name, mode, nodes: ns } of list) {
        const m = [...new Set(ns)]
          .map((n) => els.get(n))
          .filter((e): e is HTMLElement => !!e && !membership.has(e));
        if (m.length) makeGroup(m, name.slice(0, NAME_MAX), mode > 0);
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
      const bit = 1 << +b.dataset.b!;
      const g = groupIn(b);
      const els = g ? outNodes(g) : [b.closest<HTMLElement>(`.${nodeCss.node}`)!];
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
