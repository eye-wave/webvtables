import { loadFile, saveFile } from "./file-io";
import {
  makeBufReader,
  makeStrReader,
  unpackBuffer,
  type f32,
  type i32,
  type RawStr,
  type usize,
  type WasmExports,
} from "./wasm";

declare const menu: HTMLDivElement;

export function registerContextMenu(
  exports: WasmExports,
  nodeNames: Record<string, RawStr[]>,
) {
  const readStr = makeStrReader(exports);
  const readBuf = makeBufReader(exports);

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
    x: f32,
    y: f32,
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

  return (x: f32, y: f32, id: i32) => {
    while (menu.firstChild) {
      menu.firstChild.remove();
    }

    if (id === -1) {
      addSubmenu("New node", nodeNames, "highlight", menu, x, y);
      addItem("Auto arrange", "Shift+I");

      addItem("Delete all", "⌫", "danger").onclick = () =>
        exports.remove_all_nodes();

      addItem("Export", "Ctrl+S").onclick = () => {
        const packed = exports.serialize_graph();
        const addr = unpackBuffer(packed);

        const view = readBuf(addr.ptr, addr.len);
        const buf = new Uint8Array(view).slice();

        saveFile("project.wbt", buf);

        exports.free_buffer(addr.ptr, addr.len);
      };

      addItem("Import", "Ctrl+O").onclick = () =>
        loadFile("*.wbt")
          .then((bytes) => {
            const len = bytes.byteLength as usize;
            const addr = exports.allocate_patch_buffer(len);

            const bufSpace = new Uint8Array(exports.memory.buffer, addr, len);
            bufSpace.set(bytes);
            exports.patch_graph(addr, len);
          })
          .catch();
    } else {
      addItem("Duplicate");
      addDivider();

      const rem = addItem("Remove", "⌫", "danger");

      rem.onclick = () => {
        if (id < 0) return;
        exports.remove_node(id as number as usize);
      };
    }

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "flex";
  };
}
