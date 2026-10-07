import {
  createContext,
  createSignal,
  onCleanup,
  Show,
  useContext,
  type Component,
  type JSX,
} from "solid-js";
import { render } from "solid-js/web";
import { flagLabels, nodes } from "../../generated/nodes";
import { RADIUS } from "../../gfx/overlay";
import type { WasmExports } from "../../wasm";
import knobCss from "./knob.module.css";
import nodeCss from "./node.module.css";

// Node API. A node view is any component built from these pieces.
// Per-frame state (knob --v / .driven / .pval text, flag .active, scope
// overlay rects) is written by scene.sync/scopes by class name, so any
// markup that uses <Knob>, <Flag> and <Scope> stays live and draggable.
//
// Derived UI: scene.sync sets each param's raw value as `--p<j>` on the .node,
// so any element can read it in CSS, e.g. left: calc(var(--p0) * 100%).
//
// Params from code: useParam(j) gives { get, set, value, setValue, norm, denorm,
// info } for custom controls and visuals (canvas, SVG, anything CSS vars can't
// express). get/set work in the raw normalized 0..1 the engine stores; value/
// setValue/norm/denorm convert through the engine's own mapping (linear, log,
// int, enum), so nothing here needs to know a param's range. `get` and `value`
// are Solid accessors, refreshed every frame by scene.sync, so they follow
// knobs, keyframes and automation. Writes redraw. A custom control must
// stopPropagation() its pointerdown, or the grid will start dragging the node (and
// re-append it, which eats the click). Use Solid's native `on:pointerdown`: `onPointerDown`
// is delegated to document and runs after the grid's own listener, too late to stop it.
//
// Knob contract: sets `--v` (0..1) on the .knob and fills its `.pval`
// child with the value text. Custom children may use either or both.

export type ParamInfo = {
  n: string;
  o?: readonly string[];
  u?: string;
  d: number;
};

type NodeInit = {
  wasm: WasmExports;
  i: number;
  kind: number;
  p: number;
  redraw: () => void;
};
type Ctx = NodeInit & { polls: Set<() => void>; el?: HTMLElement };
const NodeCtx = createContext<Ctx>();
export const useNode = () => useContext(NodeCtx)!;

const params = (kind: number) => nodes[kind].params as readonly ParamInfo[];

export function useParam(j: number) {
  const { wasm, i, kind, polls, redraw, el } = useNode();
  const a = wasm.get_param(i, j) >> 2; // addresses are stable for the node's life
  // Node indices shift when an earlier node is removed; the element's data-n tracks it.
  const n = () => +el!.dataset.n!;
  const cell = () => new Float32Array(wasm.memory.buffer);
  const [get, put] = createSignal(cell()[a]);
  const poll = () => put(cell()[a]);
  polls.add(poll);
  onCleanup(() => polls.delete(poll));
  const set = (v: number) => {
    cell()[a] = Math.min(1, Math.max(0, v));
    poll();
    redraw();
  };
  const norm = (d: number) => wasm.param_norm(n(), j, d);
  const denorm = (v: number) => wasm.param_denorm(n(), j, v);
  return {
    get,
    set,
    /** Current value in displayed units (dB, Hz, option index...). */
    value: () => denorm(get()),
    setValue: (d: number) => set(norm(d)),
    norm,
    denorm,
    info: params(kind)[j],
  };
}

export function Knob(props: {
  j: number;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
}) {
  const { wasm, i, kind } = useNode();
  return (
    <div
      class={`${knobCss.knob} ${props.class ?? ""}`}
      style={props.style}
      data-a={wasm.get_param(i, props.j)}
      data-j={props.j}
    >
      {props.children ?? (
        <>
          <div class={knobCss.dial} />
          <div class={knobCss.pname}>{params(kind)[props.j].n}</div>
          <div class={knobCss.pval} />
        </>
      )}
    </div>
  );
}

export const Flag = (props: { b: number; class?: string }) => (
  <div class={`${nodeCss.flag} ${props.class ?? ""}`} data-b={props.b}>
    {flagLabels[props.b]}
  </div>
);

export const Scope = (props: {
  w?: number;
  class?: string;
  style?: JSX.CSSProperties;
}) => (
  <div
    class={`${nodeCss.scope} ${props.class ?? ""}`}
    style={props.style}
    data-w={props.w ?? 0}
  />
);

export const Head = () => (
  <div class={nodeCss.head}>
    <div class={nodeCss.title}>{nodes[useNode().kind].name}</div>
  </div>
);

export function Knobs() {
  const n = params(useNode().kind).length;
  return (
    <Show when={n}>
      <div class={nodeCss.knobs}>
        {Array.from({ length: n }, (_, j) => (
          <Knob j={j} />
        ))}
      </div>
    </Show>
  );
}

export const Flags = () => (
  <div class={nodeCss.flags}>
    {flagLabels.map((_, b) => (
      <Flag b={b} />
    ))}
  </div>
);

export function DefaultView() {
  const { wasm, i } = useNode();
  return (
    <>
      <Head />
      <Knobs />
      <Flags />
      <Scope w={0} />
      <Show when={wasm.node_has_widget(i)}>
        <Scope w={1} />
      </Show>
    </>
  );
}

function Sockets(props: { out: boolean }) {
  const { wasm, i } = useNode();
  const n = wasm.node_sockets(i);
  const count = props.out ? n >> 8 : n & 255;
  return Array.from({ length: count }, (_, j) => {
    const t = (j + 1) / (count + 1);
    return (
      <div
        class={nodeCss.socket}
        data-n={i}
        data-o={props.out ? 1 : 0}
        data-j={j}
        style={{
          left: props.out ? "calc(100% + 2px)" : "-2px",
          top: `calc(${100 * t}% + ${4 * t - 2}px)`,
        }}
      />
    );
  });
}

const mounted = new WeakMap<
  Element,
  { dispose: () => void; polls: Set<() => void> }
>();

export function mountNode(
  root: HTMLElement,
  init: NodeInit,
  View: Component = DefaultView,
) {
  const ctx: Ctx = { ...init, polls: new Set() };
  const frag = document.createDocumentFragment();
  const dispose = render(
    () => (
      <NodeCtx.Provider value={ctx}>
        <div
          ref={(e) => (ctx.el = e)}
          class={nodeCss.node}
          data-p={ctx.p}
          data-n={ctx.i}
          data-k={ctx.kind}
          style={{ "border-radius": `${RADIUS}px` }}
        >
          <View />
          <Sockets out={false} />
          <Sockets out />
        </div>
      </NodeCtx.Provider>
    ),
    frag,
  );
  mounted.set(frag.firstElementChild!, { dispose, polls: ctx.polls });
  root.append(frag);
}

export const pollNode = (el: Element) =>
  mounted.get(el)?.polls.forEach((poll) => poll());

export const unmountNode = (el: Element) => {
  mounted.get(el)?.dispose();
  el.remove();
};
