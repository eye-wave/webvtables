import { createMenuItem, showAt } from "./menu-utils";
import {
  makeStrReader,
  unpackFloats,
  type RawStr,
  type WasmExports,
} from "./wasm";

declare const search_menu: HTMLDivElement;

export function registerNodePicker(
  exports: WasmExports,
  nodeNames: Record<string, RawStr[]>,
) {
  const readStr = makeStrReader(exports);
  const flattened = Object.entries(nodeNames).flatMap(([category, list]) =>
    list.map((raw) => ({ raw, category })),
  );
  const groupedMap = flattened.reduce((acc, { raw, category }) => {
    const key = raw.ptr;

    if (!acc.has(key)) {
      acc.set(key, {
        raw,
        label: readStr(raw.ptr, raw.len),
        categories: [category],
      });
    } else {
      acc.get(key).categories.push(category);
    }

    return acc;
  }, new Map());
  const entries: { raw: RawStr; label: string; categories: string[] }[] =
    Array.from(groupedMap.values());

  const input = document.createElement("input");
  input.placeholder = "Search nodes...";
  search_menu.append(input);

  const results = document.createElement("div");
  results.className = "results";
  search_menu.append(results);

  let filtered: typeof entries = [];
  let selected = 0;
  let pos = [0, 0] as [f32, f32];

  function render(filter: string) {
    filtered = entries.filter((e) =>
      e.label.toLowerCase().includes(filter.toLowerCase()),
    );
    results.replaceChildren();
    filtered.forEach((e) => {
      const el = createMenuItem(e.label, e.categories.join(", "));
      el.onclick = () => confirm(e.raw);
      results.append(el);
    });
    selected = 0;
    highlight();
  }

  function highlight() {
    [...results.children].forEach((el, i) =>
      el.classList.toggle("active", i === selected),
    );
    results.children[selected]?.scrollIntoView({ block: "nearest" });
  }

  function confirm(raw: RawStr) {
    const packed = exports.get_world_pos(...pos);
    const worldPos = unpackFloats(packed);

    exports.add_node(...worldPos, raw.ptr, raw.len);
    close();
  }

  function close() {
    search_menu.style.display = "none";
  }

  document.addEventListener("click", (e) => {
    if (!search_menu.contains(e.target as Node)) close();
  });

  input.oninput = () => render(input.value);
  input.onkeydown = (e) => {
    if (e.key === "ArrowDown")
      ((selected = Math.min(selected + 1, filtered.length - 1)),
        highlight(),
        e.preventDefault());
    else if (e.key === "ArrowUp")
      ((selected = Math.max(selected - 1, 0)), highlight(), e.preventDefault());
    else if (e.key === "Enter")
      filtered[selected] && confirm(filtered[selected].raw);
    else if (e.key === "Escape") close();
  };

  return (x: f32, y: f32) => {
    pos = [x, y];
    input.value = "";
    render("");
    showAt(search_menu, x, y);
    input.focus();
  };
}
