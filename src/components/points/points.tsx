import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { fineScale } from "../../editor/fine";
import ctxCss from "../ctx/ctx.module.css";
import { editParam, type ParamEdit } from "../param_edit/param_edit";

// The hand editing of a list of points, shared by the keyframe lanes and the waveshaper curve:
// double-click adds, dragging moves (Shift/Alt for fine), ctrl+click types a value, Delete/Backspace
// or the context menu removes. The handlers are native (`on:`) so they also work inside node views
// (see node.tsx). Where the points live, how they are drawn and what a move means is up to the editor.

/** A point is addressed as [curve, index]; an editor with a single curve uses 0 for the curve. */
export type PointId = readonly [curve: number, point: number];

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Pointer capture drag: `move` runs on press and on every move while held. */
export const drag = (e: PointerEvent, move: (e: PointerEvent) => void) => {
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  el.onpointermove = move;
  el.onpointerup = () => (el.onpointermove = el.onpointerup = null);
  move(e);
};

/** Where a pointer is on a plot: x and y as 0..1 fractions (y up). `pad` is the inset of the plot inside `el`, `size` its extent in px. */
export const plotAt = (
  e: MouseEvent,
  el: Element,
  [padX, padY]: readonly number[],
  [w, h]: readonly number[],
) => {
  const r = el.getBoundingClientRect();
  return [
    clamp((e.clientX - r.left - padX) / w, 0, 1),
    clamp(1 - (e.clientY - r.top - padY) / h, 0, 1),
  ] as const;
};

/** Puts the tooltip (the point's first child) above the point, or below when that leaves `box` [left, top, right, bottom] in screen px. */
export function placeTip(
  chip: HTMLElement,
  [l, t, r, b]: readonly [number, number, number, number],
) {
  const tip = chip.firstElementChild as HTMLElement;
  const c = chip.getBoundingClientRect();
  const [w, h, gap] = [tip.offsetWidth, tip.offsetHeight, 6];
  const cx = c.left + c.width / 2;
  const above = c.top - gap - h >= t || c.bottom + gap + h > b;
  tip.style.top = `${above ? -h - gap : c.height + gap}px`;
  tip.style.left = `${cx - w / 2 < l ? 0 : cx + w / 2 > r ? c.width - w : (c.width - w) / 2}px`;
}

/** How a point is dragged. */
export type Grab = {
  at: readonly [x: number, y: number];
  /** Change per px of pointer travel; negative where the axis points up the screen. */
  per: readonly [x: number, y: number];
  min: readonly [x: number, y: number];
  max: readonly [x: number, y: number];
  /** Gets every new position, not rounded: the drag keeps its own precise one. */
  move(x: number, y: number): void;
  /** Ctrl+click opens this value editor. */
  edit?(): ParamEdit;
};

export function createPoints(o: {
  /** Removes a point. */
  del(id: PointId): void;
  /** Pressing outside this (and the menu) deselects. */
  inside(t: Node): boolean;
  label?: string;
}) {
  const [sel, setSel] = createSignal<PointId>();
  const [menu, setMenu] = createSignal<{ x: number; y: number }>();
  let pop: HTMLDivElement | undefined;

  const remove = (id: PointId) => {
    o.del(id);
    setSel();
    setMenu();
  };

  createEffect(() => {
    const k = sel();
    if (!k) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (
        (e.target as Element).closest("input,textarea,select,[contenteditable]")
      )
        return;
      e.preventDefault();
      remove(k);
    };
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!o.inside(t) && !pop?.contains(t)) setSel();
    };
    addEventListener("keydown", key);
    addEventListener("pointerdown", away, true);
    onCleanup(() => {
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", away, true);
    });
  });

  createEffect(() => {
    if (!menu()) return;
    const away = (e: Event) => pop?.contains(e.target as Node) || setMenu();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu();
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    onCleanup(() => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("keydown", esc, true);
    });
  });

  return {
    isSel: (curve: number, point: number) =>
      sel()?.[0] === curve && sel()?.[1] === point,
    clear: () => setSel(),

    /** Spread on a point's element; `id` and `g` are read when the pointer goes down. */
    point: (id: () => PointId, g: () => Grab) => ({
      "data-pt": "",
      "on:pointerdown": (e: PointerEvent) => {
        e.stopPropagation();
        if (e.button) return;
        setSel(id());
        const a = g();
        if (e.ctrlKey)
          return a.edit && editParam(e.currentTarget as Element, a.edit());
        let [x, y] = a.at;
        let [cx, cy] = [e.clientX, e.clientY];
        drag(e, (m) => {
          const f = fineScale(m);
          x = clamp(x + (m.clientX - cx) * a.per[0] * f, a.min[0], a.max[0]);
          y = clamp(y + (m.clientY - cy) * a.per[1] * f, a.min[1], a.max[1]);
          [cx, cy] = [m.clientX, m.clientY];
          a.move(x, y);
        });
      },
      "on:contextmenu": (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSel(id());
        setMenu({ x: e.clientX, y: e.clientY });
      },
    }),

    /** Double-click on the plot: `put` makes the point (returning its id, or nothing if it could not) unless the click was on a point. */
    add(e: MouseEvent, put: () => PointId | undefined) {
      if ((e.target as Element).closest("[data-pt]")) return;
      const id = put();
      if (id) setSel(id);
    },

    Menu: () => (
      <Show when={menu()}>
        {(m) => (
          <Portal ref={(el) => (el.style.display = "contents")}>
            <div
              class={`${ctxCss.ctx} ${ctxCss.open}`}
              ref={pop}
              style={{
                left: `${Math.min(m().x, innerWidth - 180)}px`,
                top: `${Math.min(m().y, innerHeight - 48)}px`,
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div
                class={`${ctxCss.item} ${ctxCss.danger}`}
                style={{ "--i": 0 }}
                onClick={() => sel() && remove(sel()!)}
              >
                {o.label ?? "Delete point"}
              </div>
            </div>
          </Portal>
        )}
      </Show>
    ),
  };
}
