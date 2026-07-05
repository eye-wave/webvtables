import { makeStrReader, type RawStr, type WasmExports } from "./wasm";

declare const menu: HTMLDivElement;

export function registerContextMenu(
  exports: WasmExports,
  nodeNames: Record<string, RawStr[]>,
) {
  const readStr = makeStrReader(exports);

  document.addEventListener("click", () => (menu.style.display = "none"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu.style.display = "none";
  });

  function addItem(
    text: string,
    icon: string = "",
    style = "",
    parent: HTMLElement = menu,
  ) {
    const el = document.createElement("div");
    el.textContent = text;
    el.className = "item";
    el.tabIndex = 0;

    if (style) el.classList.add(style);
    if (icon) {
      const ico = document.createElement("span");
      ico.className = "shortcut";
      ico.textContent = icon;

      el.append(ico);
    }

    parent.append(el);
    return el;
  }

  function addDivider(parent: HTMLElement = menu) {
    const el = document.createElement("div");
    el.className = "divider";
    parent.append(el);
  }

  function addSubmenu(
    text: string,
    items: RawStr[] | Record<string, RawStr[]>,
    style = "",
    parent: HTMLElement,
    x: number,
    y: number,
  ) {
    const el = addItem(text, ">", style, parent);
    const sub = document.createElement("div");
    sub.className = "menu submenu";

    if (Array.isArray(items)) {
      items.forEach((name) => {
        const item = addItem(readStr(name.ptr, name.len), "", "", sub);
        item.onclick = () => exports.add_node(x, y, name.ptr, name.len);
      });
    } else {
      Object.entries(items).forEach(([group, names]) =>
        addSubmenu(group, names, "", sub, x, y),
      );
    }

    el.append(sub);
  }

  return (x: number, y: number, id: number) => {
    while (menu.firstChild) {
      menu.firstChild.remove();
    }

    if (id === -1) {
      addSubmenu("New node", nodeNames, "highlight", menu, x, y);
      addItem("Auto arrange", "Shift+I");
    } else {
      addItem("Duplicate");
      addDivider();

      const rem = addItem("Remove", "⌫", "danger");

      rem.onclick = () => exports.remove_node(id);
    }

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "flex";
  };
}
