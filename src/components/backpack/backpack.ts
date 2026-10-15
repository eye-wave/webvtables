// Node backpack: a box left of the grid, listing every node by category.
// Drag an item onto the grid to add it there. Loaded on first open (see main.ts).
import { categories, nodes } from "../../generated/nodes";
import type { Scene } from "../../editor/scene";
import type { ViewCtl } from "../../gfx/view";
import css from "./backpack.module.css";

// lucide "info"
const INFO =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';

// Guides are markdown files named after the node id, compiled to .html; only their URLs are bundled (eager: no
// chunk per guide), the html is fetched when one opens.
const docs = import.meta.glob<string>("../../info/*.md", {
  query: "?url",
  import: "default",
  eager: true,
});
const guide = (id: string) => docs[`../../info/${id}.md`];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") =>
  Object.assign(document.createElement(tag), {
    className: cls,
    textContent: text,
  });

export function createBackpack(
  grid: HTMLElement,
  view: ViewCtl,
  scene: Scene,
  schedule: () => void,
) {
  const root = el("aside", `box ${css.pack}`);
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
        const info = el("button", guide(n.id) ? `${css.info} ${css.guided}` : css.info);
        info.type = "button";
        info.title = guide(n.id) ? `Guide: ${n.name}` : `${n.name}: no guide yet, shows a summary`;
        info.setAttribute("aria-label", info.title);
        info.dataset.info = "";
        info.innerHTML = INFO;
        it.append(el("span", "", n.name), el("small", "", `${n.inputs} → ${n.outputs}`), info);
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
    return !!t && grid.contains(t);
  };

  // the guide (and its html) loads on first use
  body.onclick = (e) => {
    const b = (e.target as Element).closest("[data-info]");
    if (!b) return;
    const kind = +b.parentElement!.dataset.kind!;
    void import("./guide").then((m) => m.openGuide(kind, guide(nodes[kind].id)));
  };

  body.onpointerdown = (e) => {
    const it = (e.target as Element).closest<HTMLElement>("[data-kind]");
    if (!it || e.button || (e.target as Element).closest("[data-info]")) return;
    const [x0, y0] = [e.clientX, e.clientY];
    let ghost: HTMLElement | undefined;
    it.setPointerCapture(e.pointerId);
    it.onpointermove = (m) => {
      if (!ghost && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
      ghost ??= document.body.appendChild(
        Object.assign(it.cloneNode(true) as HTMLElement, {
          className: `${css.item} ${css.ghost}`,
        }),
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

  grid.before(root);
  return { show: (on: boolean) => (root.hidden = !on) };
}
