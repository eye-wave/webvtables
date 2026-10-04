// Modifiers tracked from key events too: pointer events can drop them while the pointer is locked.
let held = false;
const track = (e: KeyboardEvent) => (held = e.altKey || e.shiftKey);
addEventListener("keydown", track, true);
addEventListener("keyup", track, true);
addEventListener("blur", () => (held = false));

export const fineScale = (e: { altKey: boolean; shiftKey: boolean }) =>
  held || e.altKey || e.shiftKey ? 0.05 : 1;

// Shared knob drag: right/up raise, left/down lower; pointer is locked while dragging.
export const knobDelta = (e: PointerEvent) =>
  ((e.movementX - e.movementY) / 150) * fineScale(e);

// Per-drag delta fn; locks the pointer only after ~4px of travel so double-click still works.
// Chrome fires a bogus big movement when the lock engages, so drop the first locked move and any spike.
export const knobDrag = (e: Event) => {
  const el = e.target as Element;
  let dist = 0,
    asked = false,
    settled = false;
  return (m: PointerEvent) => {
    const spike = Math.abs(m.movementX) + Math.abs(m.movementY);
    dist += spike;
    if (dist > 4 && !asked) {
      asked = true;
      try {
        el.requestPointerLock?.()?.catch?.(() => {});
      } catch {}
    }
    if (document.pointerLockElement && (!settled || spike > 150))
      return ((settled = true), 0);
    return knobDelta(m);
  };
};
export const unlock = () => document.pointerLockElement && document.exitPointerLock();
