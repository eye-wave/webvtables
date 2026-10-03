import {
  createContext,
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
// Knob contract: sets `--v` (0..1) on the .knob and fills its `.pval`
// child with the value text. Custom children may use either or both.

export type ParamInfo = {
  name: string;
  options?: readonly string[];
  unit?: string;
  default: number;
};

type Ctx = { wasm: WasmExports; i: number; kind: number; p: number };
const NodeCtx = createContext<Ctx>();
export const useNode = () => useContext(NodeCtx)!;

const params = (kind: number) => nodes[kind].params as readonly ParamInfo[];

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
          <div class={knobCss.pname}>{params(kind)[props.j].name}</div>
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

const disposers = new WeakMap<Element, () => void>();

export function mountNode(
  root: HTMLElement,
  ctx: Ctx,
  View: Component = DefaultView,
) {
  const frag = document.createDocumentFragment();
  const dispose = render(
    () => (
      <NodeCtx.Provider value={ctx}>
        <div
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
  disposers.set(frag.firstElementChild!, dispose);
  root.append(frag);
}

export const unmountNode = (el: Element) => {
  disposers.get(el)?.();
  el.remove();
};
