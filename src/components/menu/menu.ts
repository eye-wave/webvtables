import { nodes } from "../../generated/nodes";
import type { Pt } from "../../gfx/ropes";
import type { Scene } from "../../editor/scene";
import type { ViewCtl } from "../../gfx/view";
import nodeCss from "../node/node.module.css";
import menuCss from "./menu.module.css";

export function createMenu(
  grid: HTMLElement,
  view: ViewCtl,
  scene: Scene,
  schedule: () => void,
) {
  const root = document.createElement("div");
  root.className = menuCss.menu;
  root.hidden = true;
  const input = document.createElement("input");
  input.placeholder = "Add node…";
  input.spellcheck = false;
  input.autocomplete = "off";
  const list = document.createElement("ul");

  const items = nodes.map((n, kind) => {
    const el = document.createElement("li");
    el.dataset.kind = `${kind}`;
    el.textContent = n.name;
    el.append(
      Object.assign(document.createElement("span"), {
        textContent: n.category.join(" · "),
      }),
    );
    list.append(el);
    return { el, text: `${n.name} ${n.category.join(" ")}`.toLowerCase() };
  });
  root.append(input, list);
  document.body.append(root);

  let at: Pt = [0, 0];
  let shown: HTMLElement[] = [];
  let sel = 0;

  const mark = (i: number) => {
    list.querySelector(`.${menuCss.sel}`)?.classList.remove(menuCss.sel);
    sel = (i + shown.length) % (shown.length || 1);
    shown[sel]?.classList.add(menuCss.sel);
    shown[sel]?.scrollIntoView({ block: "nearest" });
  };

  const filter = () => {
    const q = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = [];
    for (const { el, text } of items) {
      el.hidden = !q.every((t) => text.includes(t));
      if (!el.hidden) shown.push(el);
    }
    mark(0);
  };

  const away = (e: Event) => {
    if (!root.contains(e.target as Node)) close();
  };
  const close = () => {
    root.hidden = true;
    removeEventListener("pointerdown", away, true);
  };
  const pick = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    scene.add(+el.dataset.kind!, at[0], at[1]);
    close();
    schedule();
  };

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") pick(shown[sel]);
    else if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") mark(sel + 1);
    else if (e.key === "ArrowUp") mark(sel - 1);
    else return;
    e.preventDefault();
  });
  list.addEventListener("click", (e) =>
    pick((e.target as HTMLElement).closest("li")),
  );

  const open = (e: MouseEvent) => {
    e.preventDefault();
    at = view.world(e);
    input.value = "";
    root.hidden = false;
    filter();
    root.style.left = `${Math.max(0, Math.min(e.clientX, innerWidth - root.offsetWidth - 8))}px`;
    root.style.top = `${Math.max(0, Math.min(e.clientY, innerHeight - root.offsetHeight - 8))}px`;
    addEventListener("pointerdown", away, true);
    input.focus();
  };

  grid.addEventListener("dblclick", (e) => {
    if (!(e.target as HTMLElement).closest(`.${nodeCss.node}`)) open(e);
  });

  return { open };
}
