import { loadFile, saveFile } from "./file-io";
import {
  HitType,
  makeBufReader,
  makeStrReader,
  unpackBuffer,
  unpackFloats,
  type RawStr,
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
        const packed = exports.get_world_pos(x, y);
        const [wx, wy] = unpackFloats(packed);

        item.onclick = () => exports.add_node(wx, wy, name.ptr, name.len);
      });
    } else {
      Object.entries(items).forEach(([group, names]) =>
        addSubmenu(group, names, "", sub, x, y),
      );
    }

    el.append(sub);
  }

  return (x: f32, y: f32, hit: HitType) => {
    while (menu.firstChild) {
      menu.firstChild.remove();
    }

    if (hit.kind === 0) {
      addSubmenu("New node", nodeNames, "highlight", menu, x, y);
      addItem("Auto arrange", "_+_");
      addItem("Zoom to content", "_+_").onclick = () => {
        const packed = exports.node_average_pos();
        const [x, y] = unpackFloats(packed);

        exports.set_camera(x, y, 1);
        exports.render();
      };

      addDivider();
      addItem("Save project", "Ctrl+S").onclick = () => {
        const packed = exports.serialize_graph();
        const addr = unpackBuffer(packed);

        const view = readBuf(addr.ptr, addr.len);
        const buf = new Uint8Array(view).slice();

        saveFile("project.wbt", buf);

        exports.free_buffer(addr.ptr, addr.len);
      };

      addItem("Import project", "Ctrl+O").onclick = () =>
        loadFile("*.wbt")
          .then((bytes) => {
            const len = bytes.byteLength as usize;
            const addr = exports.allocate_patch_buffer(len);

            const bufSpace = new Uint8Array(exports.memory.buffer, addr, len);
            bufSpace.set(bytes);
            exports.patch_graph(addr, len);
          })
          .catch();

      addDivider();
      addItem("Delete all", "⌫", "danger").onclick = () =>
        exports.remove_all_nodes();
    } else if (hit.kind === 1) {
      addItem("Duplicate");
      addDivider();

      addItem("Remove", "⌫", "danger").onclick = () => {
        if (hit.id < 0) return;
        exports.remove_node(hit.id as number as usize);
      };
    }

    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.style.display = "flex";
  };
}
