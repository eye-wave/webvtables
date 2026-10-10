// Node backpack: a panel over the left of the grid, listing every node by category.
// Drag an item onto the grid to add it there. Loaded on first open (see main.ts).
import { categories, nodes } from "../../generated/nodes";
import type { Scene } from "../../editor/scene";
import type { ViewCtl } from "../../gfx/view";
import css from "./backpack.module.css";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") =>
  Object.assign(document.createElement(tag), { className: cls, textContent: text });

export function createBackpack(
  grid: HTMLElement,
  view: ViewCtl,
  scene: Scene,
  schedule: () => void,
) {
  const root = el("aside", css.pack);
  const search = Object.assign(el("input"), {
    placeholder: "Search nodes…",
    spellcheck: false,
    autocomplete: "off",
  });
  const body = el("div", css.body);
  root.append(el("header", css.head, "Backpack"), search, body);

  // A node with several categories is listed under each.
  const groups = categories.map((c, ci) => {
    const d = el("details", css.cat);
    d.open = true;
    const list = el("div", css.list);
    const items = nodes
      .map((n, kind) => [n, kind] as const)
      .filter(([n]) => (n.category as readonly number[]).includes(ci))
      .sort((a, b) => a[0].name.localeCompare(b[0].name))
      .map(([n, kind]) => {
        const it = el("div", css.item);
        it.dataset.kind = `${kind}`;
        it.dataset.name = n.name.toLowerCase();
        it.append(el("span", "", n.name), el("small", "", `${n.inputs} → ${n.outputs}`));
        list.append(it);
        return it;
      });
    d.append(el("summary", "", c), list);
    body.append(d);
    return { d, items };
  });

  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    for (const g of groups) {
      let n = 0;
      for (const it of g.items) n += +!(it.hidden = !it.dataset.name!.includes(q));
      g.d.hidden = !n;
      if (q) g.d.open = true;
    }
  };

  const over = (e: PointerEvent) => {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    return !!t && grid.contains(t) && !root.contains(t);
  };

  body.onpointerdown = (e) => {
    const it = (e.target as Element).closest<HTMLElement>("[data-kind]");
    if (!it || e.button) return;
    const [x0, y0] = [e.clientX, e.clientY];
    let ghost: HTMLElement | undefined;
    it.setPointerCapture(e.pointerId);
    it.onpointermove = (m) => {
      if (!ghost && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      ghost ??= document.body.appendChild(
        Object.assign(it.cloneNode(true) as HTMLElement, { className: `${css.item} ${css.ghost}` }),
      );
      ghost.style.transform = `translate(${m.clientX + 10}px, ${m.clientY + 10}px)`;
    };
    it.onpointerup = it.onpointercancel = (u) => {
      it.onpointermove = it.onpointerup = it.onpointercancel = null;
      ghost?.remove();
      if (ghost && u.type === "pointerup" && over(u)) {
        scene.add(+it.dataset.kind!, ...view.world(u));
        schedule();
      }
    };
  };

  // keep the grid underneath from panning, zooming or opening its menus through the panel
  for (const ev of ["pointerdown", "dblclick", "contextmenu", "wheel"])
    root.addEventListener(ev, (e) => e.stopPropagation());

  grid.append(root);
  return { show: (on: boolean) => (root.hidden = !on) };
}
