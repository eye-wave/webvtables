// Node guide dialog. The backpack hands over the lazy loader of the node's MDX guide (src/docs/<id>.mdx);
// nodes without one get an auto-generated summary. Guides get <Params />, <Tip> and <Demo>.
import { For, lazy, Show, Suspense, type Component, type JSX } from "solid-js";
import { Dynamic, render } from "solid-js/web";
import { nodes } from "../../generated/nodes";
import css from "./guide.module.css";
import type { DemoProps } from "./demo";

type Node = (typeof nodes)[number];
export type Doc = Component<{ components?: Record<string, Component<any>> }>;
type Param = { n: string; o?: readonly string[]; u?: string };

// Available to every guide as <Params />, built from the node's own metadata so it can't go stale.
const Params = (p: { node: Node }) => (
  <>
    <p class={css.ports}>
      <b>{p.node.inputs}</b> {p.node.inputs === 1 ? "input" : "inputs"} ·{" "}
      <b>{p.node.outputs}</b> {p.node.outputs === 1 ? "output" : "outputs"}
    </p>
    <Show when={p.node.params.length}>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Values</th>
          </tr>
        </thead>
        <tbody>
          <For each={p.node.params as unknown as readonly Param[]}>
            {(q) => (
              <tr>
                <td>{q.n}</td>
                <td>
                  {q.o ? q.o.join(" · ") : q.u ? `number (${q.u})` : "number"}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  </>
);

const LazyDemo = lazy(() => import("./demo"));
const Demo = (p: DemoProps) => (
  <Suspense fallback={<p class={css.empty}>Loading demo…</p>}>
    <LazyDemo {...p} />
  </Suspense>
);

const Tip = (p: { children?: JSX.Element }) => (
  <aside class={css.tip}>{p.children}</aside>
);

let dlg: HTMLDialogElement | undefined;
let title: HTMLElement, host: HTMLElement;
let dispose: (() => void) | undefined;
let current = -1;

function build() {
  const d = document.createElement("dialog");
  d.className = css.guide;
  const head = document.createElement("header");
  title = document.createElement("h2");
  const x = Object.assign(document.createElement("button"), {
    textContent: "×",
    title: "Close",
  });
  x.setAttribute("aria-label", "Close");
  host = document.createElement("div");
  host.className = css.body;
  head.append(title, x);
  d.append(head, host);
  x.onclick = () => d.close();
  d.onclick = (e) => e.target === d && d.close(); // the backdrop
  d.onclose = () => (dispose?.(), (dispose = undefined), (current = -1));
  document.body.append(d);
  return d;
}

export async function openGuide(
  kind: number,
  load?: () => Promise<{ default: Doc }>,
) {
  const node = nodes[kind];
  dlg ??= build();
  current = kind;
  dispose?.();
  dispose = undefined;
  title.textContent = node.name;
  host.textContent = "Loading…";
  host.scrollTop = 0;
  if (!dlg.open) dlg.showModal();

  const Doc = load && (await load().catch(() => undefined))?.default;
  if (current !== kind) return; // closed or switched while loading
  host.textContent = "";
  dispose = render(
    () => (
      <Show
        when={Doc}
        fallback={
          <>
            <p class={css.empty}>
              No written guide for this node yet. Here is what it takes and
              gives:
            </p>
            <Params node={node} />
          </>
        }
      >
        <Dynamic
          component={Doc}
          components={{ Params: () => <Params node={node} />, Tip, Demo }}
        />
      </Show>
    ),
    host,
  );
}
