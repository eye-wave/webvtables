// Node guide dialog. The backpack hands over the URL of the node's guide (src/info/<id>.md, compiled
// to .html and fetched here); nodes without one get an auto-generated summary. Solid mounts into the guide's
// <md-params> and <md-demo nodes='json' links='json'>; <md-tip> and <md-warning> are plain CSS.
import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { nodes } from "../../generated/nodes";
import css from "./guide.module.css";

type Node = (typeof nodes)[number];
type Param = { n: string; o?: readonly string[]; u?: string };

// Mounted into every <md-params>, built from the node's own metadata so it can't go stale.
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

let dlg: HTMLDialogElement | undefined;
let title: HTMLElement, host: HTMLElement;
let ds: (() => void)[] = [];
const stop = () => (ds.forEach((d) => d()), (ds = []));
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
  d.onclose = () => (stop(), (current = -1), host.replaceChildren());
  document.body.append(d);
  return d;
}

export async function openGuide(kind: number, url?: string) {
  const node = nodes[kind];
  dlg ??= build();
  current = kind;
  stop();
  title.textContent = node.name;
  host.textContent = "Loading…";
  host.scrollTop = 0;
  if (!dlg.open) dlg.showModal();

  const html =
    url &&
    (await fetch(url)
      .then((r) => (r.ok ? r.text() : undefined))
      .catch(() => undefined));
  if (current !== kind) return; // closed or switched while loading
  if (!html) {
    host.textContent = "";
    return void ds.push(
      render(
        () => (
          <>
            <p class={css.empty}>
              No written guide for this node yet. Here is what it takes and
              gives:
            </p>
            <Params node={node} />
          </>
        ),
        host,
      ),
    );
  }
  host.innerHTML = html;
  for (const el of host.querySelectorAll<HTMLElement>("md-params"))
    ds.push(render(() => <Params node={node} />, el));
  for (const el of host.querySelectorAll<HTMLElement>("md-demo"))
    void import("./demo").then(({ default: Demo }) => {
      if (el.isConnected)
        ds.push(
          render(
            () => (
              <Demo
                nodes={JSON.parse(el.getAttribute("nodes")!)}
                links={JSON.parse(el.getAttribute("links") ?? "null")}
              />
            ),
            el,
          ),
        );
    });
}
