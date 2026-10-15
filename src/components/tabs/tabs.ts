import { nodes } from "../../generated/nodes";
import type { Scene } from "../../editor/scene";
import type { ViewCtl } from "../../gfx/view";
import css from "./tabs.module.css";

const el = <T extends HTMLElement = HTMLElement>(tag: string, cls = "", text = "") =>
  Object.assign(document.createElement(tag), { className: cls, textContent: text }) as T;

// The tab bar (main + one tab per custom node) and, in a definition, the sidebar to add its
// Input/Output nodes (the sockets of its instances) and name its params.
export function createTabs(host: HTMLElement, view: ViewCtl, scene: Scene, schedule: () => void) {
  const bar = el("div", css.bar);
  const side = el("div", css.side);
  host.append(bar, side);
  // the grid underneath pans, zooms, selects and opens its add menu on these
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel"])
    for (const x of [bar, side]) x.addEventListener(ev, (e) => e.stopPropagation());

  const go = (id: string) => () => (scene.open(id), schedule());
  const btn = (text: string, onclick: () => void, cls = "") =>
    Object.assign(el("button", `${css.btn} ${cls}`, text), { type: "button", onclick });
  const tab = (text: string, id: string) =>
    Object.assign(el("button", `${css.tab} ${scene.tab() === id ? css.on : ""}`, text), {
      type: "button",
      onclick: go(id),
    });

  const addPort = (id: string) => {
    const kind = nodes.findIndex((n) => n.id === id);
    const [vx, vy, k] = view.v;
    scene.add(
      kind,
      (host.clientWidth / 2 - vx) / k - 90 + Math.random() * 40,
      (host.clientHeight / 2 - vy) / k - 40 + Math.random() * 40,
    );
    schedule();
  };

  const render = () => {
    const open = scene.tab();
    const d = scene.defs().find((d) => d.id === open);
    bar.replaceChildren(
      tab("Main", ""),
      ...scene.defs().map((d) => tab(d.name, d.id)),
      Object.assign(el("button", `${css.tab} ${css.add}`, "+"), {
        type: "button",
        title: "New custom node",
        onclick: () => (scene.open(scene.newDef().id), schedule()),
      }),
    );
    side.hidden = !d;
    if (!d) return;

    const field = (value: string, title = "") =>
      Object.assign(el<HTMLInputElement>("input"), {
        value,
        title,
        maxLength: 22,
        spellcheck: false,
      });
    const name = field(d.name);
    name.onchange = () => (scene.renameDef(d, name.value), schedule());
    const params = d.params.map((q) => {
      const input = field(q.name, `${q.targets.length} linked`);
      input.onchange = () => scene.renameParam(q, input.value);
      const row = el("div", css.row);
      row.append(
        input,
        btn("✕", () => scene.removeParam(d, q), css.x),
      );
      return row;
    });
    const ports = el("div", css.row);
    ports.append(
      btn("+ Input", () => addPort("grpin")),
      btn("+ Output", () => addPort("grpout")),
    );
    const rename = el("div", css.row);
    rename.append(name);
    side.replaceChildren(
      el("h4", "", "Custom node"),
      rename,
      el("h4", "", "Sockets"),
      ports,
      el("h4", "", "Params"),
      ...params,
      btn("+ Param", () => scene.addParam(d, `Param ${d.params.length + 1}`)),
      el("p", css.hint, "Right-click a knob → Node param to link it."),
      btn(
        "Delete node",
        () => {
          if (confirm(`Delete “${d.name}” and all its copies?`)) (scene.removeDef(d), schedule());
        },
        css.danger,
      ),
    );
  };

  scene.onChange(render);
  render();
}
