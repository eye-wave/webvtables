export function createMenuItem(
  text: string,
  shortcut = "",
  extraClass = "",
): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.className = "item";
  el.tabIndex = 0;

  if (extraClass) el.classList.add(extraClass);
  if (shortcut) {
    const badge = document.createElement("span");
    badge.className = "shortcut";
    badge.textContent = shortcut;
    el.append(badge);
  }

  return el;
}

export function showAt(el: HTMLElement, x: f32, y: f32) {
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.display = "flex";
}
